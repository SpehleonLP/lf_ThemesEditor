// Modal <dialog> with one or more labelled <select>s. Resolves to the chosen values, or null on cancel.
export function pickFrom(title: string, fields: { label: string; options: string[] }[]): Promise<string[] | null> {
  return new Promise((resolve) => {
    const dlg = document.createElement('dialog');
    dlg.className = 'picker-dialog';
    const h = document.createElement('div'); h.className = 'picker-title'; h.textContent = title; dlg.appendChild(h);
    const sels: HTMLSelectElement[] = [];
    for (const f of fields) {
      const row = document.createElement('label'); row.textContent = `${f.label} `;
      const sel = document.createElement('select');
      for (const o of f.options) { const opt = document.createElement('option'); opt.value = o; opt.textContent = o; sel.appendChild(opt); }
      row.appendChild(sel); sels.push(sel); dlg.appendChild(row);
    }
    const bar = document.createElement('div'); bar.className = 'picker-buttons';
    const ok = document.createElement('button'); ok.textContent = 'Add'; ok.value = 'ok';
    const cancel = document.createElement('button'); cancel.textContent = 'Cancel'; cancel.value = 'cancel';
    bar.append(ok, cancel); dlg.appendChild(bar);
    ok.addEventListener('click', (e) => { e.preventDefault(); dlg.close('ok'); });
    cancel.addEventListener('click', (e) => { e.preventDefault(); dlg.close('cancel'); });
    dlg.addEventListener('close', () => {
      const v = dlg.returnValue === 'ok' ? sels.map((s) => s.value) : null;
      dlg.remove(); resolve(v);
    });
    document.body.appendChild(dlg);
    dlg.showModal();
  });
}
