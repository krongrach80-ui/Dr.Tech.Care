import React, { useState, useEffect, useMemo } from 'react';
import {
  X,
  Calendar,
  Gamepad2,
  Check,
  ArrowRight,
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Clock,
  Laptop,
  Sparkles,
  AlertTriangle,
  Stethoscope,
  Activity,
  CheckCircle2,
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
    totalSessions?: number;
    selectedDates?: string[];
    endDate?: string;
  }) => void;
}

// Thai day color dots matching the screenshot
const THAI_DAY_DOTS = [
  { name: 'จ.', full: 'จันทร์', color: '#F59E0B' }, // Monday: Amber/Orange
  { name: 'อ.', full: 'อังคาร', color: '#EF4444' }, // Tuesday: Pink/Red
  { name: 'พ.', full: 'พุธ', color: '#10B981' }, // Wednesday: Green
  { name: 'พฤ.', full: 'พฤหัสบดี', color: '#F97316' }, // Thursday: Orange
  { name: 'ศ.', full: 'ศุกร์', color: '#3B82F6' }, // Friday: Blue
  { name: 'ส.', full: 'เสาร์', color: '#8B5CF6' }, // Saturday: Purple
  { name: 'อา.', full: 'อาทิตย์', color: '#DC2626' }, // Sunday: Red
];

const THAI_MONTH_NAMES = [
  'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
  'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม',
];

const THAI_SHORT_MONTHS = [
  'ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.',
  'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.',
];

const THAI_SHORT_DAYS = ['อา.', 'จ.', 'อ.', 'พ.', 'พฤ.', 'ศ.', 'ส.'];

export const CourseModeSelectionModal: React.FC<CourseModeSelectionModalProps> = ({
  isOpen,
  onClose,
  patient,
  dateStr,
  onSaveCourse,
}) => {
  // Step state: 1 = เลือกรูปแบบการฝึก (กายภาพ vs มินิเกม), 2 = ตัดคอร์สกายภาพบำบัด (ตามภาพ)
  const [step, setStep] = useState<1 | 2>(2);
  const [selectedMode, setSelectedMode] = useState<'physio' | 'minigame'>('minigame');
  const [timeSlot, setTimeSlot] = useState<string>('09:30 - 10:30');
  const [station, setStation] = useState<string>('ตู้ Kiosk 1');
  const [courseNotes, setCourseNotes] = useState<string>('คอร์สกายภาพบำบัดฟื้นฟูต่อเนื่อง');

  // Step 2 Form States
  const [startDateStr, setStartDateStr] = useState<string>(dateStr || '2026-10-16');
  const [targetSessionCount, setTargetSessionCount] = useState<number>(10);
  const [isCustomCount, setIsCustomCount] = useState<boolean>(false);
  const [customCountInput, setCustomCountInput] = useState<string>('10');

  // Calendar View: 'month' | 'week'
  const [calendarView, setCalendarView] = useState<'month' | 'week'>('month');

  // Current viewing month (e.g. October 2026)
  const [viewDate, setViewDate] = useState<Date>(() => {
    const d = new Date(dateStr || '2026-10-16');
    return isNaN(d.getTime()) ? new Date(2026, 9, 1) : new Date(d.getFullYear(), d.getMonth(), 1);
  });

  // Selected appointments date strings: YYYY-MM-DD
  const [selectedDates, setSelectedDates] = useState<string[]>([]);

  // Reset or initialize when modal opens or dateStr changes
  useEffect(() => {
    if (isOpen) {
      const initialDate = dateStr || '2026-10-16';
      setStartDateStr(initialDate);
      const d = new Date(initialDate);
      if (!isNaN(d.getTime())) {
        setViewDate(new Date(d.getFullYear(), d.getMonth(), 1));
      }
      setStep(2); // Open directly on Step 2 as requested, with back button available
    }
  }, [isOpen, dateStr]);

  // Helper to format ISO YYYY-MM-DD
  const formatIso = (year: number, month: number, day: number) => {
    return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  };

  // Generate recurring appointments starting from startDateStr (Defaulting to Mon & Fri or Mon, Wed, Fri)
  const generateRecurringDates = (startDateIso: string, count: number): string[] => {
    const dates: string[] = [];
    const [y, m, d] = startDateIso.split('-').map(Number);
    const curr = new Date(y, m - 1, d);

    // If start date is valid, add it as Session #1
    dates.push(formatIso(curr.getFullYear(), curr.getMonth(), curr.getDate()));

    // Generate subsequent sessions on Mondays (1) and Fridays (5)
    // to strictly match the pattern in the screenshot (16 Fri, 19 Mon, 23 Fri, 26 Mon, 30 Fri, 2 Nov Mon, ...)
    let nextDate = new Date(curr);
    while (dates.length < count) {
      nextDate.setDate(nextDate.getDate() + 1);
      const dayOfWeek = nextDate.getDay(); // 0 = Sun, 1 = Mon, 5 = Fri
      if (dayOfWeek === 1 || dayOfWeek === 5) {
        dates.push(formatIso(nextDate.getFullYear(), nextDate.getMonth(), nextDate.getDate()));
      }
    }
    return dates;
  };

  // Recalculate selected dates when targetSessionCount or startDateStr changes
  useEffect(() => {
    const generated = generateRecurringDates(startDateStr, targetSessionCount);
    setSelectedDates(generated);
  }, [startDateStr, targetSessionCount]);

  if (!isOpen || !patient) return null;

  const patientName = patient.name || 'นายสมชาย ใจดี';
  const patientCode = patient.code || patient.patient_code || 'P-0012';

  // Toggle date selection manually by clicking a date on the calendar
  const handleToggleDate = (dateIso: string) => {
    const [y, m, d] = dateIso.split('-').map(Number);
    const clickedDate = new Date(y, m - 1, d);
    const [startY, startM, startD] = startDateStr.split('-').map(Number);
    const startDateObj = new Date(startY, startM - 1, startD);

    // Cannot select past days prior to course start date
    if (clickedDate < startDateObj) return;

    if (selectedDates.includes(dateIso)) {
      if (dateIso === startDateStr) {
        // Cannot remove start date directly, it's the anchor
        return;
      }
      setSelectedDates(selectedDates.filter((x) => x !== dateIso));
    } else {
      const updated = [...selectedDates, dateIso].sort();
      setSelectedDates(updated);
    }
  };

  // Month navigation
  const handlePrevMonth = () => {
    setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() - 1, 1));
  };

  const handleNextMonth = () => {
    setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 1));
  };

  // Format short Thai date for bottom chips, e.g. "ศ. 16 ต.ค."
  const formatChipDate = (isoStr: string) => {
    try {
      const [y, m, d] = isoStr.split('-').map(Number);
      const dateObj = new Date(y, m - 1, d);
      const dayName = THAI_SHORT_DAYS[dateObj.getDay()];
      const monthName = THAI_SHORT_MONTHS[m - 1];
      return `${dayName} ${d} ${monthName}`;
    } catch {
      return isoStr;
    }
  };

  // Format full Thai date, e.g. "16/11/2569"
  const formatEndCourseDate = (isoStr: string) => {
    try {
      const [y, m, d] = isoStr.split('-').map(Number);
      return `${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}/${y + 543}`;
    } catch {
      return isoStr;
    }
  };

  const endDateStr = selectedDates.length > 0 ? selectedDates[selectedDates.length - 1] : startDateStr;

  // Count how many selected dates fall in the month after viewDate
  const nextMonthYear = viewDate.getMonth() === 11 ? viewDate.getFullYear() + 1 : viewDate.getFullYear();
  const nextMonthIndex = (viewDate.getMonth() + 1) % 12;
  const nextMonthDatesCount = selectedDates.filter((iso) => {
    const [y, m] = iso.split('-').map(Number);
    return y === nextMonthYear && m - 1 === nextMonthIndex;
  }).length;

  const currentYearBe = viewDate.getFullYear() + 543;
  const currentMonthName = THAI_MONTH_NAMES[viewDate.getMonth()];
  const nextMonthShortName = THAI_SHORT_MONTHS[nextMonthIndex];

  // Calendar matrix calculation for Month View (Monday = col 0 ... Sunday = col 6)
  const daysInMonth = new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 0).getDate();
  const firstDayOfMonth = new Date(viewDate.getFullYear(), viewDate.getMonth(), 1).getDay();
  // In Thai calendar: Mon=0, Tue=1, Wed=2, Thu=3, Fri=4, Sat=5, Sun=6
  const startColOffset = firstDayOfMonth === 0 ? 6 : firstDayOfMonth - 1;

  // Handle preset clicks (5, 8, 10, 12)
  const handleSelectPreset = (count: number) => {
    setIsCustomCount(false);
    setTargetSessionCount(count);
  };

  const handleCustomCountSubmit = () => {
    const num = parseInt(customCountInput, 10);
    if (!isNaN(num) && num >= 1 && num <= 40) {
      setTargetSessionCount(num);
      setIsCustomCount(false);
    }
  };

  // Submit and save
  const handleConfirmSave = () => {
    onSaveCourse({
      mode: selectedMode,
      date: startDateStr,
      patientId: patient.id || 12,
      patientName,
      patientCode,
      timeSlot,
      station,
      notes: courseNotes,
      totalSessions: selectedDates.length,
      selectedDates,
      endDate: endDateStr,
    });
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-[#0F2F2B]/60 backdrop-blur-md animate-fadeIn overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="w-full max-w-4xl lg:max-w-5xl bg-white rounded-[32px] shadow-2xl border border-slate-200/80 overflow-hidden animate-scaleUp text-left my-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ================================================================= */}
        {/* MODAL HEADER: Match Screenshot                                   */}
        {/* ================================================================= */}
        <div className="p-5 sm:p-6 pb-4 border-b border-slate-100 flex items-start justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-[#00C49F] to-[#00A896] text-white flex items-center justify-center shadow-md shadow-emerald-500/20 flex-shrink-0">
              <Calendar className="w-6 h-6 stroke-[2.2]" />
            </div>

            <div>
              <div className="flex items-center gap-2.5 flex-wrap">
                <h2 className="text-xl sm:text-2xl font-black text-[#0B2B2B] tracking-tight">
                  {step === 1 ? 'เลือกรูปแบบการฝึก' : 'ตัดคอร์สกายภาพบำบัด'}
                </h2>

                {step === 2 && (
                  <span
                    className={`inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full text-xs font-bold ${
                      selectedMode === 'minigame'
                        ? 'bg-[#F3E8FF] text-[#7E22CE] border border-purple-200'
                        : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                    }`}
                  >
                    {selectedMode === 'minigame' ? (
                      <>
                        <Gamepad2 className="w-3.5 h-3.5" />
                        <span>มินิเกมฝึกสมอง</span>
                      </>
                    ) : (
                      <>
                        <Activity className="w-3.5 h-3.5" />
                        <span>กายภาพบำบัดปกติ</span>
                      </>
                    )}
                  </span>
                )}
              </div>

              <p className="text-xs sm:text-sm text-slate-500 font-semibold mt-0.5">
                คนไข้: <span className="font-extrabold text-[#0B2B2B]">{patientName}</span>{' '}
                <span className="text-slate-400 font-semibold">(HN: {patientCode})</span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 flex-shrink-0">
            <span className="text-xs font-extrabold text-slate-500 bg-slate-100 px-3.5 py-1.5 rounded-full">
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

        {/* ================================================================= */}
        {/* STEP 1: Select Mode (Physio vs Minigame)                          */}
        {/* ================================================================= */}
        {step === 1 && (
          <div className="p-6 sm:p-7 space-y-6">
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
                  <div className="w-14 h-14 rounded-2xl bg-emerald-100 text-emerald-600 border border-emerald-200 flex items-center justify-center shadow-xs">
                    <Activity className="w-7 h-7 stroke-[2.2]" />
                  </div>
                  <div>
                    <h3 className="text-lg font-black text-[#0B2B2B]">กายภาพปกติ (ROM Exercise)</h3>
                    <p className="text-xs text-slate-500 font-medium mt-1 leading-relaxed">
                      โปรแกรมกายภาพบำบัดฟื้นฟูกล้ามเนื้อและข้อต่อตามชุดท่าที่คุณหมอกำหนด เช่น กางแขน เหยียดไหล่ และข้อศอก
                    </p>
                  </div>
                </div>
                <div className="pt-6">
                  <button
                    type="button"
                    onClick={() => setSelectedMode('physio')}
                    className={`w-full py-2.5 px-4 rounded-2xl font-black text-xs transition ${
                      selectedMode === 'physio'
                        ? 'bg-emerald-600 text-white shadow-sm'
                        : 'bg-white border border-slate-300 text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    {selectedMode === 'physio' ? 'เลือกแบบนี้แล้ว' : 'เลือกแบบนี้'}
                  </button>
                </div>
              </div>

              {/* Option B: มินิเกมฝึกสมอง */}
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
                </div>
                <div className="pt-6">
                  <button
                    type="button"
                    onClick={() => setSelectedMode('minigame')}
                    className={`w-full py-2.5 px-4 rounded-2xl font-black text-xs transition ${
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

        {/* ================================================================= */}
        {/* STEP 2: Main Cut Course Matrix (Matching Screenshot 100%)         */}
        {/* ================================================================= */}
        {step === 2 && (
          <div className="p-4 sm:p-6 space-y-4 max-h-[calc(88dvh-150px)] overflow-y-auto">
            {/* Top 2 Columns Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-stretch">
              {/* =========================================================== */}
              {/* LEFT CARD: วันและรอบการฝึก (5 cols)                         */}
              {/* =========================================================== */}
              <div className="lg:col-span-5 bg-white border border-slate-200/90 rounded-[24px] p-4 sm:p-5 flex flex-col justify-between shadow-2xs space-y-4">
                {/* Card Title */}
                <div className="flex items-center gap-2 text-sm sm:text-base font-extrabold text-[#0B2B2B]">
                  <Calendar className="w-4 h-4 text-emerald-600" />
                  <span>วันและรอบการฝึก</span>
                </div>

                {/* 1. วันเริ่มต้นคอร์ส */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">
                    1. วันเริ่มต้นคอร์ส
                  </label>
                  <div className="relative">
                    <input
                      type="date"
                      value={startDateStr}
                      onChange={(e) => {
                        const val = e.target.value;
                        if (val) {
                          setStartDateStr(val);
                          const d = new Date(val);
                          if (!isNaN(d.getTime())) {
                            setViewDate(new Date(d.getFullYear(), d.getMonth(), 1));
                          }
                        }
                      }}
                      className="w-full px-3.5 py-2.5 rounded-2xl border border-slate-200 text-xs sm:text-sm font-bold text-[#0B2B2B] bg-white focus:outline-none focus:ring-2 focus:ring-[#00C49F] shadow-2xs"
                    />
                  </div>
                </div>

                {/* 2. จำนวนครั้งในคอร์ส */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs font-bold text-slate-700">
                      2. จำนวนครั้งในคอร์ส
                    </label>
                    <span className="text-[11px] font-extrabold px-2.5 py-0.5 rounded-full bg-teal-50 text-teal-800 border border-teal-200">
                      รวม: {targetSessionCount} ครั้ง
                    </span>
                  </div>

                  {/* Preset Pills */}
                  <div className="grid grid-cols-4 gap-1.5">
                    {[5, 8, 10, 12].map((cnt) => {
                      const isSelected = !isCustomCount && targetSessionCount === cnt;
                      return (
                        <button
                          key={cnt}
                          type="button"
                          onClick={() => handleSelectPreset(cnt)}
                          className={`py-2 px-1 rounded-xl text-xs font-bold transition cursor-pointer border ${
                            isSelected
                              ? 'bg-gradient-to-r from-[#00C49F] to-[#0096C7] text-white border-transparent shadow-sm shadow-teal-500/25 font-black'
                              : 'bg-white hover:bg-slate-50 text-slate-700 border-slate-200'
                          }`}
                        >
                          {cnt} ครั้ง
                        </button>
                      );
                    })}
                  </div>

                  {/* กำหนดเอง Button / Input */}
                  <div className="mt-2">
                    {isCustomCount ? (
                      <div className="flex items-center gap-1.5 animate-fadeIn">
                        <input
                          type="number"
                          min="1"
                          max="40"
                          value={customCountInput}
                          onChange={(e) => setCustomCountInput(e.target.value)}
                          placeholder="ระบุจำนวนครั้ง"
                          className="flex-1 px-3 py-1.5 rounded-xl border border-[#00C49F] text-xs font-bold text-[#0B2B2B] focus:outline-none"
                        />
                        <button
                          type="button"
                          onClick={handleCustomCountSubmit}
                          className="px-3 py-1.5 rounded-xl bg-[#00C49F] text-white text-xs font-bold hover:opacity-90"
                        >
                          ตกลง
                        </button>
                        <button
                          type="button"
                          onClick={() => setIsCustomCount(false)}
                          className="px-2.5 py-1.5 rounded-xl bg-slate-100 text-slate-600 text-xs hover:bg-slate-200"
                        >
                          ยกเลิก
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          setIsCustomCount(true);
                          setCustomCountInput(String(targetSessionCount));
                        }}
                        className="w-full py-2 px-3 rounded-xl bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 text-xs font-bold transition cursor-pointer text-center"
                      >
                        กำหนดเอง
                      </button>
                    )}
                  </div>
                </div>

                {/* 3. โปรแกรมในคอร์ส */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">
                    3. โปรแกรมในคอร์ส
                  </label>

                  <div
                    className={`rounded-2xl p-3.5 sm:p-4 border text-left transition-all ${
                      selectedMode === 'minigame'
                        ? 'bg-[#FAF5FF] border-purple-200 text-purple-900'
                        : 'bg-emerald-50/60 border-emerald-200 text-emerald-900'
                    }`}
                  >
                    <div className="flex items-start gap-2.5">
                      <div
                        className={`w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 ${
                          selectedMode === 'minigame'
                            ? 'bg-purple-100 text-purple-700'
                            : 'bg-emerald-100 text-emerald-700'
                        }`}
                      >
                        {selectedMode === 'minigame' ? (
                          <Gamepad2 className="w-4 h-4 stroke-[2.2]" />
                        ) : (
                          <Activity className="w-4 h-4 stroke-[2.2]" />
                        )}
                      </div>

                      <div>
                        <h4 className="text-xs sm:text-sm font-black">
                          {selectedMode === 'minigame'
                            ? 'มินิเกมสมองและการเคลื่อนไหว (Interactive Quiz)'
                            : 'กายภาพบำบัดฟื้นฟูข้อต่อ (ROM Exercise)'}
                        </h4>
                        <p className="text-[11px] leading-relaxed mt-1 opacity-90">
                          {selectedMode === 'minigame'
                            ? '✓ รวมคำถามฝึกความจำ การตัดสินใจ และเกมจับคู่ตอบสนองไว พร้อมเซนเซอร์กล้อง'
                            : '✓ รวม 3 ท่าฟื้นฟูข้อไหล่และกล้ามเนื้อสะบัก วัดองศาด้วย AI Camera สเกเลตัน'}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* =========================================================== */}
              {/* RIGHT CARD: เลือกวันที่มาฝึก (7 cols)                       */}
              {/* =========================================================== */}
              <div className="lg:col-span-7 bg-white border border-slate-200/90 rounded-[24px] p-4 sm:p-5 flex flex-col justify-between shadow-2xs space-y-3">
                {/* Header row with View Toggle (เดือน / อาทิตย์) & Badge */}
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-2.5">
                    <div className="flex items-center gap-1.5 text-sm sm:text-base font-extrabold text-[#0B2B2B]">
                      <Calendar className="w-4 h-4 text-emerald-600" />
                      <span>เลือกวันที่มาฝึก</span>
                    </div>

                    {/* View Switcher: เดือน / อาทิตย์ (Matching Image 2) */}
                    <div className="inline-flex items-center bg-slate-100 rounded-full p-0.5 text-[11px] font-bold">
                      <button
                        type="button"
                        onClick={() => setCalendarView('month')}
                        className={`px-3 py-1 rounded-full transition cursor-pointer ${
                          calendarView === 'month'
                            ? 'bg-white text-slate-800 shadow-2xs font-extrabold'
                            : 'text-slate-500 hover:text-slate-800'
                        }`}
                      >
                        เดือน
                      </button>
                      <button
                        type="button"
                        onClick={() => setCalendarView('week')}
                        className={`px-3 py-1 rounded-full transition cursor-pointer ${
                          calendarView === 'week'
                            ? 'bg-white text-slate-800 shadow-2xs font-extrabold'
                            : 'text-slate-500 hover:text-slate-800'
                        }`}
                      >
                        อาทิตย์
                      </button>
                    </div>
                  </div>

                  {/* Badge: เลือกแล้ว X / Y ครั้ง */}
                  <span className="text-xs font-extrabold px-3 py-1 rounded-full bg-teal-50 text-teal-800 border border-teal-200 shadow-2xs">
                    เลือกแล้ว {selectedDates.length} / {targetSessionCount} ครั้ง
                  </span>
                </div>

                {/* Calendar Month Navigation Header */}
                <div className="flex items-center justify-between px-2 pt-1">
                  <button
                    type="button"
                    onClick={handlePrevMonth}
                    className="w-8 h-8 rounded-full border border-slate-200 hover:bg-slate-100 flex items-center justify-center text-slate-600 transition cursor-pointer active:scale-95"
                    title="เดือนก่อนหน้า"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>

                  <h3 className="text-base sm:text-lg font-black text-[#0B2B2B]">
                    {currentMonthName} {currentYearBe}
                  </h3>

                  <button
                    type="button"
                    onClick={handleNextMonth}
                    className="w-8 h-8 rounded-full border border-slate-200 hover:bg-slate-100 flex items-center justify-center text-slate-600 transition cursor-pointer active:scale-95"
                    title="เดือนถัดไป"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>

                {/* Day-of-week header columns with colored dots */}
                <div className="grid grid-cols-7 gap-1 text-center border-b border-slate-100 pb-2">
                  {THAI_DAY_DOTS.map((d) => (
                    <div
                      key={d.name}
                      className="flex items-center justify-center gap-1 text-xs font-extrabold text-slate-700"
                    >
                      <span
                        className="w-1.5 h-1.5 rounded-full inline-block flex-shrink-0"
                        style={{ backgroundColor: d.color }}
                      />
                      <span>{d.name}</span>
                    </div>
                  ))}
                </div>

                {/* Calendar Days Matrix */}
                {calendarView === 'month' ? (
                  <div className="grid grid-cols-7 gap-1.5 sm:gap-2 text-center py-1">
                    {/* Preceding blank days */}
                    {Array.from({ length: startColOffset }).map((_, i) => (
                      <div key={`blank-${i}`} className="h-9 sm:h-10" />
                    ))}

                    {/* Month Days (1..daysInMonth) */}
                    {Array.from({ length: daysInMonth }).map((_, i) => {
                      const dayNum = i + 1;
                      const dayIso = formatIso(viewDate.getFullYear(), viewDate.getMonth(), dayNum);
                      const isSelected = selectedDates.includes(dayIso);
                      const isStart = dayIso === startDateStr;

                      // Check if day is prior to startDateStr
                      const [sY, sM, sD] = startDateStr.split('-').map(Number);
                      const startObj = new Date(sY, sM - 1, sD);
                      const thisDayObj = new Date(viewDate.getFullYear(), viewDate.getMonth(), dayNum);
                      const isPrior = thisDayObj < startObj;

                      return (
                        <button
                          key={dayNum}
                          type="button"
                          onClick={() => handleToggleDate(dayIso)}
                          disabled={isPrior}
                          className={`h-9 sm:h-10 rounded-2xl text-xs sm:text-sm font-bold flex items-center justify-center transition-all ${
                            isPrior
                              ? 'bg-slate-100 text-slate-400 font-semibold cursor-not-allowed'
                              : isSelected
                              ? 'bg-[#00C49F] text-white font-black shadow-sm ring-2 ring-emerald-300 active:scale-95 cursor-pointer'
                              : isStart
                              ? 'bg-emerald-500 text-white font-black ring-2 ring-[#0096C7] cursor-pointer'
                              : 'bg-white hover:bg-slate-100 text-slate-700 hover:text-slate-900 border border-slate-100 cursor-pointer active:scale-95'
                          }`}
                        >
                          {dayNum}
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  /* Week View Mode */
                  <div className="grid grid-cols-7 gap-1.5 sm:gap-2 text-center py-4">
                    {Array.from({ length: 7 }).map((_, i) => {
                      // Show current week dates
                      const dayNum = Math.min(daysInMonth, (i + 16));
                      const dayIso = formatIso(viewDate.getFullYear(), viewDate.getMonth(), dayNum);
                      const isSelected = selectedDates.includes(dayIso);
                      return (
                        <div
                          key={i}
                          onClick={() => handleToggleDate(dayIso)}
                          className={`p-3 rounded-2xl flex flex-col items-center justify-center gap-1 cursor-pointer transition ${
                            isSelected
                              ? 'bg-[#00C49F] text-white font-black shadow-sm'
                              : 'bg-slate-50 hover:bg-slate-100 text-slate-700 font-bold border border-slate-200'
                          }`}
                        >
                          <span className="text-[10px] opacity-80">{THAI_DAY_DOTS[i].name}</span>
                          <span className="text-base font-extrabold">{dayNum}</span>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Calendar Legend & Next Month Helper Notice */}
                <div className="pt-2 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-[11px] font-bold text-slate-600">
                  <div className="flex items-center gap-3">
                    <span className="flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-full bg-[#00C49F]" />
                      <span>วันที่เลือก</span>
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 ring-2 ring-[#0096C7]" />
                      <span>วันเริ่มต้น</span>
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-full bg-slate-300" />
                      <span>เลือกไม่ได้</span>
                    </span>
                  </div>

                  {nextMonthDatesCount > 0 && (
                    <button
                      type="button"
                      onClick={handleNextMonth}
                      className="text-emerald-700 hover:text-emerald-800 underline flex items-center gap-1 cursor-pointer"
                    >
                      <span>
                        เดือนถัดไป ({nextMonthShortName}) เลือกไว้ {nextMonthDatesCount} วัน — กดลูกศรขวาเพื่อดู
                      </span>
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* ============================================================= */}
            {/* BOTTOM CARD: ตัวอย่างวันนัดที่จะสร้างทั้งหมด (10 ครั้ง)            */}
            {/* ============================================================= */}
            <div className="bg-[#F0FDF4]/50 border border-teal-200/70 rounded-[24px] p-4 sm:p-5 shadow-2xs space-y-3">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <span className="text-xs sm:text-sm font-extrabold text-[#0B2B2B]">
                  ตัวอย่างวันนัดที่จะสร้างทั้งหมด ({selectedDates.length} ครั้ง)
                </span>

                <span className="text-xs font-extrabold px-3 py-1 rounded-full bg-teal-50 text-teal-800 border border-teal-200 shadow-2xs">
                  วันสิ้นสุดคอร์ส: {formatEndCourseDate(endDateStr)}
                </span>
              </div>

              {/* Scheduled Appointment Chips */}
              <div className="flex flex-wrap gap-2 sm:gap-2.5 items-center">
                {selectedDates.map((dateIso, idx) => (
                  <div
                    key={dateIso}
                    className="inline-flex items-center gap-1.5 bg-white border border-teal-200 rounded-full py-1 px-3 shadow-2xs text-xs font-bold text-slate-700 animate-fadeIn"
                  >
                    <span className="w-4 h-4 rounded-full bg-[#00C49F] text-white text-[10px] font-black flex items-center justify-center flex-shrink-0">
                      {idx + 1}
                    </span>
                    <span>{formatChipDate(dateIso)}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ================================================================= */}
        {/* MODAL FOOTER ACTIONS: Matching Screenshot                          */}
        {/* ================================================================= */}
        <div className="p-4 sm:p-5 bg-white border-t border-slate-100 flex items-center justify-between gap-3">
          {step === 2 ? (
            <button
              type="button"
              onClick={() => setStep(1)}
              className="px-5 sm:px-6 py-2.5 rounded-full border border-slate-300 text-slate-700 hover:bg-slate-100 font-bold text-xs sm:text-sm transition cursor-pointer flex items-center gap-1.5"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>ย้อนกลับ</span>
            </button>
          ) : (
            <div />
          )}

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-5 sm:px-6 py-2.5 rounded-full text-slate-600 hover:bg-slate-100 font-bold text-xs sm:text-sm transition cursor-pointer"
            >
              ยกเลิก
            </button>

            {step === 1 ? (
              <button
                type="button"
                onClick={() => setStep(2)}
                className="px-6 sm:px-8 py-2.5 sm:py-3 rounded-full bg-gradient-to-r from-[#00C49F] via-[#00B4D8] to-[#0096C7] hover:opacity-95 text-white font-black text-xs sm:text-sm shadow-md shadow-cyan-500/25 flex items-center gap-2 transition cursor-pointer active:scale-95"
              >
                <span>ถัดไป: ตั้งค่าคอร์ส</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            ) : (
              <button
                type="button"
                onClick={handleConfirmSave}
                className="px-6 sm:px-8 py-2.5 sm:py-3 rounded-full bg-gradient-to-r from-[#00C49F] via-[#00B4D8] to-[#0096C7] hover:opacity-95 text-white font-black text-xs sm:text-sm shadow-md shadow-cyan-500/25 flex items-center gap-2 transition cursor-pointer active:scale-95"
              >
                <span>ยืนยันตัดคอร์ส ({selectedDates.length} ครั้ง)</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
