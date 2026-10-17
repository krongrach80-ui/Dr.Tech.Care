import React, { useState } from 'react';
import {
  X,
  Settings,
  Check,
  Gamepad2,
  Activity,
  ArrowRight,
  Sparkles,
} from 'lucide-react';
import { UserAccount } from '../../types/hospital';

export type TrainingMode = 'physio' | 'minigame';

interface SelectTrainingModeModalProps {
  isOpen: boolean;
  onClose: () => void;
  patient: UserAccount | null;
  selectedDateStr: string; // e.g. "2026-10-16"
  formattedDateTh: string; // e.g. "วันศุกร์ที่ 16 ตุลาคม 2569"
  onProceedToCourseConfig: (mode: TrainingMode) => void;
}

export const SelectTrainingModeModal: React.FC<SelectTrainingModeModalProps> = ({
  isOpen,
  onClose,
  patient,
  selectedDateStr,
  formattedDateTh,
  onProceedToCourseConfig,
}) => {
  // Default selection: minigame as in Image 3
  const [selectedMode, setSelectedMode] = useState<TrainingMode>('minigame');
  const [showSettingsNotice, setShowSettingsNotice] = useState<boolean>(false);

  if (!isOpen || !patient) return null;

  const patientName = patient.name || 'นายสมชาย ใจดี';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-[#0B2522]/65 backdrop-blur-xs animate-fadeIn font-sans"
      onClick={onClose}
    >
      <div
        className="w-full max-w-[620px] bg-white rounded-[32px] shadow-2xl overflow-hidden border border-emerald-100 flex flex-col p-6 sm:p-7 relative animate-scaleUp"
        onClick={(e) => e.stopPropagation()}
        style={{ borderRadius: '28px' }}
      >
        {/* Header (Matching Image 3) */}
        <div className="flex items-start justify-between pb-3 border-b border-slate-100">
          <div>
            <h3 className="text-xl sm:text-2xl font-black text-[#0B2B2B] tracking-tight">
              เลือกรูปแบบการฝึก
            </h3>
            <p className="text-xs sm:text-sm font-semibold text-slate-500 mt-0.5">
              {patientName} • เริ่มคอร์ส{formattedDateTh || 'วันศุกร์ที่ 16 ตุลาคม 2569'}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-slate-400 bg-slate-100 px-2.5 py-1 rounded-full">
              ขั้นที่ 1 จาก 2
            </span>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-400 hover:text-slate-700 flex items-center justify-center transition cursor-pointer"
              title="ปิดหน้าต่าง"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Small Settings Button at top-left of choices (Matching Image 3) */}
        <div className="pt-3 pb-1 flex items-center justify-between">
          <button
            type="button"
            onClick={() => setShowSettingsNotice((prev) => !prev)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 hover:border-emerald-300 bg-slate-50 hover:bg-emerald-50 text-slate-600 hover:text-emerald-800 text-xs font-bold transition cursor-pointer shadow-2xs"
          >
            <Settings className="w-3.5 h-3.5 text-slate-500" />
            <span>ตั้งค่ารูปแบบการฝึก</span>
          </button>
          {showSettingsNotice && (
            <span className="text-[11px] text-emerald-700 font-semibold bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-200 animate-fadeIn">
              ✓ ระบบใช้ค่าเกณฑ์ AI และความยากเริ่มต้นตามสรีระคนไข้
            </span>
          )}
        </div>

        {/* 2 Choice Cards (Matching Image 3) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 my-3.5">
          {/* CARD 1: กายภาพปกติ */}
          <div
            onClick={() => setSelectedMode('physio')}
            className={`rounded-[24px] p-5 flex flex-col justify-between transition-all cursor-pointer relative ${
              selectedMode === 'physio'
                ? 'border-2 border-emerald-500 ring-4 ring-emerald-100 bg-emerald-50/20 shadow-md'
                : 'border-2 border-slate-200 hover:border-emerald-300 bg-white hover:bg-slate-50/60 shadow-xs'
            }`}
          >
            {/* Top-right Checkmark Badge when selected */}
            {selectedMode === 'physio' && (
              <div className="absolute top-3.5 right-3.5 w-6 h-6 rounded-full bg-emerald-600 text-white flex items-center justify-center shadow-sm">
                <Check className="w-3.5 h-3.5 stroke-[3]" />
              </div>
            )}

            <div>
              {/* Icon Box */}
              <div className="w-13 h-13 rounded-2xl bg-emerald-100/70 text-emerald-700 flex items-center justify-center mb-3.5 shadow-inner">
                <Activity className="w-7 h-7 stroke-[2.2]" />
              </div>

              {/* Title & Description */}
              <h4 className="text-base sm:text-lg font-black text-[#0B2B2B]">
                กายภาพปกติ
              </h4>
              <p className="text-xs text-slate-500 font-medium leading-relaxed mt-1.5 min-h-[48px]">
                ฝึกตามท่าที่นักกายภาพกำหนด กล้องที่ตู้ Kiosk วิเคราะห์ท่าทางและให้คะแนนแต่ละท่า
              </p>

              {/* Badges */}
              <div className="flex items-center gap-1.5 flex-wrap mt-3">
                <span className="px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200 text-[10px] font-extrabold">
                  วิเคราะห์ท่าด้วย AI
                </span>
                <span className="px-2.5 py-0.5 rounded-full bg-teal-50 text-teal-800 border border-teal-200 text-[10px] font-extrabold">
                  คะแนนต่อท่า
                </span>
              </div>
            </div>

            {/* Select Button inside card */}
            <div className="pt-4">
              <button
                type="button"
                className={`w-full py-2.5 rounded-full font-black text-xs transition cursor-pointer ${
                  selectedMode === 'physio'
                    ? 'bg-emerald-600 text-white shadow-md shadow-emerald-500/20'
                    : 'bg-white border border-slate-200 hover:bg-slate-100 text-slate-700'
                }`}
              >
                {selectedMode === 'physio' ? 'เลือกแบบนี้แล้ว' : 'เลือกแบบนี้'}
              </button>
            </div>
          </div>

          {/* CARD 2: มินิเกมฝึกสมอง (Selected State in Image 3) */}
          <div
            onClick={() => setSelectedMode('minigame')}
            className={`rounded-[24px] p-5 flex flex-col justify-between transition-all cursor-pointer relative ${
              selectedMode === 'minigame'
                ? 'border-2 border-[#8b5cf6] ring-4 ring-purple-100 bg-purple-50/25 shadow-md'
                : 'border-2 border-slate-200 hover:border-purple-300 bg-white hover:bg-slate-50/60 shadow-xs'
            }`}
          >
            {/* Top-right Checkmark Badge when selected */}
            {selectedMode === 'minigame' && (
              <div className="absolute top-3.5 right-3.5 w-6 h-6 rounded-full bg-[#8b5cf6] text-white flex items-center justify-center shadow-sm">
                <Check className="w-3.5 h-3.5 stroke-[3]" />
              </div>
            )}

            <div>
              {/* Icon Box */}
              <div className="w-13 h-13 rounded-2xl bg-purple-100 text-purple-700 flex items-center justify-center mb-3.5 shadow-inner">
                <Gamepad2 className="w-7 h-7 stroke-[2.2]" />
              </div>

              {/* Title & Description */}
              <h4 className="text-base sm:text-lg font-black text-[#0B2B2B]">
                มินิเกมฝึกสมอง
              </h4>
              <p className="text-xs text-slate-500 font-medium leading-relaxed mt-1.5 min-h-[48px]">
                ฝึกกายภาพผ่านเกมสั้น ๆ ขยับร่างกายเพื่อเล่นเกม ช่วยให้คนไข้สนุกและฝึกต่อเนื่อง พร้อมฝึกสมองไปด้วย
              </p>

              {/* Badges */}
              <div className="flex items-center gap-1.5 flex-wrap mt-3">
                <span className="px-2.5 py-0.5 rounded-full bg-purple-100 text-purple-800 border border-purple-200 text-[10px] font-extrabold">
                  เล่นด้วยการขยับตัว
                </span>
                <span className="px-2.5 py-0.5 rounded-full bg-violet-100 text-violet-800 border border-violet-200 text-[10px] font-extrabold">
                  ฝึกสมอง
                </span>
              </div>
            </div>

            {/* Select Button inside card */}
            <div className="pt-4">
              <button
                type="button"
                className={`w-full py-2.5 rounded-full font-black text-xs transition cursor-pointer ${
                  selectedMode === 'minigame'
                    ? 'bg-[#8b5cf6] text-white shadow-md shadow-purple-500/25'
                    : 'bg-white border border-slate-200 hover:bg-slate-100 text-slate-700'
                }`}
              >
                {selectedMode === 'minigame' ? 'เลือกแบบนี้แล้ว' : 'เลือกแบบนี้'}
              </button>
            </div>
          </div>
        </div>

        {/* Footer Actions (Matching Image 3) */}
        <div className="pt-2 flex items-center justify-end gap-2.5 border-t border-slate-100 mt-2">
          <button
            type="button"
            onClick={onClose}
            className="px-6 py-2.5 rounded-full border border-slate-200 hover:bg-slate-50 text-slate-700 font-bold text-xs sm:text-sm transition cursor-pointer active:scale-95"
          >
            ยกเลิก
          </button>

          <button
            type="button"
            onClick={() => onProceedToCourseConfig(selectedMode)}
            className="px-6 py-2.5 rounded-full bg-gradient-to-r from-[#10b981] to-[#0ea5e9] hover:opacity-95 text-white font-extrabold text-xs sm:text-sm shadow-md shadow-cyan-500/25 transition flex items-center gap-2 cursor-pointer active:scale-95"
          >
            <span>ถัดไป: ตั้งค่าคอส</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};
