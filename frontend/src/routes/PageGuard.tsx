import { Navigate, Outlet } from 'react-router-dom';
import { usePageAccess } from '../hooks/usePageAccess';
import type { PageArea } from '../lib/pageAccess';

/** Sends a user without access to this page area back to the product picker, which only lists what they may open. */
export default function PageGuard({ area }: { area: PageArea }) {
  const { loading, can } = usePageAccess();
  if (loading) return <div className="flex h-screen items-center justify-center text-gray-500">กำลังโหลด...</div>;
  if (!can(area)) return <Navigate to="/" replace />;
  return <Outlet />;
}
