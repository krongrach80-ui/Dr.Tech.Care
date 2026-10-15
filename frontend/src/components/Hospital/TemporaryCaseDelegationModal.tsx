import React, { useState } from 'react';
import {
  X,
  Share2,
  Calendar,
  User,
  Stethoscope,
  FileText,
  Check,
  AlertCircle,
  Clock,
  ShieldCheck,
} from 'lucide-react';
import { UserAccount, PhysicalTherapist, TemporaryCaseDelegation } from '../../types/hospital';

interface TemporaryCaseDelegationModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentTherapist: PhysicalTherapist | null;
  assignedPatients: UserAccount[];
  activeTherapists: PhysicalTherapist[];
  onSubmitDelegation: (data: Omit<TemporaryCaseDelegation, 'id' | 'createdAt' | 'status'>) => void;
  onSuccessToast: (msg: string) => void;
}

export const TemporaryCaseDelegationModal: React.FC<TemporaryCaseDelegationModalProps> = ({
  isOpen,
  onClose,
  currentTherapist,
  assignedPatients,
  activeTherapists,
  onSubmitDelegation,
  onSuccessToast,
}) => {
  const today = new Date().toISOString().split('T')[0];
  const nextWeek = new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0];

  const [selectedPatientId, setSelectedPatientId] = useState<string | number>(
    assignedPatients[0]?.id || ''
  );
  const [selectedCoverPtId, setSelectedCoverPtId] = useState<string | number>(
    activeTherapists.find((t) => t.id !== currentTherapist?.id)?.id || ''
  );
  const [startDate, setStartDate] = useState<string>(today);
  const [endDate, setEndDate] = useState<string>(nextWeek);
  const [reason, setReason] = useState<string>('ไปราชการ / ลาพักผ่อนประจำปี');
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!selectedPatientId) {
      setError('กรุณาเลือกคนไข้ที่ต้องการฝากดูแล');
      return;
    }
    if (!selectedCoverPtId) {
      setError('กรุณาเลือกนักกายภาพบำบัดผู้รับฝากเคส (Cover PT)');
      return;
    }
    if (!startDate || !endDate) {
      setError('กรุณาระบุช่วงวันที่เริ่มและสิ้นสุดการฝากดูแล');
      return;
    }
    if (startDate > endDate) {
      setError('วันที่เริ่มต้นต้องมาก่อนหรือตรงกับวันที่สิ้นสุด');
      return;
    }

    const patient = assignedPatients.find((p) => String(p.id) === String(selectedPatientId));
    const coverPt = activeTherapists.find((t) => String(t.id) === String(selectedCoverPtId));

    if (!patient || !coverPt) {
      setError('ไม่พบข้อมูลคนไข้หรือนักกายภาพบำบัดที่เลือก');
      return;
    }

    onSubmitDelegation({
      patientId: patient.id,
      patientName: patient.name,
      patientCode: patient.code,
      originalTherapistId: currentTherapist?.id || 1,
      originalTherapistName: currentTherapist?.name || 'กภ. ผู้ดูแลเดิม',
      coveringTherapistId: coverPt.id,
      coveringTherapistName: coverPt.name,
      startDate,
      endDate,
      reason: reason.trim() || '-',
    });

    onSuccessToast(
      `มอบหมายเคส ${patient.name} (${patient.code}) ให้ ${coverPt.name} ดูแลชั่วคราวเรียบร้อยแล้ว`
    );
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-[#0F2F2B]/75 backdrop-blur-sm animate-fadeIn"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg bg-white rounded-3xl shadow-2xl border border-emerald-200 overflow-hidden flex flex-col max-h-[92vh] animate-slideUp"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-cyan-100 bg-gradient-to-r from-emerald-50 via-white to-sky-50 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-[#10B981] via-[#06B6D4] to-[#2563EB] text-white flex items-center justify-center shadow-md shadow-cyan-500/25">
              <Share2 className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-extrabold text-base sm:text-lg text-[#0F2F2B]">
                มอบหมายการดูแลเคสชั่วคราว
              </h3>
              <p className="text-[11px] text-emerald-800 font-medium">
                Temporary Case Delegation (ฝากเคสชั่วคราวให้เพื่อนร่วมงาน)
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

        {/* Content Form */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-4 text-xs">
          {/* Info Banner */}
          <div className="p-3.5 rounded-2xl bg-cyan-50/80 border border-cyan-200 text-cyan-950 space-y-1">
            <div className="flex items-center gap-2 font-bold text-xs text-cyan-900">
              <ShieldCheck className="w-4 h-4 text-cyan-600 flex-shrink-0" />
              <span>เงื่อนไขและสิทธิ์การเข้าถึง (System Access Rights):</span>
            </div>
            <p className="text-[11px] text-cyan-800 leading-relaxed">
              การฝากเคสจะมอบสิทธิ์ <strong>Full Write Access</strong> ในการจัดตารางนัดหมายและตารางฝึกกายภาพ (Module 3) ให้แก่นักกายภาพผู้รับฝากเคสตามช่วงเวลาที่กำหนด โดยแอดมินใหญ่สามารถตรวจสอบและยกเลิกได้ตลอดเวลา
            </p>
          </div>

          {error && (
            <div className="p-3 rounded-2xl bg-rose-50 border border-rose-200 text-rose-700 font-bold flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-rose-500 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* 1. Select Patient */}
          <div>
            <label className="block font-bold text-slate-700 mb-1.5">
              1. เลือกคนไข้ที่ต้องการฝากดูแล (Primary Assigned Patient):
            </label>
            <div className="relative">
              <select
                value={selectedPatientId}
                onChange={(e) => {
                  setSelectedPatientId(e.target.value);
                  setError(null);
                }}
                className="w-full px-3.5 py-2.5 rounded-xl bg-white border border-slate-300 font-bold text-xs text-[#0F2F2B] outline-none focus:border-emerald-500 cursor-pointer"
              >
                {assignedPatients.length === 0 ? (
                  <option value="">-- ยังไม่มีคนไข้ในความรับผิดชอบ --</option>
                ) : (
                  assignedPatients.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.code}) - {p.chiefComplaint || p.diagnosis || 'กำลังฟื้นฟู'}
                    </option>
                  ))
                )}
              </select>
            </div>
          </div>

          {/* 2. Select Cover PT */}
          <div>
            <label className="block font-bold text-slate-700 mb-1.5">
              2. เลือกนักกายภาพบำบัดผู้รับฝากเคส (Cover PT):
            </label>
            <div className="relative">
              <select
                value={selectedCoverPtId}
                onChange={(e) => {
                  setSelectedCoverPtId(e.target.value);
                  setError(null);
                }}
                className="w-full px-3.5 py-2.5 rounded-xl bg-white border border-slate-300 font-bold text-xs text-[#0F2F2B] outline-none focus:border-emerald-500 cursor-pointer"
              >
                {activeTherapists
                  .filter((t) => t.id !== currentTherapist?.id)
                  .map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name} ({t.code}) - {t.specialty}
                    </option>
                  ))}
              </select>
            </div>
          </div>

          {/* 3. Coverage Date Range */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block font-bold text-slate-700 mb-1">
                วันที่เริ่มฝากดูแล (Start Date):
              </label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-white border border-slate-300 font-bold text-xs text-[#0F2F2B] outline-none focus:border-emerald-500"
              />
            </div>

            <div>
              <label className="block font-bold text-slate-700 mb-1">
                วันที่สิ้นสุดการฝาก (End Date):
              </label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-white border border-slate-300 font-bold text-xs text-[#0F2F2B] outline-none focus:border-emerald-500"
              />
            </div>
          </div>

          {/* 4. Reason / Notes */}
          <div>
            <label className="block font-bold text-slate-700 mb-1">
              เหตุผลหรือหมายเหตุการฝากเคส (Reason / Clinical Handover Note):
            </label>
            <textarea
              rows={2}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="เช่น ไปสัมมนาวิชาการต่างจังหวัด ฝากดูอาการข้อไหล่ต่อเนื่อง..."
              className="w-full p-3 rounded-xl bg-white border border-slate-300 font-medium text-xs text-[#0F2F2B] outline-none focus:border-emerald-500"
            />
          </div>

          {/* Submit Action */}
          <div className="pt-4 border-t border-slate-100 flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl border border-slate-300 text-slate-600 font-bold hover:bg-slate-50 transition cursor-pointer"
            >
              ยกเลิก
            </button>

            <button
              type="submit"
              disabled={assignedPatients.length === 0}
              className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-[#10B981] via-[#06B6D4] to-[#2563EB] hover:opacity-95 text-white font-extrabold shadow-md shadow-cyan-500/25 transition active:scale-95 cursor-pointer flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Check className="w-4 h-4" />
              <span>ยืนยันการมอบหมายเคสชั่วคราว</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
