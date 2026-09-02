import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAppSettings } from '../hooks/useAppSettings';
import { useSession } from '../hooks/useAuth';

export default function AuthGuard() {
  const { session, loading: sessionLoading } = useSession();
  const { data: settings, isLoading: settingsLoading } = useAppSettings();
  const location = useLocation();

  if (sessionLoading || settingsLoading) {
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

  return <Outlet />;
}
