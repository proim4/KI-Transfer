import type { ReactNode } from 'react';
import { useEffect, useRef, useState } from 'react';
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

/**
 * A <details>-based nav dropdown, fully controlled so it actually closes —
 * native <details> has no built-in "close on outside click" or "close when a
 * link inside it is clicked" behavior (despite what an earlier comment here
 * assumed), so without this every navigation via the menu left it stuck open,
 * overlapping the new page. Closes on: picking any link inside, clicking
 * anywhere else on the page, or Escape.
 */
function NavDropdown({ label, children }: { label: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    if (!open) return;
    function handlePointerDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  return (
    <details ref={ref} open={open} className="group relative">
      <summary
        onClick={(e) => {
          e.preventDefault();
          setOpen((o) => !o);
        }}
        className="flex cursor-pointer list-none items-center gap-1 rounded-md px-3 py-2 text-sm font-medium text-navy-100 hover:bg-navy-800 [&::-webkit-details-marker]:hidden"
      >
        {label}
        <span className="text-xs">▾</span>
      </summary>
      <nav onClick={() => setOpen(false)} className="absolute right-0 z-20 mt-1 w-56 rounded-md border border-gray-200 bg-white p-1 shadow-lg">
        {children}
      </nav>
    </details>
  );
}

/** ข้อมูลดิบ / 3 หน้า Tracking / Settings live under one "เพิ่มเติม" menu so the
 * primary nav only ever shows the 2 things most people need (Dashboard, Upload). */
function MoreMenu({ showSettings }: { showSettings: boolean }) {
  return (
    <NavDropdown label="เพิ่มเติม">
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
    </NavDropdown>
  );
}

/** สินค้าหมู เป็นชุดข้อมูลคู่ขนานแยกจากไก่ทั้งหมด (weeks.product_line) — อยู่คนละเมนูหลัก
 * ไปเลยแทนที่จะปนกับเมนูไก่เดิม เพื่อไม่ให้กระทบ Nav/Function เดิมของไก่แม้แต่นิดเดียว. */
function PorkMenu() {
  return (
    <NavDropdown label="หมู">
      <NavLink to="/pork/dashboard" className={moreLinkClass}>
        Dashboard (หมู)
      </NavLink>
      <NavLink to="/pork/upload" className={moreLinkClass}>
        Upload Data (หมู)
      </NavLink>
      <NavLink to="/pork/tracking/daily" className={moreLinkClass}>
        ติดตามโอน (หมู)
      </NavLink>
      <NavLink to="/pork/raw-data" className={moreLinkClass}>
        ข้อมูลดิบ (หมู)
      </NavLink>
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

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-navy-900">
        <div className="mx-auto flex max-w-screen-2xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-6">
            <NavLink to="/" className="text-lg font-semibold text-white">
              ติดตามโอนเทียบแผน
            </NavLink>
            <nav className="flex items-center gap-2">
              <NavLink to="/dashboard" className={navLinkClass}>
                Dashboard
              </NavLink>
              <NavLink to="/upload" className={navLinkClass}>
                Upload Data
              </NavLink>
              <MoreMenu showSettings={showSettings} />
              <PorkMenu />
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
