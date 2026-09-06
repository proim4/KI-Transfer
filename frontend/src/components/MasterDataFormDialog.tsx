import { useState } from 'react';
import type { MasterDataRow } from '../hooks/useMasterData';

export interface MasterDataFieldConfig {
  key: string;
  label: string;
  type?: 'text' | 'number';
  /** Not editable once the row already exists — typically the primary key (changing it would need delete+recreate instead). */
  readOnlyOnEdit?: boolean;
}

interface MasterDataFormDialogProps {
  title: string;
  fields: MasterDataFieldConfig[];
  initial: MasterDataRow | null; // null = creating a new row
  onSubmit: (row: MasterDataRow) => void;
  onClose: () => void;
  submitting: boolean;
  error: string | null;
}

const inputClass = 'w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900';
const labelClass = 'mb-1 block text-sm text-gray-600';

export default function MasterDataFormDialog({
  title,
  fields,
  initial,
  onSubmit,
  onClose,
  submitting,
  error,
}: MasterDataFormDialogProps) {
  const [values, setValues] = useState<MasterDataRow>(() => {
    const base: MasterDataRow = {};
    for (const f of fields) base[f.key] = initial?.[f.key] ?? (f.type === 'number' ? 0 : '');
    return base;
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    onSubmit(values);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <form onSubmit={handleSubmit} className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-lg bg-white p-5 shadow-xl">
        <h2 className="mb-4 text-base font-semibold text-gray-900">{title}</h2>

        <div className="space-y-3">
          {fields.map((f) => {
            const disabled = initial !== null && f.readOnlyOnEdit;
            return (
              <div key={f.key}>
                <label className={labelClass}>{f.label}</label>
                <input
                  type={f.type === 'number' ? 'number' : 'text'}
                  value={values[f.key] as string | number}
                  disabled={disabled}
                  onChange={(e) =>
                    setValues((v) => ({
                      ...v,
                      [f.key]: f.type === 'number' ? Number(e.target.value) : e.target.value,
                    }))
                  }
                  className={disabled ? `${inputClass} bg-gray-50 text-gray-500` : inputClass}
                />
              </div>
            );
          })}
        </div>

        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
          >
            ยกเลิก
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="rounded-md bg-navy-800 px-3 py-1.5 text-sm font-medium text-white hover:bg-navy-900 disabled:opacity-50"
          >
            {submitting ? 'กำลังบันทึก...' : 'บันทึก'}
          </button>
        </div>
      </form>
    </div>
  );
}
