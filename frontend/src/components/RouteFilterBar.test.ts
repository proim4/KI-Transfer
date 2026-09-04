import { describe, expect, it } from 'vitest';
import { EMPTY_ROUTE_FILTER, matchesRouteFilter } from './RouteFilterBar';

const row = { date: '2026-09-01', origin: 'OPRCD0011 โรงงาน A', dest: 'OPRCDN001 โรงงาน B', productGroup: 'ตับไก่', searchText: 'OPRCD0011 โรงงาน A OPRCDN001 โรงงาน B ตับไก่' };

describe('matchesRouteFilter search', () => {
  it('matches everything when search is empty', () => {
    expect(matchesRouteFilter(EMPTY_ROUTE_FILTER, row)).toBe(true);
  });

  it('matches case-insensitively on any part of searchText', () => {
    expect(matchesRouteFilter({ ...EMPTY_ROUTE_FILTER, search: 'oprcd0011' }, row)).toBe(true);
    expect(matchesRouteFilter({ ...EMPTY_ROUTE_FILTER, search: 'โรงงาน B' }, row)).toBe(true);
  });

  it('excludes rows with no match', () => {
    expect(matchesRouteFilter({ ...EMPTY_ROUTE_FILTER, search: 'ไม่มีอยู่จริง' }, row)).toBe(false);
  });

  it('combines with the existing dropdown filters', () => {
    expect(matchesRouteFilter({ ...EMPTY_ROUTE_FILTER, search: 'ตับไก่', productGroup: 'อื่น' }, row)).toBe(false);
    expect(matchesRouteFilter({ ...EMPTY_ROUTE_FILTER, search: 'ตับไก่', productGroup: 'ตับไก่' }, row)).toBe(true);
  });
});
