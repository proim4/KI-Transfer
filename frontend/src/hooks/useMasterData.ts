import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchAllRows } from '../lib/fetchAllRows';
import { supabase } from '../lib/supabase';

export type MasterDataRow = Record<string, unknown>;

function queryKey(table: string) {
  return ['master-data', table];
}

/** Lists every row of a master-data table (mas_*) — these are global reference data, not week-scoped, so no weekId filter. */
export function useMasterDataRows(table: string) {
  return useQuery({
    queryKey: queryKey(table),
    queryFn: (): Promise<MasterDataRow[]> => fetchAllRows((from, to) => supabase.from(table).select('*').range(from, to)),
  });
}

/**
 * Insert/update/delete for one master-data table. Writes are enforced
 * admin-only by RLS (`mas_*_admin_write` policies from migration 0011) —
 * this hook itself does not check role; a non-admin's write is simply
 * rejected by Postgres and surfaces as a thrown error.
 */
// RLS silently filters an update/delete the caller may not perform (no
// error, just 0 rows), which used to read as a successful save.
const NOT_SAVED = 'บันทึกไม่สำเร็จ — ไม่มีสิทธิ์แก้ไข Master Data (ต้องเป็น Admin ที่ Login อยู่) หรือรายการถูกลบไปแล้ว';

export function useMasterDataMutations(table: string, idField: string) {
  const queryClient = useQueryClient();
  const invalidate = () => queryClient.invalidateQueries({ queryKey: queryKey(table) });

  const insert = useMutation({
    mutationFn: async (row: MasterDataRow) => {
      const { error } = await supabase.from(table).insert(row);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const update = useMutation({
    mutationFn: async ({ id, row }: { id: unknown; row: MasterDataRow }) => {
      const { data, error } = await supabase.from(table).update(row).eq(idField, id as string | number).select(idField);
      if (error) throw error;
      if (!data || data.length === 0) throw new Error(NOT_SAVED);
    },
    onSuccess: invalidate,
  });

  const remove = useMutation({
    mutationFn: async (id: unknown) => {
      const { data, error } = await supabase.from(table).delete().eq(idField, id as string | number).select(idField);
      if (error) throw error;
      if (!data || data.length === 0) throw new Error(NOT_SAVED);
    },
    onSuccess: invalidate,
  });

  return { insert, update, remove };
}
