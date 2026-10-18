import React, { useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import {
  Gamepad2,
  Plus,
  Search,
  Pencil,
  Trash2,
  Check,
  X,
  Sparkles,
  HelpCircle,
  Brain,
  Filter,
} from 'lucide-react';
import {
  MiniGameQuestion,
  getAllMiniGameQuestions,
  saveMiniGameQuestion,
  deleteMiniGameQuestion,
} from '../../data/miniGameQuestions';

interface MiniGameQuestionsManagerProps {
  onShowToast: (msg: string) => void;
}

const CATEGORY_LABELS: Record<string, { label: string; icon: string; color: string }> = {
  all: { label: 'ทั้งหมด', icon: '✨', color: 'border-slate-200' },
  food: { label: 'อาหาร & ผลไม้', icon: '🍎', color: 'border-amber-200 bg-amber-50 text-amber-800' },
  objects: { label: 'สิ่งของเครื่องใช้', icon: '🥄', color: 'border-blue-200 bg-blue-50 text-blue-800' },
  animals: { label: 'สัตว์', icon: '🐶', color: 'border-emerald-200 bg-emerald-50 text-emerald-800' },
  counting: { label: 'การนับจำนวน', icon: '🔢', color: 'border-indigo-200 bg-indigo-50 text-indigo-800' },
  daily: { label: 'ชีวิตประจำวัน', icon: '⏰', color: 'border-teal-200 bg-teal-50 text-teal-800' },
  colors_shapes: { label: 'สีและรูปทรง', icon: '🎨', color: 'border-purple-200 bg-purple-50 text-purple-800' },
  positions: { label: 'ทิศทาง & ตำแหน่ง', icon: '📍', color: 'border-rose-200 bg-rose-50 text-rose-800' },
};

export const MiniGameQuestionsManager: React.FC<MiniGameQuestionsManagerProps> = ({ onShowToast }) => {
  const [questions, setQuestions] = useState<MiniGameQuestion[]>(() => getAllMiniGameQuestions());
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [editingQuestion, setEditingQuestion] = useState<MiniGameQuestion | null>(null);

  // Form State
  const [subject, setSubject] = useState<string>('');
  const [questionText, setQuestionText] = useState<string>('');
  const [correctAnswer, setCorrectAnswer] = useState<'yes' | 'no'>('yes');
  const [emoji, setEmoji] = useState<string>('⭐');
  const [category, setCategory] = useState<MiniGameQuestion['category']>('food');
  const [explanation, setExplanation] = useState<string>('');

  // Filtered Questions
  const filteredQuestions = useMemo(() => {
    return questions.filter((q) => {
      const matchCat = selectedCategory === 'all' || q.category === selectedCategory;
      const matchSearch =
        searchQuery.trim() === '' ||
        q.question.toLowerCase().includes(searchQuery.toLowerCase()) ||
        q.subject.toLowerCase().includes(searchQuery.toLowerCase()) ||
        q.explanation.toLowerCase().includes(searchQuery.toLowerCase());
      return matchCat && matchSearch;
    });
  }, [questions, selectedCategory, searchQuery]);

  // Open modal for Create
  const handleOpenCreate = () => {
    setEditingQuestion(null);
    setSubject('');
    setQuestionText('');
    setCorrectAnswer('yes');
    setEmoji('🍎');
    setCategory('food');
    setExplanation('');
    setIsModalOpen(true);
  };

  // Open modal for Edit
  const handleOpenEdit = (q: MiniGameQuestion) => {
    setEditingQuestion(q);
    setSubject(q.subject);
    setQuestionText(q.question);
    setCorrectAnswer(q.correctAnswer);
    setEmoji(q.emoji);
    setCategory(q.category);
    setExplanation(q.explanation);
    setIsModalOpen(true);
  };

  // Handle Save
  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!questionText.trim()) {
      alert('กรุณากรอกโจทย์คำถาม');
      return;
    }

    const newQuestion: MiniGameQuestion = {
      id: editingQuestion ? editingQuestion.id : Date.now(),
      subject: subject.trim() || 'คำถามทั่วไป',
      question: questionText.trim(),
      correctAnswer,
      emoji: emoji.trim() || '⭐',
      category,
      explanation: explanation.trim() || (correctAnswer === 'yes' ? 'คำตอบที่ถูกต้องคือ ใช่' : 'คำตอบที่ถูกต้องคือ ไม่ใช่'),
    };

    const updated = saveMiniGameQuestion(newQuestion);
    setQuestions(updated);
    setIsModalOpen(false);
    onShowToast(editingQuestion ? '✅ อัปเดตโจทย์คำถามเรียบร้อยแล้ว' : '✅ เพิ่มโจทย์คำถามใหม่ลงในคลังสำเร็จ');
  };

  // Handle Delete
  const handleDelete = (id: number, title: string) => {
    if (confirm(`คุณต้องการลบโจทย์ "${title}" ใช่หรือไม่?`)) {
      const updated = deleteMiniGameQuestion(id);
      setQuestions(updated);
      onShowToast('ลบโจทย์คำถามเรียบร้อยแล้ว');
    }
  };

  return (
    <div className="space-y-6 animate-fadeIn text-left">
      {/* Category Pills & Action Controls */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        {/* Category Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs">
          {Object.entries(CATEGORY_LABELS).map(([key, info]) => {
            const count = key === 'all' ? questions.length : questions.filter((q) => q.category === key).length;
            const isSelected = selectedCategory === key;
            return (
              <button
                key={key}
                type="button"
                onClick={() => setSelectedCategory(key)}
                className={`px-3.5 py-1.5 rounded-full font-bold transition whitespace-nowrap cursor-pointer flex items-center gap-1.5 ${
                  isSelected
                    ? 'bg-[#10B981] text-white shadow-sm'
                    : 'bg-white border border-emerald-200 text-slate-600 hover:text-emerald-800'
                }`}
              >
                <span>{info.icon}</span>
                <span>{info.label}</span>
                <span
                  className={`text-[10px] px-1.5 py-0.2 rounded-full ${
                    isSelected ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-500'
                  }`}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        {/* Right Search & Add button */}
        <div className="flex items-center gap-3 flex-shrink-0">
          <div className="w-56 relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="ค้นหาโจทย์, วัตถุ..."
              className="w-full pl-9 pr-3 py-2 rounded-full bg-white border border-emerald-200 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-[#10B981]"
            />
          </div>

          <button
            type="button"
            onClick={handleOpenCreate}
            className="px-4 py-2 rounded-full bg-gradient-to-r from-[#10B981] via-[#06B6D4] to-[#2563EB] hover:opacity-95 text-white text-xs font-bold shadow-md shadow-cyan-500/25 transition flex items-center gap-2 cursor-pointer whitespace-nowrap active:scale-95"
          >
            <Plus className="w-4 h-4" />
            <span>+ เพิ่มโจทย์ใหม่</span>
          </button>
        </div>
      </div>

      {/* Questions Cards Grid */}
      {filteredQuestions.length === 0 ? (
        <div className="bg-white rounded-3xl p-12 text-center border border-emerald-100 shadow-sm space-y-4">
          <div className="w-16 h-16 rounded-full bg-purple-50 text-purple-600 mx-auto flex items-center justify-center">
            <Gamepad2 className="w-8 h-8" />
          </div>
          <div>
            <h4 className="font-bold text-base text-[#0F2F2B]">ไม่พบโจทย์คำถามที่ตรงกับเงื่อนไข</h4>
            <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
              ลองเปลี่ยนคำค้นหา หรือเลือกหมวดหมู่อื่น หรือกดปุ่มเพิ่มโจทย์คำถามใหม่ลงในคลัง
            </p>
          </div>
          <div className="flex items-center justify-center gap-2 pt-2">
            <button
              type="button"
              onClick={() => {
                setSearchQuery('');
                setSelectedCategory('all');
              }}
              className="px-4 py-2 rounded-full border border-emerald-200 bg-emerald-50 text-emerald-800 text-xs font-bold hover:bg-emerald-100 transition cursor-pointer"
            >
              ล้างตัวกรองทั้งหมด
            </button>
            <button
              type="button"
              onClick={handleOpenCreate}
              className="px-4 py-2 rounded-full bg-[#10B981] text-white text-xs font-bold hover:bg-emerald-600 transition flex items-center gap-1.5 cursor-pointer shadow-sm"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>เพิ่มโจทย์ข้อแรก</span>
            </button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
          {filteredQuestions.map((q) => {
            const catInfo = CATEGORY_LABELS[q.category] || CATEGORY_LABELS.all;
            return (
              <div
                key={q.id}
                className="bg-white rounded-3xl p-5 border border-emerald-100 hover:border-emerald-300 shadow-sm space-y-3.5 transition flex flex-col justify-between group"
              >
                <div className="space-y-3">
                  {/* Top Row: Emoji Icon, Subject & Category Badge */}
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2.5">
                      <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-purple-50 to-emerald-50 border border-slate-100 flex items-center justify-center text-2xl shadow-2xs">
                        {q.emoji}
                      </div>
                      <div>
                        <span className="font-extrabold text-xs text-slate-900 block">{q.subject}</span>
                        <span className="text-[10px] text-slate-400 font-semibold">ข้อที่ #{q.id}</span>
                      </div>
                    </div>

                    <span className={`text-[10px] font-extrabold px-2.5 py-0.5 rounded-full border ${catInfo.color}`}>
                      {catInfo.icon} {catInfo.label}
                    </span>
                  </div>

                  {/* Question Text */}
                  <div className="bg-slate-50/80 rounded-2xl p-3 border border-slate-100">
                    <p className="text-sm font-extrabold text-[#0B2B2B] leading-snug">
                      "{q.question}"
                    </p>
                  </div>

                  {/* Correct Answer Badge */}
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold text-slate-500">คำตอบที่ถูกต้อง:</span>
                    {q.correctAnswer === 'yes' ? (
                      <span className="px-3 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-300 font-black text-xs flex items-center gap-1.5 shadow-2xs">
                        <Check className="w-3.5 h-3.5 stroke-[3]" />
                        <span>ใช่ (ยกแขนขวา)</span>
                      </span>
                    ) : (
                      <span className="px-3 py-1 rounded-full bg-rose-50 text-rose-700 border border-rose-300 font-black text-xs flex items-center gap-1.5 shadow-2xs">
                        <X className="w-3.5 h-3.5 stroke-[3]" />
                        <span>ไม่ใช่ (ยกแขนซ้าย)</span>
                      </span>
                    )}
                  </div>

                  {/* Explanation */}
                  <div className="text-[11px] text-slate-500 bg-amber-50/40 border border-amber-100/60 rounded-xl p-2 leading-relaxed">
                    <span className="font-bold text-amber-900">💡 คำอธิบาย: </span>
                    <span>{q.explanation}</span>
                  </div>
                </div>

                {/* Footer Actions */}
                <div className="pt-2 border-t border-slate-100 flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => handleOpenEdit(q)}
                    className="px-3 py-1.5 rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-100 font-bold text-xs flex items-center gap-1 transition cursor-pointer"
                  >
                    <Pencil className="w-3 h-3 text-slate-500" />
                    <span>แก้ไข</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(q.id, q.question)}
                    className="px-3 py-1.5 rounded-xl border border-rose-200 text-rose-600 hover:bg-rose-50 font-bold text-xs flex items-center gap-1 transition cursor-pointer"
                  >
                    <Trash2 className="w-3 h-3 text-rose-500" />
                    <span>ลบ</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* =================================================================== */}
      {/* MODAL: ADD / EDIT QUESTION                                          */}
      {/* =================================================================== */}
      {isModalOpen && typeof document !== 'undefined' && createPortal(
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-4 bg-[#0F2F2B]/75 backdrop-blur-sm animate-fadeIn"
          onClick={() => setIsModalOpen(false)}
        >
          <div
            className="w-full max-w-lg bg-white rounded-[32px] shadow-2xl border border-emerald-100 overflow-hidden animate-scaleIn text-left my-auto max-h-[92vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="p-5 sm:p-6 border-b border-slate-100 flex items-center justify-between flex-shrink-0 bg-gradient-to-r from-emerald-50/60 via-white to-teal-50/40">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-purple-500 to-indigo-600 text-white flex items-center justify-center shadow-md shadow-purple-500/20">
                  <Gamepad2 className="w-5 h-5 stroke-[2.2]" />
                </div>
                <div>
                  <h3 className="text-lg font-black text-[#0B2B2B]">
                    {editingQuestion ? 'แก้ไขโจทย์คำถามมินิเกม' : 'เพิ่มโจทย์คำถามใหม่'}
                  </h3>
                  <p className="text-xs text-slate-500">
                    โจทย์จะถูกส่งไปสุ่มแสดงในมินิเกมกายภาพฝึกสมองที่ตู้ Kiosk ทันที
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="w-8 h-8 rounded-full text-slate-400 hover:text-slate-600 hover:bg-slate-100 flex items-center justify-center transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Form Body */}
            <form onSubmit={handleSave} className="p-5 sm:p-6 space-y-4 overflow-y-auto flex-1 custom-scrollbar">
              <div className="grid grid-cols-3 gap-3">
                {/* Emoji */}
                <div className="col-span-1">
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    อิโมจิรูปภาพ
                  </label>
                  <input
                    type="text"
                    value={emoji}
                    onChange={(e) => setEmoji(e.target.value)}
                    placeholder="🍌"
                    className="w-full text-center text-2xl py-2 px-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-[#10B981]"
                    required
                  />
                </div>

                {/* Subject */}
                <div className="col-span-2">
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    ชื่อวัตถุ / เรื่อง (Subject)
                  </label>
                  <input
                    type="text"
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    placeholder="เช่น กล้วย, สุนัข, ช้อน"
                    className="w-full py-2 px-3 rounded-xl border border-slate-200 text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#10B981]"
                    required
                  />
                </div>
              </div>

              {/* Question Text */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  โจทย์คำถาม (สำหรับคนไข้ตอบ ใช่ / ไม่ใช่)
                </label>
                <input
                  type="text"
                  value={questionText}
                  onChange={(e) => setQuestionText(e.target.value)}
                  placeholder="เช่น กล้วยเป็นผลไม้ไหม? หรือ ในภาพคือช้อนใช่หรือไม่?"
                  className="w-full py-2.5 px-3.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#10B981]"
                  required
                />
              </div>

              {/* Correct Answer Selection */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  คำตอบที่ถูกต้อง (Correct Answer)
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setCorrectAnswer('yes')}
                    className={`py-2.5 px-3 rounded-2xl border-2 font-black text-xs flex items-center justify-center gap-2 transition cursor-pointer ${
                      correctAnswer === 'yes'
                        ? 'border-emerald-500 bg-emerald-50 text-emerald-800 ring-2 ring-emerald-200'
                        : 'border-slate-200 hover:border-slate-300 text-slate-700'
                    }`}
                  >
                    <Check className="w-4 h-4 text-emerald-600 stroke-[3]" />
                    <span>ใช่ (ยกแขนขวา)</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setCorrectAnswer('no')}
                    className={`py-2.5 px-3 rounded-2xl border-2 font-black text-xs flex items-center justify-center gap-2 transition cursor-pointer ${
                      correctAnswer === 'no'
                        ? 'border-rose-500 bg-rose-50 text-rose-800 ring-2 ring-rose-200'
                        : 'border-slate-200 hover:border-slate-300 text-slate-700'
                    }`}
                  >
                    <X className="w-4 h-4 text-rose-600 stroke-[3]" />
                    <span>ไม่ใช่ (ยกแขนซ้าย)</span>
                  </button>
                </div>
              </div>

              {/* Category */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  หมวดหมู่ (Category)
                </label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value as any)}
                  className="w-full py-2.5 px-3.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-[#10B981]"
                >
                  <option value="food">🍎 อาหาร & ผลไม้ (food)</option>
                  <option value="objects">🥄 สิ่งของเครื่องใช้ (objects)</option>
                  <option value="animals">🐶 สัตว์ (animals)</option>
                  <option value="counting">🔢 การนับจำนวน (counting)</option>
                  <option value="daily">⏰ ชีวิตประจำวัน (daily)</option>
                  <option value="colors_shapes">🎨 สีและรูปทรง (colors_shapes)</option>
                  <option value="positions">📍 ทิศทาง & ตำแหน่ง (positions)</option>
                </select>
              </div>

              {/* Explanation */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  คำอธิบายเฉลย (ให้เสียง AI และหน้าจออธิบายคนไข้)
                </label>
                <textarea
                  rows={2}
                  value={explanation}
                  onChange={(e) => setExplanation(e.target.value)}
                  placeholder="เช่น ใช่ กล้วยเป็นผลไม้ที่มีคุณค่าทางอาหารสูง"
                  className="w-full p-3 rounded-xl border border-slate-200 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#10B981]"
                />
              </div>

              {/* Actions */}
              <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2.5 flex-shrink-0">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-5 py-2.5 rounded-full border border-slate-200 text-slate-600 hover:bg-slate-50 font-bold text-xs transition cursor-pointer"
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  className="px-6 py-2.5 rounded-full bg-gradient-to-r from-[#10B981] to-[#059669] hover:opacity-95 text-white font-black text-xs shadow-md shadow-emerald-500/25 flex items-center gap-1.5 transition active:scale-95 cursor-pointer"
                >
                  <Check className="w-4 h-4" />
                  <span>บันทึกโจทย์คำถาม</span>
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};
