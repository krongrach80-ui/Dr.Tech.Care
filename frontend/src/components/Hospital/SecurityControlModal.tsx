import React, { useState } from 'react';
import {
  X,
  ShieldAlert,
  ShieldCheck,
  Ban,
  LogOut,
  Clock,
  Laptop,
  Globe,
  User,
  AlertTriangle,
  CheckCircle2,
  Lock,
} from 'lucide-react';
import { ActivityLog } from '../../types/hospital';
import { useHospitalStore } from '../../store/hospitalStore';
import { defaultDash, formatThaiDateTime } from '../../utils/dashboardUtils';

interface SecurityControlModalProps {
  isOpen: boolean;
  onClose: () => void;
  targetIp?: string | null;
  targetDevice?: string | null;
  targetUserCode?: string | null;
  onSuccessToast: (msg: string) => void;
}

export const SecurityControlModal: React.FC<SecurityControlModalProps> = ({
  isOpen,
  onClose,
  targetIp,
  targetDevice,
  targetUserCode,
  onSuccessToast,
}) => {
  const {
    activityLogs,
    bannedIps,
    bannedDevices,
    banIp,
    unbanIp,
    banDevice,
    unbanDevice,
    kickSession,
    addActivityLog,
  } = useHospitalStore();

  const ip = targetIp || '192.168.1.104';
  const device = targetDevice || 'Kiosk Terminal #1 (Ubuntu Linux)';

  const isIpBanned = bannedIps.includes(ip);
  const isDeviceBanned = bannedDevices.includes(device);

  // Filter logs related to this IP or Device
  const relatedLogs = activityLogs.filter(
    (log) =>
      (log.ipAddress && log.ipAddress === ip) ||
      (log.device && log.device === device) ||
      (targetUserCode && log.details && log.details.includes(targetUserCode))
  );

  const handleToggleBanIp = () => {
    if (isIpBanned) {
      unbanIp(ip);
      addActivityLog('ปลดแบน IP (Unban IP)', 'SYSTEM', `ปลดระงับการเข้าถึงสำหรับ IP: ${ip}`);
      onSuccessToast(`ปลดการระงับ IP: ${ip} เรียบร้อยแล้ว`);
    } else {
      banIp(ip);
      addActivityLog('ระงับ IP (Ban IP)', 'SYSTEM', `ระงับการเข้าถึงสำหรับ IP ต้องสงสัย: ${ip}`);
      onSuccessToast(`ระงับการเข้าถึง (Ban IP) สำหรับ ${ip} สำเร็จ`);
    }
  };

  const handleToggleBanDevice = () => {
    if (isDeviceBanned) {
      unbanDevice(device);
      addActivityLog('ปลดแบนอุปกรณ์ (Unban Device)', 'SYSTEM', `ปลดระงับอุปกรณ์: ${device}`);
      onSuccessToast(`ปลดการระงับอุปกรณ์: ${device} เรียบร้อยแล้ว`);
    } else {
      banDevice(device);
      addActivityLog('ระงับอุปกรณ์ (Ban Device)', 'SYSTEM', `ระงับอุปกรณ์ต้องสงสัย: ${device}`);
      onSuccessToast(`ระงับอุปกรณ์ ${device} สำเร็จ`);
    }
  };

  const handleForceLogout = () => {
    kickSession(device);
    addActivityLog('บังคับออกจากระบบ (Force Logout)', 'AUTH', `สั่งยุติเซสชันสำหรับอุปกรณ์: ${device} (IP: ${ip})`);
    onSuccessToast(`บังคับตัดการเชื่อมต่อ (Force Logout) สำหรับอุปกรณ์ ${device} เรียบร้อยแล้ว`);
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-[#0F2F2B]/75 backdrop-blur-sm animate-fadeIn"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl bg-white rounded-3xl shadow-2xl border border-emerald-200 overflow-hidden flex flex-col max-h-[90vh] animate-slideUp"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-cyan-100 bg-gradient-to-r from-emerald-50 via-white to-sky-50 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-rose-500 via-amber-500 to-indigo-600 text-white flex items-center justify-center shadow-md shadow-rose-500/20">
              <ShieldAlert className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-extrabold text-base sm:text-lg text-[#0F2F2B]">
                ระบบควบคุมความปลอดภัย (Security Control)
              </h3>
              <p className="text-[11px] text-slate-500 font-medium">
                ตรวจสอบประวัติและควบคุมสิทธิ์การเข้าถึงอุปกรณ์ / IP Address
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

        {/* Device & IP Overview Card */}
        <div className="p-6 space-y-5 flex-1 overflow-y-auto text-xs">
          <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="flex items-start gap-3">
              <Globe className="w-5 h-5 text-indigo-600 mt-0.5 flex-shrink-0" />
              <div>
                <div className="text-slate-500 text-[11px] font-bold">IP Address:</div>
                <div className="font-mono font-black text-sm text-[#0F2F2B]">{ip}</div>
                <div className="mt-1 flex items-center gap-1.5">
                  <span
                    className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold border ${
                      isIpBanned
                        ? 'bg-rose-100 text-rose-800 border-rose-300'
                        : 'bg-emerald-100 text-emerald-800 border-emerald-300'
                    }`}
                  >
                    {isIpBanned ? '🔴 ระงับการใช้งาน (Banned)' : '🟢 ปกติ (Allowed)'}
                  </span>
                </div>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <Laptop className="w-5 h-5 text-teal-600 mt-0.5 flex-shrink-0" />
              <div>
                <div className="text-slate-500 text-[11px] font-bold">Device / Terminal:</div>
                <div className="font-bold text-xs text-[#0F2F2B] truncate max-w-[200px]" title={device}>
                  {device}
                </div>
                <div className="mt-1 flex items-center gap-1.5">
                  <span
                    className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold border ${
                      isDeviceBanned
                        ? 'bg-rose-100 text-rose-800 border-rose-300'
                        : 'bg-emerald-100 text-emerald-800 border-emerald-300'
                    }`}
                  >
                    {isDeviceBanned ? '🔴 ระงับเครื่องนี้ (Banned)' : '🟢 ปกติ (Active)'}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Quick Action Buttons */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            <button
              type="button"
              onClick={handleForceLogout}
              className="py-2.5 px-3 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-300 font-bold text-xs flex items-center justify-center gap-1.5 transition active:scale-95 cursor-pointer shadow-2xs"
            >
              <LogOut className="w-4 h-4 text-amber-600" />
              <span>บังคับออกจากระบบ (Force Logout)</span>
            </button>

            <button
              type="button"
              onClick={handleToggleBanIp}
              className={`py-2.5 px-3 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 transition active:scale-95 cursor-pointer shadow-2xs ${
                isIpBanned
                  ? 'bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300'
                  : 'bg-rose-50 hover:bg-rose-100 text-rose-800 border border-rose-300'
              }`}
            >
              <Ban className="w-4 h-4" />
              <span>{isIpBanned ? 'ปลดแบน IP (Unban IP)' : 'ระงับ IP (Ban IP)'}</span>
            </button>

            <button
              type="button"
              onClick={handleToggleBanDevice}
              className={`py-2.5 px-3 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 transition active:scale-95 cursor-pointer shadow-2xs ${
                isDeviceBanned
                  ? 'bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300'
                  : 'bg-rose-50 hover:bg-rose-100 text-rose-800 border border-rose-300'
              }`}
            >
              <Lock className="w-4 h-4" />
              <span>{isDeviceBanned ? 'ปลดแบนอุปกรณ์' : 'ระงับอุปกรณ์ (Ban Device)'}</span>
            </button>
          </div>

          {/* Activity Log History for this Target */}
          <div className="space-y-2">
            <div className="flex items-center justify-between font-bold text-slate-700 text-xs">
              <span className="flex items-center gap-1.5">
                <Clock className="w-4 h-4 text-slate-500" />
                <span>ประวัติกิจกรรมล่าสุดของ IP / อุปกรณ์นี้ ({relatedLogs.length} รายการ):</span>
              </span>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-2xs max-h-56 overflow-y-auto">
              {relatedLogs.length === 0 ? (
                <div className="p-6 text-center text-slate-400">
                  ไม่มีประวัติกิจกรรมต้องสงสัยสำหรับเป้าหมายนี้
                </div>
              ) : (
                <table className="w-full text-left text-[11px] border-collapse">
                  <thead>
                    <tr className="bg-slate-100 text-slate-600 font-bold border-b border-slate-200">
                      <th className="py-2 px-3">เวลา</th>
                      <th className="py-2 px-3">การกระทำ (Action)</th>
                      <th className="py-2 px-3">ผู้ใช้งาน</th>
                      <th className="py-2 px-3">สถานะ</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-medium">
                    {relatedLogs.map((log) => (
                      <tr key={log.id} className="hover:bg-slate-50">
                        <td className="py-2 px-3 text-slate-500 font-mono whitespace-nowrap">
                          {formatThaiDateTime(log.timestamp)}
                        </td>
                        <td className="py-2 px-3 font-semibold text-[#0F2F2B] max-w-[200px] truncate" title={log.details}>
                          {log.action}
                        </td>
                        <td className="py-2 px-3 text-slate-600 truncate max-w-[120px]">
                          {log.userName}
                        </td>
                        <td className="py-2 px-3 whitespace-nowrap">
                          <span
                            className={`px-2 py-0.5 rounded-full text-[9px] font-extrabold ${
                              log.securityStatus === 'suspicious'
                                ? 'bg-rose-100 text-rose-800'
                                : log.securityStatus === 'warning'
                                ? 'bg-amber-100 text-amber-800'
                                : 'bg-emerald-100 text-emerald-800'
                            }`}
                          >
                            {log.securityStatus === 'suspicious'
                              ? '🔴 Suspicious'
                              : log.securityStatus === 'warning'
                              ? '🟡 Warning'
                              : '🟢 Normal'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-slate-100 bg-slate-50 flex items-center justify-end">
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
