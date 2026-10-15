import React, { useState } from 'react';
import { Shield, LogIn, UserCheck } from 'lucide-react';
import { Modal } from '../../components/common/Modal';
import { Button } from '../../components/common/Button';
import { api } from '../../lib/api';
import { User } from '../../types/schema';

export interface StaffLoginModalProps {
  isOpen: boolean;
  onClose: () => void;
  onNavigateToStaff: (role: 'admin' | 'pt', user: User) => void;
  onManualPatientSelect?: (patient: User) => void;
}

export const StaffLoginModal: React.FC<StaffLoginModalProps> = ({
  isOpen,
  onClose,
  onNavigateToStaff,
  onManualPatientSelect,
}) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Manual patient selection mode for staff
  const [authenticatedStaff, setAuthenticatedStaff] = useState<User | null>(null);
  const [patientList, setPatientList] = useState<User[]>([]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setErrorMessage(null);

    try {
      const res = await api.auth.login({ username, password, device_type: 'Kiosk' });
      const user = res.user;

      if (user.role === 'patient') {
        setErrorMessage('บัญชีนี้เป็นผู้ป่วย ไม่ใช่บุคลากรทางการแพทย์');
        return;
      }

      setAuthenticatedStaff(user);

      // Load patient list if manual selection is available
      if (onManualPatientSelect) {
        const pRes = await api.patients.list();
        setPatientList(pRes.patients || []);
      } else {
        onNavigateToStaff(user.role as 'admin' | 'pt', user);
        onClose();
      }
    } catch (err: any) {
      setErrorMessage(err?.message || 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDirectNavigation = () => {
    if (!authenticatedStaff) return;
    onNavigateToStaff(authenticatedStaff.role as 'admin' | 'pt', authenticatedStaff);
    onClose();
  };

  const handleSelectPatientToStart = (p: User) => {
    if (onManualPatientSelect) {
      onManualPatientSelect(p);
      onClose();
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      size="md"
      title={
        <div className="flex items-center gap-2">
          <Shield className="w-5 h-5 text-emerald-400" />
          <span>ระบบบุคลากรทางการแพทย์ / รพ. (Staff Portal)</span>
        </div>
      }
      subtitle="เข้าสู่ระบบสำหรับผู้อำนวยการและนักกายภาพบำบัด"
    >
      {errorMessage && (
        <div className="mb-4 p-3 rounded-xl bg-rose-950/80 border border-rose-700 text-rose-300 text-xs">
          {errorMessage}
        </div>
      )}

      {!authenticatedStaff ? (
        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="text-xs text-slate-300 font-medium">ชื่อผู้ใช้งาน (Staff Username) *</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="admin หรือ pt.varisara"
              required
              className="mt-1 w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500"
            />
          </div>

          <div>
            <label className="text-xs text-slate-300 font-medium">รหัสผ่าน (Password) *</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              className="mt-1 w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500"
            />
          </div>

          <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 text-[11px] text-slate-400">
            💡 บัญชีทดสอบเริ่มต้น: <code className="text-emerald-400">admin</code> (ผอ.) หรือ{' '}
            <code className="text-teal-400">pt.varisara</code> (PT) / รหัสผ่าน: <code className="text-white">password123</code>
          </div>

          <div className="flex justify-end gap-3 pt-3 border-t border-slate-800">
            <Button variant="ghost" type="button" onClick={onClose}>
              ยกเลิก
            </Button>
            <Button variant="primary" type="submit" isLoading={isLoading} leftIcon={<LogIn className="w-4 h-4" />}>
              เข้าสู่ระบบ
            </Button>
          </div>
        </form>
      ) : (
        <div className="space-y-4">
          <div className="p-3 rounded-xl bg-emerald-950/60 border border-emerald-700/60 text-xs text-emerald-200">
            เข้าสู่ระบบสำเร็จในฐานะ: <strong>{authenticatedStaff.full_name}</strong> ({authenticatedStaff.role.toUpperCase()})
          </div>

          <div className="space-y-2">
            <Button variant="primary" className="w-full justify-center" onClick={handleDirectNavigation}>
              ไปที่แดชบอร์ด ({authenticatedStaff.role === 'admin' ? 'Super Admin Dashboard' : 'PT Workspace'}) ➔
            </Button>
          </div>

          {onManualPatientSelect && patientList.length > 0 && (
            <div className="pt-3 border-t border-slate-800 space-y-2">
              <span className="text-xs font-semibold uppercase text-slate-400 block">
                หรือเลือกผู้ป่วยเพื่อเริ่มเซสชัน Kiosk ทันที:
              </span>
              <div className="max-h-48 overflow-y-auto divide-y divide-slate-800 border border-slate-800 rounded-xl">
                {patientList.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => handleSelectPatientToStart(p)}
                    className="w-full p-2.5 text-left text-xs text-slate-300 hover:bg-slate-800 flex items-center justify-between"
                  >
                    <span>{p.full_name} ({p.id})</span>
                    <span className="text-[10px] text-emerald-400">เลือกเริ่มฝึก ➔</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
};
