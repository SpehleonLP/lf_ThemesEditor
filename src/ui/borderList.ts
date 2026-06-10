import { state } from './state';

export function renderBorderList(el: HTMLElement, onSelect: (name: string) => void): void {
  el.innerHTML = '';
  if (!state.doc) return;
  for (const name of state.doc.names) {
    const div = document.createElement('div');
    div.textContent = name;
    div.style.cssText = `padding:4px 8px;cursor:pointer;${name === state.selected ? 'background:#46a;' : ''}`;
    div.onclick = () => onSelect(name);
    el.appendChild(div);
  }
}
