// src/ui/surfaces/codingThemes.ts
import type { Surface, SurfaceContext } from './registry';
import type { NavTarget } from '../../package/validate';
import type { FileDoc } from '../../package/model';
import {
  THEME_ROLES, THEME_KEYS, type ThemeRole, type ThemeKey, type Rgba,
  rgbaToHex, makeRgba, alphaOn, rgbaToCss, DEFAULT_ROLE_COLOR,
} from '../../package/codingThemes';

// Preview-only fallback palettes for unset roles, so the live sample stays readable.
// These are NEVER written to the file — unset roles run on engine defaults at runtime.
const ENGINE_DEFAULTS: Record<ThemeKey, Partial<Record<ThemeRole, string>>> = {
  Light: {
    Background: '#f6f6f2', Text: '#22232a', Line: 'rgba(140,120,220,.08)',
    LineNumber: '#9a9aa6', SideBar: '#ecece6', ScrollBar: '#c9c9cf',
    ModifiedLines: '#e0a84d', SavedLines: '#5aa15a', Error: '#d04545', Warnings: '#c98a2a',
    Comment: '#8a8a93', Keyword: '#9145c0', Keyword_TypeModifier: '#7a5ad0',
    Builtin_Type: '#2a7ab0', Builtin_Function: '#2a8a8a', Integer: '#b06a2a',
    String: '#5aa15a', Preprocessor: '#a05a8a',
  },
  Dark: {
    Background: '#14141a', Text: '#d6d6de', Line: 'rgba(140,120,220,.14)',
    LineNumber: '#5a5a66', SideBar: '#1a1a22', ScrollBar: '#33333d',
    ModifiedLines: '#e0a84d', SavedLines: '#6ec06e', Error: '#e76461', Warnings: '#e0a84d',
    Comment: '#6a6a73', Keyword: '#c08ce0', Keyword_TypeModifier: '#a78cf0',
    Builtin_Type: '#5ab0e0', Builtin_Function: '#5ad0d0', Integer: '#e0a86a',
    String: '#8ce08c', Preprocessor: '#e08cc0',
  },
};

// Fixed sample program. Each token carries the role its color is drawn from.
interface Tok { t: string; role?: ThemeRole; cls?: 'err' }
const SAMPLE: { mark: 'mod' | 'saved' | null; toks: Tok[] }[] = [
  { mark: 'saved', toks: [{ t: '#include ', role: 'Preprocessor' }, { t: '<gui/border.h>', role: 'String' }] },
  { mark: 'saved', toks: [{ t: '// build the window frame from a sliced sheet', role: 'Comment' }] },
  { mark: null, toks: [{ t: 'constexpr ', role: 'Keyword' }, { t: 'int ', role: 'Builtin_Type' }, { t: 'kPad ', role: 'Text' }, { t: '= ', role: 'Text' }, { t: '25', role: 'Integer' }, { t: ';', role: 'Text' }] },
  { mark: null, toks: [] },
  { mark: 'mod', toks: [{ t: 'auto ', role: 'Keyword' }, { t: 'makeWindow', role: 'Builtin_Function' }, { t: '(', role: 'Text' }, { t: 'const ', role: 'Keyword_TypeModifier' }, { t: 'Image', role: 'Builtin_Type' }, { t: '& sheet) {', role: 'Text' }] },
  { mark: 'mod', toks: [{ t: '  Border', role: 'Builtin_Type' }, { t: ' b ', role: 'Text' }, { t: '= sheet.', role: 'Text' }, { t: 'slice', role: 'Builtin_Function' }, { t: '(', role: 'Text' }, { t: '3', role: 'Integer' }, { t: ');', role: 'Text' }] },
  { mark: null, toks: [{ t: '  if ', role: 'Keyword' }, { t: '(b.', role: 'Text' }, { t: 'emty', cls: 'err', role: 'Builtin_Function' }, { t: '()) ', role: 'Text' }, { t: 'return ', role: 'Keyword' }, { t: '{};', role: 'Text' }] },
  { mark: null, toks: [{ t: '  // TODO: cache shared sheets', role: 'Comment' }] },
  { mark: null, toks: [{ t: '  return ', role: 'Keyword' }, { t: 'b', role: 'Text' }, { t: ';', role: 'Text' }] },
  { mark: null, toks: [{ t: '}', role: 'Text' }] },
];

export function createCodingThemesSurface(file: FileDoc, onDirty: () => void): Surface {
  let built = false;
  let themeKey: ThemeKey = 'Light';
  let paletteHost!: HTMLElement;
  let sampleHost!: HTMLElement;
  let sampleHead!: HTMLElement;

  // The theme object being edited; created lazily so an absent key doesn't clutter the file.
  function theme(): Record<string, unknown> {
    const t = file.root[themeKey];
    return t && typeof t === 'object' && !Array.isArray(t) ? t : {};
  }
  function ensureTheme(): Record<string, unknown> {
    let t = file.root[themeKey];
    if (!t || typeof t !== 'object' || Array.isArray(t)) { t = {}; file.root[themeKey] = t; }
    return t;
  }
  function roleValue(role: ThemeRole): Rgba | null {
    const v = (theme() as any)[role];
    return Array.isArray(v) && v.length === 4 ? (v as Rgba) : null;
  }

  function markDirty(): void {
    if (!file.dirty) file.dirty = true;
    onDirty();
  }

  // Resolve the CSS color for a role: the set value if its alpha bit is on, else the engine default.
  function resolvedCss(role: ThemeRole): string {
    const v = roleValue(role);
    if (v && alphaOn(v[3])) return rgbaToCss(v);
    return ENGINE_DEFAULTS[themeKey][role] ?? (themeKey === 'Dark' ? '#d6d6de' : '#22232a');
  }

  function applyVars(): void {
    for (const role of THEME_ROLES) sampleHost.style.setProperty(`--ct-${role}`, resolvedCss(role));
  }

  function renderPalette(): void {
    paletteHost.replaceChildren();

    const head = document.createElement('div');
    head.className = 'ct-head';
    const title = document.createElement('span'); title.className = 'ct-title'; title.textContent = 'Palette';
    const seg = document.createElement('div'); seg.className = 'ct-seg';
    for (const k of THEME_KEYS) {
      const b = document.createElement('button');
      b.className = 'ct-seg-btn' + (k === themeKey ? ' ct-seg-on' : '');
      b.dataset.theme = k;
      b.textContent = k;
      b.addEventListener('click', () => { themeKey = k; renderPalette(); renderSample(); });
      seg.appendChild(b);
    }
    head.append(title, seg);
    paletteHost.appendChild(head);

    const note = document.createElement('p');
    note.className = 'ct-note';
    note.textContent = '~18 optional roles. Unset roles fall back to engine defaults. Alpha packs to RGB5551 — a single on/off bit, not a ramp.';
    paletteHost.appendChild(note);

    for (const role of THEME_ROLES) {
      const v = roleValue(role);
      const row = document.createElement('div');
      row.className = 'ct-row' + (v ? '' : ' ct-row-unset');
      row.dataset.role = role;

      if (v) {
        const swatch = document.createElement('input');
        swatch.type = 'color'; swatch.className = 'ct-swatch'; swatch.value = rgbaToHex(v);
        swatch.addEventListener('input', () => {
          const t = ensureTheme();
          t[role] = makeRgba(swatch.value, alphaOn((roleValue(role) ?? v)[3]));
          hex.textContent = swatch.value;
          sampleHost.style.setProperty(`--ct-${role}`, resolvedCss(role));
          markDirty();
        });

        const name = document.createElement('span'); name.className = 'ct-name'; name.textContent = role;
        const hex = document.createElement('span'); hex.className = 'ct-hex'; hex.textContent = rgbaToHex(v);

        const aBtn = document.createElement('button');
        const on = alphaOn(v[3]);
        aBtn.className = 'ct-alpha' + (on ? ' ct-alpha-on' : '');
        aBtn.textContent = 'α';
        aBtn.title = on ? 'Alpha on (RGB5551 1-bit) — click to disable' : 'Alpha off — click to enable';
        aBtn.addEventListener('click', () => {
          const cur = roleValue(role) ?? v;
          ensureTheme()[role] = [cur[0], cur[1], cur[2], alphaOn(cur[3]) ? 0 : 1];
          renderPalette(); applyVars(); markDirty();
        });

        const unset = document.createElement('button');
        unset.className = 'ct-unset'; unset.textContent = '✕';
        unset.title = 'Reset to engine default (remove key)';
        unset.addEventListener('click', () => {
          delete ensureTheme()[role];
          renderPalette(); applyVars(); markDirty();
        });

        row.append(swatch, name, hex, aBtn, unset);
      } else {
        const add = document.createElement('button');
        add.className = 'ct-add'; add.textContent = '＋';
        add.title = 'Enable this role';
        add.addEventListener('click', () => {
          ensureTheme()[role] = [...DEFAULT_ROLE_COLOR];
          renderPalette(); applyVars(); markDirty();
        });
        const name = document.createElement('span'); name.className = 'ct-name ct-name-muted'; name.textContent = role;
        const pill = document.createElement('span'); pill.className = 'ct-default'; pill.textContent = 'default';
        row.append(add, name, pill);
      }
      paletteHost.appendChild(row);
    }
  }

  function renderSample(): void {
    sampleHead.textContent = '';
    const kick = document.createElement('span');
    kick.className = 'ct-kick';
    kick.textContent = `LIVE SAMPLE · ${themeKey} · recolors as you edit`;
    const tag = document.createElement('span');
    tag.className = 'ct-tag';
    tag.textContent = `BufferThemes::${themeKey}`;
    sampleHead.append(kick, tag);

    const code = sampleHost.querySelector<HTMLElement>('.ct-code')!;
    code.replaceChildren();
    SAMPLE.forEach((line, i) => {
      const lineEl = document.createElement('div');
      lineEl.className = 'ct-line' + (i === 6 ? ' ct-curline' : ''); // tint the `if` line
      const mark = document.createElement('span');
      mark.className = 'ct-mark';
      if (line.mark) mark.style.background = `var(--ct-${line.mark === 'mod' ? 'ModifiedLines' : 'SavedLines'})`;
      const num = document.createElement('span'); num.className = 'ct-lnum'; num.textContent = String(i + 1);
      const text = document.createElement('span'); text.className = 'ct-text';
      for (const tk of line.toks) {
        const span = document.createElement('span');
        if (tk.cls === 'err') span.className = 'ct-err';
        if (tk.role) span.style.color = `var(--ct-${tk.role})`;
        span.textContent = tk.t;
        text.appendChild(span);
      }
      lineEl.append(mark, num, text);
      code.appendChild(lineEl);
    });
    applyVars();
  }

  function buildOnce(host: HTMLElement): void {
    host.replaceChildren();
    host.className = 'ct-surface';
    paletteHost = document.createElement('aside'); paletteHost.className = 'ct-palette';
    const right = document.createElement('section'); right.className = 'ct-sample';
    sampleHead = document.createElement('div'); sampleHead.className = 'ct-samplehead';
    sampleHost = document.createElement('div'); sampleHost.className = 'ct-pane';
    const code = document.createElement('pre'); code.className = 'ct-code';
    sampleHost.appendChild(code);
    right.append(sampleHead, sampleHost);
    host.append(paletteHost, right);
    renderPalette();
    renderSample();
    built = true;
  }

  return {
    key: 'codingThemes',
    label: 'Coding Themes', icon: '◑',
    mount(host, _ctx: SurfaceContext) { if (!built) buildOnce(host); },
    refresh() { if (built) applyVars(); },
    reveal(entry?: NavTarget['entry']) {
      const n = entry?.name;
      if ((n === 'Light' || n === 'Dark') && n !== themeKey) {
        themeKey = n; if (built) { renderPalette(); renderSample(); }
      }
    },
  };
}
