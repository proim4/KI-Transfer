import { describe, expect, it } from 'vitest';
import { EMPTY_ROUTE_FILTER, matchesRouteFilter } from './RouteFilterBar';

const row = { searchText: 'OPRCD0011 โรงงาน A OPRCDN001 โรงงาน B ตับไก่' };

describe('matchesRouteFilter search', () => {
  it('matches everything when search is empty', () => {
    expect(matchesRouteFilter(EMPTY_ROUTE_FILTER, row)).toBe(true);
  });

  it('matches case-insensitively on any part of searchText', () => {
    expect(matchesRouteFilter({ search: 'oprcd0011' }, row)).toBe(true);
    expect(matchesRouteFilter({ search: 'โรงงาน B' }, row)).toBe(true);
  });

  it('excludes rows with no match', () => {
    expect(matchesRouteFilter({ search: 'ไม่มีอยู่จริง' }, row)).toBe(false);
  });
});
