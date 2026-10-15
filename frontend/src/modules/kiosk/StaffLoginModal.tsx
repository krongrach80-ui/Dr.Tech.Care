import React, { useState, useEffect, useRef } from 'react';
import { Shield, LogIn, Settings, ArrowLeft, Clock } from 'lucide-react';
import { Modal } from '../../components/common/Modal';
import { Button } from '../../components/common/Button';
import { api } from '../../lib/api';
import { User } from '../../types/schema';

export interface StaffLoginModalProps {
  isOpen: boolean;
  onClose: () => void;
  onNavigateToStaff: (role: 'admin' | 'pt', user: User) => void;
  onManualPatientSelect?: (patient: User, staffUser: User) => void;
  onOpenKioskSettings?: () => void;
}

/**
 * Staff Login & Assistance Portal (v2.1)
 * Accessible via [🛡️ ระบบบุคลากร / รพ.]
 * Features 5-minute auto-expiry idle timeout and [กลับหน้าตู้] action.
 */
export const StaffLoginModal: React.FC<StaffLoginModalProps> = ({
  isOpen,
  onClose,
  onNavigateToStaff,
  onManualPatientSelect,
  onOpenKioskSettings,
}) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Manual patient selection mode for staff
  const [authenticatedStaff, setAuthenticatedStaff] = useState<User | null>(null);
  const [patientList, setPatientList] = useState<User[]>([]);
  const [idleSecondsLeft, setIdleSecondsLeft] = useState<number>(300); // 5 minutes default
  const idleTimerRef = useRef<number | null>(null);

  // 5-minute Staff Idle Timeout
  useEffect(() => {
    if (!isOpen || !authenticatedStaff) {
      if (idleTimerRef.current) clearInterval(idleTimerRef.current);
      return;
    }

    setIdleSecondsLeft(300);
    idleTimerRef.current = window.setInterval(() => {
      setIdleSecondsLeft((prev) => {
        if (prev <= 1) {
          if (idleTimerRef.current) clearInterval(idleTimerRef.current);
          handleLogoutAndReturn();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (idleTimerRef.current) clearInterval(idleTimerRef.current);
    };
  }, [isOpen, authenticatedStaff]);

  const handleLogoutAndReturn = () => {
    setAuthenticatedStaff(null);
    setUsername('');
    setPassword('');
    onClose();
  };

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
    if (onManualPatientSelect && authenticatedStaff) {
      onManualPatientSelect(p, authenticatedStaff);
      onClose();
    }
  };

  const formatIdleTime = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleLogoutAndReturn}
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
              placeholder="admin หรือ pt_somchai"
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

          <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 text-[11px] text-slate-400 space-y-1">
            <div>💡 <strong>Super Admin:</strong> <code className="text-emerald-400">admin</code> / <code className="text-slate-300">admin1234</code></div>
            <div>💡 <strong>Physiotherapist:</strong> <code className="text-teal-400">pt_somchai</code> / <code className="text-slate-300">pt123456</code></div>
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
          <div className="flex items-center justify-between p-3 rounded-xl bg-emerald-950/60 border border-emerald-700/60 text-xs text-emerald-200">
            <div>
              เจ้าหน้าที่: <strong>{authenticatedStaff.full_name}</strong> ({authenticatedStaff.role.toUpperCase()})
            </div>
            <div className="flex items-center gap-1 text-[11px] font-mono text-emerald-300 bg-emerald-900/60 px-2 py-0.5 rounded-full">
              <Clock className="w-3 h-3" />
              <span>หมดอายุ: {formatIdleTime(idleSecondsLeft)}</span>
            </div>
          </div>

          {/* Quick Staff Actions */}
          <div className="grid grid-cols-2 gap-2">
            <Button
              variant="secondary"
              size="sm"
              className="justify-center"
              onClick={handleDirectNavigation}
            >
              ไปแดชบอร์ด ({authenticatedStaff.role === 'admin' ? 'Admin' : 'PT'}) ➔
            </Button>

            {onOpenKioskSettings && (
              <Button
                variant="secondary"
                size="sm"
                className="justify-center"
                leftIcon={<Settings className="w-3.5 h-3.5 text-cyan-400" />}
                onClick={() => {
                  onClose();
                  onOpenKioskSettings();
                }}
              >
                ตั้งค่าฮาร์ดแวร์ตู้
              </Button>
            )}
          </div>

          {/* Manual Patient Selection */}
          {patientList.length > 0 && (
            <div className="pt-3 border-t border-slate-800 space-y-2">
              <span className="text-xs font-semibold uppercase text-slate-400 block">
                เลือกผู้ป่วยเพื่อเปิดเซสชันช่วยเหลือ (Assisted Session):
              </span>
              <div className="max-h-44 overflow-y-auto divide-y divide-slate-800 border border-slate-800 rounded-xl bg-slate-950/60">
                {patientList.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => handleSelectPatientToStart(p)}
                    className="w-full p-2.5 text-left text-xs text-slate-300 hover:bg-slate-800 flex items-center justify-between transition-colors"
                  >
                    <div>
                      <span className="font-semibold text-white block">{p.full_name}</span>
                      <span className="text-[10px] text-slate-400 font-mono">HN: {p.id}</span>
                    </div>
                    <span className="text-[11px] text-emerald-400 font-medium">เริ่มฝึกให้ ➔</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Return to Kiosk Standby */}
          <div className="pt-2 border-t border-slate-800 flex justify-between items-center">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleLogoutAndReturn}
              leftIcon={<ArrowLeft className="w-3.5 h-3.5" />}
            >
              กลับหน้าตู้ (STANDBY)
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
};
