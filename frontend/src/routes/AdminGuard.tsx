import { Navigate, Outlet } from 'react-router-dom';
import { useAppSettings } from '../hooks/useAppSettings';
import { useCurrentUser } from '../hooks/useCurrentUser';

/**
 * Gates /settings to Admins. Deliberately does NOT block when require_login
 * is off (the app's existing "wide open" mode) — otherwise turning
 * require_login off with no one signed in would make Settings, the one
 * screen that can turn it back on, permanently unreachable.
 */
export default function AdminGuard() {
  const { data: settings, isLoading: settingsLoading } = useAppSettings();
  const { isAdmin, loading: userLoading } = useCurrentUser();

  if (settingsLoading || userLoading) {
    return <div className="flex h-screen items-center justify-center text-gray-500">กำลังโหลด...</div>;
  }

  const requireLogin = settings?.require_login ?? true;
  if (requireLogin && !isAdmin) {
    return <Navigate to="/dashboard" replace />;
  }

  return <Outlet />;
}
