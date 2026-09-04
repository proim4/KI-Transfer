import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import PasswordInput from '../components/PasswordInput';
import RegisterUserDialog from '../components/RegisterUserDialog';
import { supabase } from '../lib/supabase';
import { usernameToEmail } from '../lib/username';

export default function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [hasAnyAdmin, setHasAnyAdmin] = useState<boolean | null>(null);
  const [showBootstrap, setShowBootstrap] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    supabase.rpc('has_any_admin').then(({ data }) => setHasAnyAdmin(Boolean(data)));
  }, []);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);

    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: usernameToEmail(username.trim().toLowerCase()),
      password,
    });
    if (signInError) {
      setLoading(false);
      setError('เข้าสู่ระบบไม่สำเร็จ: Username หรือรหัสผ่านไม่ถูกต้อง');
      return;
    }

    const { data: userData } = await supabase.auth.getUser();
    const { data: profile } = await supabase.from('profiles').select('status').eq('id', userData.user!.id).maybeSingle();
    if (!profile || profile.status === 'inactive') {
      await supabase.auth.signOut();
      setLoading(false);
      setError(!profile ? 'ไม่พบบัญชีผู้ใช้งานนี้ในระบบ' : 'บัญชีนี้ถูกระงับการใช้งาน กรุณาติดต่อผู้ดูแลระบบ');
      return;
    }

    setLoading(false);
    const from = (location.state as { from?: Location })?.from?.pathname ?? '/';
    navigate(from, { replace: true });
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50">
      <form onSubmit={handleSubmit} className="w-full max-w-sm rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
        <h1 className="mb-4 text-lg font-semibold text-gray-900">Tracking โอนเทียบแผน</h1>
        <label className="mb-1 block text-sm text-gray-600">Username</label>
        <input
          required
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          autoComplete="username"
          className="mb-3 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900"
        />
        <label className="mb-1 block text-sm text-gray-600">Password</label>
        <div className="mb-4">
          <PasswordInput
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
          />
        </div>
        {error && <p className="mb-3 text-sm text-red-600">{error}</p>}
        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-md bg-navy-800 px-3 py-2 text-sm font-medium text-white hover:bg-navy-900 disabled:opacity-50"
        >
          {loading ? 'กำลังเข้าสู่ระบบ...' : 'Login'}
        </button>

        {hasAnyAdmin === false && (
          <button
            type="button"
            onClick={() => setShowBootstrap(true)}
            className="mt-3 w-full text-center text-xs text-blue-600 hover:underline"
          >
            ยังไม่มีผู้ใช้งานในระบบ? ลงทะเบียนผู้ดูแลระบบคนแรก
          </button>
        )}
      </form>

      {showBootstrap && (
        <RegisterUserDialog
          mode="bootstrap"
          onClose={() => setShowBootstrap(false)}
          onRegistered={() => setHasAnyAdmin(true)}
        />
      )}
    </div>
  );
}
