// src/package/navTarget.ts
import type { Issue, Severity } from './validate';

export type { NavTarget } from './validate';

export function severityRank(s: Severity): number {
  return s === 'error' ? 3 : s === 'warning' ? 2 : 1;
}

export function worstSeverity(issues: Issue[], file: Issue['file']): Severity | null {
  let worst: Severity | null = null;
  for (const i of issues) {
    if (i.file !== file) continue;
    if (!worst || severityRank(i.severity) > severityRank(worst)) worst = i.severity;
  }
  return worst;
}

export function groupBySeverity(issues: Issue[]): Record<Severity, Issue[]> {
  const g: Record<Severity, Issue[]> = { error: [], warning: [], notice: [] };
  for (const i of issues) g[i.severity].push(i);
  return g;
}

export type FileCounts = Record<Severity, number>;
export function countsByFile(issues: Issue[]): Record<string, FileCounts> {
  const out: Record<string, FileCounts> = {};
  for (const i of issues) {
    (out[i.file] ??= { error: 0, warning: 0, notice: 0 })[i.severity]++;
  }
  return out;
}
