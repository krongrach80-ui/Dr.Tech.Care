import React, { useState, useEffect } from 'react';
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
  Activity,
  Pencil,
  Sliders,
  Layers,
  CheckSquare,
  Square,
  Sparkles,
} from 'lucide-react';
import { PrescribedExercise, HospitalExercise, ExerciseModpack } from '../../types/hospital';
import { saveMiniGameSettings, getSavedMiniGameSettings } from '../../services/miniGameSettingsService';

interface CourseModeSelectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  patient: any;
  dateStr: string; // e.g. '2026-10-16'
  exercises?: HospitalExercise[];
  modpacks?: ExerciseModpack[];
  onSaveCourse: (courseData: {
    mode: 'physio' | 'minigame' | 'both';
    includePhysio: boolean;
    includeMinigame: boolean;
    assignedExercises: PrescribedExercise[];
    minigameQuestionCount: number;
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

// Preset exercise template
interface PhysioPreset {
  id: string;
  name: string;
  category: string;
  icon: string;
  targetJoint: string;
  description: string;
  exercises: PrescribedExercise[];
}

const DEFAULT_PHYSIO_PRESETS: PhysioPreset[] = [
  {
    id: 'shoulder',
    name: 'คอร์สฟื้นฟูไหล่ติด (Frozen Shoulder)',
    category: 'ข้อไหล่และสะบัก',
    icon: '🦴',
    targetJoint: 'ข้อไหล่และสะบัก (Shoulder & Scapula)',
    description: 'โปรแกรมเพิ่มพิสัยข้อต่อหัวไหล่ ลดอาการยึดติดและปวดสะบัก',
    exercises: [
      { exerciseSlug: 'shoulder_raise', exerciseName: 'กางแขนยกด้านข้าง', sets: 3, reps: 10, holdSeconds: 3, difficulty: 'beginner' },
      { exerciseSlug: 'cross_body_stretch', exerciseName: 'ยืดไหล่ข้ามอก', sets: 3, reps: 5, holdSeconds: 5, difficulty: 'beginner' },
      { exerciseSlug: 'chest_expansion', exerciseName: 'ยืดอกเปิดไหล่', sets: 2, reps: 5, holdSeconds: 5, difficulty: 'beginner' },
    ],
  },
  {
    id: 'knee',
    name: 'คอร์สข้อเข่าและกล้ามเนื้อขา (Knee Rehab)',
    category: 'ข้อเข่าและขา',
    icon: '🦵',
    targetJoint: 'ข้อเข่าและกล้ามเนื้อต้นขา',
    description: 'ฟื้นฟูกำลังกล้ามเนื้อรอบข้อเข่า เพิ่มความมั่นคงในการยืนและเดิน',
    exercises: [
      { exerciseSlug: 'knee_squat', exerciseName: 'ย่อเข่ามินิสควอท (Knee Squat)', sets: 3, reps: 10, holdSeconds: 2, difficulty: 'beginner' },
      { exerciseSlug: 'alternating-knee-raise', exerciseName: 'ยกเข่าสลับยืนทรงตัว', sets: 3, reps: 10, holdSeconds: 2, difficulty: 'beginner' },
      { exerciseSlug: 'stretch_quadriceps', exerciseName: 'ยืดกล้ามเนื้อหน้าขา', sets: 2, reps: 5, holdSeconds: 5, difficulty: 'beginner' },
    ],
  },
  {
    id: 'office',
    name: 'คอร์สยืดกล้ามเนื้อออฟฟิศซินโดรม (Office Syndrome)',
    category: 'คอ บ่า ไหล่',
    icon: '💻',
    targetJoint: 'กล้ามเนื้อคอ บ่า สะบัก',
    description: 'คลายกล้ามเนื้อตึงสะสมจากการทำงาน เพิ่มความยืดหยุ่นคอบ่าไหล่',
    exercises: [
      { exerciseSlug: 'stretch_neck_lateral', exerciseName: 'ยืดกล้ามเนื้อคอด้านข้าง', sets: 2, reps: 5, holdSeconds: 5, difficulty: 'beginner' },
      { exerciseSlug: 'stretch_chest_open', exerciseName: 'ยืดอกเปิดสะบัก', sets: 2, reps: 5, holdSeconds: 5, difficulty: 'beginner' },
      { exerciseSlug: 'stretch_shoulder_cross', exerciseName: 'ยืดหัวไหล่และสะบัก', sets: 3, reps: 5, holdSeconds: 5, difficulty: 'beginner' },
    ],
  },
  {
    id: 'arm_elbow',
    name: 'คอร์สเพิ่มกำลังแขนและข้อศอก (Arm & Elbow)',
    category: 'ข้อศอกและแขน',
    icon: '💪',
    targetJoint: 'ข้อศอก กล้ามเนื้อต้นแขน',
    description: 'ฝึกการงอเหยียดข้อศอก เพิ่มแรงบีบมือและกำลังแขน',
    exercises: [
      { exerciseSlug: 'bicep_curl', exerciseName: 'งอข้อศอก Bicep Curl', sets: 3, reps: 10, holdSeconds: 2, difficulty: 'beginner' },
      { exerciseSlug: 'elbow_extension', exerciseName: 'เหยียดข้อศอก Elbow Extension', sets: 3, reps: 10, holdSeconds: 2, difficulty: 'beginner' },
      { exerciseSlug: 'stretch_triceps_overhead', exerciseName: 'ยืดกล้ามเนื้อต้นแขนด้านหลัง', sets: 2, reps: 5, holdSeconds: 5, difficulty: 'beginner' },
    ],
  },
];

const AVAILABLE_INDIVIDUAL_EXERCISES: { slug: string; name: string; category: string; targetJoint: string; defaultHold: number }[] = [
  { slug: 'shoulder_raise', name: 'กางแขนยกด้านข้าง (Shoulder Abduction)', category: 'ข้อไหล่', targetJoint: 'ข้อไหล่', defaultHold: 3 },
  { slug: 'cross_body_stretch', name: 'ยืดไหล่ข้ามอก (Cross Body Stretch)', category: 'ข้อไหล่', targetJoint: 'สะบักและไหล่', defaultHold: 5 },
  { slug: 'chest_expansion', name: 'ยืดอกเปิดไหล่ (Chest Expansion)', category: 'ข้อไหล่', targetJoint: 'กล้ามเนื้อหน้าอกและไหล่', defaultHold: 5 },
  { slug: 'bicep_curl', name: 'งอข้อศอกบริหารกล้ามเนื้อแขน (Bicep Curl)', category: 'ข้อศอก', targetJoint: 'กล้ามเนื้อต้นแขน', defaultHold: 2 },
  { slug: 'elbow_extension', name: 'เหยียดข้อศอก (Elbow Extension)', category: 'ข้อศอก', targetJoint: 'ข้อศอก', defaultHold: 2 },
  { slug: 'knee_squat', name: 'ย่อเข่ามินิสควอท (Knee Mini-Squat)', category: 'ข้อเข่า', targetJoint: 'ข้อเข่าและต้นขา', defaultHold: 2 },
  { slug: 'alternating-knee-raise', name: 'ยกเข่าสลับบริหารทรงตัว (Knee Raise)', category: 'ขาและทรงตัว', targetJoint: 'สะโพกและเข่า', defaultHold: 2 },
  { slug: 'stretch_neck_lateral', name: 'ยืดกล้ามเนื้อคอด้านข้าง (Neck Lateral)', category: 'คอและบ่า', targetJoint: 'กล้ามเนื้อคอ', defaultHold: 5 },
  { slug: 'stretch_triceps_overhead', name: 'ยืดต้นแขนด้านหลัง (Triceps Stretch)', category: 'ข้อศอก', targetJoint: 'ต้นแขนด้านหลัง', defaultHold: 5 },
  { slug: 'stretch_quadriceps', name: 'ยืดกล้ามเนื้อหน้าขา (Quadriceps Stretch)', category: 'ข้อเข่า', targetJoint: 'ต้นขาด้านหน้า', defaultHold: 5 },
];

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
  // Step state: 1 = เลือกรูปแบบการฝึก (ปรากฏหน้านี้ก่อนเสมอเมื่อกดเพิ่มวันนัด), 2 = ตัดคอร์สกายภาพบำบัด
  const [step, setStep] = useState<1 | 2>(1);

  // Multi-select training modes (สามารถติ๊กได้ทั้ง 2 อัน)
  const [includePhysio, setIncludePhysio] = useState<boolean>(true);
  const [includeMinigame, setIncludeMinigame] = useState<boolean>(false);

  // Time & Station
  const [timeSlot, setTimeSlot] = useState<string>('09:30 - 10:30');
  const [station, setStation] = useState<string>('ตู้ Kiosk 1');
  const [courseNotes, setCourseNotes] = useState<string>('คอร์สกายภาพบำบัดฟื้นฟูต่อเนื่อง');

  // --- Physio Configuration States ---
  const [isPhysioModalOpen, setIsPhysioModalOpen] = useState<boolean>(false);
  const [physioMode, setPhysioMode] = useState<'preset' | 'individual'>('preset');
  const [selectedPresetId, setSelectedPresetId] = useState<string>('shoulder');
  const [selectedIndividualSlugs, setSelectedIndividualSlugs] = useState<string[]>([
    'shoulder_raise',
    'cross_body_stretch',
    'chest_expansion',
  ]);
  const [assignedExercises, setAssignedExercises] = useState<PrescribedExercise[]>(
    DEFAULT_PHYSIO_PRESETS[0].exercises
  );

  // --- Minigame Configuration States ---
  const [isMinigameModalOpen, setIsMinigameModalOpen] = useState<boolean>(false);
  const [minigameQuestionCount, setMinigameQuestionCount] = useState<number>(() => {
    const saved = getSavedMiniGameSettings();
    return saved.questionCount || 20;
  });
  const [customQuestionInput, setCustomQuestionInput] = useState<string>('20');

  // Step 2 Form States
  const [startDateStr, setStartDateStr] = useState<string>(() => dateStr || '2026-10-16');
  const [targetSessionCount, setTargetSessionCount] = useState<number>(10);
  const [isCustomCount, setIsCustomCount] = useState<boolean>(false);
  const [customCountInput, setCustomCountInput] = useState<string>('10');

  // Calendar View: 'month' | 'week'
  const [calendarView, setCalendarView] = useState<'month' | 'week'>('month');

  // Safe date parser supporting YYYY-MM-DD, DD/MM/YYYY, etc.
  const parseDateSafe = (val: string): { year: number; month: number; day: number } => {
    if (!val) return { year: 2026, month: 9, day: 16 };
    if (val.includes('/')) {
      const parts = val.split('/').map(Number);
      if (parts.length === 3) {
        return { year: parts[2], month: parts[1] - 1, day: parts[0] };
      }
    }
    const parts = val.split('-').map(Number);
    if (parts.length === 3) {
      return { year: parts[0], month: parts[1] - 1, day: parts[2] };
    }
    return { year: 2026, month: 9, day: 16 };
  };

  // Current viewing month (e.g. October 2026)
  const [viewDate, setViewDate] = useState<Date>(() => {
    const { year, month } = parseDateSafe(dateStr || '2026-10-16');
    return new Date(year, month, 1);
  });

  // Selected appointments date strings: YYYY-MM-DD
  const [selectedDates, setSelectedDates] = useState<string[]>([]);

  // Reset or initialize when modal opens or dateStr changes
  useEffect(() => {
    if (isOpen) {
      const initialDate = dateStr || '2026-10-16';
      setStartDateStr(initialDate);
      const { year, month } = parseDateSafe(initialDate);
      setViewDate(new Date(year, month, 1));
      // ตามที่ผู้ใช้ระบุ: ให้ปรากฏหน้าเลือกรูปแบบวันฝึกก่อน (Step 1)
      setStep(1);
    }
  }, [isOpen, dateStr]);

  // Helper to format ISO YYYY-MM-DD
  const formatIso = (year: number, month: number, day: number) => {
    return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  };

  // Format date for display input e.g. "16/10/2026"
  const formatDisplayDate = (isoOrSlash: string) => {
    const { year, month, day } = parseDateSafe(isoOrSlash);
    return `${String(day).padStart(2, '0')}/${String(month + 1).padStart(2, '0')}/${year}`;
  };

  // Generate recurring appointments starting from startDateStr (Defaulting to Mon & Fri)
  const generateRecurringDates = (startDateIso: string, count: number): string[] => {
    const dates: string[] = [];
    const { year, month, day } = parseDateSafe(startDateIso);
    const curr = new Date(year, month, day);

    // If start date is valid, add it as Session #1
    dates.push(formatIso(curr.getFullYear(), curr.getMonth(), curr.getDate()));

    let nextDate = new Date(curr);
    let loopGuard = 0;
    while (dates.length < count && loopGuard < 120) {
      loopGuard++;
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
    const { year, month, day } = parseDateSafe(dateIso);
    const clickedDate = new Date(year, month, day);
    const startParsed = parseDateSafe(startDateStr);
    const startDateObj = new Date(startParsed.year, startParsed.month, startParsed.day);

    if (clickedDate < startDateObj) return;

    if (selectedDates.includes(dateIso)) {
      if (dateIso === startDateStr) return;
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
      const { year, month, day } = parseDateSafe(isoStr);
      const dateObj = new Date(year, month, day);
      const dayName = THAI_SHORT_DAYS[dateObj.getDay()];
      const monthName = THAI_SHORT_MONTHS[month];
      return `${dayName} ${day} ${monthName}`;
    } catch {
      return isoStr;
    }
  };

  // Format full Thai date, e.g. "16/11/2569"
  const formatEndCourseDate = (isoStr: string) => {
    try {
      const { year, month, day } = parseDateSafe(isoStr);
      return `${String(day).padStart(2, '0')}/${String(month + 1).padStart(2, '0')}/${year + 543}`;
    } catch {
      return isoStr;
    }
  };

  const endDateStr = selectedDates.length > 0 ? selectedDates[selectedDates.length - 1] : startDateStr;

  const safeViewDate = isNaN(viewDate.getTime()) ? new Date(2026, 9, 1) : viewDate;

  const nextMonthYear = safeViewDate.getMonth() === 11 ? safeViewDate.getFullYear() + 1 : safeViewDate.getFullYear();
  const nextMonthIndex = (safeViewDate.getMonth() + 1) % 12;
  const nextMonthDatesCount = selectedDates.filter((iso) => {
    const { year, month } = parseDateSafe(iso);
    return year === nextMonthYear && month === nextMonthIndex;
  }).length;

  const currentYearBe = safeViewDate.getFullYear() + 543;
  const currentMonthName = THAI_MONTH_NAMES[safeViewDate.getMonth()] || 'ตุลาคม';
  const nextMonthShortName = THAI_SHORT_MONTHS[nextMonthIndex] || 'พ.ย.';

  const daysInMonth = new Date(safeViewDate.getFullYear(), safeViewDate.getMonth() + 1, 0).getDate() || 31;
  const firstDayOfMonth = new Date(safeViewDate.getFullYear(), safeViewDate.getMonth(), 1).getDay();
  const startColOffset = isNaN(firstDayOfMonth) ? 3 : (firstDayOfMonth === 0 ? 6 : firstDayOfMonth - 1);

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

  // Save Physio Configuration from popup
  const handleSavePhysioConfig = () => {
    if (physioMode === 'preset') {
      const preset = DEFAULT_PHYSIO_PRESETS.find((p) => p.id === selectedPresetId);
      if (preset) {
        setAssignedExercises(preset.exercises);
      }
    } else {
      // Build from individual selections
      const items: PrescribedExercise[] = selectedIndividualSlugs.map((slug) => {
        const found = AVAILABLE_INDIVIDUAL_EXERCISES.find((ex) => ex.slug === slug);
        return {
          exerciseSlug: slug,
          exerciseName: found ? found.name : slug,
          sets: 3,
          reps: 10,
          holdSeconds: found ? found.defaultHold : 3,
          difficulty: 'beginner',
        };
      });
      setAssignedExercises(items.length > 0 ? items : DEFAULT_PHYSIO_PRESETS[0].exercises);
    }
    setIsPhysioModalOpen(false);
  };

  // Toggle individual exercise checkbox
  const handleToggleIndividualExercise = (slug: string) => {
    if (selectedIndividualSlugs.includes(slug)) {
      if (selectedIndividualSlugs.length <= 1) return; // Keep at least 1
      setSelectedIndividualSlugs(selectedIndividualSlugs.filter((s) => s !== slug));
    } else {
      setSelectedIndividualSlugs([...selectedIndividualSlugs, slug]);
    }
  };

  // Save Minigame Configuration from popup
  const handleSaveMinigameConfig = (count: number) => {
    setMinigameQuestionCount(count);
    const currSettings = getSavedMiniGameSettings();
    saveMiniGameSettings({
      ...currSettings,
      questionCount: count,
    });
    setIsMinigameModalOpen(false);
  };

  // Submit and save course
  const handleConfirmSave = () => {
    const activeMode: 'physio' | 'minigame' | 'both' =
      includePhysio && includeMinigame ? 'both' : (includeMinigame ? 'minigame' : 'physio');

    onSaveCourse({
      mode: activeMode,
      includePhysio,
      includeMinigame,
      assignedExercises: includePhysio ? assignedExercises : [],
      minigameQuestionCount,
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

  const currentPresetName =
    DEFAULT_PHYSIO_PRESETS.find((p) => p.id === selectedPresetId)?.name || 'คอร์สฟื้นฟูไหล่ติด';

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
        {/* MODAL HEADER                                                      */}
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
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {includePhysio && (
                      <span className="inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                        <Activity className="w-3.5 h-3.5" />
                        <span>กายภาพปกติ ({assignedExercises.length} ท่า)</span>
                      </span>
                    )}
                    {includeMinigame && (
                      <span className="inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full text-xs font-bold bg-[#F3E8FF] text-[#7E22CE] border border-purple-200">
                        <Gamepad2 className="w-3.5 h-3.5" />
                        <span>มินิเกมฝึกสมอง ({minigameQuestionCount} ข้อ)</span>
                      </span>
                    )}
                  </div>
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
        {/* STEP 1: Select Mode (Multi-select: กายภาพ & มินิเกม พร้อมปุ่มแก้ไข) */}
        {/* ================================================================= */}
        {step === 1 && (
          <div className="p-6 sm:p-7 space-y-6">
            <div className="flex items-center justify-between">
              <p className="text-xs sm:text-sm text-slate-600 font-bold">
                💡 สามารถเลือกได้ทั้ง 2 รูปแบบพร้อมกัน หรือเลือกอย่างใดอย่างหนึ่ง:
              </p>
              {includePhysio && includeMinigame && (
                <span className="px-3 py-1 rounded-full bg-gradient-to-r from-emerald-100 to-purple-100 text-emerald-900 border border-emerald-300 text-xs font-black shadow-2xs flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
                  <span>เลือกทั้ง 2 แบบ (กายภาพ + มินิเกม)</span>
                </span>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-5">
              {/* Option A: กายภาพปกติ */}
              <div
                onClick={() => setIncludePhysio(!includePhysio)}
                className={`p-6 rounded-3xl border-2 transition-all flex flex-col justify-between cursor-pointer relative ${
                  includePhysio
                    ? 'border-emerald-500 bg-emerald-50/30 shadow-md ring-4 ring-emerald-100'
                    : 'border-slate-200 hover:border-slate-300 bg-white opacity-80'
                }`}
              >
                {/* มุมบนขวา: Checkbox + ปุ่มแก้ไข */}
                <div className="absolute top-4 right-4 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setIsPhysioModalOpen(true);
                    }}
                    className="px-3 py-1 rounded-xl bg-white hover:bg-emerald-50 border border-emerald-300 text-emerald-800 text-xs font-black shadow-2xs hover:shadow transition flex items-center gap-1.5 cursor-pointer active:scale-95"
                    title="คลิกเพื่อแก้ไขชุดท่าหรือเลือกท่าเดี่ยว"
                  >
                    <Pencil className="w-3.5 h-3.5 text-emerald-600" />
                    <span>แก้ไข</span>
                  </button>

                  <div
                    className={`w-6 h-6 rounded-full flex items-center justify-center transition-all ${
                      includePhysio
                        ? 'bg-emerald-500 text-white shadow-sm'
                        : 'border-2 border-slate-300 bg-white text-transparent'
                    }`}
                  >
                    <Check className="w-4 h-4 stroke-[3]" />
                  </div>
                </div>

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

                  {/* Summary Badge from Config */}
                  <div className="p-2.5 rounded-2xl bg-white border border-emerald-200/80 shadow-2xs space-y-1">
                    <div className="text-[11px] font-bold text-slate-500 flex items-center justify-between">
                      <span>รูปแบบที่ตั้งไว้:</span>
                      <span className="font-extrabold text-emerald-700">
                        {physioMode === 'preset' ? 'ชุดท่ามาตรฐาน' : 'เลือกท่าเดี่ยว'}
                      </span>
                    </div>
                    <div className="text-xs font-extrabold text-[#0B2B2B] truncate">
                      {physioMode === 'preset' ? currentPresetName : `เลือกแล้ว ${assignedExercises.length} ท่าเดี่ยว`}
                    </div>
                    <div className="text-[10px] text-slate-400 font-medium">
                      รวม {assignedExercises.length} ท่าฝึก (คลิกปุ่ม &quot;แก้ไข&quot; เพื่อเปลี่ยน)
                    </div>
                  </div>
                </div>

                <div className="pt-4">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setIncludePhysio(!includePhysio);
                    }}
                    className={`w-full py-2.5 px-4 rounded-2xl font-black text-xs transition flex items-center justify-center gap-1.5 ${
                      includePhysio
                        ? 'bg-emerald-600 text-white shadow-sm'
                        : 'bg-white border border-slate-300 text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    {includePhysio ? (
                      <>
                        <Check className="w-4 h-4" />
                        <span>เลือกแบบนี้แล้ว</span>
                      </>
                    ) : (
                      <span>+ เลือกกายภาพปกติ</span>
                    )}
                  </button>
                </div>
              </div>

              {/* Option B: มินิเกมฝึกสมอง */}
              <div
                onClick={() => setIncludeMinigame(!includeMinigame)}
                className={`p-6 rounded-3xl border-2 transition-all flex flex-col justify-between cursor-pointer relative ${
                  includeMinigame
                    ? 'border-[#8B5CF6] bg-purple-50/30 shadow-md ring-4 ring-purple-100'
                    : 'border-slate-200 hover:border-slate-300 bg-white opacity-80'
                }`}
              >
                {/* มุมบนขวา: Checkbox + ปุ่มแก้ไข */}
                <div className="absolute top-4 right-4 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setIsMinigameModalOpen(true);
                    }}
                    className="px-3 py-1 rounded-xl bg-white hover:bg-purple-50 border border-purple-300 text-purple-800 text-xs font-black shadow-2xs hover:shadow transition flex items-center gap-1.5 cursor-pointer active:scale-95"
                    title="คลิกเพื่อกำหนดจำนวนคำถามมินิเกม"
                  >
                    <Pencil className="w-3.5 h-3.5 text-purple-600" />
                    <span>แก้ไข</span>
                  </button>

                  <div
                    className={`w-6 h-6 rounded-full flex items-center justify-center transition-all ${
                      includeMinigame
                        ? 'bg-[#8B5CF6] text-white shadow-sm'
                        : 'border-2 border-slate-300 bg-white text-transparent'
                    }`}
                  >
                    <Check className="w-4 h-4 stroke-[3]" />
                  </div>
                </div>

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

                  {/* Summary Badge from Config */}
                  <div className="p-2.5 rounded-2xl bg-white border border-purple-200/80 shadow-2xs space-y-1">
                    <div className="text-[11px] font-bold text-slate-500 flex items-center justify-between">
                      <span>จำนวนคำถามที่ตั้งไว้:</span>
                      <span className="font-extrabold text-purple-700">
                        {minigameQuestionCount} ข้อ / รอบ
                      </span>
                    </div>
                    <div className="text-xs font-extrabold text-[#0B2B2B] truncate">
                      🎯 เล่นมินิเกมตอบคำถาม {minigameQuestionCount} ข้อ
                    </div>
                    <div className="text-[10px] text-slate-400 font-medium">
                      สุ่มคำถามไม่ซ้ำกัน (คลิกปุ่ม &quot;แก้ไข&quot; เพื่อเปลี่ยนจำนวน)
                    </div>
                  </div>
                </div>

                <div className="pt-4">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setIncludeMinigame(!includeMinigame);
                    }}
                    className={`w-full py-2.5 px-4 rounded-2xl font-black text-xs transition flex items-center justify-center gap-1.5 ${
                      includeMinigame
                        ? 'bg-[#8B5CF6] text-white shadow-sm'
                        : 'bg-white border border-slate-300 text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    {includeMinigame ? (
                      <>
                        <Check className="w-4 h-4" />
                        <span>เลือกแบบนี้แล้ว</span>
                      </>
                    ) : (
                      <span>+ เลือกมินิเกมฝึกสมอง</span>
                    )}
                  </button>
                </div>
              </div>
            </div>

            {/* Warning if none selected */}
            {!includePhysio && !includeMinigame && (
              <div className="p-3.5 rounded-2xl bg-amber-50 border border-amber-200 text-amber-800 text-xs font-bold text-center animate-shake">
                ⚠️ กรุณาเลือกรูปแบบการฝึกอย่างน้อย 1 อย่าง (กายภาพปกติ หรือ มินิเกม หรือทั้ง 2 อย่าง)
              </div>
            )}
          </div>
        )}

        {/* ================================================================= */}
        {/* STEP 2: Main Cut Course Matrix                                    */}
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
                  <div className="relative flex items-center">
                    <input
                      type="text"
                      readOnly
                      value={formatDisplayDate(startDateStr)}
                      onClick={() => {
                        const inputEl = document.getElementById('course-start-date-hidden-picker') as HTMLInputElement;
                        inputEl?.showPicker?.();
                      }}
                      className="w-full px-3.5 py-2.5 rounded-2xl border border-slate-200 text-xs sm:text-sm font-bold text-[#0B2B2B] bg-white focus:outline-none focus:ring-2 focus:ring-[#00C49F] shadow-2xs cursor-pointer pr-10"
                    />
                    <input
                      id="course-start-date-hidden-picker"
                      type="date"
                      value={startDateStr}
                      onChange={(e) => {
                        const val = e.target.value;
                        if (val) {
                          setStartDateStr(val);
                          const { year, month } = parseDateSafe(val);
                          setViewDate(new Date(year, month, 1));
                        }
                      }}
                      className="absolute right-3 opacity-0 w-6 h-6 cursor-pointer"
                    />
                    <Calendar className="w-4 h-4 text-slate-400 absolute right-3.5 pointer-events-none" />
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
                          className="px-3 py-1.5 rounded-xl bg-[#00C49F] text-white text-xs font-bold hover:opacity-90 cursor-pointer"
                        >
                          ตกลง
                        </button>
                        <button
                          type="button"
                          onClick={() => setIsCustomCount(false)}
                          className="px-2.5 py-1.5 rounded-xl bg-slate-100 text-slate-600 text-xs hover:bg-slate-200 cursor-pointer"
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

                {/* 3. โปรแกรมในคอร์ส (แสดงทั้ง 2 โหมดหากเลือกทั้งคู่) */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">
                    3. โปรแกรมในคอร์สที่จะฝึกในแต่ละวัน
                  </label>

                  <div className="space-y-2">
                    {includePhysio && (
                      <div className="rounded-2xl p-3 border bg-emerald-50/70 border-emerald-200 text-emerald-950 text-left">
                        <div className="flex items-center gap-2">
                          <Activity className="w-4 h-4 text-emerald-700 flex-shrink-0" />
                          <h4 className="text-xs font-black">
                            กายภาพปกติ: {physioMode === 'preset' ? currentPresetName : `${assignedExercises.length} ท่าเดี่ยว`}
                          </h4>
                        </div>
                        <p className="text-[11px] text-emerald-800 mt-1 pl-6 leading-relaxed">
                          ✓ รวม {assignedExercises.length} ท่า: {assignedExercises.map((e) => e.exerciseName).join(', ')}
                        </p>
                      </div>
                    )}

                    {includeMinigame && (
                      <div className="rounded-2xl p-3 border bg-[#FAF5FF] border-purple-200 text-purple-950 text-left">
                        <div className="flex items-center gap-2">
                          <Gamepad2 className="w-4 h-4 text-purple-700 flex-shrink-0" />
                          <h4 className="text-xs font-black">
                            มินิเกมฝึกสมองและการตอบสนอง ({minigameQuestionCount} คำถาม)
                          </h4>
                        </div>
                        <p className="text-[11px] text-purple-800 mt-1 pl-6 leading-relaxed">
                          ✓ เซ็ตไว้ {minigameQuestionCount} ข้อต่อรอบ สุ่มคำถามไม่ซ้ำกัน พร้อมตรวจจับผ่านกล้อง AI Kiosk
                        </p>
                      </div>
                    )}
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

                {/* Day-of-week header columns */}
                <div className="grid grid-cols-7 gap-1 sm:gap-1.5 text-center pb-2">
                  {THAI_DAY_DOTS.map((d) => (
                    <div
                      key={d.name}
                      className="py-1 px-1 rounded-full bg-[#E0F2F1] text-[#00695C] text-xs font-black flex items-center justify-center gap-1 shadow-2xs"
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
                  <div className="grid grid-cols-7 gap-1.5 sm:gap-2 text-center py-1 min-h-[220px]">
                    {Array.from({ length: startColOffset }).map((_, i) => (
                      <div key={`blank-${i}`} className="h-9 sm:h-10" />
                    ))}

                    {Array.from({ length: daysInMonth }).map((_, i) => {
                      const dayNum = i + 1;
                      const dayIso = formatIso(safeViewDate.getFullYear(), safeViewDate.getMonth(), dayNum);
                      const isSelected = selectedDates.includes(dayIso);
                      const isStart = dayIso === startDateStr;

                      const startObj = parseDateSafe(startDateStr);
                      const startCompare = new Date(startObj.year, startObj.month, startObj.day);
                      const thisDayObj = new Date(safeViewDate.getFullYear(), safeViewDate.getMonth(), dayNum);
                      const isPrior = thisDayObj < startCompare;

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
                  <div className="grid grid-cols-7 gap-1.5 sm:gap-2 text-center py-4">
                    {Array.from({ length: 7 }).map((_, i) => {
                      const dayNum = Math.min(daysInMonth, (i + 16));
                      const dayIso = formatIso(safeViewDate.getFullYear(), safeViewDate.getMonth(), dayNum);
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

                {/* Calendar Legend */}
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

            {/* BOTTOM CARD: ตัวอย่างวันนัดที่จะสร้างทั้งหมด */}
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
        {/* MODAL FOOTER ACTIONS                                              */}
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
                disabled={!includePhysio && !includeMinigame}
                onClick={() => setStep(2)}
                className={`px-6 sm:px-8 py-2.5 sm:py-3 rounded-full font-black text-xs sm:text-sm shadow-md flex items-center gap-2 transition cursor-pointer active:scale-95 ${
                  includePhysio || includeMinigame
                    ? 'bg-gradient-to-r from-[#00C49F] via-[#00B4D8] to-[#0096C7] hover:opacity-95 text-white shadow-cyan-500/25'
                    : 'bg-slate-200 text-slate-400 cursor-not-allowed shadow-none'
                }`}
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

      {/* =================================================================== */}
      {/* POPUP 1: ตั้งค่าท่ากายภาพปกติ (แบบชุด หรือ ติ๊กเลือกท่าเดี่ยวๆ)        */}
      {/* =================================================================== */}
      {isPhysioModalOpen && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-sm animate-fadeIn"
          onClick={() => setIsPhysioModalOpen(false)}
        >
          <div
            className="w-full max-w-2xl bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden text-left animate-scaleUp flex flex-col max-h-[85vh]"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="p-4 sm:p-5 border-b border-slate-100 flex items-center justify-between bg-gradient-to-r from-emerald-50 to-teal-50">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-emerald-600 text-white flex items-center justify-center shadow-xs">
                  <Activity className="w-5 h-5 stroke-[2.2]" />
                </div>
                <div>
                  <h3 className="text-base font-black text-[#0B2B2B]">
                    กำหนดท่ากายภาพบำบัดฟื้นฟู
                  </h3>
                  <p className="text-[11px] text-slate-500 font-semibold">
                    เลือกออกกำลังกายแบบเป็นชุดท่าสำเร็จรูป หรือติ๊กเลือกท่าเดี่ยวตามต้องการ
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsPhysioModalOpen(false)}
                className="p-1 rounded-full text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Mode Switcher Tabs */}
            <div className="p-3 bg-slate-50 border-b border-slate-200/80 flex items-center gap-2">
              <button
                type="button"
                onClick={() => setPhysioMode('preset')}
                className={`flex-1 py-2 px-3 rounded-2xl text-xs font-black transition flex items-center justify-center gap-2 cursor-pointer ${
                  physioMode === 'preset'
                    ? 'bg-emerald-600 text-white shadow-xs'
                    : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
                }`}
              >
                <Layers className="w-4 h-4" />
                <span>1. ออกกำลังกายแบบชุด (Preset รวม)</span>
              </button>
              <button
                type="button"
                onClick={() => setPhysioMode('individual')}
                className={`flex-1 py-2 px-3 rounded-2xl text-xs font-black transition flex items-center justify-center gap-2 cursor-pointer ${
                  physioMode === 'individual'
                    ? 'bg-emerald-600 text-white shadow-xs'
                    : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
                }`}
              >
                <Sliders className="w-4 h-4" />
                <span>2. ติ๊กเลือกท่าเดี่ยวๆ แยกตามต้องการ</span>
              </button>
            </div>

            {/* Body */}
            <div className="p-4 sm:p-5 overflow-y-auto flex-1 space-y-3">
              {physioMode === 'preset' ? (
                <div className="space-y-2.5">
                  <p className="text-xs font-bold text-slate-600">
                    เลือกชุดท่ากายภาพที่ต้องการ (คลิกเลือก 1 ชุด):
                  </p>
                  <div className="grid grid-cols-1 gap-2.5">
                    {DEFAULT_PHYSIO_PRESETS.map((preset) => {
                      const isSelected = selectedPresetId === preset.id;
                      return (
                        <div
                          key={preset.id}
                          onClick={() => setSelectedPresetId(preset.id)}
                          className={`p-3.5 rounded-2xl border-2 transition cursor-pointer flex items-start justify-between gap-3 ${
                            isSelected
                              ? 'border-emerald-500 bg-emerald-50/40 shadow-xs'
                              : 'border-slate-200 hover:border-slate-300 bg-white'
                          }`}
                        >
                          <div className="flex items-start gap-3">
                            <span className="text-2xl">{preset.icon}</span>
                            <div>
                              <div className="flex items-center gap-2">
                                <h4 className="text-xs sm:text-sm font-black text-[#0B2B2B]">
                                  {preset.name}
                                </h4>
                                <span className="px-2 py-0.2 rounded-md bg-emerald-100 text-emerald-800 text-[10px] font-extrabold">
                                  {preset.category}
                                </span>
                              </div>
                              <p className="text-[11px] text-slate-500 mt-0.5">
                                {preset.description}
                              </p>
                              <div className="mt-2 flex flex-wrap gap-1.5">
                                {preset.exercises.map((ex, i) => (
                                  <span
                                    key={i}
                                    className="px-2 py-0.5 rounded-lg bg-white border border-slate-200 text-slate-700 text-[10px] font-bold"
                                  >
                                    • {ex.exerciseName} ({ex.sets} เซ็ต x {ex.reps} ครั้ง)
                                  </span>
                                ))}
                              </div>
                            </div>
                          </div>
                          <div
                            className={`w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 mt-1 ${
                              isSelected ? 'bg-emerald-600 text-white' : 'border border-slate-300'
                            }`}
                          >
                            {isSelected && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-bold text-slate-600">
                      ติ๊กเลือกท่าที่ต้องการให้คนไข้ฝึก (เลือกได้หลายท่า):
                    </p>
                    <span className="text-xs font-black text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200">
                      เลือกแล้ว: {selectedIndividualSlugs.length} ท่า
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {AVAILABLE_INDIVIDUAL_EXERCISES.map((ex) => {
                      const isChecked = selectedIndividualSlugs.includes(ex.slug);
                      return (
                        <div
                          key={ex.slug}
                          onClick={() => handleToggleIndividualExercise(ex.slug)}
                          className={`p-3 rounded-2xl border transition cursor-pointer flex items-center justify-between gap-2 ${
                            isChecked
                              ? 'border-emerald-500 bg-emerald-50/50 shadow-2xs font-extrabold'
                              : 'border-slate-200 hover:border-slate-300 bg-white text-slate-700'
                          }`}
                        >
                          <div className="flex items-center gap-2 truncate">
                            {isChecked ? (
                              <CheckSquare className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                            ) : (
                              <Square className="w-4 h-4 text-slate-400 flex-shrink-0" />
                            )}
                            <div className="truncate">
                              <div className="text-xs truncate">{ex.name}</div>
                              <div className="text-[10px] text-slate-400 font-semibold">{ex.category}</div>
                            </div>
                          </div>
                          <span className="text-[10px] text-slate-500 px-1.5 py-0.5 rounded bg-slate-100 flex-shrink-0">
                            3 เซ็ต x 10 ครั้ง
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="p-4 border-t border-slate-100 flex items-center justify-between bg-slate-50">
              <button
                type="button"
                onClick={() => setIsPhysioModalOpen(false)}
                className="px-4 py-2 rounded-xl text-slate-600 hover:bg-slate-200 text-xs font-bold transition cursor-pointer"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                onClick={handleSavePhysioConfig}
                className="px-6 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black shadow-md transition cursor-pointer active:scale-95"
              >
                บันทึกการตั้งค่าท่าฝึก
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =================================================================== */}
      {/* POPUP 2: กำหนดจำนวนคำถามมินิเกมฝึกสมอง                               */}
      {/* =================================================================== */}
      {isMinigameModalOpen && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-sm animate-fadeIn"
          onClick={() => setIsMinigameModalOpen(false)}
        >
          <div
            className="w-full max-w-md bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden text-left animate-scaleUp"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="p-4 sm:p-5 border-b border-slate-100 flex items-center justify-between bg-gradient-to-r from-purple-50 to-pink-50">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-purple-600 text-white flex items-center justify-center shadow-xs">
                  <Gamepad2 className="w-5 h-5 stroke-[2.2]" />
                </div>
                <div>
                  <h3 className="text-base font-black text-[#0B2B2B]">
                    กำหนดจำนวนคำถามมินิเกม
                  </h3>
                  <p className="text-[11px] text-slate-500 font-semibold">
                    เลือกจำนวนข้อที่คนไข้จะต้องตอบในแต่ละรอบการฝึก
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsMinigameModalOpen(false)}
                className="p-1 rounded-full text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Body */}
            <div className="p-5 space-y-4">
              <label className="block text-xs font-bold text-slate-700">
                เลือกจำนวนคำถามต่อรอบ (คลิกเลือกตัวเลขด่วน):
              </label>

              {/* Preset buttons: 5, 10, 15, 20, 25, 30 */}
              <div className="grid grid-cols-3 gap-2">
                {[5, 10, 15, 20, 25, 30].map((cnt) => {
                  const isCurrent = minigameQuestionCount === cnt;
                  return (
                    <button
                      key={cnt}
                      type="button"
                      onClick={() => {
                        setMinigameQuestionCount(cnt);
                        setCustomQuestionInput(String(cnt));
                      }}
                      className={`py-3 px-2 rounded-2xl text-xs font-black transition border cursor-pointer ${
                        isCurrent
                          ? 'bg-purple-600 text-white border-purple-600 shadow-md ring-2 ring-purple-200'
                          : 'bg-white hover:bg-purple-50 text-slate-700 border-slate-200'
                      }`}
                    >
                      <div className="text-base font-black">{cnt}</div>
                      <div className="text-[10px] opacity-80">คำถาม</div>
                    </button>
                  );
                })}
              </div>

              {/* Custom input */}
              <div className="pt-2 border-t border-slate-100">
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  หรือระบุจำนวนคำถามเอง:
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min="1"
                    max="50"
                    value={customQuestionInput}
                    onChange={(e) => {
                      setCustomQuestionInput(e.target.value);
                      const parsed = parseInt(e.target.value, 10);
                      if (!isNaN(parsed) && parsed > 0) {
                        setMinigameQuestionCount(parsed);
                      }
                    }}
                    className="flex-1 px-3.5 py-2.5 rounded-xl border border-purple-200 text-sm font-black text-[#0B2B2B] focus:outline-none focus:ring-2 focus:ring-purple-400"
                    placeholder="เช่น 20"
                  />
                  <span className="text-xs font-extrabold text-slate-500">คำถาม</span>
                </div>
              </div>

              {/* Real-time Preview Pill */}
              <div className="p-3 rounded-2xl bg-purple-50 border border-purple-200 text-purple-900 text-xs font-bold flex items-center gap-2">
                <Check className="w-4 h-4 text-purple-600 flex-shrink-0" />
                <span>
                  คนไข้จะได้รับแบบทดสอบฝึกสมอง <strong>{minigameQuestionCount} ข้อ</strong> สุ่มจากคลังคำถาม
                </span>
              </div>
            </div>

            {/* Footer */}
            <div className="p-4 border-t border-slate-100 flex items-center justify-between bg-slate-50">
              <button
                type="button"
                onClick={() => setIsMinigameModalOpen(false)}
                className="px-4 py-2 rounded-xl text-slate-600 hover:bg-slate-200 text-xs font-bold transition cursor-pointer"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                onClick={() => handleSaveMinigameConfig(minigameQuestionCount)}
                className="px-6 py-2 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-xs font-black shadow-md transition cursor-pointer active:scale-95"
              >
                บันทึก
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
