import type { PageAccess, UserRole } from '../types/db';

/** A page area a user can be granted: one of the product pages, or Settings (= the admin role). */
export type PageArea = PageAccess | 'settings';

export const PAGE_AREAS: { key: PageArea; label: string }[] = [
  { key: 'chicken', label: '🐔 ไก่' },
  { key: 'pork', label: '🐷 หมู' },
  { key: 'all', label: '📦 ทั้งหมด' },
  { key: 'settings', label: '⚙️ ตั้งค่า' },
];

export const ALL_PAGE_ACCESS: PageAccess[] = ['chicken', 'pork', 'all'];

/** The areas a profile can open — admins get every area, mirroring can_access_product() in migration 0020. */
export function areasOf(role: UserRole, pageAccess: PageAccess[] | null | undefined): Set<PageArea> {
  if (role === 'admin') return new Set<PageArea>([...ALL_PAGE_ACCESS, 'settings']);
  // Missing only before migration 0020 has run (the column defaults to full access).
  return new Set<PageArea>(pageAccess ?? ALL_PAGE_ACCESS);
}

/**
 * Applies one checkbox toggle while keeping the set consistent with the
 * server's rules: ทั้งหมด needs both ไก่ and หมู (it shows both products'
 * data), and ตั้งค่า is the admin role, which always has every page.
 */
export function toggleArea(areas: Set<PageArea>, area: PageArea, checked: boolean): Set<PageArea> {
  const next = new Set(areas);
  if (checked) {
    next.add(area);
    if (area === 'all') {
      next.add('chicken');
      next.add('pork');
    }
    if (area === 'settings') ALL_PAGE_ACCESS.forEach((a) => next.add(a));
  } else {
    if (next.has('settings') && area !== 'settings') return next; // admin keeps every product page
    next.delete(area);
    if (area === 'chicken' || area === 'pork') next.delete('all');
  }
  return next;
}

/** Splits a checkbox set into what the manage-users function expects. */
export function toRoleAndAccess(areas: Set<PageArea>): { role: UserRole; pageAccess: PageAccess[] } {
  return {
    role: areas.has('settings') ? 'admin' : 'user',
    pageAccess: ALL_PAGE_ACCESS.filter((a) => areas.has(a)),
  };
}
