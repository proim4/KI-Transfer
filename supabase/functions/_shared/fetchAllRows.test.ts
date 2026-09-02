import { describe, expect, it, vi } from 'vitest';
import { fetchAllRows } from './fetchAllRows.ts';

function makeSource(total: number) {
  const rows = Array.from({ length: total }, (_, i) => ({ id: i }));
  return vi.fn(async (from: number, to: number) => ({
    data: rows.slice(from, to + 1),
    error: null,
  }));
}

describe('fetchAllRows', () => {
  it('returns everything in one page when under the page size', async () => {
    const source = makeSource(3);
    const rows = await fetchAllRows(source, 1000);
    expect(rows).toHaveLength(3);
    expect(source).toHaveBeenCalledTimes(1);
  });

  it('pages past the default 1000-row PostgREST cap without dropping rows', async () => {
    // This is exactly the scenario that silently truncated real data before
    // the fix: a week with more actual-transfer rows than one page.
    const source = makeSource(2500);
    const rows = await fetchAllRows(source, 1000);
    expect(rows).toHaveLength(2500);
    expect(rows[0].id).toBe(0);
    expect(rows[2499].id).toBe(2499);
    expect(source).toHaveBeenCalledTimes(3); // 0-999, 1000-1999, 2000-2499
  });

  it('handles a total that is an exact multiple of the page size (one extra empty page to confirm the end, by design)', async () => {
    const source = makeSource(2000);
    const rows = await fetchAllRows(source, 1000);
    expect(rows).toHaveLength(2000);
    expect(source).toHaveBeenCalledTimes(3); // 0-999, 1000-1999, 2000-2999 (empty)
  });

  it('returns an empty array with a single call when there are no rows', async () => {
    const source = makeSource(0);
    const rows = await fetchAllRows(source, 1000);
    expect(rows).toEqual([]);
    expect(source).toHaveBeenCalledTimes(1);
  });

  it('propagates a page error instead of returning partial data silently', async () => {
    const source = vi.fn(async () => ({ data: null, error: { message: 'boom' } }));
    await expect(fetchAllRows(source, 1000)).rejects.toThrow('boom');
  });
});
