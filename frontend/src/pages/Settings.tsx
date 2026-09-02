import { useAppSettings, useSetRequireLogin } from '../hooks/useAppSettings';

export default function Settings() {
  const { data: settings, isLoading } = useAppSettings();
  const setRequireLogin = useSetRequireLogin();

  if (isLoading || !settings) {
    return <p className="text-gray-500">กำลังโหลด...</p>;
  }

  return (
    <div className="max-w-xl">
      <h1 className="mb-4 text-xl font-semibold text-gray-900">ตั้งค่าระบบ</h1>
      <div className="flex items-center justify-between rounded-lg border border-gray-200 bg-white p-4">
        <div>
          <p className="font-medium text-gray-900">บังคับ Login ก่อนใช้งาน</p>
          <p className="text-sm text-gray-500">
            เมื่อปิด ผู้ใช้ทุกคนเข้าใช้งานเว็บแอปนี้ได้โดยไม่ต้องเข้าสู่ระบบ
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={settings.require_login}
          onClick={() => setRequireLogin.mutate(!settings.require_login)}
          disabled={setRequireLogin.isPending}
          className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
            settings.require_login ? 'bg-indigo-600' : 'bg-gray-300'
          }`}
        >
          <span
            className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
              settings.require_login ? 'translate-x-5' : 'translate-x-0.5'
            }`}
          />
        </button>
      </div>
    </div>
  );
}
