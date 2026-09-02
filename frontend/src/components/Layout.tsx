import { NavLink, Outlet } from 'react-router-dom';
import { useSession } from '../hooks/useAuth';
import { supabase } from '../lib/supabase';

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  `rounded-md px-3 py-2 text-sm font-medium ${
    isActive ? 'bg-indigo-600 text-white' : 'text-gray-600 hover:bg-gray-100'
  }`;

export default function Layout() {
  const { session } = useSession();

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="border-b border-gray-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-6">
            <span className="text-lg font-semibold text-gray-900">ติดตามโอนเทียบแผน</span>
            <nav className="flex gap-2">
              <NavLink to="/dashboard" className={navLinkClass}>
                Dashboard
              </NavLink>
              <NavLink to="/upload" className={navLinkClass}>
                Upload Data
              </NavLink>
              <NavLink to="/raw-data" className={navLinkClass}>
                ข้อมูลดิบ
              </NavLink>
              <NavLink to="/settings" className={navLinkClass}>
                Settings
              </NavLink>
            </nav>
          </div>
          {session && (
            <div className="flex items-center gap-3 text-sm text-gray-500">
              <span>{session.user.email}</span>
              <button
                type="button"
                onClick={() => supabase.auth.signOut()}
                className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-gray-900 hover:bg-gray-100"
              >
                ออกจากระบบ
              </button>
            </div>
          )}
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-6">
        <Outlet />
      </main>
    </div>
  );
}
