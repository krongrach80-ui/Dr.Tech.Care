/**
 * Dr.Tech.Care - PDPA Biometric Consent Modal
 * Mandatory consent before biometric camera face verification for elderly patients
 * High-contrast, large touch targets (>= 64px), clear Thai privacy disclosure
 */

import React from 'react';
import { ShieldCheck, Lock, Key, AlertCircle, CheckCircle2, X } from 'lucide-react';

interface PDPAConsentModalProps {
  isOpen: boolean;
  onConsent: () => void;
  onDeclineUsePin: () => void;
}

export const PDPAConsentModal: React.FC<PDPAConsentModalProps> = ({
  isOpen,
  onConsent,
  onDeclineUsePin,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/75 backdrop-blur-md animate-fadeIn">
      <div className="bg-[#F4FBF7] border-2 border-emerald-500 rounded-[32px] p-6 sm:p-8 max-w-lg w-full shadow-2xl flex flex-col items-center text-center relative overflow-hidden">
        {/* Header Icon */}
        <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-emerald-100 border-2 border-emerald-400 flex items-center justify-center mb-4 shadow-sm text-emerald-800">
          <ShieldCheck className="w-9 h-9 sm:w-11 sm:h-11 text-[#1E8A4C]" />
        </div>

        {/* Title */}
        <h2 className="text-xl sm:text-2xl font-black text-[#0B2B2B] leading-tight mb-2">
          หนังสือยินยอมประมวลผลข้อมูลชีวมิติ (PDPA)
        </h2>
        <p className="text-xs sm:text-sm font-bold text-emerald-900 mb-4">
          ตามพระราชบัญญัติคุ้มครองข้อมูลส่วนบุคคล พ.ศ. 2562
        </p>

        {/* PDPA Core Guarantees Card */}
        <div className="w-full bg-white border border-emerald-200 rounded-2xl p-4 text-left space-y-3 mb-6 shadow-sm">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
            <div className="text-xs sm:text-sm text-slate-700">
              <span className="font-extrabold text-[#0B2B2B]">วัตถุประสงค์ทางการแพทย์:</span>{' '}
              เพื่อยืนยันตัวตนของผู้รับบริการกายภาพบำบัดอย่างถูกต้อง ป้องกันการสับสนประวัติการรักษา
            </div>
          </div>

          <div className="flex items-start gap-3">
            <Lock className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
            <div className="text-xs sm:text-sm text-slate-700">
              <span className="font-extrabold text-[#0B2B2B]">ความปลอดภัยสูงสุด (ไม่เก็บรูปภาพ):</span>{' '}
              ระบบจะแปลงลักษณะใบหน้าเป็นเวกเตอร์คณิตศาสตร์ 128 มิติ (Biometric Embedding) ทันที{' '}
              <b className="text-emerald-800 underline">โดยไม่มีการบันทึกภาพถ่ายจริงลงในระบบหรือฮาร์ดดิสก์</b>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <Key className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
            <div className="text-xs sm:text-sm text-slate-700">
              <span className="font-extrabold text-[#0B2B2B]">สิทธิในการปฏิเสธ:</span>{' '}
              ท่านสามารถปฏิเสธการสแกนใบหน้า และเลือกเข้าสู่ระบบด้วยรหัส PIN 6 หลักแทนได้ตลอดเวลา
            </div>
          </div>
        </div>

        {/* Action Buttons (Height >= 64px for primary) */}
        <div className="w-full space-y-3">
          <button
            onClick={onConsent}
            className="w-full min-h-[64px] sm:min-h-[72px] py-3.5 px-6 rounded-2xl bg-gradient-to-r from-[#10B981] via-[#06B6D4] to-[#2563EB] text-white font-black text-base sm:text-lg shadow-xl shadow-cyan-500/25 hover:shadow-2xl hover:scale-[1.01] active:scale-95 transition flex items-center justify-center gap-2 cursor-pointer border-2 border-white/60"
            id="btnPdpaConsent"
          >
            <CheckCircle2 className="w-6 h-6 shrink-0" />
            <span>ข้าพเจ้ายินยอมให้ประมวลผลข้อมูลชีวมิติ</span>
          </button>

          <button
            onClick={onDeclineUsePin}
            className="w-full min-h-[52px] sm:min-h-[58px] py-2.5 px-4 rounded-xl bg-slate-100 hover:bg-slate-200 border border-slate-300 text-slate-700 font-extrabold text-sm sm:text-base flex items-center justify-center gap-2 transition cursor-pointer active:scale-95"
            id="btnPdpaDeclineUsePin"
          >
            <Key className="w-5 h-5 text-slate-600" />
            <span>ไม่ยินยอม (เข้าสู่ระบบด้วยรหัส PIN 6 หลัก)</span>
          </button>
        </div>
      </div>
    </div>
  );
};
