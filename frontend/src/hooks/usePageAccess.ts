import { useAppSettings } from './useAppSettings';
import { useCurrentUser } from './useCurrentUser';
import { areasOf, type PageArea } from '../lib/pageAccess';

/**
 * Which page areas the current viewer may open. While require_login is off
 * the app is deliberately open to everyone (same as can_access_product()),
 * so every area is allowed.
 */
export function usePageAccess() {
  const { profile, loading } = useCurrentUser();
  const { data: settings, isLoading: settingsLoading } = useAppSettings();
  const requireLogin = settings?.require_login ?? true;
  const areas = !requireLogin ? null : profile ? areasOf(profile.role, profile.page_access) : new Set<PageArea>();

  return {
    loading: loading || settingsLoading,
    can: (area: PageArea) => areas === null || areas.has(area),
  };
}
