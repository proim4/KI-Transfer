import { useState } from 'react';
import { useDeleteUser, useUsers } from '../hooks/useUserManagement';
import type { ProfileRow } from '../types/db';
import ConfirmDialog from './ConfirmDialog';
import EditUserDialog from './EditUserDialog';
import RegisterUserDialog from './RegisterUserDialog';

const ROLE_LABEL: Record<string, string> = { admin: 'Admin', user: 'User' };

export default function UserManagementCard() {
  const { data: users, isLoading } = useUsers();
  const deleteUser = useDeleteUser();
  const [showRegister, setShowRegister] = useState(false);
  const [editing, setEditing] = useState<ProfileRow | null>(null);
  const [deleting, setDeleting] = useState<ProfileRow | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  async function handleConfirmDelete() {
    if (!deleting) return;
    try {
      await deleteUser.mutateAsync({ userId: deleting.id });
      setDeleting(null);
      setDeleteError(null);
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'ลบไม่สำเร็จ');
    }
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <div className="mb-1 flex items-center justify-between">
        <div>
          <p className="font-medium text-gray-900">👤 ลงทะเบียนผู้ใช้งาน</p>
          <p className="text-sm text-gray-500">เพิ่มและจัดการบัญชีผู้ใช้งานระบบ</p>
        </div>
        <button
          type="button"
          onClick={() => setShowRegister(true)}
          className="rounded-md bg-navy-800 px-3 py-1.5 text-sm font-medium text-white hover:bg-navy-900"
        >
          + เพิ่มผู้ใช้งาน
        </button>
      </div>

      {isLoading && <p className="mt-4 text-sm text-gray-500">กำลังโหลด...</p>}
      {!isLoading && (users ?? []).length === 0 && (
        <p className="mt-4 text-sm text-gray-500">ยังไม่มีผู้ใช้งานในระบบ</p>
      )}

      {(users ?? []).length > 0 && (
        <div className="mt-4 overflow-auto rounded-md border border-gray-200">
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-50 text-xs uppercase text-gray-500">
              <tr>
                <th className="px-3 py-2">Username</th>
                <th className="px-3 py-2">Role</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {users!.map((u) => (
                <tr key={u.id} className="hover:bg-gray-50">
                  <td className="px-3 py-2 font-medium text-gray-900">{u.username}</td>
                  <td className="px-3 py-2 text-gray-600">{ROLE_LABEL[u.role] ?? u.role}</td>
                  <td className="px-3 py-2">
                    <span
                      className={`inline-flex items-center gap-1 text-xs font-medium ${
                        u.status === 'active' ? 'text-green-700' : 'text-red-700'
                      }`}
                    >
                      <span className={`h-2 w-2 rounded-full ${u.status === 'active' ? 'bg-green-500' : 'bg-red-500'}`} />
                      {u.status === 'active' ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="space-x-2 px-3 py-2">
                    <button type="button" onClick={() => setEditing(u)} className="text-xs font-medium text-blue-600 hover:underline">
                      แก้ไข
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setDeleting(u);
                        setDeleteError(null);
                      }}
                      className="text-xs font-medium text-red-600 hover:underline"
                    >
                      ลบ
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showRegister && <RegisterUserDialog mode="admin" onClose={() => setShowRegister(false)} />}
      {editing && <EditUserDialog user={editing} onClose={() => setEditing(null)} />}
      {deleting && (
        <ConfirmDialog
          title="⚠️ ลบผู้ใช้งาน"
          message={
            deleteError
              ? deleteError
              : `ต้องการลบผู้ใช้งาน "${deleting.username}" หรือไม่?\n\nการดำเนินการนี้ไม่สามารถย้อนกลับได้`
          }
          confirmLabel="ยืนยันการลบ"
          danger
          onConfirm={handleConfirmDelete}
          onCancel={() => setDeleting(null)}
        />
      )}
    </div>
  );
}
