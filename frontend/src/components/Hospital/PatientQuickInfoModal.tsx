import {
  X,
  User,
  Target,
  Activity,
  Clock,
  ArrowRight,
  Trash2,
} from 'lucide-react';
import { TreatmentPlan, UserAccount } from '../../types/hospital';

interface PatientQuickInfoModalProps {
  isOpen: boolean;
  onClose: () => void;
  patient: UserAccount | any | null;
  treatmentPlan?: TreatmentPlan | null;
  dayNumber?: number | null;
  onDeleteAppointmentDate?: () => void;
  onNavigateToCalendar: (patient: UserAccount | any) => void;
}

export const PatientQuickInfoModal: React.FC<PatientQuickInfoModalProps> = ({
  isOpen,
  onClose,
  patient,
  treatmentPlan,
  dayNumber,
  onDeleteAppointmentDate,
  onNavigateToCalendar,
}) => {
  if (!isOpen || !patient) return null;

  const patientName = patient.name || treatmentPlan?.patientName || 'ผู้รับบริการ';
  const patientHn = patient.code || patient.patient_code || treatmentPlan?.patientCode || 'P-0001';
  const diagnosis =
    treatmentPlan?.diagnosis ||
    patient.diagnosis ||
    patient.chiefComplaint ||
    'ข้อไหล่ติดระยะฟื้นฟู (Frozen Shoulder)';
  const targetJoint =
    treatmentPlan?.targetJoint ||
    patient.targetJoint ||
    'ข้อไหล่และกล้ามเนื้อสะบัก (Shoulder & Scapula)';
  const timeSlot = treatmentPlan?.timeSlot || '09:30 - 10:30';
  const station = treatmentPlan?.roomStation || 'ตู้ Kiosk 1';
  const exerciseCount = treatmentPlan?.assignedExercises?.length || 3;

  const currentSession = 4;
  const totalSessions = 10;
  const progressPercent = Math.min(100, Math.round((currentSession / totalSessions) * 100));

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#0F2F2B]/60 backdrop-blur-sm animate-fadeIn"
      onClick={onClose}
    >
      <div
        className="w-full max-w-[460px] bg-white rounded-[32px] shadow-2xl border border-emerald-100 overflow-hidden animate-scaleUp text-center"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header: Teal Container matching Image 1 */}
        <div className="bg-gradient-to-b from-[#0097A7] via-[#00897B] to-[#00838F] text-white pt-6 pb-5 px-6 relative flex flex-col items-center">
          {/* Close button X */}
          <button
            type="button"
            onClick={onClose}
            className="absolute top-4 right-4 w-8 h-8 rounded-full bg-white/20 hover:bg-white/30 text-white flex items-center justify-center transition cursor-pointer"
            title="ปิดหน้าต่าง"
          >
            <X className="w-4 h-4" />
          </button>

          {/* User Avatar Circle */}
          <div className="w-16 h-16 rounded-full border-2 border-white/90 bg-white/10 flex items-center justify-center mb-2 shadow-inner text-white">
            <User className="w-8 h-8 text-white stroke-[2.2]" />
          </div>

          <span className="text-white/85 text-xs font-semibold">ข้อมูลคนไข้</span>
          <h3 className="text-xl sm:text-2xl font-black text-white tracking-tight mt-0.5">
            {patientName}
          </h3>

          {/* Badges: HN & Active status */}
          <div className="flex items-center gap-2 mt-2">
            <span className="px-3 py-0.5 rounded-full bg-white/20 border border-white/30 font-mono text-xs font-extrabold text-white">
              HN: {patientHn}
            </span>
            <span className="px-3 py-0.5 rounded-full bg-white text-[#00838F] text-xs font-extrabold shadow-2xs flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span>กำลังรักษา (Active)</span>
            </span>
          </div>
        </div>

        {/* Body Cards matching Image 1 */}
        <div className="p-6 space-y-3.5 text-left">
          {/* Card 1: อาการ / โรค */}
          <div className="p-3.5 rounded-2xl bg-slate-50/80 border border-slate-100 flex items-center gap-3.5">
            <div className="w-10 h-10 rounded-full bg-emerald-100/80 text-emerald-700 flex items-center justify-center flex-shrink-0">
              <Target className="w-5 h-5 text-emerald-600" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-[11px] font-bold text-slate-400">อาการ / โรค</div>
              <div className="text-xs sm:text-sm font-black text-[#0F2F2B] leading-snug truncate">
                {diagnosis}
              </div>
            </div>
          </div>

          {/* Card 2: บริเวณที่รักษา */}
          <div className="p-3.5 rounded-2xl bg-slate-50/80 border border-slate-100 flex items-center gap-3.5">
            <div className="w-10 h-10 rounded-full bg-emerald-100/80 text-emerald-700 flex items-center justify-center flex-shrink-0">
              <Activity className="w-5 h-5 text-emerald-600" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-[11px] font-bold text-slate-400">บริเวณที่รักษา</div>
              <div className="text-xs sm:text-sm font-black text-[#0F2F2B] leading-snug truncate">
                {targetJoint}
              </div>
            </div>
          </div>

          {/* Card 3: นัดหมายวันนี้ */}
          <div className="p-3.5 rounded-2xl bg-slate-50/80 border border-slate-100 flex items-center gap-3.5">
            <div className="w-10 h-10 rounded-full bg-sky-100/80 text-sky-700 flex items-center justify-center flex-shrink-0">
              <Clock className="w-5 h-5 text-sky-600" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-[11px] font-bold text-slate-400">นัดหมายวันนี้</div>
              <div className="text-xs sm:text-sm font-black text-[#0F2F2B] leading-snug truncate">
                {timeSlot} • {station} • {exerciseCount} ท่าฝึก
              </div>
            </div>
          </div>

          {/* Progress Section: คอร์สกายภาพปัจจุบัน */}
          <div className="pt-2 space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold text-slate-500">คอร์สกายภาพปัจจุบัน</span>
              <span className="font-black text-[#0F2F2B]">
                ครั้งที่ {currentSession} จาก {totalSessions}
              </span>
            </div>
            <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-emerald-400 to-cyan-500 rounded-full transition-all duration-500"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>
        </div>

        {/* Footer Actions matching Image 1 */}
        <div className="px-6 pb-6 pt-1 flex flex-wrap items-center justify-center gap-2.5">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2.5 rounded-full border border-slate-200 text-slate-600 hover:bg-slate-50 font-bold text-xs transition cursor-pointer active:scale-95"
          >
            ปิด
          </button>

          {onDeleteAppointmentDate && (
            <button
              type="button"
              onClick={() => {
                onDeleteAppointmentDate();
                onClose();
              }}
              className="px-5 py-2.5 rounded-full border border-rose-300 bg-rose-50 hover:bg-rose-100 text-rose-700 font-black text-xs flex items-center gap-1.5 transition cursor-pointer active:scale-95 shadow-2xs"
              title="ลบวันนัดหมายนี้ออกจากปฏิทิน"
            >
              <Trash2 className="w-4 h-4 text-rose-600" />
              <span>ลบวันนัดนี้ {dayNumber ? `(วันที่ ${dayNumber})` : ''}</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => {
              onClose();
              onNavigateToCalendar(patient);
            }}
            className="px-5 py-2.5 rounded-full bg-gradient-to-r from-[#00B4D8] to-[#0096C7] hover:opacity-95 text-white font-black text-xs shadow-md shadow-cyan-500/25 flex items-center gap-2 transition cursor-pointer active:scale-95"
          >
            <span>ไปหน้าปฏิทิน เพื่อตัดคอร์สใหม่</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};
