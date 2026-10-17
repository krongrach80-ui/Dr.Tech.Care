import React, { useState } from 'react';
import {
  X,
  Settings,
  Activity,
  Gamepad2,
  Check,
  ArrowRight,
  ArrowLeft,
  Clock,
  Laptop,
  Sparkles,
  AlertTriangle,
} from 'lucide-react';
import { formatThaiDate } from '../../utils/dashboardUtils';

interface CourseModeSelectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  patient: any;
  dateStr: string; // e.g. '2026-10-16'
  onSaveCourse: (courseData: {
    mode: 'physio' | 'minigame';
    date: string;
    patientId: string | number;
    patientName: string;
    patientCode: string;
    timeSlot: string;
    station: string;
    notes?: string;
  }) => void;
}

export const CourseModeSelectionModal: React.FC<CourseModeSelectionModalProps> = ({
  isOpen,
  onClose,
  patient,
  dateStr,
  onSaveCourse,
}) => {
  const [step, setStep] = useState<1 | 2>(1);
  const [selectedMode, setSelectedMode] = useState<'physio' | 'minigame'>('minigame');
  const [timeSlot, setTimeSlot] = useState<string>('09:30 - 10:30');
  const [station, setStation] = useState<string>('ตู้ Kiosk 1');
  const [courseNotes, setCourseNotes] = useState<string>('คอร์สกายภาพบำบัดฟื้นฟูต่อเนื่อง');

  if (!isOpen || !patient) return null;

  // Format date, e.g. วันศุกร์ที่ 16 ตุลาคม 2569
  const formatThaiDayName = (dateIso: string) => {
    try {
      const d = new Date(dateIso);
      const dayIndex = d.getDay();
      const thaiDays = [
        'วันอาทิตย์',
        'วันจันทร์',
        'วันอังคาร',
        'วันพุธ',
        'วันพฤหัสบดี',
        'วันศุกร์',
        'วันเสาร์',
      ];
      return `${thaiDays[dayIndex]}ที่ ${formatThaiDate(dateIso)}`;
    } catch {
      return formatThaiDate(dateIso);
    }
  };

  const formattedDateTitle = formatThaiDayName(dateStr);
  const patientName = patient.name || 'นายสมชาย ใจดี';
  const patientCode = patient.code || patient.patient_code || 'P-0012';

  const handleNextStep = () => {
    setStep(2);
  };

  const handleBackStep = () => {
    setStep(1);
  };

  const handleConfirmSave = () => {
    onSaveCourse({
      mode: selectedMode,
      date: dateStr,
      patientId: patient.id || 12,
      patientName,
      patientCode,
      timeSlot,
      station,
      notes: courseNotes,
    });
    setStep(1);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-[#0F2F2B]/60 backdrop-blur-sm animate-fadeIn"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl bg-white rounded-[32px] shadow-2xl border border-emerald-100 overflow-hidden animate-scaleUp text-left"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header matching Image 3 */}
        <div className="p-6 sm:p-7 border-b border-slate-100 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-xl sm:text-2xl font-black text-[#0B2B2B] tracking-tight">
              {step === 1 ? 'เลือกรูปแบบการฝึก' : 'ตั้งค่ารายละเอียดคอร์ส'}
            </h2>
            <p className="text-xs sm:text-sm text-slate-500 font-semibold mt-1">
              {patientName} - เริ่มคอร์ส{formattedDateTitle}
            </p>
          </div>

          <div className="flex items-center gap-3 flex-shrink-0">
            <span className="text-xs font-extrabold text-slate-500 bg-slate-100 px-3 py-1 rounded-full">
              ขั้นที่ {step} จาก 2
            </span>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-full hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* STEP 1: Two Selection Cards matching Image 3 */}
        {step === 1 && (
          <div className="p-6 sm:p-7 space-y-6">
            <div className="flex items-center gap-2 text-xs font-bold text-slate-700">
              <div className="w-7 h-7 rounded-xl bg-slate-100 flex items-center justify-center text-slate-600">
                <Settings className="w-4 h-4" />
              </div>
              <span>ตั้งค่ารูปแบบการฝึก</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-5">
              {/* Option A: กายภาพปกติ */}
              <div
                onClick={() => setSelectedMode('physio')}
                className={`p-6 rounded-3xl border-2 transition-all flex flex-col justify-between cursor-pointer relative ${
                  selectedMode === 'physio'
                    ? 'border-emerald-500 bg-emerald-50/20 shadow-md ring-4 ring-emerald-100'
                    : 'border-slate-200 hover:border-slate-300 bg-white'
                }`}
              >
                {selectedMode === 'physio' && (
                  <div className="absolute top-4 right-4 w-6 h-6 rounded-full bg-emerald-500 text-white flex items-center justify-center shadow-sm">
                    <Check className="w-4 h-4 stroke-[3]" />
                  </div>
                )}

                <div className="space-y-3">
                  <div className="w-14 h-14 rounded-2xl bg-emerald-50 text-emerald-600 border border-emerald-200 flex items-center justify-center shadow-xs">
                    <Activity className="w-7 h-7 text-emerald-600 stroke-[2.5]" />
                  </div>

                  <div>
                    <h3 className="text-lg font-black text-[#0B2B2B]">กายภาพปกติ</h3>
                    <p className="text-xs text-slate-500 font-medium mt-1 leading-relaxed">
                      ฝึกตามท่าที่นักกายภาพกำหนด กล้องที่ตู้ Kiosk วิเคราะห์ท่าทางและให้คะแนนแต่ละท่า
                    </p>
                  </div>

                  <div className="flex flex-wrap gap-1.5 pt-1">
                    <span className="px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-800 text-[11px] font-black border border-emerald-200">
                      วิเคราะห์ท่าด้วย AI
                    </span>
                    <span className="px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-800 text-[11px] font-black border border-emerald-200">
                      คะแนนต่อท่า
                    </span>
                  </div>
                </div>

                <div className="pt-6">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedMode('physio');
                    }}
                    className={`w-full py-2.5 px-4 rounded-2xl font-black text-xs transition cursor-pointer ${
                      selectedMode === 'physio'
                        ? 'bg-emerald-600 text-white shadow-sm'
                        : 'bg-white border border-slate-300 text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    {selectedMode === 'physio' ? 'เลือกแบบนี้แล้ว' : 'เลือกแบบนี้'}
                  </button>
                </div>
              </div>

              {/* Option B: มินิเกมฝึกสมอง (Purple Theme matching Image 3) */}
              <div
                onClick={() => setSelectedMode('minigame')}
                className={`p-6 rounded-3xl border-2 transition-all flex flex-col justify-between cursor-pointer relative ${
                  selectedMode === 'minigame'
                    ? 'border-[#8B5CF6] bg-purple-50/20 shadow-md ring-4 ring-purple-100'
                    : 'border-slate-200 hover:border-slate-300 bg-white'
                }`}
              >
                {selectedMode === 'minigame' && (
                  <div className="absolute top-4 right-4 w-6 h-6 rounded-full bg-[#8B5CF6] text-white flex items-center justify-center shadow-sm">
                    <Check className="w-4 h-4 stroke-[3]" />
                  </div>
                )}

                <div className="space-y-3">
                  <div className="w-14 h-14 rounded-2xl bg-purple-100 text-purple-600 border border-purple-200 flex items-center justify-center shadow-xs">
                    <Gamepad2 className="w-7 h-7 text-purple-600 stroke-[2.2]" />
                  </div>

                  <div>
                    <h3 className="text-lg font-black text-[#0B2B2B]">มินิเกมฝึกสมอง</h3>
                    <p className="text-xs text-slate-500 font-medium mt-1 leading-relaxed">
                      ฝึกกายภาพผ่านเกมสั้น ๆ ขยับร่างกายเพื่อเล่นเกม ช่วยให้คนไข้สนุกและฝึกต่อเนื่อง พร้อมฝึกสมองไปด้วย
                    </p>
                  </div>

                  <div className="flex flex-wrap gap-1.5 pt-1">
                    <span className="px-2.5 py-1 rounded-full bg-purple-50 text-purple-800 text-[11px] font-black border border-purple-200">
                      เล่นด้วยการขยับตัว
                    </span>
                    <span className="px-2.5 py-1 rounded-full bg-purple-50 text-purple-800 text-[11px] font-black border border-purple-200">
                      ฝึกสมอง
                    </span>
                  </div>
                </div>

                <div className="pt-6">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedMode('minigame');
                    }}
                    className={`w-full py-2.5 px-4 rounded-2xl font-black text-xs transition cursor-pointer ${
                      selectedMode === 'minigame'
                        ? 'bg-[#8B5CF6] text-white shadow-sm'
                        : 'bg-white border border-slate-300 text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    {selectedMode === 'minigame' ? 'เลือกแบบนี้แล้ว' : 'เลือกแบบนี้'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* STEP 2: Time & Station Details Setup */}
        {step === 2 && (
          <div className="p-6 sm:p-7 space-y-5 animate-fadeIn">
            {selectedMode === 'physio' && (
              <div className="p-3.5 rounded-2xl bg-amber-50 border border-amber-300 text-amber-900 text-xs font-medium flex items-start gap-2.5">
                <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
                <div>
                  <strong>ข้อกำหนดการพัฒนา:</strong> ระบบวิเคราะห์ท่ากายภาพด้วย AI อยู่ระหว่างการพัฒนา
                  ในระหว่างนี้ระบบจะแนะนำให้คนไข้ทำกายภาพผ่านมินิเกมฝึกสมองเพื่อความปลอดภัย
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  ช่วงเวลานัดหมาย (Time Slot)
                </label>
                <select
                  value={timeSlot}
                  onChange={(e) => setTimeSlot(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-xs font-bold text-[#0B2B2B] bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#00B4D8]"
                >
                  <option value="09:00 - 10:00">09:00 - 10:00 น. (ช่วงเช้า)</option>
                  <option value="09:30 - 10:30">09:30 - 10:30 น. (คอร์สมาตรฐาน)</option>
                  <option value="10:30 - 11:30">10:30 - 11:30 น. (ช่วงสาย)</option>
                  <option value="13:30 - 14:30">13:30 - 14:30 น. (ช่วงบ่าย)</option>
                  <option value="15:00 - 16:00">15:00 - 16:00 น. (ช่วงเย็น)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  จุดบริการ / ตู้ Kiosk ประจำ
                </label>
                <select
                  value={station}
                  onChange={(e) => setStation(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-xs font-bold text-[#0B2B2B] bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#00B4D8]"
                >
                  <option value="ตู้ Kiosk 1">ตู้ Kiosk 1 (แผนกฟื้นฟูกายภาพ)</option>
                  <option value="ตู้ Kiosk 2">ตู้ Kiosk 2 (ศูนย์ผู้สูงอายุ)</option>
                  <option value="ตู้ Kiosk 3">ตู้ Kiosk 3 (ห้องกิจกรรมบำบัด)</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                บันทึกคำแนะนำสำหรับคนไข้
              </label>
              <textarea
                value={courseNotes}
                onChange={(e) => setCourseNotes(e.target.value)}
                rows={3}
                placeholder="ระบุคำแนะนำทางการแพทย์เพิ่มเติม เช่น ให้พักกล้ามเนื้อหากมีอาการปวด..."
                className="w-full p-3 rounded-xl border border-slate-300 text-xs text-slate-700 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#00B4D8]"
              />
            </div>
          </div>
        )}

        {/* Footer Actions */}
        <div className="p-6 bg-slate-50/80 border-t border-slate-100 flex items-center justify-end gap-3">
          {step === 1 ? (
            <>
              <button
                type="button"
                onClick={onClose}
                className="px-6 py-2.5 rounded-full border border-slate-200 text-slate-600 hover:bg-white font-bold text-xs transition cursor-pointer"
              >
                ยกเลิก
              </button>

              <button
                type="button"
                onClick={handleNextStep}
                className="px-6 py-2.5 rounded-full bg-gradient-to-r from-[#00B4D8] to-[#0096C7] hover:opacity-95 text-white font-black text-xs shadow-md shadow-cyan-500/25 flex items-center gap-2 transition cursor-pointer active:scale-95"
              >
                <span>ถัดไป: ตั้งค่าคอร์ส</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={handleBackStep}
                className="px-6 py-2.5 rounded-full border border-slate-200 text-slate-600 hover:bg-white font-bold text-xs transition cursor-pointer flex items-center gap-1.5"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>ย้อนกลับ</span>
              </button>

              <button
                type="button"
                onClick={handleConfirmSave}
                className="px-6 py-2.5 rounded-full bg-gradient-to-r from-[#10B981] to-[#059669] hover:opacity-95 text-white font-black text-xs shadow-md shadow-emerald-500/25 flex items-center gap-2 transition cursor-pointer active:scale-95"
              >
                <span>บันทึกและเปิดคอร์ส</span>
                <Check className="w-4 h-4" />
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
