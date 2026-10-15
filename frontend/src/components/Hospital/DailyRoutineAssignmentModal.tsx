import React, { useState, useEffect } from 'react';
import {
  X,
  Dumbbell,
  Clock,
  Plus,
  Trash2,
  Check,
  AlertCircle,
  Sparkles,
  Gamepad2,
  Sliders,
  Calendar,
  Layers,
  Lock,
} from 'lucide-react';
import {
  TreatmentPlan,
  PrescribedExercise,
  HospitalExercise,
  UserAccount,
} from '../../types/hospital';
import { useHospitalStore } from '../../store/hospitalStore';
import { defaultDash } from '../../utils/dashboardUtils';

export const AVAILABLE_MINIGAMES = [
  {
    id: 'minigame_quiz',
    slug: 'minigame_quiz',
    name: 'มินิเกมตอบคำถามฝึกสมองและการตอบสนอง (Interactive Quiz)',
    category: 'มินิเกม (Minigame)',
    targetJoint: 'ประสานระบบประสาทและความจำ',
    defaultReps: 5,
    defaultSets: 1,
    defaultHold: 15,
  },
  {
    id: 'minigame_arm_coordination',
    slug: 'minigame_arm_coordination',
    name: 'มินิเกมฝึกประสานการเคลื่อนไหวแขน (Bilateral Arm Coordination)',
    category: 'มินิเกม (Minigame)',
    targetJoint: 'ข้อต่อหัวไหล่และแขนสองข้าง',
    defaultReps: 10,
    defaultSets: 2,
    defaultHold: 5,
  },
  {
    id: 'minigame_balloon_catch',
    slug: 'minigame_balloon_catch',
    name: 'มินิเกมสะบัดแขนจับลูกโป่ง (Balloon Catch Game)',
    category: 'มินิเกม (Minigame)',
    targetJoint: 'ช่วงการเคลื่อนไหวของข้อไหล่ (ROM)',
    defaultReps: 12,
    defaultSets: 2,
    defaultHold: 5,
  },
];

interface DailyRoutineAssignmentModalProps {
  isOpen: boolean;
  onClose: () => void;
  patient: UserAccount | null;
  dateStr: string; // YYYY-MM-DD
  exercises: HospitalExercise[];
  existingPlan?: TreatmentPlan | null;
  canWrite?: boolean;
  onSaveRoutine: (assignedExercises: PrescribedExercise[], instructions: string) => void;
  onSuccessToast: (msg: string) => void;
}

export const DailyRoutineAssignmentModal: React.FC<DailyRoutineAssignmentModalProps> = ({
  isOpen,
  onClose,
  patient,
  dateStr,
  exercises,
  existingPlan,
  canWrite = true,
  onSaveRoutine,
  onSuccessToast,
}) => {
  const [assigned, setAssigned] = useState<PrescribedExercise[]>([]);
  const [instructions, setInstructions] = useState<string>('');
  const [selectedExerciseId, setSelectedExerciseId] = useState<string>('');
  const [repsInput, setRepsInput] = useState<number>(5);
  const [setsInput, setSetsInput] = useState<number>(1);
  const [restSecondsInput, setRestSecondsInput] = useState<number>(15);
  const [difficultyInput, setDifficultyInput] = useState<'beginner' | 'intermediate' | 'advanced'>('beginner');

  useEffect(() => {
    if (isOpen) {
      if (existingPlan && existingPlan.assignedExercises) {
        setAssigned([...existingPlan.assignedExercises]);
        setInstructions(existingPlan.clinicalNotes || '');
      } else {
        // Default starting routine with available Mini-Game
        setAssigned([
          {
            exerciseSlug: 'minigame_quiz',
            exerciseName: 'มินิเกมตอบคำถามฝึกสมองและการตอบสนอง (Interactive Quiz)',
            sets: 1,
            reps: 5,
            holdSeconds: 15,
            difficulty: 'beginner',
          },
        ]);
        setInstructions('ฝึกตอบคำถามสุขภาพผ่านการยกแขนซ้ายและขวาอย่างผ่อนคลาย');
      }
    }
  }, [isOpen, existingPlan]);

  if (!isOpen || !patient) return null;

  const handleAddExercise = () => {
    const mg = AVAILABLE_MINIGAMES.find((m) => m.id === selectedExerciseId || m.slug === selectedExerciseId);
    if (mg) {
      const newItem: PrescribedExercise = {
        exerciseSlug: mg.slug,
        exerciseName: mg.name,
        sets: setsInput,
        reps: repsInput,
        holdSeconds: restSecondsInput,
        difficulty: difficultyInput,
      };
      setAssigned((prev) => [...prev, newItem]);
      setSelectedExerciseId('');
      return;
    }

    const ex = exercises.find((e) => String(e.id) === selectedExerciseId || e.englishName === selectedExerciseId);
    if (ex) {
      alert('⚠️ ยังไม่ได้เพิ่มระบบดีเทคกายภาพ โปรดรอการพัฒนา\n\n(ในปัจจุบันระบบตรวจจับท่าทางกายภาพอยู่ระหว่างการพัฒนา กรุณาเลือกและเซ็ตได้เฉพาะมินิเกมเท่านั้น)');
      return;
    }

    alert('กรุณาเลือกมินิเกมที่ต้องการเพิ่มในตาราง');
  };

  const handleRemoveExercise = (idx: number) => {
    setAssigned((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleSave = () => {
    if (assigned.length === 0) {
      alert('กรุณาเลือกอย่างน้อย 1 กิจกรรมหรือมินิเกมสำหรับตารางประจำวันนี้');
      return;
    }
    onSaveRoutine(assigned, instructions);
    onSuccessToast(`บันทึกโปรแกรมกายภาพประจำวันที่ ${dateStr} สำหรับ ${patient.name} สำเร็จ (พร้อมซิงค์ตู้ Kiosk ทันที)`);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-[#0F2F2B]/75 backdrop-blur-sm animate-fadeIn"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl bg-white rounded-3xl shadow-2xl border border-emerald-200 overflow-hidden flex flex-col max-h-[90vh] animate-slideUp"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-cyan-100 bg-gradient-to-r from-emerald-50 via-white to-sky-50 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-[#10B981] via-[#06B6D4] to-[#2563EB] text-white flex items-center justify-center shadow-md shadow-cyan-500/25">
              <Dumbbell className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-extrabold text-base sm:text-lg text-[#0F2F2B]">
                กำหนดโปรแกรมกายภาพประจำวัน (Daily Routine Assignment)
              </h3>
              <p className="text-[11px] text-emerald-800 font-medium">
                คนไข้: <strong>{patient.name}</strong> ({patient.code}) • วันที่: <strong>{dateStr}</strong>
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
        <div className="flex-1 overflow-y-auto p-6 space-y-5 text-xs">
          {!canWrite && (
            <div className="p-3.5 rounded-2xl bg-amber-50 border border-amber-200 text-amber-900 font-bold flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0" />
              <span>สิทธิ์การใช้งาน: อ่านอย่างเดียว (Read-Only) — ไม่สามารถปรับเปลี่ยนท่าหรือจำนวนเซ็ตได้เนื่องจากไม่ใช่เคสในความรับผิดชอบหรือเคสที่ได้รับฝาก</span>
            </div>
          )}

          {/* Add Exercise Selector */}
          {canWrite && (
            <div className="p-4 rounded-2xl bg-stone-50 border border-stone-200/80 space-y-3">
              <div className="font-bold text-slate-800 text-sm flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Gamepad2 className="w-4 h-4 text-emerald-600" />
                  <span>มอบหมายกิจกรรมและมินิเกม (Mini-Game Assignment):</span>
                </div>
                <span className="px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-extrabold text-[11px] border border-emerald-300">
                  🎮 มินิเกมพร้อมใช้งาน
                </span>
              </div>

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

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="sm:col-span-2">
                <label className="block font-semibold text-slate-700 mb-1">เลือกมินิเกมหรือท่าฝึก:</label>
                <select
                  value={selectedExerciseId}
                  onChange={(e) => setSelectedExerciseId(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-white border border-slate-300 font-bold text-xs text-[#0F2F2B] outline-none focus:border-emerald-500 cursor-pointer"
                >
                  <option value="">-- กรุณาเลือกมินิเกมที่ต้องการมอบหมาย --</option>
                  <optgroup label="🎮 มินิเกมกายภาพ (Interactive Mini-Games) - พร้อมใช้งาน">
                    {AVAILABLE_MINIGAMES.map((mg) => (
                      <option key={mg.id} value={mg.id}>
                        🎮 {mg.name} ({mg.category}) — {mg.targetJoint}
                      </option>
                    ))}
                  </optgroup>
                  <optgroup label="🔒 ท่ากายภาพมาตรฐาน - อยู่ระหว่างพัฒนา (Physical Therapy Exercises)">
                    {exercises.map((ex) => (
                      <option key={ex.id} value={String(ex.id)} disabled className="text-slate-400 bg-slate-100">
                        🔒 {ex.name} ({ex.category}) — อยู่ระหว่างพัฒนา
                      </option>
                    ))}
                  </optgroup>
                </select>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">จำนวนครั้ง (Reps):</label>
                <input
                  type="number"
                  min={1}
                  max={50}
                  value={repsInput}
                  onChange={(e) => setRepsInput(Number(e.target.value))}
                  className="w-full px-3 py-1.5 rounded-xl bg-white border border-slate-300 font-bold text-xs"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">จำนวนเซ็ต (Sets):</label>
                <input
                  type="number"
                  min={1}
                  max={10}
                  value={setsInput}
                  onChange={(e) => setSetsInput(Number(e.target.value))}
                  className="w-full px-3 py-1.5 rounded-xl bg-white border border-slate-300 font-bold text-xs"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">เวลาพักระหว่างเซ็ต (วินาที):</label>
                <input
                  type="number"
                  min={5}
                  max={180}
                  value={restSecondsInput}
                  onChange={(e) => setRestSecondsInput(Number(e.target.value))}
                  className="w-full px-3 py-1.5 rounded-xl bg-white border border-slate-300 font-bold text-xs"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">ระดับความยาก:</label>
                <select
                  value={difficultyInput}
                  onChange={(e: any) => setDifficultyInput(e.target.value)}
                  className="w-full px-3 py-1.5 rounded-xl bg-white border border-slate-300 font-bold text-xs cursor-pointer"
                >
                  <option value="beginner">ระดับง่าย (Beginner)</option>
                  <option value="intermediate">ปานกลาง (Intermediate)</option>
                  <option value="advanced">ขั้นสูง (Advanced)</option>
                </select>
              </div>
            </div>

            <div className="pt-2 flex justify-end">
              <button
                type="button"
                onClick={handleAddExercise}
                className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center gap-1.5 transition active:scale-95 cursor-pointer shadow-xs"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>เพิ่มมินิเกมในตาราง</span>
              </button>
            </div>
          </div>
        )}

          {/* Assigned Exercises List */}
          <div className="space-y-2">
            <div className="flex items-center justify-between font-bold text-slate-700 text-xs">
              <span>รายการท่ากายภาพที่จะฝึกในวันนี้ ({assigned.length} ท่า):</span>
              <span className="text-emerald-700 text-[11px]">ซิงค์กับตู้ Kiosk ทันทีที่บันทึก</span>
            </div>

            {assigned.length === 0 ? (
              <div className="p-8 text-center text-slate-400 bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                ยังไม่มีท่ากายภาพในตารางประจำวันนี้ กรุณาเลือกเพิ่มท่าด้านบน
              </div>
            ) : (
              <div className="space-y-2">
                {assigned.map((item, idx) => (
                  <div
                    key={idx}
                    className="p-3 rounded-2xl bg-white border border-emerald-200 shadow-2xs flex items-center justify-between gap-3"
                  >
                    <div className="flex items-center gap-3">
                      <span className="w-6 h-6 rounded-full bg-emerald-100 text-emerald-800 font-bold text-xs flex items-center justify-center">
                        {idx + 1}
                      </span>
                      <div>
                        <div className="font-extrabold text-[#0F2F2B] text-xs">{item.exerciseName}</div>
                        <div className="text-[11px] text-slate-500 font-medium">
                          {item.reps} ครั้ง x {item.sets} เซ็ต • พัก {item.holdSeconds} วินาที • ระดับ {item.difficulty}
                        </div>
                      </div>
                    </div>

                    {canWrite && (
                      <button
                        type="button"
                        onClick={() => handleRemoveExercise(idx)}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition cursor-pointer"
                        title="ลบท่านี้"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Clinician Instructions */}
          <div className="space-y-1.5">
            <label className="block font-bold text-slate-700">
              คำแนะนำจากนักกายภาพบำบัดประจำวัน (Custom Instructions):
            </label>
            <textarea
              rows={2}
              value={instructions}
              readOnly={!canWrite}
              onChange={(e) => setInstructions(e.target.value)}
              placeholder="เช่น ทำอย่างช้าๆ สม่ำเสมอ หากมีอาการเจ็บเสียวให้หยุดพักทันที"
              className={`w-full p-3 rounded-2xl border border-slate-300 font-medium text-xs text-[#0F2F2B] outline-none ${
                canWrite ? 'bg-white focus:border-emerald-500' : 'bg-slate-100 cursor-not-allowed'
              }`}
            />
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-100 bg-slate-50 flex items-center justify-between">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl border border-slate-300 text-slate-700 font-bold hover:bg-slate-100 transition text-xs cursor-pointer"
          >
            {canWrite ? 'ยกเลิก' : 'ปิดหน้าต่าง'}
          </button>

          {canWrite && (
            <button
              type="button"
              onClick={handleSave}
              className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-[#10B981] via-[#06B6D4] to-[#2563EB] text-white font-extrabold text-xs shadow-md shadow-cyan-500/25 transition active:scale-95 cursor-pointer flex items-center gap-2"
            >
              <Check className="w-4 h-4" />
              <span>บันทึกและซิงค์ตู้ Kiosk (Save & Sync Kiosk)</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
