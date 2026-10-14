import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  User,
  Phone,
  Mail,
  Award,
  Stethoscope,
  BookOpen,
  Users,
  Plus,
  Trash2,
  Check,
  AlertCircle,
  Lock,
  Activity,
  ShieldAlert,
  Clock,
  Sparkles,
  Info,
} from 'lucide-react';
import { UserAccount, UserRole, PhysicalTherapist } from '../../types/hospital';

export interface EditTherapistModalProps {
  isOpen: boolean;
  onClose: () => void;
  therapist: PhysicalTherapist | null;
  allPatients: UserAccount[];
  currentRole: UserRole;
  currentUserId: number | string;
  currentUserName: string;
  canEdit: boolean;
  onSaveTherapist: (therapistId: number | string, data: Partial<PhysicalTherapist>) => void;
  onSuccessToast: (msg: string) => void;
}

const SPECIALTY_PRESETS = [
  'กายภาพบำบัดระบบกล้ามเนื้อและกระดูก (Orthopedic PT)',
  'กายภาพบำบัดระบบประสาทและผู้สูงอายุ (Neurological & Geriatric PT)',
  'ฟื้นฟูสมรรถภาพหัวใจและปอด (Cardiopulmonary PT)',
  'กายภาพบำบัดทางการกีฬา (Sports Rehabilitation PT)',
  'กายภาพบำบัดเด็กและพัฒนาการ (Pediatric PT)',
  'กายภาพบำบัดสำหรับผู้ป่วยติดเตียงและการฟื้นฟูชุมชน (Community PT)',
];

export const EditTherapistModal: React.FC<EditTherapistModalProps> = ({
  isOpen,
  onClose,
  therapist,
  allPatients,
  currentRole,
  canEdit,
  onSaveTherapist,
  onSuccessToast,
}) => {
  // Section 1: ข้อมูลส่วนตัว
  const [name, setName] = useState<string>('');
  const [phone, setPhone] = useState<string>('');
  const [email, setEmail] = useState<string>('');
  const [licenseNumber, setLicenseNumber] = useState<string>('');

  // Section 2: ข้อมูลวิชาชีพ
  const [specialty, setSpecialty] = useState<string>('');
  const [bio, setBio] = useState<string>('');
  const [status, setStatus] = useState<'active' | 'on_leave' | 'suspended'>('active');

  // Section 3: เคสที่รับผิดชอบ
  const [assignedCases, setAssignedCases] = useState<string[]>([]);
  const [selectedPatientToAdd, setSelectedPatientToAdd] = useState<string>('');
  const [customCaseInput, setCustomCaseInput] = useState<string>('');
  const [isAddingCustom, setIsAddingCustom] = useState<boolean>(false);

  // Form State
  const [errors, setErrors] = useState<{
    name?: string;
    phone?: string;
    email?: string;
    licenseNumber?: string;
  }>({});
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const prevTherapistKeyRef = useRef<string | null>(null);

  // Pre-fill existing data whenever modal opens with a therapist
  useEffect(() => {
    if (isOpen && therapist) {
      const therapistKey = `${therapist.id}_${therapist.code || therapist.name}`;
      if (prevTherapistKeyRef.current === therapistKey) {
        return; // Don't wipe inputs if already editing this therapist
      }
      prevTherapistKeyRef.current = therapistKey;

      setName(therapist.name || '');
      setPhone(therapist.phone || '');
      setEmail(therapist.email || '');
      setLicenseNumber(therapist.licenseNumber || '');
      setSpecialty(therapist.specialty || SPECIALTY_PRESETS[0]);
      setBio(therapist.bio || '');
      setStatus(therapist.status || 'active');
      setAssignedCases(therapist.assignedCases ? [...therapist.assignedCases] : []);
      setSelectedPatientToAdd('');
      setCustomCaseInput('');
      setIsAddingCustom(false);
      setErrors({});
      setIsSubmitting(false);
    } else if (!isOpen) {
      prevTherapistKeyRef.current = null;
    }
  }, [isOpen, therapist]);

  if (!isOpen || !therapist) return null;

  // Validation
  const validate = (): boolean => {
    const newErrors: typeof errors = {};

    if (!name.trim()) {
      newErrors.name = 'กรุณาระบุชื่อ-นามสกุล';
    }

    if (email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      newErrors.email = 'รูปแบบอีเมลไม่ถูกต้อง';
    }

    if (phone.trim() && !/^0[0-9-]{8,12}$/.test(phone.trim().replace(/\s/g, ''))) {
      newErrors.phone = 'รูปแบบเบอร์โทรศัพท์ไม่ถูกต้อง (เช่น 081-234-5678)';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // Add Case (Admin only)
  const handleAddPatientCase = () => {
    if (currentRole !== 'admin') return;

    const patientToAdd = isAddingCustom ? customCaseInput.trim() : selectedPatientToAdd.trim();
    if (!patientToAdd) return;

    if (assignedCases.includes(patientToAdd)) {
      return;
    }

    setAssignedCases((prev) => [...prev, patientToAdd]);
    setSelectedPatientToAdd('');
    setCustomCaseInput('');
    setIsAddingCustom(false);
  };

  // Remove Case (Admin only)
  const handleRemovePatientCase = (caseToRemove: string) => {
    if (currentRole !== 'admin') return;
    setAssignedCases((prev) => prev.filter((c) => c !== caseToRemove));
  };

  // Submit Handler
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canEdit) return;
    if (!validate()) return;

    setIsSubmitting(true);

    const updatedData: Partial<PhysicalTherapist> = {
      name: name.trim(),
      phone: phone.trim(),
      email: email.trim(),
      licenseNumber: licenseNumber.trim(),
      specialty: specialty.trim(),
      bio: bio.trim(),
      status,
      assignedCases,
      activePatientsCount: assignedCases.length,
    };

    onSaveTherapist(therapist.id, updatedData);
    onSuccessToast(`บันทึกข้อมูลของ ${name.trim()} (${therapist.code}) เรียบร้อยแล้ว`);
    setIsSubmitting(false);
    onClose();
  };

  // Patients available to assign (not already in assignedCases)
  const availablePatients = allPatients
    .filter((p) => p.role === 'patient')
    .map((p) => `${p.name} (${p.code})`)
    .filter((pLabel) => !assignedCases.includes(pLabel));

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
            <div className="w-10 h-10 rounded-2xl bg-[#0F2F2B] text-emerald-300 flex items-center justify-center shadow-md font-bold text-base">
              {therapist.name.charAt(therapist.name.startsWith('กภ.') ? 4 : 0) || 'T'}
            </div>
            <div>
              <h3 className="font-extrabold text-base sm:text-lg text-[#0F2F2B] flex items-center gap-2">
                <span>{canEdit ? 'แก้ไขข้อมูลนักกายภาพ' : 'ข้อมูลนักกายภาพ'}</span>
                <span className="text-xs px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-mono font-bold">
                  {therapist.code}
                </span>
                <span
                  className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${
                    status === 'active'
                      ? 'bg-emerald-100 text-emerald-800'
                      : status === 'on_leave'
                      ? 'bg-amber-100 text-amber-800'
                      : 'bg-rose-100 text-rose-800'
                  }`}
                >
                  {status === 'active' ? 'ปฏิบัติงาน' : status === 'on_leave' ? 'ลาพัก' : 'ระงับ'}
                </span>
              </h3>
              <p className="text-[11px] text-emerald-800 font-medium">
                {therapist.name} • {therapist.code}
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

        {/* Permission Restriction Banner (if read-only) */}
        {!canEdit && (
          <div className="px-6 py-2.5 bg-amber-50 border-b border-amber-200 flex items-center gap-2 text-xs text-amber-900 font-medium">
            <Lock className="w-4 h-4 text-amber-600 flex-shrink-0" />
            <span>
              <strong>โหมดดูข้อมูลเท่านั้น:</strong> คุณสามารถแก้ไขได้เฉพาะข้อมูลบัญชีของตนเองเท่านั้น (เข้าสู่ระบบด้วยสิทธิ์ผู้ดูแลระบบ Admin เพื่อแก้ไขนักกายภาพทุกท่าน)
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
                <span>ส่วนที่ 1: ข้อมูลส่วนตัว</span>
              </div>
              <span className="text-[11px] text-slate-400">* จำเป็นต้องระบุ</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              {/* Full Name */}
              <div className="sm:col-span-2">
                <label className="block text-slate-700 font-bold mb-1">
                  ชื่อ-นามสกุล <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <User className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => {
                      setName(e.target.value);
                      if (errors.name) setErrors({ ...errors, name: undefined });
                    }}
                    disabled={!canEdit}
                    placeholder="เช่น กภ. ธนากร วงศ์สวัสดิ์"
                    className={`w-full pl-9 pr-3.5 py-2.5 rounded-xl border ${
                      errors.name ? 'border-rose-300 ring-2 ring-rose-100' : 'border-emerald-200'
                    } text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-[#10B981] disabled:bg-slate-100 disabled:text-slate-500`}
                  />
                </div>
                {errors.name && (
                  <p className="text-[11px] text-rose-500 font-semibold mt-1 flex items-center gap-1">
                    <AlertCircle className="w-3 h-3" />
                    <span>{errors.name}</span>
                  </p>
                )}
              </div>

              {/* Phone */}
              <div>
                <label className="block text-slate-700 font-bold mb-1">เบอร์โทรศัพท์</label>
                <div className="relative">
                  <Phone className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={phone}
                    onChange={(e) => {
                      setPhone(e.target.value);
                      if (errors.phone) setErrors({ ...errors, phone: undefined });
                    }}
                    disabled={!canEdit}
                    placeholder="เช่น 081-456-7890"
                    className={`w-full pl-9 pr-3.5 py-2.5 rounded-xl border ${
                      errors.phone ? 'border-rose-300 ring-2 ring-rose-100' : 'border-emerald-200'
                    } text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-[#10B981] disabled:bg-slate-100 disabled:text-slate-500`}
                  />
                </div>
                {errors.phone && (
                  <p className="text-[11px] text-rose-500 font-semibold mt-1 flex items-center gap-1">
                    <AlertCircle className="w-3 h-3" />
                    <span>{errors.phone}</span>
                  </p>
                )}
              </div>

              {/* Email */}
              <div>
                <label className="block text-slate-700 font-bold mb-1">อีเมล</label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      if (errors.email) setErrors({ ...errors, email: undefined });
                    }}
                    disabled={!canEdit}
                    placeholder="เช่น thanakorn.w@strongcare.hospital"
                    className={`w-full pl-9 pr-3.5 py-2.5 rounded-xl border ${
                      errors.email ? 'border-rose-300 ring-2 ring-rose-100' : 'border-emerald-200'
                    } text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-[#10B981] disabled:bg-slate-100 disabled:text-slate-500`}
                  />
                </div>
                {errors.email && (
                  <p className="text-[11px] text-rose-500 font-semibold mt-1 flex items-center gap-1">
                    <AlertCircle className="w-3 h-3" />
                    <span>{errors.email}</span>
                  </p>
                )}
              </div>

              {/* License Number */}
              <div className="sm:col-span-2">
                <label className="block text-slate-700 font-bold mb-1">
                  เลขใบประกอบวิชาชีพกายภาพบำบัด
                </label>
                <div className="relative">
                  <Award className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={licenseNumber}
                    onChange={(e) => setLicenseNumber(e.target.value)}
                    disabled={!canEdit}
                    placeholder="เช่น กภ.12458 หรือ กภ. 8920"
                    className="w-full pl-9 pr-3.5 py-2.5 rounded-xl border border-emerald-200 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-[#10B981] disabled:bg-slate-100 disabled:text-slate-500"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* --------------------------------------------------------------- */}
          {/* SECTION 2: ข้อมูลวิชาชีพ (Professional Information)              */}
          {/* --------------------------------------------------------------- */}
          <div className="space-y-3.5 bg-emerald-50/40 p-4 sm:p-5 rounded-2xl border border-emerald-200/80">
            <div className="flex items-center justify-between border-b border-emerald-200/60 pb-2">
              <div className="font-bold text-sm text-[#0F2F2B] flex items-center gap-2">
                <span className="w-5 h-5 rounded-full bg-emerald-100 text-emerald-800 text-[11px] font-bold flex items-center justify-center">
                  2
                </span>
                <span>ส่วนที่ 2: ข้อมูลวิชาชีพ</span>
              </div>
              <span className="text-[11px] text-emerald-700 font-medium">ความเชี่ยวชาญ & สถานะ</span>
            </div>

            {/* Specialty / Field */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="block text-slate-700 font-bold">
                  ความเชี่ยวชาญ / สาขา (Specialty)
                </label>
                <span className="text-[11px] text-slate-500">เลือกจากตัวเลือกหลักหรือพิมพ์ระบุเอง</span>
              </div>

              {/* Quick Preset Dropdown */}
              <div className="relative">
                <Stethoscope className="w-4 h-4 text-emerald-600 absolute left-3 top-1/2 -translate-y-1/2" />
                <select
                  value={SPECIALTY_PRESETS.includes(specialty) ? specialty : 'custom'}
                  onChange={(e) => {
                    if (e.target.value !== 'custom') {
                      setSpecialty(e.target.value);
                    }
                  }}
                  disabled={!canEdit}
                  className="w-full pl-9 pr-3.5 py-2.5 rounded-xl border border-emerald-200 bg-white text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-[#10B981] disabled:bg-slate-100 disabled:text-slate-500"
                >
                  {SPECIALTY_PRESETS.map((preset) => (
                    <option key={preset} value={preset}>
                      {preset}
                    </option>
                  ))}
                  <option value="custom">✏️ ระบุสาขาความเชี่ยวชาญอื่น ๆ...</option>
                </select>
              </div>

              {/* Custom Specialty Text Input */}
              <input
                type="text"
                value={specialty}
                onChange={(e) => setSpecialty(e.target.value)}
                disabled={!canEdit}
                placeholder="ระบุความเชี่ยวชาญเฉพาะทาง เช่น Orthopedic PT, Sports Rehabilitation"
                className="w-full px-3.5 py-2 rounded-xl border border-emerald-200 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-[#10B981] disabled:bg-slate-100 disabled:text-slate-500"
              />
            </div>

            {/* Bio & Education */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-slate-700 font-bold">
                  ประวัติส่วนตัว & การศึกษา (Personal Bio & Education)
                </label>
                <span className="text-[11px] text-slate-400">ประวัติการศึกษาและการอบรม</span>
              </div>
              <div className="relative">
                <textarea
                  rows={3}
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  disabled={!canEdit}
                  placeholder="เช่น สำเร็จการศึกษากายภาพบำบัดบัณฑิต จุฬาลงกรณ์มหาวิทยาลัย วุฒิบัตรกายภาพบำบัดระบบกระดูกและกล้ามเนื้อ ประสบการณ์ 8 ปี..."
                  className="w-full p-3 rounded-xl border border-emerald-200 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-[#10B981] disabled:bg-slate-100 disabled:text-slate-500 leading-relaxed"
                />
              </div>
            </div>

            {/* Status Selector */}
            <div>
              <label className="block text-slate-700 font-bold mb-2">สถานะการปฏิบัติงาน</label>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                {/* Active */}
                <button
                  type="button"
                  onClick={() => canEdit && setStatus('active')}
                  disabled={!canEdit}
                  className={`p-3 rounded-2xl border text-left transition flex items-start gap-2.5 cursor-pointer ${
                    status === 'active'
                      ? 'border-emerald-500 bg-emerald-50 text-emerald-950 ring-2 ring-emerald-200'
                      : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-700'
                  }`}
                >
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 mt-1 flex-shrink-0" />
                  <div>
                    <div className="font-bold text-xs flex items-center gap-1">
                      <span>ปฏิบัติงาน</span>
                      <span className="text-[10px] text-emerald-600 font-mono">(Active)</span>
                    </div>
                    <div className="text-[10px] text-slate-500 mt-0.5">รับเคสคนไข้ตามปกติ</div>
                  </div>
                </button>

                {/* On Leave */}
                <button
                  type="button"
                  onClick={() => canEdit && setStatus('on_leave')}
                  disabled={!canEdit}
                  className={`p-3 rounded-2xl border text-left transition flex items-start gap-2.5 cursor-pointer ${
                    status === 'on_leave'
                      ? 'border-amber-500 bg-amber-50 text-amber-950 ring-2 ring-amber-200'
                      : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-700'
                  }`}
                >
                  <span className="w-2.5 h-2.5 rounded-full bg-amber-500 mt-1 flex-shrink-0" />
                  <div>
                    <div className="font-bold text-xs flex items-center gap-1">
                      <span>ลาพัก</span>
                      <span className="text-[10px] text-amber-600 font-mono">(On Leave)</span>
                    </div>
                    <div className="text-[10px] text-slate-500 mt-0.5">งดรับเคสใหม่ชั่วคราว</div>
                  </div>
                </button>

                {/* Suspended */}
                <button
                  type="button"
                  onClick={() => canEdit && setStatus('suspended')}
                  disabled={!canEdit}
                  className={`p-3 rounded-2xl border text-left transition flex items-start gap-2.5 cursor-pointer ${
                    status === 'suspended'
                      ? 'border-rose-500 bg-rose-50 text-rose-950 ring-2 ring-rose-200'
                      : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-700'
                  }`}
                >
                  <span className="w-2.5 h-2.5 rounded-full bg-rose-500 mt-1 flex-shrink-0" />
                  <div>
                    <div className="font-bold text-xs flex items-center gap-1">
                      <span>ระงับ</span>
                      <span className="text-[10px] text-rose-600 font-mono">(Suspended)</span>
                    </div>
                    <div className="text-[10px] text-slate-500 mt-0.5">ระงับการเข้าสู่ระบบ</div>
                  </div>
                </button>
              </div>
            </div>
          </div>

          {/* --------------------------------------------------------------- */}
          {/* SECTION 3: เคสที่รับผิดชอบ (Assigned Cases)                      */}
          {/* --------------------------------------------------------------- */}
          <div className="space-y-3.5 bg-blue-50/40 p-4 sm:p-5 rounded-2xl border border-blue-200/80">
            <div className="flex items-center justify-between border-b border-blue-200/60 pb-2">
              <div className="font-bold text-sm text-[#0F2F2B] flex items-center gap-2">
                <span className="w-5 h-5 rounded-full bg-blue-100 text-blue-800 text-[11px] font-bold flex items-center justify-center">
                  3
                </span>
                <span>ส่วนที่ 3: เคสที่รับผิดชอบ ({assignedCases.length} คนไข้)</span>
              </div>
              <span className="text-[11px] font-semibold text-blue-800">
                {currentRole === 'admin' ? 'Admin จัดการมอบหมายเคสได้' : 'นักกายภาพ: ดูอย่างเดียว'}
              </span>
            </div>

            {/* Informative notice based on role */}
            {currentRole === 'therapist' ? (
              <div className="p-3 rounded-xl bg-blue-50 border border-blue-200 flex items-center gap-2 text-[11px] text-blue-900 font-medium">
                <Info className="w-4 h-4 text-blue-600 flex-shrink-0" />
                <span>
                  การจัดสรรและมอบหมายเคสคนไข้ดำเนินการโดยผู้ดูแลระบบ (Admin) เท่านั้น นักกายภาพสามารถดูรายชื่อเคสที่ได้รับมอบหมายได้
                </span>
              </div>
            ) : (
              <div className="p-2.5 rounded-xl bg-blue-50 border border-blue-200 flex items-center gap-2 text-[11px] text-blue-900 font-medium">
                <Sparkles className="w-3.5 h-3.5 text-blue-600 flex-shrink-0" />
                <span>
                  ในฐานะผู้ดูแลระบบ (Admin) คุณสามารถกดเครื่องหมาย ✕ บนการ์ดชื่อคนไข้เพื่อถอดเคส หรือเลือกมอบหมายคนไข้เพิ่มได้
                </span>
              </div>
            )}

            {/* Cases Chips List */}
            <div className="space-y-1.5">
              <label className="block text-slate-700 font-bold text-xs">
                รายชื่อคนไข้ในความรับผิดชอบปัจจุบัน:
              </label>

              {assignedCases.length === 0 ? (
                <div className="p-4 rounded-xl border border-dashed border-slate-300 text-center text-slate-400 font-medium text-xs">
                  ยังไม่มีคนไข้ที่รับผิดชอบในขณะนี้
                </div>
              ) : (
                <div className="flex flex-wrap gap-2 pt-1">
                  {assignedCases.map((caseItem, idx) => (
                    <span
                      key={idx}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white border border-blue-200 text-blue-950 font-bold text-xs shadow-xs"
                    >
                      <Users className="w-3.5 h-3.5 text-blue-600 flex-shrink-0" />
                      <span>{caseItem}</span>

                      {/* Admin remove button */}
                      {currentRole === 'admin' && canEdit && (
                        <button
                          type="button"
                          onClick={() => handleRemovePatientCase(caseItem)}
                          className="ml-1 p-0.5 rounded-full hover:bg-rose-100 text-slate-400 hover:text-rose-600 transition cursor-pointer"
                          title="ถอดคนไข้จากเคสนี้"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Admin Add Case Controls (optional) */}
            {currentRole === 'admin' && canEdit && (
              <div className="pt-2 border-t border-blue-200/60 space-y-2">
                <div className="flex items-center justify-between">
                  <label className="block text-slate-700 font-bold text-xs">
                    + มอบหมายเคสคนไข้เพิ่มเติม:
                  </label>
                  <button
                    type="button"
                    onClick={() => setIsAddingCustom(!isAddingCustom)}
                    className="text-[11px] text-blue-700 font-bold hover:underline cursor-pointer"
                  >
                    {isAddingCustom ? 'เลือกจากรายชื่อคนไข้ในระบบ' : 'พิมพ์ระบุชื่อเอง'}
                  </button>
                </div>

                <div className="flex items-center gap-2">
                  {isAddingCustom ? (
                    <input
                      type="text"
                      value={customCaseInput}
                      onChange={(e) => setCustomCaseInput(e.target.value)}
                      placeholder="เช่น นายสมปอง บุญเรือง (P-0050)"
                      className="flex-1 px-3.5 py-2 rounded-xl border border-blue-200 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                    />
                  ) : (
                    <select
                      value={selectedPatientToAdd}
                      onChange={(e) => setSelectedPatientToAdd(e.target.value)}
                      className="flex-1 px-3.5 py-2 rounded-xl border border-blue-200 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                    >
                      <option value="">-- เลือกคนไข้ที่ต้องการมอบหมาย ({availablePatients.length} คน) --</option>
                      {availablePatients.map((pLabel) => (
                        <option key={pLabel} value={pLabel}>
                          {pLabel}
                        </option>
                      ))}
                    </select>
                  )}

                  <button
                    type="button"
                    onClick={handleAddPatientCase}
                    disabled={isAddingCustom ? !customCaseInput.trim() : !selectedPatientToAdd.trim()}
                    className="px-4 py-2 rounded-xl bg-blue-600 text-white font-bold text-xs shadow-sm hover:bg-blue-700 transition disabled:bg-slate-200 disabled:text-slate-400 cursor-pointer flex items-center gap-1.5"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>เพิ่มเคส</span>
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* =============================================================== */}
          {/* 3. MODAL FOOTER                                                 */}
          {/* =============================================================== */}
          <div className="pt-3 border-t border-emerald-100 flex items-center justify-between">
            <span className="text-[11px] text-slate-500">
              {canEdit ? 'ข้อมูลจะถูกอัปเดตลงระบบและแสดงผลทันที' : 'คุณไม่มีสิทธิ์แก้ไขข้อมูลนักกายภาพท่านนี้'}
            </span>

            <div className="flex items-center gap-2.5">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-full border border-slate-300 text-slate-700 font-bold hover:bg-slate-100 transition cursor-pointer text-xs"
              >
                ยกเลิก
              </button>

              {canEdit && (
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-6 py-2 rounded-full bg-[#10B981] text-white font-bold text-xs shadow-md shadow-emerald-500/20 hover:bg-emerald-600 transition cursor-pointer flex items-center gap-1.5 disabled:bg-emerald-300"
                >
                  {isSubmitting ? (
                    <>
                      <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      <span>กำลังบันทึก...</span>
                    </>
                  ) : (
                    <>
                      <Check className="w-4 h-4" />
                      <span>บันทึกการแก้ไข</span>
                    </>
                  )}
                </button>
              )}
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
