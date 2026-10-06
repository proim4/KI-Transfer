import { useMemo, useState } from 'react';
import { useMasterDataMutations, useMasterDataRows, type MasterDataRow } from '../hooks/useMasterData';
import CollapsibleCard from './CollapsibleCard';
import ConfirmDialog from './ConfirmDialog';
import MasterDataFormDialog, { type MasterDataFieldConfig } from './MasterDataFormDialog';
import SortableTable, { type Column } from './SortableTable';

interface MasterDataCardProps {
  table: string;
  idField: string;
  title: string;
  description: string;
  fields: MasterDataFieldConfig[];
}

/**
 * Admin-only viewer/editor for one master-data table (mas_* — factory/zone/
 * toll-pair/special-SKU/product/SKU-representative reference data seeded
 * once from the Supply Daily workbook, see migration 0011). Generic over any
 * of the 6 tables via `fields`/`idField` — writes are still enforced
 * admin-only at the RLS level regardless of what this UI allows.
 */
export default function MasterDataCard({ table, idField, title, description, fields }: MasterDataCardProps) {
  const { data: rows, isLoading } = useMasterDataRows(table);
  const { insert, update, remove } = useMasterDataMutations(table, idField);

  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<MasterDataRow | null | 'new'>(null);
  const [deleting, setDeleting] = useState<MasterDataRow | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const all = rows ?? [];
    if (!search) return all;
    const q = search.toLowerCase();
    return all.filter((row) => fields.some((f) => String(row[f.key] ?? '').toLowerCase().includes(q)));
  }, [rows, search, fields]);

  const columns: Column<MasterDataRow>[] = useMemo(
    () => [
      ...fields.map((f) => ({
        key: f.key,
        label: f.label,
        align: f.type === 'number' ? ('right' as const) : undefined,
        sortValue: (r: MasterDataRow) => (r[f.key] as string | number | null) ?? null,
        render: (r: MasterDataRow) => String(r[f.key] ?? ''),
      })),
      {
        key: '__actions',
        label: '',
        sortValue: () => null,
        render: (r: MasterDataRow) => (
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => {
                setFormError(null);
                setEditing(r);
              }}
              className="rounded-md border border-gray-300 bg-white px-2 py-0.5 text-xs text-gray-700 hover:bg-gray-50"
            >
              แก้ไข
            </button>
            <button
              type="button"
              onClick={() => setDeleting(r)}
              className="rounded-md border border-gray-300 bg-white px-2 py-0.5 text-xs text-red-600 hover:bg-red-50"
            >
              ลบ
            </button>
          </div>
        ),
      },
    ],
    [fields],
  );

  async function handleFormSubmit(row: MasterDataRow) {
    setFormError(null);
    try {
      if (editing === 'new') {
        await insert.mutateAsync(row);
      } else if (editing) {
        await update.mutateAsync({ id: editing[idField], row });
      }
      setEditing(null);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'บันทึกไม่สำเร็จ — ตรวจสอบว่าเป็น Admin หรือไม่');
    }
  }

  return (
    <CollapsibleCard
      title={title}
      summary={`(${isLoading ? '…' : (rows?.length ?? 0).toLocaleString('en-US')} รายการ)`}
      description={description}
      storageKey={`settings-card-open:${table}`}
      defaultOpen={false}
      variant="row"
      actions={
        <button
          type="button"
          onClick={() => {
            setFormError(null);
            setEditing('new');
          }}
          className="rounded-md border border-navy-300 bg-white px-3 py-1 text-sm font-medium text-navy-800 hover:bg-navy-50"
        >
          + เพิ่มรายการ
        </button>
      }
    >
      {deleteError && <p className="mb-2 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{deleteError}</p>}

      {isLoading ? (
        <p className="text-sm text-gray-500">กำลังโหลด...</p>
      ) : (
        <SortableTable
          rows={filtered}
          columns={columns}
          rowKey={(r) => String(r[idField])}
          defaultSortKey={fields[0]?.key ?? idField}
          maxHeight="400px"
          filterBar={
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="ค้นหา..."
              className="w-48 rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm text-gray-900"
            />
          }
        />
      )}

      {editing !== null && (
        <MasterDataFormDialog
          title={editing === 'new' ? `เพิ่ม${title}` : `แก้ไข${title}`}
          fields={fields}
          initial={editing === 'new' ? null : editing}
          onSubmit={handleFormSubmit}
          onClose={() => setEditing(null)}
          submitting={insert.isPending || update.isPending}
          error={formError}
        />
      )}

      {deleting && (
        <ConfirmDialog
          title="ต้องการลบรายการนี้หรือไม่?"
          message="รายการนี้จะถูกลบออกจาก Master Data ถาวร"
          confirmLabel="ยืนยันการลบ"
          danger
          onConfirm={() => {
            setDeleteError(null);
            remove.mutate(deleting[idField], {
              onError: (err) => setDeleteError(err instanceof Error ? err.message : 'ลบไม่สำเร็จ'),
            });
            setDeleting(null);
          }}
          onCancel={() => setDeleting(null)}
        />
      )}
    </CollapsibleCard>
  );
}
