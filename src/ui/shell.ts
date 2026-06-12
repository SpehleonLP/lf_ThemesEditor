// src/ui/shell.ts
import type { PackageDoc, FileKey } from '../package/model';
import { anyDirty, serializeFile } from '../package/model';
import type { RefIndex } from '../package/refIndex';
import type { AssetList } from '../package/assets';
import type { Issue, NavTarget } from '../package/validate';
import { worstSeverity, groupBySeverity, countsByFile } from '../package/navTarget';
import type { Surface, SurfaceKey, SurfaceContext } from './surfaces/registry';

export interface ShellDeps {
  pkg: PackageDoc;
  surfaces: Surface[];          // in nav order; 'assets' last
  getContext: () => SurfaceContext;
  onValidate: () => void;       // force immediate revalidate + asset refresh
  writeFile: (path: string, data: string) => Promise<void>;
}

export interface Shell {
  root: HTMLElement;
  setActive(key: SurfaceKey): void;
  setIssues(issues: Issue[]): void;
  refreshSurfaces(): void;      // index/assets changed → tell visible + cached surfaces
  navigate(target: NavTarget): void;
}

export function createShell(deps: ShellDeps): Shell {
  const root = document.createElement('div');
  root.className = 'shell';

  let active: SurfaceKey = 'borders';
  let issues: Issue[] = [];
  let drawerOpen = false;

  // Toolbar
  const toolbar = document.createElement('header'); toolbar.className = 'tb';
  const pkgName = document.createElement('span'); pkgName.className = 'tb-name';
  const dirtyDot = document.createElement('span'); dirtyDot.className = 'tb-dirty';
  const spacer = document.createElement('span'); spacer.className = 'tb-spacer';
  const statusBtn = document.createElement('button'); statusBtn.className = 'tb-status';
  const validateBtn = document.createElement('button'); validateBtn.className = 'tb-btn'; validateBtn.textContent = 'Validate';
  const saveBtn = document.createElement('button'); saveBtn.className = 'tb-btn'; saveBtn.textContent = 'Save';
  toolbar.append(pkgName, dirtyDot, spacer, statusBtn, validateBtn, saveBtn);

  // Body: nav + host stack + drawer
  const body = document.createElement('div'); body.className = 'shell-body';
  const nav = document.createElement('nav'); nav.className = 'nav';
  const hostStack = document.createElement('div'); hostStack.className = 'host-stack';
  const drawer = document.createElement('aside'); drawer.className = 'drawer';
  body.append(nav, hostStack, drawer);
  root.append(toolbar, body);

  // One persistent host per surface (mounted lazily, toggled by display).
  const hosts = new Map<SurfaceKey, HTMLElement>();
  const mounted = new Set<SurfaceKey>();
  const surfaceByKey = new Map<SurfaceKey, Surface>(deps.surfaces.map((s) => [s.key, s]));
  for (const s of deps.surfaces) {
    const h = document.createElement('div'); h.className = 'surface-host'; h.style.display = 'none';
    hosts.set(s.key, h); hostStack.appendChild(h);
  }

  function ensureMounted(key: SurfaceKey): void {
    if (mounted.has(key)) return;
    surfaceByKey.get(key)!.mount(hosts.get(key)!, deps.getContext());
    mounted.add(key);
  }

  function renderNav(): void {
    nav.replaceChildren();
    const counts = countsByFile(issues);
    for (const s of deps.surfaces) {
      const row = document.createElement('button');
      row.className = 'nav-row' + (s.key === active ? ' nav-active' : '');
      row.dataset.surface = s.key;
      const icon = document.createElement('span'); icon.className = 'nav-icon'; icon.textContent = s.icon;
      const label = document.createElement('span'); label.className = 'nav-label'; label.textContent = s.label;
      row.append(icon, label);
      const sev = worstSeverity(issues, s.key === 'assets' ? 'assets' : (s.key as FileKey));
      if (sev) { const dot = document.createElement('span'); dot.className = `nav-dot nav-${sev}`; row.appendChild(dot); }
      const c = counts[s.key];
      if (c) { const badge = document.createElement('span'); badge.className = 'nav-badge'; badge.textContent = String(c.error + c.warning + c.notice); row.appendChild(badge); }
      row.addEventListener('click', () => setActive(s.key));
      nav.appendChild(row);
    }
  }

  function renderToolbar(): void {
    pkgName.textContent = 'theme package';
    dirtyDot.style.display = anyDirty(deps.pkg) ? '' : 'none';
    const g = groupBySeverity(issues);
    statusBtn.textContent = `${g.error.length} errors · ${g.warning.length} warnings`;
    statusBtn.classList.toggle('tb-status-err', g.error.length > 0);
    saveBtn.disabled = !anyDirty(deps.pkg);
  }

  function renderDrawer(): void {
    drawer.style.display = drawerOpen ? '' : 'none';
    if (!drawerOpen) return;
    drawer.replaceChildren();
    const head = document.createElement('div'); head.className = 'drawer-head';
    const g = groupBySeverity(issues);
    head.textContent = `Validation · ${g.error.length} errors · ${g.warning.length} warnings`;
    const close = document.createElement('button'); close.textContent = '✕';
    close.addEventListener('click', () => { drawerOpen = false; renderDrawer(); });
    head.appendChild(close);
    drawer.appendChild(head);
    for (const sev of ['error', 'warning', 'notice'] as const) {
      if (!g[sev].length) continue;
      const grp = document.createElement('div'); grp.className = `drawer-group drawer-${sev}`;
      grp.textContent = `${sev} (${g[sev].length})`;
      drawer.appendChild(grp);
      for (const issue of g[sev]) {
        const card = document.createElement('div'); card.className = 'issue-card';
        const cat = document.createElement('div'); cat.className = 'issue-cat'; cat.textContent = issue.category;
        const msg = document.createElement('div'); msg.className = 'issue-msg'; msg.textContent = issue.message;
        card.append(cat, msg);
        if (issue.nav) {
          const go = document.createElement('button'); go.className = 'issue-go'; go.textContent = 'go ↗';
          go.addEventListener('click', () => navigate(issue.nav!));
          card.appendChild(go);
        }
        drawer.appendChild(card);
      }
    }
  }

  function setActive(key: SurfaceKey): void {
    active = key;
    ensureMounted(key);
    for (const [k, h] of hosts) h.style.display = k === key ? '' : 'none';
    // Re-render the now-visible surface so any work it suspended while hidden
    // (e.g. bg preview's rAF loop) re-arms. Display is toggled first so the
    // host's offsetParent is non-null when refresh runs.
    surfaceByKey.get(key)!.refresh(deps.getContext());
    renderNav();
  }

  function navigate(target: NavTarget): void {
    const key = target.surface as SurfaceKey;
    setActive(key);
    surfaceByKey.get(key)?.reveal(target.entry);
  }

  statusBtn.addEventListener('click', () => { drawerOpen = !drawerOpen; renderDrawer(); });
  validateBtn.addEventListener('click', () => deps.onValidate());
  saveBtn.addEventListener('click', () => void doSave());

  async function doSave(): Promise<void> {
    const results: string[] = [];
    for (const key of Object.keys(deps.pkg.files) as FileKey[]) {
      const f = deps.pkg.files[key];
      if (!f.dirty) continue;
      if (f.loadError) { results.push(`${f.path}: skipped (unreadable)`); continue; }
      try {
        await deps.writeFile(f.path, serializeFile(f));
        f.dirty = false;
        results.push(`${f.path}: saved`);
      } catch (e) {
        results.push(`${f.path}: FAILED ${String(e)}`);
      }
    }
    renderToolbar();
    deps.onValidate(); // re-run after save
    console.info('save:', results.join(' · '));
  }

  return {
    root,
    setActive,
    setIssues(next) { issues = next; renderToolbar(); renderNav(); renderDrawer(); },
    refreshSurfaces() {
      const ctx = deps.getContext();
      for (const key of mounted) surfaceByKey.get(key)!.refresh(ctx);
      renderToolbar();
    },
    navigate,
  };
}
