import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAppSettings } from '../hooks/useAppSettings';
import { useCurrentUser } from '../hooks/useCurrentUser';
import { supabase } from '../lib/supabase';

export default function AuthGuard() {
  const { session, profile, loading: userLoading } = useCurrentUser();
  const { data: settings, isLoading: settingsLoading } = useAppSettings();
  const location = useLocation();

  if (userLoading || settingsLoading) {
    return (
      <div className="flex h-screen items-center justify-center text-gray-500">
        กำลังโหลด...
      </div>
    );
  }

  const requireLogin = settings?.require_login ?? true;
  if (requireLogin && !session) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  // An admin can deactivate someone mid-session — this catches it on the
  // next navigation rather than trusting the one-time check at Login.
  if (requireLogin && session && profile?.status === 'inactive') {
    supabase.auth.signOut();
    return <Navigate to="/login" replace state={{ from: location, reason: 'inactive' }} />;
  }

  return <Outlet />;
}
