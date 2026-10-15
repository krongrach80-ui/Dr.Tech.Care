import React, { useState } from 'react';
import { Camera, Trash2, UserCheck, AlertTriangle } from 'lucide-react';
import { Modal } from '../../components/common/Modal';
import { Button } from '../../components/common/Button';
import { BiometricEnrollmentStep } from './BiometricEnrollmentStep';
import { User } from '../../types/schema';
import { api } from '../../lib/api';

export interface BiometricResetModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: User | null;
  onSuccess: () => void;
}

export const BiometricResetModal: React.FC<BiometricResetModalProps> = ({
  isOpen,
  onClose,
  user,
  onSuccess,
}) => {
  if (!user) return null;

  const [isScanning, setIsScanning] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleDeleteEmbedding = async () => {
    if (!confirm(`ยืนยันการลบข้อมูลใบหน้า (Biometrics) ของ ${user.full_name} หรือไม่?`)) {
      return;
    }
    setIsDeleting(true);
    try {
      await api.users.resetBiometrics(user.id);
      alert('ลบข้อมูลชีวมิติเรียบร้อยแล้ว');
      onSuccess();
      onClose();
    } catch (err: any) {
      alert('เกิดข้อผิดพลาด: ' + err?.message);
    } finally {
      setIsDeleting(false);
    }
  };

  const handleEnrollComplete = async (frames: string[], embedding: number[]) => {
    try {
      await api.users.saveBiometrics(user.id, frames, embedding);
      alert('บันทึกข้อมูลสแกนใบหน้าใหม่เรียบร้อยแล้ว');
      onSuccess();
      onClose();
    } catch (err: any) {
      alert('เกิดข้อผิดพลาด: ' + err?.message);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      size="xl"
      title={
        <div className="flex items-center gap-2">
          <Camera className="w-5 h-5 text-emerald-400" />
          <span>จัดการข้อมูลชีวมิติใบหน้า (Face ID Management)</span>
        </div>
      }
      subtitle={`ผู้ใช้งาน: ${user.full_name} (${user.id})`}
    >
      {isScanning ? (
        <BiometricEnrollmentStep
          userId={user.id}
          fullName={user.full_name}
          role={user.role}
          onBack={() => setIsScanning(false)}
          onSkip={onClose}
          onComplete={handleEnrollComplete}
        />
      ) : (
        <div className="space-y-6">
          <div className="p-4 rounded-2xl bg-slate-950/80 border border-slate-800 flex items-center gap-4">
            <div className="w-16 h-16 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-400 shrink-0">
              <UserCheck className="w-8 h-8 text-emerald-400" />
            </div>
            <div>
              <h4 className="text-sm font-bold text-white">{user.full_name}</h4>
              <p className="text-xs text-slate-400">สถานะ Biometrics: <span className="text-emerald-400 font-semibold">{user.face_id_status || 'Registered'}</span></p>
              <p className="text-xs text-slate-500 mt-1">
                การรีเซ็ตข้อมูลชีวมิติจะลบเวกเตอร์ใบหน้าเดิมออกจากระบบ และอนุญาตให้ทำการสแกนใหม่ 10 เฟรม
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="p-4 rounded-xl border border-slate-800 bg-slate-900/60 flex flex-col justify-between space-y-3">
              <div>
                <h5 className="text-sm font-semibold text-white flex items-center gap-2">
                  <Camera className="w-4 h-4 text-emerald-400" />
                  สแกนบันทึกใบหน้าใหม่
                </h5>
                <p className="text-xs text-slate-400 mt-1">
                  เปิดกล้องทำตามขั้นตอน 10-Snap Guide เพื่อบันทึกเวกเตอร์ชุดใหม่
                </p>
              </div>
              <Button
                variant="primary"
                onClick={() => setIsScanning(true)}
                leftIcon={<Camera className="w-4 h-4" />}
              >
                เริ่มสแกนกล้อง 10 เฟรม
              </Button>
            </div>

            <div className="p-4 rounded-xl border border-rose-900/40 bg-rose-950/20 flex flex-col justify-between space-y-3">
              <div>
                <h5 className="text-sm font-semibold text-rose-300 flex items-center gap-2">
                  <Trash2 className="w-4 h-4 text-rose-400" />
                  ลบข้อมูลชีวมิติเดิม
                </h5>
                <p className="text-xs text-slate-400 mt-1">
                  ลบเวกเตอร์ใบหน้าออกจากฐานข้อมูล ผู้ใช้จะไม่สามารถล็อกอินผ่าน Face ID ได้จนกว่าจะลงทะเบียนใหม่
                </p>
              </div>
              <Button
                variant="danger"
                onClick={handleDeleteEmbedding}
                isLoading={isDeleting}
                leftIcon={<Trash2 className="w-4 h-4" />}
              >
                ลบข้อมูลชีวมิติ (Delete Embedding)
              </Button>
            </div>
          </div>

          <div className="flex justify-end pt-3 border-t border-slate-800">
            <Button variant="ghost" onClick={onClose}>
              ปิดหน้าต่าง
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
};
