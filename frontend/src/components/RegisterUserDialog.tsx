import { useState } from 'react';
import { useBootstrapAdmin, useCreateUser } from '../hooks/useUserManagement';
import { normalizeUsername } from '../lib/username';
import { ALL_PAGE_ACCESS, toRoleAndAccess, type PageArea } from '../lib/pageAccess';
import type { UserStatus } from '../types/db';
import PageAccessField from './PageAccessField';
import PasswordInput from './PasswordInput';

interface RegisterUserDialogProps {
  /** bootstrap: no session yet, creates the first Admin. admin: normal in-Settings registration by a logged-in Admin. */
  mode: 'bootstrap' | 'admin';
  onClose: () => void;
  onRegistered?: () => void;
}

const selectClass = 'w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900';
const labelClass = 'mb-1 block text-sm text-gray-600';
const inputClass = 'mb-3 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900';

export default function RegisterUserDialog({ mode, onClose, onRegistered }: RegisterUserDialogProps) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [areas, setAreas] = useState<Set<PageArea>>(() => new Set<PageArea>(ALL_PAGE_ACCESS));
  const [status, setStatus] = useState<UserStatus>('active');
  const [error, setError] = useState<string | null>(null);

  const bootstrap = useBootstrapAdmin();
  const create = useCreateUser();
  const mutation = mode === 'bootstrap' ? bootstrap : create;

  function validate(): string | null {
    const normalized = normalizeUsername(username);
    if (!username.trim()) return 'กรุณากรอก Username';
    if (!normalized) return 'Username ต้องเป็นตัวอักษรภาษาอังกฤษ ตัวเลข หรือ _ เท่านั้น ห้ามมีช่องว่าง';
    if (!password) return 'กรุณากรอก Password';
    if (password.length < 8) return 'Password ต้องมีความยาวอย่างน้อย 8 ตัวอักษร';
    if (!confirmPassword) return 'กรุณายืนยัน Password';
    if (password !== confirmPassword) return 'Password ไม่ตรงกัน กรุณาตรวจสอบอีกครั้ง';
    return null;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }
    setError(null);
    const normalized = normalizeUsername(username)!;
    try {
      if (mode === 'bootstrap') {
        await bootstrap.mutateAsync({ username: normalized, password });
      } else {
        await create.mutateAsync({ username: normalized, password, status, ...toRoleAndAccess(areas) });
      }
      onRegistered?.();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'ลงทะเบียนไม่สำเร็จ');
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <form onSubmit={handleSubmit} className="w-full max-w-sm rounded-lg bg-white p-5 shadow-xl">
        <h2 className="mb-4 text-base font-semibold text-gray-900">ลงทะเบียนผู้ใช้งาน</h2>

        <label className={labelClass}>Username</label>
        <input
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          className={inputClass}
          autoFocus
          autoComplete="username"
        />

        <label className={labelClass}>Password</label>
        <div className="mb-3">
          <PasswordInput value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" />
        </div>

        <label className={labelClass}>ยืนยัน Password</label>
        <div className="mb-3">
          <PasswordInput
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            autoComplete="new-password"
          />
        </div>

        {mode === 'admin' && (
          <>
            <PageAccessField value={areas} onChange={setAreas} />
            <div className="mb-3">
              <label className={labelClass}>Status</label>
              <select value={status} onChange={(e) => setStatus(e.target.value as UserStatus)} className={selectClass}>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </div>
          </>
        )}

        {error && <p className="mb-3 text-sm text-red-600">{error}</p>}

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
          >
            ยกเลิก
          </button>
          <button
            type="submit"
            disabled={mutation.isPending}
            className="rounded-md bg-navy-800 px-3 py-1.5 text-sm font-medium text-white hover:bg-navy-900 disabled:opacity-50"
          >
            {mutation.isPending ? 'กำลังลงทะเบียน...' : 'ลงทะเบียน'}
          </button>
        </div>
      </form>
    </div>
  );
}
