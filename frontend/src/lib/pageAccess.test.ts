import { describe, expect, it } from 'vitest';
import { areasOf, toRoleAndAccess, toggleArea, type PageArea } from './pageAccess';

const set = (...a: PageArea[]) => new Set<PageArea>(a);

describe('pageAccess', () => {
  it('gives admins every area regardless of stored page_access', () => {
    expect(areasOf('admin', [])).toEqual(set('chicken', 'pork', 'all', 'settings'));
    expect(areasOf('user', ['pork'])).toEqual(set('pork'));
  });

  it('ticking ทั้งหมด also ticks ไก่ and หมู', () => {
    expect(toggleArea(set(), 'all', true)).toEqual(set('all', 'chicken', 'pork'));
  });

  it('unticking ไก่ or หมู drops ทั้งหมด', () => {
    expect(toggleArea(set('chicken', 'pork', 'all'), 'pork', false)).toEqual(set('chicken'));
  });

  it('ตั้งค่า makes the user an admin with every product page, which stay locked while it is ticked', () => {
    const admin = toggleArea(set('pork'), 'settings', true);
    expect(admin).toEqual(set('pork', 'chicken', 'all', 'settings'));
    expect(toggleArea(admin, 'chicken', false)).toEqual(admin);
    expect(toRoleAndAccess(admin)).toEqual({ role: 'admin', pageAccess: ['chicken', 'pork', 'all'] });
    expect(toRoleAndAccess(set('chicken'))).toEqual({ role: 'user', pageAccess: ['chicken'] });
  });
});
