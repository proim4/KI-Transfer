import { useNavigate } from 'react-router-dom';

const PRODUCTS = [
  { key: 'chicken', icon: '🐔', label: 'ไก่', path: '/dashboard' },
  { key: 'pork', icon: '🐷', label: 'หมู', path: '/pork/dashboard' },
] as const;

/** Landing page after login — lets the user pick which product's data to
 * view before entering its Dashboard, instead of always defaulting straight
 * to the chicken pages. */
export default function ProductSelect() {
  const navigate = useNavigate();

  return (
    <div className="mx-auto max-w-xl py-12 text-center">
      <h1 className="mb-2 text-xl font-semibold text-gray-900">เลือกสินค้า</h1>
      <p className="mb-8 text-sm text-gray-500">เลือกสินค้าเพื่อเข้าดูข้อมูลการติดตามโอน</p>
      <div className="grid grid-cols-2 gap-4">
        {PRODUCTS.map((p) => (
          <button
            key={p.key}
            type="button"
            onClick={() => navigate(p.path)}
            className="flex flex-col items-center gap-3 rounded-lg border border-gray-200 bg-white p-8 shadow-sm transition hover:-translate-y-0.5 hover:border-navy-300 hover:shadow-md"
          >
            <span className="text-4xl">{p.icon}</span>
            <span className="text-base font-semibold text-gray-900">{p.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
