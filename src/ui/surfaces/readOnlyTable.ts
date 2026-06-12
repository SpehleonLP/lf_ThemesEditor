// src/ui/surfaces/readOnlyTable.ts
// The read-only table surface was retired in slice 5 (response curves became an editable
// surface). Only the generic entry-selection resolver remains live — it is shared by the
// backgrounds and response-curves surfaces' reveal() handlers.
import type { Namespace, RefIndex } from '../../package/refIndex';
import type { NavTarget } from '../../package/validate';

export function resolveEntrySelection(
  index: RefIndex,
  tables: { ns: Namespace; title: string }[],
  entry: NavTarget['entry'],
): { ns: Namespace; name: string } | null {
  if (!entry?.name) return null;
  if (entry.ns) return { ns: entry.ns, name: entry.name };
  for (const t of tables) {
    if (index.definitions(t.ns).includes(entry.name)) return { ns: t.ns, name: entry.name };
  }
  return null;
}
