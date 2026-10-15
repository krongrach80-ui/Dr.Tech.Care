import React, { useState } from 'react';
import { User, Shield } from 'lucide-react';
import { Modal } from '../../components/common/Modal';
import { Button } from '../../components/common/Button';
import { User as UserType } from '../../types/schema';
import { api } from '../../lib/api';

export interface EditAccountModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: UserType | null;
  onSuccess: (updated: UserType) => void;
  actorRole: 'admin' | 'pt';
}

export const EditAccountModal: React.FC<EditAccountModalProps> = ({
  isOpen,
  onClose,
  user,
  onSuccess,
  actorRole,
}) => {
  if (!user) return null;

  const [fullName, setFullName] = useState(user.full_name);
  const [phone, setPhone] = useState(user.phone || '-');
  const [email, setEmail] = useState(user.email || '-');
  const [status, setStatus] = useState<'active' | 'disabled'>(user.status);
  const [newPassword, setNewPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      const res = await api.users.update(user.id, {
        full_name: fullName,
        phone,
        email,
        status,
      });

      // If password was entered, reset it
      if (newPassword.trim()) {
        await api.users.resetPassword(user.id, newPassword.trim());
      }

      onSuccess(res.user);
      onClose();
    } catch (err: any) {
      setErrorMessage(err?.message || 'ไม่สามารถแก้ไขข้อมูลบัญชีได้');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      size="md"
      title={
        <div className="flex items-center gap-2">
          <User className="w-5 h-5 text-emerald-400" />
          <span>แก้ไขบัญชีผู้ใช้งาน ({user.id})</span>
        </div>
      }
      subtitle={`ชื่อเดิม: ${user.full_name} (${user.role.toUpperCase()})`}
    >
      {errorMessage && (
        <div className="mb-4 p-3 rounded-xl bg-rose-950/80 border border-rose-700 text-rose-300 text-xs">
          {errorMessage}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="text-xs text-slate-300 font-medium">ชื่อ-นามสกุล (Full Name) *</label>
          <input
            type="text"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            required
            className="mt-1 w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-slate-300 font-medium">เบอร์โทรศัพท์ (Phone)</label>
            <input
              type="text"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="mt-1 w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500"
            />
          </div>
          <div>
            <label className="text-xs text-slate-300 font-medium">อีเมล (Email)</label>
            <input
              type="text"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500"
            />
          </div>
        </div>

        <div>
          <label className="text-xs text-slate-300 font-medium">
            รีเซ็ตรหัสผ่านใหม่ (Reset Password - เว้นว่างหากไม่เปลี่ยน)
          </label>
          <input
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            placeholder="รหัสผ่านใหม่อย่างน้อย 6 ตัวอักษร"
            className="mt-1 w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500"
          />
        </div>

        <div className="pt-2">
          <label className="text-xs text-slate-300 font-medium block mb-1.5">สถานะการใช้งานบัญชี (Status)</label>
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
              <input
                type="radio"
                name="status"
                value="active"
                checked={status === 'active'}
                onChange={() => setStatus('active')}
                className="text-emerald-500 focus:ring-emerald-500"
              />
              <span className="text-emerald-400 font-medium">เปิดใช้งาน (Active)</span>
            </label>
            <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
              <input
                type="radio"
                name="status"
                value="disabled"
                checked={status === 'disabled'}
                onChange={() => setStatus('disabled')}
                className="text-rose-500 focus:ring-rose-500"
              />
              <span className="text-rose-400 font-medium">ระงับการใช้งาน (Disabled)</span>
            </label>
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-800">
          <Button variant="ghost" type="button" onClick={onClose}>
            ยกเลิก
          </Button>
          <Button variant="primary" type="submit" isLoading={isSubmitting}>
            บันทึกการแก้ไข
          </Button>
        </div>
      </form>
    </Modal>
  );
};
