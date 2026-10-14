import React from 'react';
import { ArrowLeft, Play, Gamepad2, User, Settings, Info } from 'lucide-react';
import { Patient } from '../../types/patient';

interface Screen3MenuProps {
  userName: string;
  patient: Patient | null;
  onBack: () => void;
  onStartTherapy: () => void;
  onOpenTherapySettings: () => void;
  onStartMiniGame: () => void;
  onOpenMiniGameSettings: () => void;
  onOpenUserInfo: () => void;
}

export const Screen3Menu: React.FC<Screen3MenuProps> = ({
  userName,
  patient,
  onBack,
  onStartTherapy,
  onOpenTherapySettings,
  onStartMiniGame,
  onOpenMiniGameSettings,
  onOpenUserInfo,
}) => {
  return (
    <div className="w-full max-w-[480px] mx-auto flex flex-col animate-fadeIn relative z-10 py-4 sm:py-8">
      
      {/* Top Back Navigation Header */}
      <div className="flex items-center justify-between w-full mb-4">
        <button
          onClick={onBack}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-white/80 backdrop-blur-md border border-emerald-200/80 text-sm font-semibold text-[#0B2B2B] hover:bg-white transition active:scale-95 shadow-sm"
          aria-label="ออกจากระบบ กลับไปหน้าเข้าสู่ระบบ"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>ออกจากระบบ</span>
        </button>
        <span className="text-xs font-semibold text-emerald-800">ขั้นตอนที่ 3 จาก 4</span>
      </div>

      {/* Main Container Card */}
      <div className="bg-white/85 backdrop-blur-xl border border-emerald-200/90 rounded-[32px] p-6 sm:p-8 shadow-xl shadow-emerald-700/5 space-y-6">
        
        {/* บนสุด: หัวข้อ "ชื่อผู้ใช้" (แสดงชื่อผู้ใช้ที่ล็อกอินอยู่) พร้อมเส้นใต้ */}
        <div className="flex flex-col items-center text-center">
          <h2 className="heading-underline !mb-3">
            {userName || 'ชื่อผู้ใช้'}
          </h2>
        </div>

        {/* User Profile Badge */}
        <div className="flex items-center gap-3.5 bg-white rounded-2xl p-3.5 border border-emerald-200/80 shadow-sm">
          {patient?.photo || patient?.avatar_url ? (
            <img
              src={patient.photo || patient.avatar_url}
              alt={userName}
              className="w-12 h-12 rounded-full object-cover border-2 border-emerald-500 shadow-sm flex-shrink-0"
            />
          ) : (
            <div className="w-12 h-12 rounded-full bg-gradient-to-tr from-[#10B981] via-[#06B6D4] to-[#2563EB] flex items-center justify-center text-white font-bold text-xl shadow-md shadow-cyan-500/25 flex-shrink-0">
              {userName.charAt(0) || 'ส'}
            </div>
          )}
          <div className="flex-1 min-w-0 text-left">
            <div className="text-sm sm:text-base font-bold text-[#0B2B2B] truncate">
              {userName}
            </div>
            <div className="inline-block text-[11px] font-bold text-[#1E8A4C] bg-[#D7F9E1] px-2.5 py-0.5 rounded-full mt-0.5 truncate max-w-[260px]">
              {patient?.notes || (patient?.patient_code ? `รหัสคนไข้: ${patient.patient_code}` : 'แผนการฟื้นฟูกายภาพบำบัดเฉพาะบุคคล')}
            </div>
          </div>
          <button
            onClick={onOpenUserInfo}
            className="p-2 text-[#1E8A4C] hover:bg-emerald-50 rounded-full transition"
            aria-label="ดูข้อมูลผู้ใช้เพิ่มเติม"
          >
            <Info className="w-5 h-5" />
          </button>
        </div>

        {/* ปุ่ม 3 ปุ่มเรียงแนวตั้ง:
             1. "เริ่มกายภาพ" (Primary) มีไอคอนเฟืองสีเขียวอยู่ด้านขวานอกปุ่ม (ตั้งค่า)
             2. "เริ่มกายภาพแบบมินิเกม" (Secondary) มีไอคอนเฟืองด้านขวาเช่นกัน
             3. "ข้อมูลผู้ใช้" (Secondary) ไม่มีเฟือง */}
        <div className="space-y-4 pt-2">
          
          {/* 1. "เริ่มกายภาพ" (Primary) + ไอคอนเฟืองสีเขียวอยู่นอกปุ่ม */}
          <div className="flex items-center gap-3 w-full">
            <button
              onClick={onStartTherapy}
              className="btn-primary-capsule !w-auto flex-1 !m-0"
              id="btnStartTherapy"
            >
              <Play className="w-5 h-5 fill-white flex-shrink-0" />
              <span>เริ่มกายภาพ</span>
            </button>

            <button
              onClick={onOpenTherapySettings}
              className="w-14 h-14 min-w-[56px] min-h-[56px] rounded-full bg-white hover:bg-emerald-50 border-2 border-[#1E8A4C] text-[#1E8A4C] shadow-md flex items-center justify-center transition active:scale-95 flex-shrink-0 outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
              aria-label="ตั้งค่าเริ่มกายภาพ"
              title="ตั้งค่าการทำกายภาพ (เลือกเวลาและท่าทาง)"
            >
              <Settings className="w-6 h-6" />
            </button>
          </div>

          {/* 2. "เริ่มกายภาพแบบมินิเกม" (Secondary) + ไอคอนเฟืองด้านขวา */}
          <div className="flex items-center gap-3 w-full">
            <button
              onClick={onStartMiniGame}
              className="btn-secondary-capsule !w-auto flex-1 !m-0"
              id="btnStartMiniGame"
            >
              <Gamepad2 className="w-5 h-5 text-[#1E8A4C] flex-shrink-0" />
              <span>เริ่มกายภาพแบบมินิเกม</span>
            </button>

            <button
              onClick={onOpenMiniGameSettings}
              className="w-14 h-14 min-w-[56px] min-h-[56px] rounded-full bg-white hover:bg-emerald-50 border-2 border-[#1E8A4C] text-[#1E8A4C] shadow-md flex items-center justify-center transition active:scale-95 flex-shrink-0 outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
              aria-label="ตั้งค่ามินิเกม"
              title="ตั้งค่ามินิเกม (เลือกเวลาและท่าทาง)"
            >
              <Settings className="w-6 h-6" />
            </button>
          </div>

          {/* 3. "ข้อมูลผู้ใช้" (Secondary) ไม่มีเฟือง */}
          <div className="w-full">
            <button
              onClick={onOpenUserInfo}
              className="btn-secondary-capsule !w-full"
              id="btnUserInfo"
            >
              <User className="w-5 h-5 text-[#1E8A4C] flex-shrink-0" />
              <span>ข้อมูลผู้ใช้</span>
            </button>
          </div>

        </div>

      </div>
    </div>
  );
};
