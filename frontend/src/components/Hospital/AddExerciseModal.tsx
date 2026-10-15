import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  Dumbbell,
  Sparkles,
  AlertTriangle,
  ShieldAlert,
  Check,
  Target,
  Clock,
  RotateCcw,
  Layers,
  Activity,
  Upload,
  Image as ImageIcon,
  Trash2,
  FileImage,
  Info,
} from 'lucide-react';
import { HospitalExercise } from '../../types/hospital';

interface AddExerciseModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUserName?: string;
  onSubmitExercise: (exerciseData: Omit<HospitalExercise, 'id'>) => void;
  onSuccessToast: (msg: string) => void;
}

const CATEGORIES = [
  'ข้อไหล่ (Shoulder)',
  'คอ (Neck)',
  'หลังและสะโพก (Back & Hip)',
  'แขนและมือ (Arm & Hand)',
  'ขาและข้อเข่า (Leg & Knee)',
  'มินิเกม (Minigame)',
] as const;

export const AddExerciseModal: React.FC<AddExerciseModalProps> = ({
  isOpen,
  onClose,
  currentUserName,
  onSubmitExercise,
  onSuccessToast,
}) => {
  // Section 1: Basic Info
  const [name, setName] = useState<string>('');
  const [englishName, setEnglishName] = useState<string>('');
  const [category, setCategory] = useState<string>('ฟื้นฟูข้อไหล่และแขน (Shoulder & Arm)');
  const [type, setType] = useState<'single' | 'preset'>('single');
  const [difficulty, setDifficulty] = useState<'easy' | 'medium' | 'hard'>('medium');
  const [createdBy, setCreatedBy] = useState<string>(currentUserName || 'ผู้อำนวยการ นพ.วรชัย');

  // Section 2: Kinematics & Training Targets
  const [targetJoint, setTargetJoint] = useState<string>('');
  const [targetAngle, setTargetAngle] = useState<number | string>(90);
  const [minAngle, setMinAngle] = useState<number | string>(0);
  const [maxAngle, setMaxAngle] = useState<number | string>(120);
  const [holdSeconds, setHoldSeconds] = useState<number | string>(3);
  const [repsPerSet, setRepsPerSet] = useState<number | string>(10);
  const [sets, setSets] = useState<number | string>(3);
  const [description, setDescription] = useState<string>('');
  const [instructions, setInstructions] = useState<string>('');
  const [benefits, setBenefits] = useState<string>('');

  // Section 3: Safety, Cautions & Warnings
  const [cautions, setCautions] = useState<string>('');
  const [warnings, setWarnings] = useState<string>('');
  const [contraindications, setContraindications] = useState<string>('');

  // Section 4: Image / Media Upload
  const [demoImage, setDemoImage] = useState<string>('');
  const [imageFileName, setImageFileName] = useState<string>('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Validation errors
  const [errors, setErrors] = useState<{
    name?: string;
    englishName?: string;
    category?: string;
    targetAngle?: string;
    targetJoint?: string;
  }>({});

  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  useEffect(() => {
    if (isOpen) {
      setName('');
      setEnglishName('');
      setCategory(CATEGORIES[0]);
      setDifficulty('medium');
      setTargetJoint('ข้อไหล่ (Shoulder)');
      setTargetAngle(90);
      setMinAngle(0);
      setMaxAngle(120);
      setHoldSeconds(3);
      setRepsPerSet(10);
      setSets(3);
      setDescription('');
      setCautions('');
      setWarnings('');
      setContraindications('');
      setDemoImage('');
      setImageFileName('');
      setCreatedBy(currentUserName || 'ผู้อำนวยการ นพ.วรชัย');
      setErrors({});
      setIsSubmitting(false);
    }
  }, [isOpen, currentUserName]);

  if (!isOpen) return null;

  const handleImageFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImageFileName(file.name);
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setDemoImage(reader.result);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleRemoveImage = () => {
    setDemoImage('');
    setImageFileName('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const validate = (): boolean => {
    const newErrors: typeof errors = {};

    if (!name.trim()) {
      newErrors.name = 'กรุณาระบุชื่อท่าทางกายภาพ (ภาษาไทย)';
    }
    if (!englishName.trim()) {
      newErrors.englishName = 'กรุณาระบุชื่อท่าทางกายภาพ (ภาษาอังกฤษ)';
    }
    if (!category.trim()) {
      newErrors.category = 'กรุณาเลือกหมวดหมู่ท่าทางกายภาพ';
    }
    const angleNum = Number(targetAngle);
    if (isNaN(angleNum) || angleNum <= 0 || angleNum > 360) {
      newErrors.targetAngle = 'กรุณาระบุมุมเป้าหมายเป็นตัวเลข 1 - 360 องศา';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    setIsSubmitting(true);

    const angleNum = Number(targetAngle) || 90;
    const minAngleNum = Number(minAngle) || 0;
    const maxAngleNum = Number(maxAngle) || Math.max(angleNum, 120);
    const holdNum = Math.max(1, Number(holdSeconds) || 3);
    const repsNum = Math.max(1, Number(repsPerSet) || 10);
    const setsNum = Math.max(1, Number(sets) || 3);

    const slug = englishName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '') || `custom_exercise_${Date.now()}`;

    const virtualFilePath = `/public/uploads/exercises/${slug}_demo.jpg`;

    // Persist custom exercise image to persistent storage
    if (demoImage && typeof window !== 'undefined' && window.localStorage) {
      try {
        localStorage.setItem(`fs:${virtualFilePath}`, demoImage);
        localStorage.setItem('fs:/public/uploads/exercises/exercise_demo.jpg', demoImage);
        console.log(`[STORAGE] Uploaded custom exercise demo image to ${virtualFilePath} and exercise_demo.jpg`);
      } catch (err) {
        console.warn('⚠️ LocalStorage quota warning when saving exercise image:', err);
      }
    }

    const newExerciseData: Omit<HospitalExercise, 'id'> = {
      name: name.trim(),
      englishName: englishName.trim(),
      category: category.trim(),
      type,
      defaultReps: repsNum,
      defaultSets: setsNum,
      createdBy: createdBy.trim() || 'ผู้อำนวยการ นพ.วรชัย',
      difficulty,
      targetJoint: targetJoint.trim() || 'ข้อต่อและกล้ามเนื้อตามหลักกายภาพ',
      targetAngle: angleNum,
      minAngle: minAngleNum,
      maxAngle: maxAngleNum,
      holdSeconds: holdNum,
      repsPerSet: repsNum,
      sets: setsNum,
      description:
        description.trim() ||
        'ฝึกเคลื่อนไหวอย่างช้าๆ ควบคุมแนวระนาบของร่างกายและหายใจเข้าออกสม่ำเสมอ',
      instructions: instructions.trim() || description.trim(),
      benefits: benefits.trim() || 'เพิ่มความยืดหยุ่น เพิ่มช่วงการเคลื่อนไหวข้อต่อ และลดอาการปวด',
      cautions: cautions.trim() || 'หยุดทันทีหากรู้สึกเจ็บแปลบ ชา หรือเวียนศีรษะ',
      warnings: warnings.trim() || undefined,
      contraindications: contraindications.trim() || undefined,
      svgType: slug,
      imageUrl: demoImage || virtualFilePath,
      demoImageUrl: demoImage || virtualFilePath,
    };

    onSubmitExercise(newExerciseData);
    onSuccessToast(`เพิ่มท่า ${newExerciseData.name} เข้าสู่คลังท่ากายภาพเรียบร้อยแล้ว`);
    setIsSubmitting(false);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-[#0F2F2B]/70 backdrop-blur-sm animate-fadeIn"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl sm:max-w-2xl bg-white rounded-[28px] sm:rounded-3xl shadow-2xl border border-emerald-200 overflow-hidden flex flex-col max-h-[92vh] animate-slideUp"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ================================================================= */}
        {/* 1. MODAL HEADER                                                   */}
        {/* ================================================================= */}
        <div className="px-6 py-4 border-b border-emerald-100 bg-gradient-to-r from-emerald-50 via-white to-emerald-50/40 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-[#10B981] text-white flex items-center justify-center shadow-md shadow-emerald-500/20">
              <Dumbbell className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-extrabold text-base sm:text-lg text-[#0F2F2B]">
                  เพิ่มท่าทางกายภาพบำบัดใหม่
                </h3>
                <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-bold">
                  ชีวกลศาสตร์ AI
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                กำหนดข้อต่อเป้าหมาย มุมองศา (Target Angles) คำเตือน และรูปภาพ/GIF สาธิต
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-full text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition cursor-pointer"
            aria-label="ปิดหน้าต่าง"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* ================================================================= */}
        {/* 2. MODAL BODY (SCROLLABLE FORM)                                   */}
        {/* ================================================================= */}
        <form onSubmit={handleSubmit} className="p-5 sm:p-6 space-y-5 overflow-y-auto flex-1 text-xs">
          {/* --------------------------------------------------------------- */}
          {/* SECTION 1: ข้อมูลพื้นฐานท่าทาง (Basic Exercise Info)               */}
          {/* --------------------------------------------------------------- */}
          <div className="space-y-3.5 bg-stone-50/70 p-4 sm:p-5 rounded-2xl border border-stone-200/80">
            <div className="flex items-center justify-between border-b border-stone-200/60 pb-2">
              <div className="font-bold text-sm text-[#0F2F2B] flex items-center gap-2">
                <span className="w-5 h-5 rounded-full bg-emerald-100 text-emerald-800 text-[11px] font-bold flex items-center justify-center">
                  1
                </span>
                <span>ข้อมูลพื้นฐานท่าทางกายภาพ</span>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <div>
                <label className="block text-slate-700 font-bold mb-1">
                  ชื่อท่า (ภาษาไทย) <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value);
                    if (errors.name) setErrors({ ...errors, name: undefined });
                  }}
                  placeholder="เช่น กางแขนยกด้านข้าง, ย่อเข่าเก้าอี้พยุง"
                  className={`w-full px-3.5 py-2.5 rounded-2xl border bg-white text-xs text-slate-800 font-semibold focus:outline-none focus:ring-2 ${
                    errors.name
                      ? 'border-rose-400 focus:ring-rose-400 bg-rose-50/30'
                      : 'border-stone-200 focus:ring-[#10B981]'
                  }`}
                />
                {errors.name && <p className="text-[11px] text-rose-500 mt-1 font-medium">{errors.name}</p>}
              </div>

              <div>
                <label className="block text-slate-700 font-bold mb-1">
                  ชื่อท่า (ภาษาอังกฤษ) <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  value={englishName}
                  onChange={(e) => {
                    setEnglishName(e.target.value);
                    if (errors.englishName) setErrors({ ...errors, englishName: undefined });
                  }}
                  placeholder="e.g. Shoulder Abduction / Raise"
                  className={`w-full px-3.5 py-2.5 rounded-2xl border bg-white text-xs text-slate-800 font-medium focus:outline-none focus:ring-2 ${
                    errors.englishName
                      ? 'border-rose-400 focus:ring-rose-400 bg-rose-50/30'
                      : 'border-stone-200 focus:ring-[#10B981]'
                  }`}
                />
                {errors.englishName && (
                  <p className="text-[11px] text-rose-500 mt-1 font-medium">{errors.englishName}</p>
                )}
              </div>
            </div>

            {/* Type Radio & Created By */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 pt-1">
              <div>
                <label className="block text-slate-700 font-bold mb-1">
                  ประเภทท่าทาง (Type) <span className="text-rose-500">*</span>
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <label className={`flex items-center gap-2 p-2 rounded-xl border cursor-pointer font-bold transition ${
                    type === 'single' ? 'bg-emerald-50 border-emerald-400 text-emerald-900' : 'bg-white border-stone-200 text-slate-600'
                  }`}>
                    <input
                      type="radio"
                      name="exerciseType"
                      checked={type === 'single'}
                      onChange={() => setType('single')}
                      className="accent-emerald-600"
                    />
                    <span>Single</span>
                  </label>
                  <label className={`flex items-center gap-2 p-2 rounded-xl border cursor-pointer font-bold transition ${
                    type === 'preset' ? 'bg-emerald-50 border-emerald-400 text-emerald-900' : 'bg-white border-stone-200 text-slate-600'
                  }`}>
                    <input
                      type="radio"
                      name="exerciseType"
                      checked={type === 'preset'}
                      onChange={() => setType('preset')}
                      className="accent-emerald-600"
                    />
                    <span>Preset</span>
                  </label>
                </div>
              </div>

              <div>
                <label className="block text-slate-700 font-bold mb-1">
                  ผู้สร้าง (Created By - Auto-filled)
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={createdBy}
                    readOnly
                    className="w-full px-3.5 py-2.5 rounded-2xl border border-stone-200 bg-stone-100/80 text-xs text-slate-700 font-bold outline-none cursor-not-allowed"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-bold text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded-full">
                    Read-Only
                  </span>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 pt-1">
              <div>
                <label className="block text-slate-700 font-bold mb-1">
                  หมวดหมู่ <span className="text-rose-500">*</span>
                </label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-2xl border border-stone-200 bg-white text-xs text-slate-800 font-bold focus:outline-none focus:ring-2 focus:ring-[#10B981] cursor-pointer"
                >
                  {CATEGORIES.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-slate-700 font-bold mb-1">ระดับความยาก</label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setDifficulty('easy')}
                    className={`py-2 rounded-xl text-xs font-bold transition border cursor-pointer ${
                      difficulty === 'easy'
                        ? 'bg-emerald-500 text-white border-emerald-600 shadow-sm'
                        : 'bg-white text-slate-600 border-stone-200 hover:border-emerald-300'
                    }`}
                  >
                    ง่าย (Easy)
                  </button>
                  <button
                    type="button"
                    onClick={() => setDifficulty('medium')}
                    className={`py-2 rounded-xl text-xs font-bold transition border cursor-pointer ${
                      difficulty === 'medium'
                        ? 'bg-amber-500 text-white border-amber-600 shadow-sm'
                        : 'bg-white text-slate-600 border-stone-200 hover:border-amber-300'
                    }`}
                  >
                    ปานกลาง
                  </button>
                  <button
                    type="button"
                    onClick={() => setDifficulty('hard')}
                    className={`py-2 rounded-xl text-xs font-bold transition border cursor-pointer ${
                      difficulty === 'hard'
                        ? 'bg-rose-500 text-white border-rose-600 shadow-sm'
                        : 'bg-white text-slate-600 border-stone-200 hover:border-rose-300'
                    }`}
                  >
                    ยาก (Hard)
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* --------------------------------------------------------------- */}
          {/* SECTION 2: ข้อต่อและมุมองศาเป้าหมาย (Target Joints & Angles)     */}
          {/* --------------------------------------------------------------- */}
          <div className="space-y-3.5 bg-emerald-50/40 p-4 sm:p-5 rounded-2xl border border-emerald-200/80">
            <div className="flex items-center justify-between border-b border-emerald-200/60 pb-2">
              <div className="font-bold text-sm text-[#0F2F2B] flex items-center gap-2">
                <span className="w-5 h-5 rounded-full bg-emerald-200 text-emerald-900 text-[11px] font-bold flex items-center justify-center">
                  2
                </span>
                <span>ข้อต่อเป้าหมายและมุมองศาชีวกลศาสตร์ (Target Joints & Angles)</span>
              </div>
              <span className="text-[11px] text-emerald-700 font-bold">สำหรับโมเดล AI ตรวจจับ</span>
            </div>

            <div>
              <label className="block text-slate-700 font-bold mb-1 flex items-center gap-1.5">
                <Activity className="w-3.5 h-3.5 text-emerald-600" />
                <span>ข้อต่อและกล้ามเนื้อเป้าหมาย (Target Joint) <span className="text-rose-500">*</span></span>
              </label>
              <input
                type="text"
                value={targetJoint}
                onChange={(e) => setTargetJoint(e.target.value)}
                placeholder="เช่น ข้อไหล่ (Shoulder), ข้อเข่าและต้นขา (Knee Quadriceps)"
                className="w-full px-3.5 py-2.5 rounded-2xl border border-emerald-200 bg-white text-xs text-slate-800 font-semibold focus:outline-none focus:ring-2 focus:ring-[#10B981]"
              />
            </div>

            {/* Target Angles 3-tier inputs: Min Angle, Target Angle, Max Angle */}
            <div className="grid grid-cols-3 gap-3 pt-1">
              <div className="p-3 bg-white rounded-2xl border border-emerald-100 shadow-2xs">
                <label className="block text-slate-600 font-bold mb-1 text-[11px]">
                  มุมเริ่มต้น (Min Angle)
                </label>
                <div className="flex items-center">
                  <input
                    type="number"
                    min={0}
                    max={180}
                    value={minAngle}
                    onChange={(e) => setMinAngle(e.target.value)}
                    className="w-full py-1 text-center font-extrabold text-slate-700 text-sm focus:outline-none"
                    placeholder="0"
                  />
                  <span className="text-slate-400 font-bold pr-1">°</span>
                </div>
                <span className="text-[10px] text-slate-400 block text-center">มุมพักเริ่มต้น</span>
              </div>

              <div className="p-3 bg-emerald-100/60 rounded-2xl border border-emerald-300 shadow-2xs">
                <label className="block text-emerald-900 font-black mb-1 text-[11px] flex items-center justify-center gap-1">
                  <Target className="w-3 h-3 text-emerald-700" />
                  <span>มุมเป้าหมาย (Target) *</span>
                </label>
                <div className="flex items-center">
                  <input
                    type="number"
                    min={1}
                    max={360}
                    value={targetAngle}
                    onChange={(e) => {
                      setTargetAngle(e.target.value);
                      if (errors.targetAngle) setErrors({ ...errors, targetAngle: undefined });
                    }}
                    className="w-full py-1 text-center font-black text-emerald-800 text-base focus:outline-none bg-transparent"
                    placeholder="90"
                  />
                  <span className="text-emerald-700 font-black pr-1">°</span>
                </div>
                <span className="text-[10px] text-emerald-800 font-bold block text-center">นับเป็น 1 ครั้งเมื่อถึง</span>
              </div>

              <div className="p-3 bg-white rounded-2xl border border-emerald-100 shadow-2xs">
                <label className="block text-slate-600 font-bold mb-1 text-[11px]">
                  มุมสูงสุด (Max Angle)
                </label>
                <div className="flex items-center">
                  <input
                    type="number"
                    min={1}
                    max={360}
                    value={maxAngle}
                    onChange={(e) => setMaxAngle(e.target.value)}
                    className="w-full py-1 text-center font-extrabold text-slate-700 text-sm focus:outline-none"
                    placeholder="120"
                  />
                  <span className="text-slate-400 font-bold pr-1">°</span>
                </div>
                <span className="text-[10px] text-slate-400 block text-center">ขอบเขตปลอดภัย</span>
              </div>
            </div>

            {/* Prescriptions: Hold, Reps, Sets */}
            <div className="grid grid-cols-3 gap-3 pt-1">
              <div>
                <label className="block text-slate-700 font-bold mb-1 flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5 text-emerald-600" />
                  <span>เวลาค้าง (วิ)</span>
                </label>
                <input
                  type="number"
                  min={1}
                  max={120}
                  value={holdSeconds}
                  onChange={(e) => setHoldSeconds(e.target.value)}
                  className="w-full px-3 py-2 rounded-2xl border border-stone-200 bg-white text-xs text-center font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#10B981]"
                  placeholder="3"
                />
              </div>

              <div>
                <label className="block text-slate-700 font-bold mb-1 flex items-center gap-1">
                  <RotateCcw className="w-3.5 h-3.5 text-emerald-600" />
                  <span>ครั้ง/เซ็ต</span>
                </label>
                <input
                  type="number"
                  min={1}
                  max={100}
                  value={repsPerSet}
                  onChange={(e) => setRepsPerSet(e.target.value)}
                  className="w-full px-3 py-2 rounded-2xl border border-stone-200 bg-white text-xs text-center font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#10B981]"
                  placeholder="10"
                />
              </div>

              <div>
                <label className="block text-slate-700 font-bold mb-1 flex items-center gap-1">
                  <Layers className="w-3.5 h-3.5 text-emerald-600" />
                  <span>จำนวนเซ็ต</span>
                </label>
                <input
                  type="number"
                  min={1}
                  max={20}
                  value={sets}
                  onChange={(e) => setSets(e.target.value)}
                  className="w-full px-3 py-2 rounded-2xl border border-stone-200 bg-white text-xs text-center font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#10B981]"
                  placeholder="3"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              <div>
                <label className="block text-slate-700 font-bold mb-1">
                  ขั้นตอนวิธีฝึก (Instructions Steps)
                </label>
                <textarea
                  rows={2}
                  value={instructions}
                  onChange={(e) => setInstructions(e.target.value)}
                  placeholder="ขั้นตอนที่ 1, ขั้นตอนที่ 2..."
                  className="w-full p-2.5 rounded-2xl border border-stone-200 bg-white text-xs text-slate-800 leading-relaxed focus:outline-none focus:ring-2 focus:ring-[#10B981]"
                />
              </div>
              <div>
                <label className="block text-slate-700 font-bold mb-1">
                  ประโยชน์ทางกายภาพบำบัด (Benefits)
                </label>
                <textarea
                  rows={2}
                  value={benefits}
                  onChange={(e) => setBenefits(e.target.value)}
                  placeholder="เพิ่มช่วงการเคลื่อนไหว ลดพังผืดข้อต่อ และเสริมสร้างกล้ามเนื้อ..."
                  className="w-full p-2.5 rounded-2xl border border-stone-200 bg-white text-xs text-slate-800 leading-relaxed focus:outline-none focus:ring-2 focus:ring-[#10B981]"
                />
              </div>
            </div>
          </div>

          {/* --------------------------------------------------------------- */}
          {/* SECTION 3: อัปโหลดภาพสาธิตท่าฝึก (Image / Media Upload)          */}
          {/* --------------------------------------------------------------- */}
          <div className="space-y-3 bg-blue-50/40 p-4 sm:p-5 rounded-2xl border border-blue-200/80">
            <div className="flex items-center justify-between border-b border-blue-200/60 pb-2">
              <div className="font-bold text-sm text-[#0F2F2B] flex items-center gap-2">
                <span className="w-5 h-5 rounded-full bg-blue-100 text-blue-800 text-[11px] font-bold flex items-center justify-center">
                  3
                </span>
                <span>อัปโหลดภาพสาธิตท่าทาง (Exercise Demo Photo / Animated GIF)</span>
              </div>
              <span className="text-[10px] text-blue-700 font-mono font-bold bg-blue-100/70 px-2 py-0.5 rounded-full">
                public/uploads/exercises/
              </span>
            </div>

            {demoImage ? (
              <div className="p-3.5 bg-white rounded-2xl border border-blue-200 flex items-center gap-4">
                <div className="w-24 h-24 rounded-xl overflow-hidden bg-stone-100 border border-slate-200 flex-shrink-0 relative group">
                  <img
                    src={demoImage}
                    alt="Exercise Demo"
                    className="w-full h-full object-cover"
                  />
                </div>
                <div className="flex-1 space-y-1">
                  <div className="flex items-center gap-1.5 text-blue-900 font-bold text-xs">
                    <FileImage className="w-4 h-4 text-blue-600" />
                    <span className="truncate max-w-[200px]">{imageFileName || 'exercise_demo.jpg'}</span>
                  </div>
                  <p className="text-[11px] text-slate-500">
                    บันทึกลงในโฟลเดอร์ระบบ <code>public/uploads/exercises/</code> เรียบร้อยแล้ว
                  </p>
                  <button
                    type="button"
                    onClick={handleRemoveImage}
                    className="px-3 py-1 rounded-full text-rose-600 hover:bg-rose-50 border border-rose-200 font-bold text-[11px] transition flex items-center gap-1 cursor-pointer mt-1"
                  >
                    <Trash2 className="w-3 h-3" />
                    <span>เปลี่ยนรูปภาพ</span>
                  </button>
                </div>
              </div>
            ) : (
              <div
                onClick={() => fileInputRef.current?.click()}
                className="p-6 border-2 border-dashed border-blue-300 hover:border-blue-500 rounded-2xl bg-white/80 hover:bg-blue-50/50 transition cursor-pointer text-center space-y-2"
              >
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleImageFileChange}
                  accept="image/jpeg,image/png,image/webp,image/gif"
                  className="hidden"
                />
                <div className="w-12 h-12 rounded-2xl bg-blue-50 text-blue-600 mx-auto flex items-center justify-center shadow-2xs">
                  <Upload className="w-6 h-6" />
                </div>
                <div>
                  <p className="font-bold text-slate-800 text-xs">
                    คลิกเพื่ออัปโหลดภาพถ่าย หรือ GIF สาธิตการทำท่าทางกายภาพ
                  </p>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    รองรับ JPG, PNG, WEBP, GIF (บันทึกเป็น exercise_demo.jpg อัตโนมัติ)
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* --------------------------------------------------------------- */}
          {/* SECTION 4: ข้อควรระวังและคำเตือน (Warnings & Safety)             */}
          {/* --------------------------------------------------------------- */}
          <div className="space-y-3.5 bg-rose-50/40 p-4 sm:p-5 rounded-2xl border border-rose-200/80">
            <div className="flex items-center justify-between border-b border-rose-200/60 pb-2">
              <div className="font-bold text-sm text-rose-900 flex items-center gap-2">
                <span className="w-5 h-5 rounded-full bg-rose-200 text-rose-800 text-[11px] font-bold flex items-center justify-center">
                  4
                </span>
                <span>คำเตือนและข้อควรระวังทางการแพทย์ (Clinical Warnings & Safety)</span>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-rose-900 font-bold mb-1 flex items-center gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
                  <span>ข้อควรระวัง (Cautions)</span>
                </label>
                <textarea
                  rows={2}
                  value={cautions}
                  onChange={(e) => setCautions(e.target.value)}
                  placeholder="เช่น ระวังอย่ายกไหล่เกร็งชิดใบหู (Shoulder Hike) และลำตัวต้องไม่เอียงชดเชย"
                  className="w-full p-3 rounded-2xl border border-rose-200 bg-white text-xs text-rose-950 placeholder:text-rose-300 focus:outline-none focus:ring-2 focus:ring-rose-400"
                />
              </div>

              <div>
                <label className="block text-rose-900 font-bold mb-1 flex items-center gap-1.5">
                  <Info className="w-3.5 h-3.5 text-rose-500" />
                  <span>คำเตือนทางคลินิก (Warnings)</span>
                </label>
                <textarea
                  rows={2}
                  value={warnings}
                  onChange={(e) => setWarnings(e.target.value)}
                  placeholder="เช่น ผู้ป่วยสูงอายุควรมีผู้ดูแลประกบชิด หรือหากมีอาการมึนศีรษะให้หยุดทันที"
                  className="w-full p-3 rounded-2xl border border-rose-200 bg-white text-xs text-rose-950 placeholder:text-rose-300 focus:outline-none focus:ring-2 focus:ring-rose-400"
                />
              </div>
            </div>

            <div>
              <label className="block text-rose-900 font-bold mb-1 flex items-center gap-1.5">
                <ShieldAlert className="w-3.5 h-3.5 text-rose-600" />
                <span>ข้อห้าม / ข้อจำกัดทางการแพทย์ (Contraindications - ไม่บังคับ)</span>
              </label>
              <textarea
                rows={2}
                value={contraindications}
                onChange={(e) => setContraindications(e.target.value)}
                placeholder="เช่น ผู้ป่วยที่มีภาวะข้อไหล่หลุดเฉียบพลัน หรือเพิ่งได้รับการผ่าตัดเย็บซ่อมเอ็นข้อไหล่ไม่เกิน 6 สัปดาห์"
                className="w-full p-3 rounded-2xl border border-rose-200 bg-white text-xs text-rose-950 placeholder:text-rose-300 focus:outline-none focus:ring-2 focus:ring-rose-400"
              />
            </div>
          </div>
        </form>

        {/* ================================================================= */}
        {/* 4. MODAL FOOTER                                                   */}
        {/* ================================================================= */}
        <div className="px-6 py-4 border-t border-emerald-100 bg-stone-50/50 flex items-center justify-end gap-3 flex-shrink-0">
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="px-4 py-2.5 rounded-full border border-stone-300 text-slate-700 font-bold text-xs hover:bg-stone-100 transition cursor-pointer"
          >
            ยกเลิก
          </button>

          <button
            type="button"
            onClick={handleSubmit}
            disabled={isSubmitting}
            className="px-6 py-2.5 rounded-full bg-[#10B981] hover:bg-emerald-600 active:bg-emerald-700 text-white font-bold text-xs shadow-md shadow-emerald-500/20 transition flex items-center gap-2 cursor-pointer disabled:opacity-50"
          >
            {isSubmitting ? (
              <>
                <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                <span>กำลังบันทึก...</span>
              </>
            ) : (
              <>
                <Check className="w-4 h-4" />
                <span>บันทึกท่าใหม่เข้าคลัง</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
