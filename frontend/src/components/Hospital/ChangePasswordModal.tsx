import React, { useState, useEffect } from 'react';
import {
  X,
  Lock,
  KeyRound,
  Eye,
  EyeOff,
  RefreshCw,
  AlertCircle,
  Check,
} from 'lucide-react';
import { UserAccount } from '../../types/hospital';
import { generateSecureTemporaryPassword, validatePasswordStrength } from '../../services/authSecurityService';

interface ChangePasswordModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: UserAccount | null;
  onSavePassword: (userId: number | string, newPassword: string) => void;
  onSuccessToast: (msg: string) => void;
}

export const ChangePasswordModal: React.FC<ChangePasswordModalProps> = ({
  isOpen,
  onClose,
  user,
  onSavePassword,
  onSuccessToast,
}) => {
  const [password, setPassword] = useState<string>('');
  const [confirmPassword, setConfirmPassword] = useState<string>('');
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState<boolean>(false);
  const [errors, setErrors] = useState<{ password?: string; confirmPassword?: string }>({});
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  useEffect(() => {
    if (isOpen && user) {
      setPassword('');
      setConfirmPassword('');
      setShowPassword(false);
      setShowConfirmPassword(false);
      setErrors({});
      setIsSubmitting(false);
    }
  }, [isOpen, user]);

  if (!isOpen || !user) return null;

  // Auto-generate strong secure password helper (10+ characters)
  const handleAutoGeneratePin = () => {
    const strongPass = generateSecureTemporaryPassword();
    setPassword(strongPass);
    setConfirmPassword(strongPass);
    setErrors({});
  };

  const validate = (): boolean => {
    const newErrors: typeof errors = {};
    const validation = validatePasswordStrength(password);
    if (!validation.isValid) {
      newErrors.password = validation.message;
    }

    if (!confirmPassword.trim()) {
      newErrors.confirmPassword = 'กรุณายืนยันรหัสผ่านใหม่';
    } else if (confirmPassword !== password) {
      newErrors.confirmPassword = 'ยืนยันรหัสผ่านไม่ตรงกับรหัสผ่านใหม่';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    setIsSubmitting(true);
    onSavePassword(user.id, password.trim());
    onSuccessToast(`เปลี่ยนรหัสผ่านของ ${user.name} เรียบร้อยแล้ว`);
    setIsSubmitting(false);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-[#0F2F2B]/70 backdrop-blur-sm animate-fadeIn"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md bg-white rounded-[28px] sm:rounded-3xl shadow-2xl border border-emerald-200 overflow-hidden flex flex-col animate-slideUp"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-emerald-100 bg-gradient-to-r from-emerald-50/80 via-white to-emerald-50/40 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-[#10B981] text-white flex items-center justify-center shadow-md shadow-emerald-500/20">
              <KeyRound className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-extrabold text-base text-[#0F2F2B]">
                เปลี่ยนรหัสผ่าน
              </h3>
              <p className="text-[11px] text-emerald-800 font-medium">
                สำหรับ: <strong className="font-bold text-[#0F2F2B]">{user.name}</strong> ({user.code})
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-full text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition cursor-pointer"
            aria-label="ปิดหน้าต่าง"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4 text-xs">
          {/* Quick Generate Buttons */}
          <div className="flex items-center gap-2 p-1.5 bg-stone-50 rounded-2xl border border-stone-200">
            <button
              type="button"
              onClick={handleAutoGeneratePin}
              className="w-full py-2 px-3 rounded-xl bg-white hover:bg-emerald-50 text-emerald-800 font-bold border border-slate-200 hover:border-emerald-300 transition flex items-center justify-center gap-1.5 cursor-pointer shadow-xs"
            >
              <RefreshCw className="w-3.5 h-3.5 text-emerald-600" />
              <span>สุ่มรหัสผ่านปลอดภัยชั่วคราว (11 หลัก)</span>
            </button>
          </div>

          {/* Security Notice */}
          <div className="p-2.5 rounded-xl bg-emerald-50 border border-emerald-200 text-[11px] text-emerald-900 font-medium">
            🛡️ ระบบจัดเก็บรหัสผ่านเป็นค่าแฮช SHA-256 เท่านั้น และบังคับความยาวอย่างน้อย 8 ตัวอักษร
          </div>

          {/* New Password */}
          <div>
            <label className="block font-bold text-slate-700 mb-1">
              รหัสผ่านใหม่ (อย่างน้อย 8 ตัวอักษร แนะนำ 10 ตัวขึ้นไป) <span className="text-rose-500">*</span>:
            </label>
            <div className="relative">
              <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  if (errors.password) setErrors((prev) => ({ ...prev, password: undefined }));
                }}
                placeholder="กรอกรหัสผ่านใหม่อย่างน้อย 8 ตัวอักษร"
                className={`w-full pl-9 pr-9 py-2.5 rounded-2xl bg-white border text-xs font-mono font-bold text-[#0F2F2B] outline-none transition ${
                  errors.password
                    ? 'border-rose-400 ring-2 ring-rose-100'
                    : 'border-slate-200 focus:border-[#10B981] focus:ring-2 focus:ring-emerald-100'
                }`}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              </button>
            </div>
            {errors.password && (
              <p className="text-[11px] text-rose-600 font-semibold mt-1 flex items-center gap-1">
                <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
                <span>{errors.password}</span>
              </p>
            )}
          </div>

          {/* Confirm New Password */}
          <div>
            <label className="block font-bold text-slate-700 mb-1">
              ยืนยันรหัสผ่านใหม่ <span className="text-rose-500">*</span>:
            </label>
            <div className="relative">
              <KeyRound className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type={showConfirmPassword ? 'text' : 'password'}
                value={confirmPassword}
                onChange={(e) => {
                  setConfirmPassword(e.target.value);
                  if (errors.confirmPassword)
                    setErrors((prev) => ({ ...prev, confirmPassword: undefined }));
                }}
                placeholder="กรอกรหัสผ่านใหม่อีกครั้งให้ตรงกัน"
                className={`w-full pl-9 pr-9 py-2.5 rounded-2xl bg-white border text-xs font-mono font-bold text-[#0F2F2B] outline-none transition ${
                  errors.confirmPassword
                    ? 'border-rose-400 ring-2 ring-rose-100'
                    : 'border-slate-200 focus:border-[#10B981] focus:ring-2 focus:ring-emerald-100'
                }`}
              />
              <button
                type="button"
                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                {showConfirmPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              </button>
            </div>
            {errors.confirmPassword && (
              <p className="text-[11px] text-rose-600 font-semibold mt-1 flex items-center gap-1">
                <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
                <span>{errors.confirmPassword}</span>
              </p>
            )}
          </div>

          {/* Footer */}
          <div className="pt-3 border-t border-emerald-100 flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2.5 rounded-full border border-slate-300 text-slate-700 font-bold hover:bg-slate-100 transition active:scale-95 cursor-pointer"
            >
              ยกเลิก
            </button>

            <button
              type="submit"
              disabled={isSubmitting}
              className="px-6 py-2.5 rounded-full bg-gradient-to-r from-[#10B981] to-[#059669] hover:brightness-105 text-white font-bold shadow-md shadow-emerald-500/20 transition active:scale-95 flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              <Check className="w-4 h-4" />
              <span>{isSubmitting ? 'กำลังบันทึก...' : 'บันทึกรหัสผ่าน'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
