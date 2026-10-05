/**
 * คู่มือการใช้งาน — the manual itself is a standalone static page
 * (public/manual.html, its own styles/fonts), embedded here so it opens
 * inside the app with the normal header/nav instead of replacing it.
 */
export default function Manual() {
  return (
    <div className="-my-6">
      <div className="flex justify-end py-2">
        <a href="/manual.html" target="_blank" rel="noreferrer" className="text-sm text-blue-600 hover:underline">
          เปิดคู่มือในแท็บใหม่ ↗
        </a>
      </div>
      <iframe
        src="/manual.html"
        title="คู่มือการใช้งาน"
        className="h-[calc(100vh-110px)] w-full rounded-lg border border-gray-200 bg-white"
      />
    </div>
  );
}
