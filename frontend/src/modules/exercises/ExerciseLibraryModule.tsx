import React, { useState, useEffect } from 'react';
import { Dumbbell, Gamepad2, Plus, Edit, Trash2, AlertTriangle, Layers, PlayCircle, Lock } from 'lucide-react';
import { Card } from '../../components/common/Card';
import { Button } from '../../components/common/Button';
import { Badge } from '../../components/common/Badge';
import { Modal } from '../../components/common/Modal';
import { Exercise, ExerciseCategory } from '../../types/schema';
import { api } from '../../lib/api';
import { formatEmpty } from '../../i18n';

export interface ExerciseLibraryModuleProps {
  actorRole: 'admin' | 'pt';
  currentUserId: string;
  currentUserName: string;
}

export const ExerciseLibraryModule: React.FC<ExerciseLibraryModuleProps> = ({
  actorRole,
  currentUserId,
  currentUserName,
}) => {
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [activeTab, setActiveTab] = useState<'single' | 'preset'>('single');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');

  // Add/Edit modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingExercise, setEditingExercise] = useState<Exercise | null>(null);
  const [form, setForm] = useState<{
    id: string;
    name_th: string;
    name_en: string;
    category: ExerciseCategory;
    type: 'single' | 'preset';
    default_reps: number;
    default_sets: number;
    default_rest_seconds: number;
    instructions: string;
    benefits: string;
    items?: any[];
  }>({
    id: '',
    name_th: '',
    name_en: '',
    category: 'Minigame',
    type: 'single',
    default_reps: 10,
    default_sets: 3,
    default_rest_seconds: 30,
    instructions: '',
    benefits: '',
  });

  const loadExercises = async () => {
    setIsLoading(true);
    try {
      const res = await api.exercises.list(selectedCategory);
      setExercises(res.exercises || []);
    } catch (err: any) {
      console.error('Failed to load exercises:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadExercises();
  }, [selectedCategory]);

  const handleOpenAdd = () => {
    setEditingExercise(null);
    setForm({
      id: '',
      name_th: '',
      name_en: '',
      category: 'Minigame',
      type: activeTab,
      default_reps: 10,
      default_sets: 3,
      default_rest_seconds: 30,
      instructions: '',
      benefits: '',
    });
    setIsModalOpen(true);
  };

  const handleOpenEdit = (ex: Exercise) => {
    setEditingExercise(ex);
    setForm({
      id: ex.id,
      name_th: ex.name_th,
      name_en: ex.name_en,
      category: ex.category,
      type: ex.type,
      default_reps: ex.default_reps,
      default_sets: ex.default_sets,
      default_rest_seconds: ex.default_rest_seconds,
      instructions: ex.instructions || '',
      benefits: ex.benefits || '',
    });
    setIsModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingExercise) {
        await api.exercises.update(editingExercise.id, form);
        alert('แก้ไขท่าฝึกสำเร็จ');
      } else {
        await api.exercises.create(form);
        alert('เพิ่มท่าฝึกใหม่สำเร็จ');
      }
      setIsModalOpen(false);
      loadExercises();
    } catch (err: any) {
      alert('เกิดข้อผิดพลาด: ' + err?.message);
    }
  };

  const handleDelete = async (ex: Exercise) => {
    if (!confirm(`ต้องการลบรายการ ${ex.name_th} (${ex.id}) หรือไม่?`)) return;
    try {
      await api.exercises.delete(ex.id);
      alert('ลบรายการสำเร็จ');
      loadExercises();
    } catch (err: any) {
      alert('เกิดข้อผิดพลาด: ' + err?.message);
    }
  };

  const filteredList = exercises.filter((ex) => ex.type === activeTab);

  const categories = [
    { id: 'all', label: 'ทั้งหมด' },
    { id: 'Minigame', label: '🎮 มินิเกม (Playable)' },
    { id: 'Shoulder', label: 'หัวไหล่ (Shoulder)' },
    { id: 'Arm', label: 'แขนและข้อศอก (Arm)' },
    { id: 'Leg', label: 'ขาและข้อเข่า (Leg)' },
    { id: 'Neck', label: 'คอและสะบัก (Neck)' },
    { id: 'Back', label: 'หลัง (Back)' },
  ];

  return (
    <div className="space-y-6">
      <Card
        title={
          <div className="flex items-center gap-2.5">
            <Dumbbell className="w-5 h-5 text-indigo-400" />
            <span>โมดูลที่ 5: คลังท่ากายภาพและชุดโปรแกรม (Exercise & Preset Library)</span>
          </div>
        }
        subtitle="คลังแบบฝึกหัด Single Exercises และชุดโปรแกรมสำเร็จรูป Preset Packages สำหรับจัดตารางฝึก"
        action={
          <Button variant="primary" onClick={handleOpenAdd} leftIcon={<Plus className="w-4 h-4" />}>
            + เพิ่มท่าฝึก / แพ็กเกจใหม่
          </Button>
        }
      >
        {/* Under development notice for pose exercises */}
        <div className="mb-6 p-4 rounded-2xl bg-amber-950/40 border border-amber-800/60 flex items-center gap-3 text-xs text-amber-300">
          <AlertTriangle className="w-5 h-5 shrink-0 text-amber-400" />
          <span>
            <strong>ข้อกำหนดระบบ (FEATURE_PT_POSE_EXERCISES = false):</strong> ขณะนี้ระบบเปิดให้ใช้งานและจัดตารางได้เฉพาะ
            <span className="font-bold underline ml-1">มินิเกม (Minigames)</span> เท่านั้น
            ท่ากายภาพที่มีการตรวจจับ Pose Tracking เต็มรูปแบบจะแสดงสถานะ "อยู่ระหว่างพัฒนา" และยังไม่สามารถจัดโปรแกรมได้
          </span>
        </div>

        {/* Tabs & Category Filter */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-slate-800 pb-4 mb-6">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setActiveTab('single')}
              className={`px-4 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 transition-all ${
                activeTab === 'single'
                  ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                  : 'bg-slate-950 text-slate-400 hover:text-white'
              }`}
            >
              <Dumbbell className="w-3.5 h-3.5" />
              <span>ท่าฝึกเดี่ยว (Single Exercises)</span>
            </button>
            <button
              onClick={() => setActiveTab('preset')}
              className={`px-4 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 transition-all ${
                activeTab === 'preset'
                  ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                  : 'bg-slate-950 text-slate-400 hover:text-white'
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              <span>ชุดโปรแกรมสำเร็จรูป (Preset Packages)</span>
            </button>
          </div>

          <div className="flex items-center gap-1.5 overflow-x-auto w-full sm:w-auto">
            {categories.map((c) => (
              <button
                key={c.id}
                onClick={() => setSelectedCategory(c.id)}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
                  selectedCategory === c.id
                    ? 'bg-slate-800 text-white border border-slate-700'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {c.label}
              </button>
            ))}
          </div>
        </div>

        {/* Exercise Grid */}
        {isLoading ? (
          <div className="py-12 text-center text-slate-400 text-xs">กำลังโหลดคลังท่ากายภาพ...</div>
        ) : filteredList.length === 0 ? (
          <div className="py-12 text-center text-slate-500 text-xs">ไม่พบรายการท่าฝึกในหมวดหมู่นี้</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {filteredList.map((ex) => {
              const isPoseGated = ex.category !== 'Minigame';
              const canEditOrDelete = actorRole === 'admin' || ex.created_by === currentUserId;

              return (
                <div
                  key={ex.id}
                  className={`rounded-2xl border transition-all duration-200 overflow-hidden flex flex-col justify-between ${
                    isPoseGated
                      ? 'bg-slate-950/60 border-slate-800/80 opacity-80'
                      : 'bg-slate-900 border-slate-800 hover:border-slate-700 shadow-xl'
                  }`}
                >
                  <div>
                    {/* Media Thumbnail */}
                    <div className="relative aspect-video bg-slate-950 flex items-center justify-center border-b border-slate-800 overflow-hidden">
                      {ex.media_path ? (
                        <img
                          src={ex.media_path}
                          alt={ex.name_th}
                          className="w-full h-full object-cover"
                          onError={(e) => {
                            (e.target as HTMLElement).style.display = 'none';
                          }}
                        />
                      ) : null}

                      <div className="absolute inset-0 flex items-center justify-center bg-black/40">
                        {ex.category === 'Minigame' ? (
                          <Gamepad2 className="w-10 h-10 text-indigo-400" />
                        ) : (
                          <Dumbbell className="w-10 h-10 text-slate-500" />
                        )}
                      </div>

                      {/* Top Badges */}
                      <div className="absolute top-2.5 left-2.5 flex items-center gap-1.5">
                        <span className="font-mono text-[10px] font-bold text-white bg-slate-900/90 px-2 py-0.5 rounded-md border border-slate-700">
                          {ex.id}
                        </span>
                        <Badge variant={ex.category === 'Minigame' ? 'minigame' : 'pose'}>
                          {ex.category}
                        </Badge>
                      </div>

                      {isPoseGated && (
                        <div className="absolute bottom-2.5 left-2.5 right-2.5 bg-amber-950/90 border border-amber-700/80 rounded-lg px-2 py-1 text-[11px] text-amber-300 flex items-center gap-1.5 justify-center font-medium backdrop-blur-sm">
                          <Lock className="w-3 h-3" />
                          <span>อยู่ระหว่างพัฒนา (Pose Tracking)</span>
                        </div>
                      )}
                    </div>

                    {/* Card Content */}
                    <div className="p-4 space-y-2.5">
                      <div>
                        <h4 className="text-sm font-bold text-white flex items-center justify-between">
                          <span>{ex.name_th}</span>
                        </h4>
                        <p className="text-xs text-slate-400 font-medium">{ex.name_en}</p>
                      </div>

                      <div className="flex items-center gap-3 text-xs text-slate-400 font-mono">
                        <span>{ex.default_reps} ครั้ง</span>
                        <span>•</span>
                        <span>{ex.default_sets} เซ็ต</span>
                        <span>•</span>
                        <span>พัก {ex.default_rest_seconds}s</span>
                      </div>

                      {ex.instructions && (
                        <p className="text-xs text-slate-300 line-clamp-2 leading-relaxed">
                          {ex.instructions}
                        </p>
                      )}

                      {/* Preset items breakdown */}
                      {ex.type === 'preset' && ex.preset_items && (
                        <div className="pt-2 border-t border-slate-800 space-y-1">
                          <span className="text-[10px] uppercase font-semibold text-slate-400">
                            ท่าฝึกในแพ็กเกจ ({ex.preset_items.length} รายการ):
                          </span>
                          <div className="space-y-1">
                            {ex.preset_items.map((pi, idx) => (
                              <div key={idx} className="text-xs text-indigo-300 flex items-center gap-1.5">
                                <span>• {pi.exercise_name_th || pi.exercise_id}</span>
                                <span className="text-[10px] text-slate-500">({pi.reps}x{pi.sets})</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Card Footer with Creator Attribution & Actions */}
                  <div className="px-4 py-3 bg-slate-950/60 border-t border-slate-800 flex items-center justify-between text-xs">
                    <span className="text-slate-500 text-[11px]">
                      สร้างโดย: <span className="text-slate-300 font-medium">{ex.created_by_name || ex.created_by}</span>
                    </span>

                    <div className="flex items-center gap-1">
                      {canEditOrDelete ? (
                        <>
                          <Button variant="ghost" size="sm" onClick={() => handleOpenEdit(ex)} title="แก้ไข">
                            <Edit className="w-3.5 h-3.5" />
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => handleDelete(ex)} title="ลบ">
                            <Trash2 className="w-3.5 h-3.5 text-rose-400" />
                          </Button>
                        </>
                      ) : (
                        <span className="text-[10px] text-slate-600 italic">Hospital Standard</span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {/* Add / Edit Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        size="lg"
        title={editingExercise ? `แก้ไขท่าฝึก (${editingExercise.id})` : 'เพิ่มท่าฝึก / แพ็กเกจใหม่'}
        subtitle={`ผู้สร้าง: ${currentUserName} (${actorRole.toUpperCase()})`}
      >
        <form onSubmit={handleSave} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-slate-300 font-medium">ชื่อภาษาไทย *</label>
              <input
                type="text"
                value={form.name_th}
                onChange={(e) => setForm({ ...form, name_th: e.target.value })}
                required
                className="mt-1 w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white"
              />
            </div>
            <div>
              <label className="text-xs text-slate-300 font-medium">ชื่อภาษาอังกฤษ *</label>
              <input
                type="text"
                value={form.name_en}
                onChange={(e) => setForm({ ...form, name_en: e.target.value })}
                required
                className="mt-1 w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-slate-300 font-medium">หมวดหมู่ (Category)</label>
              <select
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value as any })}
                className="mt-1 w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white"
              >
                <option value="Minigame">🎮 Minigame (มินิเกม)</option>
                <option value="Shoulder">Shoulder (หัวไหล่)</option>
                <option value="Arm">Arm (แขนและข้อศอก)</option>
                <option value="Leg">Leg (ขาและข้อเข่า)</option>
                <option value="Neck">Neck (คอและสะบัก)</option>
                <option value="Back">Back (หลัง)</option>
              </select>
            </div>

            <div>
              <label className="text-xs text-slate-300 font-medium">ประเภทรายการ</label>
              <div className="flex items-center gap-4 mt-2.5">
                <label className="flex items-center gap-1.5 text-xs text-slate-300 cursor-pointer">
                  <input
                    type="radio"
                    name="type"
                    value="single"
                    checked={form.type === 'single'}
                    onChange={() => setForm({ ...form, type: 'single' })}
                  />
                  <span>ท่าเดี่ยว (Single)</span>
                </label>
                <label className="flex items-center gap-1.5 text-xs text-slate-300 cursor-pointer">
                  <input
                    type="radio"
                    name="type"
                    value="preset"
                    checked={form.type === 'preset'}
                    onChange={() => setForm({ ...form, type: 'preset' })}
                  />
                  <span>แพ็กเกจ (Preset)</span>
                </label>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-xs text-slate-300 font-medium">จำนวนครั้งเริ่มต้น (Reps)</label>
              <input
                type="number"
                value={form.default_reps}
                onChange={(e) => setForm({ ...form, default_reps: parseInt(e.target.value, 10) || 10 })}
                className="mt-1 w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white"
              />
            </div>
            <div>
              <label className="text-xs text-slate-300 font-medium">จำนวนเซ็ตเริ่มต้น (Sets)</label>
              <input
                type="number"
                value={form.default_sets}
                onChange={(e) => setForm({ ...form, default_sets: parseInt(e.target.value, 10) || 3 })}
                className="mt-1 w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white"
              />
            </div>
            <div>
              <label className="text-xs text-slate-300 font-medium">เวลาพัก (วินาที)</label>
              <input
                type="number"
                value={form.default_rest_seconds}
                onChange={(e) => setForm({ ...form, default_rest_seconds: parseInt(e.target.value, 10) || 30 })}
                className="mt-1 w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white"
              />
            </div>
          </div>

          <div>
            <label className="text-xs text-slate-300 font-medium">วิธีทำ / คำแนะนำ (Instructions)</label>
            <textarea
              rows={2}
              value={form.instructions}
              onChange={(e) => setForm({ ...form, instructions: e.target.value })}
              className="mt-1 w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white"
            />
          </div>

          <div>
            <label className="text-xs text-slate-300 font-medium">ประโยชน์ทางการฟื้นฟู (Benefits)</label>
            <textarea
              rows={2}
              value={form.benefits}
              onChange={(e) => setForm({ ...form, benefits: e.target.value })}
              className="mt-1 w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white"
            />
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-slate-800">
            <Button variant="ghost" type="button" onClick={() => setIsModalOpen(false)}>
              ยกเลิก
            </Button>
            <Button variant="primary" type="submit">
              บันทึกข้อมูล
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
