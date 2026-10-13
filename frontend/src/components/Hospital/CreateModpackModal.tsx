import React, { useState } from 'react';
import {
  X,
  PackagePlus,
  Plus,
  Trash2,
  Check,
  Dumbbell,
  Target,
  Sparkles,
  Layers,
  Clock,
  RotateCcw,
  AlertCircle,
} from 'lucide-react';
import { ExerciseModpack, HospitalExercise, PrescribedExercise } from '../../types/hospital';

interface CreateModpackModalProps {
  isOpen: boolean;
  onClose: () => void;
  availableExercises: HospitalExercise[];
  onSaveModpack: (modpackData: Omit<ExerciseModpack, 'id' | 'createdAt'>) => void;
  onSuccessToast: (msg: string) => void;
}

const MODPACK_ICONS = ['🦴', '🦵', '🧠', '💆', '🦾', '🏃', '⚡', '🏋️', '🧘'];

const CATEGORIES = [
  'ฟื้นฟูข้อไหล่และแขน',
  'ฟื้นฟูข้อเข่าและขา',
  'ฟื้นฟูข้อสะโพกและหลัง',
  'ฟื้นฟูข้อเท้าและขา',
  'ฟื้นฟูระบบประสาท',
];

export const CreateModpackModal: React.FC<CreateModpackModalProps> = ({
  isOpen,
  onClose,
  availableExercises,
  onSaveModpack,
  onSuccessToast,
}) => {
  const [name, setName] = useState<string>('');
  const [description, setDescription] = useState<string>('');
  const [targetJoint, setTargetJoint] = useState<string>('ข้อต่อและกล้ามเนื้อตามหลักกายภาพ');
  const [category, setCategory] = useState<string>(CATEGORIES[0]);
  const [icon, setIcon] = useState<string>('🦴');

  // Dynamic exercises list inside this modpack
  const [exercises, setExercises] = useState<PrescribedExercise[]>([
    {
      exerciseSlug: availableExercises[0]?.svgType || availableExercises[0]?.name || 'shoulder_raise',
      exerciseName: availableExercises[0]?.name || 'กางแขนยกด้านข้าง',
      sets: 3,
      reps: 10,
      holdSeconds: 3,
      difficulty: 'beginner',
    },
  ]);

  const [selectedAddSlug, setSelectedAddSlug] = useState<string>(
    availableExercises[0]?.svgType || availableExercises[0]?.name || ''
  );

  const [error, setError] = useState<string>('');

  if (!isOpen) return null;

  const handleAddExerciseToBundle = () => {
    const found = availableExercises.find(
      (e) => (e.svgType && e.svgType === selectedAddSlug) || e.name === selectedAddSlug
    ) || availableExercises[0];

    if (!found) return;

    const slug = found.svgType || found.name;
    const newPrescription: PrescribedExercise = {
      exerciseSlug: slug,
      exerciseName: found.name,
      sets: found.sets || 3,
      reps: found.repsPerSet || 10,
      holdSeconds: found.holdSeconds || 3,
      difficulty: found.difficulty === 'hard' ? 'advanced' : found.difficulty === 'medium' ? 'intermediate' : 'beginner',
    };

    setExercises((prev) => [...prev, newPrescription]);
  };

  const handleRemoveExercise = (index: number) => {
    setExercises((prev) => prev.filter((_, i) => i !== index));
  };

  const handleUpdateExercise = (index: number, field: keyof PrescribedExercise, val: any) => {
    setExercises((prev) =>
      prev.map((item, i) => (i === index ? { ...item, [field]: val } : item))
    );
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('กรุณาระบุชื่อชุดท่าฝึกกายภาพ (Modpack Name)');
      return;
    }
    if (exercises.length === 0) {
      setError('กรุณาเพิ่มท่ากายภาพในชุดอย่างน้อย 1 ท่า');
      return;
    }

    onSaveModpack({
      name: name.trim(),
      description: description.trim() || 'ชุดท่าฝึกกายภาพบำบัดฟื้นฟูกล้ามเนื้อและข้อต่อเฉพาะทาง',
      targetJoint: targetJoint.trim() || 'ข้อต่อและกล้ามเนื้อ',
      category,
      icon,
      exercises,
    });

    onSuccessToast(`สร้างชุดท่าฝึก "${name}" (${exercises.length} ท่า) สำเร็จแล้ว`);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-[#0F2F2B]/70 backdrop-blur-sm animate-fadeIn"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl bg-white rounded-[28px] sm:rounded-3xl shadow-2xl border border-emerald-200 overflow-hidden flex flex-col max-h-[92vh] animate-slideUp"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-emerald-100 bg-gradient-to-r from-emerald-50 via-white to-emerald-50/40 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-emerald-600 text-white flex items-center justify-center shadow-md shadow-emerald-600/20">
              <PackagePlus className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-extrabold text-base sm:text-lg text-[#0F2F2B] flex items-center gap-2">
                <span>สร้างชุดท่าฝึกกายภาพใหม่ (Exercise Modpack)</span>
                <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-bold">
                  Preset Bundle
                </span>
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                รวมหลายท่าทาง (5-10+ ท่า) เป็นชุดเดียวเพื่อใช้ออโต้จัดตารางฝึกให้คนไข้ได้ทันที
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-full text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} className="p-5 sm:p-6 space-y-5 overflow-y-auto flex-1 text-xs">
          {error && (
            <div className="p-3 rounded-2xl bg-rose-50 border border-rose-200 text-rose-700 flex items-center gap-2 font-bold">
              <AlertCircle className="w-4 h-4 flex-shrink-0 text-rose-500" />
              <span>{error}</span>
            </div>
          )}

          {/* 1. Modpack Profile */}
          <div className="p-4 sm:p-5 rounded-2xl bg-stone-50/80 border border-stone-200 space-y-3.5">
            <div className="font-bold text-sm text-[#0F2F2B] flex items-center gap-2">
              <span className="w-5 h-5 rounded-full bg-emerald-100 text-emerald-800 text-[11px] font-bold flex items-center justify-center">
                1
              </span>
              <span>ข้อมูลชุดท่าฝึก (Modpack Information)</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
              <div className="sm:col-span-2">
                <label className="block text-slate-700 font-bold mb-1">
                  ชื่อชุดท่าฝึก (Modpack Name) <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value);
                    if (error) setError('');
                  }}
                  placeholder="เช่น คอร์สฟื้นฟูไหล่ติดประจำวัน, คอร์สฟื้นฟูข้อเข่าเสื่อม"
                  className="w-full px-3.5 py-2.5 rounded-2xl border border-stone-200 bg-white text-xs text-slate-800 font-bold focus:outline-none focus:ring-2 focus:ring-[#10B981]"
                />
              </div>

              <div>
                <label className="block text-slate-700 font-bold mb-1">ไอคอนประจำชุด</label>
                <div className="flex items-center gap-1.5 flex-wrap">
                  {MODPACK_ICONS.map((ic) => (
                    <button
                      key={ic}
                      type="button"
                      onClick={() => setIcon(ic)}
                      className={`w-8 h-8 rounded-xl text-base flex items-center justify-center transition cursor-pointer ${
                        icon === ic
                          ? 'bg-emerald-600 text-white shadow-xs scale-105'
                          : 'bg-white border border-stone-200 hover:bg-stone-100'
                      }`}
                    >
                      {ic}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <div>
                <label className="block text-slate-700 font-bold mb-1">
                  ข้อต่อและกล้ามเนื้อเป้าหมาย (Target Joint)
                </label>
                <input
                  type="text"
                  value={targetJoint}
                  onChange={(e) => setTargetJoint(e.target.value)}
                  placeholder="เช่น ข้อไหล่และสะบัก, ข้อเข่าและกล้ามเนื้อต้นขา"
                  className="w-full px-3.5 py-2.5 rounded-2xl border border-stone-200 bg-white text-xs text-slate-800 font-semibold focus:outline-none focus:ring-2 focus:ring-[#10B981]"
                />
              </div>

              <div>
                <label className="block text-slate-700 font-bold mb-1">หมวดหมู่คลินิก</label>
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
            </div>

            <div>
              <label className="block text-slate-700 font-bold mb-1">
                คำอธิบายชุดท่าฝึก (Description)
              </label>
              <textarea
                rows={2}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="ระบุจุดเด่นหรือกลุ่มคนไข้เป้าหมาย เช่น ชุดท่าฝึกครบวงจร 5 ท่า สำหรับผู้ป่วยข้อไหล่ติด ยึดเกาะ และเอ็นหัวไหล่อักเสบเรื้อรัง"
                className="w-full p-3 rounded-2xl border border-stone-200 bg-white text-xs text-slate-800 leading-relaxed focus:outline-none focus:ring-2 focus:ring-[#10B981]"
              />
            </div>
          </div>

          {/* 2. Exercises Builder inside Modpack */}
          <div className="p-4 sm:p-5 rounded-2xl bg-emerald-50/40 border border-emerald-200 space-y-4">
            <div className="flex items-center justify-between border-b border-emerald-200/60 pb-2">
              <div className="font-bold text-sm text-[#0F2F2B] flex items-center gap-2">
                <span className="w-5 h-5 rounded-full bg-emerald-200 text-emerald-900 text-[11px] font-bold flex items-center justify-center">
                  2
                </span>
                <span>รายการท่าฝึกในชุด (รวม {exercises.length} ท่า)</span>
              </div>
              <span className="text-[11px] text-emerald-800 font-bold">
                สามารถกด + เพื่อเพิ่มท่าได้ไม่จำกัด
              </span>
            </div>

            {/* Quick Add Bar */}
            <div className="p-3 bg-white rounded-2xl border border-emerald-200 shadow-2xs flex flex-col sm:flex-row sm:items-center gap-2.5">
              <div className="flex-1">
                <label className="block text-slate-500 font-bold text-[10px] mb-1">
                  เลือกท่าทางจากคลังกลาง (Central Exercise Library)
                </label>
                <select
                  value={selectedAddSlug}
                  onChange={(e) => setSelectedAddSlug(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-stone-200 text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#10B981] cursor-pointer"
                >
                  {availableExercises.map((ex) => (
                    <option key={ex.id} value={ex.svgType || ex.name}>
                      {ex.name} ({ex.category} • เป้าหมาย {ex.targetAngle}°)
                    </option>
                  ))}
                </select>
              </div>

              <button
                type="button"
                onClick={handleAddExerciseToBundle}
                className="px-4 py-2 sm:mt-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white font-bold text-xs transition flex items-center justify-center gap-1.5 cursor-pointer shadow-xs whitespace-nowrap"
              >
                <Plus className="w-4 h-4" />
                <span>+ เพิ่มท่าเข้าชุด</span>
              </button>
            </div>

            {/* Exercises List Cards */}
            <div className="space-y-2.5 max-h-[300px] overflow-y-auto pr-1">
              {exercises.length === 0 ? (
                <div className="p-6 bg-white rounded-2xl text-center text-slate-400 font-medium border border-dashed border-emerald-200">
                  ยังไม่มีท่าทางในชุดนี้ กรุณากดปุ่ม "+ เพิ่มท่าเข้าชุด" ด้านบน
                </div>
              ) : (
                exercises.map((item, idx) => (
                  <div
                    key={`${item.exerciseSlug}-${idx}`}
                    className="p-3 bg-white rounded-2xl border border-emerald-100 shadow-2xs flex items-center justify-between gap-3 hover:border-emerald-300 transition"
                  >
                    <div className="flex items-center gap-3">
                      <span className="w-6 h-6 rounded-full bg-emerald-100 text-emerald-800 text-xs font-black flex items-center justify-center flex-shrink-0">
                        {idx + 1}
                      </span>
                      <div>
                        <div className="font-extrabold text-slate-900 text-xs">
                          {item.exerciseName}
                        </div>
                        <div className="text-[10px] font-mono text-slate-400">
                          slug: {item.exerciseSlug}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      {/* Sets */}
                      <div className="flex items-center gap-1">
                        <span className="text-[11px] text-slate-500 font-bold">เซ็ต:</span>
                        <input
                          type="number"
                          min={1}
                          max={20}
                          value={item.sets}
                          onChange={(e) =>
                            handleUpdateExercise(idx, 'sets', Math.max(1, Number(e.target.value) || 1))
                          }
                          className="w-12 px-1.5 py-1 text-center font-bold text-xs border border-stone-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-emerald-500"
                        />
                      </div>

                      {/* Reps */}
                      <div className="flex items-center gap-1">
                        <span className="text-[11px] text-slate-500 font-bold">ครั้ง:</span>
                        <input
                          type="number"
                          min={1}
                          max={100}
                          value={item.reps}
                          onChange={(e) =>
                            handleUpdateExercise(idx, 'reps', Math.max(1, Number(e.target.value) || 1))
                          }
                          className="w-12 px-1.5 py-1 text-center font-bold text-xs border border-stone-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-emerald-500"
                        />
                      </div>

                      {/* Hold Seconds */}
                      <div className="flex items-center gap-1">
                        <span className="text-[11px] text-slate-500 font-bold">ค้าง:</span>
                        <input
                          type="number"
                          min={1}
                          max={60}
                          value={item.holdSeconds}
                          onChange={(e) =>
                            handleUpdateExercise(idx, 'holdSeconds', Math.max(1, Number(e.target.value) || 1))
                          }
                          className="w-12 px-1.5 py-1 text-center font-bold text-xs border border-stone-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-emerald-500"
                        />
                        <span className="text-[10px] text-slate-400">วิ</span>
                      </div>

                      {/* Delete */}
                      <button
                        type="button"
                        onClick={() => handleRemoveExercise(idx)}
                        className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition cursor-pointer"
                        title="ลบท่านี้ออกจากชุด"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </form>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-emerald-100 bg-stone-50/50 flex items-center justify-end gap-3 flex-shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2.5 rounded-full border border-stone-300 text-slate-700 font-bold text-xs hover:bg-stone-100 transition cursor-pointer"
          >
            ยกเลิก
          </button>

          <button
            type="button"
            onClick={handleSubmit}
            className="px-6 py-2.5 rounded-full bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white font-bold text-xs shadow-md shadow-emerald-600/20 transition flex items-center gap-2 cursor-pointer"
          >
            <Check className="w-4 h-4" />
            <span>บันทึกชุดท่าฝึก (Save Modpack)</span>
          </button>
        </div>
      </div>
    </div>
  );
};
