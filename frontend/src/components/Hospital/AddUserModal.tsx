import React, { useState, useEffect } from 'react';
import {
  X,
  User,
  AtSign,
  Lock,
  KeyRound,
  Eye,
  EyeOff,
  Shield,
  Phone,
  Mail,
  Calendar,
  Stethoscope,
  FileText,
  Sparkles,
  AlertCircle,
  Check,
  RefreshCw,
  Award,
} from 'lucide-react';
import { UserAccount, UserRole, PhysicalTherapist } from '../../types/hospital';
import { generateSecureTemporaryPassword, validatePasswordStrength } from '../../services/authSecurityService';

interface AddUserModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentRole: UserRole;
  currentUserId: number | string;
  currentUserName: string;
  therapists: PhysicalTherapist[];
  existingUsers: UserAccount[];
  onSubmitUser: (userData: Omit<UserAccount, 'id' | 'created_at'>, therapistExtra?: Omit<PhysicalTherapist, 'id'>) => void;
  onSuccessToast: (msg: string) => void;
}

export const AddUserModal: React.FC<AddUserModalProps> = ({
  isOpen,
  onClose,
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
  const [password, setPassword] = useState<string>(() => generateSecureTemporaryPassword());
  const [confirmPassword, setConfirmPassword] = useState<string>(password);
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState<boolean>(false);
  const [role, setRole] = useState<UserRole>(currentRole === 'therapist' ? 'patient' : 'patient');

  // Section 2: Contact
  const [phone, setPhone] = useState<string>('');
  const [email, setEmail] = useState<string>('');

  // Section 3 (Patient specific)
  const [age, setAge] = useState<number | string>(65);
  const [gender, setGender] = useState<'male' | 'female' | 'other'>('male');
  const [assignedTherapistId, setAssignedTherapistId] = useState<number | string>(1);
  const [admissionDate, setAdmissionDate] = useState<string>(
    new Date().toISOString().split('T')[0]
  );
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
    password?: string;
    confirmPassword?: string;
    phone?: string;
    email?: string;
  }>({});

  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  // Initialize or reset when modal opens
  useEffect(() => {
    if (isOpen) {
      const initialPass = generateSecureTemporaryPassword();
      setName('');
      setUsername('');
      setPassword(initialPass);
      setConfirmPassword(initialPass);
      setShowPassword(false);
      setShowConfirmPassword(false);
      setPhone('');
      setEmail('');
      setAge(65);
      setGender('male');
      setChiefComplaint('');
      setBio('');
      setLicenseNumber(`กภ. ${Math.floor(1000 + Math.random() * 9000)}`);
      setAdmissionDate(new Date().toISOString().split('T')[0]);
      setErrors({});
      setIsSubmitting(false);

      if (currentRole === 'therapist') {
        setRole('patient');
        // Auto assign to currently logged in therapist
        setAssignedTherapistId(currentUserId);
      } else {
        setRole('patient');
        if (therapists.length > 0) {
          setAssignedTherapistId(therapists[0].id);
        }
      }
    }
  }, [isOpen, currentRole, currentUserId, therapists]);

  if (!isOpen) return null;

  // Auto-generate username from name
  const handleAutoGenerateUsername = () => {
    const cleanName = name
      .toLowerCase()
      .replace(/^(นาย|นางสาว|นาง|กภ\.|นพ\.|พญ\.)\s*/, '')
      .trim();

    // Convert Thai characters or non-ascii to prefix + rand
    const asciiPart = cleanName.replace(/[^a-z0-9]/g, '');
    const prefix = asciiPart.length >= 3 ? asciiPart.slice(0, 8) : 'user';
    const randSuffix = Math.floor(100 + Math.random() * 900);
    const candidate = `${prefix}_${randSuffix}`;

    setUsername(candidate);
    if (errors.username) {
      setErrors((prev) => ({ ...prev, username: undefined }));
    }
  };

  // Auto-generate secure temporary password
  const handleAutoGeneratePassword = () => {
    const rndPass = generateSecureTemporaryPassword();
    setPassword(rndPass);
    setConfirmPassword(rndPass);
    if (errors.password || errors.confirmPassword) {
      setErrors((prev) => ({ ...prev, password: undefined, confirmPassword: undefined }));
    }
  };

  // Validate fields
  const validateForm = (): boolean => {
    const newErrors: typeof errors = {};

    // 1. Name
    if (!name.trim()) {
      newErrors.name = 'กรุณากรอกชื่อ-นามสกุล';
    }

    // 2. Username
    const trimmedUsername = username.trim().toLowerCase();
    if (!trimmedUsername) {
      newErrors.username = 'กรุณากรอก Username';
    } else if (trimmedUsername.length < 3) {
      newErrors.username = 'Username ต้องมีอย่างน้อย 3 ตัวอักษร';
    } else if (/\s/.test(trimmedUsername)) {
      newErrors.username = 'Username ต้องไม่มีช่องว่าง';
    } else {
      // Check uniqueness
      const isDuplicate = existingUsers.some(
        (u) => u.username.toLowerCase() === trimmedUsername
      );
      if (isDuplicate) {
        newErrors.username = 'Username นี้ถูกใช้งานแล้ว กรุณาเลือกชื่ออื่น';
      }
    }

    // 3. Password
    if (!password) {
      newErrors.password = 'กรุณากรอกรหัสผ่าน';
    } else {
      const strength = validatePasswordStrength(password);
      if (!strength.isValid) {
        newErrors.password = strength.message || 'รหัสผ่านต้องมีความยาวอย่างน้อย 8 ตัวอักษร';
      }
    }

    // 4. Confirm Password
    if (!confirmPassword) {
      newErrors.confirmPassword = 'กรุณายืนยันรหัสผ่าน';
    } else if (confirmPassword !== password) {
      newErrors.confirmPassword = 'ยืนยันรหัสผ่านไม่ตรงกับรหัสผ่าน';
    }

    // 5. Phone validation (optional but if provided must be 9-10 digits)
    if (phone.trim()) {
      const cleanDigits = phone.replace(/[^0-9]/g, '');
      if (cleanDigits.length < 9 || cleanDigits.length > 10) {
        newErrors.phone = 'เบอร์โทรศัพท์ต้องเป็นตัวเลข 9-10 หลัก (เช่น 081-234-5678)';
      }
    }

    // 6. Email validation (optional)
    if (email.trim()) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email.trim())) {
        newErrors.email = 'รูปแบบอีเมลไม่ถูกต้อง';
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // Handle Form Submit
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm()) return;

    setIsSubmitting(true);

    const targetTherapist = therapists.find((t) => t.id === Number(assignedTherapistId)) || therapists[0];
    const assignedRole: UserRole = currentRole === 'therapist' ? 'patient' : role;
    const prefix = assignedRole === 'patient' ? 'P' : assignedRole === 'therapist' ? 'T' : 'ADM';
    const randCode = `${prefix}-${Math.floor(1000 + Math.random() * 9000)}`;

    const newUserData: Omit<UserAccount, 'id' | 'created_at'> = {
      username: username.trim().toLowerCase(),
      name: name.trim(),
      role: assignedRole,
      status: 'active',
      code: randCode,
      password: password.trim(),
      must_change_password: true,
      phone: phone.trim() || undefined,
      email: email.trim() || undefined,
      age: assignedRole === 'patient' ? (Number(age) || 60) : undefined,
      gender: assignedRole === 'patient' ? gender : undefined,
      assignedTherapistId: assignedRole === 'patient' ? targetTherapist?.id : undefined,
      assignedTherapistName: assignedRole === 'patient' ? (targetTherapist?.name || currentUserName) : undefined,
      diagnosis: assignedRole === 'patient' ? (chiefComplaint.trim() || 'ข้อไหล่ติดระยะฟื้นฟู') : undefined,
      chiefComplaint: assignedRole === 'patient' ? (chiefComplaint.trim() || 'ปวดตึงข้อต่อเรื้อรัง') : undefined,
      patientBackground: assignedRole === 'patient' ? 'ไม่มีโรคประจำตัวร้ายแรง สุขภาพทั่วไปปกติ' : undefined,
      treatmentOutcome: assignedRole === 'patient' ? 'เริ่มต้นโปรแกรมการรักษา' : undefined,
      therapistNotes: assignedRole === 'patient' ? 'เริ่มฝึกกายภาพท่าพื้นฐานตามโปรแกรม' : undefined,
      last_active: 'เพิ่งลงทะเบียน',
    };

    let therapistExtra: Omit<PhysicalTherapist, 'id'> | undefined = undefined;
    if (assignedRole === 'therapist') {
      therapistExtra = {
        code: randCode,
        name: name.trim(),
        specialty: specialty.trim() || 'กายภาพบำบัดระบบกระดูกและกล้ามเนื้อ (Orthopedic PT)',
        phone: phone.trim() || '08x-xxx-xxxx',
        email: email.trim() || `${username.trim()}@drtechcare.hospital`,
        licenseNumber: licenseNumber.trim() || `กภ. ${Math.floor(1000 + Math.random() * 9000)}`,
        activePatientsCount: 0,
        assignedCases: [],
        bio: bio.trim() || 'นักกายภาพบำบัดวิชาชีพ ประจำโรงพยาบาล Dr.Tech.Care',
        status: 'active',
      };
    }

    onSubmitUser(newUserData, therapistExtra);
    onSuccessToast(
      assignedRole === 'patient'
        ? `เพิ่มบัญชีคนไข้สำเร็จ: ${name.trim()} (${randCode}) ผูกกับ ${targetTherapist?.name || currentUserName}`
        : `เพิ่มบัญชีนักกายภาพบำบัดสำเร็จ: ${name.trim()} (${randCode})`
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
                {currentRole === 'admin' ? 'เพิ่มบัญชีใหม่' : 'เพิ่มบัญชีคนไข้'}
              </h3>
              <p className="text-[11px] text-emerald-800 font-medium">
                {currentRole === 'admin'
                  ? 'สิทธิ์แอดมินใหญ่: สามารถเพิ่มได้ทั้งบัญชีคนไข้และนักกายภาพบำบัด'
                  : `สิทธิ์นักกายภาพ: เพิ่มบัญชีคนไข้ใหม่ (บันทึกข้อมูลและผูกกับคุณอัตโนมัติ)`}
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

        {/* ================================================================= */}
        {/* 2. FORM BODY (Scrollable)                                         */}
        {/* ================================================================= */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-6 py-5 space-y-5 text-xs">
          {/* --------------------------------------------------------------- */}
          {/* SECTION 1: ข้อมูลบัญชี (Account Info)                            */}
          {/* --------------------------------------------------------------- */}
          <div className="space-y-3 bg-stone-50/70 p-4 rounded-2xl border border-stone-200/80">
            <div className="flex items-center justify-between border-b border-stone-200/60 pb-2">
              <div className="font-bold text-sm text-[#0F2F2B] flex items-center gap-2">
                <Shield className="w-4 h-4 text-emerald-600" />
                <span>ส่วนที่ 1: ข้อมูลบัญชีผู้ใช้งาน</span>
              </div>
              <span className="text-[11px] text-rose-500 font-medium">* จำเป็นต้องระบุ</span>
            </div>

            {/* Role Selector (Admin can choose, Physio is locked) */}
            <div>
              <label className="block font-bold text-slate-700 mb-1.5">
                บทบาทผู้ใช้งาน / Role <span className="text-rose-500">*</span>:
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
                    นักกายภาพเพิ่มได้เฉพาะคนไข้
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
                    placeholder={role === 'patient' ? 'เช่น นายสมศักดิ์ สุขใจ' : 'เช่น กภ. ชนกพร มั่งคั่ง'}
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

              {/* Username with Auto-Generate Action */}
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

            {/* Password & Confirm Password */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              {/* Password */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="font-bold text-slate-700">
                    รหัสผ่านชั่วคราว (อย่างน้อย 8 ตัว แนะนำ 10+) <span className="text-rose-500">*</span>:
                  </label>
                  <button
                    type="button"
                    onClick={handleAutoGeneratePassword}
                    className="text-[11px] text-emerald-700 font-bold hover:underline flex items-center gap-1 cursor-pointer"
                    title="สุ่มรหัสผ่านปลอดภัย"
                  >
                    <RefreshCw className="w-3 h-3 text-emerald-600" />
                    <span>สุ่มรหัสปลอดภัย</span>
                  </button>
                </div>
                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value);
                      if (errors.password) setErrors((prev) => ({ ...prev, password: undefined }));
                    }}
                    placeholder="อย่างน้อย 8 ตัวอักษร (แนะนำ 10+)"
                    className={`w-full pl-9 pr-9 py-2.5 rounded-2xl bg-white border text-xs font-mono font-bold text-[#0F2F2B] outline-none transition ${
                      errors.password
                        ? 'border-rose-400 ring-2 ring-rose-100'
                        : 'border-slate-200 focus:border-[#10B981] focus:ring-2 focus:ring-emerald-100'
                    }`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                  >
                    {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                </div>
                {errors.password && (
                  <p className="text-[11px] text-rose-600 font-semibold mt-1 flex items-center gap-1">
                    <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
                    <span>{errors.password}</span>
                  </p>
                )}
              </div>

              {/* Confirm Password */}
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  ยืนยันรหัสผ่าน <span className="text-rose-500">*</span>:
                </label>
                <div className="relative">
                  <KeyRound className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type={showConfirmPassword ? 'text' : 'password'}
                    value={confirmPassword}
                    onChange={(e) => {
                      setConfirmPassword(e.target.value);
                      if (errors.confirmPassword)
                        setErrors((prev) => ({ ...prev, confirmPassword: undefined }));
                    }}
                    placeholder="กรอกรหัสผ่านอีกครั้ง"
                    className={`w-full pl-9 pr-9 py-2.5 rounded-2xl bg-white border text-xs font-mono font-bold text-[#0F2F2B] outline-none transition ${
                      errors.confirmPassword
                        ? 'border-rose-400 ring-2 ring-rose-100'
                        : 'border-slate-200 focus:border-[#10B981] focus:ring-2 focus:ring-emerald-100'
                    }`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                  >
                    {showConfirmPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                </div>
                {errors.confirmPassword && (
                  <p className="text-[11px] text-rose-600 font-semibold mt-1 flex items-center gap-1">
                    <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
                    <span>{errors.confirmPassword}</span>
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
                <label className="block font-bold text-slate-700 mb-1">อีเมล (ถ้ามี):</label>
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
                    className="w-full pl-9 pr-3 py-2.5 rounded-2xl bg-white border border-emerald-200 text-xs font-bold text-[#0F2F2B] outline-none focus:border-[#10B981] cursor-pointer"
                  >
                    {therapists.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name} ({t.specialty.split('(')[0].trim()})
                      </option>
                    ))}
                  </select>
                </div>
                {currentRole === 'therapist' && (
                  <p className="text-[11px] text-emerald-700 font-semibold mt-1">
                    ✓ กำหนดให้อยู่ในความดูแลของ {currentUserName} อัตโนมัติ
                  </p>
                )}
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
                    <option value="กายภาพบำบัดระบบประสาท (Neurological PT)">
                      ระบบประสาท (Neurological PT)
                    </option>
                    <option value="กายภาพบำบัดในผู้สูงอายุ (Geriatric PT)">
                      ผู้สูงอายุและการทรงตัว (Geriatric PT)
                    </option>
                    <option value="กายภาพบำบัดระบบหัวใจและหลอดเลือด (Cardiopulmonary PT)">
                      ระบบหัวใจและหลอดเลือด (Cardiopulmonary PT)
                    </option>
                    <option value="กายภาพบำบัดทางการกีฬา (Sports PT)">
                      เวชศาสตร์การกีฬา (Sports PT)
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
                  placeholder="เช่น ปริญญาตรี กายภาพบำบัดบัณฑิต จุฬาลงกรณ์มหาวิทยาลัย มีประสบการณ์ดูแลผู้ป่วยข้อต่อ 5 ปี"
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
              {role === 'patient'
                ? '💡 บัญชีคนไข้จะได้รับรหัส P-XXXX พร้อมเริ่มทำกายภาพบำบัดได้ทันที'
                : '💡 บัญชีนักกายภาพจะได้รับรหัส T-XXX และสิทธิ์การจัดการเคส'}
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
                <span>{isSubmitting ? 'กำลังบันทึก...' : 'บันทึกบัญชี'}</span>
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
