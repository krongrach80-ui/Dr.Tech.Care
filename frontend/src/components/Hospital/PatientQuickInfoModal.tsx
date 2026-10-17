import React from 'react';
import {
  X,
  User,
  ArrowRight,
  Target,
  Clock,
  Sparkles,
} from 'lucide-react';
import { UserAccount, TreatmentPlan } from '../../types/hospital';

interface PatientQuickInfoModalProps {
  isOpen: boolean;
  onClose: () => void;
  patient: UserAccount | null;
  plan?: TreatmentPlan | null;
  onGoToCalendar: (patient: UserAccount) => void;
}

export const PatientQuickInfoModal: React.FC<PatientQuickInfoModalProps> = ({
  isOpen,
  onClose,
  patient,
  plan,
  onGoToCalendar,
}) => {
  if (!isOpen || !patient) return null;

  const patientName = patient.name || 'นายสมชาย ใจดี';
  const patientHN = patient.code || (plan ? plan.patientCode : 'P-0012');
  const diagnosis =
    patient.diagnosis ||
    (plan ? plan.diagnosis : 'ข้อไหล่ติดระยะฟื้นฟู (Frozen Shoulder)');
  const targetArea =
    (plan ? plan.targetJoint : null) ||
    patient.chiefComplaint ||
    'ข้อไหล่และกล้ามเนื้อสะบัก (Shoulder & Scapula)';
  const timeSlot = plan?.timeSlot || '09:30 - 10:30';
  const roomStation = plan?.roomStation || 'ตู้ Kiosk 1';
  const exerciseCount = plan?.assignedExercises?.length || 3;

  // Course progress calculation
  const completedSessions = 4;
  const totalSessions = 10;
  const progressPercent = Math.round((completedSessions / totalSessions) * 100);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-[#0B2522]/65 backdrop-blur-xs animate-fadeIn font-sans"
      onClick={onClose}
    >
      <div
        className="w-full max-w-[500px] bg-white rounded-[30px] shadow-2xl overflow-hidden border border-emerald-100 flex flex-col animate-scaleUp"
        onClick={(e) => e.stopPropagation()}
        style={{ borderRadius: '28px' }}
      >
        {/* Header: Teal-Emerald-Sky Gradient (Matching Image 1) */}
        <div className="bg-gradient-to-r from-[#0d9488] via-[#059669] to-[#0284c7] px-6 py-5 text-white relative">
          {/* Close button X */}
          <button
            onClick={onClose}
            className="absolute top-4 right-4 w-8 h-8 rounded-full bg-white/20 hover:bg-white/30 text-white flex items-center justify-center transition active:scale-95 cursor-pointer"
            title="ปิดหน้าต่าง"
          >
            <X className="w-4 h-4" />
          </button>

          <div className="flex items-center gap-3.5 pr-8">
            {/* Avatar Circle */}
            <div className="w-14 h-14 rounded-full border-2 border-white/60 bg-white/10 flex items-center justify-center flex-shrink-0 text-white shadow-inner">
              <User className="w-7 h-7 stroke-[2]" />
            </div>

            {/* Title & Badges */}
            <div className="min-w-0">
              <div className="text-[11px] font-semibold text-emerald-100/90 leading-tight">
                ข้อมูลคนไข้
              </div>
              <h3 className="text-xl sm:text-2xl font-black text-white truncate tracking-tight mt-0.5">
                {patientName}
              </h3>
              <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                <span className="font-mono text-xs font-bold text-white bg-white/20 px-2.5 py-0.5 rounded-full backdrop-blur-xs border border-white/30">
                  HN: {patientHN}
                </span>
                <span className="inline-flex items-center gap-1 bg-white text-emerald-900 font-extrabold text-[11px] px-3 py-0.5 rounded-full shadow-2xs">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  <span>กำลังรักษา (Active)</span>
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Modal Body: Information Cards */}
        <div className="p-5 sm:p-6 space-y-3.5 bg-white">
          {/* Row 1: อาการ / โรค */}
          <div className="flex items-start gap-3.5 p-3 rounded-2xl bg-slate-50/70 border border-slate-100 hover:border-emerald-200 transition">
            <div className="w-10 h-10 rounded-xl bg-emerald-50 border border-emerald-200/80 text-emerald-700 flex items-center justify-center flex-shrink-0 mt-0.5">
              <Target className="w-5 h-5" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-[11px] font-bold text-slate-400">
                อาการ / โรค
              </div>
              <div className="text-sm sm:text-base font-black text-[#0B2B2B] mt-0.5 leading-snug">
                {diagnosis}
              </div>
            </div>
          </div>

          {/* Row 2: บริเวณที่รักษา */}
          <div className="flex items-start gap-3.5 p-3 rounded-2xl bg-slate-50/70 border border-slate-100 hover:border-emerald-200 transition">
            <div className="w-10 h-10 rounded-xl bg-teal-50 border border-teal-200/80 text-teal-700 flex items-center justify-center flex-shrink-0 mt-0.5">
              <Sparkles className="w-5 h-5" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-[11px] font-bold text-slate-400">
                บริเวณที่รักษา
              </div>
              <div className="text-sm sm:text-base font-black text-[#0B2B2B] mt-0.5 leading-snug">
                {targetArea}
              </div>
            </div>
          </div>

          {/* Row 3: นัดหมายวันนี้ */}
          <div className="flex items-start gap-3.5 p-3 rounded-2xl bg-slate-50/70 border border-slate-100 hover:border-sky-200 transition">
            <div className="w-10 h-10 rounded-xl bg-sky-50 border border-sky-200/80 text-sky-700 flex items-center justify-center flex-shrink-0 mt-0.5">
              <Clock className="w-5 h-5" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-[11px] font-bold text-slate-400">
                นัดหมายวันนี้
              </div>
              <div className="text-sm sm:text-base font-black text-[#0B2B2B] mt-0.5 leading-snug">
                {timeSlot} • {roomStation} • {exerciseCount} ท่าฝึก
              </div>
            </div>
          </div>

          {/* Progress Bar: คอร์สกายภาพปัจจุบัน ครั้งที่ 4 จาก 10 */}
          <div className="pt-2">
            <div className="flex items-center justify-between text-xs font-bold mb-1.5">
              <span className="text-slate-500">คอร์สกายภาพปัจจุบัน</span>
              <span className="text-slate-800 font-extrabold text-sm">
                ครั้งที่ {completedSessions} จาก {totalSessions}
              </span>
            </div>
            <div className="w-full h-3 rounded-full bg-slate-100 overflow-hidden p-0.5 border border-slate-200/60">
              <div
                className="h-full rounded-full bg-gradient-to-r from-[#10b981] via-[#06b6d4] to-[#0ea5e9] transition-all duration-500"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>

          {/* Bottom Action Buttons (Matching Image 1) */}
          <div className="pt-3 flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="px-6 py-2.5 rounded-full border border-slate-200 hover:bg-slate-50 text-slate-700 font-bold text-xs sm:text-sm transition cursor-pointer active:scale-95"
            >
              ปิด
            </button>

            <button
              type="button"
              onClick={() => {
                onClose();
                onGoToCalendar(patient);
              }}
              className="px-6 py-2.5 rounded-full bg-gradient-to-r from-[#10b981] to-[#0ea5e9] hover:opacity-95 text-white font-extrabold text-xs sm:text-sm shadow-md shadow-cyan-500/25 transition flex items-center gap-2 cursor-pointer active:scale-95"
            >
              <span>ไปหน้าปฏิทิน เพื่อตัดคอสใหม่</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
