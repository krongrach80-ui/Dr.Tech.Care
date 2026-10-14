/**
 * Dr.Tech.Care - Patient Home Dashboard (/home)
 * Vertical Kiosk 9:16 (1080x1920) optimized for elderly patients
 * Features:
 * - Masked Surname for medical PDPA compliance (e.g. "สมชาย ใ.")
 * - Attending Physiotherapist & Today's Prescription Plan
 * - Large touch targets (>= 64px - 80px) with high contrast StrongCare theme
 * - IdleGuard Auto-Logout (45 seconds inactivity with 10s countdown warning)
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
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

  // Thai Date formatting with correct 1-based month (10 = ตุลาคม)
  const [thaiDateStr, setThaiDateStr] = useState<string>('');
  useEffect(() => {
    const thaiDayNames = ['วันอาทิตย์', 'วันจันทร์', 'วันอังคาร', 'วันพุธ', 'วันพฤหัสบดี', 'วันศุกร์', 'วันเสาร์'];
    const thaiMonthNames = [
      'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
      'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'
    ];
    const now = new Date();
    const dName = thaiDayNames[now.getDay()];
    const dNum = now.getDate();
    const mName = thaiMonthNames[now.getMonth()];
    const bYear = now.getFullYear() + 543;
    const mNum = now.getMonth() + 1;
    setThaiDateStr(`${dName}ที่ ${dNum} ${mName} พ.ศ. ${bYear} (${dNum}/${mNum}/${bYear})`);
  }, []);

  const therapistName = attendingTherapist?.name || 'กภ. ธนากร เจริญสุข (นักกายภาพบำบัดประจำตู้)';
  const defaultExercises = [
    { exerciseSlug: 'arm_raise', exerciseName: 'ท่ายกแขนเหนือศีรษะ', reps: 10, sets: 3 },
    { exerciseSlug: 'shoulder_abduction', exerciseName: 'ท่ากางแขนออกข้างลำตัว', reps: 10, sets: 3 },
    { exerciseSlug: 'elbow_flexion', exerciseName: 'ท่างอและเหยียดข้อศอก', reps: 12, sets: 3 },
  ];
  const planExercises = activePlan?.assignedExercises && activePlan.assignedExercises.length > 0
    ? activePlan.assignedExercises
    : defaultExercises;

  return (
    <div className="w-full h-full max-w-xl mx-auto flex flex-col justify-between p-4 sm:p-6 bg-gradient-to-b from-[#E8F8F1] via-white to-[#E4F0FC] text-[#0B2B2B] relative select-none rounded-[32px] sm:rounded-[36px] shadow-2xl border border-emerald-100">
      {/* 1. Header Bar: Date & Logout */}
      <div className="w-full flex items-center justify-between pb-3 border-b border-emerald-200">
        <div className="flex items-center gap-2">
          <div className="w-10 h-10 rounded-full bg-white border border-emerald-300 flex items-center justify-center p-1 overflow-hidden shadow-2xs">
            <img src={logoIconImg} alt="Dr. Tech Care" className="w-full h-full object-contain" />
          </div>
          <div>
            <div className="text-[11px] font-black text-emerald-800 tracking-wide uppercase">
              DR.TECH.CARE • SMART REHAB
            </div>
            <div className="text-xs font-bold text-slate-600">{thaiDateStr}</div>
          </div>
        </div>

        <button
          onClick={onLogout}
          className="min-h-[46px] py-2 px-3.5 rounded-2xl bg-white hover:bg-rose-50 border border-rose-300 text-rose-700 font-black text-xs sm:text-sm flex items-center gap-1.5 shadow-sm active:scale-95 transition cursor-pointer"
          id="btnPatientLogoutTop"
          title="ออกจากระบบ"
        >
          <LogOut className="w-4 h-4" />
          <span>ออกจากระบบ</span>
        </button>
      </div>

      {/* 2. Patient Profile Card (Masked Surname PDPA) */}
      <div className="w-full bg-white border-2 border-emerald-300 rounded-[28px] p-5 shadow-sm my-3 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-50 rounded-full -mr-10 -mt-10 pointer-events-none" />

        <div className="flex items-start justify-between relative z-10">
          <div>
            <span className="inline-block text-[10px] font-black tracking-wider uppercase px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-900 border border-emerald-300 mb-1.5">
              ข้อมูลผู้รับบริการ (HN: {patient.patient_code || 'P-0012'})
            </span>
            <h1 className="text-2xl sm:text-3xl font-black text-[#0B2B2B] tracking-tight">
              {maskSurname(patient.name)}
            </h1>
            <p className="text-xs sm:text-sm text-slate-600 font-bold mt-0.5">
              อายุ {patient.age || 68} ปี • สิทธิ์การรักษา: สิทธิประกันสุขภาพถ้วนหน้า
            </p>
          </div>

          <div className="w-14 h-14 rounded-2xl bg-emerald-50 border-2 border-emerald-300 flex items-center justify-center text-emerald-700 font-black text-xl shadow-inner">
            👴
          </div>
        </div>

        {/* Attending Therapist Badge */}
        <div className="mt-4 pt-3 border-t border-slate-100 flex items-center gap-2.5 text-xs sm:text-sm font-bold text-emerald-950">
          <Stethoscope className="w-4 h-4 text-[#1E8A4C] shrink-0" />
          <span>นักกายภาพบำบัดผู้ดูแล: <b className="text-[#1E8A4C]">{therapistName}</b></span>
        </div>
      </div>

      {/* 3. Today's Prescription Schedule Card */}
      <div className="w-full bg-[#EBF8F2] border border-emerald-300/80 rounded-[28px] p-5 shadow-sm flex-1 flex flex-col justify-between my-1">
        <div>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Dumbbell className="w-5 h-5 text-[#1E8A4C]" />
              <h2 className="text-base sm:text-lg font-black text-[#0B2B2B]">
                แผนการทำกายภาพประจำวันนี้
              </h2>
            </div>
            <span className="text-[11px] font-extrabold bg-[#1E8A4C] text-white px-2.5 py-0.5 rounded-full">
              {planExercises.length} ท่ากายภาพ
            </span>
          </div>

          {/* Exercise Items List */}
          <div className="space-y-2 max-h-[220px] overflow-y-auto pr-1">
            {planExercises.map((ex, idx) => (
              <div
                key={idx}
                className="bg-white rounded-2xl p-3 border border-emerald-200/80 flex items-center justify-between shadow-2xs hover:border-emerald-400 transition"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-xl bg-emerald-100 text-[#1E8A4C] font-black text-sm flex items-center justify-center shrink-0">
                    {idx + 1}
                  </div>
                  <div>
                    <div className="text-xs sm:text-sm font-black text-[#0B2B2B]">
                      {ex.exerciseName || 'ท่ากายภาพบำบัด'}
                    </div>
                    <div className="text-[11px] font-semibold text-slate-500">
                      {ex.reps || 10} ครั้ง/เซ็ต • {ex.sets || 3} เซ็ต
                    </div>
                  </div>
                </div>

                <span className="text-xs font-bold text-emerald-700 bg-emerald-50 px-2 py-1 rounded-lg">
                  พร้อมฝึก
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Doctor Note Advice Box */}
        <div className="mt-3 p-3 rounded-2xl bg-white/90 border border-emerald-300/60 text-xs text-slate-700 font-semibold flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-amber-500 shrink-0" />
          <span>
            คำแนะนำ: ให้ค่อยๆ เคลื่อนไหวตามคำแนะนำของเสียงและสเกเลตัน AI หากมีอาการเจ็บสามารถกดปุ่มหยุดได้ทันที
          </span>
        </div>
      </div>

      {/* 4. Large Action Buttons (Touch targets >= 64px - 80px) */}
      <div className="w-full space-y-3 pt-3">
        {/* Main Physical Therapy Workout Button */}
        <button
          onClick={() => onStartExercise('physio')}
          className="w-full min-h-[68px] sm:min-h-[78px] py-4 px-6 rounded-[24px] bg-gradient-to-r from-[#10B981] via-[#06B6D4] to-[#2563EB] text-white font-black text-lg sm:text-xl shadow-xl shadow-cyan-500/25 hover:shadow-2xl hover:scale-[1.01] active:scale-95 transition flex items-center justify-between cursor-pointer border-2 border-white/60"
          id="btnStartPrescribedPhysio"
        >
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-white/20 backdrop-blur-sm flex items-center justify-center shrink-0 shadow-inner">
              <Play className="w-7 h-7 fill-white ml-0.5" />
            </div>
            <div className="text-left">
              <div>เริ่มต้นฝึกกายภาพบำบัด</div>
              <div className="text-xs font-bold text-cyan-100 opacity-95">
                พร้อม AI วิเคราะห์ท่าและตรวจสอบความปลอดภัย
              </div>
            </div>
          </div>
          <ChevronRight className="w-6 h-6 shrink-0 opacity-80" />
        </button>

        {/* Brain Minigame Training Button */}
        <button
          onClick={() => onStartExercise('minigame')}
          className="w-full min-h-[56px] sm:min-h-[64px] py-3 px-5 rounded-[20px] bg-white hover:bg-cyan-50/50 border-2 border-cyan-400 text-[#0B2B2B] font-black text-sm sm:text-base shadow-sm active:scale-95 transition flex items-center justify-between cursor-pointer"
          id="btnStartMinigameOption"
        >
          <div className="flex items-center gap-2.5">
            <Gamepad2 className="w-5 h-5 text-cyan-600" />
            <span>มินิเกมฝึกสมองและการตอบสนอง (Interactive Quiz)</span>
          </div>
          <span className="text-xs font-bold text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full">
            +50 XP
          </span>
        </button>
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

            {/* Countdown Badge */}
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
