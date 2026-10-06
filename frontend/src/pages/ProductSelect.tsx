import { useNavigate } from 'react-router-dom';
import { usePageAccess } from '../hooks/usePageAccess';
import type { PageArea } from '../lib/pageAccess';

const PRODUCTS = [
  { key: 'chicken', icon: '🐔', label: 'ไก่', path: '/dashboard' },
  { key: 'pork', icon: '🐷', label: 'หมู', path: '/pork/dashboard' },
] as const satisfies readonly { key: PageArea; icon: string; label: string; path: string }[];

const ALL_PRODUCT = { key: 'all', icon: '📦', label: 'ทั้งหมด', path: '/all/dashboard' } as const;

const MANUAL = { key: 'manual', icon: '📖', label: 'คู่มือการใช้งาน', path: '/manual' } as const;

const cardClass =
  'flex w-full flex-col items-center gap-3 rounded-lg border border-gray-200 bg-white p-8 shadow-sm transition hover:-translate-y-0.5 hover:border-navy-300 hover:shadow-md';

/** Landing page after login — lets the user pick which product's data to
 * view before entering its Dashboard, instead of always defaulting straight
 * to the chicken pages. Only the products this user may open are listed. */
export default function ProductSelect() {
  const navigate = useNavigate();
  const { loading, can } = usePageAccess();

  if (loading) return <p className="py-12 text-center text-sm text-gray-500">กำลังโหลด...</p>;

  const products = PRODUCTS.filter((p) => can(p.key));
  const secondRow = [...(can('all') ? [ALL_PRODUCT] : []), MANUAL];

  return (
    <div className="mx-auto max-w-xl py-12 text-center">
      <h1 className="mb-2 text-xl font-semibold text-gray-900">เลือกสินค้า</h1>
      <p className="mb-8 text-sm text-gray-500">เลือกสินค้าเพื่อเข้าดูข้อมูลการติดตามโอน</p>
      {products.length === 0 && (
        <p className="mb-6 rounded-md bg-amber-50 px-4 py-3 text-sm text-amber-800">
          บัญชีนี้ยังไม่ได้รับสิทธิ์ดูข้อมูลสินค้าใด กรุณาติดต่อผู้ดูแลระบบ
        </p>
      )}
      {products.length > 0 && (
        <div className="grid grid-cols-2 gap-4">
          {products.map((p) => (
            <button
              key={p.key}
              type="button"
              onClick={() => navigate(p.path)}
              className={`${cardClass} ${products.length === 1 ? 'col-span-2 mx-auto max-w-[calc(50%-0.5rem)]' : ''}`}
            >
              <span className="text-4xl">{p.icon}</span>
              <span className="text-base font-semibold text-gray-900">{p.label}</span>
            </button>
          ))}
        </div>
      )}
      <div className="mt-4 grid grid-cols-2 gap-4">
        {secondRow.map((p) => (
          <button
            key={p.key}
            type="button"
            onClick={() => navigate(p.path)}
            className={`${cardClass} ${secondRow.length === 1 ? 'col-span-2 mx-auto max-w-[calc(50%-0.5rem)]' : ''}`}
          >
            <span className="text-4xl">{p.icon}</span>
            <span className="text-base font-semibold text-gray-900">{p.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
