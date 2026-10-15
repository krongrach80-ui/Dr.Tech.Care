import React, { useState, useEffect } from 'react';
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
  Pencil,
} from 'lucide-react';
import { HospitalExercise } from '../../types/hospital';

interface EditExerciseModalProps {
  isOpen: boolean;
  onClose: () => void;
  exercise: HospitalExercise | null;
  onUpdateExercise: (id: number | string, data: Partial<HospitalExercise>) => void;
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

export const EditExerciseModal: React.FC<EditExerciseModalProps> = ({
  isOpen,
  onClose,
  exercise,
  onUpdateExercise,
  onSuccessToast,
}) => {
  // Section 1: Basic Info
  const [name, setName] = useState<string>('');
  const [englishName, setEnglishName] = useState<string>('');
  const [category, setCategory] = useState<string>(CATEGORIES[0]);
  const [type, setType] = useState<'single' | 'preset'>('single');
  const [difficulty, setDifficulty] = useState<'easy' | 'medium' | 'hard'>('medium');
  const [createdBy, setCreatedBy] = useState<string>('ผู้อำนวยการ นพ.วรชัย');

  // Section 2: Kinematics & Training Targets
  const [targetAngle, setTargetAngle] = useState<number | string>(90);
  const [holdSeconds, setHoldSeconds] = useState<number | string>(3);
  const [repsPerSet, setRepsPerSet] = useState<number | string>(10);
  const [sets, setSets] = useState<number | string>(3);
  const [targetJoint, setTargetJoint] = useState<string>('');
  const [description, setDescription] = useState<string>('');
  const [instructions, setInstructions] = useState<string>('');
  const [benefits, setBenefits] = useState<string>('');

  // Section 3: Safety & Cautions
  const [cautions, setCautions] = useState<string>('');
  const [contraindications, setContraindications] = useState<string>('');

  // Validation errors
  const [errors, setErrors] = useState<{
    name?: string;
    englishName?: string;
    category?: string;
    targetAngle?: string;
  }>({});

  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  // Pre-fill existing exercise data
  useEffect(() => {
    if (isOpen && exercise) {
      setName(exercise.name || '');
      setEnglishName(exercise.englishName || '');
      setCategory(exercise.category || CATEGORIES[0]);
      setType((exercise.type as 'single' | 'preset') || 'single');
      setDifficulty(exercise.difficulty || 'medium');
      setCreatedBy(exercise.createdBy || 'ผู้อำนวยการ นพ.วรชัย');
      setTargetAngle(exercise.targetAngle ?? 90);
      setHoldSeconds(exercise.holdSeconds ?? 3);
      setRepsPerSet(exercise.repsPerSet ?? exercise.defaultReps ?? 10);
      setSets(exercise.sets ?? exercise.defaultSets ?? 3);
      setTargetJoint(exercise.targetJoint || '');
      setDescription(exercise.description || '');
      setInstructions(
        Array.isArray(exercise.instructions)
          ? exercise.instructions.join('\n')
          : (exercise.instructions || exercise.description || '')
      );
      setBenefits(exercise.benefits || 'เพิ่มช่วงการเคลื่อนไหว ลดพังผืดข้อต่อ');
      setCautions(exercise.cautions || '');
      setContraindications(exercise.contraindications || '');
      setErrors({});
      setIsSubmitting(false);
    }
  }, [isOpen, exercise]);

  if (!isOpen || !exercise) return null;

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
    const holdNum = Math.max(1, Number(holdSeconds) || 3);
    const repsNum = Math.max(1, Number(repsPerSet) || 10);
    const setsNum = Math.max(1, Number(sets) || 3);

    const updatedData: Partial<HospitalExercise> = {
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
      holdSeconds: holdNum,
      repsPerSet: repsNum,
      sets: setsNum,
      description:
        description.trim() ||
        'ฝึกเคลื่อนไหวอย่างช้าๆ ควบคุมแนวระนาบของร่างกายและหายใจเข้าออกสม่ำเสมอ',
      instructions: instructions.trim() || description.trim(),
      benefits: benefits.trim() || 'เพิ่มช่วงการเคลื่อนไหว ลดพังผืดข้อต่อ',
      cautions: cautions.trim() || 'หยุดทันทีหากรู้สึกเจ็บแปลบ ชา หรือเวียนศีรษะ',
      contraindications: contraindications.trim() || undefined,
    };

    onUpdateExercise(exercise.id, updatedData);
    onSuccessToast(`แก้ไขข้อมูลท่า ${name.trim()} เรียบร้อยแล้ว`);
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
        <div className="px-6 py-4 border-b border-emerald-100 bg-gradient-to-r from-emerald-50/80 via-white to-emerald-50/40 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-[#10B981] text-white flex items-center justify-center shadow-md shadow-emerald-500/20">
              <Pencil className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-extrabold text-base sm:text-lg text-[#0F2F2B] flex items-center gap-2">
                <span>แก้ไขท่าทางกายภาพ</span>
                <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-mono font-normal">
                  ID: #{exercise.id}
                </span>
              </h3>
              <p className="text-[11px] text-emerald-800 font-medium truncate max-w-md">
                กำลังแก้ไข: <strong className="text-emerald-950 font-bold">{exercise.name}</strong> ({exercise.englishName})
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
        {/* 2. FORM BODY (Scrollable)                                         */}
        {/* ================================================================= */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-6 py-5 space-y-5 text-xs">
          {/* --------------------------------------------------------------- */}
          {/* SECTION 1: ข้อมูลพื้นฐาน (Basic Info)                            */}
          {/* --------------------------------------------------------------- */}
          <div className="space-y-3.5 bg-stone-50/70 p-4 sm:p-5 rounded-2xl border border-stone-200/80">
            <div className="flex items-center justify-between border-b border-stone-200/60 pb-2">
              <div className="font-bold text-sm text-[#0F2F2B] flex items-center gap-2">
                <span className="w-5 h-5 rounded-full bg-emerald-100 text-emerald-800 text-[11px] font-bold flex items-center justify-center">
                  1
                </span>
                <span>ข้อมูลพื้นฐาน (Basic Information)</span>
              </div>
              <span className="text-[10px] text-slate-400 font-medium">* จำเป็นต้องกรอก</span>
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
                  placeholder="เช่น กางแขนยกด้านข้าง"
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
                  ประเภทรูปแบบ (Type) <span className="text-rose-500">*</span>
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <label className={`flex items-center gap-2 p-2 rounded-xl border cursor-pointer font-bold transition ${
                    type === 'single' ? 'bg-emerald-50 border-emerald-400 text-emerald-900' : 'bg-white border-stone-200 text-slate-600'
                  }`}>
                    <input
                      type="radio"
                      name="editExerciseType"
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
                      name="editExerciseType"
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
                  ผู้สร้างท่าทาง (Created By)
                </label>
                <input
                  type="text"
                  value={createdBy}
                  onChange={(e) => setCreatedBy(e.target.value)}
                  placeholder="เช่น ผู้อำนวยการ นพ.วรชัย"
                  className="w-full px-3.5 py-2.5 rounded-2xl border border-stone-200 bg-white text-xs text-slate-800 font-semibold focus:outline-none focus:ring-2 focus:ring-[#10B981]"
                />
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
          {/* SECTION 2: เป้าหมายและรายละเอียดการฝึก (Kinematics & Targets)     */}
          {/* --------------------------------------------------------------- */}
          <div className="space-y-3.5 bg-stone-50/70 p-4 sm:p-5 rounded-2xl border border-stone-200/80">
            <div className="flex items-center justify-between border-b border-stone-200/60 pb-2">
              <div className="font-bold text-sm text-[#0F2F2B] flex items-center gap-2">
                <span className="w-5 h-5 rounded-full bg-emerald-100 text-emerald-800 text-[11px] font-bold flex items-center justify-center">
                  2
                </span>
                <span>เป้าหมายและรายละเอียดการฝึก (Exercise Targets & Prescription)</span>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div>
                <label className="block text-slate-700 font-bold mb-1 flex items-center gap-1">
                  <Target className="w-3.5 h-3.5 text-emerald-600" />
                  <span>มุมเป้าหมาย (°) <span className="text-rose-500">*</span></span>
                </label>
                <input
                  type="number"
                  min={1}
                  max={360}
                  value={targetAngle}
                  onChange={(e) => {
                    setTargetAngle(e.target.value);
                    if (errors.targetAngle) setErrors({ ...errors, targetAngle: undefined });
                  }}
                  className={`w-full px-3 py-2 rounded-2xl border bg-white text-xs text-center font-extrabold text-emerald-700 focus:outline-none focus:ring-2 ${
                    errors.targetAngle
                      ? 'border-rose-400 focus:ring-rose-400 bg-rose-50/30'
                      : 'border-stone-200 focus:ring-[#10B981]'
                  }`}
                />
              </div>

              <div>
                <label className="block text-slate-700 font-bold mb-1 flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5 text-emerald-600" />
                  <span>เวลาค้าง (วินาที)</span>
                </label>
                <input
                  type="number"
                  min={1}
                  max={120}
                  value={holdSeconds}
                  onChange={(e) => setHoldSeconds(e.target.value)}
                  className="w-full px-3 py-2 rounded-2xl border border-stone-200 bg-white text-xs text-center font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#10B981]"
                />
              </div>

              <div>
                <label className="block text-slate-700 font-bold mb-1 flex items-center gap-1">
                  <RotateCcw className="w-3.5 h-3.5 text-emerald-600" />
                  <span>ครั้งต่อเซ็ต (Reps)</span>
                </label>
                <input
                  type="number"
                  min={1}
                  max={100}
                  value={repsPerSet}
                  onChange={(e) => setRepsPerSet(e.target.value)}
                  className="w-full px-3 py-2 rounded-2xl border border-stone-200 bg-white text-xs text-center font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#10B981]"
                />
              </div>

              <div>
                <label className="block text-slate-700 font-bold mb-1 flex items-center gap-1">
                  <Layers className="w-3.5 h-3.5 text-emerald-600" />
                  <span>จำนวนเซ็ต (Sets)</span>
                </label>
                <input
                  type="number"
                  min={1}
                  max={20}
                  value={sets}
                  onChange={(e) => setSets(e.target.value)}
                  className="w-full px-3 py-2 rounded-2xl border border-stone-200 bg-white text-xs text-center font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#10B981]"
                />
              </div>
            </div>
            {errors.targetAngle && (
              <p className="text-[11px] text-rose-500 font-medium">{errors.targetAngle}</p>
            )}

            <div>
              <label className="block text-slate-700 font-bold mb-1 flex items-center gap-1.5">
                <Activity className="w-3.5 h-3.5 text-emerald-600" />
                <span>ข้อต่อและกล้ามเนื้อเป้าหมาย (Target Joints & Muscles)</span>
              </label>
              <input
                type="text"
                value={targetJoint}
                onChange={(e) => setTargetJoint(e.target.value)}
                placeholder="เช่น ข้อไหล่ (Shoulder), กล้ามเนื้อ Deltoid และข้อศอก"
                className="w-full px-3.5 py-2.5 rounded-2xl border border-stone-200 bg-white text-xs text-slate-800 font-medium focus:outline-none focus:ring-2 focus:ring-[#10B981]"
              />
            </div>

            <div>
              <label className="block text-slate-700 font-bold mb-1">
                คำอธิบายวิธีทำและขั้นตอนการปฏิบัติ (Instructions)
              </label>
              <textarea
                rows={3}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="ระบุท่าเริ่มต้น ท่าทางระหว่างฝึก และการหายใจ..."
                className="w-full p-3.5 rounded-2xl border border-stone-200 bg-white text-xs text-slate-800 leading-relaxed focus:outline-none focus:ring-2 focus:ring-[#10B981]"
              />
            </div>
          </div>

          {/* --------------------------------------------------------------- */}
          {/* SECTION 3: ข้อควรระวังและความปลอดภัย (Safety & Warnings)          */}
          {/* --------------------------------------------------------------- */}
          <div className="space-y-3.5 bg-rose-50/40 p-4 sm:p-5 rounded-2xl border border-rose-200/80">
            <div className="flex items-center justify-between border-b border-rose-200/60 pb-2">
              <div className="font-bold text-sm text-rose-900 flex items-center gap-2">
                <span className="w-5 h-5 rounded-full bg-rose-200 text-rose-800 text-[11px] font-bold flex items-center justify-center">
                  3
                </span>
                <span>ข้อควรระวังและความปลอดภัย (Safety & Cautions)</span>
              </div>
            </div>

            <div>
              <label className="block text-rose-900 font-bold mb-1 flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
                <span>ข้อควรระวัง (Cautions) — แสดงเป็นแถบเตือนสีแดง/ส้มในการ์ด</span>
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
        {/* 3. MODAL FOOTER                                                   */}
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
                <span>กำลังบันทึกการแก้ไข...</span>
              </>
            ) : (
              <>
                <Check className="w-4 h-4" />
                <span>บันทึกการแก้ไข</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
