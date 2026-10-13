import React, { useState, useEffect } from 'react';
import {
  X,
  User,
  AtSign,
  Shield,
  Phone,
  Mail,
  Calendar,
  Stethoscope,
  FileText,
  Sparkles,
  AlertCircle,
  Check,
  Award,
} from 'lucide-react';
import { UserAccount, UserRole, PhysicalTherapist } from '../../types/hospital';

interface EditUserModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: UserAccount | null;
  currentRole: UserRole;
  currentUserId: number | string;
  currentUserName: string;
  therapists: PhysicalTherapist[];
  existingUsers: UserAccount[];
  onSubmitUser: (
    userId: number | string,
    updatedUser: Partial<UserAccount>,
    therapistExtra?: Partial<PhysicalTherapist>
  ) => void;
  onSuccessToast: (msg: string) => void;
}

export const EditUserModal: React.FC<EditUserModalProps> = ({
  isOpen,
  onClose,
  user,
  currentRole,
  currentUserId,
  currentUserName,
  therapists,
  existingUsers,
  onSubmitUser,
  onSuccessToast,
}) => {
  // Section 1: Account
  const [name, setName] = useState<string>('');
  const [username, setUsername] = useState<string>('');
  const [role, setRole] = useState<UserRole>('patient');

  // Section 2: Contact
  const [phone, setPhone] = useState<string>('');
  const [email, setEmail] = useState<string>('');

  // Section 3 (Patient specific)
  const [age, setAge] = useState<number | string>(60);
  const [gender, setGender] = useState<'male' | 'female' | 'other'>('male');
  const [assignedTherapistId, setAssignedTherapistId] = useState<number | string>(1);
  const [admissionDate, setAdmissionDate] = useState<string>('');
  const [chiefComplaint, setChiefComplaint] = useState<string>('');

  // Section 3 (Therapist specific)
  const [specialty, setSpecialty] = useState<string>(
    'กายภาพบำบัดระบบกระดูกและกล้ามเนื้อ (Orthopedic PT)'
  );
  const [licenseNumber, setLicenseNumber] = useState<string>('กภ. 8920');
  const [bio, setBio] = useState<string>('');

  // Validation Errors
  const [errors, setErrors] = useState<{
    name?: string;
    username?: string;
    phone?: string;
    email?: string;
  }>({});

  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  // Populate form with current user data when modal opens or user changes
  useEffect(() => {
    if (isOpen && user) {
      setName(user.name || '');
      setUsername(user.username || '');
      setRole(user.role);
      setPhone(user.phone || '');
      setEmail(user.email || '');

      // Patient fields
      setAge(user.age || 60);
      setGender(user.gender || 'male');
      setAssignedTherapistId(user.assignedTherapistId || therapists[0]?.id || 1);
      setAdmissionDate(user.created_at || new Date().toISOString().split('T')[0]);
      setChiefComplaint(user.chiefComplaint || user.diagnosis || '');

      // Therapist fields (check if user exists in therapists list)
      const matchingTherapist = therapists.find(
        (t) => t.id === user.id || t.name === user.name || t.code === user.code
      );
      if (matchingTherapist) {
        setSpecialty(matchingTherapist.specialty || 'กายภาพบำบัดระบบกระดูกและกล้ามเนื้อ (Orthopedic PT)');
        setLicenseNumber(matchingTherapist.licenseNumber || 'กภ. 8920');
        setBio(matchingTherapist.bio || '');
      } else {
        setSpecialty('กายภาพบำบัดระบบกระดูกและกล้ามเนื้อ (Orthopedic PT)');
        setLicenseNumber('กภ. 8920');
        setBio('');
      }

      setErrors({});
      setIsSubmitting(false);
    }
  }, [isOpen, user, therapists]);

  if (!isOpen || !user) return null;

  // Auto-generate username helper
  const handleAutoGenerateUsername = () => {
    if (!name.trim()) {
      setErrors((prev) => ({ ...prev, name: 'กรุณากรอกชื่อ-นามสกุลก่อนเพื่อสุ่ม Username' }));
      return;
    }
    const clean = name
      .replace(/^(นาย|นาง|นางสาว|ด\.ช\.|ด\.ญ\.|กภ\.|นพ\.|พญ\.)\s*/, '')
      .trim()
      .split(/\s+/)[0];
    const latin = clean
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '')
      .slice(0, 8);
    const base = latin.length >= 3 ? latin : 'user';
    const rand = Math.floor(100 + Math.random() * 900);
    const suggested = `${base}${rand}`;
    setUsername(suggested);
    if (errors.username) {
      setErrors((prev) => ({ ...prev, username: undefined }));
    }
  };

  // Form Validation
  const validateForm = (): boolean => {
    const newErrors: typeof errors = {};

    // 1. Name validation
    if (!name.trim()) {
      newErrors.name = 'กรุณาระบุชื่อ-นามสกุล';
    } else if (name.trim().length < 3) {
      newErrors.name = 'ชื่อ-นามสกุลต้องมีความยาวอย่างน้อย 3 ตัวอักษร';
    }

    // 2. Username validation (unique check against other users, excluding current user)
    if (!username.trim()) {
      newErrors.username = 'กรุณาระบุชื่อผู้ใช้งาน (Username)';
    } else if (username.trim().length < 3) {
      newErrors.username = 'Username ต้องมีความยาวอย่างน้อย 3 ตัวอักษร';
    } else {
      const isDuplicate = existingUsers.some(
        (u) =>
          u.id !== user.id &&
          u.username.toLowerCase().trim() === username.toLowerCase().trim()
      );
      if (isDuplicate) {
        newErrors.username = `Username "${username.trim()}" มีผู้อื่นใช้งานแล้ว กรุณาเลือกชื่ออื่น`;
      }
    }

    // 3. Phone validation (optional but 9-10 digits if provided)
    if (phone.trim()) {
      const cleanDigits = phone.replace(/[^0-9]/g, '');
      if (cleanDigits.length < 9 || cleanDigits.length > 10) {
        newErrors.phone = 'เบอร์โทรศัพท์ต้องเป็นตัวเลข 9-10 หลัก (เช่น 081-234-5678)';
      }
    }

    // 4. Email validation (optional)
    if (email.trim()) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email.trim())) {
        newErrors.email = 'รูปแบบอีเมลไม่ถูกต้อง';
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // Submit Handler
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm()) return;

    setIsSubmitting(true);

    const targetTherapist =
      therapists.find((t) => t.id === Number(assignedTherapistId)) || therapists[0];
    const assignedRole: UserRole = currentRole === 'therapist' ? 'patient' : role;

    const updatedUserData: Partial<UserAccount> = {
      name: name.trim(),
      username: username.trim().toLowerCase(),
      role: assignedRole,
      phone: phone.trim() || undefined,
      email: email.trim() || undefined,
      age: assignedRole === 'patient' ? Number(age) || 60 : undefined,
      gender: assignedRole === 'patient' ? gender : undefined,
      assignedTherapistId: assignedRole === 'patient' ? targetTherapist?.id : undefined,
      assignedTherapistName:
        assignedRole === 'patient'
          ? targetTherapist?.name || currentUserName
          : undefined,
      diagnosis:
        assignedRole === 'patient'
          ? chiefComplaint.trim() || user.diagnosis || 'ข้อไหล่ติดระยะฟื้นฟู'
          : undefined,
      chiefComplaint:
        assignedRole === 'patient'
          ? chiefComplaint.trim() || user.chiefComplaint || 'ปวดตึงข้อต่อเรื้อรัง'
          : undefined,
    };

    let therapistExtra: Partial<PhysicalTherapist> | undefined = undefined;
    if (assignedRole === 'therapist') {
      therapistExtra = {
        name: name.trim(),
        specialty: specialty.trim() || 'กายภาพบำบัดระบบกระดูกและกล้ามเนื้อ (Orthopedic PT)',
        phone: phone.trim() || '08x-xxx-xxxx',
        email: email.trim() || `${username.trim()}@drtechcare.hospital`,
        licenseNumber: licenseNumber.trim() || `กภ. 8920`,
        bio: bio.trim() || 'นักกายภาพบำบัดวิชาชีพ ประจำโรงพยาบาล Dr.Tech.Care',
      };
    }

    onSubmitUser(user.id, updatedUserData, therapistExtra);
    onSuccessToast(`บันทึกการแก้ไขบัญชีของ ${name.trim()} สำเร็จ`);
    setIsSubmitting(false);
    onClose();
  };

  const roleText =
    user.role === 'patient'
      ? 'คนไข้'
      : user.role === 'therapist'
      ? 'นักกายภาพ'
      : 'แอดมินใหญ่';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-[#0F2F2B]/70 backdrop-blur-sm animate-fadeIn"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl sm:max-w-2xl bg-white rounded-[28px] sm:rounded-3xl shadow-2xl border border-emerald-200 overflow-hidden flex flex-col max-h-[92vh] animate-slideUp"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ================================================================= */}
        {/* 1. MODAL HEADER                                                   */}
        {/* ================================================================= */}
        <div className="px-6 py-4 border-b border-emerald-100 bg-gradient-to-r from-emerald-50/80 via-white to-emerald-50/40 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-[#10B981] text-white flex items-center justify-center shadow-md shadow-emerald-500/20">
              <User className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-extrabold text-base sm:text-lg text-[#0F2F2B]">
                แก้ไขบัญชี
              </h3>
              <p className="text-[11px] text-emerald-800 font-medium">
                กำลังแก้ไข: <strong className="font-bold text-[#0F2F2B]">{user.name}</strong> ({roleText}) • {user.code}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-full text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition cursor-pointer"
            aria-label="ปิดหน้าต่างแก้ไข"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* ================================================================= */}
        {/* 2. FORM BODY (Scrollable)                                         */}
        {/* ================================================================= */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-6 py-5 space-y-5 text-xs">
          {/* --------------------------------------------------------------- */}
          {/* SECTION 1: ข้อมูลบัญชีผู้ใช้งาน (Account Info)                   */}
          {/* --------------------------------------------------------------- */}
          <div className="space-y-3 bg-stone-50/70 p-4 rounded-2xl border border-stone-200/80">
            <div className="flex items-center justify-between border-b border-stone-200/60 pb-2">
              <div className="font-bold text-sm text-[#0F2F2B] flex items-center gap-2">
                <Shield className="w-4 h-4 text-emerald-600" />
                <span>ส่วนที่ 1: ข้อมูลบัญชีผู้ใช้งาน</span>
              </div>
              <span className="text-[11px] text-rose-500 font-medium">* จำเป็นต้องระบุ</span>
            </div>

            {/* Role Selector (Admin can change, Physio is disabled) */}
            <div>
              <label className="block font-bold text-slate-700 mb-1.5">
                บทบาทผู้ใช้งาน / Role:
              </label>

              {currentRole === 'admin' ? (
                <div className="grid grid-cols-2 gap-2.5">
                  <button
                    type="button"
                    onClick={() => setRole('patient')}
                    className={`py-2.5 px-4 rounded-2xl font-bold text-xs flex items-center justify-center gap-2 border transition cursor-pointer ${
                      role === 'patient'
                        ? 'bg-[#10B981] text-white border-emerald-600 shadow-sm'
                        : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    <User className="w-4 h-4" />
                    <span>คนไข้ (Patient)</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setRole('therapist')}
                    className={`py-2.5 px-4 rounded-2xl font-bold text-xs flex items-center justify-center gap-2 border transition cursor-pointer ${
                      role === 'therapist'
                        ? 'bg-[#0F2F2B] text-emerald-300 border-emerald-950 shadow-sm'
                        : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    <Stethoscope className="w-4 h-4" />
                    <span>นักกายภาพ (Physiotherapist)</span>
                  </button>
                </div>
              ) : (
                <div className="flex items-center justify-between p-2.5 rounded-2xl bg-emerald-100/70 border border-emerald-300 text-emerald-900 font-bold text-xs">
                  <div className="flex items-center gap-2">
                    <User className="w-4 h-4 text-emerald-700" />
                    <span>คนไข้ (Patient)</span>
                  </div>
                  <span className="text-[11px] font-medium text-emerald-800 bg-white/80 px-2.5 py-0.5 rounded-full border border-emerald-200">
                    นักกายภาพไม่สามารถเปลี่ยนบทบาทได้
                  </span>
                </div>
              )}
            </div>

            {/* Name & Username */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              {/* Full Name */}
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  ชื่อ-นามสกุล <span className="text-rose-500">*</span>:
                </label>
                <div className="relative">
                  <User className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => {
                      setName(e.target.value);
                      if (errors.name) setErrors((prev) => ({ ...prev, name: undefined }));
                    }}
                    placeholder="เช่น นายสมศักดิ์ สุขใจ"
                    className={`w-full pl-9 pr-3 py-2.5 rounded-2xl bg-white border text-xs font-semibold text-[#0F2F2B] outline-none transition ${
                      errors.name
                        ? 'border-rose-400 ring-2 ring-rose-100'
                        : 'border-slate-200 focus:border-[#10B981] focus:ring-2 focus:ring-emerald-100'
                    }`}
                  />
                </div>
                {errors.name && (
                  <p className="text-[11px] text-rose-600 font-semibold mt-1 flex items-center gap-1">
                    <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
                    <span>{errors.name}</span>
                  </p>
                )}
              </div>

              {/* Username with Auto-Generate Helper */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="font-bold text-slate-700">
                    Username <span className="text-rose-500">*</span>:
                  </label>
                  <button
                    type="button"
                    onClick={handleAutoGenerateUsername}
                    className="text-[11px] text-emerald-700 font-bold hover:underline flex items-center gap-1 cursor-pointer"
                    title="สุ่ม Username จากชื่อ"
                  >
                    <Sparkles className="w-3 h-3 text-emerald-600" />
                    <span>สร้างจากชื่อ</span>
                  </button>
                </div>
                <div className="relative">
                  <AtSign className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={username}
                    onChange={(e) => {
                      setUsername(e.target.value.toLowerCase().trim());
                      if (errors.username) setErrors((prev) => ({ ...prev, username: undefined }));
                    }}
                    placeholder="เช่น somsak99"
                    className={`w-full pl-9 pr-3 py-2.5 rounded-2xl bg-white border text-xs font-mono font-bold text-[#0F2F2B] outline-none transition ${
                      errors.username
                        ? 'border-rose-400 ring-2 ring-rose-100'
                        : 'border-slate-200 focus:border-[#10B981] focus:ring-2 focus:ring-emerald-100'
                    }`}
                  />
                </div>
                {errors.username && (
                  <p className="text-[11px] text-rose-600 font-semibold mt-1 flex items-center gap-1">
                    <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
                    <span>{errors.username}</span>
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* --------------------------------------------------------------- */}
          {/* SECTION 2: ข้อมูลติดต่อ (Contact Info)                           */}
          {/* --------------------------------------------------------------- */}
          <div className="space-y-3 bg-stone-50/70 p-4 rounded-2xl border border-stone-200/80">
            <div className="font-bold text-sm text-[#0F2F2B] flex items-center gap-2 border-b border-stone-200/60 pb-2">
              <Phone className="w-4 h-4 text-emerald-600" />
              <span>ส่วนที่ 2: ข้อมูลการติดต่อ</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Phone */}
              <div>
                <label className="block font-bold text-slate-700 mb-1">เบอร์โทรศัพท์:</label>
                <div className="relative">
                  <Phone className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => {
                      setPhone(e.target.value);
                      if (errors.phone) setErrors((prev) => ({ ...prev, phone: undefined }));
                    }}
                    placeholder="เช่น 081-234-5678"
                    className={`w-full pl-9 pr-3 py-2.5 rounded-2xl bg-white border text-xs font-semibold text-[#0F2F2B] outline-none transition ${
                      errors.phone
                        ? 'border-rose-400 ring-2 ring-rose-100'
                        : 'border-slate-200 focus:border-[#10B981] focus:ring-2 focus:ring-emerald-100'
                    }`}
                  />
                </div>
                {errors.phone && (
                  <p className="text-[11px] text-rose-600 font-semibold mt-1 flex items-center gap-1">
                    <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
                    <span>{errors.phone}</span>
                  </p>
                )}
              </div>

              {/* Email */}
              <div>
                <label className="block font-bold text-slate-700 mb-1">อีเมล:</label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      if (errors.email) setErrors((prev) => ({ ...prev, email: undefined }));
                    }}
                    placeholder="เช่น user@strongcare.com"
                    className={`w-full pl-9 pr-3 py-2.5 rounded-2xl bg-white border text-xs font-semibold text-[#0F2F2B] outline-none transition ${
                      errors.email
                        ? 'border-rose-400 ring-2 ring-rose-100'
                        : 'border-slate-200 focus:border-[#10B981] focus:ring-2 focus:ring-emerald-100'
                    }`}
                  />
                </div>
                {errors.email && (
                  <p className="text-[11px] text-rose-600 font-semibold mt-1 flex items-center gap-1">
                    <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
                    <span>{errors.email}</span>
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* --------------------------------------------------------------- */}
          {/* SECTION 3: ข้อมูลเพิ่มเติมตามบทบาท (Role Specific)             */}
          {/* --------------------------------------------------------------- */}
          {role === 'patient' ? (
            /* ================= PATIENT SPECIFIC FIELDS =================== */
            <div className="space-y-3 bg-emerald-50/60 p-4 rounded-2xl border border-emerald-200/80">
              <div className="font-bold text-sm text-emerald-950 flex items-center gap-2 border-b border-emerald-200/60 pb-2">
                <FileText className="w-4 h-4 text-emerald-600" />
                <span>ส่วนที่ 3: ข้อมูลเวชระเบียนคนไข้</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {/* Age */}
                <div>
                  <label className="block font-bold text-slate-700 mb-1">อายุ (ปี):</label>
                  <input
                    type="number"
                    min={1}
                    max={120}
                    value={age}
                    onChange={(e) => setAge(e.target.value ? parseInt(e.target.value) : '')}
                    className="w-full px-3.5 py-2.5 rounded-2xl bg-white border border-emerald-200 text-xs font-bold text-[#0F2F2B] outline-none focus:border-[#10B981] focus:ring-2 focus:ring-emerald-100"
                  />
                </div>

                {/* Gender */}
                <div>
                  <label className="block font-bold text-slate-700 mb-1">เพศ:</label>
                  <select
                    value={gender}
                    onChange={(e) => setGender(e.target.value as any)}
                    className="w-full px-3.5 py-2.5 rounded-2xl bg-white border border-emerald-200 text-xs font-bold text-[#0F2F2B] outline-none focus:border-[#10B981] cursor-pointer"
                  >
                    <option value="male">ชาย</option>
                    <option value="female">หญิง</option>
                    <option value="other">ไม่ระบุ</option>
                  </select>
                </div>

                {/* Admission Date */}
                <div>
                  <label className="block font-bold text-slate-700 mb-1">วันที่เริ่มเข้าระบบ:</label>
                  <div className="relative">
                    <input
                      type="date"
                      value={admissionDate}
                      onChange={(e) => setAdmissionDate(e.target.value)}
                      className="w-full px-3 py-2.5 rounded-2xl bg-white border border-emerald-200 text-xs font-bold text-[#0F2F2B] outline-none focus:border-[#10B981]"
                    />
                  </div>
                </div>
              </div>

              {/* Responsible Physiotherapist */}
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  หมอ/นักกายภาพที่รับผิดชอบ:
                </label>
                <div className="relative">
                  <Stethoscope className="w-4 h-4 text-emerald-600 absolute left-3 top-1/2 -translate-y-1/2" />
                  <select
                    value={assignedTherapistId}
                    onChange={(e) => setAssignedTherapistId(Number(e.target.value))}
                    disabled={currentRole === 'therapist'}
                    className="w-full pl-9 pr-3 py-2.5 rounded-2xl bg-white border border-emerald-200 text-xs font-bold text-[#0F2F2B] outline-none focus:border-[#10B981] cursor-pointer disabled:bg-slate-100 disabled:text-slate-500"
                  >
                    {therapists.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name} ({t.specialty.split('(')[0].trim()})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Chief Complaint / Symptoms */}
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  ประวัติการซักประวัติ / อาการสำคัญเบื้องต้น:
                </label>
                <input
                  type="text"
                  value={chiefComplaint}
                  onChange={(e) => setChiefComplaint(e.target.value)}
                  placeholder="เช่น ปวดไหล่ขวาเรื้อรัง ยกแขนไม่สุด ปวดตึงหลังส่วนล่าง"
                  className="w-full px-3.5 py-2.5 rounded-2xl bg-white border border-emerald-200 text-xs font-semibold text-[#0F2F2B] outline-none focus:border-[#10B981]"
                />
              </div>
            </div>
          ) : (
            /* ================= THERAPIST SPECIFIC FIELDS ================= */
            <div className="space-y-3 bg-emerald-950/10 p-4 rounded-2xl border border-emerald-900/20">
              <div className="font-bold text-sm text-[#0F2F2B] flex items-center gap-2 border-b border-emerald-900/10 pb-2">
                <Stethoscope className="w-4 h-4 text-emerald-800" />
                <span>ส่วนที่ 3: ข้อมูลวิชาชีพนักกายภาพบำบัด</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* Specialty */}
                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    ความเชี่ยวชาญ / สาขา:
                  </label>
                  <select
                    value={specialty}
                    onChange={(e) => setSpecialty(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-2xl bg-white border border-emerald-200 text-xs font-bold text-[#0F2F2B] outline-none focus:border-[#10B981] cursor-pointer"
                  >
                    <option value="กายภาพบำบัดระบบกระดูกและกล้ามเนื้อ (Orthopedic PT)">
                      ระบบกระดูกและกล้ามเนื้อ (Orthopedic PT)
                    </option>
                    <option value="กายภาพบำบัดระบบประสาทและหลอดเลือดสมอง (Neurological PT)">
                      ระบบประสาทและหลอดเลือดสมอง (Neurological PT)
                    </option>
                    <option value="กายภาพบำบัดผู้สูงอายุ (Geriatric PT)">
                      การฟื้นฟูผู้สูงอายุ (Geriatric PT)
                    </option>
                    <option value="กายภาพบำบัดทางการกีฬา (Sports PT)">
                      การบาดเจ็บจากการกีฬา (Sports PT)
                    </option>
                    <option value="ฟื้นฟูสมรรถภาพหัวใจและปอด (Cardiopulmonary PT)">
                      ฟื้นฟูหัวใจและปอด (Cardiopulmonary PT)
                    </option>
                  </select>
                </div>

                {/* License Number */}
                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    เลขที่ใบประกอบวิชาชีพ:
                  </label>
                  <div className="relative">
                    <Award className="w-4 h-4 text-emerald-600 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={licenseNumber}
                      onChange={(e) => setLicenseNumber(e.target.value)}
                      placeholder="เช่น กภ. 8920"
                      className="w-full pl-9 pr-3 py-2.5 rounded-2xl bg-white border border-emerald-200 text-xs font-bold text-[#0F2F2B] outline-none focus:border-[#10B981]"
                    />
                  </div>
                </div>
              </div>

              {/* Bio & Education */}
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  ประวัติส่วนตัว & การศึกษา (ย่อ):
                </label>
                <textarea
                  rows={2}
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  placeholder="เช่น ปริญญาตรี กายภาพบำบัดบัณฑิต จุฬาลงกรณ์มหาวิทยาลัย ประสบการณ์ 5 ปี"
                  className="w-full p-3 rounded-2xl bg-white border border-emerald-200 text-xs text-[#0F2F2B] outline-none focus:border-[#10B981]"
                />
              </div>
            </div>
          )}

          {/* =============================================================== */}
          {/* 3. MODAL FOOTER                                                 */}
          {/* =============================================================== */}
          <div className="pt-3 border-t border-emerald-100 flex items-center justify-between">
            <div className="text-[11px] text-slate-500 hidden sm:block">
              รหัสบัญชี: <span className="font-mono font-bold text-emerald-800">{user.code}</span> (ID: {user.id})
            </div>

            <div className="flex items-center gap-2.5 w-full sm:w-auto justify-end">
              <button
                type="button"
                onClick={onClose}
                className="px-5 py-2.5 rounded-full border border-slate-300 text-slate-700 font-bold hover:bg-slate-100 transition active:scale-95 cursor-pointer"
              >
                ยกเลิก
              </button>

              <button
                type="submit"
                disabled={isSubmitting}
                className="px-6 py-2.5 rounded-full bg-gradient-to-r from-[#10B981] to-[#059669] hover:brightness-105 text-white font-bold shadow-md shadow-emerald-500/20 transition active:scale-95 flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                <Check className="w-4 h-4" />
                <span>{isSubmitting ? 'กำลังบันทึก...' : 'บันทึกการแก้ไข'}</span>
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
