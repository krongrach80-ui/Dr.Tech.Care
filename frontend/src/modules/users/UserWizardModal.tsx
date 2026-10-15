import React, { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Eye, EyeOff, Sparkles, UserPlus } from 'lucide-react';
import { Modal } from '../../components/common/Modal';
import { Button } from '../../components/common/Button';
import { BiometricEnrollmentStep } from './BiometricEnrollmentStep';
import { CreateUserWizardSchema, CreateUserWizardInput, User } from '../../types/schema';
import { api } from '../../lib/api';

export interface UserWizardModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (newUser: User) => void;
  actorRole: 'admin' | 'pt';
  currentPtId?: string;
}

export const UserWizardModal: React.FC<UserWizardModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  actorRole,
  currentPtId,
}) => {
  const [step, setStep] = useState<1 | 2>(1);
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [therapists, setTherapists] = useState<User[]>([]);
  const [createdUser, setCreatedUser] = useState<User | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const defaultRole = actorRole === 'pt' ? 'patient' : 'patient';

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    reset,
    formState: { errors },
  } = useForm<any>({
    resolver: zodResolver(CreateUserWizardSchema) as any,
    defaultValues: {
      role: defaultRole,
      full_name: '',
      username: '',
      id: '',
      password: '',
      confirm_password: '',
      phone: '-',
      email: '-',
      age: 60,
      gender: 'male',
      admission_date: new Date().toISOString().split('T')[0],
      assigned_pt_id: currentPtId || null,
      underlying_diseases: '-',
      drug_allergies: '-',
      department: 'Musculoskeletal',
      license_number: 'PT-' + Math.floor(1000 + Math.random() * 9000),
    },
  });

  const selectedRole = watch('role');

  // Load PTs for assigned_pt dropdown
  useEffect(() => {
    if (isOpen) {
      api.pt.list().then((res) => {
        setTherapists(res.therapists || []);
      }).catch(console.error);

      // Auto-generate random ID
      const prefix = selectedRole === 'patient' ? 'P-' : selectedRole === 'pt' ? 'T-' : 'A-';
      const randNum = Math.floor(1000 + Math.random() * 9000);
      setValue('id', `${prefix}${randNum}`);
    }
  }, [isOpen, selectedRole, setValue]);

  // Generate secure temporary password
  const generateSecurePassword = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$%';
    let pass = 'Moh#';
    for (let i = 0; i < 6; i++) {
      pass += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    setValue('password', pass);
    setValue('confirm_password', pass);
  };

  // Generate unique username based on full name
  const randomizeUsername = () => {
    const randNum = Math.floor(100 + Math.random() * 900);
    const prefix = selectedRole === 'patient' ? 'pat' : selectedRole === 'pt' ? 'pt' : 'adm';
    setValue('username', `${prefix}.${randNum}`);
  };

  const handleStep1Submit = async (data: any) => {
    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      const res = await api.users.create(data);
      setCreatedUser(res.user);
      setStep(2);
    } catch (err: any) {
      setErrorMessage(err?.message || 'ไม่สามารถสร้างผู้ใช้งานได้');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleBiometricComplete = async (frames: string[], embedding: number[]) => {
    if (!createdUser) return;
    setIsSubmitting(true);
    try {
      await api.users.saveBiometrics(createdUser.id, frames, embedding);
      onSuccess(createdUser);
      handleClose();
    } catch (err: any) {
      alert('บันทึกชีวมิติไม่สำเร็จ: ' + err?.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    reset();
    setStep(1);
    setCreatedUser(null);
    setErrorMessage(null);
    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      size="2xl"
      title={
        <div className="flex items-center gap-2">
          <UserPlus className="w-5 h-5 text-emerald-400" />
          <span>{actorRole === 'pt' ? 'เพิ่มผู้ป่วยใหม่ (Add New Patient)' : 'เพิ่มผู้ใช้งานใหม่ (Add New User Wizard)'}</span>
        </div>
      }
      subtitle={step === 1 ? 'ขั้นตอนที่ 1: กรอกข้อมูลบัญชีและเวชระเบียน' : 'ขั้นตอนที่ 2: บันทึกข้อมูลชีวมิติ 10 เฟรม'}
    >
      {errorMessage && (
        <div className="mb-4 p-3 rounded-xl bg-rose-950/80 border border-rose-700 text-rose-300 text-xs">
          {errorMessage}
        </div>
      )}

      {step === 1 ? (
        <form onSubmit={handleSubmit(handleStep1Submit)} className="space-y-4">
          {/* Role selector */}
          <div className="space-y-1">
            <label className="text-xs font-semibold uppercase text-slate-300">
              บทบาทผู้ใช้งาน (Role)
            </label>
            {actorRole === 'pt' ? (
              <div className="p-2.5 rounded-xl bg-slate-800/80 border border-slate-700 text-sm font-semibold text-emerald-400">
                ผู้ป่วย (Patient) — สิทธิ์ของนักกายภาพบำบัดถูกล็อกเฉพาะการเพิ่มผู้ป่วย
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-2">
                {[
                  { id: 'patient', label: 'ผู้ป่วย (Patient)' },
                  { id: 'pt', label: 'นักกายภาพบำบัด (PT)' },
                  { id: 'admin', label: 'ผู้อำนวยการ / Admin' },
                ].map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => {
                      setValue('role', r.id as any);
                      const prefix = r.id === 'patient' ? 'P-' : r.id === 'pt' ? 'T-' : 'A-';
                      setValue('id', `${prefix}${Math.floor(1000 + Math.random() * 9000)}`);
                    }}
                    className={`py-2 px-3 rounded-xl border text-xs font-semibold transition-all ${
                      selectedRole === r.id
                        ? 'bg-emerald-600 text-white border-emerald-500 shadow-md shadow-emerald-600/30'
                        : 'bg-slate-900 text-slate-400 border-slate-800 hover:bg-slate-800'
                    }`}
                  >
                    {r.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Account credentials */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-slate-800">
            <div>
              <label className="text-xs text-slate-300 font-medium">ชื่อ-นามสกุล (Full Name) *</label>
              <input
                type="text"
                {...register('full_name')}
                placeholder="เช่น นายสมชาย มีสุข"
                className="mt-1 w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500"
              />
              {errors.full_name && <p className="text-xs text-rose-400 mt-1">{String(errors.full_name.message)}</p>}
            </div>

            <div>
              <div className="flex items-center justify-between">
                <label className="text-xs text-slate-300 font-medium">รหัสประจำตัว (Unique ID / HN) *</label>
                <span className="text-[10px] text-slate-500 font-mono">P-#### / T-### / A-###</span>
              </div>
              <input
                type="text"
                {...register('id')}
                placeholder="เช่น P-1005"
                className="mt-1 w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white font-mono focus:outline-none focus:border-emerald-500"
              />
              {errors.id && <p className="text-xs text-rose-400 mt-1">{String(errors.id.message)}</p>}
            </div>

            <div>
              <div className="flex items-center justify-between">
                <label className="text-xs text-slate-300 font-medium">ชื่อผู้ใช้งาน (Username) *</label>
                <button
                  type="button"
                  onClick={randomizeUsername}
                  className="text-[10px] text-emerald-400 hover:underline flex items-center gap-0.5"
                >
                  <Sparkles className="w-3 h-3" /> สุ่มชื่อผู้ใช้
                </button>
              </div>
              <input
                type="text"
                {...register('username')}
                placeholder="username"
                className="mt-1 w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500"
              />
              {errors.username && <p className="text-xs text-rose-400 mt-1">{String(errors.username.message)}</p>}
            </div>

            <div>
              <div className="flex items-center justify-between">
                <label className="text-xs text-slate-300 font-medium">รหัสผ่านชั่วคราว (Temp Password) *</label>
                <button
                  type="button"
                  onClick={generateSecurePassword}
                  className="text-[10px] text-emerald-400 hover:underline flex items-center gap-0.5"
                >
                  <Sparkles className="w-3 h-3" /> สร้างรหัสปลอดภัย
                </button>
              </div>
              <div className="relative mt-1">
                <input
                  type={showPassword ? 'text' : 'password'}
                  {...register('password')}
                  placeholder="รหัสผ่านอย่างน้อย 6 ตัวอักษร"
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white pr-9 focus:outline-none focus:border-emerald-500"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-2.5 top-2.5 text-slate-400 hover:text-white"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {errors.password && <p className="text-xs text-rose-400 mt-1">{String(errors.password.message)}</p>}
            </div>

            <div>
              <label className="text-xs text-slate-300 font-medium">ยืนยันรหัสผ่าน *</label>
              <input
                type={showPassword ? 'text' : 'password'}
                {...register('confirm_password')}
                placeholder="พิมพ์รหัสผ่านซ้ำอีกครั้ง"
                className="mt-1 w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500"
              />
              {errors.confirm_password && <p className="text-xs text-rose-400 mt-1">{String(errors.confirm_password.message)}</p>}
            </div>

            <div>
              <label className="text-xs text-slate-300 font-medium">เบอร์โทรศัพท์ (Phone)</label>
              <input
                type="text"
                {...register('phone')}
                placeholder="เช่น 081-234-5678 (เว้นว่างใส่ -)"
                className="mt-1 w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500"
              />
            </div>
          </div>

          {/* Role-Specific fields: Patient */}
          {selectedRole === 'patient' && (
            <div className="space-y-3 pt-3 border-t border-slate-800">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-emerald-400">
                ข้อมูลเวชระเบียนผู้ป่วย (Patient Clinical Profile)
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="text-xs text-slate-300">อายุ (Age) *</label>
                  <input
                    type="number"
                    {...register('age')}
                    className="mt-1 w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white"
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-300">เพศ (Gender)</label>
                  <select
                    {...register('gender')}
                    className="mt-1 w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white"
                  >
                    <option value="male">ชาย (Male)</option>
                    <option value="female">หญิง (Female)</option>
                    <option value="other">อื่นๆ (Other)</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs text-slate-300">นักกายภาพบำบัดเจ้าของไข้</label>
                  <select
                    {...register('assigned_pt_id')}
                    className="mt-1 w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white"
                  >
                    <option value="">- เลือกนักกายภาพบำบัด -</option>
                    {therapists.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.full_name} ({t.id})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="text-xs text-slate-300">อาการเริ่มต้น / การวินิจฉัย (Initial Symptoms)</label>
                <textarea
                  {...register('initial_symptoms')}
                  rows={2}
                  placeholder="เช่น ฟื้นฟูกล้ามเนื้อไหล่และข้อศอกหลังผ่าตัด"
                  className="mt-1 w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-slate-300">โรคประจำตัว (Underlying Diseases)</label>
                  <input
                    type="text"
                    {...register('underlying_diseases')}
                    placeholder="default -"
                    className="mt-1 w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white"
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-300">ประวัติการแพ้ยา (Drug Allergies)</label>
                  <input
                    type="text"
                    {...register('drug_allergies')}
                    placeholder="default -"
                    className="mt-1 w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Role-Specific fields: PT */}
          {selectedRole === 'pt' && (
            <div className="space-y-3 pt-3 border-t border-slate-800">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-teal-400">
                ข้อมูลวิชาชีพนักกายภาพบำบัด (PT Professional Profile)
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-slate-300">เลขที่ใบอนุญาตประกอบวิชาชีพ *</label>
                  <input
                    type="text"
                    {...register('license_number')}
                    className="mt-1 w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white font-mono"
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-300">แผนกเฉพาะทาง (Department)</label>
                  <select
                    {...register('department')}
                    className="mt-1 w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white"
                  >
                    <option value="Musculoskeletal">Musculoskeletal (กล้ามเนื้อและกระดูก)</option>
                    <option value="Neurological">Neurological (ระบบประสาท & Stroke)</option>
                    <option value="Geriatric">Geriatric (ผู้สูงอายุ)</option>
                    <option value="Sports PT">Sports PT (เวชศาสตร์การกีฬา)</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="text-xs text-slate-300">ประวัติ / ประสบการณ์ (Bio)</label>
                <textarea
                  {...register('bio')}
                  rows={2}
                  placeholder="ความเชี่ยวชาญพิเศษ ประสบการณ์การทำงาน"
                  className="mt-1 w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white"
                />
              </div>
            </div>
          )}

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-800">
            <Button variant="ghost" type="button" onClick={handleClose}>
              ยกเลิก (Cancel)
            </Button>
            <Button variant="primary" type="submit" isLoading={isSubmitting}>
              ขั้นตอนถัดไป: สแกนใบหน้า Biometrics ➔
            </Button>
          </div>
        </form>
      ) : (
        createdUser && (
          <BiometricEnrollmentStep
            userId={createdUser.id}
            fullName={createdUser.full_name}
            role={createdUser.role}
            onBack={() => setStep(1)}
            onSkip={() => {
              onSuccess(createdUser);
              handleClose();
            }}
            onComplete={handleBiometricComplete}
            isLoading={isSubmitting}
          />
        )
      )}
    </Modal>
  );
};
