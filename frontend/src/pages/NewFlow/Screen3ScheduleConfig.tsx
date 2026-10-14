import React, { useState, useEffect } from 'react';
import {
  ArrowLeft,
  Clock,
  Calendar,
  Check,
  Play,
  CalendarCheck,
  Activity,
  Heart,
  Cross,
  Plus,
  Minus,
  Edit2,
  X,
  Sparkles,
  AlertCircle,
} from 'lucide-react';
import {
  TherapyMode,
  TimeSelectionMode,
  ExerciseCategoryType,
  TherapyScheduleConfig,
  getSavedTherapyConfig,
  saveTherapyConfig,
  getTodayDateString,
  getDefaultDateString,
  getDefaultTimeString,
  formatThaiDateTime,
} from '../../services/therapySettingsService';
import {
  STRETCH_EXERCISES,
  STRETCH_PROGRAM_METADATA,
  calculateEstimatedMinutes,
  formatExerciseTimeTag,
  StretchExerciseItem,
} from '../../data/stretchExercises';
import { ExerciseVideoModal } from '../../components/VideoPlayer/ExerciseVideoModal';
import { ExerciseSelectionModal } from '../../components/Exercise/ExerciseSelectionModal';
import { CustomPosesPage } from '../../components/CustomPoses/CustomPosesPage';
import { getCustomPoseCount } from '../../services/customPoseService';

interface Screen3ScheduleConfigProps {
  mode: TherapyMode; // 'physio' | 'minigame'
  patientId?: number | string;
  onBack: () => void;
  onStartNow: (config: TherapyScheduleConfig) => void;
  onScheduleSaved: (config: TherapyScheduleConfig, message: string) => void;
}

export const Screen3ScheduleConfig: React.FC<Screen3ScheduleConfigProps> = ({
  mode,
  patientId,
  onBack,
  onStartNow,
  onScheduleSaved,
}) => {
  // Load initial settings from localStorage / defaults
  const [timeMode, setTimeMode] = useState<TimeSelectionMode>('now');
  const [scheduledDate, setScheduledDate] = useState<string>(getDefaultDateString());
  const [scheduledTime, setScheduledTime] = useState<string>(getDefaultTimeString());
  const [category, setCategory] = useState<ExerciseCategoryType>('stretch');
  const [customArea, setCustomArea] = useState<string>('');
  const [showCustomPosesView, setShowCustomPosesView] = useState<boolean>(false);
  const [customPosesCount, setCustomPosesCount] = useState<number>(() => getCustomPoseCount(patientId));
  const [selectedStretchIds, setSelectedStretchIds] = useState<string[]>(
    STRETCH_EXERCISES.map((e) => e.id)
  );
  const [customHoldTimes, setCustomHoldTimes] = useState<Record<string, number>>({});
  const [videoModalExercise, setVideoModalExercise] = useState<StretchExerciseItem | null>(null);
  const [isVideoModalOpen, setIsVideoModalOpen] = useState<boolean>(false);
  const [isExerciseSelectionModalOpen, setIsExerciseSelectionModalOpen] = useState<boolean>(false);
  const [timeError, setTimeError] = useState<string | null>(null);
  const [categoryNotice, setCategoryNotice] = useState<string | null>(null);

  const todayStr = getTodayDateString();
  const defaultDateStr = getDefaultDateString();

  // Reload custom poses count when patientId changes
  useEffect(() => {
    setCustomPosesCount(getCustomPoseCount(patientId));
  }, [patientId]);

  // Load saved config on mount
  useEffect(() => {
    const saved = getSavedTherapyConfig(mode, patientId);
    setTimeMode(saved.timeMode);
    setScheduledDate(saved.scheduledDate || defaultDateStr);
    setScheduledTime(saved.scheduledTime || getDefaultTimeString());
    setCategory(saved.category === 'custom' ? 'custom' : 'stretch');
    if (saved.customArea) {
      setCustomArea(saved.customArea);
    }
    if (saved.selectedStretchIds && saved.selectedStretchIds.length > 0) {
      setSelectedStretchIds(saved.selectedStretchIds);
    } else {
      setSelectedStretchIds(STRETCH_EXERCISES.map((e) => e.id));
    }
    if (saved.customHoldTimes) {
      setCustomHoldTimes(saved.customHoldTimes);
    }
  }, [mode, patientId, todayStr]);

  // Stretch exercise selection handlers
  const handleToggleStretch = (id: string) => {
    setSelectedStretchIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const handleSelectAllStretches = () => {
    setSelectedStretchIds(STRETCH_EXERCISES.map((e) => e.id));
  };

  const handleClearAllStretches = () => {
    setSelectedStretchIds([]);
  };

  // Adjust duration per exercise
  const handleAdjustTime = (id: string, deltaSeconds: number, e: React.MouseEvent) => {
    e.stopPropagation();
    const defaultSec = STRETCH_EXERCISES.find((ex) => ex.id === id)?.holdSeconds ?? 20;
    const current = customHoldTimes[id] !== undefined ? customHoldTimes[id] : defaultSec;
    const updated = Math.max(
      STRETCH_PROGRAM_METADATA.minSecondsPerPose,
      Math.min(STRETCH_PROGRAM_METADATA.maxSecondsPerPose, current + deltaSeconds)
    );
    setCustomHoldTimes((prev) => ({
      ...prev,
      [id]: updated,
    }));
  };

  const handleResetAllTimes = () => {
    setCustomHoldTimes({});
  };

  // Handle Category selection
  const handleSelectCategory = (cat: ExerciseCategoryType) => {
    setCategory(cat);
    if (cat === 'custom') {
      setShowCustomPosesView(true);
      setCategoryNotice('หมวดหมู่ส่วนอื่นๆ (ท่าที่เพิ่มเอง) ยังไม่รองรับการเริ่มฝึกด้วย AI ในขณะนี้ กรุณาเลือก "กายภาพยืดเส้น" สำหรับการฝึก');
    } else {
      setCategoryNotice(null);
      setIsExerciseSelectionModalOpen(true);
    }
  };

  // Get human-friendly category title
  const getCategoryTitle = (): string => {
    switch (category) {
      case 'stretch':
        return 'กายภาพยืดเส้น';
      case 'custom':
        return customPosesCount > 0 ? `ส่วนอื่นๆ (${customPosesCount} ท่า)` : 'ส่วนอื่นๆ (ท่าที่เพิ่มเอง)';
      default:
        return 'กายภาพยืดเส้น';
    }
  };

  // Submit action
  const handlePrimaryAction = () => {
    setTimeError(null);
    setCategoryNotice(null);

    // 1. Validation: Scheduled date and time must not be in the past
    if (timeMode === 'schedule') {
      const selectedDateTime = new Date(`${scheduledDate}T${scheduledTime}:00`);
      const now = new Date();
      if (isNaN(selectedDateTime.getTime()) || selectedDateTime <= now) {
        setTimeError('ไม่สามารถเลือกเวลาในอดีตได้ กรุณาเลือกวันและเวลาที่เป็นปัจจุบันหรือในอนาคต');
        return;
      }
    }

    // 2. Validation: If category does not have stretch queue, warn user
    if (category !== 'stretch') {
      setCategoryNotice('หมวดหมู่นี้ยังไม่มีชุดท่ากายภาพเฉพาะบุคคล กรุณาเลือก "กายภาพยืดเส้น" เพื่อเริ่มฝึก');
      return;
    }

    // 3. Validation: If stretch category is chosen, must have at least 1 exercise selected
    if (category === 'stretch' && selectedStretchIds.length === 0) {
      return;
    }

    const config: TherapyScheduleConfig = {
      mode,
      timeMode,
      scheduledDate,
      scheduledTime,
      category,
      categoryTitle: getCategoryTitle(),
      selectedStretchIds,
      customHoldTimes,
      patientId,
    };

    // Save to persistent storage with patientId
    saveTherapyConfig(config, patientId);

    if (timeMode === 'now') {
      // Start immediately -> Screen 4
      onStartNow(config);
    } else {
      // Scheduled booking -> return to Screen 3 Menu with confirmation
      const formattedDate = formatThaiDateTime(scheduledDate, scheduledTime);
      const confirmationMsg = `บันทึกนัดหมายฝึกกายภาพเรียบร้อย: ${formattedDate}`;
      onScheduleSaved(config, confirmationMsg);
    }
  };

  if (showCustomPosesView) {
    return (
      <CustomPosesPage
        patientId={patientId}
        onBack={() => {
          setShowCustomPosesView(false);
          setCustomPosesCount(getCustomPoseCount(patientId));
        }}
      />
    );
  }

  return (
    <div className="w-full max-w-[720px] mx-auto flex flex-col animate-fadeIn relative z-10 py-3 sm:py-6 px-1">
      
      {/* 1. Top Back Navigation Bar */}
      <header className="flex items-center justify-between w-full mb-3 sm:mb-4">
        <button
          onClick={onBack}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/90 backdrop-blur-md border border-emerald-300 text-sm sm:text-base font-bold text-[#0B2B2B] hover:bg-white transition active:scale-95 shadow-sm min-h-[44px]"
          aria-label="ย้อนกลับไปหน้าเมนูผู้ใช้"
        >
          <ArrowLeft className="w-4 h-4 sm:w-5 sm:h-5 text-[#1E8A4C]" />
          <span>ย้อนกลับ</span>
        </button>

        <div className="flex items-center gap-2">
          <span className="text-xs sm:text-sm font-bold text-emerald-800 bg-[#D7F9E1]/80 px-3 py-1 rounded-full border border-emerald-200">
            🩺 ตั้งค่ากายภาพบำบัด
          </span>
        </div>
      </header>

      {/* 2. Main Content Card */}
      <main className="bg-white/90 backdrop-blur-xl border border-emerald-200/90 rounded-[28px] sm:rounded-[36px] p-4 sm:p-7 shadow-xl shadow-emerald-700/5 space-y-6">
        
        {/* หัวข้อหน้าจอ (ตามภาพที่ 1) */}
        <div className="text-center sm:text-left space-y-1">
          <h1 className="text-2xl sm:text-3xl font-extrabold text-[#0B2B2B] tracking-tight">
            เลือกเวลาและท่าทาง
          </h1>
          <p className="text-sm sm:text-lg font-medium text-emerald-900/80">
            เลือกเวลาเริ่มฝึก และบริเวณที่ต้องการยืด
          </p>
        </div>

        {/* ------------------------------------------------------------- */}
        {/* ส่วนที่ 1: "เริ่มฝึกเมื่อไร?" (การ์ด 2 ใบเรียงข้างกัน) */}
        {/* ------------------------------------------------------------- */}
        <section aria-labelledby="time-selection-heading">
          <h2
            id="time-selection-heading"
            className="text-base sm:text-lg font-bold text-[#0B2B2B] mb-2.5 flex items-center gap-2"
          >
            <span>เริ่มฝึกเมื่อไร?</span>
          </h2>

          <div
            role="radiogroup"
            aria-label="เลือกเวลาเริ่มฝึก"
            className="grid grid-cols-1 sm:grid-cols-2 gap-3"
          >
            {/* ใบที่ 1: "เริ่มตอนนี้" (ค่าเริ่มต้น) */}
            <div
              role="radio"
              aria-checked={timeMode === 'now'}
              tabIndex={0}
              onClick={() => setTimeMode('now')}
              onKeyDown={(e) => {
                if (e.key === ' ' || e.key === 'Enter') {
                  e.preventDefault();
                  setTimeMode('now');
                }
              }}
              className={`relative rounded-2xl p-4 sm:p-5 flex items-center gap-3.5 cursor-pointer transition-all duration-200 min-h-[96px] text-left select-none outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 ${
                timeMode === 'now'
                  ? 'border-[2.5px] border-[#1E8A4C] bg-[#E9FCEB] shadow-md shadow-emerald-500/10'
                  : 'border border-emerald-200/90 bg-white/80 hover:bg-white hover:border-emerald-300'
              }`}
            >
              {/* Top-Right Indicator: Checkmark in green circle if selected */}
              <div
                className={`absolute top-3 right-3 w-6 h-6 rounded-full flex items-center justify-center transition-all ${
                  timeMode === 'now'
                    ? 'bg-[#1E8A4C] text-white shadow-sm'
                    : 'border-2 border-emerald-300 bg-white'
                }`}
                aria-hidden="true"
              >
                {timeMode === 'now' && <Check className="w-4 h-4 stroke-[3]" />}
              </div>

              {/* Icon Container */}
              <div
                className={`w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0 transition-colors ${
                  timeMode === 'now'
                    ? 'bg-[#1E8A4C] text-white'
                    : 'bg-emerald-100 text-[#1E8A4C]'
                }`}
              >
                <Clock className="w-6 h-6" />
              </div>

              {/* Text Information */}
              <div className="flex-1 pr-6">
                <div className="text-base sm:text-lg font-bold text-[#0B2B2B]">
                  เริ่มตอนนี้
                </div>
                <div className="text-xs sm:text-sm text-emerald-800/80 font-medium">
                  พร้อมแล้ว เริ่มได้ทันที
                </div>
              </div>
            </div>

            {/* ใบที่ 2: "ตั้งเวลา" */}
            <div
              role="radio"
              aria-checked={timeMode === 'schedule'}
              tabIndex={0}
              onClick={() => setTimeMode('schedule')}
              onKeyDown={(e) => {
                if (e.key === ' ' || e.key === 'Enter') {
                  e.preventDefault();
                  setTimeMode('schedule');
                }
              }}
              className={`relative rounded-2xl p-4 sm:p-5 flex items-center gap-3.5 cursor-pointer transition-all duration-200 min-h-[96px] text-left select-none outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 ${
                timeMode === 'schedule'
                  ? 'border-[2.5px] border-[#1E8A4C] bg-[#E9FCEB] shadow-md shadow-emerald-500/10'
                  : 'border border-emerald-200/90 bg-white/80 hover:bg-white hover:border-emerald-300'
              }`}
            >
              {/* Top-Right Indicator */}
              <div
                className={`absolute top-3 right-3 w-6 h-6 rounded-full flex items-center justify-center transition-all ${
                  timeMode === 'schedule'
                    ? 'bg-[#1E8A4C] text-white shadow-sm'
                    : 'border-2 border-emerald-300 bg-white'
                }`}
                aria-hidden="true"
              >
                {timeMode === 'schedule' && <Check className="w-4 h-4 stroke-[3]" />}
              </div>

              {/* Icon Container */}
              <div
                className={`w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0 transition-colors ${
                  timeMode === 'schedule'
                    ? 'bg-[#1E8A4C] text-white'
                    : 'bg-emerald-100 text-[#1E8A4C]'
                }`}
              >
                <Calendar className="w-6 h-6" />
              </div>

              {/* Text Information */}
              <div className="flex-1 pr-6">
                <div className="text-base sm:text-lg font-bold text-[#0B2B2B]">
                  ตั้งเวลา
                </div>
                <div className="text-xs sm:text-sm text-emerald-800/80 font-medium">
                  เลือกวันและเวลาที่สะดวก
                </div>
              </div>
            </div>
          </div>

          {/* สไลด์เปิดลงมาเมื่อเลือก "ตั้งเวลา": แสดงช่องเลือกวันที่และเวลา */}
          {timeMode === 'schedule' && (
            <div className="mt-3.5 p-4 sm:p-5 rounded-2xl bg-gradient-to-br from-emerald-50/90 to-[#D7F9E1]/50 border-2 border-emerald-300/80 shadow-inner animate-fadeIn space-y-3">
              <div className="flex items-center gap-2 text-xs sm:text-sm font-bold text-[#1E8A4C]">
                <Calendar className="w-4 h-4" />
                <span>กำหนดวันและเวลาที่ต้องการฝึก (ห้ามเลือกเวลาในอดีต)</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* Date Input */}
                <div>
                  <label htmlFor="scheduleDateInput" className="block text-xs font-bold text-[#0B2B2B] mb-1">
                    วันที่ฝึก (พ.ศ.)
                  </label>
                  <input
                    id="scheduleDateInput"
                    type="date"
                    min={todayStr}
                    value={scheduledDate}
                    onChange={(e) => setScheduledDate(e.target.value)}
                    className="w-full text-base sm:text-lg font-bold p-3 rounded-xl border border-emerald-300 bg-white text-[#0B2B2B] focus:ring-2 focus:ring-[#1E8A4C] focus:outline-none min-h-[50px] shadow-sm"
                  />
                </div>

                {/* Time Input */}
                <div>
                  <label htmlFor="scheduleTimeInput" className="block text-xs font-bold text-[#0B2B2B] mb-1">
                    เวลาฝึก (น.)
                  </label>
                  <input
                    id="scheduleTimeInput"
                    type="time"
                    value={scheduledTime}
                    onChange={(e) => setScheduledTime(e.target.value)}
                    className="w-full text-base sm:text-lg font-bold p-3 rounded-xl border border-emerald-300 bg-white text-[#0B2B2B] focus:ring-2 focus:ring-[#1E8A4C] focus:outline-none min-h-[50px] shadow-sm"
                  />
                </div>
              </div>

              {/* Preview Formatted Thai text */}
              <div className="text-xs sm:text-sm font-semibold text-emerald-900 bg-white/90 p-2.5 rounded-xl border border-emerald-200 flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-[#1E8A4C] flex-shrink-0" />
                <span className="truncate">
                  {formatThaiDateTime(scheduledDate, scheduledTime)}
                </span>
              </div>

              {/* Past Date & Time Validation Error Alert */}
              {timeError && (
                <div className="text-xs sm:text-sm font-bold text-rose-700 bg-rose-50 border border-rose-300 p-3 rounded-xl flex items-center gap-2 animate-fadeIn">
                  <AlertCircle className="w-4 h-4 text-rose-600 flex-shrink-0" />
                  <span>{timeError}</span>
                </div>
              )}
            </div>
          )}
        </section>

        {/* ------------------------------------------------------------- */}
        {/* ส่วนที่ 2: "เลือกบริเวณที่ต้องการยืด" (การ์ด 4 ใบ จัดกริด 2x2) */}
        {/* ------------------------------------------------------------- */}
        <section aria-labelledby="area-selection-heading">
          <div className="flex items-center justify-between mb-2.5">
            <h2
              id="area-selection-heading"
              className="text-base sm:text-lg font-bold text-[#0B2B2B]"
            >
              เลือกบริเวณที่ต้องการยืด
            </h2>
            {category === 'custom' && (
              <button
                onClick={() => setShowCustomPosesView(true)}
                className="text-xs sm:text-sm font-bold text-[#1E8A4C] hover:underline flex items-center gap-1"
                aria-label="จัดการท่ากายภาพที่เพิ่มเอง"
              >
                <Edit2 className="w-3.5 h-3.5" />
                <span>จัดการท่าที่เพิ่มเอง ({customPosesCount} ท่า)</span>
              </button>
            )}
          </div>

          <div
            role="radiogroup"
            aria-label="เลือกบริเวณที่ต้องการยืด"
            className="grid grid-cols-2 gap-3 sm:gap-4"
          >
            {/* 1. "กายภาพยืดเส้น" (ค่าเริ่มต้น) */}
            <div
              role="radio"
              aria-checked={category === 'stretch'}
              tabIndex={0}
              onClick={() => handleSelectCategory('stretch')}
              onKeyDown={(e) => {
                if (e.key === ' ' || e.key === 'Enter') {
                  e.preventDefault();
                  handleSelectCategory('stretch');
                }
              }}
              className={`relative rounded-2xl p-4 flex flex-col items-center justify-center text-center cursor-pointer transition-all duration-200 min-h-[110px] sm:min-h-[120px] select-none outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 ${
                category === 'stretch'
                  ? 'border-[2.5px] border-[#1E8A4C] bg-[#E9FCEB] shadow-md shadow-emerald-500/10'
                  : 'border border-emerald-200/90 bg-white/80 hover:bg-white hover:border-emerald-300'
              }`}
            >
              {/* Top-Right Indicator */}
              <div
                className={`absolute top-2.5 right-2.5 w-5 h-5 sm:w-6 sm:h-6 rounded-full flex items-center justify-center transition-all ${
                  category === 'stretch'
                    ? 'bg-[#1E8A4C] text-white shadow-sm'
                    : 'border-2 border-emerald-300 bg-white'
                }`}
                aria-hidden="true"
              >
                {category === 'stretch' && <Check className="w-3.5 h-3.5 stroke-[3]" />}
              </div>

              {/* Custom SVG Icon: Person Stretching arms */}
              <div
                className={`w-12 h-12 rounded-2xl flex items-center justify-center mb-2 transition-colors ${
                  category === 'stretch' ? 'bg-[#1E8A4C] text-white' : 'bg-emerald-100 text-[#1E8A4C]'
                }`}
              >
                <svg
                  className="w-7 h-7"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  {/* Head */}
                  <circle cx="12" cy="4" r="2" />
                  {/* Spine */}
                  <line x1="12" y1="6" x2="12" y2="14" />
                  {/* Stretched Arms Upward */}
                  <path d="M6 9l6-3 6 3" />
                  <path d="M5 4l2 5" />
                  <path d="M19 4l-2 5" />
                  {/* Legs */}
                  <path d="M9 20l3-6 3 6" />
                </svg>
              </div>

              <span className="text-sm sm:text-base font-bold text-[#0B2B2B]">
                กายภาพยืดเส้น
              </span>
              <span className="text-[11px] sm:text-xs text-emerald-800/80 font-medium mt-0.5">
                ยืดเหยียด คลายกล้ามเนื้อ
              </span>
              <span className="mt-1.5 text-[10px] sm:text-xs font-bold text-[#1E8A4C] bg-white px-2.5 py-0.5 rounded-full border border-emerald-200 shadow-2xs">
                {selectedStretchIds.length} ท่า • แตะเพื่อเลือกท่า
              </span>
            </div>

            {/* 2. "ส่วนอื่นๆ" */}
            <div
              role="radio"
              aria-checked={category === 'custom'}
              tabIndex={0}
              onClick={() => handleSelectCategory('custom')}
              onKeyDown={(e) => {
                if (e.key === ' ' || e.key === 'Enter') {
                  e.preventDefault();
                  handleSelectCategory('custom');
                }
              }}
              className={`relative rounded-2xl p-4 flex flex-col items-center justify-center text-center cursor-pointer transition-all duration-200 min-h-[110px] sm:min-h-[120px] select-none outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 ${
                category === 'custom'
                  ? 'border-[2.5px] border-[#1E8A4C] bg-[#E9FCEB] shadow-md shadow-emerald-500/10'
                  : 'border border-emerald-200/90 bg-white/80 hover:bg-white hover:border-emerald-300'
              }`}
            >
              {/* Top-Right Indicator */}
              <div
                className={`absolute top-2.5 right-2.5 w-5 h-5 sm:w-6 sm:h-6 rounded-full flex items-center justify-center transition-all ${
                  category === 'custom'
                    ? 'bg-[#1E8A4C] text-white shadow-sm'
                    : 'border-2 border-emerald-300 bg-white'
                }`}
                aria-hidden="true"
              >
                {category === 'custom' && <Check className="w-3.5 h-3.5 stroke-[3]" />}
              </div>

              {/* Custom SVG Icon: Body Joints Target / Plus */}
              <div
                className={`w-12 h-12 rounded-2xl flex items-center justify-center mb-2 transition-colors ${
                  category === 'custom' ? 'bg-[#1E8A4C] text-white' : 'bg-emerald-100 text-[#1E8A4C]'
                }`}
              >
                <Plus className="w-7 h-7" />
              </div>

              <span className="text-sm sm:text-base font-bold text-[#0B2B2B] flex items-center justify-center gap-1.5">
                <span>ส่วนอื่นๆ</span>
                <span className="text-xs font-bold text-[#1E8A4C] bg-white px-2 py-0.5 rounded-full border border-emerald-200 shadow-2xs">
                  {customPosesCount} ท่า
                </span>
              </span>
              <span className="text-[11px] sm:text-xs text-emerald-800/80 font-medium mt-0.5">
                {customPosesCount > 0 ? 'แตะเพื่อจัดการท่า' : 'แตะเพื่อเพิ่มท่าใหม่'}
              </span>
            </div>
          </div>

          {/* Category Notice Alert if non-stretch category is chosen */}
          {categoryNotice && (
            <div className="text-xs sm:text-sm font-bold text-amber-900 bg-amber-50 border border-amber-300 p-3 rounded-xl flex items-center gap-2 mt-3 animate-fadeIn">
              <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0" />
              <span>{categoryNotice}</span>
            </div>
          )}
        </section>

        {/* ------------------------------------------------------------- */}
        {/* ส่วนที่ 3: ปุ่มหลักด้านล่างเต็มความกว้าง (Dynamic Primary Button) */}
        {/* ------------------------------------------------------------- */}
        <div className="pt-2">
          {category === 'stretch' && selectedStretchIds.length === 0 && (
            <div
              role="alert"
              className="text-center text-xs sm:text-sm font-bold text-rose-700 bg-rose-50 border border-rose-200 rounded-2xl p-3 mb-2 flex items-center justify-center gap-1.5 animate-fadeIn"
            >
              <AlertCircle className="w-4 h-4 text-rose-600 flex-shrink-0" />
              <span>
                ยังไม่ได้เลือกท่ากายภาพ{' '}
                <button
                  type="button"
                  onClick={() => setIsExerciseSelectionModalOpen(true)}
                  className="underline text-[#1E8A4C] font-extrabold ml-1 cursor-pointer hover:text-emerald-900"
                >
                  แตะที่นี่เพื่อเลือกท่า
                </button>
              </span>
            </div>
          )}

          <button
            onClick={handlePrimaryAction}
            disabled={category === 'stretch' && selectedStretchIds.length === 0}
            className={`w-full min-h-[56px] py-3.5 px-6 rounded-full text-white font-extrabold text-base sm:text-lg shadow-lg flex items-center justify-center gap-2.5 transition-all outline-none focus-visible:ring-4 focus-visible:ring-emerald-400 ${
              category === 'stretch' && selectedStretchIds.length === 0
                ? 'bg-stone-300 text-stone-500 cursor-not-allowed shadow-none'
                : 'bg-gradient-to-r from-[#10B981] via-[#06B6D4] to-[#2563EB] shadow-cyan-500/25 hover:opacity-95 hover:shadow-cyan-500/35 active:scale-[0.98] cursor-pointer'
            }`}
            id="btnPrimaryScheduleAction"
          >
            {timeMode === 'now' ? (
              <>
                <Play className="w-5 h-5 sm:w-6 sm:h-6 fill-white" />
                <span>เริ่มฝึกตอนนี้</span>
              </>
            ) : (
              <>
                <CalendarCheck className="w-5 h-5 sm:w-6 sm:h-6" />
                <span>บันทึกเวลานัด</span>
              </>
            )}
          </button>
        </div>

      </main>

      {/* ------------------------------------------------------------- */}
      {/* Modal ป็อปอัพเลือกท่ากายภาพ (เด้งขึ้นมาเมื่อแตะเลือกท่า)         */}
      {/* ------------------------------------------------------------- */}
      <ExerciseSelectionModal
        isOpen={isExerciseSelectionModalOpen}
        onClose={() => setIsExerciseSelectionModalOpen(false)}
        category={category}
        selectedStretchIds={selectedStretchIds}
        customHoldTimes={customHoldTimes}
        onToggleStretch={handleToggleStretch}
        onSelectAll={handleSelectAllStretches}
        onClearAll={handleClearAllStretches}
        onResetAllTimes={handleResetAllTimes}
        onAdjustTime={handleAdjustTime}
        onOpenVideoModal={(exercise) => {
          setVideoModalExercise(exercise);
          setIsVideoModalOpen(true);
        }}
      />

      {/* ------------------------------------------------------------- */}
      {/* Modal ดูวิดีโอคลิป YouTube แต่ละท่าทาง */}
      {/* ------------------------------------------------------------- */}
      <ExerciseVideoModal
        isOpen={isVideoModalOpen}
        onClose={() => setIsVideoModalOpen(false)}
        exercise={videoModalExercise}
      />

    </div>
  );
};
