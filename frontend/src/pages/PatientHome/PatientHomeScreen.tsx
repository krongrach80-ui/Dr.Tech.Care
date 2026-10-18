/**
 * Dr.Tech.Care - Patient Home Dashboard (/home)
 * Vertical Kiosk 9:16 (1080x1920) and Mobile/Tablet Responsive
 * Features:
 * - Requirement 5: ถ้านัดมี 2 แบบ: หน้าฝึกวันนัดแสดง 2 ส่วน/2 การ์ดพร้อมกัน (กายภาพ + มินิเกม) ให้คนไข้เริ่มทีละอัน
 *   และแสดงสถานะเสร็จ/ยังไม่เสร็จของแต่ละอัน ถ้ามีแบบเดียว แสดงเฉพาะแบบนั้น
 * - Masked Surname for medical PDPA compliance (e.g. "สมชาย ใ.")
 * - Attending Physiotherapist & Today's Prescription Plan
 * - Large touch targets (>= 64px - 80px) with high contrast StrongCare theme
 * - IdleGuard Auto-Logout (45 seconds inactivity with 10s countdown warning)
 */

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  Play,
  LogOut,
  Calendar,
  Clock,
  UserCheck,
  Stethoscope,
  Dumbbell,
  Gamepad2,
  AlertTriangle,
  ChevronRight,
  ShieldCheck,
  HeartPulse,
  Activity,
  Sparkles,
  CheckCircle2,
  Clock3,
  Award,
} from 'lucide-react';
import { Patient } from '../../types/patient';
import { TreatmentPlan, PhysicalTherapist } from '../../types/hospital';
import logoIconImg from '../../assets/logo_icon.png';

interface PatientHomeScreenProps {
  patient: Patient;
  attendingTherapist?: PhysicalTherapist | null;
  activePlan?: TreatmentPlan | null;
  onStartExercise: (mode?: 'physio' | 'minigame') => void;
  onLogout: () => void;
}

/**
 * Mask patient surname for strict healthcare PDPA (e.g. "นายสมชาย ใจดี" -> "นายสมชาย ใ.")
 */
function maskSurname(fullName: string): string {
  if (!fullName) return 'ผู้รับบริการ';
  const parts = fullName.trim().split(/\s+/);
  if (parts.length === 1) return parts[0];
  const firstName = parts[0];
  const surname = parts[1];
  const maskedSurname = surname.length > 0 ? `${surname.charAt(0)}.` : '';
  return `${firstName} ${maskedSurname}`;
}

export const PatientHomeScreen: React.FC<PatientHomeScreenProps> = ({
  patient,
  attendingTherapist,
  activePlan,
  onStartExercise,
  onLogout,
}) => {
  // IdleGuard: 45 seconds auto logout
  const IDLE_LIMIT_SECONDS = 45;
  const WARNING_THRESHOLD_SECONDS = 10;

  const [idleSeconds, setIdleSeconds] = useState<number>(0);
  const [showIdleWarning, setShowIdleWarning] = useState<boolean>(false);
  const lastInteractionRef = useRef<number>(Date.now());

  // Reset idle timer on any user interaction
  const resetIdle = useCallback(() => {
    lastInteractionRef.current = Date.now();
    setIdleSeconds(0);
    setShowIdleWarning(false);
  }, []);

  useEffect(() => {
    const handleActivity = () => resetIdle();
    window.addEventListener('pointerdown', handleActivity);
    window.addEventListener('keydown', handleActivity);
    window.addEventListener('touchstart', handleActivity);

    const interval = setInterval(() => {
      const elapsed = Math.floor((Date.now() - lastInteractionRef.current) / 1000);
      setIdleSeconds(elapsed);

      if (elapsed >= IDLE_LIMIT_SECONDS) {
        clearInterval(interval);
        onLogout();
      } else if (elapsed >= IDLE_LIMIT_SECONDS - WARNING_THRESHOLD_SECONDS) {
        setShowIdleWarning(true);
      } else {
        setShowIdleWarning(false);
      }
    }, 1000);

    return () => {
      window.removeEventListener('pointerdown', handleActivity);
      window.removeEventListener('keydown', handleActivity);
      window.removeEventListener('touchstart', handleActivity);
      clearInterval(interval);
    };
  }, [resetIdle, onLogout]);

  // Thai Date formatting with correct 1-based month
  const [thaiDateStr, setThaiDateStr] = useState<string>('');
  const [todayDateKey, setTodayDateKey] = useState<string>('');

  useEffect(() => {
    const thaiDayNames = ['วันอาทิตย์', 'วันจันทร์', 'วันอังคาร', 'วันพุธ', 'วันพฤหัสบดี', 'วันศุกร์', 'วันเสาร์'];
    const thaiMonthNames = [
      'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
      'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม',
    ];
    const now = new Date();
    const dName = thaiDayNames[now.getDay()];
    const dNum = now.getDate();
    const mName = thaiMonthNames[now.getMonth()];
    const bYear = now.getFullYear() + 543;
    const mNum = now.getMonth() + 1;
    setThaiDateStr(`${dName}ที่ ${dNum} ${mName} พ.ศ. ${bYear}`);
    setTodayDateKey(`${now.getFullYear()}-${String(mNum).padStart(2, '0')}-${String(dNum).padStart(2, '0')}`);
  }, []);

  // Completion states for today (Requirement 5: แสดงสถานะเสร็จ/ยังไม่เสร็จของแต่ละอัน)
  const [isRomCompleted, setIsRomCompleted] = useState<boolean>(() => {
    try {
      const stored = localStorage.getItem(`strongcare_completed_rom_${patient.id}`);
      return stored === 'true';
    } catch {
      return false;
    }
  });

  const [isMinigameCompleted, setIsMinigameCompleted] = useState<boolean>(() => {
    try {
      const stored = localStorage.getItem(`strongcare_completed_minigame_${patient.id}`);
      return stored === 'true';
    } catch {
      return false;
    }
  });

  // Determine enabled modes based on activePlan and trainingModes (Requirement 4 & 5)
  // Backward compatibility: If trainingModes is not set, default to ROM enabled, and check includeMinigame
  const hasRom = useMemo(() => {
    if (activePlan?.trainingModes?.rom) {
      return activePlan.trainingModes.rom.enabled;
    }
    // Backward compatible fallback
    return true;
  }, [activePlan]);

  const hasMinigame = useMemo(() => {
    if (activePlan?.trainingModes?.minigame) {
      return activePlan.trainingModes.minigame.enabled;
    }
    // Backward compatible fallback
    return Boolean(activePlan?.includeMinigame ?? (activePlan as any)?.include_minigame ?? false);
  }, [activePlan]);

  // Doctor configured minigame question count (Requirement 3.2 & 5)
  const minigameQuestionCount = useMemo(() => {
    if (activePlan?.trainingModes?.minigame?.questionCount) {
      return activePlan.trainingModes.minigame.questionCount;
    }
    return activePlan?.minigameQuestionCount || 20;
  }, [activePlan]);

  const therapistName = attendingTherapist?.name || activePlan?.therapistName || 'กภ. ธนากร วงศ์สวัสดิ์';

  const defaultExercises = [
    { exerciseSlug: 'shoulder_raise', exerciseName: 'กางแขนยกด้านข้าง', reps: 10, sets: 3 },
    { exerciseSlug: 'cross_body_stretch', exerciseName: 'ยืดไหล่ข้ามอก', reps: 8, sets: 3 },
    { exerciseSlug: 'chest_expansion', exerciseName: 'ยืดอกเปิดไหล่', reps: 8, sets: 2 },
  ];

  const planExercises = useMemo(() => {
    if (activePlan?.assignedExercises && activePlan.assignedExercises.length > 0) {
      return activePlan.assignedExercises;
    }
    if (activePlan?.trainingModes?.rom?.exercises && activePlan.trainingModes.rom.exercises.length > 0) {
      return activePlan.trainingModes.rom.exercises;
    }
    return defaultExercises;
  }, [activePlan, defaultExercises]);

  const packTitle = activePlan?.trainingModes?.rom?.packName || 'แผนการทำกายภาพประจำวันนี้';

  return (
    <div className="w-full h-full max-w-xl mx-auto flex flex-col justify-between p-4 sm:p-6 bg-gradient-to-b from-[#E8F8F1] via-white to-[#E4F0FC] text-[#0B2B2B] relative select-none rounded-[32px] sm:rounded-[36px] shadow-2xl border border-emerald-100 overflow-y-auto">
      {/* 1. Header Bar: Date & Logout */}
      <div className="w-full flex items-center justify-between pb-3 border-b border-emerald-200 flex-shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-10 h-10 rounded-full bg-white border border-emerald-300 flex items-center justify-center p-1 overflow-hidden shadow-2xs">
            <img src={logoIconImg} alt="Dr. Tech Care" className="w-full h-full object-contain" />
          </div>
          <div>
            <div className="text-[11px] font-black text-emerald-800 tracking-wide uppercase">
              STRONG CARE • SMART REHAB
            </div>
            <div className="text-xs font-bold text-slate-600">{thaiDateStr}</div>
          </div>
        </div>

        <button
          onClick={onLogout}
          className="min-h-[44px] py-2 px-3.5 rounded-2xl bg-white hover:bg-rose-50 border border-rose-300 text-rose-700 font-black text-xs sm:text-sm flex items-center gap-1.5 shadow-sm active:scale-95 transition cursor-pointer"
          id="btnPatientLogoutTop"
          title="ออกจากระบบ"
        >
          <LogOut className="w-4 h-4" />
          <span>ออกจากระบบ</span>
        </button>
      </div>

      {/* 2. Patient Profile Card (Masked Surname PDPA) */}
      <div className="w-full bg-white border-2 border-emerald-300 rounded-[28px] p-4 sm:p-5 shadow-sm my-2.5 relative overflow-hidden flex-shrink-0">
        <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-50 rounded-full -mr-10 -mt-10 pointer-events-none" />

        <div className="flex items-start justify-between relative z-10">
          <div>
            <span className="inline-block text-[10px] font-black tracking-wider uppercase px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-900 border border-emerald-300 mb-1.5">
              ข้อมูลผู้รับบริการ (HN: {patient.patient_code || 'PT-2026-001'})
            </span>
            <h1 className="text-2xl sm:text-3xl font-black text-[#0B2B2B] tracking-tight">
              {maskSurname(patient.name)}
            </h1>
            <p className="text-xs sm:text-sm text-slate-600 font-bold mt-0.5">
              อายุ {patient.age || 68} ปี • สิทธิ์การรักษา: สิทธิประกันสุขภาพถ้วนหน้า
            </p>
          </div>

          <div className="w-13 h-13 rounded-2xl bg-emerald-50 border-2 border-emerald-300 flex items-center justify-center text-emerald-700 font-black text-xl shadow-inner">
            👴
          </div>
        </div>

        {/* Attending Therapist Badge */}
        <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center gap-2 text-xs sm:text-sm font-bold text-emerald-950">
          <Stethoscope className="w-4 h-4 text-[#1E8A4C] shrink-0" />
          <span>
            นักกายภาพบำบัดผู้ดูแล: <b className="text-[#1E8A4C]">{therapistName}</b>
          </span>
        </div>
      </div>

      {/* Mode status summary banner when both are scheduled */}
      {hasRom && hasMinigame && (
        <div className="w-full px-4 py-2 rounded-2xl bg-gradient-to-r from-emerald-100 to-purple-100 border border-emerald-300 text-xs font-black text-[#0B2B2B] flex items-center justify-between shadow-2xs my-1 flex-shrink-0">
          <span className="flex items-center gap-1.5">
            <Sparkles className="w-4 h-4 text-emerald-600" />
            <span>วันนี้คุณมี 2 รูปแบบการฝึก (กายภาพ + มินิเกม)</span>
          </span>
          <span className="text-[11px] text-slate-600 font-bold">
            เริ่มทำทีละอันได้เลยครับ
          </span>
        </div>
      )}

      {/* =================================================================== */}
      {/* 3. TODAY'S WORKOUT SECTIONS (Requirement 5)                        */}
      {/* =================================================================== */}
      <div className="w-full space-y-3 my-1 flex-1 overflow-y-auto pr-0.5">
        {/* CARD 1: กายภาพปกติ (ROM Exercise) */}
        {hasRom && (
          <div className="w-full bg-[#EBF8F2] border-2 border-emerald-300 rounded-[28px] p-4 sm:p-5 shadow-sm space-y-3">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-emerald-500 text-white flex items-center justify-center shadow-xs">
                  <Activity className="w-4 h-4 stroke-[2.5]" />
                </div>
                <div>
                  <h2 className="text-base sm:text-lg font-black text-[#0B2B2B] leading-tight">
                    กายภาพปกติ (ROM Exercise)
                  </h2>
                  <p className="text-[11px] font-bold text-emerald-800">
                    {packTitle}
                  </p>
                </div>
              </div>

              {/* Status Badge: เสร็จ / ยังไม่เสร็จ (Requirement 5) */}
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-extrabold bg-[#1E8A4C] text-white px-2.5 py-0.5 rounded-full">
                  {planExercises.length} ท่า
                </span>

                {isRomCompleted ? (
                  <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-black bg-emerald-100 text-emerald-800 border border-emerald-300 shadow-2xs">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                    <span>เสร็จสิ้นแล้ว</span>
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-black bg-amber-100 text-amber-900 border border-amber-300 shadow-2xs">
                    <Clock3 className="w-3.5 h-3.5 text-amber-600" />
                    <span>ยังไม่เสร็จ</span>
                  </span>
                )}
              </div>
            </div>

            {/* Exercise Items List */}
            <div className="space-y-1.5 max-h-[160px] overflow-y-auto pr-1">
              {planExercises.map((ex, idx) => (
                <div
                  key={idx}
                  className="bg-white rounded-xl p-2.5 border border-emerald-200/90 flex items-center justify-between shadow-2xs text-left"
                >
                  <div className="flex items-center gap-2.5 truncate">
                    <div className="w-6 h-6 rounded-lg bg-emerald-100 text-[#1E8A4C] font-black text-xs flex items-center justify-center shrink-0">
                      {idx + 1}
                    </div>
                    <div className="truncate">
                      <div className="text-xs sm:text-sm font-black text-[#0B2B2B] truncate">
                        {ex.exerciseName}
                      </div>
                      <div className="text-[10px] font-semibold text-slate-500">
                        {ex.reps || 10} ครั้ง/เซ็ต • {ex.sets || 3} เซ็ต
                      </div>
                    </div>
                  </div>

                  <span className="text-[11px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md flex-shrink-0">
                    พร้อมฝึก
                  </span>
                </div>
              ))}
            </div>

            {/* Start ROM Button */}
            <button
              type="button"
              onClick={() => onStartExercise('physio')}
              className={`w-full min-h-[58px] py-3 px-5 rounded-2xl font-black text-base transition flex items-center justify-between cursor-pointer border shadow-md active:scale-95 ${
                isRomCompleted
                  ? 'bg-emerald-50 hover:bg-emerald-100 text-emerald-900 border-emerald-300'
                  : 'bg-gradient-to-r from-[#10B981] via-[#06B6D4] to-[#2563EB] text-white border-white/60 shadow-cyan-500/25 hover:shadow-lg'
              }`}
              id="btnStartPrescribedPhysio"
            >
              <div className="flex items-center gap-2.5">
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${isRomCompleted ? 'bg-emerald-200 text-emerald-800' : 'bg-white/20 text-white'}`}>
                  <Play className="w-5 h-5 fill-current ml-0.5" />
                </div>
                <div className="text-left">
                  <div className="text-sm sm:text-base font-black">
                    {isRomCompleted ? 'ฝึกกายภาพบำบัดอีกครั้ง' : 'เริ่มต้นฝึกกายภาพบำบัด'}
                  </div>
                  <div className="text-[11px] opacity-90 font-medium">
                    {planExercises.length} ท่าฝึก พร้อม AI วิเคราะห์มุมข้อต่อ
                  </div>
                </div>
              </div>
              <ChevronRight className="w-5 h-5 opacity-80" />
            </button>
          </div>
        )}

        {/* CARD 2: มินิเกมฝึกสมอง (Brain Training Mini-Game) */}
        {hasMinigame && (
          <div className="w-full bg-[#FAF5FF] border-2 border-purple-300 rounded-[28px] p-4 sm:p-5 shadow-sm space-y-3">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-purple-600 text-white flex items-center justify-center shadow-xs">
                  <Gamepad2 className="w-4 h-4 stroke-[2.5]" />
                </div>
                <div>
                  <h2 className="text-base sm:text-lg font-black text-[#0B2B2B] leading-tight">
                    มินิเกมฝึกสมองและการตอบสนอง
                  </h2>
                  <p className="text-[11px] font-bold text-purple-700">
                    ตอบคำถามโดยยกมือซ้าย/ขวา เพื่อความเพลิดเพลิน
                  </p>
                </div>
              </div>

              {/* Status Badge: เสร็จ / ยังไม่เสร็จ (Requirement 5) */}
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-extrabold bg-purple-600 text-white px-2.5 py-0.5 rounded-full">
                  {minigameQuestionCount} คำถาม
                </span>

                {isMinigameCompleted ? (
                  <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-black bg-emerald-100 text-emerald-800 border border-emerald-300 shadow-2xs">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                    <span>เสร็จสิ้นแล้ว</span>
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-black bg-amber-100 text-amber-900 border border-amber-300 shadow-2xs">
                    <Clock3 className="w-3.5 h-3.5 text-amber-600" />
                    <span>ยังไม่เสร็จ</span>
                  </span>
                )}
              </div>
            </div>

            <div className="p-3 rounded-2xl bg-white border border-purple-200/90 text-xs text-slate-700 font-semibold space-y-1 text-left">
              <div className="flex items-center justify-between">
                <span>จำนวนคำถามตามที่หมอกำหนด:</span>
                <span className="font-black text-purple-700">{minigameQuestionCount} ข้อ</span>
              </div>
              <p className="text-[11px] text-slate-500">
                ขยับร่างกายเพื่อเลือกคำตอบ ใช่ หรือ ไม่ ช่วยกระตุ้นระบบประสาทและการสั่งการ
              </p>
            </div>

            {/* Start Minigame Button */}
            <button
              type="button"
              onClick={() => onStartExercise('minigame')}
              className={`w-full min-h-[58px] py-3 px-5 rounded-2xl font-black text-base transition flex items-center justify-between cursor-pointer border shadow-md active:scale-95 ${
                isMinigameCompleted
                  ? 'bg-purple-50 hover:bg-purple-100 text-purple-900 border-purple-300'
                  : 'bg-gradient-to-r from-purple-600 via-indigo-600 to-sky-600 text-white border-white/60 shadow-purple-500/25 hover:shadow-lg'
              }`}
              id="btnStartMinigameOption"
            >
              <div className="flex items-center gap-2.5">
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${isMinigameCompleted ? 'bg-purple-200 text-purple-800' : 'bg-white/20 text-white'}`}>
                  <Gamepad2 className="w-5 h-5 text-current" />
                </div>
                <div className="text-left">
                  <div className="text-sm sm:text-base font-black">
                    {isMinigameCompleted ? 'เล่นมินิเกมอีกครั้ง' : `เริ่มต้นเล่นมินิเกม (${minigameQuestionCount} ข้อ)`}
                  </div>
                  <div className="text-[11px] opacity-90 font-medium">
                    แบบฝึกสมองเชิงโต้ตอบ (+50 XP)
                  </div>
                </div>
              </div>
              <ChevronRight className="w-5 h-5 opacity-80" />
            </button>
          </div>
        )}
      </div>

      {/* Bottom Advice Footer */}
      <div className="p-3 rounded-2xl bg-white/95 border border-emerald-300/60 text-[11px] text-slate-600 font-semibold flex items-center gap-2 mt-2 flex-shrink-0">
        <Sparkles className="w-4 h-4 text-amber-500 shrink-0" />
        <span>
          คำแนะนำ: ค่อยๆ เคลื่อนไหวตามเสียงและโครงร่าง AI หากมีอาการเจ็บหรือล้า สามารถกดหยุดพักได้ทันที
        </span>
      </div>

      {/* 5. IdleGuard Warning Popup (10s Countdown) */}
      {showIdleWarning && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fadeIn">
          <div className="bg-white border-3 border-amber-400 rounded-[32px] p-6 max-w-sm w-full text-center shadow-2xl flex flex-col items-center">
            <div className="w-16 h-16 rounded-full bg-amber-100 border-2 border-amber-400 flex items-center justify-center mb-3 text-amber-600 animate-bounce">
              <AlertTriangle className="w-8 h-8" />
            </div>

            <h3 className="text-xl font-black text-[#0B2B2B] mb-1">
              ท่านยังอยู่ตรงนี้หรือไม่?
            </h3>
            <p className="text-xs sm:text-sm font-bold text-slate-600 mb-4">
              เพื่อความปลอดภัยของข้อมูล ระบบจะออกจากระบบอัตโนมัติในอีก
            </p>

            <div className="w-20 h-20 rounded-full bg-amber-500 text-white font-mono font-black text-3xl flex items-center justify-center mb-5 shadow-lg animate-pulse">
              {IDLE_LIMIT_SECONDS - idleSeconds}
            </div>

            <button
              onClick={resetIdle}
              className="w-full min-h-[64px] py-3.5 px-6 rounded-2xl bg-gradient-to-r from-[#10B981] via-[#06B6D4] to-[#2563EB] text-white font-black text-base shadow-lg shadow-cyan-500/25 hover:shadow-xl active:scale-95 transition cursor-pointer"
              id="btnStayLoggedIn"
            >
              ฉันยังอยู่ตรงนี้ (แตะเพื่อใช้งานต่อ)
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
