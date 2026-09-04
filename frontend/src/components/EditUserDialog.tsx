import { useState } from 'react';
import { useUpdateUser } from '../hooks/useUserManagement';
import type { ProfileRow, UserRole, UserStatus } from '../types/db';
import PasswordInput from './PasswordInput';

interface EditUserDialogProps {
  user: ProfileRow;
  onClose: () => void;
}

const selectClass = 'w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900';
const labelClass = 'mb-1 block text-sm text-gray-600';

export default function EditUserDialog({ user, onClose }: EditUserDialogProps) {
  const [role, setRole] = useState<UserRole>(user.role);
  const [status, setStatus] = useState<UserStatus>(user.status);
  const [newPassword, setNewPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const updateUser = useUpdateUser();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (newPassword && newPassword.length < 8) {
      setError('Password ใหม่ต้องมีความยาวอย่างน้อย 8 ตัวอักษร');
      return;
    }
    setError(null);
    try {
      await updateUser.mutateAsync({
        userId: user.id,
        role,
        status,
        ...(newPassword ? { password: newPassword } : {}),
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'บันทึกไม่สำเร็จ');
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <form onSubmit={handleSubmit} className="w-full max-w-sm rounded-lg bg-white p-5 shadow-xl">
        <h2 className="mb-4 text-base font-semibold text-gray-900">แก้ไขผู้ใช้งาน</h2>

        <label className={labelClass}>Username</label>
        <input
          value={user.username}
          disabled
          className="mb-3 w-full rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-500"
        />

        <div className="mb-3 grid grid-cols-2 gap-2">
          <div>
            <label className={labelClass}>Role</label>
            <select value={role} onChange={(e) => setRole(e.target.value as UserRole)} className={selectClass}>
              <option value="user">User</option>
              <option value="admin">Admin</option>
            </select>
          </div>
          <div>
            <label className={labelClass}>Status</label>
            <select value={status} onChange={(e) => setStatus(e.target.value as UserStatus)} className={selectClass}>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </div>
        </div>

        <label className={labelClass}>Password ใหม่ (ไม่จำเป็น)</label>
        <div className="mb-3">
          <PasswordInput
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            autoComplete="new-password"
            placeholder="เว้นว่างไว้หากไม่ต้องการเปลี่ยน"
          />
        </div>

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
            disabled={updateUser.isPending}
            className="rounded-md bg-navy-800 px-3 py-1.5 text-sm font-medium text-white hover:bg-navy-900 disabled:opacity-50"
          >
            {updateUser.isPending ? 'กำลังบันทึก...' : 'บันทึก'}
          </button>
        </div>
      </form>
    </div>
  );
}
