import React, { useState } from 'react';
import {
  X,
  User,
  Users,
  ArrowRightLeft,
  ExternalLink,
  Search,
  CheckCircle2,
  Calendar,
  Stethoscope,
  HeartPulse,
  Share2,
} from 'lucide-react';
import { UserAccount, PhysicalTherapist } from '../../types/hospital';
import { useHospitalStore } from '../../store/hospitalStore';
import { defaultDash, formatThaiDate } from '../../utils/dashboardUtils';

interface PtAssignedPatientsModalProps {
  isOpen: boolean;
  onClose: () => void;
  therapist: PhysicalTherapist | null;
  allTherapists: PhysicalTherapist[];
  onOpenPatientProfile: (patient: UserAccount) => void;
  onOpenDelegation?: (patient: UserAccount) => void;
  onSuccessToast: (msg: string) => void;
}

export const PtAssignedPatientsModal: React.FC<PtAssignedPatientsModalProps> = ({
  isOpen,
  onClose,
  therapist,
  allTherapists,
  onOpenPatientProfile,
  onOpenDelegation,
  onSuccessToast,
}) => {
  const { users, updateUser, addActivityLog } = useHospitalStore();
  const [search, setSearch] = useState<string>('');
  const [transferringPatientId, setTransferringPatientId] = useState<number | string | null>(null);
  const [selectedTargetPtId, setSelectedTargetPtId] = useState<number | string>('');

  if (!isOpen || !therapist) return null;

  // Filter patients assigned to this therapist
  const assignedPatients = users.filter(
    (u) =>
      u.role === 'patient' &&
      (u.assignedTherapistId === therapist.id ||
        u.assignedTherapistName === therapist.name ||
        (therapist.assignedCases && therapist.assignedCases.includes(u.code)))
  );

  const filteredPatients = assignedPatients.filter((p) => {
    const q = search.toLowerCase().trim();
    if (!q) return true;
    return (
      p.name.toLowerCase().includes(q) ||
      p.code.toLowerCase().includes(q) ||
      (p.diagnosis && p.diagnosis.toLowerCase().includes(q))
    );
  });

  // Handle Transfer Case
  const handleExecuteTransfer = (patient: UserAccount) => {
    if (!selectedTargetPtId) {
      alert('กรุณาเลือกนักกายภาพบำบัดผู้รับโอนเคส');
      return;
    }
    const targetPt = allTherapists.find((t) => String(t.id) === String(selectedTargetPtId));
    if (!targetPt) return;

    updateUser(patient.id, {
      assignedTherapistId: targetPt.id,
      assignedTherapistName: targetPt.name,
    });

    addActivityLog(
      'โอนย้ายเคสคนไข้ (Transfer Case)',
      'PATIENT',
      `โอนเคส ${patient.name} (${patient.code}) จาก ${therapist.name} ไปยัง ${targetPt.name}`
    );

    onSuccessToast(`โอนย้ายเคส ${patient.name} ไปยัง ${targetPt.name} เรียบร้อยแล้ว`);
    setTransferringPatientId(null);
    setSelectedTargetPtId('');
  };

  const otherTherapists = allTherapists.filter((t) => t.id !== therapist.id);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-[#0F2F2B]/75 backdrop-blur-sm animate-fadeIn"
      onClick={onClose}
    >
      <div
        className="w-full max-w-4xl bg-white rounded-3xl shadow-2xl border border-emerald-200 overflow-hidden flex flex-col max-h-[90vh] animate-slideUp"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-cyan-100 bg-gradient-to-r from-emerald-50 via-white to-sky-50 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-[#10B981] via-[#06B6D4] to-[#2563EB] text-white flex items-center justify-center shadow-md shadow-cyan-500/25">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-extrabold text-base sm:text-lg text-[#0F2F2B]">
                  เคสคนไข้ในความรับผิดชอบ (Assigned Patients)
                </h3>
                <span className="px-2.5 py-0.5 rounded-full text-xs font-black bg-emerald-100 text-emerald-800 border border-emerald-300">
                  {assignedPatients.length} เคส
                </span>
              </div>
              <p className="text-[11px] text-emerald-800 font-medium">
                นักกายภาพ: <strong>{therapist.name}</strong> ({therapist.code}) • {defaultDash(therapist.specialty)}
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

        {/* Toolbar */}
        <div className="px-6 py-3 border-b border-slate-100 bg-slate-50/70 flex items-center justify-between gap-3 text-xs">
          <div className="relative flex-1 max-w-xs">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="ค้นหาชื่อ, รหัส HN, หรืออาการ..."
              className="w-full pl-9 pr-3 py-1.5 rounded-xl bg-white border border-slate-200 text-xs text-[#0F2F2B] outline-none focus:border-[#10B981]"
            />
          </div>
          <div className="text-[11px] text-slate-500 font-medium hidden sm:block">
            คลิกที่ชื่อเพื่อเปิดดูเวชระเบียนเต็ม หรือกดปุ่มโอนเคสเพื่อเปลี่ยนนักกายภาพ
          </div>
        </div>

        {/* Table Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {filteredPatients.length === 0 ? (
            <div className="py-16 text-center text-slate-400 space-y-2">
              <User className="w-10 h-10 mx-auto text-slate-300" />
              <div className="font-bold text-sm">ไม่พบรายชื่อคนไข้ในความดูแล</div>
              <p className="text-xs">สามารถกำหนดคนไข้ให้กภ. ท่านนี้ได้จากหน้าลงทะเบียนคนไข้ หรือโอนย้ายเคสเข้ามา</p>
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-emerald-100 overflow-hidden shadow-2xs">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-emerald-50/80 border-b border-emerald-100 text-slate-700 font-bold">
                    <th className="py-2.5 px-4">คนไข้ / รหัส HN</th>
                    <th className="py-2.5 px-4">อาการ / การวินิจฉัย</th>
                    <th className="py-2.5 px-4">เริ่มรักษา</th>
                    <th className="py-2.5 px-4">ใช้งานล่าสุด</th>
                    <th className="py-2.5 px-4 text-right">การจัดการ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredPatients.map((patient) => {
                    const isTransferring = transferringPatientId === patient.id;

                    return (
                      <tr key={patient.id} className="hover:bg-emerald-50/30 transition">
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-emerald-100 border border-emerald-300 overflow-hidden flex-shrink-0 flex items-center justify-center font-bold text-emerald-800 text-xs">
                              {patient.face_image_url ? (
                                <img src={patient.face_image_url} alt={patient.name} className="w-full h-full object-cover" />
                              ) : (
                                patient.name.charAt(0)
                              )}
                            </div>
                            <div className="min-w-0">
                              <button
                                type="button"
                                onClick={() => onOpenPatientProfile(patient)}
                                className="font-bold text-[#0F2F2B] hover:text-emerald-700 transition truncate text-left flex items-center gap-1 group cursor-pointer"
                              >
                                <span>{patient.name}</span>
                                <ExternalLink className="w-3 h-3 text-slate-400 group-hover:text-emerald-600" />
                              </button>
                              <div className="text-[10px] text-slate-500 font-mono">
                                HN: {defaultDash(patient.code)} • {patient.gender === 'female' ? 'หญิง' : 'ชาย'}, {defaultDash(patient.age)} ปี
                              </div>
                            </div>
                          </div>
                        </td>

                        <td className="py-3 px-4 max-w-[200px]">
                          <div className="truncate text-slate-700 font-medium" title={patient.diagnosis || patient.chiefComplaint}>
                            {defaultDash(patient.diagnosis || patient.chiefComplaint)}
                          </div>
                        </td>

                        <td className="py-3 px-4 whitespace-nowrap text-slate-500">
                          {formatThaiDate(patient.admissionDate || patient.created_at)}
                        </td>

                        <td className="py-3 px-4 whitespace-nowrap text-slate-500 font-medium">
                          {defaultDash(patient.last_active)}
                        </td>

                        <td className="py-3 px-4 text-right whitespace-nowrap">
                          {isTransferring ? (
                            <div className="inline-flex items-center gap-1.5 animate-fadeIn">
                              <select
                                value={selectedTargetPtId}
                                onChange={(e) => setSelectedTargetPtId(e.target.value)}
                                className="px-2 py-1 rounded-lg bg-white border border-cyan-400 text-xs font-bold text-[#0F2F2B]"
                              >
                                <option value="">-- เลือกผู้รับโอน --</option>
                                {otherTherapists.map((t) => (
                                  <option key={t.id} value={t.id}>
                                    {t.name} ({t.code})
                                  </option>
                                ))}
                              </select>
                              <button
                                type="button"
                                onClick={() => handleExecuteTransfer(patient)}
                                className="px-2.5 py-1 rounded-lg bg-emerald-600 text-white font-bold text-xs hover:bg-emerald-500"
                              >
                                ยืนยัน
                              </button>
                              <button
                                type="button"
                                onClick={() => setTransferringPatientId(null)}
                                className="px-2 py-1 rounded-lg border border-slate-300 text-slate-600 font-bold text-xs hover:bg-slate-100"
                              >
                                ยกเลิก
                              </button>
                            </div>
                          ) : (
                            <div className="inline-flex items-center gap-1.5">
                              {onOpenDelegation && (
                                <button
                                  type="button"
                                  onClick={() => onOpenDelegation(patient)}
                                  className="px-2.5 py-1 rounded-lg bg-gradient-to-r from-emerald-500 to-teal-600 text-white text-xs font-bold transition flex items-center gap-1 shadow-2xs hover:opacity-95"
                                  title="ฝากเคสคนไข้รายนี้ให้เพื่อนร่วมงานช่วยดูแลชั่วคราว"
                                >
                                  <Share2 className="w-3 h-3" />
                                  <span>+ ฝากเคสชั่วคราว</span>
                                </button>
                              )}

                              <button
                                type="button"
                                onClick={() => setTransferringPatientId(patient.id)}
                                className="px-2.5 py-1 rounded-lg border border-slate-200 hover:border-cyan-400 text-slate-700 hover:text-cyan-800 text-xs font-bold transition flex items-center gap-1"
                                title="โอนย้ายเคสคนไข้ให้กภ. ท่านอื่น"
                              >
                                <ArrowRightLeft className="w-3 h-3 text-cyan-600" />
                                <span>โอนเคส (Transfer)</span>
                              </button>

                              <button
                                type="button"
                                onClick={() => onOpenPatientProfile(patient)}
                                className="px-2.5 py-1 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-800 text-xs font-bold transition flex items-center gap-1"
                              >
                                <span>ดูข้อมูล (Profile)</span>
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
