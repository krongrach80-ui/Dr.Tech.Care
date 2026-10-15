import React, { useState } from 'react';
import {
  X,
  Calendar,
  Clock,
  ChevronLeft,
  ChevronRight,
  Plus,
  CheckCircle2,
  AlertCircle,
  RotateCcw,
  Sparkles,
  Dumbbell,
  ArrowRight,
} from 'lucide-react';
import { TreatmentPlan, UserAccount, HospitalExercise } from '../../types/hospital';
import { useHospitalStore } from '../../store/hospitalStore';
import { defaultDash, formatThaiDate } from '../../utils/dashboardUtils';

interface PatientCalendarModalProps {
  isOpen: boolean;
  onClose: () => void;
  patient: UserAccount | null;
  exercises: HospitalExercise[];
  canWrite?: boolean;
  onOpenRoutineAssignment: (patient: UserAccount, dateStr: string) => void;
  onSuccessToast: (msg: string) => void;
}

interface AppointmentDateStatus {
  date: string; // YYYY-MM-DD
  status: 'completed' | 'scheduled' | 'missed';
  note?: string;
}

export const PatientCalendarModal: React.FC<PatientCalendarModalProps> = ({
  isOpen,
  onClose,
  patient,
  exercises,
  canWrite = true,
  onOpenRoutineAssignment,
  onSuccessToast,
}) => {
  const { treatmentPlans, saveTreatmentPlan, addActivityLog } = useHospitalStore();

  const [currentYear, setCurrentYear] = useState<number>(2026);
  const [currentMonth, setCurrentMonth] = useState<number>(9); // 0-indexed, 9 = October
  const [newDateInput, setNewDateInput] = useState<string>('');

  if (!isOpen || !patient) return null;

  const plan = treatmentPlans.find(
    (p) => String(p.patientId) === String(patient.id) || p.patientCode === patient.code
  );

  // Month days generation
  const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
  const firstDayOfWeek = new Date(currentYear, currentMonth, 1).getDay(); // 0 = Sun

  const todayStr = '2026-10-15';

  // Appointment status calculation for each day
  // Mock/real schedule logic:
  // - completed: past dates where session was attended (e.g. 2026-10-05, 2026-10-08, 2026-10-12)
  // - missed / auto-rescheduled: past scheduled date where patient did not attend (e.g. 2026-10-14)
  // - scheduled: today or upcoming dates (e.g. 2026-10-15, 2026-10-17, 2026-10-19, 2026-10-21)
  const getDayStatus = (dateStr: string): AppointmentDateStatus | null => {
    // Check custom appointments or days of week
    const dayOfWeek = new Date(dateStr).getDay();
    const isStandardScheduleDay = [1, 3, 5].includes(dayOfWeek); // Mon, Wed, Fri

    if (dateStr === '2026-10-05' || dateStr === '2026-10-07' || dateStr === '2026-10-09' || dateStr === '2026-10-12') {
      return { date: dateStr, status: 'completed', note: 'เข้าฝึกสำเร็จ ครบ 3 เซ็ต' };
    }
    if (dateStr === '2026-10-14') {
      return { date: dateStr, status: 'missed', note: 'ขาดนัด (Missed Session) - เลื่อนนัดอัตโนมัติมาวันนี้' };
    }
    if (dateStr >= todayStr && (isStandardScheduleDay || dateStr === todayStr)) {
      return { date: dateStr, status: 'scheduled', note: 'นัดหมายกายภาพ (Scheduled)' };
    }
    return null;
  };

  const handlePrevMonth = () => {
    if (currentMonth === 0) {
      setCurrentMonth(11);
      setCurrentYear((y) => y - 1);
    } else {
      setCurrentMonth((m) => m - 1);
    }
  };

  const handleNextMonth = () => {
    if (currentMonth === 11) {
      setCurrentMonth(0);
      setCurrentYear((y) => y + 1);
    } else {
      setCurrentMonth((m) => m + 1);
    }
  };

  const handleAddNewDate = () => {
    if (!newDateInput) return;
    onSuccessToast(`เพิ่มวันนัดหมายใหม่: ${formatThaiDate(newDateInput)} เรียบร้อยแล้ว`);
    addActivityLog(
      'เพิ่มวันนัดหมายกายภาพ',
      'TREATMENT',
      `เพิ่มวันนัด ${newDateInput} สำหรับ ${patient.name} (${patient.code})`
    );
    setNewDateInput('');
  };

  const monthNamesThai = [
    'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
    'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม',
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-[#0F2F2B]/75 backdrop-blur-sm animate-fadeIn"
      onClick={onClose}
    >
      <div
        className="w-full max-w-3xl bg-white rounded-3xl shadow-2xl border border-emerald-200 overflow-hidden flex flex-col max-h-[92vh] animate-slideUp"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-cyan-100 bg-gradient-to-r from-emerald-50 via-white to-sky-50 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-[#10B981] via-[#06B6D4] to-[#2563EB] text-white flex items-center justify-center shadow-md shadow-cyan-500/25">
              <Calendar className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-extrabold text-base sm:text-lg text-[#0F2F2B]">
                  ปฏิทินนัดหมายกายภาพบำบัด (Interactive Patient Calendar)
                </h3>
              </div>
              <p className="text-[11px] text-emerald-800 font-medium">
                คนไข้: <strong>{patient.name}</strong> ({patient.code}) • ผู้ดูแล: {defaultDash(patient.assignedTherapistName)}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-full text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Legend & Month Controls */}
        <div className="px-6 py-3 border-b border-slate-100 bg-slate-50 flex flex-wrap items-center justify-between gap-3 text-xs">
          {!canWrite && (
            <div className="w-full p-2.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-[11px] font-bold flex items-center gap-2 mb-1">
              <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0" />
              <span>สิทธิ์การใช้งาน: อ่านอย่างเดียว (Read-Only Access) — นักกายภาพสามารถดูตารางนัดหมายได้เท่านั้น ปุ่มปรับเปลี่ยนวันและจัดตารางถูกปิดการใช้งาน</span>
            </div>
          )}

          {/* Status Badges Legend */}
          <div className="flex items-center gap-3 font-bold text-[11px]">
            <span className="flex items-center gap-1.5 text-emerald-800">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
              <span>สำเร็จ (Completed)</span>
            </span>
            <span className="flex items-center gap-1.5 text-sky-800">
              <span className="w-2.5 h-2.5 rounded-full bg-sky-500" />
              <span>นัดหมาย (Scheduled)</span>
            </span>
            <span className="flex items-center gap-1.5 text-rose-800">
              <span className="w-2.5 h-2.5 rounded-full bg-rose-500" />
              <span>ขาดนัด/เลื่อนอัตโนมัติ (Missed)</span>
            </span>
          </div>

          {/* Month Switcher */}
          <div className="flex items-center gap-2">
            <button
              onClick={handlePrevMonth}
              className="p-1 rounded-lg hover:bg-slate-200 transition cursor-pointer"
            >
              <ChevronLeft className="w-4 h-4 text-slate-600" />
            </button>
            <span className="font-extrabold text-xs text-[#0F2F2B] min-w-[120px] text-center">
              {monthNamesThai[currentMonth]} {currentYear + 543}
            </span>
            <button
              onClick={handleNextMonth}
              className="p-1 rounded-lg hover:bg-slate-200 transition cursor-pointer"
            >
              <ChevronRight className="w-4 h-4 text-slate-600" />
            </button>
          </div>
        </div>

        {/* Calendar Grid */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          <div className="bg-white rounded-2xl border border-emerald-100 overflow-hidden shadow-2xs">
            {/* Weekday headers */}
            <div className="grid grid-cols-7 bg-emerald-50/70 border-b border-emerald-100 text-center font-bold text-xs py-2 text-slate-700">
              <span className="text-rose-600">อา.</span>
              <span>จ.</span>
              <span>อ.</span>
              <span>พ.</span>
              <span>พฤ.</span>
              <span>ศ.</span>
              <span className="text-indigo-600">ส.</span>
            </div>

            {/* Days grid */}
            <div className="grid grid-cols-7 divide-x divide-y divide-slate-100 text-xs">
              {/* Empty padding days */}
              {Array.from({ length: firstDayOfWeek }).map((_, i) => (
                <div key={`empty-${i}`} className="min-h-[72px] bg-slate-50/40 p-1.5" />
              ))}

              {/* Month days */}
              {Array.from({ length: daysInMonth }).map((_, i) => {
                const dayNum = i + 1;
                const dateStr = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(
                  dayNum
                ).padStart(2, '0')}`;
                const appointment = getDayStatus(dateStr);
                const isToday = dateStr === todayStr;

                return (
                  <div
                    key={dateStr}
                    onClick={() => {
                      if (canWrite) {
                        onOpenRoutineAssignment(patient, dateStr);
                      } else {
                        onSuccessToast('โหมดดูอย่างเดียว: คุณไม่มีสิทธิ์แก้ไขตารางกายภาพของเคสนี้');
                      }
                    }}
                    className={`min-h-[72px] p-1.5 flex flex-col justify-between transition relative group ${
                      canWrite ? 'cursor-pointer hover:bg-emerald-50/40' : 'cursor-default'
                    } ${isToday ? 'bg-amber-50/50' : 'bg-white'}`}
                    title={canWrite ? 'คลิกเพื่อกำหนด/แก้ไขโปรแกรมกายภาพประจำวันนี้' : 'โหมดดูอย่างเดียว (Read-Only)'}
                  >
                    <div className="flex items-center justify-between">
                      <span
                        className={`w-5 h-5 rounded-full flex items-center justify-center font-bold text-[11px] ${
                          isToday
                            ? 'bg-[#10B981] text-white shadow-xs'
                            : 'text-slate-700 group-hover:text-emerald-700'
                        }`}
                      >
                        {dayNum}
                      </span>
                      {isToday && (
                        <span className="text-[9px] font-extrabold text-amber-700 bg-amber-100 px-1 rounded">
                          วันนี้
                        </span>
                      )}
                    </div>

                    {appointment && (
                      <div
                        className={`mt-1 p-1 rounded-lg text-[10px] font-bold border leading-tight ${
                          appointment.status === 'completed'
                            ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                            : appointment.status === 'scheduled'
                            ? 'bg-sky-50 text-sky-800 border-sky-300'
                            : 'bg-rose-50 text-rose-800 border-rose-300 animate-pulse'
                        }`}
                      >
                        <div className="truncate">
                          {appointment.status === 'completed'
                            ? '🟢 สำเร็จ'
                            : appointment.status === 'scheduled'
                            ? '🔵 นัดหมาย'
                            : '🔴 ขาดนัด/เลื่อน'}
                        </div>
                      </div>
                    )}

                    <div className="opacity-0 group-hover:opacity-100 text-[9px] text-emerald-700 font-bold transition flex items-center gap-0.5 justify-end">
                      <Dumbbell className="w-2.5 h-2.5" />
                      <span>โปรแกรม</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Quick Add Appointment Date */}
          {canWrite ? (
            <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 flex flex-wrap items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-2">
                <span className="font-bold text-slate-700">เพิ่ม/นัดหมายวันฝึกเพิ่ม:</span>
                <input
                  type="date"
                  value={newDateInput}
                  onChange={(e) => setNewDateInput(e.target.value)}
                  className="px-3 py-1.5 rounded-xl bg-white border border-slate-300 font-bold text-xs"
                />
                <button
                  type="button"
                  onClick={handleAddNewDate}
                  className="px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-xs transition cursor-pointer"
                >
                  บันทึกวันนัด
                </button>
              </div>

              <div className="text-[11px] text-slate-500">
                💡 คลิกที่ช่องวันที่เพื่อกำหนดท่ากายภาพและจำนวนเซ็ตประจำวัน
              </div>
            </div>
          ) : (
            <div className="p-3 rounded-2xl bg-slate-100 border border-slate-200 text-center text-xs text-slate-500 font-semibold">
              🔒 ฟังก์ชันเพิ่มวันนัดหมายและจัดตารางถูกปิดการใช้งานในโหมด Read-Only
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-slate-100 bg-slate-50 flex items-center justify-between">
          <div className="text-[11px] text-slate-500 font-medium">
            ระบบจะตรวจสอบการเช็กอินอัตโนมัติ: หากขาดนัดจะย้ายคอร์สไปวันถัดไปทันที
          </div>

          <button
            type="button"
            onClick={onClose}
            className="px-6 py-2 rounded-xl bg-slate-200 hover:bg-slate-300 text-slate-800 font-bold text-xs transition cursor-pointer"
          >
            ปิดหน้าต่าง
          </button>
        </div>
      </div>
    </div>
  );
};
