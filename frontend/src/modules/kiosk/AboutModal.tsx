import React from 'react';
import { X, Sparkles, Shield, HeartPulse } from 'lucide-react';

interface AboutModalProps {
  isOpen: boolean;
  onClose: () => void;
}

/**
 * Read-Only About System Modal (v2.1)
 * Completely isolated: No outgoing hyperlinks, no navigation, strictly informative.
 */
export const AboutModal: React.FC<AboutModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-emerald-500/50 rounded-3xl p-6 sm:p-8 max-w-lg w-full shadow-2xl text-white space-y-6 animate-in zoom-in-95">
        <div className="flex items-center justify-between border-b border-slate-800 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-emerald-500 to-teal-400 flex items-center justify-center shadow-lg shadow-emerald-500/30">
              <Sparkles className="w-6 h-6 text-slate-950" />
            </div>
            <div>
              <h2 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-emerald-400 to-teal-200">
                Moh Tech Care
              </h2>
              <p className="text-xs text-slate-400">Intelligent Physical Therapy Kiosk System</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-slate-800 hover:bg-slate-700 flex items-center justify-center text-slate-400 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-4 text-sm text-slate-300 leading-relaxed max-h-[60vh] overflow-y-auto pr-1">
          <p>
            <strong>Moh Tech Care (หมอเทคแคร์)</strong> คือแพลตฟอร์มตู้กายภาพบำบัดอัจฉริยะที่เชื่อมโยงระบบการฟื้นฟูสมรรถภาพทางกายด้วยกล้อง AI อัจฉริยะ เข้ากับระบบเวชระเบียนทางการแพทย์แบบรวมศูนย์ (Single Source of Truth)
          </p>

          <div className="grid grid-cols-2 gap-3 pt-2">
            <div className="bg-slate-950/60 p-3.5 rounded-2xl border border-slate-800">
              <Shield className="w-5 h-5 text-emerald-400 mb-1.5" />
              <h4 className="text-xs font-semibold text-white">ความปลอดภัยสูงสุด</h4>
              <p className="text-[11px] text-slate-400 mt-1">ยืนยันตัวตนด้วยชีวมิติใบหน้าและสิทธิ์ Server-Side RBAC</p>
            </div>
            <div className="bg-slate-950/60 p-3.5 rounded-2xl border border-slate-800">
              <HeartPulse className="w-5 h-5 text-teal-400 mb-1.5" />
              <h4 className="text-xs font-semibold text-white">กายภาพผ่านมินิเกม</h4>
              <p className="text-[11px] text-slate-400 mt-1">ตรวจจับท่าทางและนับรอบการฟื้นฟูกล้ามเนื้อแบบเรียลไทม์</p>
            </div>
          </div>

          <div className="bg-emerald-950/30 border border-emerald-800/50 p-3.5 rounded-2xl text-xs text-emerald-300">
            <strong>เวอร์ชัน:</strong> 2.1 Production Edition (Vertical Kiosk Locked)
            <br />
            <strong>มาตรฐานความปลอดภัย:</strong> Append-Only Medical Records & In-Memory Token Revocation
          </div>
        </div>

        <div className="pt-2 text-center">
          <button
            onClick={onClose}
            className="w-full py-3 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-sm shadow-lg shadow-emerald-600/30 transition-all active:scale-98"
          >
            เข้าใจแล้วและปิดหน้าต่าง (Close)
          </button>
        </div>
      </div>
    </div>
  );
};
