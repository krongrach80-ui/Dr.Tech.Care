import React, { useEffect, useState } from 'react';
import { ArrowRight, Shield, Sparkles, Info } from 'lucide-react';
import { IS_STATIC_MODE } from '../../config/apiConfig';

interface Screen1HomeProps {
  onStart: () => void;
  onOpenAdmin: () => void;
  onOpenAbout?: () => void;
  onOpenReception?: () => void;
}

export const Screen1Home: React.FC<Screen1HomeProps> = ({
  onStart,
  onOpenAdmin,
  onOpenAbout,
  onOpenReception,
}) => {
  const [thaiDate, setThaiDate] = useState<string>('');
  const [thaiTime, setThaiTime] = useState<string>('');

  useEffect(() => {
    const thaiDayNames = [
      'วันอาทิตย์', 'วันจันทร์', 'วันอังคาร', 'วันพุธ', 'วันพฤหัสบดี', 'วันศุกร์', 'วันเสาร์'
    ];
    const thaiMonthNames = [
      'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
      'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'
    ];

    const updateDateTime = () => {
      const now = new Date();
      const dayName = thaiDayNames[now.getDay()];
      const dateNum = now.getDate();
      const monthName = thaiMonthNames[now.getMonth()];
      const buddhistYear = now.getFullYear() + 543;

      const hours = String(now.getHours()).padStart(2, '0');
      const minutes = String(now.getMinutes()).padStart(2, '0');
      const seconds = String(now.getSeconds()).padStart(2, '0');

      setThaiDate(`${dayName}ที่ ${dateNum} ${monthName} พ.ศ. ${buddhistYear}`);
      setThaiTime(`${hours}:${minutes}:${seconds} น.`);
    };

    updateDateTime();
    const interval = setInterval(updateDateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="w-full flex flex-col items-center justify-center text-center animate-fadeIn relative z-10 py-6 sm:py-10">
      
      {/* Brand Header Section */}
      <div className="flex flex-col items-center max-w-lg w-full mb-6">
        <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-white/85 backdrop-blur-md border border-emerald-200/80 text-[#1E8A4C] text-xs font-semibold shadow-sm mb-4">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          <span>ระบบดูแลและฟื้นฟูสุขภาพอัจฉริยะ</span>
        </div>

        {/* กลางบน: ข้อความ "Dr.Tech.Care" ตัวใหญ่หนา มีเส้นใต้ไล่สีเขียว */}
        <h1 className="font-sans font-extrabold text-[clamp(2.2rem,6vw,3.4rem)] text-[#0B2B2B] tracking-tight leading-none">
          Dr.Tech.Care
        </h1>
        <div className="w-48 sm:w-64 h-1.5 rounded-full bg-gradient-to-r from-[#6FD67F] to-[#1E8A4C] mt-3 shadow-sm" />

        {/* ใต้ชื่อ: วัน/เดือน/ปี/เวลา ปัจจุบันแบบเรียลไทม์ (รูปแบบไทย, ปี พ.ศ.) */}
        <div className="mt-6 w-full max-w-[340px] bg-white/85 backdrop-blur-md border border-emerald-200/70 rounded-2xl p-4 shadow-sm text-center">
          <div className="text-xs sm:text-sm font-semibold text-[#0B2B2B] flex items-center justify-center gap-1.5">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
              <line x1="16" y1="2" x2="16" y2="6"/>
              <line x1="8" y1="2" x2="8" y2="6"/>
              <line x1="3" y1="10" x2="21" y2="10"/>
            </svg>
            <span>{thaiDate || 'กำลังโหลดวันที่...'}</span>
          </div>
          <div className="font-mono text-2xl sm:text-3xl font-extrabold text-[#1E8A4C] tracking-wider mt-1">
            {thaiTime || '00:00:00 น.'}
          </div>
        </div>
      </div>

      {/* Center Posture Heart & Balance Graphic Emblem */}
      <div className="my-2 sm:my-6 hidden min-[400px]:flex items-center justify-center" aria-hidden="true">
        <div className="w-28 h-28 sm:w-36 sm:h-36 rounded-full bg-gradient-to-br from-white to-[#E4FBE8] border-2 border-emerald-300/60 shadow-lg shadow-emerald-700/10 flex items-center justify-center">
          <svg width="68" height="68" viewBox="0 0 24 24" fill="none" stroke="#1E8A4C" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M22 12h-4l-3 9L9 3l-3 9H2"/>
            <circle cx="12" cy="12" r="9" stroke="#6FD67F" strokeWidth="1.3" strokeDasharray="3 3"/>
          </svg>
        </div>
      </div>

      {/* กลางจอ: ทางเข้าคนไข้หลักทางเดียวสำหรับตู้ Kiosk */}
      <div className="w-full max-w-sm mt-4 sm:mt-6 flex flex-col items-center">
        <button
          onClick={onStart}
          className="btn-primary-capsule !w-full shadow-lg hover:shadow-xl"
          id="btnStartApp"
        >
          <span>เริ่มต้นการใช้งานตู้</span>
          <ArrowRight className="w-5 h-5 flex-shrink-0" />
        </button>
      </div>

      {/* มุมซ้ายล่าง: ปุ่มเกี่ยวกับระบบ (จุดเดียว) */}
      {onOpenAbout && (
        <button
          onClick={onOpenAbout}
          className="fixed bottom-5 left-5 sm:bottom-7 sm:left-7 bg-white/90 backdrop-blur-md hover:bg-emerald-50 border-2 border-emerald-300 text-[#1E8A4C] font-sans font-bold text-xs sm:text-sm px-4 py-2 rounded-full shadow-md hover:shadow-lg flex items-center gap-1.5 transition active:scale-95 z-30"
          aria-label="เกี่ยวกับระบบ Dr.Tech.Care"
          id="btnAboutModal"
        >
          <Info className="w-4 h-4" />
          <span>เกี่ยวกับระบบ</span>
        </button>
      )}

      {/* มุมขวาล่าง: ปุ่ม Portal บุคลากร & ผู้บริหารโรงพยาบาล */}
      <button
        onClick={onOpenAdmin}
        className="fixed bottom-5 right-5 sm:bottom-7 sm:right-7 bg-white/95 hover:bg-emerald-50 border-2 border-[#1E8A4C] text-[#1E8A4C] font-sans font-bold text-xs sm:text-sm px-4 py-2 rounded-full shadow-md hover:shadow-lg flex items-center gap-1.5 transition active:scale-95 z-30"
        aria-label="เข้าสู่ระบบบุคลากรและโรงพยาบาล"
        id="btnHospitalPortalHome"
      >
        <Shield className="w-4 h-4 text-emerald-600" />
        <span>ระบบบุคลากร / รพ.</span>
      </button>
    </div>
  );
};
