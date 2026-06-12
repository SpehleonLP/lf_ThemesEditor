const PATTERNS = [
  /^(Header|Footer|Slider|Button|GridItem|ListItem|Tab|Window|IndentGroupBox|RaisedGroupBox)_[0-3]$/,
  /^(Backing|Decoration)_[0-2]$/,
  /^Panel_[0-3]_[0-3]$/,
  /^DecorativeGroupBox_[0-3]_[01]$/,
  /^FlatGroupBox_[0-3]_[0-7]$/,
];

export function isValidBorderName(name: string): boolean {
  return PATTERNS.some((p) => p.test(name));
}

// Generate the full Gui::Border enum slot list, matching the PATTERNS above exactly.
export function allBorderNames(): string[] {
  const out: string[] = [];
  const families = ['Header', 'Footer', 'Slider', 'Button', 'GridItem', 'ListItem', 'Tab', 'Window', 'IndentGroupBox', 'RaisedGroupBox'];
  for (const f of families) for (let i = 0; i <= 3; ++i) out.push(`${f}_${i}`);
  for (const f of ['Backing', 'Decoration']) for (let i = 0; i <= 2; ++i) out.push(`${f}_${i}`);
  for (let a = 0; a <= 3; ++a) for (let b = 0; b <= 3; ++b) out.push(`Panel_${a}_${b}`);
  for (let a = 0; a <= 3; ++a) for (let b = 0; b <= 1; ++b) out.push(`DecorativeGroupBox_${a}_${b}`);
  for (let a = 0; a <= 3; ++a) for (let b = 0; b <= 7; ++b) out.push(`FlatGroupBox_${a}_${b}`);
  return out;
}

export function unusedBorderNames(used: readonly string[]): string[] {
  const usedSet = new Set(used);
  return allBorderNames().filter((n) => !usedSet.has(n));
}
