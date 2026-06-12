// src/package/slotNames.ts
const DETAIL_PATTERNS = [
  /^(Backdrop|Progress|Affordance|GridItem|Panel|Decoration|Overlay)_[0-3]$/,
];
const LIGHT_PATTERNS = [
  /^White$/,
  /^(Backing|Header|Footer|Backdrop|Progress|Affordance|GridItem|ListItem|Button|Action)_[01]_[0-2]$/,
  /^(Panel|Decoration|GroupBox|Overlay)_[0-3]_[0-3]$/,
];

export function isValidDetailName(name: string): boolean {
  return DETAIL_PATTERNS.some((p) => p.test(name));
}
export function isValidLightName(name: string): boolean {
  return LIGHT_PATTERNS.some((p) => p.test(name));
}

export function allDetailNames(): string[] {
  const out: string[] = [];
  for (const f of ['Backdrop', 'Progress', 'Affordance', 'GridItem', 'Panel', 'Decoration', 'Overlay'])
    for (let i = 0; i <= 3; ++i) out.push(`${f}_${i}`);
  return out;
}

export function allLightNames(): string[] {
  const out: string[] = ['White']; // enum 1 — first
  for (const f of ['Backing', 'Header', 'Footer', 'Backdrop', 'Progress', 'Affordance', 'GridItem', 'ListItem', 'Button', 'Action'])
    for (let a = 0; a <= 1; ++a) for (let b = 0; b <= 2; ++b) out.push(`${f}_${a}_${b}`);
  for (const f of ['Panel', 'Decoration', 'GroupBox', 'Overlay'])
    for (let a = 0; a <= 3; ++a) for (let b = 0; b <= 3; ++b) out.push(`${f}_${a}_${b}`);
  return out;
}

export function unusedDetailNames(used: readonly string[]): string[] {
  const s = new Set(used);
  return allDetailNames().filter((n) => !s.has(n));
}
export function unusedLightNames(used: readonly string[]): string[] {
  const s = new Set(used);
  return allLightNames().filter((n) => !s.has(n));
}
