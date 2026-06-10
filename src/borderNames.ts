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
