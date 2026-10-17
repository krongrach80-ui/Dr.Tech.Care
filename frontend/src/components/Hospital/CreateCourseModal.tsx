import React, { useState, useMemo } from 'react';
import {
  X,
  Calendar,
  Clock,
  Monitor,
  ArrowLeft,
  ArrowRight,
  Sparkles,
  Gamepad2,
  Activity,
  Layers,
  Check,
} from 'lucide-react';
import { UserAccount, TreatmentPlan } from '../../types/hospital';
import { useHospitalStore } from '../../store/hospitalStore';
import { TrainingMode } from './SelectTrainingModeModal';

interface CreateCourseModalProps {
  isOpen: boolean;
  onClose: () => void;
  onBackToStep1: () => void;
  patient: UserAccount | null;
  startDateStr: string; // "YYYY-MM-DD" e.g. "2026-10-16"
  trainingMode: TrainingMode;
  onSuccess: (newPlan: Partial<TreatmentPlan>) => void;
}

const WEEKDAY_OPTIONS = [
  { key: 'จันทร์', short: 'จ.', label: 'จันทร์', dot: 'bg-amber-500', color: 'border-amber-300 text-amber-950' },
  { key: 'อังคาร', short: 'อ.', label: 'อังคาร', dot: 'bg-pink-500', color: 'border-pink-300 text-pink-950' },
  { key: 'พุธ', short: 'พ.', label: 'พุธ', dot: 'bg-emerald-500', color: 'border-emerald-300 text-emerald-950' },
  { key: 'พฤหัสบดี', short: 'พฤ.', label: 'พฤหัสบดี', dot: 'bg-orange-500', color: 'border-orange-300 text-orange-950' },
  { key: 'ศุกร์', short: 'ศ.', label: 'ศุกร์', dot: 'bg-blue-500', color: 'border-blue-300 text-blue-950' },
  { key: 'เสาร์', short: 'ส.', label: 'เสาร์', dot: 'bg-purple-500', color: 'border-purple-300 text-purple-950' },
  { key: 'อาทิตย์', short: 'อา.', label: 'อาทิตย์', dot: 'bg-red-500', color: 'border-red-300 text-red-950' },
];

const TIME_SLOT_OPTIONS = [
  { id: '09:30 - 10:30', label: '09:30 - 10:30 น.', period: 'เช้า 1' },
  { id: '11:00 - 12:00', label: '11:00 - 12:00 น.', period: 'เช้า 2' },
  { id: '13:30 - 14:30', label: '13:30 - 14:30 น.', period: 'บ่าย 1' },
  { id: '15:00 - 16:00', label: '15:00 - 16:00 น.', period: 'บ่าย 2' },
];

const KIOSK_OPTIONS = ['ตู้ Kiosk 1', 'ตู้ Kiosk 2', 'ตู้ Kiosk 3'];

const PRESET_SESSION_COUNTS = [5, 8, 10, 12];

export const CreateCourseModal: React.FC<CreateCourseModalProps> = ({
  isOpen,
  onClose,
  onBackToStep1,
  patient,
  startDateStr,
  trainingMode,
  onSuccess,
}) => {
  const { treatmentPlans, addActivityLog } = useHospitalStore();

  // Form states
  const [startDate, setStartDate] = useState<string>(startDateStr || '2026-10-16');
  const [selectedSessionCount, setSelectedSessionCount] = useState<number>(10);
  const [isCustomCount, setIsCustomCount] = useState<boolean>(false);
  const [customCountInput, setCustomCountInput] = useState<string>('15');

  // Days in week: default Mon, Wed, Fri
  const [selectedDays, setSelectedDays] = useState<string[]>(['จันทร์', 'พุธ', 'ศุกร์']);

  // Time & Kiosk
  const [selectedTimeSlot, setSelectedTimeSlot] = useState<string>('09:30 - 10:30');
  const [selectedKiosk, setSelectedKiosk] = useState<string>('ตู้ Kiosk 1');

  // Exercises / Minigame selection
  const [minigameType, setMinigameType] = useState<string>('interactive_quiz');

  const totalSessions = isCustomCount
    ? Math.max(1, parseInt(customCountInput, 10) || 10)
    : selectedSessionCount;

  // Toggle days
  const toggleDay = (dayKey: string) => {
    setSelectedDays((prev) => {
      if (prev.includes(dayKey)) {
        if (prev.length === 1) return prev; // Keep at least 1 day
        return prev.filter((d) => d !== dayKey);
      }
      return [...prev, dayKey];
    });
  };

  // Day preset helpers
  const applyPresetDays = (preset: 'mwf' | 'tth' | 'weekdays') => {
    if (preset === 'mwf') setSelectedDays(['จันทร์', 'พุธ', 'ศุกร์']);
    if (preset === 'tth') setSelectedDays(['อังคาร', 'พฤหัสบดี']);
    if (preset === 'weekdays') setSelectedDays(['จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์']);
  };

  // Calculate generated schedule dates and end date
  const { generatedDates, endDateStr } = useMemo(() => {
    if (!startDate) return { generatedDates: [], endDateStr: '' };

    const dayNameToJsDay: Record<string, number> = {
      'อาทิตย์': 0,
      'จันทร์': 1,
      'อังคาร': 2,
      'พุธ': 3,
      'พฤหัสบดี': 4,
      'ศุกร์': 5,
      'เสาร์': 6,
    };

    const targetDayNumbers = selectedDays.map((d) => dayNameToJsDay[d]);
    const dates: { dateStr: string; dayTh: string; formattedTh: string }[] = [];

    const thaiDayShort = ['อา.', 'จ.', 'อ.', 'พ.', 'พฤ.', 'ศ.', 'ส.'];
    const thaiMonthNames = [
      'ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.',
      'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.',
    ];

    let cur = new Date(startDate);
    let count = 0;
    let safetyLoop = 0;

    while (count < totalSessions && safetyLoop < 365) {
      safetyLoop++;
      const dayOfWeek = cur.getDay();

      if (targetDayNumbers.includes(dayOfWeek)) {
        const y = cur.getFullYear();
        const m = cur.getMonth();
        const d = cur.getDate();
        const ymd = `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        const dayLabel = thaiDayShort[dayOfWeek];
        const formatted = `${dayLabel} ${d} ${thaiMonthNames[m]} ${y + 543}`;

        dates.push({
          dateStr: ymd,
          dayTh: dayLabel,
          formattedTh: formatted,
        });
        count++;
      }

      cur.setDate(cur.getDate() + 1);
    }

    const last = dates[dates.length - 1];
    return {
      generatedDates: dates,
      endDateStr: last ? last.dateStr : startDate,
    };
  }, [startDate, selectedDays, totalSessions]);

  if (!isOpen || !patient) return null;

  const patientName = patient.name || 'นายสมชาย ใจดี';
  const patientHN = patient.code || 'P-0012';

  const handleConfirm = () => {
    const newPlan: Partial<TreatmentPlan> = {
      patientId: patient.id,
      patientCode: patientHN,
      patientName: patientName,
      diagnosis: patient.diagnosis || 'ข้อไหล่ติดระยะฟื้นฟู',
      targetJoint: 'ข้อไหล่และกล้ามเนื้อสะบัก',
      startDate: startDate,
      endDate: endDateStr,
      scheduleDays: selectedDays,
      timeSlot: selectedTimeSlot,
      roomStation: selectedKiosk,
      status: 'active',
      includeMinigame: trainingMode === 'minigame',
      clinicalNotes: `ตัดคอร์สใหม่ (${totalSessions} ครั้ง) รูปแบบ: ${trainingMode === 'minigame' ? 'มินิเกมฝึกสมอง' : 'กายภาพปกติ'}`,
      assignedExercises:
        trainingMode === 'minigame'
          ? [
              { exerciseSlug: 'quiz_reaction', exerciseName: 'เกมตอบสนองไว (Cognitive Reflex)', sets: 3, reps: 10, holdSeconds: 3, difficulty: 'beginner' },
              { exerciseSlug: 'shoulder_raise', exerciseName: 'กางแขนยกไหล่ขนาน', sets: 3, reps: 8, holdSeconds: 5, difficulty: 'beginner' },
            ]
          : [
              { exerciseSlug: 'shoulder_raise', exerciseName: 'กางแขนยกไหล่ขนาน', sets: 3, reps: 10, holdSeconds: 5, difficulty: 'beginner' },
              { exerciseSlug: 'cross_body_stretch', exerciseName: 'ยืดข้อไหล่ข้ามลำตัว', sets: 3, reps: 5, holdSeconds: 15, difficulty: 'beginner' },
              { exerciseSlug: 'bicep_curl', exerciseName: 'งอข้อศอกบริหารต้นแขน', sets: 3, reps: 12, holdSeconds: 3, difficulty: 'beginner' },
            ],
    };

    onSuccess(newPlan);
    addActivityLog(
      'ตัดคอร์สกายภาพบำบัดใหม่',
      'TREATMENT',
      `ตัดคอร์สใหม่ ${totalSessions} ครั้ง ให้ ${patientName} (${patientHN}) เริ่ม ${startDate}`
    );
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-[#0B2522]/65 backdrop-blur-xs animate-fadeIn font-sans"
      onClick={onClose}
    >
      <div
        className="w-full max-w-3xl bg-white rounded-[32px] shadow-2xl overflow-hidden border border-emerald-100 flex flex-col max-h-[92vh] animate-scaleUp text-left"
        onClick={(e) => e.stopPropagation()}
        style={{ borderRadius: '28px' }}
      >
        {/* Header (Matching Step 2 of 2) */}
        <div className="px-6 py-4 border-b border-slate-100 bg-gradient-to-r from-emerald-50/70 via-white to-sky-50/70 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-[#10B981] to-[#0EA5E9] text-white flex items-center justify-center shadow-md shadow-emerald-500/25">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-black text-base sm:text-lg text-[#0F2F2B]">
                  ตัดคอสกายภาพบำบัด
                </h3>
                <span className="px-2.5 py-0.5 rounded-full text-[11px] font-extrabold bg-emerald-100 text-emerald-900 border border-emerald-300">
                  {trainingMode === 'minigame' ? '🎮 มินิเกมฝึกสมอง' : '🧘 กายภาพปกติ'}
                </span>
              </div>
              <p className="text-xs text-slate-500 font-semibold mt-0.5">
                คนไข้: <strong className="text-slate-800">{patientName}</strong> (HN: {patientHN})
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-slate-400 bg-slate-100 px-2.5 py-1 rounded-full">
              ขั้นที่ 2 จาก 2
            </span>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-400 hover:text-slate-700 flex items-center justify-center transition cursor-pointer"
              title="ปิดหน้าต่าง"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Modal Body: 2 Columns */}
        <div className="p-5 sm:p-6 overflow-y-auto space-y-5 flex-1">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {/* COLUMN 1: วันเริ่มต้น, จำนวนครั้ง, วันที่มาฝึกในสัปดาห์ */}
            <div className="space-y-4 p-4 rounded-3xl bg-slate-50/70 border border-slate-200/80">
              <div className="font-black text-xs text-emerald-900 uppercase tracking-wider flex items-center gap-1.5">
                <Calendar className="w-4 h-4 text-emerald-600" />
                <span>วันและรอบการฝึก (Schedule Frequency)</span>
              </div>

              {/* 1. วันเริ่มต้นคอส */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  1. วันเริ่มต้นคอส (Start Date):
                </label>
                <div className="relative">
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-2xl bg-white border border-slate-300 focus:border-emerald-500 text-xs sm:text-sm font-black text-slate-800 shadow-2xs focus:outline-none"
                  />
                </div>
              </div>

              {/* 2. จำนวนครั้ง (5 / 8 / 10 / 12 / กำหนดเอง) */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-bold text-slate-700">
                    2. จำนวนครั้งในคอส (Session Count):
                  </label>
                  <span className="text-xs font-black text-emerald-700 bg-emerald-100/70 px-2.5 py-0.5 rounded-full">
                    รวม: {totalSessions} ครั้ง
                  </span>
                </div>

                <div className="grid grid-cols-5 gap-1.5">
                  {PRESET_SESSION_COUNTS.map((cnt) => (
                    <button
                      key={cnt}
                      type="button"
                      onClick={() => {
                        setSelectedSessionCount(cnt);
                        setIsCustomCount(false);
                      }}
                      className={`py-2 px-1.5 rounded-2xl text-xs font-black transition cursor-pointer text-center ${
                        !isCustomCount && selectedSessionCount === cnt
                          ? 'bg-gradient-to-r from-[#10B981] to-[#0EA5E9] text-white shadow-sm'
                          : 'bg-white border border-slate-200 text-slate-700 hover:border-emerald-300'
                      }`}
                    >
                      {cnt} ครั้ง
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => setIsCustomCount(true)}
                    className={`py-2 px-1.5 rounded-2xl text-xs font-black transition cursor-pointer text-center ${
                      isCustomCount
                        ? 'bg-gradient-to-r from-[#10B981] to-[#0EA5E9] text-white shadow-sm'
                        : 'bg-white border border-slate-200 text-slate-700 hover:border-emerald-300'
                    }`}
                  >
                    กำหนดเอง
                  </button>
                </div>

                {isCustomCount && (
                  <div className="mt-2 flex items-center gap-2">
                    <span className="text-xs text-slate-500 font-bold">ระบุจำนวน:</span>
                    <input
                      type="number"
                      min="1"
                      max="100"
                      value={customCountInput}
                      onChange={(e) => setCustomCountInput(e.target.value)}
                      className="w-24 px-3 py-1.5 rounded-xl border border-emerald-400 bg-white text-xs font-black text-slate-800 focus:outline-none"
                    />
                    <span className="text-xs text-slate-500">ครั้ง</span>
                  </div>
                )}
              </div>

              {/* 3. วันที่มาฝึกในสัปดาห์ (เลือกได้หลายวัน) */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-bold text-slate-700">
                    3. วันที่มาฝึกในสัปดาห์ (Weekly Days):
                  </label>
                  <div className="flex items-center gap-1 text-[10px]">
                    <button
                      type="button"
                      onClick={() => applyPresetDays('mwf')}
                      className="text-emerald-700 hover:underline font-bold"
                    >
                      จ-พ-ศ
                    </button>
                    <span>•</span>
                    <button
                      type="button"
                      onClick={() => applyPresetDays('tth')}
                      className="text-emerald-700 hover:underline font-bold"
                    >
                      อ-พฤ
                    </button>
                    <span>•</span>
                    <button
                      type="button"
                      onClick={() => applyPresetDays('weekdays')}
                      className="text-emerald-700 hover:underline font-bold"
                    >
                      จ-ศ
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-4 sm:grid-cols-7 gap-1.5">
                  {WEEKDAY_OPTIONS.map((d) => {
                    const isSelected = selectedDays.includes(d.key);
                    return (
                      <button
                        key={d.key}
                        type="button"
                        onClick={() => toggleDay(d.key)}
                        className={`py-2 px-1 rounded-2xl text-xs font-bold transition flex flex-col items-center gap-1 cursor-pointer ${
                          isSelected
                            ? 'bg-white border-2 border-emerald-500 shadow-sm text-emerald-950 ring-2 ring-emerald-100'
                            : 'bg-white/80 border border-slate-200 text-slate-400 hover:border-slate-300'
                        }`}
                      >
                        <span className={`w-2 h-2 rounded-full ${d.dot}`} />
                        <span className="text-[11px] font-black">{d.short}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* COLUMN 2: เวลาฝึก, ตู้ Kiosk, รายการท่าฝึก/มินิเกม */}
            <div className="space-y-4 p-4 rounded-3xl bg-slate-50/70 border border-slate-200/80">
              <div className="font-black text-xs text-sky-900 uppercase tracking-wider flex items-center gap-1.5">
                <Clock className="w-4 h-4 text-sky-600" />
                <span>เวลาและตู้ Kiosk (Station & Exercises)</span>
              </div>

              {/* 1. เวลาฝึก (4 ช่วงเวลา) */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  1. เวลาฝึกกายภาพ (4 ช่วงเวลา):
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {TIME_SLOT_OPTIONS.map((slot) => {
                    const isSelected = selectedTimeSlot === slot.id;
                    return (
                      <button
                        key={slot.id}
                        type="button"
                        onClick={() => setSelectedTimeSlot(slot.id)}
                        className={`py-2.5 px-3 rounded-2xl text-left transition cursor-pointer flex items-center justify-between ${
                          isSelected
                            ? 'bg-gradient-to-r from-emerald-50 to-sky-50 border-2 border-emerald-500 text-emerald-950 shadow-xs'
                            : 'bg-white border border-slate-200 text-slate-700 hover:border-emerald-300'
                        }`}
                      >
                        <div>
                          <div className="text-xs font-black">{slot.label}</div>
                          <div className="text-[10px] text-slate-400 font-semibold">{slot.period}</div>
                        </div>
                        {isSelected && <Check className="w-4 h-4 text-emerald-600 stroke-[3]" />}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* 2. ตู้ Kiosk (ตู้ Kiosk 1-3) */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  2. สถานที่ / ตู้ Kiosk:
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {KIOSK_OPTIONS.map((kiosk) => {
                    const isSelected = selectedKiosk === kiosk;
                    return (
                      <button
                        key={kiosk}
                        type="button"
                        onClick={() => setSelectedKiosk(kiosk)}
                        className={`py-2 px-2.5 rounded-2xl text-xs font-black transition cursor-pointer flex items-center justify-center gap-1.5 ${
                          isSelected
                            ? 'bg-gradient-to-r from-[#10B981] to-[#0EA5E9] text-white shadow-xs'
                            : 'bg-white border border-slate-200 text-slate-700 hover:border-emerald-300'
                        }`}
                      >
                        <Monitor className="w-3.5 h-3.5" />
                        <span>{kiosk}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* 3. รายการท่าฝึกในคอส / มินิเกม */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  3. โปรแกรมในคอส:
                </label>
                {trainingMode === 'minigame' ? (
                  <div className="p-3 rounded-2xl bg-purple-50/70 border border-purple-200 space-y-1.5">
                    <div className="flex items-center gap-2 text-xs font-black text-purple-900">
                      <Gamepad2 className="w-4 h-4 text-purple-700" />
                      <span>มินิเกมฝึกสมองและการเคลื่อนไหว (Interactive Quiz)</span>
                    </div>
                    <p className="text-[11px] text-purple-700/90 font-medium">
                      ✓ รวมคำถามฝึกความจำ, การตัดสินใจ และเกมจับคู่ตอบสนองไวพร้อมเซ็นเซอร์กล้อง
                    </p>
                  </div>
                ) : (
                  <div className="p-3 rounded-2xl bg-emerald-50/70 border border-emerald-200 space-y-1.5">
                    <div className="flex items-center gap-2 text-xs font-black text-emerald-900">
                      <Activity className="w-4 h-4 text-emerald-700" />
                      <span>ท่าทางกายภาพบำบัดมาตรฐาน (3 ท่า)</span>
                    </div>
                    <p className="text-[11px] text-emerald-700/90 font-medium">
                      ✓ กางแขนยกไหล่ขนาน (10 ครั้ง) • ยืดข้อไหล่ข้ามลำตัว (5 ครั้ง) • งอข้อศอก (12 ครั้ง)
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* BOTTOM SECTION: ตัวอย่างวันนัดทั้งหมด, วันสิ้นสุดคอส, เช็คคิวชน */}
          <div className="p-4 rounded-3xl bg-white border-2 border-emerald-200 shadow-sm space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-emerald-100">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-emerald-600" />
                <span className="text-xs sm:text-sm font-black text-[#0B2B2B]">
                  ตัวอย่างวันนัดที่จะสร้างทั้งหมด ({generatedDates.length} ครั้ง):
                </span>
              </div>
              <span className="text-xs font-bold text-emerald-800 bg-emerald-100/60 px-3 py-1 rounded-full">
                วันสิ้นสุดคอส: <strong>{endDateStr || '-'}</strong>
              </span>
            </div>

            {/* Generated Dates Grid preview */}
            <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto p-1 bg-slate-50/60 rounded-2xl border border-slate-100">
              {generatedDates.map((item, idx) => (
                <span
                  key={idx}
                  className="px-2.5 py-1 rounded-xl bg-white border border-emerald-200 text-emerald-950 font-bold text-[11px] shadow-2xs whitespace-nowrap"
                >
                  <strong className="text-emerald-700">#{idx + 1}</strong> {item.formattedTh}
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="px-6 py-4 bg-slate-50/90 border-t border-slate-200 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={onBackToStep1}
            className="px-5 py-2.5 rounded-full border border-slate-300 hover:bg-white text-slate-700 font-bold text-xs sm:text-sm transition flex items-center gap-1.5 cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>ย้อนกลับ</span>
          </button>

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2.5 rounded-full border border-slate-300 hover:bg-white text-slate-700 font-bold text-xs sm:text-sm transition cursor-pointer"
            >
              ยกเลิก
            </button>

            <button
              type="button"
              onClick={handleConfirm}
              className="px-6 py-2.5 rounded-full bg-gradient-to-r from-[#10b981] to-[#0ea5e9] hover:opacity-95 text-white font-extrabold text-xs sm:text-sm shadow-md shadow-cyan-500/25 transition flex items-center gap-2 cursor-pointer active:scale-95"
            >
              <span>ยืนยันตัดคอส ({totalSessions} ครั้ง)</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
