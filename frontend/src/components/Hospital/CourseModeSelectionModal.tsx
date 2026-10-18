import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  X,
  Calendar,
  Gamepad2,
  Check,
  ArrowRight,
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Activity,
  Pencil,
  Plus,
  Minus,
  CheckSquare,
  Square,
  Sparkles,
  Layers,
  Sliders,
  AlertCircle,
} from 'lucide-react';
import {
  PrescribedExercise,
  HospitalExercise,
  ExerciseModpack,
  TrainingModes,
} from '../../types/hospital';
import modpacksJson from '../../data/modpacks.json';
import exercisesJson from '../../data/exercises.json';
import { saveMiniGameSettings, getSavedMiniGameSettings } from '../../services/miniGameSettingsService';

const DRAFT_STORAGE_KEY = 'strongcare_course_mode_draft';

interface CourseModeSelectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  patient: any;
  dateStr: string; // e.g. '2026-10-16'
  exercises?: HospitalExercise[];
  modpacks?: ExerciseModpack[];
  initialTrainingModes?: TrainingModes;
  onSaveCourse: (courseData: {
    mode: 'physio' | 'minigame' | 'both';
    includePhysio: boolean;
    includeMinigame: boolean;
    assignedExercises: PrescribedExercise[];
    minigameQuestionCount: number;
    trainingModes: TrainingModes;
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

// Thai day color dots matching design
const THAI_DAY_DOTS = [
  { name: 'จ.', full: 'จันทร์', color: '#F59E0B' },
  { name: 'อ.', full: 'อังคาร', color: '#EF4444' },
  { name: 'พ.', full: 'พุธ', color: '#10B981' },
  { name: 'พฤ.', full: 'พฤหัสบดี', color: '#F97316' },
  { name: 'ศ.', full: 'ศุกร์', color: '#3B82F6' },
  { name: 'ส.', full: 'เสาร์', color: '#8B5CF6' },
  { name: 'อา.', full: 'อาทิตย์', color: '#DC2626' },
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

// Helper to convert HospitalExercise into PrescribedExercise
function exerciseToPrescribed(ex: HospitalExercise): PrescribedExercise {
  const slug = (ex as any).slug || (ex as any).svgType || `ex_${ex.id}`;
  return {
    exerciseSlug: slug,
    exerciseName: ex.name,
    sets: ex.sets || ex.defaultSets || 3,
    reps: ex.repsPerSet || ex.defaultReps || 10,
    holdSeconds: ex.holdSeconds || 3,
    difficulty: ex.difficulty === 'hard' ? 'advanced' : ex.difficulty === 'medium' ? 'intermediate' : 'beginner',
  };
}

export const CourseModeSelectionModal: React.FC<CourseModeSelectionModalProps> = ({
  isOpen,
  onClose,
  patient,
  dateStr,
  exercises: propExercises,
  modpacks: propModpacks,
  initialTrainingModes,
  onSaveCourse,
}) => {
  // Use actual system modpacks & exercises (from props or JSON)
  const systemModpacks: ExerciseModpack[] = useMemo(() => {
    return propModpacks && propModpacks.length > 0
      ? propModpacks
      : (modpacksJson as ExerciseModpack[]);
  }, [propModpacks]);

  const systemExercises: HospitalExercise[] = useMemo(() => {
    return propExercises && propExercises.length > 0
      ? propExercises
      : (exercisesJson as unknown as HospitalExercise[]);
  }, [propExercises]);

  // Step state: 1 = เลือกรูปแบบการฝึก (ปรากฏหน้านี้ก่อนเสมอเมื่อกดเพิ่มวันนัด), 2 = ตั้งค่าคอร์ส (ตัดคอร์ส)
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
  const [physioMode, setPhysioMode] = useState<'pack' | 'custom'>('pack');
  const [selectedPackId, setSelectedPackId] = useState<string>(() => {
    return systemModpacks[0]?.id ? String(systemModpacks[0].id) : 'modpack-shoulder-daily';
  });
  const [selectedCustomSlugs, setSelectedCustomSlugs] = useState<string[]>(() => {
    const defaultPack = systemModpacks[0];
    if (defaultPack?.exercises?.length) {
      return defaultPack.exercises.map((e) => e.exerciseSlug);
    }
    return systemExercises.slice(0, 4).map((e) => (e as any).slug || (e as any).svgType || `ex_${e.id}`);
  });

  // Temporary editing states inside Physio Modal (so cancel reverts them)
  const [tempPhysioMode, setTempPhysioMode] = useState<'pack' | 'custom'>('pack');
  const [tempPackId, setTempPackId] = useState<string>(selectedPackId);
  const [tempCustomSlugs, setTempCustomSlugs] = useState<string[]>(selectedCustomSlugs);

  // --- Minigame Configuration States ---
  const [isMinigameModalOpen, setIsMinigameModalOpen] = useState<boolean>(false);
  const [minigameQuestionCount, setMinigameQuestionCount] = useState<number>(20);
  const [tempMinigameQuestionCount, setTempMinigameQuestionCount] = useState<number>(20);

  // Step 2 Form States
  const [startDateStr, setStartDateStr] = useState<string>(() => dateStr || '2026-10-16');
  const [targetSessionCount, setTargetSessionCount] = useState<number>(10);
  const [isCustomCount, setIsCustomCount] = useState<boolean>(false);
  const [customCountInput, setCustomCountInput] = useState<string>('10');
  const [calendarView, setCalendarView] = useState<'month' | 'week'>('month');

  // Safe date parser
  const parseDateSafe = useCallback((val: string): { year: number; month: number; day: number } => {
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
  }, []);

  const [viewDate, setViewDate] = useState<Date>(() => {
    const { year, month } = parseDateSafe(dateStr || '2026-10-16');
    return new Date(year, month, 1);
  });

  const [selectedDates, setSelectedDates] = useState<string[]>([]);

  // Load from draft or initialize whenever modal opens
  useEffect(() => {
    if (isOpen) {
      const initialDate = dateStr || '2026-10-16';
      setStartDateStr(initialDate);
      const { year, month } = parseDateSafe(initialDate);
      setViewDate(new Date(year, month, 1));
      // Requirement 1: ให้ขึ้นป็อบอัป "เลือกรูปแบบการฝึก" (ขั้นที่ 1 จาก 2) เป็นอันดับแรกเสมอ
      setStep(1);

      // Check if draft exists in localStorage or initialTrainingModes passed
      let loadedFromDraft = false;
      try {
        if (initialTrainingModes) {
          setIncludePhysio(initialTrainingModes.rom?.enabled ?? true);
          setIncludeMinigame(initialTrainingModes.minigame?.enabled ?? false);
          if (initialTrainingModes.rom?.type) {
            setPhysioMode(initialTrainingModes.rom.type);
          }
          if (initialTrainingModes.rom?.packId) {
            setSelectedPackId(initialTrainingModes.rom.packId);
          }
          if (initialTrainingModes.rom?.poseIds?.length) {
            setSelectedCustomSlugs(initialTrainingModes.rom.poseIds);
          }
          if (initialTrainingModes.minigame?.questionCount) {
            setMinigameQuestionCount(initialTrainingModes.minigame.questionCount);
          }
          loadedFromDraft = true;
        } else {
          const rawDraft = localStorage.getItem(DRAFT_STORAGE_KEY);
          if (rawDraft) {
            const parsed = JSON.parse(rawDraft);
            if (typeof parsed.includePhysio === 'boolean') setIncludePhysio(parsed.includePhysio);
            if (typeof parsed.includeMinigame === 'boolean') setIncludeMinigame(parsed.includeMinigame);
            if (parsed.physioMode === 'pack' || parsed.physioMode === 'custom') setPhysioMode(parsed.physioMode);
            if (parsed.selectedPackId) setSelectedPackId(parsed.selectedPackId);
            if (Array.isArray(parsed.selectedCustomSlugs) && parsed.selectedCustomSlugs.length > 0) {
              setSelectedCustomSlugs(parsed.selectedCustomSlugs);
            }
            if (typeof parsed.minigameQuestionCount === 'number' && parsed.minigameQuestionCount >= 5) {
              setMinigameQuestionCount(parsed.minigameQuestionCount);
            }
            loadedFromDraft = true;
          }
        }
      } catch (err) {
        console.warn('Could not restore draft:', err);
      }

      if (!loadedFromDraft) {
        setIncludePhysio(true);
        setIncludeMinigame(false);
        const savedMinigame = getSavedMiniGameSettings();
        setMinigameQuestionCount(savedMinigame.questionCount || 20);
      }
    }
  }, [isOpen, dateStr, initialTrainingModes, parseDateSafe]);

  // Persist current settings to draft storage
  useEffect(() => {
    if (isOpen) {
      try {
        localStorage.setItem(
          DRAFT_STORAGE_KEY,
          JSON.stringify({
            includePhysio,
            includeMinigame,
            physioMode,
            selectedPackId,
            selectedCustomSlugs,
            minigameQuestionCount,
          })
        );
      } catch {}
    }
  }, [isOpen, includePhysio, includeMinigame, physioMode, selectedPackId, selectedCustomSlugs, minigameQuestionCount]);

  // Helper to format ISO YYYY-MM-DD
  const formatIso = (year: number, month: number, day: number) => {
    return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  };

  const formatDisplayDate = (isoOrSlash: string) => {
    const { year, month, day } = parseDateSafe(isoOrSlash);
    return `${String(day).padStart(2, '0')}/${String(month + 1).padStart(2, '0')}/${year}`;
  };

  const generateRecurringDates = useCallback((startDateIso: string, count: number): string[] => {
    const dates: string[] = [];
    const { year, month, day } = parseDateSafe(startDateIso);
    const curr = new Date(year, month, day);

    dates.push(formatIso(curr.getFullYear(), curr.getMonth(), curr.getDate()));

    let nextDate = new Date(curr);
    let loopGuard = 0;
    while (dates.length < count && loopGuard < 120) {
      loopGuard++;
      nextDate.setDate(nextDate.getDate() + 1);
      const dayOfWeek = nextDate.getDay();
      if (dayOfWeek === 1 || dayOfWeek === 5) {
        dates.push(formatIso(nextDate.getFullYear(), nextDate.getMonth(), nextDate.getDate()));
      }
    }
    return dates;
  }, [parseDateSafe]);

  useEffect(() => {
    const generated = generateRecurringDates(startDateStr, targetSessionCount);
    setSelectedDates(generated);
  }, [startDateStr, targetSessionCount, generateRecurringDates]);

  // ESC key handler for modals
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (isPhysioModalOpen) {
          setIsPhysioModalOpen(false);
        } else if (isMinigameModalOpen) {
          setIsMinigameModalOpen(false);
        } else if (isOpen) {
          onClose();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isPhysioModalOpen, isMinigameModalOpen, onClose]);

  if (!isOpen || !patient) return null;

  const patientName = patient.name || 'คุณสมชาย ใจดี';
  const patientCode = patient.code || patient.patient_code || 'PT-2026-001';

  // Toggle date selection manually
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

  const handlePrevMonth = () => {
    setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() - 1, 1));
  };

  const handleNextMonth = () => {
    setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 1));
  };

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

  // Find currently selected pack object
  const currentPack = systemModpacks.find((p) => String(p.id) === String(selectedPackId)) || systemModpacks[0];
  const currentPackName = currentPack?.name || 'คอร์สฟื้นฟูไหล่ติดประจำวัน';

  // Build assigned exercises from active configuration
  const assignedExercises: PrescribedExercise[] = useMemo(() => {
    if (physioMode === 'pack') {
      return currentPack?.exercises || [];
    } else {
      return selectedCustomSlugs.map((slug) => {
        const found = systemExercises.find((ex) => {
          const exSlug = (ex as any).slug || (ex as any).svgType || `ex_${ex.id}`;
          return exSlug === slug;
        });
        if (found) {
          return exerciseToPrescribed(found);
        }
        return {
          exerciseSlug: slug,
          exerciseName: slug,
          sets: 3,
          reps: 10,
          holdSeconds: 3,
          difficulty: 'beginner',
        };
      });
    }
  }, [physioMode, currentPack, selectedCustomSlugs, systemExercises]);

  // Open Physio Edit Popup
  const handleOpenPhysioEdit = () => {
    setTempPhysioMode(physioMode);
    setTempPackId(selectedPackId);
    setTempCustomSlugs([...selectedCustomSlugs]);
    setIsPhysioModalOpen(true);
  };

  // Save Physio Configuration from popup (3.1)
  const handleSavePhysioConfig = () => {
    if (tempPhysioMode === 'custom' && tempCustomSlugs.length === 0) {
      return; // Disabled if 0 poses
    }
    setPhysioMode(tempPhysioMode);
    setSelectedPackId(tempPackId);
    setSelectedCustomSlugs(tempCustomSlugs);
    setIsPhysioModalOpen(false);
  };

  // Toggle pose in custom mode
  const handleToggleCustomPose = (slug: string) => {
    if (tempCustomSlugs.includes(slug)) {
      setTempCustomSlugs(tempCustomSlugs.filter((s) => s !== slug));
    } else {
      setTempCustomSlugs([...tempCustomSlugs, slug]);
    }
  };

  // Select all / clear all custom poses
  const handleSelectAllCustomPoses = () => {
    const allSlugs = systemExercises.map((ex) => (ex as any).slug || (ex as any).svgType || `ex_${ex.id}`);
    setTempCustomSlugs(allSlugs);
  };

  const handleClearAllCustomPoses = () => {
    setTempCustomSlugs([]);
  };

  // Open Minigame Edit Popup
  const handleOpenMinigameEdit = () => {
    setTempMinigameQuestionCount(minigameQuestionCount);
    setIsMinigameModalOpen(true);
  };

  // Save Minigame Configuration from popup (3.2)
  const handleSaveMinigameConfig = () => {
    const clamped = Math.min(50, Math.max(5, tempMinigameQuestionCount));
    setMinigameQuestionCount(clamped);
    const currSettings = getSavedMiniGameSettings();
    saveMiniGameSettings({
      ...currSettings,
      questionCount: clamped,
    });
    setIsMinigameModalOpen(false);
  };

  // Submit and save course
  const handleConfirmSave = () => {
    const activeMode: 'physio' | 'minigame' | 'both' =
      includePhysio && includeMinigame ? 'both' : (includeMinigame ? 'minigame' : 'physio');

    const trainingModesData: TrainingModes = {
      rom: {
        enabled: includePhysio,
        type: physioMode,
        packId: physioMode === 'pack' ? selectedPackId : undefined,
        packName: physioMode === 'pack' ? currentPackName : undefined,
        poseIds: physioMode === 'pack'
          ? (currentPack?.exercises.map((e) => e.exerciseSlug) || [])
          : selectedCustomSlugs,
        exercises: includePhysio ? assignedExercises : [],
      },
      minigame: {
        enabled: includeMinigame,
        questionCount: minigameQuestionCount,
      },
    };

    onSaveCourse({
      mode: activeMode,
      includePhysio,
      includeMinigame,
      assignedExercises: includePhysio ? assignedExercises : [],
      minigameQuestionCount,
      trainingModes: trainingModesData,
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
                  {step === 1 ? 'เลือกรูปแบบการฝึก' : 'ตั้งค่าคอร์สการฝึก'}
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
              title="ปิดหน้าต่าง (ไม่สร้างนัด)"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* ================================================================= */}
        {/* STEP 1: Select Mode (Multi-select: กายภาพ & มินิเกม พร้อมปุ่มแก้ไข) */}
        {/* ================================================================= */}
        {step === 1 && (
          <div className="p-5 sm:p-7 space-y-6">
            <div className="flex items-center justify-between flex-wrap gap-2">
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
              {/* Option A: กายภาพปกติ (ROM Exercise) */}
              <div
                onClick={() => setIncludePhysio(!includePhysio)}
                className={`p-6 rounded-3xl border-2 transition-all flex flex-col justify-between cursor-pointer relative ${
                  includePhysio
                    ? 'border-[#00C49F] bg-emerald-50/30 shadow-md ring-4 ring-[#00C49F]/15'
                    : 'border-slate-200 hover:border-slate-300 bg-white opacity-85'
                }`}
              >
                {/* มุมขวาบน: ปุ่มแก้ไข (Requirement 3: stopPropagation ป้องกัน toggle) */}
                <div className="absolute top-4 right-4">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleOpenPhysioEdit();
                    }}
                    className="px-3 py-1 rounded-xl bg-white hover:bg-emerald-50 border border-emerald-300 text-emerald-800 text-xs font-black shadow-2xs hover:shadow transition flex items-center gap-1.5 cursor-pointer active:scale-95"
                    title="คลิกเพื่อแก้ไขชุดท่าหรือเลือกท่าเอง"
                  >
                    <Pencil className="w-3.5 h-3.5 text-emerald-600" />
                    <span>แก้ไข</span>
                  </button>
                </div>

                <div className="space-y-3">
                  {/* แถวไอคอน + เครื่องหมายถูกที่มุมซ้ายบน / ข้างไอคอน (Requirement 3) */}
                  <div className="flex items-center gap-3">
                    <div
                      className={`w-6 h-6 rounded-full flex items-center justify-center transition-all flex-shrink-0 ${
                        includePhysio
                          ? 'bg-[#00C49F] text-white shadow-sm'
                          : 'border-2 border-slate-300 bg-white text-transparent'
                      }`}
                    >
                      <Check className="w-4 h-4 stroke-[3]" />
                    </div>

                    <div className="w-13 h-13 rounded-2xl bg-emerald-100 text-emerald-600 border border-emerald-200 flex items-center justify-center shadow-xs">
                      <Activity className="w-6 h-6 stroke-[2.2]" />
                    </div>
                  </div>

                  <div>
                    <h3 className="text-lg font-black text-[#0B2B2B]">
                      กายภาพปกติ (ROM Exercise)
                    </h3>
                    <p className="text-xs text-slate-500 font-medium mt-1 leading-relaxed">
                      โปรแกรมกายภาพบำบัดฟื้นฟูกล้ามเนื้อและข้อต่อตามชุดท่าที่คุณหมอกำหนด เช่น กางแขน เหยียดไหล่ และข้อศอก
                    </p>
                  </div>

                  {/* สรุปค่าที่ตั้งไว้เป็นข้อความสั้นๆ (Requirement 3) */}
                  <div className="p-3 rounded-2xl bg-white border border-emerald-200/90 shadow-2xs space-y-1">
                    <div className="text-[11px] font-bold text-slate-500 flex items-center justify-between">
                      <span>รูปแบบการฝึกที่ตั้งไว้:</span>
                      <span className="font-black text-emerald-700">
                        {physioMode === 'pack' ? 'แบบชุด/แพ็ก' : 'เลือกท่าเอง'}
                      </span>
                    </div>
                    <div className="text-xs font-black text-[#0B2B2B] truncate">
                      {physioMode === 'pack'
                        ? `ชุด: ${currentPackName}`
                        : `เลือกเอง ${assignedExercises.length} ท่า`}
                    </div>
                    <div className="text-[10px] text-slate-400 font-medium">
                      รวม {assignedExercises.length} ท่าฝึก (คลิกปุ่ม &quot;แก้ไข&quot; เพื่อเปลี่ยน)
                    </div>
                  </div>
                </div>

                {/* ปุ่มด้านล่าง (Requirement 2) */}
                <div className="pt-4">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setIncludePhysio(!includePhysio);
                    }}
                    className={`w-full py-2.5 px-4 rounded-2xl font-black text-xs transition flex items-center justify-center gap-1.5 cursor-pointer ${
                      includePhysio
                        ? 'bg-[#00C49F] text-white shadow-sm hover:bg-[#00B08E]'
                        : 'bg-white border border-slate-300 text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    {includePhysio ? (
                      <>
                        <Check className="w-4 h-4 stroke-[2.5]" />
                        <span>เลือกแบบนี้แล้ว</span>
                      </>
                    ) : (
                      <span>เลือกแบบนี้</span>
                    )}
                  </button>
                </div>
              </div>

              {/* Option B: มินิเกมฝึกสมอง */}
              <div
                onClick={() => setIncludeMinigame(!includeMinigame)}
                className={`p-6 rounded-3xl border-2 transition-all flex flex-col justify-between cursor-pointer relative ${
                  includeMinigame
                    ? 'border-[#00C49F] bg-emerald-50/25 shadow-md ring-4 ring-[#00C49F]/15'
                    : 'border-slate-200 hover:border-slate-300 bg-white opacity-85'
                }`}
              >
                {/* มุมขวาบน: ปุ่มแก้ไข (Requirement 3: stopPropagation) */}
                <div className="absolute top-4 right-4">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleOpenMinigameEdit();
                    }}
                    className="px-3 py-1 rounded-xl bg-white hover:bg-purple-50 border border-purple-300 text-purple-800 text-xs font-black shadow-2xs hover:shadow transition flex items-center gap-1.5 cursor-pointer active:scale-95"
                    title="คลิกเพื่อแก้ไขจำนวนคำถามมินิเกม"
                  >
                    <Pencil className="w-3.5 h-3.5 text-purple-600" />
                    <span>แก้ไข</span>
                  </button>
                </div>

                <div className="space-y-3">
                  {/* แถวไอคอน + เครื่องหมายถูกที่มุมซ้ายบน / ข้างไอคอน (Requirement 3) */}
                  <div className="flex items-center gap-3">
                    <div
                      className={`w-6 h-6 rounded-full flex items-center justify-center transition-all flex-shrink-0 ${
                        includeMinigame
                          ? 'bg-[#00C49F] text-white shadow-sm'
                          : 'border-2 border-slate-300 bg-white text-transparent'
                      }`}
                    >
                      <Check className="w-4 h-4 stroke-[3]" />
                    </div>

                    <div className="w-13 h-13 rounded-2xl bg-purple-100 text-purple-600 border border-purple-200 flex items-center justify-center shadow-xs">
                      <Gamepad2 className="w-6 h-6 stroke-[2.2]" />
                    </div>
                  </div>

                  <div>
                    <h3 className="text-lg font-black text-[#0B2B2B]">
                      มินิเกมฝึกสมอง
                    </h3>
                    <p className="text-xs text-slate-500 font-medium mt-1 leading-relaxed">
                      ฝึกกายภาพผ่านเกมสั้น ๆ ขยับร่างกายเพื่อเล่นเกม ช่วยให้คนไข้สนุกและฝึกต่อเนื่อง พร้อมฝึกสมองไปด้วย
                    </p>
                  </div>

                  {/* สรุปค่าที่ตั้งไว้เป็นข้อความสั้นๆ (Requirement 3: เช่น "20 คำถาม") */}
                  <div className="p-3 rounded-2xl bg-white border border-purple-200/90 shadow-2xs space-y-1">
                    <div className="text-[11px] font-bold text-slate-500 flex items-center justify-between">
                      <span>จำนวนคำถามที่ตั้งไว้:</span>
                      <span className="font-black text-purple-700">
                        {minigameQuestionCount} คำถาม
                      </span>
                    </div>
                    <div className="text-xs font-black text-[#0B2B2B] truncate">
                      🎯 {minigameQuestionCount} คำถาม
                    </div>
                    <div className="text-[10px] text-slate-400 font-medium">
                      สุ่มคำถามไม่ซ้ำกัน (คลิกปุ่ม &quot;แก้ไข&quot; เพื่อเปลี่ยนจำนวน)
                    </div>
                  </div>
                </div>

                {/* ปุ่มด้านล่าง (Requirement 2) */}
                <div className="pt-4">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setIncludeMinigame(!includeMinigame);
                    }}
                    className={`w-full py-2.5 px-4 rounded-2xl font-black text-xs transition flex items-center justify-center gap-1.5 cursor-pointer ${
                      includeMinigame
                        ? 'bg-[#00C49F] text-white shadow-sm hover:bg-[#00B08E]'
                        : 'bg-white border border-slate-300 text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    {includeMinigame ? (
                      <>
                        <Check className="w-4 h-4 stroke-[2.5]" />
                        <span>เลือกแบบนี้แล้ว</span>
                      </>
                    ) : (
                      <span>เลือกแบบนี้</span>
                    )}
                  </button>
                </div>
              </div>
            </div>

            {/* Warning if neither selected (Requirement 2) */}
            {!includePhysio && !includeMinigame && (
              <div className="p-3.5 rounded-2xl bg-amber-50 border border-amber-300 text-amber-900 text-xs font-bold text-center flex items-center justify-center gap-2 animate-shake">
                <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0" />
                <span>กรุณาเลือกรูปแบบการฝึกอย่างน้อย 1 อย่าง (กายภาพปกติ หรือ มินิเกม หรือทั้ง 2 อย่าง)</span>
              </div>
            )}
          </div>
        )}

        {/* ================================================================= */}
        {/* STEP 2: Main Cut Course Matrix                                    */}
        {/* ================================================================= */}
        {step === 2 && (
          <div className="p-4 sm:p-6 space-y-4 max-h-[calc(88dvh-150px)] overflow-y-auto">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-stretch">
              {/* LEFT CARD: วันและรอบการฝึก (5 cols) */}
              <div className="lg:col-span-5 bg-white border border-slate-200/90 rounded-[24px] p-4 sm:p-5 flex flex-col justify-between shadow-2xs space-y-4">
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

                {/* 3. โปรแกรมในคอร์สที่จะฝึกในแต่ละวัน */}
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
                            กายภาพปกติ: {physioMode === 'pack' ? `ชุด: ${currentPackName}` : `เลือกเอง ${assignedExercises.length} ท่า`}
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
                          ✓ เซ็ตไว้ {minigameQuestionCount} ข้อต่อรอบ สุ่มคำถามไม่ซ้ำกัน พร้อมตรวจจับผ่านกล้อง AI
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* RIGHT CARD: เลือกวันที่มาฝึก (7 cols) */}
              <div className="lg:col-span-7 bg-white border border-slate-200/90 rounded-[24px] p-4 sm:p-5 flex flex-col justify-between shadow-2xs space-y-3">
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

                {/* Calendar Navigation */}
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

                {/* Day-of-week header */}
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

                {/* Days Matrix */}
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

                {/* Legend */}
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
      {/* POPUP 1: ตั้งค่าท่ากายภาพปกติ (3.1: แบบชุด หรือ ติ๊กเลือกท่าเอง)    */}
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
                    เลือกวิธีออกกำลังกาย: เลือกชุดสำเร็จรูป หรือ ติ๊กเลือกท่าเอง
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsPhysioModalOpen(false)}
                className="p-1.5 rounded-full text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Segmented Control / Tabs (Requirement 3.1) */}
            <div className="p-3 bg-slate-50 border-b border-slate-200/80 flex items-center gap-2">
              <button
                type="button"
                onClick={() => setTempPhysioMode('pack')}
                className={`flex-1 py-2 px-3 rounded-2xl text-xs font-black transition flex items-center justify-center gap-2 cursor-pointer ${
                  tempPhysioMode === 'pack'
                    ? 'bg-emerald-600 text-white shadow-xs'
                    : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
                }`}
              >
                <Layers className="w-4 h-4" />
                <span>(ก) แบบชุด/แพ็ก</span>
              </button>
              <button
                type="button"
                onClick={() => setTempPhysioMode('custom')}
                className={`flex-1 py-2 px-3 rounded-2xl text-xs font-black transition flex items-center justify-center gap-2 cursor-pointer ${
                  tempPhysioMode === 'custom'
                    ? 'bg-emerald-600 text-white shadow-xs'
                    : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
                }`}
              >
                <Sliders className="w-4 h-4" />
                <span>(ข) เลือกท่าเอง</span>
              </button>
            </div>

            {/* Body */}
            <div className="p-4 sm:p-5 overflow-y-auto flex-1 space-y-3">
              {tempPhysioMode === 'pack' ? (
                /* (ก) แบบชุด/แพ็ก จากระบบ */
                <div className="space-y-2.5">
                  <p className="text-xs font-bold text-slate-600">
                    เลือกชุดสำเร็จรูป 1 ชุด จากรายการชุดที่มีอยู่ในระบบ:
                  </p>
                  <div className="grid grid-cols-1 gap-2.5">
                    {systemModpacks.map((pack) => {
                      const isSelected = String(tempPackId) === String(pack.id);
                      return (
                        <div
                          key={pack.id}
                          onClick={() => setTempPackId(String(pack.id))}
                          className={`p-3.5 rounded-2xl border-2 transition cursor-pointer flex items-start justify-between gap-3 ${
                            isSelected
                              ? 'border-[#00C49F] bg-emerald-50/50 shadow-xs ring-2 ring-emerald-200/60'
                              : 'border-slate-200 hover:border-slate-300 bg-white'
                          }`}
                        >
                          <div className="flex items-start gap-3">
                            <span className="text-2xl mt-0.5">{pack.icon || '🦴'}</span>
                            <div className="space-y-1">
                              <div className="flex items-center gap-2 flex-wrap">
                                <h4 className="text-xs sm:text-sm font-black text-[#0B2B2B]">
                                  {pack.name}
                                </h4>
                                {pack.category && (
                                  <span className="px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-800 text-[10px] font-extrabold">
                                    {pack.category}
                                  </span>
                                )}
                              </div>
                              {pack.description && (
                                <p className="text-[11px] text-slate-500 leading-relaxed">
                                  {pack.description}
                                </p>
                              )}
                              <div className="mt-2 flex flex-wrap gap-1.5">
                                {pack.exercises?.map((ex, i) => (
                                  <span
                                    key={i}
                                    className="px-2 py-0.5 rounded-lg bg-white border border-slate-200 text-slate-700 text-[10px] font-bold"
                                  >
                                    • {ex.exerciseName} ({ex.sets || 3} เซ็ต x {ex.reps || 10} ครั้ง)
                                  </span>
                                ))}
                              </div>
                            </div>
                          </div>

                          <div
                            className={`w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 mt-1 ${
                              isSelected ? 'bg-emerald-600 text-white shadow-xs' : 'border border-slate-300'
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
                /* (ข) เลือกท่าเอง (Requirement 3.1: checkbox ทุกท่าในระบบ, เลือกทั้งหมด/ล้างทั้งหมด, แสดงจำนวน) */
                <div className="space-y-3">
                  <div className="flex items-center justify-between flex-wrap gap-2 pb-1 border-b border-slate-100">
                    <div>
                      <p className="text-xs font-bold text-slate-600">
                        ติ๊กเลือกท่าที่ต้องการให้คนไข้ฝึก (เลือกได้หลายท่า):
                      </p>
                      <div className="text-[11px] font-extrabold text-emerald-700 mt-0.5">
                        เลือกแล้ว {tempCustomSlugs.length} ท่า จากทั้งหมด {systemExercises.length} ท่า
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={handleSelectAllCustomPoses}
                        className="px-2.5 py-1 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-bold transition cursor-pointer"
                      >
                        เลือกทั้งหมด
                      </button>
                      <button
                        type="button"
                        onClick={handleClearAllCustomPoses}
                        className="px-2.5 py-1 rounded-xl bg-slate-100 hover:bg-rose-50 text-slate-600 hover:text-rose-600 text-[11px] font-bold transition cursor-pointer"
                      >
                        ล้างทั้งหมด
                      </button>
                    </div>
                  </div>

                  {tempCustomSlugs.length === 0 && (
                    <div className="p-3 rounded-2xl bg-amber-50 border border-amber-300 text-amber-900 text-xs font-bold flex items-center gap-2">
                      <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0" />
                      <span>กรุณาเลือกอย่างน้อย 1 ท่าสำหรับโปรแกรมกายภาพบำบัด</span>
                    </div>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {systemExercises.map((ex) => {
                      const slug = (ex as any).slug || (ex as any).svgType || `ex_${ex.id}`;
                      const isChecked = tempCustomSlugs.includes(slug);
                      return (
                        <div
                          key={slug}
                          onClick={() => handleToggleCustomPose(slug)}
                          className={`p-3 rounded-2xl border transition cursor-pointer flex items-center justify-between gap-2 ${
                            isChecked
                              ? 'border-[#00C49F] bg-emerald-50/50 shadow-2xs font-extrabold ring-1 ring-emerald-300/60'
                              : 'border-slate-200 hover:border-slate-300 bg-white text-slate-700'
                          }`}
                        >
                          <div className="flex items-center gap-2.5 truncate">
                            {isChecked ? (
                              <CheckSquare className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                            ) : (
                              <Square className="w-4 h-4 text-slate-400 flex-shrink-0" />
                            )}
                            <div className="truncate text-left">
                              <div className="text-xs font-bold truncate text-[#0B2B2B]">
                                {ex.name}
                              </div>
                              <div className="text-[10px] text-slate-400 font-semibold truncate">
                                {ex.category || ex.targetJoint}
                              </div>
                            </div>
                          </div>

                          <span className="text-[10px] text-slate-500 px-1.5 py-0.5 rounded bg-slate-100 flex-shrink-0">
                            {ex.sets || 3} เซ็ต x {ex.repsPerSet || 10} ครั้ง
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
                disabled={tempPhysioMode === 'custom' && tempCustomSlugs.length === 0}
                onClick={handleSavePhysioConfig}
                className={`px-6 py-2 rounded-xl text-xs font-black shadow-md transition cursor-pointer active:scale-95 ${
                  tempPhysioMode === 'custom' && tempCustomSlugs.length === 0
                    ? 'bg-slate-200 text-slate-400 cursor-not-allowed shadow-none'
                    : 'bg-emerald-600 hover:bg-emerald-700 text-white'
                }`}
              >
                บันทึกการตั้งค่าท่าฝึก
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =================================================================== */}
      {/* POPUP 2: ป็อบอัปแก้ไขมินิเกมฝึกสมอง (3.2: เฉพาะจำนวนคำถามเท่านั้น) */}
      {/* =================================================================== */}
      {isMinigameModalOpen && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-sm animate-fadeIn"
          onClick={() => setIsMinigameModalOpen(false)}
        >
          <div
            className="w-full max-w-sm bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden text-left animate-scaleUp"
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
                    ระบุจำนวนคำถามที่คนไข้จะต้องตอบในวันนัด
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsMinigameModalOpen(false)}
                className="p-1.5 rounded-full text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Body: Requirement 3.2: มีแค่อย่างเดียวคือ "จำนวนคำถาม" (ช่องกรอกตัวเลข + ปุ่ม − / + ) ค่าเริ่มต้น 20 จำกัด 5-50 ห้ามมีตัวเลือกอื่นเพิ่ม */}
            <div className="p-6 space-y-4">
              <label className="block text-xs font-bold text-slate-700 text-center">
                จำนวนคำถาม (จำกัด 5 - 50 คำถาม):
              </label>

              <div className="flex items-center justify-center gap-3">
                {/* ปุ่มลบ (-) */}
                <button
                  type="button"
                  disabled={tempMinigameQuestionCount <= 5}
                  onClick={() => setTempMinigameQuestionCount((c) => Math.max(5, c - 1))}
                  className="w-11 h-11 rounded-2xl bg-purple-50 hover:bg-purple-100 border border-purple-200 text-purple-700 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center text-lg font-black transition cursor-pointer active:scale-95 shadow-2xs"
                  title="ลดจำนวนคำถาม"
                >
                  <Minus className="w-5 h-5 stroke-[3]" />
                </button>

                {/* ช่องกรอกตัวเลข */}
                <div className="flex items-center justify-center">
                  <input
                    type="number"
                    min="5"
                    max="50"
                    value={tempMinigameQuestionCount}
                    onChange={(e) => {
                      const val = parseInt(e.target.value, 10);
                      if (!isNaN(val)) {
                        setTempMinigameQuestionCount(val);
                      } else {
                        setTempMinigameQuestionCount(0);
                      }
                    }}
                    onBlur={() => {
                      setTempMinigameQuestionCount((c) => Math.min(50, Math.max(5, c || 20)));
                    }}
                    className="w-24 h-12 text-center text-2xl font-black text-[#0B2B2B] bg-slate-50 border-2 border-purple-300 rounded-2xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-purple-400 shadow-inner"
                  />
                </div>

                {/* ปุ่มบวก (+) */}
                <button
                  type="button"
                  disabled={tempMinigameQuestionCount >= 50}
                  onClick={() => setTempMinigameQuestionCount((c) => Math.min(50, c + 1))}
                  className="w-11 h-11 rounded-2xl bg-purple-50 hover:bg-purple-100 border border-purple-200 text-purple-700 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center text-lg font-black transition cursor-pointer active:scale-95 shadow-2xs"
                  title="เพิ่มจำนวนคำถาม"
                >
                  <Plus className="w-5 h-5 stroke-[3]" />
                </button>
              </div>

              <div className="text-center text-xs text-slate-500 font-semibold">
                ข้อ / รอบการฝึก (ค่าเริ่มต้น 20)
              </div>

              <div className="p-3 rounded-2xl bg-purple-50 border border-purple-200 text-purple-900 text-xs font-bold flex items-center gap-2">
                <Check className="w-4 h-4 text-purple-600 flex-shrink-0" />
                <span>
                  คนไข้จะเล่นมินิเกมตอบคำถาม <strong>{Math.min(50, Math.max(5, tempMinigameQuestionCount || 20))} ข้อ</strong> แล้วระบบจะจบเกม
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
                onClick={handleSaveMinigameConfig}
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
