import { NavLink, Outlet } from 'react-router-dom';
import { useAppSettings } from '../hooks/useAppSettings';
import { useCurrentUser } from '../hooks/useCurrentUser';
import { supabase } from '../lib/supabase';
import LiveClock from './LiveClock';

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  `rounded-md px-3 py-2 text-sm font-medium ${
    isActive ? 'bg-navy-700 text-white' : 'text-navy-100 hover:bg-navy-800'
  }`;

const moreLinkClass = ({ isActive }: { isActive: boolean }) =>
  `block rounded-md px-3 py-2 text-sm ${isActive ? 'bg-navy-50 text-navy-900 font-medium' : 'text-gray-700 hover:bg-gray-100'}`;

/** ข้อมูลดิบ / 3 หน้า Tracking / Settings live under one "เพิ่มเติม" menu so the
 * primary nav only ever shows the 2 things most people need (Dashboard, Upload) —
 * a <details> menu needs no outside-click JS to close itself (native behavior). */
function MoreMenu({ showSettings }: { showSettings: boolean }) {
  return (
    <details className="group relative">
      <summary className="flex cursor-pointer list-none items-center gap-1 rounded-md px-3 py-2 text-sm font-medium text-navy-100 hover:bg-navy-800 [&::-webkit-details-marker]:hidden">
        เพิ่มเติม
        <span className="text-xs">▾</span>
      </summary>
      <nav className="absolute right-0 z-20 mt-1 w-56 rounded-md border border-gray-200 bg-white p-1 shadow-lg">
        <NavLink to="/raw-data" className={moreLinkClass}>
          ข้อมูลดิบ
        </NavLink>
        <NavLink to="/tracking/weekly" className={moreLinkClass}>
          ติดตามโอน Weekly
        </NavLink>
        <NavLink to="/tracking/daily" className={moreLinkClass}>
          ติดตามโอน Daily
        </NavLink>
        <NavLink to="/tracking/total" className={moreLinkClass}>
          ติดตามโอนรวม
        </NavLink>
        {showSettings && (
          <NavLink to="/settings" className={moreLinkClass}>
            Settings
          </NavLink>
        )}
      </nav>
    </details>
  );
}

export default function Layout() {
  const { session, profile, isAdmin } = useCurrentUser();
  const { data: settings } = useAppSettings();
  const requireLogin = settings?.require_login ?? true;
  // Settings must stay reachable when require_login is off (see AdminGuard) —
  // otherwise no one signed in could ever turn it back on.
  const showSettings = !requireLogin || isAdmin;

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-navy-900">
        <div className="mx-auto flex max-w-screen-2xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-6">
            <span className="text-lg font-semibold text-white">ติดตามโอนเทียบแผน</span>
            <nav className="flex items-center gap-2">
              <NavLink to="/dashboard" className={navLinkClass}>
                Dashboard
              </NavLink>
              <NavLink to="/upload" className={navLinkClass}>
                Upload Data
              </NavLink>
              <MoreMenu showSettings={showSettings} />
            </nav>
          </div>
          <div className="flex items-center gap-4">
            <LiveClock />
            {session && (
              <div className="flex items-center gap-3 text-sm text-navy-200">
                <span>👤 {profile?.username ?? session.user.email}</span>
                <button
                  type="button"
                  onClick={() => supabase.auth.signOut()}
                  className="rounded-md border border-navy-600 bg-navy-800 px-3 py-1.5 text-white hover:bg-navy-700"
                >
                  ออกจากระบบ
                </button>
              </div>
            )}
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-screen-2xl px-4 py-6">
        <Outlet />
      </main>
    </div>
  );
}
