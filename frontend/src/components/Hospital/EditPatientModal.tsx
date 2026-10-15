import React, { useState, useEffect } from 'react';
import {
  X,
  User,
  Phone,
  Calendar,
  Stethoscope,
  FileText,
  Activity,
  Sparkles,
  Check,
  AlertCircle,
  Plus,
  TrendingUp,
  Clock,
  ShieldCheck,
  Award,
  BarChart3,
  CheckCircle2,
  XCircle,
  Pencil,
  Trash2,
  Save,
} from 'lucide-react';
import { UserAccount, UserRole, PhysicalTherapist, MedicalNoteItem } from '../../types/hospital';
import { useHospitalStore } from '../../store/hospitalStore';
import { defaultDash, formatThaiDate, formatThaiDateTime } from '../../utils/dashboardUtils';

interface EditPatientModalProps {
  isOpen: boolean;
  onClose: () => void;
  patient: UserAccount | null;
  therapists: PhysicalTherapist[];
  currentRole: UserRole;
  currentUserId: number | string;
  currentUserName: string;
  canEdit: boolean;
  onSavePatient: (patientId: number | string, data: Partial<UserAccount>) => void;
  onSuccessToast: (msg: string) => void;
}

export const EditPatientModal: React.FC<EditPatientModalProps> = ({
  isOpen,
  onClose,
  patient,
  therapists,
  currentRole,
  currentUserId,
  currentUserName,
  canEdit,
  onSavePatient,
  onSuccessToast,
}) => {
  // 3 Tabs: 1 = Personal Info, 2 = Treatment History & Notes, 3 = Treatment Performance Dashboard
  const [activeTab, setActiveTab] = useState<'personal' | 'history' | 'analytics'>('personal');

  // Tab 1: Personal Info
  const [name, setName] = useState<string>('');
  const [age, setAge] = useState<number | string>(65);
  const [gender, setGender] = useState<'male' | 'female' | 'other'>('male');
  const [phone, setPhone] = useState<string>('');
  const [assignedTherapistId, setAssignedTherapistId] = useState<number | string>(1);
  const [initialSymptoms, setInitialSymptoms] = useState<string>('');
  const [underlyingDiseases, setUnderlyingDiseases] = useState<string>('');
  const [drugAllergies, setDrugAllergies] = useState<string>('');

  // Tab 2: Treatment History & Notes
  const [admissionDate, setAdmissionDate] = useState<string>('');
  const [progressPercent, setProgressPercent] = useState<number>(75);
  const [notesHistory, setNotesHistory] = useState<MedicalNoteItem[]>([]);
  const [newNoteText, setNewNoteText] = useState<string>('');
  const [isAddingNote, setIsAddingNote] = useState<boolean>(false);

  // Tab 2: Super Admin Retrospective Note Editing
  const [editingNoteId, setEditingNoteId] = useState<number | string | null>(null);
  const [editingNoteText, setEditingNoteText] = useState<string>('');
  const [isSavingHistory, setIsSavingHistory] = useState<boolean>(false);

  // Tab 3: Performance Dashboard Time Range
  const [timeRange, setTimeRange] = useState<'1w' | '1m' | 'custom'>('1m');

  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  useEffect(() => {
    if (isOpen && patient) {
      setActiveTab('personal');
      setName(patient.name || '');
      setAge(patient.age || 65);
      setGender(patient.gender || 'male');
      setPhone(patient.phone || '');
      setAssignedTherapistId(patient.assignedTherapistId || therapists[0]?.id || 1);
      setInitialSymptoms(patient.chiefComplaint || patient.diagnosis || '');
      setUnderlyingDiseases(patient.underlyingDiseases || patient.patientBackground || '-');
      setDrugAllergies(patient.drugAllergies || '-');

      setAdmissionDate(patient.admissionDate || patient.created_at || '2026-02-01');
      setProgressPercent(patient.progressPercent || 78);

      const existingNotes = patient.medicalNotesHistory || [
        {
          id: 1,
          date: '2026-10-12 10:30',
          author: patient.assignedTherapistName || 'กภ. ธนากร วงศ์สวัสดิ์',
          text: 'คนไข้ทำกายภาพกางแขนและยืดสะบักได้ดีขึ้น อาการปวดไหล่ลดลงจากระดับ 6 เหลือระดับ 2 แนะนำให้เพิ่มความต่อเนื่อง',
        },
        {
          id: 2,
          date: '2026-10-05 09:15',
          author: patient.assignedTherapistName || 'กภ. ธนากร วงศ์สวัสดิ์',
          text: 'เริ่มโปรแกรมการฝึกกายภาพท่าพื้นฐาน ข้อไหล่ยังตึงเล็กน้อยในช่วง 60-70 องศา ให้ฝึกช้าๆ',
        },
      ];
      setNotesHistory(existingNotes);
      setNewNoteText('');
      setIsAddingNote(false);
      setEditingNoteId(null);
      setEditingNoteText('');
    }
  }, [isOpen, patient, therapists]);

  if (!isOpen || !patient) return null;

  const handleSavePersonalInfo = (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    const targetTherapist = therapists.find((t) => t.id === Number(assignedTherapistId)) || therapists[0];

    onSavePatient(patient.id, {
      name: name.trim(),
      age: Number(age) || 60,
      gender,
      phone: phone.trim() || undefined,
      assignedTherapistId: targetTherapist?.id,
      assignedTherapistName: targetTherapist?.name || currentUserName,
      chiefComplaint: initialSymptoms.trim(),
      diagnosis: initialSymptoms.trim(),
      underlyingDiseases: underlyingDiseases.trim() || '-',
      drugAllergies: drugAllergies.trim() || '-',
      patientBackground: underlyingDiseases.trim() || '-',
      progressPercent,
      medicalNotesHistory: notesHistory,
    });

    onSuccessToast(`บันทึกข้อมูลเวชระเบียนของ ${name} เรียบร้อยแล้ว`);
    setIsSubmitting(false);
    onClose();
  };

  // Super Admin: Save admissionDate & progressPercent
  const handleSaveTreatmentHistory = () => {
    setIsSavingHistory(true);
    onSavePatient(patient.id, {
      admissionDate,
      progressPercent: Number(progressPercent),
      medicalNotesHistory: notesHistory,
    });
    onSuccessToast('บันทึกประวัติการรักษาและ % พัฒนาการเรียบร้อยแล้ว');
    setIsSavingHistory(false);
  };

  // Super Admin: Retrospective Note Editing
  const handleStartEditNote = (note: MedicalNoteItem) => {
    setEditingNoteId(note.id);
    setEditingNoteText(note.text || '');
  };

  const handleSaveEditedNote = () => {
    if (editingNoteId === null) return;
    const updated = notesHistory.map((n) =>
      n.id === editingNoteId ? { ...n, text: editingNoteText.trim() } : n
    );
    setNotesHistory(updated);
    setEditingNoteId(null);
    setEditingNoteText('');
    onSavePatient(patient.id, {
      medicalNotesHistory: updated,
    });
    onSuccessToast('แก้ไขบันทึกเวชระเบียนย้อนหลังสำเร็จ');
  };

  const handleDeleteNote = (noteId: number | string) => {
    if (!confirm('คุณแน่ใจหรือไม่ว่าต้องการลบบันทึกประวัติการรักษานี้?')) return;
    const updated = notesHistory.filter((n) => n.id !== noteId);
    setNotesHistory(updated);
    onSavePatient(patient.id, {
      medicalNotesHistory: updated,
    });
    onSuccessToast('ลบบันทึกเวชระเบียนเรียบร้อยแล้ว');
  };

  const handleAddNote = () => {
    if (!newNoteText.trim()) return;

    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    const formattedDateTime = `${pad(now.getDate())}/${pad(now.getMonth() + 1)}/${now.getFullYear()} ${pad(now.getHours())}:${pad(now.getMinutes())}`;
    const authorPrefix = currentRole === 'admin' ? 'Super Admin' : 'PT';
    const authorName = currentUserName || (currentRole === 'admin' ? 'ผู้อำนวยการโรงพยาบาล' : 'กภ. ผู้ดูแล');
    const immutableStamp = currentRole === 'admin'
      ? `[${formattedDateTime} - Logged by Super Admin: ${authorName}]`
      : `[${formattedDateTime} - Logged by PT: ${authorName}]`;
    const finalNoteText = `${immutableStamp} ${newNoteText.trim()}`;

    const newNote: MedicalNoteItem = {
      id: Date.now(),
      date: formattedDateTime,
      author: `${authorPrefix}: ${authorName}`,
      text: finalNoteText,
    };

    const updated = [newNote, ...notesHistory];
    setNotesHistory(updated);
    setNewNoteText('');
    setIsAddingNote(false);

    onSavePatient(patient.id, {
      medicalNotesHistory: updated,
    });
    onSuccessToast('บันทึกความก้าวหน้าทางการแพทย์ (Append Medical Note) สำเร็จ');
  };

  // Mock performance data for Tab 3 (sourced directly from Kiosk session logs)
  const performanceExercises = [
    { name: 'ท่ายกแขนไปข้างหน้า (Forward Arm Raise)', correct: 28, incorrect: 3, accuracy: 90, rom: '88°' },
    { name: 'กางแขนยกด้านข้าง (Shoulder Abduction)', correct: 35, incorrect: 4, accuracy: 89, rom: '92°' },
    { name: 'ยืดไหล่ข้ามอก (Cross Body Stretch)', correct: 24, incorrect: 2, accuracy: 92, rom: '45°' },
    { name: 'มินิเกมฝึกประสานการเคลื่อนไหว (Rehab Quiz Game)', correct: 18, incorrect: 1, accuracy: 94, rom: 'ดีเยี่ยม' },
  ];

  const totalCorrect = performanceExercises.reduce((a, b) => a + b.correct, 0);
  const totalIncorrect = performanceExercises.reduce((a, b) => a + b.incorrect, 0);
  const overallAccuracy = Math.round((totalCorrect / (totalCorrect + totalIncorrect)) * 100);

  // Kiosk Session Activity Calendar Status (October 2026)
  const sessionStatusCalendar = [
    { day: 1, status: 'none' },
    { day: 2, status: 'completed' },
    { day: 3, status: 'none' },
    { day: 4, status: 'none' },
    { day: 5, status: 'completed' },
    { day: 6, status: 'none' },
    { day: 7, status: 'completed' },
    { day: 8, status: 'none' },
    { day: 9, status: 'completed' },
    { day: 10, status: 'none' },
    { day: 11, status: 'none' },
    { day: 12, status: 'completed' },
    { day: 13, status: 'none' },
    { day: 14, status: 'missed' },
    { day: 15, status: 'completed' }, // today
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-[#0F2F2B]/75 backdrop-blur-sm animate-fadeIn"
      onClick={onClose}
    >
      <div
        className="w-full max-w-3xl bg-white rounded-3xl shadow-2xl border border-emerald-200 overflow-hidden flex flex-col max-h-[92vh] animate-slideUp"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-cyan-100 bg-gradient-to-r from-emerald-50 via-white to-sky-50 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl overflow-hidden border-2 border-emerald-400 shadow-md flex-shrink-0 bg-slate-100 flex items-center justify-center">
              {patient.face_image_url ? (
                <img src={patient.face_image_url} alt={patient.name} className="w-full h-full object-cover" />
              ) : (
                <User className="w-6 h-6 text-slate-400" />
              )}
            </div>

            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-extrabold text-base sm:text-lg text-[#0F2F2B]">
                  {patient.name}
                </h3>
                <span className="px-2 py-0.5 rounded-full text-xs font-mono font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                  HN: {defaultDash(patient.code)}
                </span>
                <span
                  className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold border ${
                    patient.treatmentStatus === 'discharged'
                      ? 'bg-slate-100 text-slate-700 border-slate-300'
                      : 'bg-emerald-100 text-emerald-800 border-emerald-300'
                  }`}
                >
                  {patient.treatmentStatus === 'discharged' ? 'สิ้นสุดการรักษา' : '🟢 อยู่ระหว่างการรักษา (Active)'}
                </span>
              </div>
              <p className="text-[11px] text-emerald-800 font-medium">
                {patient.gender === 'female' ? 'หญิง' : 'ชาย'}, อายุ {defaultDash(patient.age)} ปี • หมอผู้ดูแล: {defaultDash(patient.assignedTherapistName)}
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

        {/* Tab Navigation */}
        <div className="grid grid-cols-3 border-b border-cyan-100 text-xs font-bold text-center bg-slate-50/80">
          <button
            type="button"
            onClick={() => setActiveTab('personal')}
            className={`py-3 px-3 flex items-center justify-center gap-2 transition cursor-pointer ${
              activeTab === 'personal'
                ? 'bg-white text-emerald-800 border-b-2 border-emerald-600 shadow-2xs font-extrabold'
                : 'text-slate-600 hover:text-emerald-700'
            }`}
          >
            <User className="w-4 h-4 text-emerald-600" />
            <span>1. ข้อมูลส่วนตัว (Personal Info)</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('history')}
            className={`py-3 px-3 flex items-center justify-center gap-2 transition cursor-pointer ${
              activeTab === 'history'
                ? 'bg-white text-emerald-800 border-b-2 border-emerald-600 shadow-2xs font-extrabold'
                : 'text-slate-600 hover:text-emerald-700'
            }`}
          >
            <FileText className="w-4 h-4 text-emerald-600" />
            <span>2. ประวัติ & บันทึก (Treatment & Notes)</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('analytics')}
            className={`py-3 px-3 flex items-center justify-center gap-2 transition cursor-pointer ${
              activeTab === 'analytics'
                ? 'bg-white text-emerald-800 border-b-2 border-emerald-600 shadow-2xs font-extrabold'
                : 'text-slate-600 hover:text-emerald-700'
            }`}
          >
            <BarChart3 className="w-4 h-4 text-emerald-600" />
            <span>3. แดชบอร์ดผลการรักษา (Performance Analytics)</span>
          </button>
        </div>

        {/* Tab 1: Personal Info (Editable) */}
        {activeTab === 'personal' && (
          <form onSubmit={handleSavePersonalInfo} className="flex-1 overflow-y-auto p-6 space-y-4 text-xs">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block font-bold text-slate-700 mb-1">ชื่อ-นามสกุล:</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-white border border-slate-300 font-bold text-xs text-[#0F2F2B] outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">เบอร์โทรศัพท์:</label>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="เช่น 081-234-5678"
                  className="w-full px-3 py-2 rounded-xl bg-white border border-slate-300 font-bold text-xs text-[#0F2F2B] outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">อายุ (ปี):</label>
                <input
                  type="number"
                  min={1}
                  max={120}
                  value={age}
                  onChange={(e) => setAge(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-white border border-slate-300 font-bold text-xs text-[#0F2F2B] outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">เพศ:</label>
                <select
                  value={gender}
                  onChange={(e: any) => setGender(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-white border border-slate-300 font-bold text-xs text-[#0F2F2B] outline-none focus:border-emerald-500 cursor-pointer"
                >
                  <option value="male">ชาย</option>
                  <option value="female">หญิง</option>
                  <option value="other">อื่นๆ</option>
                </select>
              </div>

              <div className="sm:col-span-2">
                <label className="block font-bold text-slate-700 mb-1">นักกายภาพบำบัดผู้รับผิดชอบ (Assigned PT):</label>
                <select
                  value={assignedTherapistId}
                  onChange={(e) => setAssignedTherapistId(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-white border border-slate-300 font-bold text-xs text-[#0F2F2B] outline-none focus:border-emerald-500 cursor-pointer"
                >
                  {therapists.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name} ({t.code}) - {t.specialty}
                    </option>
                  ))}
                </select>
              </div>

              <div className="sm:col-span-2">
                <label className="block font-bold text-slate-700 mb-1">อาการสำคัญ / การวินิจฉัย (Initial Symptoms / Notes):</label>
                <textarea
                  rows={2}
                  value={initialSymptoms}
                  onChange={(e) => setInitialSymptoms(e.target.value)}
                  placeholder="เช่น ข้อไหล่ติดระยะฟื้นฟู ยกแขนไม่สุด ปวดตึงบริเวณสะบัก"
                  className="w-full p-3 rounded-xl bg-white border border-slate-300 font-medium text-xs text-[#0F2F2B] outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">โรคประจำตัว (Underlying Diseases):</label>
                <input
                  type="text"
                  value={underlyingDiseases}
                  onChange={(e) => setUnderlyingDiseases(e.target.value)}
                  placeholder="เช่น ความดันโลหิตสูง, เบาหวาน (default -)"
                  className="w-full px-3 py-2 rounded-xl bg-white border border-slate-300 font-bold text-xs text-[#0F2F2B] outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">ประวัติแพ้ยา / แพ้อาหาร (Drug Allergies):</label>
                <input
                  type="text"
                  value={drugAllergies}
                  onChange={(e) => setDrugAllergies(e.target.value)}
                  placeholder="เช่น ปฏิเสธการแพ้ยา (default -)"
                  className="w-full px-3 py-2 rounded-xl bg-white border border-slate-300 font-bold text-xs text-[#0F2F2B] outline-none focus:border-emerald-500"
                />
              </div>
            </div>

            <div className="pt-4 border-t border-slate-100 flex justify-end">
              <button
                type="submit"
                disabled={isSubmitting}
                className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-[#10B981] via-[#06B6D4] to-[#2563EB] hover:opacity-95 text-white font-extrabold text-xs shadow-md shadow-cyan-500/25 transition active:scale-95 cursor-pointer flex items-center gap-2"
              >
                <Check className="w-4 h-4" />
                <span>บันทึกการแก้ไขข้อมูลส่วนตัว</span>
              </button>
            </div>
          </form>
        )}

        {/* Tab 2: Treatment History & Notes (Editable for Super Admin, Append-Only for PT) */}
        {activeTab === 'history' && (
          <div className="flex-1 overflow-y-auto p-6 space-y-5 text-xs">
            {/* Admission & Overall Progress Banner */}
            <div className="p-4 rounded-2xl bg-gradient-to-r from-emerald-50 via-teal-50 to-sky-50 border border-cyan-200 grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <div className="text-[11px] font-bold text-slate-500 mb-1">
                  วันที่เริ่มรับการรักษา (Admission Date {currentRole === 'admin' ? '- แก้ไขได้' : '- Read-Only'}):
                </div>
                {currentRole === 'admin' ? (
                  <input
                    type="date"
                    value={admissionDate}
                    onChange={(e) => setAdmissionDate(e.target.value)}
                    className="w-full px-3 py-1.5 rounded-xl bg-white border border-emerald-300 font-bold text-xs text-[#0F2F2B] outline-none focus:ring-2 focus:ring-emerald-400"
                  />
                ) : (
                  <div className="font-extrabold text-sm text-[#0F2F2B] mt-0.5">
                    {formatThaiDate(admissionDate)}
                  </div>
                )}
              </div>

              <div>
                <div className="flex items-center justify-between text-[11px] font-bold text-slate-700 mb-1">
                  <span>ความก้าวหน้าการฟื้นฟูโดยรวม (Overall Progress):</span>
                  <span className="text-emerald-800 font-extrabold">{progressPercent}%</span>
                </div>
                {currentRole === 'admin' ? (
                  <div className="flex items-center gap-2">
                    <input
                      type="range"
                      min={0}
                      max={100}
                      value={progressPercent}
                      onChange={(e) => setProgressPercent(Number(e.target.value))}
                      className="w-full accent-emerald-600 cursor-pointer"
                    />
                    <span className="font-mono font-bold text-xs w-9 text-right text-emerald-900">{progressPercent}%</span>
                  </div>
                ) : (
                  <div className="w-full h-3 rounded-full bg-white border border-emerald-300 overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-emerald-500 to-teal-500 rounded-full transition-all"
                      style={{ width: `${progressPercent}%` }}
                    />
                  </div>
                )}
              </div>

              {/* Super Admin Save Button for Admission Date and Progress */}
              {currentRole === 'admin' && (
                <div className="sm:col-span-2 flex justify-end pt-2 border-t border-cyan-200/60">
                  <button
                    type="button"
                    disabled={isSavingHistory}
                    onClick={handleSaveTreatmentHistory}
                    className="px-4 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs shadow-xs transition flex items-center gap-1.5 cursor-pointer active:scale-95"
                  >
                    <Save className="w-3.5 h-3.5" />
                    <span>บันทึกวันเริ่มรักษา & % พัฒนาการ (Save Treatment Progress)</span>
                  </button>
                </div>
              )}
            </div>

            {/* Medical Notes Log */}
            <div className="space-y-3">
              {currentRole === 'admin' ? (
                <div className="p-3 rounded-2xl bg-purple-50/90 border border-purple-200 text-purple-950 flex items-start gap-2">
                  <ShieldCheck className="w-4 h-4 text-purple-600 flex-shrink-0 mt-0.5" />
                  <div className="text-[11px] leading-relaxed">
                    <strong>สิทธิ์ผู้บริหารสูงสุด (Super Admin Unrestricted Clinical Edit):</strong> ผู้อำนวยการ รพ. สามารถตรวจสอบ, พิมพ์แก้ไข หรือลบประวัติบันทึกทางการแพทย์ย้อนหลังได้ทุกรายการ รวมถึงบันทึกโน้ตใหม่เพิ่มเติมได้ตลอดเวลา
                  </div>
                </div>
              ) : (
                <div className="p-3 rounded-2xl bg-emerald-50/80 border border-emerald-200 text-emerald-950 flex items-start gap-2">
                  <ShieldCheck className="w-4 h-4 text-emerald-600 flex-shrink-0 mt-0.5" />
                  <div className="text-[11px] leading-relaxed">
                    <strong>ระบบบันทึกเวชระเบียนแบบต่อท้ายถาวร (Append-Only Progress Notes System):</strong> บันทึกทางการแพทย์ในอดีตไม่สามารถแก้ไขหรือลบได้โดยนักกายภาพ เพื่อความถูกต้องของประวัติการรักษาตามมาตรฐานวิชาชีพ ทุกการบันทึกจะประทับเวลาและชื่อผู้บันทึกอัตโนมัติ: <code className="font-bold text-emerald-800">[DD/MM/YYYY HH:mm - Logged by PT: &lt;Name&gt;]</code>
                  </div>
                </div>
              )}

              <div className="flex items-center justify-between">
                <div className="font-bold text-slate-800 text-sm flex items-center gap-2">
                  <FileText className="w-4 h-4 text-emerald-600" />
                  <span>
                    {currentRole === 'admin'
                      ? 'ประวัติบันทึกทางการแพทย์ (Editable Clinical Notes):'
                      : 'ประวัติบันทึกทางการแพทย์ (Append-Only Medical Notes):'}
                  </span>
                </div>

                {!isAddingNote && (
                  <button
                    type="button"
                    onClick={() => setIsAddingNote(true)}
                    className="px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:opacity-95 text-white font-bold text-xs flex items-center gap-1.5 shadow-2xs transition active:scale-95 cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>+ {currentRole === 'admin' ? 'เพิ่มบันทึกโน้ตใหม่' : 'Append Medical Note'}</span>
                  </button>
                )}
              </div>

              {/* Add Note Form Inline */}
              {isAddingNote && (
                <div className="p-4 rounded-2xl bg-slate-50 border border-cyan-300 space-y-3 animate-fadeIn">
                  <div className="flex items-center justify-between">
                    <label className="block font-bold text-slate-700">New Note (บันทึกความก้าวหน้าทางการแพทย์ใหม่):</label>
                    <span className="text-[10px] font-mono font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full">
                      Stamps [{currentRole === 'admin' ? 'Logged by Super Admin' : 'Logged by PT'}: {currentUserName || 'ผู้บันทึก'}]
                    </span>
                  </div>
                  <textarea
                    rows={3}
                    value={newNoteText}
                    onChange={(e) => setNewNoteText(e.target.value)}
                    placeholder="พิมพ์บันทึกผลการรักษา อาการที่เปลี่ยนแปลง หรือคำแนะนำทางการแพทย์..."
                    className="w-full p-3 rounded-xl bg-white border border-slate-300 text-xs text-[#0F2F2B] outline-none focus:border-emerald-500"
                  />
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setIsAddingNote(false);
                        setNewNoteText('');
                      }}
                      className="px-3 py-1.5 rounded-xl border border-slate-300 text-slate-600 font-bold hover:bg-slate-100 cursor-pointer"
                    >
                      ยกเลิก
                    </button>
                    <button
                      type="button"
                      onClick={handleAddNote}
                      className="px-4 py-1.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 text-white font-bold hover:opacity-95 shadow-xs flex items-center gap-1.5 cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>+ บันทึกโน้ต (Append Note)</span>
                    </button>
                  </div>
                </div>
              )}

              {/* Notes Timeline List */}
              <div className="space-y-2.5">
                {notesHistory.length === 0 ? (
                  <div className="p-6 text-center text-slate-400 bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                    ยังไม่มีบันทึกประวัติทางการแพทย์สำหรับคนไข้รายนี้
                  </div>
                ) : (
                  notesHistory.map((note) => (
                    <div key={note.id} className="p-3.5 rounded-2xl bg-white border border-slate-200 shadow-2xs space-y-1.5 transition">
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="font-extrabold text-emerald-800">{note.author}</span>
                        <div className="flex items-center gap-2">
                          <span className="text-slate-500 font-mono">{note.date}</span>
                          {/* Super Admin Retrospective Edit / Delete Buttons */}
                          {currentRole === 'admin' && (
                            <div className="inline-flex items-center gap-1 ml-2">
                              <button
                                type="button"
                                onClick={() => handleStartEditNote(note)}
                                className="p-1 rounded-lg hover:bg-emerald-50 text-emerald-700 transition cursor-pointer"
                                title="แก้ไขโน้ตนี้ย้อนหลัง"
                              >
                                <Pencil className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteNote(note.id)}
                                className="p-1 rounded-lg hover:bg-rose-50 text-rose-600 transition cursor-pointer"
                                title="ลบโน้ตนี้"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          )}
                        </div>
                      </div>

                      {editingNoteId === note.id ? (
                        <div className="space-y-2 pt-1 animate-fadeIn">
                          <textarea
                            rows={3}
                            value={editingNoteText}
                            onChange={(e) => setEditingNoteText(e.target.value)}
                            className="w-full p-2.5 rounded-xl bg-slate-50 border border-emerald-300 text-xs text-[#0F2F2B] outline-none focus:ring-2 focus:ring-emerald-400"
                          />
                          <div className="flex justify-end gap-1.5">
                            <button
                              type="button"
                              onClick={() => {
                                setEditingNoteId(null);
                                setEditingNoteText('');
                              }}
                              className="px-2.5 py-1 rounded-lg border border-slate-300 text-slate-600 font-bold hover:bg-slate-100 cursor-pointer"
                            >
                              ยกเลิก
                            </button>
                            <button
                              type="button"
                              onClick={handleSaveEditedNote}
                              className="px-3 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold shadow-xs cursor-pointer"
                            >
                              บันทึกการแก้ไข
                            </button>
                          </div>
                        </div>
                      ) : (
                        <p className="text-slate-700 leading-relaxed font-medium">{note.text}</p>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}

        {/* Tab 3: Treatment Performance Dashboard (Read-Only Analytics) */}
        {activeTab === 'analytics' && (
          <div className="flex-1 overflow-y-auto p-6 space-y-5 text-xs">
            {/* Time Range Selector */}
            <div className="flex items-center justify-between bg-slate-50 p-2.5 rounded-2xl border border-slate-200">
              <span className="font-bold text-slate-700">ช่วงเวลาแสดงผล:</span>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setTimeRange('1w')}
                  className={`px-3 py-1 rounded-xl font-bold transition ${
                    timeRange === '1w' ? 'bg-emerald-600 text-white shadow-xs' : 'bg-white border text-slate-600 hover:text-emerald-700'
                  }`}
                >
                  สัปดาห์ล่าสุด (Last 1 Week)
                </button>
                <button
                  type="button"
                  onClick={() => setTimeRange('1m')}
                  className={`px-3 py-1 rounded-xl font-bold transition ${
                    timeRange === '1m' ? 'bg-emerald-600 text-white shadow-xs' : 'bg-white border text-slate-600 hover:text-emerald-700'
                  }`}
                >
                  เดือนล่าสุด (Last 1 Month)
                </button>
                <button
                  type="button"
                  onClick={() => setTimeRange('custom')}
                  className={`px-3 py-1 rounded-xl font-bold transition ${
                    timeRange === 'custom' ? 'bg-emerald-600 text-white shadow-xs' : 'bg-white border text-slate-600 hover:text-emerald-700'
                  }`}
                >
                  กำหนดเอง (Custom)
                </button>
              </div>
            </div>

            {/* Reps Counter & Accuracy Summary */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-center">
                <div className="text-[11px] font-bold text-emerald-800">จำนวนครั้งที่ถูกต้อง (Correct Reps)</div>
                <div className="text-2xl font-black text-emerald-700 mt-1">{totalCorrect} ครั้ง</div>
                <div className="text-[10px] text-emerald-600 font-semibold mt-0.5">ผ่านเกณฑ์องศาชีวกลศาสตร์</div>
              </div>

              <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-center">
                <div className="text-[11px] font-bold text-rose-800">ครั้งที่ผิดฟอร์ม (Incorrect Reps)</div>
                <div className="text-2xl font-black text-rose-700 mt-1">{totalIncorrect} ครั้ง</div>
                <div className="text-[10px] text-rose-600 font-semibold mt-0.5">องศาไม่ถึงเกณฑ์ / ตัวเอียง</div>
              </div>

              <div className="p-4 rounded-2xl bg-gradient-to-br from-cyan-50 to-blue-50 border border-cyan-200 text-center">
                <div className="text-[11px] font-bold text-cyan-800">อัตราความแม่นยำเฉลี่ย (Accuracy Rate)</div>
                <div className="text-2xl font-black text-cyan-700 mt-1">{overallAccuracy}%</div>
                <div className="text-[10px] text-cyan-600 font-semibold mt-0.5">ความสม่ำเสมอของท่ากายภาพ</div>
              </div>
            </div>

            {/* Reps Breakdown Table by Exercise */}
            <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-2xs">
              <div className="p-3 bg-slate-100 border-b border-slate-200 font-bold text-slate-700 flex items-center gap-2">
                <Activity className="w-4 h-4 text-emerald-600" />
                <span>สรุปผลการฝึกแยกตามรายท่า (Exercise Reps Breakdown):</span>
              </div>
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500 font-semibold bg-slate-50">
                    <th className="py-2 px-3">ชื่อท่ากายภาพ</th>
                    <th className="py-2 px-3 text-center">ทำถูก (ครั้ง)</th>
                    <th className="py-2 px-3 text-center">ทำผิด (ครั้ง)</th>
                    <th className="py-2 px-3 text-center">ความแม่นยำ</th>
                    <th className="py-2 px-3 text-center">องศาข้อต่อเฉลี่ย</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium">
                  {performanceExercises.map((ex, i) => (
                    <tr key={i} className="hover:bg-slate-50">
                      <td className="py-2.5 px-3 font-bold text-[#0F2F2B]">{ex.name}</td>
                      <td className="py-2.5 px-3 text-center font-bold text-emerald-700">{ex.correct}</td>
                      <td className="py-2.5 px-3 text-center font-bold text-rose-600">{ex.incorrect}</td>
                      <td className="py-2.5 px-3 text-center font-bold text-cyan-700">{ex.accuracy}%</td>
                      <td className="py-2.5 px-3 text-center font-mono font-bold text-slate-700">{ex.rom}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Training Frequency Calendar (Green/Red Session Dots) */}
            <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-2xs space-y-3">
              <div className="flex items-center justify-between font-bold text-slate-800">
                <span className="flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-emerald-600" />
                  <span>ปฏิทินความถี่การฝึกจริง (Training Frequency Calendar - จากตู้ Kiosk):</span>
                </span>
                <span className="text-[11px] text-slate-500">เดือนตุลาคม 2569</span>
              </div>

              <div className="flex items-center gap-4 text-[11px] font-bold text-slate-600">
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                  <span>เข้าฝึกสำเร็จ (Completed)</span>
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-rose-500" />
                  <span>ขาดนัด (Missed)</span>
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-slate-200" />
                  <span>ไม่มีนัด (Rest)</span>
                </span>
              </div>

              <div className="grid grid-cols-15 gap-1.5 pt-1">
                {sessionStatusCalendar.map((item) => (
                  <div
                    key={item.day}
                    className="p-1.5 rounded-xl border flex flex-col items-center justify-center text-center gap-1 bg-slate-50"
                  >
                    <span className="font-bold text-[10px] text-slate-600">{item.day}</span>
                    <span
                      className={`w-3 h-3 rounded-full ${
                        item.status === 'completed'
                          ? 'bg-emerald-500 shadow-xs'
                          : item.status === 'missed'
                          ? 'bg-rose-500 animate-pulse'
                          : 'bg-slate-200'
                      }`}
                      title={`วันที่ ${item.day}: ${item.status}`}
                    />
                  </div>
                ))}
              </div>
            </div>

            <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-[11px] font-medium">
              ⚠️ หมายเหตุสถาปัตยกรรม: หน้านี้แสดงผลเชิงวิเคราะห์เท่านั้น การจัดตารางนัดหมายและการมอบหมายชุดท่ากายภาพจะกระทำในโมดูลที่ 3 (Therapy Routine & Schedule Planner)
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="px-6 py-3 border-t border-slate-100 bg-slate-50 flex items-center justify-between">
          <div className="text-[11px] text-slate-500 font-medium">
            บันทึกการรักษาจะถูกเชื่อมโยงเป็น Single Source of Truth กับตู้ Kiosk และระบบกลางอัตโนมัติ
          </div>

          <button
            type="button"
            onClick={onClose}
            className="px-6 py-2 rounded-xl bg-slate-200 hover:bg-slate-300 text-slate-800 font-bold text-xs transition cursor-pointer"
          >
            ปิดหน้าต่าง
          </button>
        </div>
      </div>
    </div>
  );
};
