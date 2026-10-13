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
  Lock,
  CheckCircle2,
  Ban,
  HeartPulse,
} from 'lucide-react';
import { UserAccount, UserRole, PhysicalTherapist, UserStatus } from '../../types/hospital';

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
  // Section 1: Personal Info
  const [name, setName] = useState<string>('');
  const [age, setAge] = useState<number | string>(65);
  const [gender, setGender] = useState<'male' | 'female' | 'other'>('male');
  const [phone, setPhone] = useState<string>('');
  const [createdAt, setCreatedAt] = useState<string>('');

  // Section 2: Clinical & Treatment Info
  const [assignedTherapistId, setAssignedTherapistId] = useState<number | string>(1);
  const [assignedTherapistName, setAssignedTherapistName] = useState<string>('');
  const [chiefComplaint, setChiefComplaint] = useState<string>('');
  const [patientBackground, setPatientBackground] = useState<string>('');
  const [treatmentOutcome, setTreatmentOutcome] = useState<string>('');
  const [therapistNotes, setTherapistNotes] = useState<string>('');

  // Section 3: Status
  const [status, setStatus] = useState<UserStatus>('active');

  // Validation Errors
  const [errors, setErrors] = useState<{
    name?: string;
    age?: string;
    phone?: string;
  }>({});

  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  // Pre-fill existing data
  useEffect(() => {
    if (isOpen && patient) {
      setName(patient.name || '');
      setAge(patient.age ?? 65);
      setGender(patient.gender || 'male');
      setPhone(patient.phone || '');
      setCreatedAt(patient.created_at || new Date().toISOString().split('T')[0]);

      // Match therapist
      const matchedTherapist =
        therapists.find((t) => t.id === patient.assignedTherapistId) ||
        therapists.find((t) => t.name === patient.assignedTherapistName) ||
        therapists[0];

      setAssignedTherapistId(matchedTherapist ? matchedTherapist.id : 1);
      setAssignedTherapistName(
        patient.assignedTherapistName || (matchedTherapist ? matchedTherapist.name : 'กภ. ธนากร วงศ์สวัสดิ์')
      );

      setChiefComplaint(patient.chiefComplaint || patient.diagnosis || '');
      setPatientBackground(patient.patientBackground || '');
      setTreatmentOutcome(patient.treatmentOutcome || '');
      setTherapistNotes(patient.therapistNotes || '');
      setStatus(patient.status || 'active');

      setErrors({});
      setIsSubmitting(false);
    }
  }, [isOpen, patient, therapists]);

  if (!isOpen || !patient) return null;

  const validate = (): boolean => {
    const newErrors: typeof errors = {};

    if (!name.trim()) {
      newErrors.name = 'กรุณาระบุชื่อ-นามสกุลของคนไข้';
    }

    const ageNum = Number(age);
    if (isNaN(ageNum) || ageNum <= 0 || ageNum > 130) {
      newErrors.age = 'กรุณาระบุอายุให้ถูกต้อง (1 - 130 ปี)';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleTherapistChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const thId = Number(e.target.value);
    const th = therapists.find((t) => t.id === thId);
    setAssignedTherapistId(thId);
    if (th) {
      setAssignedTherapistName(th.name);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canEdit) return;
    if (!validate()) return;

    setIsSubmitting(true);

    const finalStatus: UserStatus = status === 'pending_info' ? 'active' : status;

    const updatedData: Partial<UserAccount> = {
      name: name.trim(),
      age: Number(age) || 65,
      gender,
      phone: phone.trim() || undefined,
      created_at: createdAt,
      assignedTherapistId,
      assignedTherapistName,
      chiefComplaint: chiefComplaint.trim() || undefined,
      patientBackground: patientBackground.trim() || undefined,
      treatmentOutcome: treatmentOutcome.trim() || undefined,
      therapistNotes: therapistNotes.trim() || undefined,
      status: finalStatus,
    };

    onSavePatient(patient.id, updatedData);
    onSuccessToast(
      patient.status === 'pending_info'
        ? `✓ บันทึกข้อมูลของ ${name.trim()} (${patient.code}) และซิงค์ไปยังตู้ Kiosk เรียบร้อยแล้ว`
        : `บันทึกข้อมูลของ ${name.trim()} (${patient.code}) เรียบร้อยแล้ว`
    );
    setIsSubmitting(false);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-[#0F2F2B]/70 backdrop-blur-sm animate-fadeIn"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl sm:max-w-3xl bg-white rounded-[28px] sm:rounded-3xl shadow-2xl border border-emerald-200 overflow-hidden flex flex-col max-h-[92vh] animate-slideUp"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ================================================================= */}
        {/* 1. MODAL HEADER                                                   */}
        {/* ================================================================= */}
        <div className="px-6 py-4 border-b border-emerald-100 bg-gradient-to-r from-emerald-50/80 via-white to-emerald-50/40 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-[#10B981] text-white flex items-center justify-center shadow-md shadow-emerald-500/20">
              <HeartPulse className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-extrabold text-base sm:text-lg text-[#0F2F2B] flex items-center gap-2">
                <span>{canEdit ? 'แก้ไขข้อมูลคนไข้' : 'ดูข้อมูลคนไข้'}</span>
                <span className="text-xs px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-mono font-bold">
                  {patient.code}
                </span>
              </h3>
              <p className="text-[11px] text-emerald-800 font-medium">
                {patient.name} ({patient.code})
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-full text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition cursor-pointer"
            aria-label="ปิดหน้าต่าง"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Pending Kiosk Scan Info Banner */}
        {patient.status === 'pending_info' && (
          <div className="px-6 py-3 bg-gradient-to-r from-amber-500 via-amber-600 to-amber-700 text-white flex items-center justify-between text-xs font-bold shadow-inner">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-white animate-ping" />
              <span>
                🔔 <strong>บัญชีนี้สแกนหน้าจากตู้ Kiosk แล้ว (รอลงข้อมูลส่วนตัว)</strong> — เมื่อกรอกข้อมูลเสร็จและกดบันทึก ระบบจะเปิดใช้งานและซิงค์แจ้งเตือนกลับไปยังตู้ Kiosk อัตโนมัติ
              </span>
            </div>
            <span className="px-2.5 py-0.5 rounded-full bg-black/25 text-amber-100 font-mono text-[11px] font-black shrink-0">
              {patient.code}
            </span>
          </div>
        )}

        {/* Permission Restriction Banner (if read-only) */}
        {!canEdit && (
          <div className="px-6 py-2.5 bg-amber-50 border-b border-amber-200 flex items-center gap-2 text-xs text-amber-900 font-medium">
            <Lock className="w-4 h-4 text-amber-600 flex-shrink-0" />
            <span>
              <strong>โหมดดูข้อมูลเท่านั้น:</strong> คุณเข้าสู่ระบบในฐานะนักกายภาพ แต่คนไข้ท่านนี้อยู่ในความดูแลของ{' '}
              <strong className="underline">{patient.assignedTherapistName || 'นักกายภาพท่านอื่น'}</strong>{' '}
              (สามารถดูเวชระเบียนได้ แต่ไม่สามารถแก้ไขข้อมูล)
            </span>
          </div>
        )}

        {/* ================================================================= */}
        {/* 2. FORM BODY (Scrollable)                                         */}
        {/* ================================================================= */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-6 py-5 space-y-5 text-xs">
          {/* --------------------------------------------------------------- */}
          {/* SECTION 1: ข้อมูลส่วนตัว (Personal Information)                  */}
          {/* --------------------------------------------------------------- */}
          <div className="space-y-3.5 bg-stone-50/70 p-4 sm:p-5 rounded-2xl border border-stone-200/80">
            <div className="flex items-center justify-between border-b border-stone-200/60 pb-2">
              <div className="font-bold text-sm text-[#0F2F2B] flex items-center gap-2">
                <span className="w-5 h-5 rounded-full bg-emerald-100 text-emerald-800 text-[11px] font-bold flex items-center justify-center">
                  1
                </span>
                <span>ข้อมูลส่วนตัว (Personal Information)</span>
              </div>
              <span className="text-[10px] text-slate-400 font-medium">* จำเป็นต้องกรอก</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-12 gap-3.5">
              {/* ชื่อ-นามสกุล */}
              <div className="sm:col-span-6">
                <label className="block text-slate-700 font-bold mb-1">
                  ชื่อ-นามสกุล <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <User className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    disabled={!canEdit}
                    value={name}
                    onChange={(e) => {
                      setName(e.target.value);
                      if (errors.name) setErrors({ ...errors, name: undefined });
                    }}
                    placeholder="เช่น นายสมชาย ใจดี"
                    className={`w-full pl-9 pr-3.5 py-2.5 rounded-2xl border text-xs font-semibold focus:outline-none focus:ring-2 ${
                      !canEdit
                        ? 'bg-slate-100 text-slate-600 border-slate-200 cursor-not-allowed'
                        : errors.name
                        ? 'border-rose-400 focus:ring-rose-400 bg-rose-50/30'
                        : 'border-stone-200 focus:ring-[#10B981] bg-white text-slate-800'
                    }`}
                  />
                </div>
                {errors.name && <p className="text-[11px] text-rose-500 mt-1 font-medium">{errors.name}</p>}
              </div>

              {/* อายุ */}
              <div className="sm:col-span-3">
                <label className="block text-slate-700 font-bold mb-1">
                  อายุ (ปี) <span className="text-rose-500">*</span>
                </label>
                <input
                  type="number"
                  min={1}
                  max={130}
                  disabled={!canEdit}
                  value={age}
                  onChange={(e) => {
                    setAge(e.target.value);
                    if (errors.age) setErrors({ ...errors, age: undefined });
                  }}
                  className={`w-full px-3.5 py-2.5 rounded-2xl border text-xs font-bold text-center focus:outline-none focus:ring-2 ${
                    !canEdit
                      ? 'bg-slate-100 text-slate-600 border-slate-200 cursor-not-allowed'
                      : errors.age
                      ? 'border-rose-400 focus:ring-rose-400 bg-rose-50/30'
                      : 'border-stone-200 focus:ring-[#10B981] bg-white text-slate-800'
                  }`}
                  placeholder="65"
                />
                {errors.age && <p className="text-[11px] text-rose-500 mt-1 font-medium">{errors.age}</p>}
              </div>

              {/* เพศ */}
              <div className="sm:col-span-3">
                <label className="block text-slate-700 font-bold mb-1">เพศ</label>
                <div className="grid grid-cols-3 gap-1">
                  <button
                    type="button"
                    disabled={!canEdit}
                    onClick={() => setGender('male')}
                    className={`py-2 rounded-xl text-[11px] font-bold transition border cursor-pointer ${
                      gender === 'male'
                        ? 'bg-emerald-500 text-white border-emerald-600 shadow-sm'
                        : 'bg-white text-slate-600 border-stone-200 hover:border-emerald-300'
                    } ${!canEdit ? 'cursor-not-allowed opacity-80' : ''}`}
                  >
                    ชาย
                  </button>
                  <button
                    type="button"
                    disabled={!canEdit}
                    onClick={() => setGender('female')}
                    className={`py-2 rounded-xl text-[11px] font-bold transition border cursor-pointer ${
                      gender === 'female'
                        ? 'bg-emerald-500 text-white border-emerald-600 shadow-sm'
                        : 'bg-white text-slate-600 border-stone-200 hover:border-emerald-300'
                    } ${!canEdit ? 'cursor-not-allowed opacity-80' : ''}`}
                  >
                    หญิง
                  </button>
                  <button
                    type="button"
                    disabled={!canEdit}
                    onClick={() => setGender('other')}
                    className={`py-2 rounded-xl text-[11px] font-bold transition border cursor-pointer ${
                      gender === 'other'
                        ? 'bg-emerald-500 text-white border-emerald-600 shadow-sm'
                        : 'bg-white text-slate-600 border-stone-200 hover:border-emerald-300'
                    } ${!canEdit ? 'cursor-not-allowed opacity-80' : ''}`}
                  >
                    อื่นๆ
                  </button>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 pt-1">
              {/* เบอร์โทรศัพท์ */}
              <div>
                <label className="block text-slate-700 font-bold mb-1">เบอร์โทรศัพท์ติดต่อ</label>
                <div className="relative">
                  <Phone className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="tel"
                    disabled={!canEdit}
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="เช่น 081-234-5678"
                    className={`w-full pl-9 pr-3.5 py-2.5 rounded-2xl border text-xs font-semibold focus:outline-none focus:ring-2 ${
                      !canEdit
                        ? 'bg-slate-100 text-slate-600 border-slate-200 cursor-not-allowed'
                        : 'border-stone-200 focus:ring-[#10B981] bg-white text-slate-800'
                    }`}
                  />
                </div>
              </div>

              {/* วันที่เริ่มเข้าระบบ */}
              <div>
                <label className="block text-slate-700 font-bold mb-1">วันที่เริ่มเข้าระบบ</label>
                <div className="relative">
                  <Calendar className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="date"
                    disabled={!canEdit}
                    value={createdAt}
                    onChange={(e) => setCreatedAt(e.target.value)}
                    className={`w-full pl-9 pr-3.5 py-2.5 rounded-2xl border text-xs font-semibold focus:outline-none focus:ring-2 ${
                      !canEdit
                        ? 'bg-slate-100 text-slate-600 border-slate-200 cursor-not-allowed'
                        : 'border-stone-200 focus:ring-[#10B981] bg-white text-slate-800'
                    }`}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* --------------------------------------------------------------- */}
          {/* SECTION 2: ข้อมูลการรักษา (Clinical Details)                     */}
          {/* --------------------------------------------------------------- */}
          <div className="space-y-3.5 bg-stone-50/70 p-4 sm:p-5 rounded-2xl border border-stone-200/80">
            <div className="flex items-center justify-between border-b border-stone-200/60 pb-2">
              <div className="font-bold text-sm text-[#0F2F2B] flex items-center gap-2">
                <span className="w-5 h-5 rounded-full bg-emerald-100 text-emerald-800 text-[11px] font-bold flex items-center justify-center">
                  2
                </span>
                <span>ข้อมูลการรักษาและเวชระเบียน (Clinical Details)</span>
              </div>
            </div>

            {/* หมอ/นักกายภาพที่รับผิดชอบ */}
            <div>
              <label className="block text-slate-700 font-bold mb-1 flex items-center gap-1.5">
                <Stethoscope className="w-4 h-4 text-emerald-600" />
                <span>หมอ/นักกายภาพที่รับผิดชอบ (Assigned Physical Therapist)</span>
              </label>
              <select
                disabled={!canEdit || currentRole === 'therapist'}
                value={assignedTherapistId}
                onChange={handleTherapistChange}
                className={`w-full px-3.5 py-2.5 rounded-2xl border text-xs font-bold focus:outline-none focus:ring-2 ${
                  !canEdit || currentRole === 'therapist'
                    ? 'bg-slate-100 text-slate-600 border-slate-200 cursor-not-allowed'
                    : 'border-stone-200 focus:ring-[#10B981] bg-white text-slate-800 cursor-pointer'
                }`}
              >
                {therapists.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} ({t.specialty.split('(')[0].trim()})
                  </option>
                ))}
              </select>
              {currentRole === 'therapist' && (
                <p className="text-[10px] text-slate-400 mt-1">
                  * นักกายภาพไม่สามารถโอนย้ายเคสไปยังนักกายภาพท่านอื่นได้ กรุณาติดต่อแอดมินหากต้องการเปลี่ยนผู้ดูแล
                </p>
              )}
            </div>

            {/* ประวัติการซักประวัติ */}
            <div>
              <label className="block text-slate-700 font-bold mb-1 flex items-center gap-1.5">
                <FileText className="w-3.5 h-3.5 text-emerald-600" />
                <span>ประวัติการซักประวัติ / อาการสำคัญ (Chief Complaint & History)</span>
              </label>
              <textarea
                rows={2}
                disabled={!canEdit}
                value={chiefComplaint}
                onChange={(e) => setChiefComplaint(e.target.value)}
                placeholder="รายละเอียดอาการตอนเริ่มเข้ารับการรักษา เช่น ปวดไหล่ข้างขวา ยกแขนได้ไม่เกิน 80 องศา มีอาการมาแล้ว 3 สัปดาห์..."
                className={`w-full p-3.5 rounded-2xl border text-xs leading-relaxed focus:outline-none focus:ring-2 ${
                  !canEdit
                    ? 'bg-slate-100 text-slate-600 border-slate-200 cursor-not-allowed'
                    : 'border-stone-200 focus:ring-[#10B981] bg-white text-slate-800'
                }`}
              />
            </div>

            {/* ประวัติคนไข้ / ประวัติโรค */}
            <div>
              <label className="block text-slate-700 font-bold mb-1">
                ประวัติคนไข้ตามปกติ / ประวัติโรคประจำตัว (Patient Background)
              </label>
              <textarea
                rows={2}
                disabled={!canEdit}
                value={patientBackground}
                onChange={(e) => setPatientBackground(e.target.value)}
                placeholder="ประวัติโรคประจำตัว ยาที่ทาน การผ่าตัดในอดีต เช่น ความดันโลหิตสูง ไม่มีประวัติผ่าตัดข้อ..."
                className={`w-full p-3.5 rounded-2xl border text-xs leading-relaxed focus:outline-none focus:ring-2 ${
                  !canEdit
                    ? 'bg-slate-100 text-slate-600 border-slate-200 cursor-not-allowed'
                    : 'border-stone-200 focus:ring-[#10B981] bg-white text-slate-800'
                }`}
              />
            </div>

            {/* ผลการรักษา / Outcome / ROM */}
            <div>
              <label className="block text-slate-700 font-bold mb-1 flex items-center gap-1.5">
                <Activity className="w-3.5 h-3.5 text-emerald-600" />
                <span>ผลการรักษา / ความก้าวหน้าชีวกลศาสตร์ (Treatment Outcome & ROM Progress)</span>
              </label>
              <textarea
                rows={2}
                disabled={!canEdit}
                value={treatmentOutcome}
                onChange={(e) => setTreatmentOutcome(e.target.value)}
                placeholder="บันทึกผลการรักษา องศาข้อต่อที่พัฒนาขึ้น ระดับความปวด VAS score..."
                className={`w-full p-3.5 rounded-2xl border text-xs leading-relaxed focus:outline-none focus:ring-2 ${
                  !canEdit
                    ? 'bg-slate-100 text-slate-600 border-slate-200 cursor-not-allowed'
                    : 'border-stone-200 focus:ring-[#10B981] bg-white text-slate-800'
                }`}
              />
            </div>

            {/* โน้ตคำแนะนำจากนักกายภาพ (Highlight Distinct Color) */}
            <div className="bg-gradient-to-br from-emerald-50 via-emerald-50/70 to-teal-50/50 p-4 rounded-2xl border-2 border-emerald-300 shadow-sm space-y-2">
              <label className="block text-emerald-900 font-extrabold text-xs flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <Sparkles className="w-4 h-4 text-emerald-600" />
                  <span>โน้ต / ข้อความคำแนะนำจากนักกายภาพ (Therapist Clinical Directives)</span>
                </span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-200/80 text-emerald-900 font-bold">
                  ข้อความคำแนะนำคนไข้
                </span>
              </label>
              <textarea
                rows={3}
                disabled={!canEdit}
                value={therapistNotes}
                onChange={(e) => setTherapistNotes(e.target.value)}
                placeholder="ข้อความแนะนำและตารางฝึกที่มอบหมาย เช่น เน้นฝึกยืดเหยียดเบาๆ สม่ำเสมอ ไม่ฝืนยกของหนักเกิน 3 กก. หากปวดแปลบให้หยุดพัก..."
                className={`w-full p-3.5 rounded-2xl border text-xs leading-relaxed focus:outline-none focus:ring-2 font-medium ${
                  !canEdit
                    ? 'bg-white/80 text-emerald-950 border-emerald-200 cursor-not-allowed'
                    : 'border-emerald-300 bg-white text-emerald-950 focus:ring-[#10B981]'
                }`}
              />
            </div>
          </div>

          {/* --------------------------------------------------------------- */}
          {/* SECTION 3: สถานะบัญชี (Account Status)                          */}
          {/* --------------------------------------------------------------- */}
          <div className="space-y-3.5 bg-stone-50/70 p-4 sm:p-5 rounded-2xl border border-stone-200/80">
            <div className="flex items-center justify-between border-b border-stone-200/60 pb-2">
              <div className="font-bold text-sm text-[#0F2F2B] flex items-center gap-2">
                <span className="w-5 h-5 rounded-full bg-emerald-100 text-emerald-800 text-[11px] font-bold flex items-center justify-center">
                  3
                </span>
                <span>สถานะบัญชี (Account Status)</span>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <button
                type="button"
                disabled={!canEdit}
                onClick={() => setStatus('active')}
                className={`p-3.5 rounded-2xl border text-left flex items-start gap-3 transition cursor-pointer ${
                  status === 'active'
                    ? 'bg-emerald-50 border-emerald-400 shadow-sm'
                    : 'bg-white border-stone-200 hover:border-emerald-200'
                } ${!canEdit ? 'cursor-not-allowed opacity-80' : ''}`}
              >
                <div
                  className={`w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 ${
                    status === 'active'
                      ? 'bg-emerald-500 text-white'
                      : 'bg-stone-100 text-stone-400'
                  }`}
                >
                  <CheckCircle2 className="w-4 h-4" />
                </div>
                <div>
                  <div className="font-bold text-xs text-[#0F2F2B]">ใช้งานอยู่ (Active)</div>
                  <div className="text-[11px] text-slate-500 mt-0.5">
                    คนไข้สามารถเข้าสู่ระบบฝึกที่ตู้ Kiosk และบันทึกข้อมูลได้ตามปกติ
                  </div>
                </div>
              </button>

              <button
                type="button"
                disabled={!canEdit}
                onClick={() => setStatus('suspended')}
                className={`p-3.5 rounded-2xl border text-left flex items-start gap-3 transition cursor-pointer ${
                  status === 'suspended'
                    ? 'bg-rose-50 border-rose-400 shadow-sm'
                    : 'bg-white border-stone-200 hover:border-rose-200'
                } ${!canEdit ? 'cursor-not-allowed opacity-80' : ''}`}
              >
                <div
                  className={`w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 ${
                    status === 'suspended'
                      ? 'bg-rose-500 text-white'
                      : 'bg-stone-100 text-stone-400'
                  }`}
                >
                  <Ban className="w-4 h-4" />
                </div>
                <div>
                  <div className="font-bold text-xs text-rose-900">ระงับบัญชี (Suspended)</div>
                  <div className="text-[11px] text-slate-500 mt-0.5">
                    ระงับการเข้าใช้งานตู้ชั่วคราว ข้อมูลเวชระเบียนยังคงอยู่ครบถ้วน
                  </div>
                </div>
              </button>
            </div>
          </div>
        </form>

        {/* ================================================================= */}
        {/* 3. MODAL FOOTER                                                   */}
        {/* ================================================================= */}
        <div className="px-6 py-4 border-t border-emerald-100 bg-stone-50/50 flex items-center justify-end gap-3 flex-shrink-0">
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="px-4 py-2.5 rounded-full border border-stone-300 text-slate-700 font-bold text-xs hover:bg-stone-100 transition cursor-pointer"
          >
            {canEdit ? 'ยกเลิก' : 'ปิดหน้าต่าง'}
          </button>

          {canEdit && (
            <button
              type="button"
              onClick={handleSubmit}
              disabled={isSubmitting}
              className="px-6 py-2.5 rounded-full bg-[#10B981] hover:bg-emerald-600 active:bg-emerald-700 text-white font-bold text-xs shadow-md shadow-emerald-500/20 transition flex items-center gap-2 cursor-pointer disabled:opacity-50"
            >
              {isSubmitting ? (
                <>
                  <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>กำลังบันทึก...</span>
                </>
              ) : (
                <>
                  <Check className="w-4 h-4" />
                  <span>
                    {patient.status === 'pending_info'
                      ? '✓ บันทึกข้อมูลและซิงค์ตู้ Kiosk ทันที'
                      : 'บันทึกการแก้ไข'}
                  </span>
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
