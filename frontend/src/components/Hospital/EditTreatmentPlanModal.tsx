import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  X,
  Calendar,
  User,
  Stethoscope,
  Dumbbell,
  FileText,
  Plus,
  Trash2,
  Check,
  AlertCircle,
  Activity,
  Sparkles,
  Sliders,
  CheckCircle2,
  Clock,
  ChevronDown,
  ArrowRight,
  ArrowLeft,
  Search,
  Gamepad2,
  Brain,
  Minus,
} from 'lucide-react';
import {
  TreatmentPlan,
  PrescribedExercise,
  UserAccount,
  PhysicalTherapist,
  HospitalExercise,
  ExerciseModpack,
  UserRole,
} from '../../types/hospital';
import { patientFaceStorageService } from '../../services/patientFaceStorageService';
import { AVAILABLE_MINIGAMES } from './DailyRoutineAssignmentModal';

interface EditTreatmentPlanModalProps {
  isOpen: boolean;
  onClose: () => void;
  plan: TreatmentPlan | null; // null = create new plan
  patients: UserAccount[];
  therapists: PhysicalTherapist[];
  exercises: HospitalExercise[];
  modpacks?: ExerciseModpack[];
  currentRole: UserRole;
  currentUserId: number | string;
  currentUserName: string;
  onSavePlan: (plan: Omit<TreatmentPlan, 'id' | 'createdAt'> & { id?: number | string }) => void;
  onSuccessToast: (msg: string) => void;
}

// Preset exercise templates for doctors
interface PresetTemplate {
  id: string;
  name: string;
  icon: string;
  diagnosis: string;
  targetJoint: string;
  exercises: PrescribedExercise[];
}

const PRESET_TEMPLATES: PresetTemplate[] = [
  {
    id: 'shoulder',
    name: 'คอร์สฟื้นฟูไหล่ติด',
    icon: '🦴',
    diagnosis: 'ข้อไหล่ติดระยะฟื้นฟู (Frozen Shoulder)',
    targetJoint: 'ข้อไหล่และกล้ามเนื้อสะบัก',
    exercises: [
      {
        exerciseSlug: 'shoulder_raise',
        exerciseName: 'กางแขนยกด้านข้าง',
        sets: 3,
        reps: 10,
        holdSeconds: 3,
        difficulty: 'beginner',
      },
      {
        exerciseSlug: 'cross_body_stretch',
        exerciseName: 'ยืดไหล่ข้ามอก',
        sets: 3,
        reps: 5,
        holdSeconds: 5,
        difficulty: 'beginner',
      },
      {
        exerciseSlug: 'chest_expansion',
        exerciseName: 'ยืดอกเปิดไหล่',
        sets: 2,
        reps: 5,
        holdSeconds: 5,
        difficulty: 'beginner',
      },
    ],
  },
  {
    id: 'knee',
    name: 'คอร์สข้อเข่า',
    icon: '🦵',
    diagnosis: 'ข้อเข่าเสื่อมระยะที่ 2 (Knee OA)',
    targetJoint: 'ข้อเข่าและกล้ามเนื้อต้นขา',
    exercises: [
      {
        exerciseSlug: 'knee_extension',
        exerciseName: 'นั่งเหยียดเข่าตรง',
        sets: 3,
        reps: 10,
        holdSeconds: 5,
        difficulty: 'beginner',
      },
      {
        exerciseSlug: 'straight_leg_raise',
        exerciseName: 'นอนหงายยกขาตรง',
        sets: 3,
        reps: 10,
        holdSeconds: 3,
        difficulty: 'beginner',
      },
      {
        exerciseSlug: 'mini_squat',
        exerciseName: 'ย่อเข่ากึ่งสควอท',
        sets: 2,
        reps: 8,
        holdSeconds: 3,
        difficulty: 'intermediate',
      },
    ],
  },
  {
    id: 'stroke',
    name: 'คอร์สสโตรก/สมอง',
    icon: '🧠',
    diagnosis: 'ฟื้นฟูอ่อนแรงครึ่งซีก / สโตรก (Post-Stroke Rehab)',
    targetJoint: 'ข้อต่อและกล้ามเนื้อควบคุมระบบประสาท',
    exercises: [
      {
        exerciseSlug: 'shoulder_raise',
        exerciseName: 'กางแขนยกด้านข้าง',
        sets: 3,
        reps: 8,
        holdSeconds: 3,
        difficulty: 'beginner',
      },
      {
        exerciseSlug: 'hand_clasp_reach',
        exerciseName: 'ยกแขนประสานมือ',
        sets: 3,
        reps: 10,
        holdSeconds: 5,
        difficulty: 'beginner',
      },
      {
        exerciseSlug: 'finger_spread',
        exerciseName: 'กำมือเหยียดนิ้ว',
        sets: 2,
        reps: 10,
        holdSeconds: 3,
        difficulty: 'beginner',
      },
    ],
  },
  {
    id: 'office',
    name: 'คอร์สออฟฟิศซินโดรม',
    icon: '💻',
    diagnosis: 'กล้ามเนื้อคอบ่าสะบักอักเสบเรื้อรัง (Office Syndrome)',
    targetJoint: 'กล้ามเนื้อคอ บ่า สะบัก',
    exercises: [
      {
        exerciseSlug: 'neck_stretch',
        exerciseName: 'ยืดกล้ามเนื้อคอบ่า',
        sets: 3,
        reps: 10,
        holdSeconds: 5,
        difficulty: 'beginner',
      },
      {
        exerciseSlug: 'shoulder_raise',
        exerciseName: 'กางแขนยกด้านข้าง',
        sets: 3,
        reps: 10,
        holdSeconds: 3,
        difficulty: 'beginner',
      },
      {
        exerciseSlug: 'chest_expansion',
        exerciseName: 'ยืดอกเปิดไหล่',
        sets: 2,
        reps: 8,
        holdSeconds: 5,
        difficulty: 'beginner',
      },
    ],
  },
];

export const EditTreatmentPlanModal: React.FC<EditTreatmentPlanModalProps> = ({
  isOpen,
  onClose,
  plan,
  patients,
  therapists,
  exercises,
  modpacks = [],
  currentRole,
  currentUserId,
  currentUserName,
  onSavePlan,
  onSuccessToast,
}) => {
  // Only patient role accounts can be assigned
  const patientUsers = useMemo(() => patients.filter((u) => u.role === 'patient'), [patients]);

  const availableModpacks = useMemo(() => {
    if (modpacks && modpacks.length > 0) return modpacks;
    return PRESET_TEMPLATES as unknown as ExerciseModpack[];
  }, [modpacks]);

  // Step state: 1 = เลือกคนไข้, 2 = จัดท่าฝึก & เกม, 3 = กำหนดเวลา
  const [step, setStep] = useState<1 | 2 | 3>(1);

  // Search filter for patients
  const [patientSearch, setPatientSearch] = useState<string>('');

  // Form states
  const [patientId, setPatientId] = useState<number | string>('');
  const [patientName, setPatientName] = useState<string>('');
  const [patientCode, setPatientCode] = useState<string>('');
  const [therapistId, setTherapistId] = useState<number | string>('');
  const [therapistName, setTherapistName] = useState<string>('');
  const [diagnosis, setDiagnosis] = useState<string>('');
  const [targetJoint, setTargetJoint] = useState<string>('');
  const [assignedExercises, setAssignedExercises] = useState<PrescribedExercise[]>([]);
  const [clinicalNotes, setClinicalNotes] = useState<string>('');
  const [status, setStatus] = useState<'active' | 'completed' | 'paused'>('active');

  // Minigame toggle (include_minigame)
  const [includeMinigame, setIncludeMinigame] = useState<boolean>(true);

  // Timetable scheduling state
  const [scheduleDays, setScheduleDays] = useState<string[]>(['จันทร์', 'พุธ', 'ศุกร์']);
  const [timeSlot, setTimeSlot] = useState<string>('09:30 - 10:30');
  const [startTime, setStartTime] = useState<string>('09:30');
  const [endTime, setEndTime] = useState<string>('10:30');
  const [startDate, setStartDate] = useState<string>('2026-10-01');
  const [endDate, setEndDate] = useState<string>('2026-10-31');
  const [roomStation, setRoomStation] = useState<string>('ตู้ Kiosk 1');

  // Exercise picker temporary state
  const [selectedExerciseSlug, setSelectedExerciseSlug] = useState<string>('');
  const [exerciseSets, setExerciseSets] = useState<number>(3);
  const [exerciseReps, setExerciseReps] = useState<number>(10);
  const [exerciseHold, setExerciseHold] = useState<number>(3);

  // Errors & loading
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  // Filtered patients for dropdown
  const filteredPatients = useMemo(() => {
    if (!patientSearch.trim()) return patientUsers;
    const q = patientSearch.toLowerCase();
    return patientUsers.filter(
      (p) =>
        (p.name && p.name.toLowerCase().includes(q)) ||
        (p.code && p.code.toLowerCase().includes(q)) ||
        (p.diagnosis && p.diagnosis.toLowerCase().includes(q))
    );
  }, [patientUsers, patientSearch]);

  // Selected patient object
  const selectedPatientObj = useMemo(() => {
    return patientUsers.find((p) => String(p.id) === String(patientId) || p.code === patientCode);
  }, [patientUsers, patientId, patientCode]);

  // Session initialization guard: prevents background re-renders or prop updates from resetting wizard back to Step 1
  const isInitializedRef = useRef<boolean>(false);
  const activePlanKeyRef = useRef<string | null>(null);

  // Initialize data on open
  useEffect(() => {
    if (!isOpen) {
      isInitializedRef.current = false;
      activePlanKeyRef.current = null;
      return;
    }

    // Generate a unique session key for the plan being opened
    const currentPlanKey = plan?.id
      ? `id_${plan.id}`
      : plan?.patientName
      ? `pt_${plan.patientName}_${plan.timeSlot || ''}`
      : 'new_plan';

    // If already initialized for this exact modal open session, DO NOT reset step or overwrite edits
    if (isInitializedRef.current && activePlanKeyRef.current === currentPlanKey) {
      return;
    }

    isInitializedRef.current = true;
    activePlanKeyRef.current = currentPlanKey;

    setError(null);
    setStep(1);
    setPatientSearch('');

    // Check if plan has real data or is just an empty placeholder
    const hasRealPlan = plan && plan.patientName && plan.patientName.trim().length > 0;

    if (hasRealPlan) {
      // Editing existing plan
      setPatientId(plan.patientId);
      setPatientName(plan.patientName);
      setPatientCode(plan.patientCode);
      setTherapistId(plan.therapistId);
      setTherapistName(plan.therapistName);
      setDiagnosis(plan.diagnosis);
      setTargetJoint(plan.targetJoint || 'ข้อต่อและกล้ามเนื้อทั่วไป');
      setAssignedExercises(plan.assignedExercises || []);
      setClinicalNotes(plan.clinicalNotes || '');
      setStatus(plan.status || 'active');
      setScheduleDays(plan.scheduleDays || ['จันทร์', 'พุธ', 'ศุกร์']);
      setTimeSlot(plan.timeSlot || '09:30 - 10:30');
      setStartTime(plan.startTime || '09:30');
      setEndTime(plan.endTime || '10:30');
      setStartDate(plan.startDate || '2026-10-01');
      setEndDate(plan.endDate || '2026-10-31');
      setRoomStation(plan.roomStation || 'ตู้ Kiosk 1');
      setIncludeMinigame(
        typeof plan.includeMinigame === 'boolean'
          ? plan.includeMinigame
          : typeof (plan as any).include_minigame === 'boolean'
          ? (plan as any).include_minigame
          : true
      );
    } else {
      // Creating new plan: pre-select first patient if available
      const firstPt = patientUsers[0];
      setPatientId(firstPt ? firstPt.id : '');
      setPatientName(firstPt ? firstPt.name : '');
      setPatientCode(firstPt ? firstPt.code : '');

      // Match therapist
      const defaultTherapist =
        therapists.find((t) => t.id === currentUserId) ||
        therapists[0] || { id: 1, name: currentUserName || 'กภ. ธนากร วงศ์สวัสดิ์' };

      setTherapistId(defaultTherapist.id);
      setTherapistName(defaultTherapist.name);
      setDiagnosis(firstPt?.diagnosis || 'ข้อไหล่ติดระยะฟื้นฟู (Frozen Shoulder)');
      setTargetJoint('ข้อไหล่และกล้ามเนื้อสะบัก');
      setAssignedExercises([
        {
          exerciseSlug: 'shoulder_raise',
          exerciseName: 'กางแขนยกด้านข้าง',
          sets: 3,
          reps: 10,
          holdSeconds: 3,
          difficulty: 'beginner',
        },
        {
          exerciseSlug: 'cross_body_stretch',
          exerciseName: 'ยืดไหล่ข้ามอก',
          sets: 3,
          reps: 5,
          holdSeconds: 5,
          difficulty: 'beginner',
        },
      ]);
      setClinicalNotes('ฝึกอย่างสม่ำเสมอ พักระหว่างเซ็ต 30 วินาที หากปวดเกินระดับ 3 ให้หยุดพัก');
      setStatus('active');
      setIncludeMinigame(true);

      // Pre-fill days/times if plan had a timetable slot clicked
      if (plan?.scheduleDays && plan.scheduleDays.length > 0) {
        setScheduleDays(plan.scheduleDays);
      } else {
        setScheduleDays(['จันทร์', 'พุธ', 'ศุกร์']);
      }
      if (plan?.timeSlot) {
        setTimeSlot(plan.timeSlot);
        const parts = plan.timeSlot.split(' - ');
        if (parts[0]) setStartTime(parts[0].trim());
        if (parts[1]) setEndTime(parts[1].trim());
      } else {
        setTimeSlot('09:30 - 10:30');
        setStartTime('09:30');
        setEndTime('10:30');
      }

      setStartDate('2026-10-01');
      setEndDate('2026-10-31');
      setRoomStation('ตู้ Kiosk 1');
    }

    if (AVAILABLE_MINIGAMES.length > 0) {
      setSelectedExerciseSlug(AVAILABLE_MINIGAMES[0].id);
    } else if (exercises.length > 0) {
      setSelectedExerciseSlug(exercises[0].svgType || exercises[0].name);
    }
  }, [isOpen, plan, patientUsers, therapists, exercises, currentUserId, currentUserName]);

  if (!isOpen) return null;

  // Handle patient dropdown change
  const handleSelectPatient = (id: string | number) => {
    const selected = patientUsers.find((p) => String(p.id) === String(id));
    if (selected) {
      setPatientId(selected.id);
      setPatientName(selected.name);
      setPatientCode(selected.code);
      if (selected.diagnosis) {
        setDiagnosis(selected.diagnosis);
      }
      if (selected.assignedTherapistName) {
        setTherapistName(selected.assignedTherapistName);
      }
      setError(null);
    }
  };

  // Apply Preset Template / Modpack
  const handleApplyPreset = (tpl: ExerciseModpack | PresetTemplate) => {
    if ('diagnosis' in tpl && tpl.diagnosis) {
      setDiagnosis(tpl.diagnosis);
    }
    if (tpl.targetJoint) {
      setTargetJoint(tpl.targetJoint);
    }
    setAssignedExercises(tpl.exercises);
    setError(null);
  };

  // Add exercise to list (Restricted to Mini-Games only due to development constraints)
  const handleAddExercise = () => {
    if (!selectedExerciseSlug) return;

    // 1. Check if selected is an active Mini-Game
    const mg = AVAILABLE_MINIGAMES.find(
      (m) => m.id === selectedExerciseSlug || m.slug === selectedExerciseSlug
    );
    if (mg) {
      const alreadyExists = assignedExercises.some((item) => item.exerciseSlug === mg.slug);
      if (alreadyExists) {
        setError(`มินิเกม "${mg.name}" มีอยู่ในตารางฝึกแล้ว`);
        return;
      }

      const newPrescription: PrescribedExercise = {
        exerciseSlug: mg.slug,
        exerciseName: mg.name,
        sets: exerciseSets,
        reps: exerciseReps,
        holdSeconds: exerciseHold,
        difficulty: 'beginner',
      };

      setAssignedExercises([...assignedExercises, newPrescription]);
      setError(null);
      return;
    }

    // 2. Standard Physical Therapy Exercise constraint
    const exObj = exercises.find(
      (e) => (e.svgType && e.svgType === selectedExerciseSlug) || e.name === selectedExerciseSlug || String(e.id) === selectedExerciseSlug
    );
    if (exObj) {
      setError('⚠️ ยังไม่ได้เพิ่มระบบดีเทคกายภาพ โปรดรอการพัฒนา (ในปัจจุบันสามารถเลือกและเซ็ตได้เฉพาะมินิเกมเท่านั้น)');
      return;
    }

    setError('กรุณาเลือกมินิเกมที่ต้องการมอบหมาย');
  };

  // Remove exercise from list
  const handleRemoveExercise = (index: number) => {
    setAssignedExercises(assignedExercises.filter((_, i) => i !== index));
  };

  // Step 1 Validation
  const handleStep1Next = () => {
    if (!patientId || !patientName) {
      setError('กรุณาเลือกคนไข้ก่อนดำเนินการต่อ');
      return;
    }
    if (!diagnosis.trim()) {
      setError('กรุณาระบุการวินิจฉัยหรืออาการหลัก');
      return;
    }
    setError(null);
    setStep(2);
  };

  // Step 2 Validation
  const handleStep2Next = () => {
    if (assignedExercises.length === 0) {
      setError('กรุณาเลือกท่าทางกายภาพอย่างน้อย 1 ท่าสำหรับตารางฝึก');
      return;
    }
    setError(null);
    setStep(3);
  };

  // Submit form
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!patientId || !patientName) {
      setError('กรุณาเลือกคนไข้');
      setStep(1);
      return;
    }
    if (!diagnosis.trim()) {
      setError('กรุณาระบุการวินิจฉัยหรืออาการหลัก');
      setStep(1);
      return;
    }
    if (assignedExercises.length === 0) {
      setError('กรุณาเลือกท่าทางกายภาพอย่างน้อย 1 ท่าสำหรับตารางฝึก');
      setStep(2);
      return;
    }

    setIsSubmitting(true);
    try {
      const planPayload = {
        ...(plan?.id ? { id: plan.id } : {}),
        patientId,
        patientName,
        patientCode: patientCode || 'P-0000',
        therapistId,
        therapistName: therapistName || 'กภ. ธนากร วงศ์สวัสดิ์',
        diagnosis: diagnosis.trim(),
        targetJoint: targetJoint.trim() || 'ข้อต่อและกล้ามเนื้อทั่วไป',
        assignedExercises,
        clinicalNotes: clinicalNotes.trim(),
        status,
        scheduleDays,
        timeSlot: timeSlot || `${startTime} - ${endTime}`,
        startTime,
        endTime,
        startDate,
        endDate,
        roomStation,
        includeMinigame,
        include_minigame: includeMinigame,
      };

      // 1. Sync directly into patient's isolated dossier (patient_record.json / localStorage)
      patientFaceStorageService.syncTreatmentPlan(planPayload);

      // 2. Update HospitalStore
      onSavePlan(planPayload);

      onSuccessToast(
        plan?.id
          ? `อัปเดตตารางกายภาพของ ${patientName} (${patientCode}) สำเร็จ`
          : `สร้างตารางกายภาพใหม่ให้ ${patientName} (${patientCode}) สำเร็จ`
      );
      onClose();
    } catch (err: any) {
      setError(err?.message || 'เกิดข้อผิดพลาดในการบันทึกตารางกายภาพ');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Modal header title bound dynamically to selected patient
  const headerTitle = patientName ? `ตารางกายภาพ: ${patientName} (${patientCode})` : 'สร้างตารางฝึกกายภาพใหม่';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#072420]/80 backdrop-blur-sm p-3 sm:p-4 animate-fadeIn overflow-y-auto">
      <div className="bg-white rounded-3xl border-2 border-emerald-300 p-5 sm:p-7 max-w-2xl w-full shadow-2xl space-y-4 my-auto max-h-[92vh] flex flex-col text-left">
        {/* Modal Header */}
        <div className="flex items-start justify-between border-b border-emerald-100 pb-3 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-[#10B981] via-[#06B6D4] to-[#2563EB] text-white flex items-center justify-center shadow-md shadow-cyan-500/25">
              <Calendar className="w-6 h-6" />
            </div>
            <div>
              <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200 text-[11px] font-bold">
                <Sparkles className="w-3 h-3 text-emerald-600" />
                <span>{plan?.id ? 'แก้ไขตารางฝึกกายภาพ' : 'สร้างตารางฝึกกายภาพใหม่'}</span>
              </div>
              <h2 className="text-base sm:text-lg font-black text-[#0F2F2B] mt-0.5">
                {headerTitle}
              </h2>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 3-Step Wizard Navigation Indicator */}
        <div className="bg-emerald-50/70 p-2.5 rounded-2xl border border-emerald-200 flex items-center justify-between text-xs font-bold flex-shrink-0">
          {/* Step 1 Pill */}
          <button
            type="button"
            onClick={() => setStep(1)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl transition cursor-pointer ${
              step === 1
                ? 'bg-[#10B981] text-white shadow-xs font-black ring-2 ring-emerald-300'
                : 'text-slate-600 hover:bg-emerald-100/60'
            }`}
          >
            <span className="w-5 h-5 rounded-full bg-white/20 flex items-center justify-center text-[11px]">
              1
            </span>
            <span>เลือกคนไข้</span>
          </button>

          <span className="text-emerald-300">───────&gt;</span>

          {/* Step 2 Pill */}
          <button
            type="button"
            onClick={() => {
              if (patientId) setStep(2);
              else setError('กรุณาเลือกคนไข้ก่อน');
            }}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl transition cursor-pointer ${
              step === 2
                ? 'bg-[#10B981] text-white shadow-xs font-black ring-2 ring-emerald-300'
                : 'text-slate-600 hover:bg-emerald-100/60'
            }`}
          >
            <span className="w-5 h-5 rounded-full bg-white/20 flex items-center justify-center text-[11px]">
              2
            </span>
            <span>จัดท่าฝึก & เกม</span>
          </button>

          <span className="text-emerald-300">───────&gt;</span>

          {/* Step 3 Pill */}
          <button
            type="button"
            onClick={() => {
              if (patientId && assignedExercises.length > 0) setStep(3);
              else setError('กรุณาจัดท่าฝึกก่อน');
            }}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl transition cursor-pointer ${
              step === 3
                ? 'bg-[#10B981] text-white shadow-xs font-black ring-2 ring-emerald-300'
                : 'text-slate-600 hover:bg-emerald-100/60'
            }`}
          >
            <span className="w-5 h-5 rounded-full bg-white/20 flex items-center justify-center text-[11px]">
              3
            </span>
            <span>กำหนดเวลา</span>
          </button>
        </div>

        {/* Error notification */}
        {error && (
          <div className="p-2.5 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-bold flex items-center gap-2 animate-shake flex-shrink-0">
            <AlertCircle className="w-4 h-4 text-rose-600 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Wizard Step Body (Scrollable) */}
        <div className="overflow-y-auto pr-1 flex-1 text-xs space-y-4">
          {/* ================================================================= */}
          {/* STEP 1: เลือกคนไข้ & นักกายภาพ & การวินิจฉัย                       */}
          {/* ================================================================= */}
          {step === 1 && (
            <div className="space-y-3.5 animate-fadeIn">
              {/* Searchable Patient Selector */}
              <div className="bg-emerald-50/60 p-3.5 rounded-2xl border border-emerald-100 space-y-2.5">
                <label className="block font-bold text-slate-800 text-xs">
                  🔍 ค้นหารายชื่อคนไข้ / HN <span className="text-rose-500">*</span>:
                </label>

                <div className="relative">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={patientSearch}
                    onChange={(e) => setPatientSearch(e.target.value)}
                    placeholder="พิมพ์ชื่อ, นามสกุล หรือ HN เช่น P-5849..."
                    className="w-full pl-9 pr-3 py-2 bg-white border border-emerald-200 rounded-xl font-bold text-[#0F2F2B] focus:outline-none focus:ring-2 focus:ring-[#10B981] text-xs"
                  />
                </div>

                {/* Patient Select Dropdown */}
                <div className="relative">
                  <select
                    value={patientId}
                    onChange={(e) => handleSelectPatient(e.target.value)}
                    className="w-full bg-white border-2 border-emerald-300 rounded-xl p-2.5 font-black text-sm text-[#0F2F2B] focus:outline-none focus:ring-2 focus:ring-[#10B981] appearance-none"
                  >
                    <option value="" disabled>
                      -- กรุณาเลือกคนไข้ --
                    </option>
                    {filteredPatients.map((pt) => (
                      <option key={pt.id} value={pt.id}>
                        👤 {pt.name} (HN: {pt.code}) {pt.diagnosis ? `- ${pt.diagnosis}` : ''}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                </div>

                {/* Selected Patient Preview Card */}
                {selectedPatientObj && (
                  <div className="mt-2 p-2.5 rounded-xl bg-white border border-emerald-200 flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-full bg-emerald-100 text-emerald-800 font-bold flex items-center justify-center text-xs">
                        👤
                      </div>
                      <div>
                        <div className="font-extrabold text-[#0F2F2B]">
                          {selectedPatientObj.name} (HN: {selectedPatientObj.code})
                        </div>
                        <div className="text-[10px] text-slate-500">
                          อายุ {selectedPatientObj.age || 5} ปี • สิทธิ์:{' '}
                          {(selectedPatientObj as any).healthScheme || (selectedPatientObj as any).health_scheme || 'บัตรทอง / ประกันสุขภาพถ้วนหน้า'}
                        </div>
                      </div>
                    </div>
                    <span className="px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-800 font-black text-[10px]">
                      พร้อมจัดตาราง
                    </span>
                  </div>
                )}
              </div>

              {/* Therapist Selection */}
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  นักกายภาพผู้รับผิดชอบ <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <select
                    value={therapistId}
                    onChange={(e) => {
                      const tid = e.target.value;
                      setTherapistId(tid);
                      const tObj = therapists.find((t) => String(t.id) === String(tid));
                      if (tObj) setTherapistName(tObj.name);
                    }}
                    disabled={currentRole === 'therapist'}
                    className={`w-full bg-white border border-emerald-200 rounded-xl p-2.5 font-bold text-[#0F2F2B] focus:outline-none focus:ring-2 focus:ring-[#10B981] appearance-none ${
                      currentRole === 'therapist' ? 'bg-slate-50 opacity-90 cursor-not-allowed' : ''
                    }`}
                  >
                    {therapists.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name} ({t.code || 'PT'})
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                </div>
              </div>

              {/* Diagnosis and Target Joint */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    การวินิจฉัย / ภาวะทางคลินิก <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={diagnosis}
                    onChange={(e) => setDiagnosis(e.target.value)}
                    placeholder="เช่น ฟื้นฟูอ่อนแรง/สโตรก หรือ ข้อไหล่ติด (Frozen Shoulder)"
                    className="w-full bg-white border border-emerald-200 rounded-xl p-2.5 font-bold text-[#0F2F2B] focus:outline-none focus:ring-2 focus:ring-[#10B981]"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">บริเวณข้อต่อเป้าหมาย</label>
                  <input
                    type="text"
                    value={targetJoint}
                    onChange={(e) => setTargetJoint(e.target.value)}
                    placeholder="เช่น ข้อต่อและกล้ามเนื้อ, ข้อไหล่, ข้อเข่า"
                    className="w-full bg-white border border-emerald-200 rounded-xl p-2.5 font-bold text-[#0F2F2B] focus:outline-none focus:ring-2 focus:ring-[#10B981]"
                  />
                </div>
              </div>
            </div>
          )}

          {/* ================================================================= */}
          {/* STEP 2: จัดท่าฝึก & มินิเกม                                       */}
          {/* ================================================================= */}
          {step === 2 && (
            <div className="space-y-3.5 animate-fadeIn">
              {/* Development Constraint Notice Banner */}
              <div className="p-3 rounded-xl bg-amber-50/90 border border-amber-300 text-amber-900 font-bold text-[11px] flex items-start gap-2 shadow-2xs">
                <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <div className="space-y-0.5">
                  <p>
                    <strong>ข้อจำกัดการพัฒนาปัจจุบัน:</strong> ในขณะนี้แอดมินและนักกายภาพสามารถเลือกและเซ็ตได้เฉพาะ <strong>"มินิเกมกายภาพ (Interactive Mini-Games)"</strong> เท่านั้น
                  </p>
                  <p className="text-amber-800/80 font-normal">
                    สำหรับท่าทางกายภาพบำบัดมาตรฐาน ระบบ AI ตรวจจับท่าทาง (Pose Detection) กำลังอยู่ระหว่างการพัฒนา จะขึ้นสถานะ <em>"อยู่ระหว่างพัฒนา"</em>
                  </p>
                </div>
              </div>

              {/* Preset Templates / Modpacks */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-extrabold text-slate-800 flex items-center gap-1">
                    <span>⚡</span>
                    <span>ดึงชุดท่าฝึกสำเร็จรูป (Exercise Modpack / Presets):</span>
                  </span>
                  <span className="text-[10px] text-slate-400">คลิกเพื่อ auto-fill ท่าทั้งหมดทันที</span>
                </div>
                <div className="flex items-center gap-2 overflow-x-auto pb-1.5">
                  {availableModpacks.map((tpl) => (
                    <button
                      key={tpl.id}
                      type="button"
                      onClick={() => handleApplyPreset(tpl)}
                      className="p-2.5 min-w-[135px] rounded-xl bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-[#0F2F2B] font-bold text-xs flex flex-col items-center justify-center text-center transition cursor-pointer shadow-2xs hover:scale-102 flex-shrink-0"
                    >
                      <span className="text-lg mb-0.5">{tpl.icon || '📦'}</span>
                      <span className="truncate w-full font-bold">{tpl.name}</span>
                      <span className="text-[10px] text-emerald-700 font-semibold mt-0.5">({tpl.exercises.length} ท่าในชุด)</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="border-t border-emerald-100 pt-2" />

              {/* Assigned Exercises List with + / - buttons */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="block font-extrabold text-slate-800 text-xs">
                    🏋️ รายการท่าฝึกกายภาพที่เลือก ({assignedExercises.length} ท่า){' '}
                    <span className="text-rose-500">*</span>
                  </label>
                  <span className="text-[10px] text-slate-400 font-semibold">
                    ปรับจำนวนเซ็ตและครั้งได้สะดวก
                  </span>
                </div>

                <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                  {assignedExercises.length === 0 ? (
                    <div className="p-4 rounded-xl border border-dashed border-emerald-300 text-center text-slate-400 bg-emerald-50/30">
                      ยังไม่ได้เพิ่มท่ากายภาพในตารางฝึก (เลือกเทมเพลตด้านบน หรือเพิ่มท่าด้านล่าง)
                    </div>
                  ) : (
                    assignedExercises.map((item, idx) => (
                      <div
                        key={idx}
                        className="p-2.5 rounded-xl bg-white border border-emerald-200 shadow-2xs flex items-center justify-between gap-2 flex-wrap"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <div className="w-7 h-7 rounded-lg bg-emerald-100 text-emerald-800 font-bold flex items-center justify-center flex-shrink-0 text-xs">
                            {idx + 1}
                          </div>
                          <div className="min-w-0">
                            <div className="font-bold text-[#0F2F2B] truncate">{item.exerciseName}</div>
                            <div className="text-[10px] text-slate-400 font-mono truncate">
                              {item.exerciseSlug}
                            </div>
                          </div>
                        </div>

                        {/* Interactive + / - Stepper Controls */}
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {/* Sets Stepper */}
                          <div className="flex items-center bg-slate-50 rounded-lg border border-slate-200 px-1 py-0.5">
                            <button
                              type="button"
                              onClick={() => {
                                const newSets = Math.max(1, (item.sets || 3) - 1);
                                setAssignedExercises(
                                  assignedExercises.map((ex, i) => (i === idx ? { ...ex, sets: newSets } : ex))
                                );
                              }}
                              className="w-5 h-5 flex items-center justify-center text-slate-600 hover:bg-slate-200 rounded transition cursor-pointer"
                            >
                              <Minus className="w-3 h-3" />
                            </button>
                            <span className="font-extrabold text-xs px-1.5 text-[#0F2F2B]">
                              {item.sets} เซ็ต
                            </span>
                            <button
                              type="button"
                              onClick={() => {
                                const newSets = Math.min(10, (item.sets || 3) + 1);
                                setAssignedExercises(
                                  assignedExercises.map((ex, i) => (i === idx ? { ...ex, sets: newSets } : ex))
                                );
                              }}
                              className="w-5 h-5 flex items-center justify-center text-slate-600 hover:bg-slate-200 rounded transition cursor-pointer"
                            >
                              <Plus className="w-3 h-3" />
                            </button>
                          </div>

                          {/* Reps Stepper */}
                          <div className="flex items-center bg-slate-50 rounded-lg border border-slate-200 px-1 py-0.5">
                            <button
                              type="button"
                              onClick={() => {
                                const newReps = Math.max(1, (item.reps || 10) - 1);
                                setAssignedExercises(
                                  assignedExercises.map((ex, i) => (i === idx ? { ...ex, reps: newReps } : ex))
                                );
                              }}
                              className="w-5 h-5 flex items-center justify-center text-slate-600 hover:bg-slate-200 rounded transition cursor-pointer"
                            >
                              <Minus className="w-3 h-3" />
                            </button>
                            <span className="font-extrabold text-xs px-1.5 text-[#0F2F2B]">
                              {item.reps} ครั้ง
                            </span>
                            <button
                              type="button"
                              onClick={() => {
                                const newReps = Math.min(30, (item.reps || 10) + 1);
                                setAssignedExercises(
                                  assignedExercises.map((ex, i) => (i === idx ? { ...ex, reps: newReps } : ex))
                                );
                              }}
                              className="w-5 h-5 flex items-center justify-center text-slate-600 hover:bg-slate-200 rounded transition cursor-pointer"
                            >
                              <Plus className="w-3 h-3" />
                            </button>
                          </div>

                          {/* Hold Seconds */}
                          <div className="flex items-center bg-slate-50 rounded-lg border border-slate-200 px-1.5 py-1 text-[11px] text-slate-500 font-bold">
                            <span>ค้าง {item.holdSeconds} วิ</span>
                          </div>

                          {/* Delete Button */}
                          <button
                            type="button"
                            onClick={() => handleRemoveExercise(idx)}
                            className="p-1 rounded-lg text-rose-500 hover:bg-rose-50 transition cursor-pointer"
                            title="ลบท่านี้ออกจากตาราง"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>

                {/* Add New Custom Exercise Form */}
                <div className="p-2.5 rounded-2xl bg-emerald-50/70 border border-emerald-200 space-y-2">
                  <div className="font-bold text-slate-700 flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <Gamepad2 className="w-3.5 h-3.5 text-emerald-600" />
                      <span>เพิ่มมินิเกมหรือกิจกรรมเข้าตารางฝึก</span>
                    </div>
                    <span className="text-[10px] text-emerald-800 font-bold bg-emerald-100 px-2 py-0.5 rounded-full">
                      🎮 มินิเกมพร้อมใช้งาน
                    </span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
                    <div className="sm:col-span-2 relative">
                      <select
                        value={selectedExerciseSlug}
                        onChange={(e) => setSelectedExerciseSlug(e.target.value)}
                        className="w-full bg-white border border-emerald-200 rounded-xl p-2 text-xs font-bold text-[#0F2F2B] focus:outline-none focus:ring-2 focus:ring-[#10B981] appearance-none"
                      >
                        <optgroup label="🎮 มินิเกมกายภาพ (Interactive Mini-Games) - พร้อมใช้งาน">
                          {AVAILABLE_MINIGAMES.map((mg) => (
                            <option key={mg.id} value={mg.id}>
                              🎮 {mg.name} ({mg.category})
                            </option>
                          ))}
                        </optgroup>
                        <optgroup label="🔒 ท่ากายภาพมาตรฐาน - อยู่ระหว่างพัฒนา (Physical Therapy Exercises)">
                          {exercises.map((ex) => (
                            <option key={ex.id} value={ex.svgType || ex.name} disabled className="text-slate-400 bg-slate-100">
                              🔒 {ex.name} ({ex.category}) — อยู่ระหว่างพัฒนา
                            </option>
                          ))}
                        </optgroup>
                      </select>
                      <ChevronDown className="w-3.5 h-3.5 text-slate-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                    </div>

                    <div className="grid grid-cols-2 gap-1.5">
                      <input
                        type="number"
                        min="1"
                        max="10"
                        value={exerciseSets}
                        onChange={(e) => setExerciseSets(parseInt(e.target.value) || 3)}
                        placeholder="เซ็ต"
                        title="จำนวนเซ็ต"
                        className="w-full bg-white border border-emerald-200 rounded-xl p-2 text-center text-xs font-bold text-[#0F2F2B]"
                      />
                      <input
                        type="number"
                        min="1"
                        max="30"
                        value={exerciseReps}
                        onChange={(e) => setExerciseReps(parseInt(e.target.value) || 10)}
                        placeholder="ครั้ง"
                        title="จำนวนครั้งต่อเซ็ต"
                        className="w-full bg-white border border-emerald-200 rounded-xl p-2 text-center text-xs font-bold text-[#0F2F2B]"
                      />
                    </div>

                    <button
                      type="button"
                      onClick={handleAddExercise}
                      className="w-full bg-[#10B981] text-white rounded-xl font-bold py-2 px-3 text-xs hover:bg-emerald-600 transition flex items-center justify-center gap-1 cursor-pointer shadow-2xs"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>+ เพิ่มในตาราง</span>
                    </button>
                  </div>
                </div>
              </div>

              <div className="border-t border-emerald-100 pt-2" />

              {/* Minigame Interactive Quiz Toggle (Requirement 1 & Step 2 ASCII) */}
              <div className="p-3 rounded-2xl bg-gradient-to-r from-emerald-50 via-teal-50 to-emerald-50 border-2 border-emerald-300 shadow-2xs">
                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={includeMinigame}
                    onChange={(e) => setIncludeMinigame(e.target.checked)}
                    className="w-5 h-5 rounded-md text-[#10B981] focus:ring-[#10B981] mt-0.5 cursor-pointer accent-[#10B981]"
                  />
                  <div className="flex-1">
                    <div className="font-black text-[#0F2F2B] text-xs sm:text-sm flex items-center gap-1.5">
                      <Gamepad2 className="w-4 h-4 text-emerald-600" />
                      <span>
                        🎮 รวมมินิเกมฝึกสมองและการตอบสนอง (Interactive Quiz) หลังทำกายภาพเสร็จ
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-500 font-medium mt-0.5">
                      เมื่อคนไข้ฝึกท่ากายภาพครบ จะปลดล็อคเข้าสู่มินิเกมฝึกสมองอัตโนมัติเพื่อกระตุ้นความจำและการตอบสนอง (+50 XP) ก่อนเข้าสู่หน้าจอสรุปผลประจำวัน
                    </p>
                  </div>
                </label>
              </div>
            </div>
          )}

          {/* ================================================================= */}
          {/* STEP 3: กำหนดเวลาและคีออส                                          */}
          {/* ================================================================= */}
          {step === 3 && (
            <div className="space-y-3.5 animate-fadeIn">
              {/* วันที่ลงฝึกในแต่ละสัปดาห์ */}
              <div className="bg-emerald-50/70 p-3.5 rounded-2xl border border-emerald-200/80 space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-700">วันที่ลงฝึกในแต่ละสัปดาห์:</span>
                  {/* Quick Presets */}
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => setScheduleDays(['จันทร์', 'พุธ', 'ศุกร์'])}
                      className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-white border border-emerald-200 hover:bg-emerald-100 text-emerald-800 transition cursor-pointer"
                    >
                      จ-พ-ศ
                    </button>
                    <button
                      type="button"
                      onClick={() => setScheduleDays(['อังคาร', 'พฤหัสบดี'])}
                      className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-white border border-emerald-200 hover:bg-emerald-100 text-emerald-800 transition cursor-pointer"
                    >
                      อ-พฤ
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setScheduleDays(['จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์'])
                      }
                      className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-white border border-emerald-200 hover:bg-emerald-100 text-emerald-800 transition cursor-pointer"
                    >
                      จ-ศ (ทุกวันทำการ)
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-7 gap-1.5">
                  {[
                    { name: 'จันทร์', short: 'จ.', color: 'border-amber-300 hover:bg-amber-50' },
                    { name: 'อังคาร', short: 'อ.', color: 'border-pink-300 hover:bg-pink-50' },
                    { name: 'พุธ', short: 'พ.', color: 'border-emerald-300 hover:bg-emerald-50' },
                    { name: 'พฤหัสบดี', short: 'พฤ.', color: 'border-orange-300 hover:bg-orange-50' },
                    { name: 'ศุกร์', short: 'ศ.', color: 'border-blue-300 hover:bg-blue-50' },
                    { name: 'เสาร์', short: 'ส.', color: 'border-purple-300 hover:bg-purple-50' },
                    { name: 'อาทิตย์', short: 'อา.', color: 'border-rose-300 hover:bg-rose-50' },
                  ].map((d) => {
                    const isSelected = scheduleDays.includes(d.name);
                    return (
                      <button
                        key={d.name}
                        type="button"
                        onClick={() => {
                          if (isSelected) {
                            setScheduleDays(scheduleDays.filter((x) => x !== d.name));
                          } else {
                            setScheduleDays([...scheduleDays, d.name]);
                          }
                        }}
                        className={`py-2 px-1 rounded-xl text-xs font-bold transition flex flex-col items-center justify-center cursor-pointer border ${
                          isSelected
                            ? 'bg-[#10B981] text-white border-emerald-400 shadow-sm font-extrabold ring-2 ring-emerald-300'
                            : `bg-white text-slate-600 ${d.color}`
                        }`}
                      >
                        <span className="text-[11px] leading-tight">{d.short}</span>
                        <span className="text-[9px] opacity-80">{d.name}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* ช่วงเวลา & ตู้ Kiosk */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    ช่วงเวลาที่ลงฝึก (Time Slot)
                  </label>
                  <div className="relative">
                    <select
                      value={timeSlot}
                      onChange={(e) => {
                        const val = e.target.value;
                        setTimeSlot(val);
                        const [s, end] = val.split(' - ');
                        if (s) setStartTime(s.trim());
                        if (end) setEndTime(end.trim());
                      }}
                      className="w-full bg-white border border-emerald-200 rounded-xl p-2.5 font-bold text-[#0F2F2B] focus:outline-none focus:ring-2 focus:ring-[#10B981] appearance-none"
                    >
                      <option value="08:30 - 09:30">08:30 - 09:30 น. (คาบ 1 - เช้า)</option>
                      <option value="09:30 - 10:30">09:30 - 10:30 น. (คาบ 2 - เช้า)</option>
                      <option value="10:30 - 11:30">10:30 - 11:30 น. (คาบ 3 - เช้า)</option>
                      <option value="13:00 - 14:00">13:00 - 14:00 น. (คาบ 4 - บ่าย)</option>
                      <option value="14:00 - 15:00">14:00 - 15:00 น. (คาบ 5 - บ่าย)</option>
                      <option value="15:00 - 16:00">15:00 - 16:00 น. (คาบ 6 - บ่าย)</option>
                      <option value="16:00 - 17:00">16:00 - 17:00 น. (คาบ 7 - เย็น)</option>
                    </select>
                    <ChevronDown className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    สถานที่ฝึก / ตู้ Kiosk
                  </label>
                  <div className="relative">
                    <select
                      value={roomStation}
                      onChange={(e) => setRoomStation(e.target.value)}
                      className="w-full bg-white border border-emerald-200 rounded-xl p-2.5 font-bold text-[#0F2F2B] focus:outline-none focus:ring-2 focus:ring-[#10B981] appearance-none"
                    >
                      <option value="ตู้ Kiosk 1">🖥️ ตู้ Kiosk 1 (ห้องกายภาพรวม)</option>
                      <option value="ตู้ Kiosk 2">🖥️ ตู้ Kiosk 2 (โซนฟื้นฟูข้อเข่า)</option>
                      <option value="ตู้ Kiosk 3">🖥️ ตู้ Kiosk 3 (โซนออฟฟิศซินโดรม)</option>
                      <option value="เตียงฝึก 1">🛏️ เตียงฝึกกายภาพ 1</option>
                    </select>
                    <ChevronDown className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  </div>
                </div>
              </div>

              {/* วันที่เริ่มต้น - สิ้นสุด */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    📅 วันที่เริ่มต้นคอร์ส (วัน/เดือน/ปี)
                  </label>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="w-full bg-white border border-emerald-200 rounded-xl p-2.5 font-bold text-[#0F2F2B] focus:outline-none focus:ring-2 focus:ring-[#10B981]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    📅 วันที่สิ้นสุดคอร์ส (วัน/เดือน/ปี)
                  </label>
                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="w-full bg-white border border-emerald-200 rounded-xl p-2.5 font-bold text-[#0F2F2B] focus:outline-none focus:ring-2 focus:ring-[#10B981]"
                  />
                </div>
              </div>

              {/* Clinical Notes & Status */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="sm:col-span-2">
                  <label className="block font-bold text-slate-700 mb-1">
                    คำแนะนำและข้อควรระวังสำหรับผู้ป่วย (Clinical Notes)
                  </label>
                  <textarea
                    value={clinicalNotes}
                    onChange={(e) => setClinicalNotes(e.target.value)}
                    rows={2}
                    placeholder="เช่น ฝึกอย่างสม่ำเสมอ พักระหว่างเซ็ต 30 วินาที หากปวดเกินระดับ 3 ให้หยุดพัก"
                    className="w-full bg-white border border-emerald-200 rounded-xl p-2.5 font-semibold text-[#0F2F2B] focus:outline-none focus:ring-2 focus:ring-[#10B981] resize-none"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">สถานะตารางฝึก</label>
                  <select
                    value={status}
                    onChange={(e) => setStatus(e.target.value as any)}
                    className="w-full bg-white border border-emerald-200 rounded-xl p-2.5 font-bold text-[#0F2F2B] focus:outline-none focus:ring-2 focus:ring-[#10B981]"
                  >
                    <option value="active">🟢 ใช้งานอยู่ (Active)</option>
                    <option value="paused">🟡 พักการฝึก (Paused)</option>
                    <option value="completed">🔵 ฝึกครบโปรแกรม (Completed)</option>
                  </select>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Modal Wizard Navigation Footer Buttons */}
        <div className="pt-3 border-t border-emerald-100 flex items-center justify-between gap-2.5 flex-shrink-0">
          <div>
            {step > 1 ? (
              <button
                type="button"
                onClick={() => setStep((s) => (s - 1) as 1 | 2)}
                className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 font-bold hover:bg-slate-50 transition cursor-pointer flex items-center gap-1.5"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>ย้อนกลับ</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-xl border border-slate-200 text-slate-500 font-bold hover:bg-slate-50 transition cursor-pointer"
              >
                ยกเลิก
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            {step < 3 ? (
              <button
                type="button"
                onClick={step === 1 ? handleStep1Next : handleStep2Next}
                className="px-5 py-2 rounded-xl bg-gradient-to-r from-[#10B981] via-[#06B6D4] to-[#2563EB] text-white font-bold hover:opacity-95 transition flex items-center gap-1.5 cursor-pointer shadow-md shadow-cyan-500/25 active:scale-95"
              >
                <span>ถัดไป</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            ) : (
              <button
                type="button"
                onClick={handleSubmit}
                disabled={isSubmitting}
                className="px-5 py-2 rounded-xl bg-gradient-to-r from-[#10B981] via-[#06B6D4] to-[#2563EB] text-white font-bold hover:opacity-95 transition flex items-center gap-2 cursor-pointer shadow-md shadow-cyan-500/25 disabled:opacity-50 active:scale-95"
              >
                <Check className="w-4 h-4" />
                <span>{isSubmitting ? 'กำลังบันทึก...' : 'บันทึกตารางฝึก'}</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
