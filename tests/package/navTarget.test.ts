// tests/package/navTarget.test.ts
import { expect, test } from 'vitest';
import { worstSeverity, groupBySeverity, countsByFile, severityRank } from '../../src/package/navTarget';
import type { Issue } from '../../src/package/validate';

const mk = (sev: Issue['severity'], file: Issue['file']): Issue => ({ severity: sev, category: 'x', message: 'm', file });

test('severityRank orders error > warning > notice', () => {
  expect(severityRank('error')).toBeGreaterThan(severityRank('warning'));
  expect(severityRank('warning')).toBeGreaterThan(severityRank('notice'));
});

test('worstSeverity returns the highest severity for a file, or null', () => {
  const issues = [mk('notice', 'borders'), mk('error', 'borders'), mk('warning', 'backgrounds')];
  expect(worstSeverity(issues, 'borders')).toBe('error');
  expect(worstSeverity(issues, 'backgrounds')).toBe('warning');
  expect(worstSeverity(issues, 'codingThemes')).toBeNull();
});

test('groupBySeverity buckets issues', () => {
  const g = groupBySeverity([mk('error', 'borders'), mk('error', 'assets'), mk('notice', 'borders')]);
  expect(g.error.length).toBe(2);
  expect(g.warning.length).toBe(0);
  expect(g.notice.length).toBe(1);
});

test('countsByFile tallies error/warning/notice per file', () => {
  const c = countsByFile([mk('error', 'borders'), mk('warning', 'borders'), mk('notice', 'assets')]);
  expect(c.borders).toEqual({ error: 1, warning: 1, notice: 0 });
  expect(c.assets).toEqual({ error: 0, warning: 0, notice: 1 });
});
