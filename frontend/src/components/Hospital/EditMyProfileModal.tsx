import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  User,
  Phone,
  Mail,
  Camera,
  Upload,
  FileText,
  Check,
  Award,
  Shield,
  Stethoscope,
  Trash2,
} from 'lucide-react';
import { PhysicalTherapist, UserAccount } from '../../types/hospital';

interface EditMyProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  therapist: PhysicalTherapist | null;
  userAccount: UserAccount | null;
  onSaveProfile: (updatedData: {
    phone: string;
    email: string;
    bio: string;
    photoUrl?: string;
  }) => void;
  onSuccessToast: (msg: string) => void;
}

export const EditMyProfileModal: React.FC<EditMyProfileModalProps> = ({
  isOpen,
  onClose,
  therapist,
  userAccount,
  onSaveProfile,
  onSuccessToast,
}) => {
  const [phone, setPhone] = useState<string>('');
  const [email, setEmail] = useState<string>('');
  const [bio, setBio] = useState<string>('');
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (isOpen && therapist) {
      setPhone(therapist.phone || userAccount?.phone || '');
      setEmail(therapist.email || userAccount?.email || '');
      setBio(therapist.bio || '');
      setPhotoPreview(therapist.photoUrl || userAccount?.face_image_url || null);
    }
  }, [isOpen, therapist, userAccount]);

  if (!isOpen || !therapist) return null;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const result = event.target?.result as string;
        setPhotoPreview(result);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    onSaveProfile({
      phone: phone.trim(),
      email: email.trim(),
      bio: bio.trim(),
      photoUrl: photoPreview || undefined,
    });

    onSuccessToast('อัปเดตข้อมูลโปรไฟล์ส่วนตัวเรียบร้อยแล้ว');
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
              <User className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-extrabold text-base sm:text-lg text-[#0F2F2B]">
                แก้ไขโปรไฟล์ส่วนตัว (Edit My Profile)
              </h3>
              <p className="text-[11px] text-emerald-800 font-medium">
                {therapist.name} ({therapist.code})
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
          {/* Read-Only Credentials Section */}
          <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 space-y-2">
            <div className="text-[11px] font-bold text-slate-500 flex items-center gap-1.5">
              <Shield className="w-3.5 h-3.5 text-slate-400" />
              <span>ข้อมูลรับรองทางวิชาชีพ (Read-Only Hospital Credentials):</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div>
                <span className="text-slate-500">เลขที่ใบอนุญาตประกอบวิชาชีพ:</span>
                <div className="font-mono font-bold text-emerald-800 mt-0.5">
                  {therapist.licenseNumber || 'กภ.12458'}
                </div>
              </div>

              <div>
                <span className="text-slate-500">สาขาความเชี่ยวชาญ / แผนก:</span>
                <div className="font-bold text-[#0F2F2B] mt-0.5">
                  {therapist.specialty}
                </div>
              </div>
            </div>
          </div>

          {/* Photo Upload Section */}
          <div>
            <label className="block font-bold text-slate-700 mb-1.5">รูปโปรไฟล์ (Profile Photo):</label>
            <div className="flex items-center gap-4">
              <div className="w-20 h-20 rounded-2xl bg-slate-100 border-2 border-emerald-300 shadow-md overflow-hidden flex items-center justify-center flex-shrink-0">
                {photoPreview ? (
                  <img src={photoPreview} alt={therapist.name} className="w-full h-full object-cover" />
                ) : (
                  <User className="w-8 h-8 text-slate-400" />
                )}
              </div>

              <div className="space-y-1.5">
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileChange}
                  accept="image/png,image/jpeg,image/webp"
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="px-3.5 py-1.5 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 font-bold text-xs flex items-center gap-1.5 transition cursor-pointer shadow-2xs"
                >
                  <Upload className="w-3.5 h-3.5 text-emerald-600" />
                  <span>เลือกรูปภาพจากเครื่อง</span>
                </button>

                {photoPreview && (
                  <button
                    type="button"
                    onClick={() => setPhotoPreview(null)}
                    className="px-2.5 py-1 text-slate-400 hover:text-rose-600 text-[11px] font-bold flex items-center gap-1 transition"
                  >
                    <Trash2 className="w-3 h-3" />
                    <span>ลบรูปภาพ</span>
                  </button>
                )}
                <div className="text-[10px] text-slate-400">รองรับไฟล์ JPG, PNG หรือ WebP ขนาดไม่เกิน 5MB</div>
              </div>
            </div>
          </div>

          {/* Phone & Email */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block font-bold text-slate-700 mb-1">เบอร์โทรศัพท์ติดต่อ:</label>
              <div className="relative">
                <Phone className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="เช่น 081-456-7890"
                  className="w-full pl-8 pr-3 py-2 rounded-xl bg-white border border-slate-300 font-bold text-xs text-[#0F2F2B] outline-none focus:border-emerald-500"
                />
              </div>
            </div>

            <div>
              <label className="block font-bold text-slate-700 mb-1">อีเมลติดต่อ:</label>
              <div className="relative">
                <Mail className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="เช่น thanakorn.w@strongcare.hospital"
                  className="w-full pl-8 pr-3 py-2 rounded-xl bg-white border border-slate-300 font-bold text-xs text-[#0F2F2B] outline-none focus:border-emerald-500"
                />
              </div>
            </div>
          </div>

          {/* Bio & Education Background */}
          <div>
            <label className="block font-bold text-slate-700 mb-1">
              ประวัติส่วนตัว & การศึกษา (Bio & Professional Background):
            </label>
            <textarea
              rows={3}
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              placeholder="ระบุวุฒิการศึกษา สถาบันที่สำเร็จการศึกษา และประสบการณ์ทางคลินิก..."
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
              className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-[#10B981] via-[#06B6D4] to-[#2563EB] hover:opacity-95 text-white font-extrabold shadow-md shadow-cyan-500/25 transition active:scale-95 cursor-pointer flex items-center gap-2"
            >
              <Check className="w-4 h-4" />
              <span>บันทึกการเปลี่ยนแปลง</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
