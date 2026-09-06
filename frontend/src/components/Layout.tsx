import type { ReactNode } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useAppSettings } from '../hooks/useAppSettings';
import { useCurrentUser } from '../hooks/useCurrentUser';
import { supabase } from '../lib/supabase';
import Dropdown from './Dropdown';
import LiveClock from './LiveClock';

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  `rounded-md px-3 py-2 text-sm font-medium ${
    isActive ? 'bg-navy-700 text-white' : 'text-navy-100 hover:bg-navy-800'
  }`;

const moreLinkClass = ({ isActive }: { isActive: boolean }) =>
  `block rounded-md px-3 py-2 text-sm ${isActive ? 'bg-navy-50 text-navy-900 font-medium' : 'text-gray-700 hover:bg-gray-100'}`;

function NavDropdown({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Dropdown
      label={
        <span className="flex items-center gap-1 rounded-md px-3 py-2 text-sm font-medium text-navy-100 hover:bg-navy-800">
          {label}
          <span className="text-xs">▾</span>
        </span>
      }
      panelClassName="absolute right-0 z-20 mt-1 w-56 rounded-md border border-gray-200 bg-white p-1 shadow-lg"
    >
      {children}
    </Dropdown>
  );
}

/** ข้อมูลดิบ / 3 หน้า Tracking / Settings live under one "เพิ่มเติม" menu so the
 * primary nav only ever shows the 2 things most people need (Dashboard, Upload). */
function MoreMenu({ showSettings }: { showSettings: boolean }) {
  return (
    <NavDropdown label="🐔 เพิ่มเติม">
      <NavLink to="/raw-data" className={moreLinkClass}>
        🐔 ข้อมูลดิบ
      </NavLink>
      <NavLink to="/tracking/weekly" className={moreLinkClass}>
        🐔 ติดตามโอน Weekly
      </NavLink>
      <NavLink to="/tracking/daily" className={moreLinkClass}>
        🐔 ติดตามโอน Daily
      </NavLink>
      <NavLink to="/tracking/total" className={moreLinkClass}>
        🐔 ติดตามโอนรวม
      </NavLink>
      <NavLink to="/supply-daily" className={moreLinkClass}>
        🐔 ติดตามการกรอก Supply Daily
      </NavLink>
      {showSettings && (
        <NavLink to="/settings" className={moreLinkClass}>
          Settings
        </NavLink>
      )}
    </NavDropdown>
  );
}

/**
 * สินค้าหมู เป็นชุดข้อมูลคู่ขนานแยกจากไก่ทั้งหมด (weeks.product_line) — เมื่ออยู่
 * ในหน้าหมูจริงๆ หรือหน้า ทั้งหมด นำ Dashboard/Upload Data ของหมูมาขึ้นเป็นเมนูหลัก
 * แทน ไม่ซ่อนไว้ในดรอปดาวน์ เพื่อไม่ให้กระทบ Nav/Function เดิมของไก่แม้แต่นิดเดียว.
 * เพิ่มเติม ฝั่งหมู — มีแค่ ติดตามโอน/ข้อมูลดิบ เพราะ Dashboard/Upload Data ของหมูขึ้นเป็นเมนูหลักแล้ว.
 */
function PorkMoreMenu({ showSettings }: { showSettings: boolean }) {
  return (
    <NavDropdown label="🐷 เพิ่มเติม">
      <NavLink to="/pork/tracking/daily" className={moreLinkClass}>
        🐷 ติดตามโอน (หมู)
      </NavLink>
      <NavLink to="/pork/raw-data" className={moreLinkClass}>
        🐷 ข้อมูลดิบ (หมู)
      </NavLink>
      <NavLink to="/pork/supply-daily" className={moreLinkClass}>
        🐷 ติดตามการกรอก Supply Daily (หมู)
      </NavLink>
      {showSettings && (
        <NavLink to="/settings" className={moreLinkClass}>
          Settings
        </NavLink>
      )}
    </NavDropdown>
  );
}

export default function Layout() {
  const { session, profile, isAdmin } = useCurrentUser();
  const { data: settings } = useAppSettings();
  const requireLogin = settings?.require_login ?? true;
  // Settings must stay reachable when require_login is off (see AdminGuard) —
  // otherwise no one signed in could ever turn it back on.
  const showSettings = !requireLogin || isAdmin;
  const location = useLocation();
  const isPork = location.pathname.startsWith('/pork');
  // ทั้งหมด shows both products' data at once, so its nav shows ไก่'s and
  // หมู's own top-level Dashboard/Upload Data/เพิ่มเติม side by side instead
  // of tucking หมู's away in a small dropdown.
  const isAll = location.pathname.startsWith('/all');

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-navy-900">
        <div className="mx-auto flex max-w-screen-2xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-6">
            <NavLink to="/" className="text-lg font-semibold text-white">
              ติดตามโอนเทียบแผน
            </NavLink>
            <nav className="flex items-center gap-2">
              {isPork ? (
                <>
                  <NavLink to="/pork/dashboard" className={navLinkClass}>
                    🐷 Dashboard
                  </NavLink>
                  <NavLink to="/pork/upload" className={navLinkClass}>
                    🐷 Upload Data
                  </NavLink>
                  <PorkMoreMenu showSettings={showSettings} />
                </>
              ) : (
                <>
                  <NavLink to="/dashboard" className={navLinkClass}>
                    🐔 Dashboard
                  </NavLink>
                  <NavLink to="/upload" className={navLinkClass}>
                    🐔 Upload Data
                  </NavLink>
                  <MoreMenu showSettings={showSettings} />
                  {isAll && (
                    <>
                      <NavLink to="/pork/dashboard" className={navLinkClass}>
                        🐷 Dashboard
                      </NavLink>
                      <NavLink to="/pork/upload" className={navLinkClass}>
                        🐷 Upload Data
                      </NavLink>
                      <PorkMoreMenu showSettings={showSettings} />
                    </>
                  )}
                </>
              )}
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
