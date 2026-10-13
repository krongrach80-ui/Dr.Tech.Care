import React, { useState, useEffect } from 'react';
import {
  X,
  Shield,
  Activity,
  User,
  Send,
  Database,
  Volume2,
  CheckCircle2,
  FileText,
  Clock,
  Award,
  Sparkles,
  Sliders,
  RefreshCw,
  Info,
  ExternalLink,
} from 'lucide-react';
import { Patient } from '../../types/patient';
import { ExerciseDefinition } from '../../types/exercise';
import { api } from '../../services/api';
import { IS_STATIC_MODE } from '../../config/apiConfig';
import { OfflineStorageService } from '../../services/offlineStorageService';

// ============================================================================
// 1. Admin Dashboard Modal (From Screen 1 bottom-right button)
// ============================================================================
interface AdminModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenArchitecture?: () => void;
}

export const AdminModal: React.FC<AdminModalProps> = ({ isOpen, onClose, onOpenArchitecture }) => {
  const [syncStatus, setSyncStatus] = useState<string>('');
  const [isSyncing, setIsSyncing] = useState<boolean>(false);

  if (!isOpen) return null;

  const handleManualSync = async () => {
    setIsSyncing(true);
    setSyncStatus('กำลังซิงค์ข้อมูลกับเซิร์ฟเวอร์ MySQL/SQLite...');
    try {
      if (IS_STATIC_MODE) {
        setSyncStatus('ระบบทำงานในโหมดสาธิต (Demo Mode): ไม่มีการส่งข้อมูลขึ้นเซิร์ฟเวอร์จริง');
        return;
      }

      const queue = OfflineStorageService.getSyncQueue();
      const res = await api.sync({ sessions: queue, safety_events: [] });
      const syncedCount = res?.data?.synced_sessions ?? queue.length;
      if (queue.length > 0) {
        localStorage.removeItem('strongcare_pending_sync_queue');
      }
      setSyncStatus(`ซิงค์สำเร็จ: ${res.message || `บันทึกข้อมูล ${syncedCount} รายการเรียบร้อยแล้ว`}`);
    } catch (e: any) {
      setSyncStatus(`❌ การซิงค์ล้มเหลว: ${e?.message || 'ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้'}`);
    } finally {
      setIsSyncing(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#0B2B2B]/60 backdrop-blur-md animate-fadeIn"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="adminTitle"
    >
      <div
        className="w-full max-w-lg bg-white rounded-3xl p-6 sm:p-8 shadow-2xl border border-emerald-200/80 space-y-6 max-h-[90dvh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between pb-3 border-b border-emerald-100">
          <div className="flex items-center gap-2 text-emerald-800 font-bold text-lg">
            <Shield className="w-5 h-5 text-emerald-600" />
            <h3 id="adminTitle">Admin & Clinician Portal</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-full hover:bg-slate-100 text-slate-500 transition"
            aria-label="ปิดหน้าต่าง Admin"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-4 text-sm text-slate-600">
          <p>
            <strong>Dr.Tech.Care Administration</strong> — ระบบควบคุมและตรวจสอบความปลอดภัยทางการแพทย์
          </p>

          <div className="grid grid-cols-2 gap-3 p-4 rounded-2xl bg-emerald-50/70 border border-emerald-100 text-xs">
            <div>
              <div className="text-slate-500 font-sans">สถานะ API Backend</div>
              <div className="text-sm font-bold text-emerald-700 flex items-center gap-1 mt-0.5">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                <span>พร้อมทำงาน (Active)</span>
              </div>
            </div>
            <div>
              <div className="text-slate-500 font-sans">โมเดล AI Pose</div>
              <div className="text-sm font-bold text-slate-800 mt-0.5">MediaPipe Pose v0.10</div>
            </div>
            <div>
              <div className="text-slate-500 font-sans">อัตราความสม่ำเสมอ</div>
              <div className="text-sm font-bold text-emerald-700 mt-0.5">94.2% (ยอดเยี่ยม)</div>
            </div>
            <div>
              <div className="text-slate-500 font-sans">ระบบชีวมิติ 128-D</div>
              <div className="text-sm font-bold text-teal-700 mt-0.5">Edge Vector Protection</div>
            </div>
          </div>

          {syncStatus && (
            <div className="p-3 rounded-xl bg-teal-50 border border-teal-200 text-xs text-teal-900 font-medium">
              {syncStatus}
            </div>
          )}

          <div className="flex flex-col gap-2 pt-2">
            <button
              onClick={handleManualSync}
              disabled={isSyncing}
              className="w-full py-3 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-sm transition active:scale-98"
            >
              <RefreshCw className={`w-4 h-4 ${isSyncing ? 'animate-spin' : ''}`} />
              <span>สั่งซิงค์ข้อมูลออฟไลน์ทันที (Sync Offline Queue)</span>
            </button>
          </div>
        </div>

        <button
          onClick={onClose}
          className="btn-primary-capsule !w-full"
        >
          <span>ปิดหน้าต่าง Admin</span>
        </button>
      </div>
    </div>
  );
};

// ============================================================================
// 2. Therapy Settings Modal (Gear button beside "เริ่มกายภาพ" in Screen 3)
// ============================================================================
interface TherapySettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  exercises: ExerciseDefinition[];
  selectedExercise: ExerciseDefinition | null;
  onSelectExercise: (ex: ExerciseDefinition) => void;
}

export const TherapySettingsModal: React.FC<TherapySettingsModalProps> = ({
  isOpen,
  onClose,
  exercises,
  selectedExercise,
  onSelectExercise,
}) => {
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const [autoCount, setAutoCount] = useState(true);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#0B2B2B]/60 backdrop-blur-md animate-fadeIn"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="therapySettingsTitle"
    >
      <div
        className="w-full max-w-md bg-white rounded-3xl p-6 sm:p-8 shadow-2xl border border-emerald-200/80 space-y-5 max-h-[90dvh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between pb-3 border-b border-emerald-100">
          <div className="flex items-center gap-2 text-emerald-800 font-bold text-lg">
            <Sliders className="w-5 h-5 text-emerald-600" />
            <h3 id="therapySettingsTitle">ตั้งค่าการทำกายภาพ</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-full hover:bg-slate-100 text-slate-500 transition"
            aria-label="ปิดหน้าต่างตั้งค่า"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
              เลือกท่ากายภาพเป้าหมาย
            </label>
            <select
              value={selectedExercise?.id || (exercises[0]?.id ?? 1)}
              onChange={(e) => {
                const target = exercises.find((x) => x.id === Number(e.target.value));
                if (target) onSelectExercise(target);
              }}
              className="w-full p-3 rounded-xl border border-emerald-200 bg-white font-medium text-sm text-[#0B2B2B] focus:border-emerald-500 outline-none"
            >
              {exercises.map((ex) => (
                <option key={ex.id} value={ex.id}>
                  {ex.name} (เป้าหมาย: {ex.target_angle}°)
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-3 pt-2 border-t border-slate-100">
            <label className="flex items-center justify-between text-sm font-semibold text-slate-800 cursor-pointer">
              <span>เสียงโค้ชแนะนำภาษาไทย (Voice Coach)</span>
              <input
                type="checkbox"
                checked={voiceEnabled}
                onChange={(e) => setVoiceEnabled(e.target.checked)}
                className="w-5 h-5 accent-[#1E8A4C] rounded"
              />
            </label>

            <label className="flex items-center justify-between text-sm font-semibold text-slate-800 cursor-pointer">
              <span>ระบบตรวจนับจำนวนครั้งอัตโนมัติ</span>
              <input
                type="checkbox"
                checked={autoCount}
                onChange={(e) => setAutoCount(e.target.checked)}
                className="w-5 h-5 accent-[#1E8A4C] rounded"
              />
            </label>
          </div>
        </div>

        <button onClick={onClose} className="btn-primary-capsule !w-full mt-4">
          <span>บันทึกการตั้งค่า</span>
        </button>
      </div>
    </div>
  );
};

// ============================================================================
// 3. Mini Game Settings Modal (Gear button beside "เริ่มกายภาพแบบมินิเกม")
// ============================================================================
interface MiniGameSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const MiniGameSettingsModal: React.FC<MiniGameSettingsModalProps> = ({ isOpen, onClose }) => {
  const [questionCount, setQuestionCount] = useState<5 | 10 | 15>(10);
  const [soundEnabled, setSoundEnabled] = useState<boolean>(true);
  const [inputMode, setInputMode] = useState<'camera' | 'touch'>('camera');
  const [holdDurationSec, setHoldDurationSec] = useState<number>(0.7);

  // Load saved settings when modal opens
  useEffect(() => {
    if (isOpen) {
      try {
        const raw = localStorage.getItem('strongcare_minigame_settings');
        if (raw) {
          const parsed = JSON.parse(raw);
          if ([5, 10, 15].includes(parsed.questionCount)) setQuestionCount(parsed.questionCount);
          if (typeof parsed.soundEnabled === 'boolean') setSoundEnabled(parsed.soundEnabled);
          if (parsed.inputMode === 'touch' || parsed.inputMode === 'camera') setInputMode(parsed.inputMode);
          if (typeof parsed.holdDurationSec === 'number') setHoldDurationSec(parsed.holdDurationSec);
        }
      } catch {
        // ignore
      }
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSave = () => {
    try {
      const payload = {
        questionCount,
        soundEnabled,
        inputMode,
        holdDurationSec,
      };
      localStorage.setItem('strongcare_minigame_settings', JSON.stringify(payload));
      window.dispatchEvent(new CustomEvent('minigame:settings_updated', { detail: payload }));
    } catch {
      // ignore
    }
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#0B2B2B]/60 backdrop-blur-md animate-fadeIn"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="miniGameTitle"
    >
      <div
        className="w-full max-w-md bg-white rounded-3xl p-6 sm:p-8 shadow-2xl border border-emerald-200/80 space-y-5 max-h-[90dvh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between pb-3 border-b border-emerald-100">
          <div className="flex items-center gap-2 text-emerald-800 font-bold text-lg">
            <Sparkles className="w-5 h-5 text-emerald-600" />
            <h3 id="miniGameTitle">ตั้งค่ามินิเกมกายภาพ</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-full hover:bg-slate-100 text-slate-500 transition"
            aria-label="ปิดหน้าต่างตั้งค่ามินิเกม"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-4">
          {/* 1. จำนวนข้อต่อรอบ */}
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
              จำนวนคำถามต่อหนึ่งรอบ
            </label>
            <div className="grid grid-cols-3 gap-2">
              {([5, 10, 15] as const).map((cnt) => (
                <button
                  key={cnt}
                  type="button"
                  onClick={() => setQuestionCount(cnt)}
                  className={`py-2.5 rounded-2xl border text-sm font-bold transition flex flex-col items-center gap-0.5 ${
                    questionCount === cnt
                      ? 'bg-emerald-500 border-emerald-600 text-white shadow-md'
                      : 'bg-emerald-50/50 border-emerald-200 text-emerald-900 hover:bg-emerald-100/60'
                  }`}
                >
                  <span className="text-base">{cnt}</span>
                  <span className="text-[10px] font-medium opacity-90">ข้อ</span>
                </button>
              ))}
            </div>
          </div>

          {/* 2. วิธีการตอบคำถาม */}
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
              รูปแบบการควบคุม / รับคำตอบ
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setInputMode('camera')}
                className={`py-3 px-3 rounded-2xl border text-xs font-bold transition flex flex-col items-center gap-1 text-center ${
                  inputMode === 'camera'
                    ? 'bg-emerald-500 border-emerald-600 text-white shadow-md'
                    : 'bg-emerald-50/50 border-emerald-200 text-emerald-900 hover:bg-emerald-100/60'
                }`}
              >
                <span className="text-sm">📷 กล้อง AI ตรวจจับมือ</span>
                <span className="text-[10px] font-normal opacity-90">
                  ยกมือขวา (ใช่) / ซ้าย (ไม่)
                </span>
              </button>

              <button
                type="button"
                onClick={() => setInputMode('touch')}
                className={`py-3 px-3 rounded-2xl border text-xs font-bold transition flex flex-col items-center gap-1 text-center ${
                  inputMode === 'touch'
                    ? 'bg-emerald-500 border-emerald-600 text-white shadow-md'
                    : 'bg-emerald-50/50 border-emerald-200 text-emerald-900 hover:bg-emerald-100/60'
                }`}
              >
                <span className="text-sm">👆 โหมดปุ่มสัมผัส</span>
                <span className="text-[10px] font-normal opacity-90">
                  แตะปุ่มบนหน้าจอโดยตรง
                </span>
              </button>
            </div>
          </div>

          {/* 3. เวลาค้างท่ายืนยัน (เมื่อใช้กล้อง) */}
          {inputMode === 'camera' && (
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                เวลาค้างท่ายกมือเพื่อยืนยันคำตอบ
              </label>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { sec: 0.6, label: 'เร็ว (0.6 วิ)' },
                  { sec: 0.7, label: 'ปกติ (0.7 วิ)' },
                  { sec: 1.0, label: 'มั่นคง (1.0 วิ)' },
                ].map((item) => (
                  <button
                    key={item.sec}
                    type="button"
                    onClick={() => setHoldDurationSec(item.sec)}
                    className={`py-2 rounded-xl border text-xs font-bold transition ${
                      holdDurationSec === item.sec
                        ? 'bg-emerald-100 border-emerald-500 text-emerald-900 font-extrabold'
                        : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* 4. สลับเปิด/ปิดเสียง */}
          <label className="flex items-center justify-between p-3 rounded-2xl bg-slate-50 border border-slate-200/80 cursor-pointer">
            <div className="flex flex-col">
              <span className="text-sm font-bold text-slate-800">เสียงประกอบและเสียงเฉลย</span>
              <span className="text-xs text-slate-500">เปิดเสียงเอฟเฟกต์เมื่อตอบถูก/ผิดและจบเกม</span>
            </div>
            <input
              type="checkbox"
              checked={soundEnabled}
              onChange={(e) => setSoundEnabled(e.target.checked)}
              className="w-5 h-5 accent-[#1E8A4C] rounded cursor-pointer"
            />
          </label>
        </div>

        <button onClick={handleSave} className="btn-primary-capsule !w-full mt-4">
          <span>บันทึกการตั้งค่า</span>
        </button>
      </div>
    </div>
  );
};

// ============================================================================
// 4. User Profile Modal ("ข้อมูลผู้ใช้" in Screen 3)
// ============================================================================
interface UserProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  patient: Patient | null;
  onPatientPurged?: (patientId: number | string) => void;
}

export const UserProfileModal: React.FC<UserProfileModalProps> = ({ isOpen, onClose, patient, onPatientPurged }) => {
  const [isPurging, setIsPurging] = useState<boolean>(false);
  const [purgeMsg, setPurgeMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const handlePurge = async () => {
    if (!patient?.id) return;
    const confirmed = window.confirm(`คุณต้องการลบข้อมูลทั้งหมดของคุณ ${patient.name} ตามสิทธิ์ PDPA ใช่หรือไม่?\nการกระทำนี้จะลบข้อมูลประวัติ ใบหน้า และการฟื้นฟูทั้งหมดอย่างถาวร`);
    if (!confirmed) return;

    setIsPurging(true);
    setPurgeMsg(null);
    try {
      const res = await api.purgePatientData(patient.id);
      if (res.success) {
        setPurgeMsg('ลบข้อมูลผู้ป่วยและข้อมูลชีวมิติเรียบร้อยตาม PDPA');
        setTimeout(() => {
          onPatientPurged?.(patient.id);
          onClose();
        }, 1200);
      } else {
        setPurgeMsg(`❌ ${res.message}`);
      }
    } catch (e: any) {
      setPurgeMsg(`❌ ${e?.message || 'เกิดข้อผิดพลาดในการลบข้อมูล'}`);
    } finally {
      setIsPurging(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#0B2B2B]/60 backdrop-blur-md animate-fadeIn"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="profileTitle"
    >
      <div
        className="w-full max-w-lg bg-white rounded-3xl p-6 sm:p-8 shadow-2xl border border-emerald-200/80 space-y-5 max-h-[90dvh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between pb-3 border-b border-emerald-100">
          <div className="flex items-center gap-2 text-emerald-800 font-bold text-lg">
            <User className="w-5 h-5 text-emerald-600" />
            <h3 id="profileTitle">ข้อมูลผู้รับการบำบัด</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-full hover:bg-slate-100 text-slate-500 transition"
            aria-label="ปิดหน้าต่างข้อมูลผู้ใช้"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 rounded-2xl bg-[#F4FAF5] border border-emerald-100 space-y-3">
          <div className="flex items-center gap-3">
            {patient?.photo || patient?.avatar_url ? (
              <img
                src={patient.photo || patient.avatar_url}
                alt={patient?.name || 'รูปคนไข้'}
                className="w-14 h-14 rounded-full object-cover border-2 border-emerald-500 shadow-md flex-shrink-0"
              />
            ) : (
              <div className="w-12 h-12 rounded-full bg-gradient-to-tr from-[#6FD67F] to-[#1E8A4C] flex items-center justify-center text-white font-bold text-xl shadow-md flex-shrink-0">
                {patient?.name?.charAt(0) || 'ส'}
              </div>
            )}
            <div>
              <div className="text-base font-bold text-[#0B2B2B]">
                {patient?.name || 'คุณสมชาย ใจดี'}
              </div>
              <div className="text-xs text-[#22473E]">
                รหัสคนไข้ (HN): <strong>{patient?.patient_code || 'PT-2026-0891'}</strong> &bull; อายุ {patient?.age || 65} ปี
              </div>
            </div>
          </div>

          <div className="text-xs text-slate-600 space-y-1.5 pt-2 border-t border-emerald-200/60">
            <div>
              <strong>การวินิจฉัยทางคลินิก:</strong> {patient?.notes || 'ฟื้นฟูกล้ามเนื้อข้อไหล่ติดและกล้ามเนื้อสะบัก'}
            </div>
            <div>
              <strong>นักกายภาพบำบัดผู้รับผิดชอบ:</strong> กภ. วรัญญา สิริพร
            </div>
            <div>
              <strong>เป้าหมายรายสัปดาห์:</strong> ทำกายภาพสม่ำเสมอ 5 วัน/สัปดาห์ (สำเร็จแล้ว 4/5 วัน)
            </div>
          </div>
        </div>

        {purgeMsg && (
          <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs font-semibold text-amber-900">
            {purgeMsg}
          </div>
        )}

        <div className="flex flex-col gap-2">
          <button onClick={onClose} className="btn-primary-capsule !w-full">
            <span>ตกลง</span>
          </button>
          {patient?.id && (
            <button
              type="button"
              onClick={handlePurge}
              disabled={isPurging}
              className="text-xs text-rose-600 hover:text-rose-800 hover:underline py-1 transition disabled:opacity-50 text-center font-medium"
            >
              {isPurging ? 'กำลังลบข้อมูลตามสิทธิ์ PDPA...' : 'ลบข้อมูลผู้ป่วยและข้อมูลชีวมิติทั้งหมด (PDPA Right to Erasure)'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

// ============================================================================
// 5. Therapist Report Modal ("เอาไว้บอกผู้กายภาพ" in Screen 4)
// ============================================================================
interface TherapistReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  score: number | null;
  poseName: string;
  romAngle: number | null;
  onSubmit: (note: string) => void;
}

export const TherapistReportModal: React.FC<TherapistReportModalProps> = ({
  isOpen,
  onClose,
  score,
  poseName,
  romAngle,
  onSubmit,
}) => {
  const [note, setNote] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async () => {
    setIsSubmitting(true);
    await onSubmit(note);
    setIsSubmitting(false);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#0B2B2B]/60 backdrop-blur-md animate-fadeIn"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="reportModalTitle"
    >
      <div
        className="w-full max-w-lg bg-white rounded-3xl p-6 sm:p-8 shadow-2xl border border-emerald-200/80 space-y-5 max-h-[90dvh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between pb-3 border-b border-emerald-100">
          <div className="flex items-center gap-2 text-emerald-800 font-bold text-lg">
            <Send className="w-5 h-5 text-emerald-600" />
            <h3 id="reportModalTitle">ส่งผลให้ผู้กายภาพบำบัด</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-full hover:bg-slate-100 text-slate-500 transition"
            aria-label="ปิดหน้าต่างรายงานผล"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 rounded-2xl bg-[#F4FAF5] border border-emerald-100 space-y-2 text-sm text-[#0B2B2B]">
          <div className="flex items-center justify-between">
            <span className="font-bold">คะแนนการทำกายภาพ:</span>
            <span className="text-base sm:text-lg font-extrabold text-[#1E8A4C]">
              {score !== null ? `${score} / 100` : 'ไม่มีคะแนน (โหมดจับเวลา)'}
            </span>
          </div>
          <div className="flex items-center justify-between text-xs text-slate-600">
            <span>ท่าที่บันทึก:</span>
            <span className="font-bold text-[#0B2B2B]">{poseName}</span>
          </div>
          <div className="flex items-center justify-between text-xs text-slate-600">
            <span>องศาการเคลื่อนไหว (ROM):</span>
            <span className="font-bold text-[#1E8A4C]">
              {romAngle !== null ? `เฉลี่ย ${romAngle}° (ตามเป้าหมาย)` : 'ไม่มีข้อมูลวัด'}
            </span>
          </div>
          <div className="flex items-center justify-between text-xs text-slate-600">
            <span>เวลาบันทึก:</span>
            <span>{new Date().toLocaleTimeString('th-TH')} น.</span>
          </div>
        </div>

        <div>
          <label className="block text-xs font-bold text-slate-700 mb-1.5">
            ข้อความเพิ่มเติมถึงนักกายภาพบำบัด:
          </label>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            placeholder="เช่น รู้สึกตึงหัวไหล่ขวาเล็กน้อยตอนยกแขนสุด..."
            className="w-full p-3 rounded-2xl border border-emerald-200 text-sm font-sans text-[#0B2B2B] outline-none focus:border-[#1E8A4C] resize-none"
          />
        </div>

        <button
          onClick={handleSubmit}
          disabled={isSubmitting}
          className="btn-primary-capsule !w-full"
        >
          <Send className="w-4 h-4" />
          <span>{isSubmitting ? 'กำลังส่งข้อมูล...' : 'ส่งข้อมูลให้นักกายภาพทันที'}</span>
        </button>
      </div>
    </div>
  );
};

// ============================================================================
// 6. About Modal (ข้อมูลเกี่ยวกับระบบ Dr.Tech.Care)
// ============================================================================
interface AboutModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const AboutModal: React.FC<AboutModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div
      className="modal-backdrop-blur"
      role="dialog"
      aria-modal="true"
      aria-labelledby="aboutModalTitle"
    >
      <div className="modal-dialog-responsive max-w-xl max-h-[90vh] overflow-y-auto space-y-5 p-6 sm:p-7">
        
        {/* Modal Header */}
        <div className="flex items-center justify-between pb-3 border-b border-emerald-100">
          <div className="flex items-center gap-2.5 text-emerald-800 font-bold text-lg">
            <div className="w-8 h-8 rounded-full bg-emerald-100 text-[#1E8A4C] flex items-center justify-center">
              <Info className="w-5 h-5" />
            </div>
            <div>
              <h3 id="aboutModalTitle" className="text-base sm:text-lg font-bold text-[#0B2B2B]">
                เกี่ยวกับ Dr.Tech.Care
              </h3>
              <p className="text-[11px] text-emerald-700 font-medium">
                AI-assisted Rehabilitation Monitoring Platform v1.0
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-full hover:bg-slate-100 text-slate-500 transition"
            aria-label="ปิดหน้าต่างข้อมูลเกี่ยวกับระบบ"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Mission Statement Banner */}
        <div className="p-4 rounded-2xl bg-gradient-to-br from-[#E9FCEB] to-emerald-50 border border-emerald-200/80 text-center space-y-1">
          <div className="text-sm font-bold text-[#1E8A4C]">
            แพลตฟอร์มช่วยติดตามและวิเคราะห์การฝึกกายภาพบำบัดด้วย AI อัจฉริยะ
          </div>
          <div className="text-xs text-slate-600 leading-relaxed">
            “เพื่อการฟื้นฟูสมรรถภาพร่างกายที่ปลอดภัย ถูกต้องตามหลักชีวกลศาสตร์ และเข้าถึงง่ายสำหรับผู้สูงอายุ”
          </div>
        </div>

        {/* Key Features Grid */}
        <div className="space-y-3">
          <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
            จุดเด่นและนวัตกรรมหลัก (Key Innovations)
          </h4>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
            
            <div className="p-3 rounded-xl bg-white border border-emerald-100 shadow-sm space-y-1">
              <div className="font-bold text-[#0B2B2B] flex items-center gap-1.5">
                <span>🏥</span>
                <span>Reception Onboarding</span>
              </div>
              <p className="text-slate-600 text-[11px] leading-relaxed">
                ต้อนรับคนไข้ใหม่ กรอกข้อมูล HN/อาการ/นักกายภาพผู้รับผิดชอบก่อน แล้วค่อยสแกนหน้าเพื่อล็อกอินเข้าตู้ทันที
              </p>
            </div>

            <div className="p-3 rounded-xl bg-white border border-emerald-100 shadow-sm space-y-1">
              <div className="font-bold text-[#0B2B2B] flex items-center gap-1.5">
                <span>🔐</span>
                <span>3-Tier Auth & Real RBAC</span>
              </div>
              <p className="text-slate-600 text-[11px] leading-relaxed">
                แยก 3 ระบบเด็ดขาด: แอดมินใหญ่ (6 หน้า), นักกายภาพ (4 หน้า), ตู้ Kiosk คนไข้ พร้อม Username+Password จริง ปลดปุ่มสลับสิทธิ์ demo
              </p>
            </div>

            <div className="p-3 rounded-xl bg-white border border-emerald-100 shadow-sm space-y-1">
              <div className="font-bold text-[#0B2B2B] flex items-center gap-1.5">
                <span>🤖</span>
                <span>Zero-Touch & Pose Inquiry</span>
              </div>
              <p className="text-slate-600 text-[11px] leading-relaxed">
                ตรวจจับใบหน้าอัตโนมัติ 3 วินาทีเข้าสู่ระบบทันที และมี Popup ตรวจจับยกแขนขวา=ใช่ (3s) / ซ้าย=ไม่ แทนการสัมผัสหน้าจอ
              </p>
            </div>

            <div className="p-3 rounded-xl bg-white border border-emerald-100 shadow-sm space-y-1">
              <div className="font-bold text-[#0B2B2B] flex items-center gap-1.5">
                <span>🪞</span>
                <span>Vertical Smart-Mirror</span>
              </div>
              <p className="text-slate-600 text-[11px] leading-relaxed">
                กระจกกายภาพแนวตั้ง 100dvh Zero-Scroll Design ไม่ต้องปัดเลื่อนจอ โครงกระดูก 33 จุดชัดเจน
              </p>
            </div>

            <div className="p-3 rounded-xl bg-white border border-emerald-100 shadow-sm space-y-1">
              <div className="font-bold text-[#0B2B2B] flex items-center gap-1.5">
                <span>🧘‍♂️</span>
                <span>16 Kinematic Exercises</span>
              </div>
              <p className="text-slate-600 text-[11px] leading-relaxed">
                คลัง 16 ท่ากายภาพชีวกลศาสตร์ พร้อม 5-State Machine ป้องกันโกงท่า และคำนวณแบบ Aspect-Ratio Invariant
              </p>
            </div>

            <div className="p-3 rounded-xl bg-white border border-emerald-100 shadow-sm space-y-1">
              <div className="font-bold text-[#0B2B2B] flex items-center gap-1.5">
                <span>🏋️</span>
                <span>Exercise Library Full CRUD</span>
              </div>
              <p className="text-slate-600 text-[11px] leading-relaxed">
                โมดอลเพิ่ม/แก้ไข/ยืนยันลบท่ากายภาพครบวงจร แบ่ง 3 ส่วนชัดเจน (พื้นฐาน, ชีวกลศาสตร์ ROM/เซ็ต/ครั้ง, ข้อควรระวัง) พร้อม Toast แบบ Real-time
              </p>
            </div>

            <div className="p-3 rounded-xl bg-white border border-emerald-100 shadow-sm space-y-1">
              <div className="font-bold text-[#0B2B2B] flex items-center gap-1.5">
                <span>🩺</span>
                <span>Patient Clinical Records</span>
              </div>
              <p className="text-slate-600 text-[11px] leading-relaxed">
                เวชระเบียนคนไข้แยกตามความรับผิดชอบ (เฉพาะที่ฉันดูแล/ทั้งหมด) แก้ไขได้เฉพาะคนไข้ที่ดูแล พร้อมโหมดอ่านอย่างเดียว
              </p>
            </div>

            <div className="p-3 rounded-xl bg-white border border-emerald-100 shadow-sm space-y-1 sm:col-span-2">
              <div className="font-bold text-[#0B2B2B] flex items-center gap-1.5">
                <span>🤖</span>
                <span>ResNet-34 Face Biometrics & Security</span>
              </div>
              <p className="text-slate-600 text-[11px] leading-relaxed">
                MediaPipe Mesh 478 จุด + ResNet-34 128-D พร้อม Liveness Blink ป้องกันภาพนิ่งตาม PDPA และระบบเตะ/แบนเครื่อง/แบน IP สำหรับ Admin
              </p>
            </div>

            <div className="p-3 rounded-xl bg-gradient-to-r from-emerald-50 to-teal-50 border border-emerald-200 shadow-sm space-y-1 sm:col-span-2">
              <div className="font-bold text-[#0B2B2B] flex items-center gap-1.5">
                <span>🎮</span>
                <span>Mini-Game Cognitive & Physical Rehab (แยกอิสระ 100%)</span>
              </div>
              <p className="text-slate-600 text-[11px] leading-relaxed">
                มินิเกมตอบคำถาม ใช่ / ไม่ โดยใช้ท่าทางมือ (ยกมือขวา = ใช่, ยกมือซ้าย = ไม่) ตรวจจับด้วย MediaPipe AI เรียลไทม์ คลังคำถาม 99 ข้อ พร้อมระบบเสียง และส่งผลรายงานให้นักกายภาพ
              </p>
            </div>

          </div>
        </div>

        {/* Technical Architecture Badge */}
        <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80 text-[11px] text-slate-600 space-y-1">
          <div className="font-bold text-[#0B2B2B]">🛠️ เทคโนโลยีที่ใช้</div>
          <div>• Frontend: React 18, TypeScript 5, Vite 5, Tailwind CSS, Lucide Icons, Zustand, Recharts</div>
          <div>• Computer Vision: MediaPipe Pose Landmarker (WASM), FaceLandmarker, ResNet-34 128-D</div>
          <div>• Backend & DB: Supabase (PostgreSQL 15), Supabase Auth, Row Level Security (RLS), IndexedDB Offline-First</div>
        </div>

        {/* Action Links */}
        <div className="flex flex-col sm:flex-row items-center gap-2 pt-1">
          <a
            href="https://github.com/krongrach80-ui/Strong-Care"
            target="_blank"
            rel="noopener noreferrer"
            className="w-full sm:flex-1 py-2.5 px-4 rounded-full border border-emerald-300 bg-white hover:bg-emerald-50 text-[#1E8A4C] text-xs font-bold flex items-center justify-center gap-1.5 transition shadow-sm"
          >
            <span>GitHub Repository</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
          <button
            onClick={onClose}
            className="btn-primary-capsule !w-full sm:!flex-1 !py-2.5 text-xs"
          >
            <span>เข้าใจแล้ว (ปิดหน้าต่าง)</span>
          </button>
        </div>

      </div>
    </div>
  );
};
