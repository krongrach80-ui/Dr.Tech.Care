import React, { useState } from 'react';
import {
  X,
  Trash2,
  AlertTriangle,
  User,
  Shield,
  Stethoscope,
} from 'lucide-react';
import { UserAccount, UserRole } from '../../types/hospital';

interface DeleteUserModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: UserAccount | null;
  currentRole: UserRole;
  currentUserId: number | string;
  onConfirmDelete: (userId: number | string) => void;
  onSuccessToast: (msg: string) => void;
}

export const DeleteUserModal: React.FC<DeleteUserModalProps> = ({
  isOpen,
  onClose,
  user,
  currentRole,
  currentUserId,
  onConfirmDelete,
  onSuccessToast,
}) => {
  const [isDeleting, setIsDeleting] = useState<boolean>(false);

  if (!isOpen || !user) return null;

  const isSelf = user.id === currentUserId;

  const handleConfirm = () => {
    if (isSelf) return;
    setIsDeleting(true);
    onConfirmDelete(user.id);
    onSuccessToast(`ลบบัญชีของ ${user.name} เรียบร้อยแล้ว`);
    setIsDeleting(false);
    onClose();
  };

  const getRoleBadge = (role: UserRole) => {
    switch (role) {
      case 'patient':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-100 text-emerald-800 text-xs font-bold border border-emerald-200">
            <User className="w-3.5 h-3.5" />
            <span>คนไข้ (Patient)</span>
          </span>
        );
      case 'therapist':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#0F2F2B] text-emerald-300 text-xs font-bold border border-emerald-900">
            <Stethoscope className="w-3.5 h-3.5" />
            <span>นักกายภาพ (Physiotherapist)</span>
          </span>
        );
      case 'admin':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-100 text-amber-900 text-xs font-bold border border-amber-300">
            <Shield className="w-3.5 h-3.5" />
            <span>แอดมินใหญ่ (Admin)</span>
          </span>
        );
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-[#0F2F2B]/70 backdrop-blur-sm animate-fadeIn"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md bg-white rounded-[28px] sm:rounded-3xl shadow-2xl border border-rose-200 overflow-hidden flex flex-col animate-slideUp text-center"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header Bar */}
        <div className="px-6 py-4 border-b border-rose-100 bg-gradient-to-r from-rose-50/70 via-white to-rose-50/40 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-2 text-rose-800 font-bold text-sm">
            <AlertTriangle className="w-4 h-4 text-rose-600" />
            <span>ยืนยันการลบบัญชีผู้ใช้งาน</span>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-full text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition cursor-pointer"
            aria-label="ปิดหน้าต่าง"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 sm:p-7 space-y-4">
          <div className="w-14 h-14 rounded-3xl bg-rose-100 text-rose-600 mx-auto flex items-center justify-center shadow-inner shadow-rose-200/50">
            <Trash2 className="w-7 h-7" />
          </div>

          <div>
            <h3 className="font-extrabold text-base sm:text-lg text-[#0F2F2B]">
              ยืนยันการลบบัญชีและเวชระเบียนถาวร
            </h3>
            <p className="text-xs text-slate-600 mt-2 leading-relaxed">
              คุณต้องการลบบัญชีของ <strong className="text-slate-900 font-bold">{user.name}</strong> ({user.code}) ใช่หรือไม่?
            </p>
            <p className="text-[11px] text-rose-600 font-semibold mt-1">
              ⚠️ การลบนี้มีผลถาวร (Strict Permanent): ลบโฟลเดอร์ไฟล์ภาพ <code>public/uploads/patients/{user.code}/</code> และตัดข้อมูลออกจากฐานข้อมูลหลัก <code>patients.json</code> ทันที การรีเฟรชหน้าเว็บจะไม่กู้คืนข้อมูลกลับมา
            </p>
          </div>

          {/* User Details Preview Box */}
          <div className="p-3.5 rounded-2xl bg-stone-50 border border-stone-200/80 text-xs text-left space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-slate-500 font-medium">รหัสประจำตัว (HN):</span>
              <span className="font-mono font-bold text-emerald-800">{user.code}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-500 font-medium">ชื่อผู้ใช้งาน:</span>
              <span className="font-mono font-bold text-slate-800">@{user.username}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-500 font-medium">ไดเรกทอรีที่ถูกลบ:</span>
              <span className="font-mono text-[10px] text-rose-700 bg-rose-50 px-2 py-0.5 rounded border border-rose-200 font-semibold truncate max-w-[200px]">
                /public/uploads/patients/{user.code}/
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-500 font-medium">บทบาทในระบบ:</span>
              <div>{getRoleBadge(user.role)}</div>
            </div>
            {user.role === 'patient' && user.assignedTherapistName && (
              <div className="flex items-center justify-between pt-1 border-t border-stone-200/60">
                <span className="text-slate-500 font-medium">ผู้รับผิดชอบ:</span>
                <span className="font-bold text-slate-700">{user.assignedTherapistName}</span>
              </div>
            )}
          </div>

          {/* Self-delete Warning */}
          {isSelf && (
            <div className="p-3 rounded-2xl bg-amber-50 border border-amber-200 text-amber-900 text-xs font-bold flex items-center gap-2 text-left">
              <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0" />
              <span>ไม่สามารถลบบัญชีของตนเองที่กำลังล็อกอินใช้งานอยู่ในขณะนี้ได้</span>
            </div>
          )}

          {/* Footer Actions */}
          <div className="flex items-center gap-2.5 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 rounded-full border border-slate-300 text-slate-700 font-bold hover:bg-slate-100 transition active:scale-95 cursor-pointer text-xs"
            >
              ยกเลิก
            </button>

            <button
              type="button"
              onClick={handleConfirm}
              disabled={isSelf || isDeleting}
              className="flex-1 py-2.5 rounded-full bg-rose-600 hover:bg-rose-700 active:scale-95 text-white font-bold shadow-md shadow-rose-600/20 transition flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed text-xs"
            >
              <Trash2 className="w-4 h-4" />
              <span>{isDeleting ? 'กำลังลบ...' : 'ลบบัญชี'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
