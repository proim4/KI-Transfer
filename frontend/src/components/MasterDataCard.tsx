import { useMemo, useState } from 'react';
import { useMasterDataMutations, useMasterDataRows, type MasterDataRow } from '../hooks/useMasterData';
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
  const [expanded, setExpanded] = useState(false);

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
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="flex items-center gap-2 text-left font-medium text-gray-900"
          >
            <span className="text-xs text-gray-400">{expanded ? '▾' : '▸'}</span>
            {title}
            <span className="text-xs font-normal text-gray-400">({rows?.length ?? 0} รายการ)</span>
          </button>
          <p className="mt-1 text-sm text-gray-500">{description}</p>
        </div>
        {expanded && (
          <button
            type="button"
            onClick={() => {
              setFormError(null);
              setEditing('new');
            }}
            className="rounded-md bg-navy-800 px-3 py-1.5 text-sm font-medium text-white hover:bg-navy-900"
          >
            + เพิ่มรายการ
          </button>
        )}
      </div>

      {expanded && (
        <div className="mt-3">
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
        </div>
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
            remove.mutate(deleting[idField]);
            setDeleting(null);
          }}
          onCancel={() => setDeleting(null)}
        />
      )}
    </div>
  );
}
