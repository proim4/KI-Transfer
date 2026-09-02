interface PageResult<T> {
  data: T[] | null;
  error: { message: string } | null;
}

/**
 * Supabase/PostgREST caps a single request at the project's configured "Max
 * Rows" (1000 by default) — a plain `.select('*')` silently truncates once a
 * week's plan_rows/actual_rows/tracking_results pass that count, which real
 * weeks routinely do (a few thousand actual-transfer rows is normal). Page
 * through with `.range()` until a page comes back short of `pageSize`.
 */
export async function fetchAllRows<T>(
  page: (from: number, to: number) => PromiseLike<PageResult<T>>,
  pageSize = 1000,
): Promise<T[]> {
  const all: T[] = [];
  let from = 0;
  for (;;) {
    const { data, error } = await page(from, from + pageSize - 1);
    if (error) throw new Error(error.message);
    if (!data || data.length === 0) break;
    all.push(...data);
    if (data.length < pageSize) break;
    from += pageSize;
  }
  return all;
}
