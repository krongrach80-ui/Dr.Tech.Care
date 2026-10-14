import React, { useState, useEffect, useRef } from 'react';
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
  Folder,
  Camera,
  Trophy,
  History,
  FileCode,
  ShieldCheck,
  CheckCircle,
  Target,
  Clock,
  Layers,
} from 'lucide-react';
import { UserAccount, UserRole, PhysicalTherapist, UserStatus } from '../../types/hospital';
import { patientFaceStorageService, CompletePatientRecord } from '../../services/patientFaceStorageService';

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
  // Tabs: Profile/Clinical, Rehab History/Scores, Biometric/Login History
  const [activeTab, setActiveTab] = useState<'profile' | 'rehab' | 'biometric'>('profile');
  const [dossier, setDossier] = useState<CompletePatientRecord | null>(null);
  const [profileFaceUrl, setProfileFaceUrl] = useState<string | null>(null);

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
  const prevPatientKeyRef = useRef<string | null>(null);

  // Load Patient Dossier & Pre-fill existing data from isolated directory
  useEffect(() => {
    if (isOpen && patient) {
      const patientKey = `${patient.id}_${patient.code}`;
      // If modal is already open for this exact patient, don't wipe what the user is typing!
      if (prevPatientKeyRef.current === patientKey) {
        return;
      }
      prevPatientKeyRef.current = patientKey;

      const code = patient.code || String(patient.id);
      
      // Load complete dossier from isolated directory /public/uploads/patients/{code}/
      const loadedDossier = patientFaceStorageService.getPatientRecord(code);
      const faceUrl =
        patientFaceStorageService.getProfileFaceImage(code) ||
        patient.face_image_url ||
        null;

      setDossier(loadedDossier);
      setProfileFaceUrl(faceUrl);
      setActiveTab('profile');

      const resolvedName =
        patient.name ||
        (loadedDossier
          ? `${loadedDossier.patient_profile.first_name} ${loadedDossier.patient_profile.last_name}`.trim()
          : '');
      setName(resolvedName);
      setAge(patient.age ?? (loadedDossier?.patient_profile.age || 65));
      setGender(patient.gender || (loadedDossier?.patient_profile.gender || 'male'));
      setPhone(patient.phone || (loadedDossier?.patient_profile.contact || ''));
      setCreatedAt(patient.created_at || new Date().toISOString().split('T')[0]);

      // Match therapist
      const matchedTherapist =
        therapists.find((t) => t.id === patient.assignedTherapistId) ||
        therapists.find((t) => t.name === patient.assignedTherapistName) ||
        therapists[0];

      setAssignedTherapistId(matchedTherapist ? matchedTherapist.id : 1);
      setAssignedTherapistName(
        patient.assignedTherapistName ||
          (matchedTherapist ? matchedTherapist.name : 'กภ. ธนากร วงศ์สวัสดิ์')
      );

      const cleanComplaint = (
        patient.chiefComplaint ||
          patient.diagnosis ||
          loadedDossier?.medical_records.chief_complaint ||
          loadedDossier?.medical_records.diagnosis ||
          ''
      )
        .replace(/\[PENDING_INFO\]/g, '')
        .replace(/รอลงข้อมูลส่วนตัว/g, '')
        .trim();
      setChiefComplaint(cleanComplaint || 'ตรวจประเมินกายภาพบำบัด');

      const rawBg =
        patient.patientBackground || loadedDossier?.medical_records.treatment_plan || '';
      const cleanBg = rawBg
        .replace(/\[PENDING_INFO\]/g, '')
        .replace(/FACE_EMB:\[.*?\]/gs, '')
        .replace(/FACE_PHOTO:data:image\/[^\s\n]+/g, '')
        .replace(/รอลงข้อมูลส่วนตัว/g, '')
        .trim();
      setPatientBackground(cleanBg || 'ความดันโลหิตปกติ ไม่มีประวัติผ่าตัด');

      setTreatmentOutcome(patient.treatmentOutcome || '');

      const rawNotes =
        patient.therapistNotes || loadedDossier?.medical_records.progress_notes || '';
      const cleanNotes = rawNotes
        .replace(/\[PENDING_INFO\]/g, '')
        .replace(/บัญชีนี้สแกนหน้าแล้ว รอลงข้อมูลส่วนตัว/g, '')
        .trim();
      setTherapistNotes(cleanNotes || 'ให้ฝึกตามโปรแกรมที่กำหนดสม่ำเสมอ');

      setStatus(patient.status || 'active');

      setErrors({});
      setIsSubmitting(false);
    } else if (!isOpen) {
      prevPatientKeyRef.current = null;
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
    const nameParts = name.trim().split(' ');
    const firstName = nameParts[0] || name.trim();
    const lastName = nameParts.slice(1).join(' ') || '';

    const patientPhoto = (patient as any).photo || (patient as any).face_image_url || patientFaceStorageService.getProfileFaceImage(patient.code || patient.id);

    // Save directly to isolated storage: /public/uploads/patients/{patient_id}/patient_record.json
    patientFaceStorageService.savePatientRecord(patient.code || patient.id, {
      patient_profile: {
        id: patient.id,
        patient_id: patient.code,
        full_name: name.trim(),
        first_name: firstName,
        last_name: lastName,
        age: Number(age) || 65,
        gender: gender,
        contact: phone.trim() || undefined,
        created_at: createdAt,
        status: finalStatus,
      },
      medical_records: {
        diagnosis: chiefComplaint.trim() || 'ข้อไหล่ติดระยะฟื้นฟู (Frozen Shoulder)',
        chief_complaint: chiefComplaint.trim() || undefined,
        treatment_plan: patientBackground.trim() || undefined,
        progress_notes: therapistNotes.trim() || undefined,
        responsible_therapist: assignedTherapistName,
      },
    }, patientPhoto);

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
        className="w-full max-w-2xl sm:max-w-4xl bg-white rounded-[28px] sm:rounded-3xl shadow-2xl border border-emerald-200 overflow-hidden flex flex-col max-h-[94vh] animate-slideUp"
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
                <span>{canEdit ? 'แฟ้มประวัติเวชระเบียนคนไข้' : 'ดูข้อมูลเวชระเบียนคนไข้'}</span>
                <span className="text-xs px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-mono font-bold">
                  {patient.code}
                </span>
              </h3>
              <p className="text-[11px] text-emerald-800 font-medium">
                {name || patient.name} ({patient.code}) • แฟ้มประวัติแยกรายบุคคล
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
        {/* 2. ISOLATED STORAGE DOSSIER CARD & TAB NAVIGATION                 */}
        {/* ================================================================= */}
        <div className="px-6 pt-4 pb-2 bg-slate-50/70 border-b border-stone-200 flex-shrink-0 space-y-3">
          {/* Dossier Banner */}
          <div className="bg-gradient-to-r from-slate-900 via-emerald-950 to-[#0F2F2B] text-white p-3.5 sm:p-4 rounded-2xl shadow-md border border-emerald-800/40 flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="flex items-center gap-3.5 w-full sm:w-auto">
              {/* Profile Face Image */}
              <div className="relative group shrink-0">
                {profileFaceUrl ? (
                  <img
                    src={profileFaceUrl}
                    alt={patient.name}
                    className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl object-cover border-2 border-emerald-400 shadow-md ring-2 ring-emerald-500/30"
                  />
                ) : (
                  <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-emerald-800/80 border-2 border-emerald-600/50 flex flex-col items-center justify-center text-emerald-200">
                    <Camera className="w-5 h-5 mb-0.5 opacity-70" />
                    <span className="text-[9px] font-mono">No Face</span>
                  </div>
                )}
                <div className="absolute -bottom-1 -right-1 px-1.5 py-0.5 rounded-md bg-emerald-500 text-white font-mono text-[8px] font-black shadow-xs">
                  JPG
                </div>
              </div>

              {/* Directory & Dossier Info */}
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-xs font-bold px-2 py-0.5 rounded-full bg-emerald-500/30 text-emerald-300 border border-emerald-400/30">
                    {patient.code}
                  </span>
                  <span className="font-extrabold text-sm text-white">
                    {name || patient.name}
                  </span>
                  <span className="text-[11px] text-emerald-300/80 font-medium">
                    อายุ {age} ปี • {gender === 'female' ? 'หญิง' : 'ชาย'}
                  </span>
                </div>
                <div className="text-[11px] font-mono text-emerald-200/90 flex items-center gap-1.5 break-all">
                  <Folder className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                  <span>📁 /public/uploads/patients/{patient.code}/</span>
                </div>
                <div className="text-[10px] text-emerald-300/70 flex flex-wrap items-center gap-2 pt-0.5">
                  <span className="inline-flex items-center gap-1">
                    <FileCode className="w-3 h-3 text-emerald-400" />
                    <span>patient_record.json</span>
                  </span>
                  <span>•</span>
                  <span className="inline-flex items-center gap-1">
                    <Camera className="w-3 h-3 text-emerald-400" />
                    <span>profile_face.jpg</span>
                  </span>
                  <span>•</span>
                  <span className="inline-flex items-center gap-1">
                    <ShieldCheck className="w-3 h-3 text-emerald-400" />
                    <span>128-D Vector Ready</span>
                  </span>
                </div>
              </div>
            </div>

            {/* Quick Stats Badges */}
            <div className="flex items-center gap-3 sm:flex-col sm:items-end w-full sm:w-auto justify-between border-t sm:border-t-0 border-emerald-800/80 pt-2 sm:pt-0">
              <div className="text-right">
                <div className="text-[10px] text-emerald-300 font-medium">ประวัติการฝึกกายภาพ</div>
                <div className="text-sm font-black text-white font-mono">
                  {dossier?.game_rehab.rehab_scores.length || 0} ครั้ง
                </div>
              </div>
              <div className="text-right">
                <div className="text-[10px] text-emerald-300 font-medium">ประวัติสแกน Login</div>
                <div className="text-sm font-black text-white font-mono">
                  {dossier?.login_history?.length || 0} ภาพ
                </div>
              </div>
            </div>
          </div>

          {/* Tab Navigation */}
          <div className="flex items-center gap-2 overflow-x-auto pb-1">
            <button
              type="button"
              onClick={() => setActiveTab('profile')}
              className={`px-3.5 py-2 rounded-xl font-bold text-xs transition flex items-center gap-2 cursor-pointer shrink-0 ${
                activeTab === 'profile'
                  ? 'bg-emerald-100 text-emerald-900 border border-emerald-300 shadow-xs'
                  : 'text-slate-600 hover:bg-stone-200/60'
              }`}
            >
              <User className="w-3.5 h-3.5" />
              <span>1. ข้อมูลส่วนตัว & เวชระเบียน</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('rehab')}
              className={`px-3.5 py-2 rounded-xl font-bold text-xs transition flex items-center gap-2 cursor-pointer shrink-0 ${
                activeTab === 'rehab'
                  ? 'bg-emerald-100 text-emerald-900 border border-emerald-300 shadow-xs'
                  : 'text-slate-600 hover:bg-stone-200/60'
              }`}
            >
              <Trophy className="w-3.5 h-3.5 text-amber-600" />
              <span>2. ประวัติคะแนน & การฟื้นฟู</span>
              <span className="px-1.5 py-0.2 rounded-full bg-amber-200 text-amber-900 text-[10px] font-mono font-bold">
                {dossier?.game_rehab.rehab_scores.length || 0}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('biometric')}
              className={`px-3.5 py-2 rounded-xl font-bold text-xs transition flex items-center gap-2 cursor-pointer shrink-0 ${
                activeTab === 'biometric'
                  ? 'bg-emerald-100 text-emerald-900 border border-emerald-300 shadow-xs'
                  : 'text-slate-600 hover:bg-stone-200/60'
              }`}
            >
              <Camera className="w-3.5 h-3.5 text-emerald-600" />
              <span>3. บันทึกภาพยืนยันตัวตน (login_history)</span>
              <span className="px-1.5 py-0.2 rounded-full bg-emerald-200 text-emerald-900 text-[10px] font-mono font-bold">
                {dossier?.login_history?.length || 0}
              </span>
            </button>
          </div>
        </div>

        {/* ================================================================= */}
        {/* 3. TAB CONTENT (Scrollable)                                       */}
        {/* ================================================================= */}
        <div className="flex-1 overflow-y-auto px-6 py-5 text-xs">
          {/* TAB 1: ข้อมูลส่วนตัว & เวชระเบียน */}
          {activeTab === 'profile' && (
            <form onSubmit={handleSubmit} className="space-y-5">
              {/* SECTION 1: ข้อมูลส่วนตัว (Personal Information) */}
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

              {/* SECTION 2: ข้อมูลการรักษา (Clinical Details) */}
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
                    <span>ประวัติการซักประวัติ / อาการสำคัญ (Chief Complaint & Diagnosis)</span>
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
                    ประวัติคนไข้ตามปกติ / แผนการรักษา (Treatment Plan & Patient Background)
                  </label>
                  <textarea
                    rows={2}
                    disabled={!canEdit}
                    value={patientBackground}
                    onChange={(e) => setPatientBackground(e.target.value)}
                    placeholder="ประวัติโรคประจำตัว ยาที่ทาน แผนการรักษาและเป้าหมายการฟื้นฟู..."
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

                {/* โน้ตคำแนะนำจากนักกายภาพ */}
                <div className="bg-gradient-to-br from-emerald-50 via-emerald-50/70 to-teal-50/50 p-4 rounded-2xl border-2 border-emerald-300 shadow-sm space-y-2">
                  <label className="block text-emerald-900 font-extrabold text-xs flex items-center justify-between">
                    <span className="flex items-center gap-1.5">
                      <Sparkles className="w-4 h-4 text-emerald-600" />
                      <span>โน้ต / คำแนะนำจากนักกายภาพ (Progress Notes & Directives)</span>
                    </span>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-200/80 text-emerald-900 font-bold">
                      ซิงค์ไปยังตู้ Kiosk
                    </span>
                  </label>
                  <textarea
                    rows={3}
                    disabled={!canEdit}
                    value={therapistNotes}
                    onChange={(e) => setTherapistNotes(e.target.value)}
                    placeholder="ข้อความแนะนำและตารางฝึกที่มอบหมาย เช่น เน้นฝึกยืดเหยียดเบาๆ สม่ำเสมอ ไม่ฝืนยกของหนักเกิน 3 กก..."
                    className={`w-full p-3.5 rounded-2xl border text-xs leading-relaxed focus:outline-none focus:ring-2 font-medium ${
                      !canEdit
                        ? 'bg-white/80 text-emerald-950 border-emerald-200 cursor-not-allowed'
                        : 'border-emerald-300 bg-white text-emerald-950 focus:ring-[#10B981]'
                    }`}
                  />
                </div>
              </div>

              {/* SECTION 3: สถานะบัญชี (Account Status) */}
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
          )}

          {/* TAB 2: ประวัติคะแนนและการฝึกกายภาพ (Rehab History & Scores) */}
          {activeTab === 'rehab' && (
            <div className="space-y-5">
              {/* Assigned Exercises Card */}
              <div className="bg-emerald-50/70 border border-emerald-200 rounded-2xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="font-bold text-xs text-[#0F2F2B] flex items-center gap-2">
                    <Target className="w-4 h-4 text-emerald-600" />
                    <span>ท่ากายภาพที่ได้รับมอบหมายในแผน (Assigned Exercises)</span>
                  </div>
                  <span className="text-[10px] text-emerald-800 font-mono font-bold">
                    {dossier?.medical_records.assigned_exercises?.length || 0} ท่า
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  {(dossier?.medical_records.assigned_exercises || []).map((ex, idx) => (
                    <div
                      key={ex.id || idx}
                      className="bg-white p-3 rounded-xl border border-emerald-100 shadow-xs space-y-1"
                    >
                      <div className="font-extrabold text-[11px] text-emerald-950 truncate">
                        {ex.name}
                      </div>
                      <div className="text-[10px] text-slate-500 flex items-center justify-between">
                        <span>เป้าหมาย {ex.target_angle}°</span>
                        <span>{ex.reps} ครั้ง</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Rehab Scores History */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="font-bold text-sm text-[#0F2F2B] flex items-center gap-2">
                    <Trophy className="w-4 h-4 text-amber-500" />
                    <span>ประวัติบันทึกคะแนนการฝึก (Rehabilitation Session History)</span>
                  </div>
                  <span className="text-[11px] text-slate-500">
                    จัดเก็บใน: <code className="font-mono text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded">patient_record.json</code>
                  </span>
                </div>

                {dossier?.game_rehab.rehab_scores && dossier.game_rehab.rehab_scores.length > 0 ? (
                  <div className="space-y-2.5">
                    {dossier.game_rehab.rehab_scores.map((sc, idx) => (
                      <div
                        key={sc.id || idx}
                        className="p-3.5 bg-white rounded-2xl border border-stone-200 hover:border-emerald-300 transition shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-xl bg-amber-50 border border-amber-200 flex flex-col items-center justify-center text-amber-700 font-black text-xs shrink-0">
                            <span>{sc.score}</span>
                            <span className="text-[8px] font-normal text-amber-600">คะแนน</span>
                          </div>
                          <div>
                            <div className="font-bold text-xs text-[#0F2F2B]">
                              {sc.exercise_name}
                            </div>
                            <div className="text-[11px] text-slate-500 flex items-center gap-2 mt-0.5">
                              <span>📅 {new Date(sc.timestamp).toLocaleString('th-TH')}</span>
                              <span>•</span>
                              <span>จำนวน: <strong className="text-slate-700">{sc.reps} ครั้ง</strong></span>
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-3 justify-end text-xs">
                          <div className="text-right">
                            <div className="text-[10px] text-slate-400">มุมสูงสุด / เป้าหมาย</div>
                            <div className="font-mono font-bold text-emerald-700">
                              {sc.max_angle}° / {sc.target_angle}°
                            </div>
                          </div>
                          <div className="px-2.5 py-1 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 font-black font-mono">
                            {Math.round(sc.accuracy || 95)}% แม่นยำ
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="p-8 bg-stone-50 rounded-2xl border border-stone-200/80 text-center space-y-2">
                    <Trophy className="w-8 h-8 text-slate-300 mx-auto" />
                    <p className="text-xs font-bold text-slate-600">
                      ยังไม่มีประวัติคะแนนการฝึกที่บันทึกไว้สำหรับคนไข้ท่านนี้
                    </p>
                    <p className="text-[11px] text-slate-400 max-w-sm mx-auto">
                      เมื่อคนไข้เข้าใช้งานและฝึกกายภาพผ่านตู้ Kiosk คะแนนและผลลัพธ์การฝึกจะถูกบันทึกเข้ามาในแฟ้มประวัตินี้โดยอัตโนมัติ
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 3: บันทึกภาพยืนยันตัวตน (login_history) */}
          {activeTab === 'biometric' && (
            <div className="space-y-5">
              {/* Biometric Enrollment Dossier Info */}
              <div className="bg-slate-900 text-white p-4 rounded-2xl border border-slate-700 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="font-bold text-xs flex items-center gap-2 text-emerald-400">
                    <ShieldCheck className="w-4 h-4" />
                    <span>ข้อมูลชีวมิติอ้างอิง (Biometric Reference Data)</span>
                  </div>
                  <span className="font-mono text-[10px] text-slate-400">
                    128-D Vector Embeddings
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                  <div className="bg-slate-800/80 p-3 rounded-xl border border-slate-700/60">
                    <div className="text-[10px] text-slate-400">ไฟล์ภาพถ่ายอ้างอิง</div>
                    <div className="font-mono text-emerald-300 text-[11px] truncate mt-0.5">
                      📁 /public/uploads/patients/{patient.code}/profile_face.jpg
                    </div>
                  </div>

                  <div className="bg-slate-800/80 p-3 rounded-xl border border-slate-700/60">
                    <div className="text-[10px] text-slate-400">วันที่ลงทะเบียนใบหน้า</div>
                    <div className="font-medium text-slate-200 text-[11px] mt-0.5">
                      {dossier?.biometric_data.enrolled_at
                        ? new Date(dossier.biometric_data.enrolled_at).toLocaleString('th-TH')
                        : 'ลงทะเบียนแล้วผ่านตู้ Kiosk'}
                    </div>
                  </div>

                  <div className="bg-slate-800/80 p-3 rounded-xl border border-slate-700/60">
                    <div className="text-[10px] text-slate-400">ความยาว Vector</div>
                    <div className="font-mono text-emerald-300 text-[11px] mt-0.5">
                      {dossier?.biometric_data.face_vector.length || 128} ค่า (ResNet34)
                    </div>
                  </div>
                </div>
              </div>

              {/* Login Snapshots History */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="font-bold text-sm text-[#0F2F2B] flex items-center gap-2">
                    <Camera className="w-4 h-4 text-emerald-600" />
                    <span>ภาพถ่ายบันทึกการ Login ที่ตู้ Kiosk (login_history/)</span>
                    <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-bold">
                      นโยบายจัดเก็บ: ล่าสุด 10 ภาพ (~100-150 KB/ภาพ)
                    </span>
                  </div>
                  <span className="text-[11px] text-slate-500 font-mono">
                    📁 /public/uploads/patients/{patient.code}/login_history/
                  </span>
                </div>

                {dossier?.login_history && dossier.login_history.length > 0 ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {dossier.login_history.map((snap, idx) => {
                      const snapSrc =
                        (typeof window !== 'undefined'
                          ? localStorage.getItem(`fs:${snap.snapshot_image_url}`)
                          : null) || snap.snapshot_image_url;

                      return (
                        <div
                          key={snap.timestamp || idx}
                          className="p-3 bg-white rounded-2xl border border-stone-200 shadow-xs flex items-center gap-3"
                        >
                          <img
                            src={snapSrc}
                            alt="Login Snapshot"
                            className="w-16 h-16 rounded-xl object-cover border border-emerald-300 bg-stone-100 shrink-0"
                          />
                          <div className="space-y-1 overflow-hidden">
                            <div className="flex items-center gap-1.5">
                              <span className="px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-800 font-bold font-mono text-[10px]">
                                Match {snap.similarity_percent}
                              </span>
                              <span className="text-[10px] text-slate-400">
                                {snap.date_str}
                              </span>
                            </div>
                            <div className="text-[10px] font-mono text-slate-500 truncate" title={snap.snapshot_image_url}>
                              {snap.snapshot_image_url.split('/').pop()}
                            </div>
                            <div className="text-[10px] text-emerald-700 font-semibold flex items-center gap-1">
                              <CheckCircle className="w-3 h-3 text-emerald-600 shrink-0" />
                              <span>ยืนยันตัวตนสำเร็จ (Kiosk Face Match)</span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="p-8 bg-stone-50 rounded-2xl border border-stone-200/80 text-center space-y-2">
                    <Camera className="w-8 h-8 text-slate-300 mx-auto" />
                    <p className="text-xs font-bold text-slate-600">
                      ยังไม่มีภาพถ่ายบันทึกการ Login ในโฟลเดอร์ login_history/
                    </p>
                    <p className="text-[11px] text-slate-400 max-w-sm mx-auto">
                      ทุกครั้งที่คนไข้สแกนใบหน้าเข้าใช้งานผ่านตู้ Kiosk ระบบจะบันทึกภาพถ่าย Snapshot พร้อมค่า Cosine Match ไว้ในโฟลเดอร์ login_history/ ของคนไข้ท่านนี้
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* ================================================================= */}
        {/* 4. MODAL FOOTER                                                   */}
        {/* ================================================================= */}
        <div className="px-6 py-4 border-t border-emerald-100 bg-stone-50/50 flex items-center justify-between gap-3 flex-shrink-0">
          <div className="text-[11px] text-slate-500 font-medium">
            <span>แฟ้มข้อมูลเดี่ยว: </span>
            <code className="font-mono text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
              📁 /public/uploads/patients/{patient.code}/
            </code>
          </div>

          <div className="flex items-center gap-3">
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
                        : 'บันทึกการแก้ไขเวชระเบียน'}
                    </span>
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
