import { describe, expect, it } from 'vitest';
import { groupRuns, type ColumnGroup } from './SortableTable';

const ROUTE: ColumnGroup = { key: 'route', label: 'ข้อมูลเส้นทาง', bandClassName: '', tintClassName: '' };
const PLAN: ColumnGroup = { key: 'plan', label: 'แผนโอน', bandClassName: '', tintClassName: '' };

describe('groupRuns', () => {
  it('collapses consecutive columns sharing the same group.key into one run', () => {
    const columns = [{ group: ROUTE }, { group: ROUTE }, { group: PLAN }];
    const runs = groupRuns(columns);
    expect(runs).toEqual([
      { group: ROUTE, span: 2, pin: false },
      { group: PLAN, span: 1, pin: false },
    ]);
  });

  it('skips columns with no group', () => {
    const columns = [{ group: ROUTE }, {}, { group: PLAN }];
    const runs = groupRuns(columns);
    expect(runs.map((r) => r.group.key)).toEqual(['route', 'plan']);
  });

  it('starts a standalone run for a pinned column even if it shares a group.key with its neighbor', () => {
    // A colSpan cell can't be "pinned for only part of its width" — the
    // pinned column's band must be its own <th> so it can be sticky-left
    // independently of the rest of the group.
    const columns = [{ group: ROUTE, pin: true }, { group: ROUTE }, { group: ROUTE }];
    const runs = groupRuns(columns);
    expect(runs).toEqual([
      { group: ROUTE, span: 1, pin: true },
      { group: ROUTE, span: 2, pin: false },
    ]);
  });

  it('does not merge a pinned column into a following run either', () => {
    const columns = [{ group: ROUTE }, { group: ROUTE, pin: true }, { group: ROUTE }];
    const runs = groupRuns(columns);
    expect(runs).toEqual([
      { group: ROUTE, span: 1, pin: false },
      { group: ROUTE, span: 1, pin: true },
      { group: ROUTE, span: 1, pin: false },
    ]);
  });
});
