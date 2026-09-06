import Dashboard from './Dashboard';

/**
 * "ข้อมูลทั้งหมด" — ไก่และหมูมี Week ของตัวเองแยกกัน (คนละสินค้า คนละรอบข้อมูล)
 * จึงไม่รวมตัวเลขเข้าด้วยกัน แต่แสดง Dashboard เดิมของแต่ละสินค้าซ้อนกันแทน
 * เพื่อให้เลือก Week ของแต่ละฝั่งได้อิสระเหมือนเดิม.
 */
export default function AllDashboard() {
  return (
    <div className="space-y-10">
      <section>
        <h2 className="mb-4 flex items-center gap-2 text-lg font-bold text-gray-900">🐔 ไก่</h2>
        <Dashboard productLine="chicken" />
      </section>
      <section>
        <h2 className="mb-4 flex items-center gap-2 text-lg font-bold text-gray-900">🐷 หมู</h2>
        <Dashboard productLine="pork" />
      </section>
    </div>
  );
}
