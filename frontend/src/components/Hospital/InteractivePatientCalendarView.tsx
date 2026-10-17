import React, { useState, useMemo } from 'react';
import {
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  User,
  Plus,
  ArrowRight,
  CheckCircle2,
  Clock,
  Sparkles,
  X,
} from 'lucide-react';
import { UserAccount, TreatmentPlan } from '../../types/hospital';
import { useHospitalStore } from '../../store/hospitalStore';

interface InteractivePatientCalendarViewProps {
  currentPatient: UserAccount;
  allPatients: UserAccount[];
  onChangePatient: (patient: UserAccount) => void;
  onSelectDateToCreateCourse: (dateStr: string, formattedDateTh: string) => void;
}

const WEEKDAYS = [
  { key: 'mon', label: 'จ.', fullName: 'วันจันทร์', dot: 'bg-amber-500', color: 'text-amber-800' },
  { key: 'tue', label: 'อ.', fullName: 'วันอังคาร', dot: 'bg-pink-500', color: 'text-pink-800' },
  { key: 'wed', label: 'พ.', fullName: 'วันพุธ', dot: 'bg-emerald-500', color: 'text-emerald-800' },
  { key: 'thu', label: 'พฤ.', fullName: 'วันพฤหัสบดี', dot: 'bg-orange-600', color: 'text-orange-800' },
  { key: 'fri', label: 'ศ.', fullName: 'วันศุกร์', dot: 'bg-blue-500', color: 'text-blue-800' },
  { key: 'sat', label: 'ส.', fullName: 'วันเสาร์', dot: 'bg-purple-500', color: 'text-purple-800' },
  { key: 'sun', label: 'อา.', fullName: 'วันอาทิตย์', dot: 'bg-red-500', color: 'text-red-800' },
];

const THAI_MONTH_NAMES = [
  'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
  'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม',
];

export const InteractivePatientCalendarView: React.FC<InteractivePatientCalendarViewProps> = ({
  currentPatient,
  allPatients,
  onChangePatient,
  onSelectDateToCreateCourse,
}) => {
  const { treatmentPlans } = useHospitalStore();

  // State: Year & Month (October 2026 / พ.ศ. 2569 by default as in Mockup Image 2)
  const [selectedYear, setSelectedYear] = useState<number>(2026);
  const [selectedMonth, setSelectedMonth] = useState<number>(9); // 0-indexed, 9 = October

  // Selected date cell in calendar: default to 16 October 2026 as in Image 2!
  const [activeSelectedDay, setActiveSelectedDay] = useState<number>(16);

  // Patient switch modal state
  const [isSwitchPatientOpen, setIsSwitchPatientOpen] = useState<boolean>(false);
  const [patientSearch, setPatientSearch] = useState<string>('');

  // Fixed today date in system: Wednesday 14 October 2026 (พ.ศ. 2569)
  const todayYear = 2026;
  const todayMonth = 9; // October
  const todayDay = 14;

  const handlePrevMonth = () => {
    if (selectedMonth === 0) {
      setSelectedMonth(11);
      setSelectedYear((y) => y - 1);
    } else {
      setSelectedMonth((m) => m - 1);
    }
  };

  const handleNextMonth = () => {
    if (selectedMonth === 11) {
      setSelectedMonth(0);
      setSelectedYear((y) => y + 1);
    } else {
      setSelectedMonth((m) => m + 1);
    }
  };

  const handleGoToToday = () => {
    setSelectedYear(todayYear);
    setSelectedMonth(todayMonth);
    setActiveSelectedDay(todayDay);
  };

  // Generate calendar days
  const calendarCells = useMemo(() => {
    const daysInMonth = new Date(selectedYear, selectedMonth + 1, 0).getDate();
    // In JS: getDay() returns 0 for Sunday, 1 for Monday, etc.
    // In our calendar, Monday is column 0, Sunday is column 6!
    const firstDayJs = new Date(selectedYear, selectedMonth, 1).getDay();
    const mondayBasedFirstDay = (firstDayJs + 6) % 7; // Monday = 0, Sunday = 6

    const cells: {
      type: 'empty' | 'day';
      dayNumber?: number;
      dateStr?: string;
      isToday?: boolean;
      isPast?: boolean;
      isSelected?: boolean;
    }[] = [];

    // Empty cells before first day of month
    for (let i = 0; i < mondayBasedFirstDay; i++) {
      cells.push({ type: 'empty' });
    }

    // Days in current month
    for (let d = 1; d <= daysInMonth; d++) {
      const ymd = `${selectedYear}-${String(selectedMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const isToday =
        selectedYear === todayYear && selectedMonth === todayMonth && d === todayDay;
      const isPast =
        selectedYear < todayYear ||
        (selectedYear === todayYear && selectedMonth < todayMonth) ||
        (selectedYear === todayYear && selectedMonth === todayMonth && d < todayDay);
      const isSelected = d === activeSelectedDay;

      cells.push({
        type: 'day',
        dayNumber: d,
        dateStr: ymd,
        isToday,
        isPast,
        isSelected,
      });
    }

    return cells;
  }, [selectedYear, selectedMonth, activeSelectedDay, todayYear, todayMonth, todayDay]);

  // Format thai date helper
  const getFormattedDateTh = (day: number) => {
    const jsDate = new Date(selectedYear, selectedMonth, day);
    const dayOfWeek = (jsDate.getDay() + 6) % 7;
    const weekdayName = WEEKDAYS[dayOfWeek].fullName;
    const monthName = THAI_MONTH_NAMES[selectedMonth];
    const yearTh = selectedYear + 543;
    return `${weekdayName}ที่ ${day} ${monthName} ${yearTh}`;
  };

  const handleCellClick = (d: number) => {
    setActiveSelectedDay(d);
    const dateStr = `${selectedYear}-${String(selectedMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const formattedTh = getFormattedDateTh(d);
    onSelectDateToCreateCourse(dateStr, formattedTh);
  };

  return (
    <div className="space-y-4 animate-fadeIn font-sans text-left">
      {/* Top Banner Bar: Title & Patient Pill Card (Matching Image 2) */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl sm:text-2xl font-black text-[#0B2B2B] tracking-tight">
            ปฏิทินนัดหมายคนไข้ (Interactive Calendar)
          </h2>
          <p className="text-xs sm:text-sm font-semibold text-slate-500 mt-0.5">
            แตะวันที่ในปฏิทินเพื่อเริ่มตัดคอร์สกายภาพให้คนไข้
          </p>
        </div>

        {/* Current Active Patient Badge (Image 2 Top-Right Card) */}
        <div className="flex items-center gap-3 bg-white border border-emerald-200/90 rounded-full py-1.5 px-3.5 shadow-xs">
          <div className="w-9 h-9 rounded-full bg-emerald-600 text-white flex items-center justify-center font-bold shadow-sm">
            <User className="w-5 h-5" />
          </div>
          <div className="min-w-0 pr-1">
            <div className="text-[10px] font-semibold text-slate-400 leading-tight">
              กำลังจัดคอร์สให้:
            </div>
            <div className="text-xs sm:text-sm font-black text-[#0B2B2B] truncate">
              {currentPatient.name || 'นายสมชาย ใจดี'}{' '}
              <span className="font-mono text-[11px] font-bold text-slate-400">
                HN: {currentPatient.code || 'P-0012'}
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setIsSwitchPatientOpen(true)}
            className="py-1 px-3 rounded-full border border-slate-200 hover:bg-emerald-50 text-slate-700 hover:text-emerald-800 font-bold text-xs transition cursor-pointer active:scale-95 whitespace-nowrap shadow-2xs"
          >
            เปลี่ยนคนไข้
          </button>
        </div>
      </div>

      {/* Main Interactive Calendar White Card (Matching Image 2) */}
      <div
        className="bg-white border border-slate-100 rounded-[28px] p-5 sm:p-7 shadow-sm space-y-4"
        style={{ borderRadius: '26px' }}
      >
        {/* Month Navigation & Status Legend Header Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-slate-100">
          {/* Navigation Controls */}
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={handlePrevMonth}
              className="w-8 h-8 rounded-full border border-slate-200 hover:bg-slate-50 text-slate-600 flex items-center justify-center transition cursor-pointer active:scale-95"
              title="เดือนก่อนหน้า"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>

            <h3 className="text-lg sm:text-xl font-black text-[#0B2B2B] px-1">
              {THAI_MONTH_NAMES[selectedMonth]} {selectedYear + 543}
            </h3>

            <button
              type="button"
              onClick={handleNextMonth}
              className="w-8 h-8 rounded-full border border-slate-200 hover:bg-slate-50 text-slate-600 flex items-center justify-center transition cursor-pointer active:scale-95"
              title="เดือนถัดไป"
            >
              <ChevronRight className="w-4 h-4" />
            </button>

            <button
              type="button"
              onClick={handleGoToToday}
              className="px-3 py-1 rounded-full bg-emerald-50 border border-emerald-300 text-emerald-800 font-extrabold text-xs transition hover:bg-emerald-100 cursor-pointer shadow-2xs"
            >
              วันนี้
            </button>
          </div>

          {/* Status Legend (Matching Image 2) */}
          <div className="flex items-center gap-3 text-xs font-bold text-slate-600 flex-wrap">
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
              <span>กำลังรักษา</span>
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-500" />
              <span>พักการฝึก</span>
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-blue-500" />
              <span>สำเร็จครบโปรแกรม</span>
            </span>
          </div>
        </div>

        {/* Calendar Table Grid (Monday - Sunday) */}
        <div className="w-full">
          {/* Weekday Header Row with Colored Dots */}
          <div className="grid grid-cols-7 gap-2 pb-2 text-center text-xs font-bold text-slate-700">
            {WEEKDAYS.map((wd) => (
              <div key={wd.key} className="flex items-center justify-center gap-1.5 py-1">
                <span className={`w-2 h-2 rounded-full ${wd.dot}`} />
                <span className="font-extrabold text-xs sm:text-sm">{wd.label}</span>
              </div>
            ))}
          </div>

          {/* Month Cells Grid */}
          <div className="grid grid-cols-7 gap-2">
            {calendarCells.map((cell, idx) => {
              if (cell.type === 'empty') {
                return (
                  <div
                    key={`empty-${idx}`}
                    className="min-h-[82px] sm:min-h-[100px] rounded-2xl bg-slate-50/40 border border-dashed border-slate-100"
                  />
                );
              }

              const d = cell.dayNumber!;
              const isSelected = cell.isSelected;
              const isToday = cell.isToday;
              const isPast = cell.isPast;

              // Check mock appointment badges matching Image 2 mockup (Wednesdays 7, 14, 21, 28)
              const hasWednesdayBadges = [7, 14, 21, 28].includes(d);

              return (
                <div
                  key={`day-${d}`}
                  onClick={() => handleCellClick(d)}
                  className={`min-h-[86px] sm:min-h-[105px] rounded-2xl p-2 sm:p-2.5 flex flex-col justify-between transition-all cursor-pointer relative ${
                    isSelected
                      ? 'border-2 border-[#0ea5e9] bg-sky-50/20 shadow-md ring-2 ring-sky-100'
                      : isToday
                      ? 'border-2 border-emerald-500 bg-emerald-50/20 shadow-xs'
                      : isPast
                      ? 'border border-slate-100 bg-slate-50/60 opacity-60 hover:opacity-100'
                      : 'border border-slate-200/90 bg-white hover:border-emerald-300 hover:shadow-xs'
                  }`}
                >
                  {/* Top Bar inside cell: Day Number & "วันนี้" Badge */}
                  <div className="flex items-center justify-between">
                    <span
                      className={`text-xs sm:text-sm font-black ${
                        isSelected
                          ? 'text-[#0284c7]'
                          : isToday
                          ? 'text-emerald-700'
                          : isPast
                          ? 'text-slate-400'
                          : 'text-[#0B2B2B]'
                      }`}
                    >
                      {d}
                    </span>

                    {isToday && (
                      <span className="px-1.5 py-0.2 rounded-full bg-emerald-500 text-white font-extrabold text-[9px] shadow-2xs">
                        วันนี้
                      </span>
                    )}
                  </div>

                  {/* Middle: Appointment Badges (Matching Image 2) */}
                  <div className="space-y-1 my-1">
                    {hasWednesdayBadges && (
                      <>
                        <div className="px-1.5 py-0.5 rounded-lg bg-emerald-100 text-emerald-900 font-extrabold text-[9px] sm:text-[10px] truncate shadow-2xs">
                          09:30 สมชาย
                        </div>
                        <div className="px-1.5 py-0.5 rounded-lg bg-sky-100 text-sky-900 font-extrabold text-[9px] sm:text-[10px] truncate shadow-2xs">
                          15:00 PJ
                        </div>
                      </>
                    )}
                  </div>

                  {/* Bottom: "+ ตัดคอสที่นี่" Button when cell is selected (Matching Image 2) */}
                  {isSelected && (
                    <div className="pt-1">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleCellClick(d);
                        }}
                        className="w-full py-1 px-1.5 rounded-xl bg-gradient-to-r from-[#10b981] to-[#0ea5e9] text-white font-extrabold text-[10px] sm:text-[11px] shadow-xs hover:opacity-95 transition flex items-center justify-center gap-1 active:scale-95 cursor-pointer"
                      >
                        <Plus className="w-3 h-3 stroke-[3]" />
                        <span>ตัดคอสที่นี่</span>
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Switch Patient Modal */}
      {isSwitchPatientOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-[#0B2522]/65 backdrop-blur-xs animate-fadeIn font-sans"
          onClick={() => setIsSwitchPatientOpen(false)}
        >
          <div
            className="w-full max-w-md bg-white rounded-[28px] p-5 sm:p-6 shadow-2xl border border-emerald-100 flex flex-col space-y-3 animate-scaleUp"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <h3 className="font-black text-base sm:text-lg text-[#0B2B2B]">
                เลือกคนไข้เพื่อจัดคอร์ส
              </h3>
              <button
                onClick={() => setIsSwitchPatientOpen(false)}
                className="w-7 h-7 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 flex items-center justify-center transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <input
              type="text"
              value={patientSearch}
              onChange={(e) => setPatientSearch(e.target.value)}
              placeholder="ค้นหาชื่อ หรือรหัส HN..."
              className="w-full px-3.5 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />

            <div className="max-h-60 overflow-y-auto space-y-1.5 pr-1">
              {allPatients
                .filter(
                  (p) =>
                    !patientSearch ||
                    (p.name && p.name.includes(patientSearch)) ||
                    (p.code && p.code.includes(patientSearch))
                )
                .map((p) => (
                  <div
                    key={p.id}
                    onClick={() => {
                      onChangePatient(p);
                      setIsSwitchPatientOpen(false);
                    }}
                    className={`p-2.5 rounded-xl border flex items-center justify-between transition cursor-pointer ${
                      p.id === currentPatient.id
                        ? 'bg-emerald-50 border-emerald-400 text-emerald-900 font-bold'
                        : 'bg-white border-slate-200 hover:border-emerald-300 text-slate-700'
                    }`}
                  >
                    <div>
                      <div className="text-xs font-black">{p.name}</div>
                      <div className="text-[10px] text-slate-400 font-mono">HN: {p.code}</div>
                    </div>
                    {p.id === currentPatient.id && (
                      <span className="text-[10px] font-extrabold text-emerald-700 bg-white px-2 py-0.5 rounded-md border border-emerald-300">
                        เลือกอยู่
                      </span>
                    )}
                  </div>
                ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
