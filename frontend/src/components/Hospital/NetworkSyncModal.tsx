import React, { useState, useEffect } from 'react';
import {
  X,
  Server,
  Wifi,
  Radio,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Copy,
  Check,
  Globe,
  Database,
  ArrowRight,
  ShieldCheck,
  HelpCircle,
} from 'lucide-react';
import {
  resolveDefaultApiUrl,
  getCustomApiBaseUrl,
  setCustomApiBaseUrl,
  testBackendConnection,
} from '../../config/apiConfig';
import { patientSyncService } from '../../services/patientSyncService';
import { useHospitalStore } from '../../store/hospitalStore';

interface NetworkSyncModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccessToast?: (msg: string) => void;
}

export const NetworkSyncModal: React.FC<NetworkSyncModalProps> = ({
  isOpen,
  onClose,
  onSuccessToast,
}) => {
  const { fetchPatientsFromCentralApi, users } = useHospitalStore();
  const [currentUrl, setCurrentUrl] = useState<string>('');
  const [inputUrl, setInputUrl] = useState<string>('');
  const [isTesting, setIsTesting] = useState<boolean>(false);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [testResult, setTestResult] = useState<{
    ok: boolean;
    info?: any;
    error?: string;
    latencyMs?: number;
  } | null>(null);
  const [copiedText, setCopiedText] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      const active = resolveDefaultApiUrl();
      setCurrentUrl(active);
      setInputUrl(getCustomApiBaseUrl() || active);
      handleTestConnection(active);
    }
  }, [isOpen]);

  const handleTestConnection = async (targetUrl?: string) => {
    setIsTesting(true);
    setTestResult(null);
    const start = performance.now();
    try {
      const urlToTest = targetUrl || inputUrl.trim();
      const res = await testBackendConnection(urlToTest);
      const latencyMs = Math.round(performance.now() - start);
      setTestResult({ ...res, latencyMs });
    } finally {
      setIsTesting(false);
    }
  };

  const handleSaveCustomUrl = async () => {
    const clean = inputUrl.trim();
    if (!clean) {
      setCustomApiBaseUrl(null);
      setCurrentUrl(resolveDefaultApiUrl());
      patientSyncService.reconnectSse();
      if (onSuccessToast) onSuccessToast('รีเซ็ตเป็น URL เซิร์ฟเวอร์เริ่มต้นอัตโนมัติแล้ว');
      return;
    }

    setCustomApiBaseUrl(clean);
    setCurrentUrl(clean);
    patientSyncService.reconnectSse();
    await handleTestConnection(clean);
    await fetchPatientsFromCentralApi();
    if (onSuccessToast) onSuccessToast(`บันทึก URL เซิร์ฟเวอร์กลาง: ${clean}`);
  };

  const handleResetToAuto = async () => {
    setCustomApiBaseUrl(null);
    const autoUrl = resolveDefaultApiUrl();
    setCurrentUrl(autoUrl);
    setInputUrl(autoUrl);
    patientSyncService.reconnectSse();
    await handleTestConnection(autoUrl);
    await fetchPatientsFromCentralApi();
    if (onSuccessToast) onSuccessToast('รีเซ็ตเป็นค่าตรวจจับอัตโนมัติ (Auto-Detect LAN IP) เรียบร้อยแล้ว');
  };

  const handleManualSyncNow = async () => {
    setIsSyncing(true);
    try {
      await fetchPatientsFromCentralApi();
      if (onSuccessToast) onSuccessToast('ดึงข้อมูลคนไข้ล่าสุดจากฐานข้อมูลกลางสำเร็จ');
    } finally {
      setIsSyncing(false);
    }
  };

  const copyToClipboard = (text: string, label: string) => {
    if (navigator?.clipboard) {
      navigator.clipboard.writeText(text);
      setCopiedText(label);
      setTimeout(() => setCopiedText(null), 2000);
    }
  };

  if (!isOpen) return null;

  const syncStatus = patientSyncService.getStatus();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-sm animate-fadeIn">
      <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-xl max-h-[92vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-5 py-4 bg-gradient-to-r from-emerald-600 via-teal-600 to-cyan-700 text-white flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-white/20 backdrop-blur-md flex items-center justify-center text-white">
              <Server className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-black leading-tight">
                ตั้งค่าเซิร์ฟเวอร์กลางและการเชื่อมต่อหลายเครื่อง
              </h2>
              <p className="text-xs text-emerald-100 font-medium">
                Multi-Device Real-Time Sync & Shared Database Architecture
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-full hover:bg-white/20 text-white transition cursor-pointer"
            title="ปิดหน้าต่าง"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-5 overflow-y-auto space-y-4 text-xs">
          {/* Connection Status Card */}
          <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-3">
            <div className="flex items-center justify-between">
              <span className="font-bold text-slate-700 flex items-center gap-1.5">
                <Wifi className="w-4 h-4 text-emerald-600" />
                สถานะการเชื่อมต่อฐานข้อมูลกลาง (Single Source of Truth):
              </span>
              <span
                className={`px-2.5 py-1 rounded-full text-[11px] font-black flex items-center gap-1 ${
                  testResult?.ok
                    ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                    : 'bg-rose-100 text-rose-800 border border-rose-300'
                }`}
              >
                {testResult?.ok ? (
                  <>
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
                    เชื่อมต่อออนไลน์
                  </>
                ) : (
                  <>
                    <AlertTriangle className="w-3.5 h-3.5 text-rose-600" />
                    ไม่สามารถเชื่อมต่อได้
                  </>
                )}
              </span>
            </div>

            {/* SSE Stream Status */}
            <div className="grid grid-cols-2 gap-2 text-[11px]">
              <div className="p-2.5 rounded-xl bg-white border border-slate-200">
                <div className="text-slate-500">ช่องทางซิงค์เรียลไทม์ (SSE):</div>
                <div className="font-bold text-slate-800 flex items-center gap-1.5 mt-0.5">
                  <Radio className={`w-3.5 h-3.5 ${syncStatus.isSseConnected ? 'text-emerald-600' : 'text-amber-500'}`} />
                  {syncStatus.isSseConnected ? '⚡ เปิดทำงาน (Cross-Device Push)' : 'กำลังเชื่อมต่อ / รองรับ Polling'}
                </div>
              </div>

              <div className="p-2.5 rounded-xl bg-white border border-slate-200">
                <div className="text-slate-500">จำนวนคนไข้ในระบบ:</div>
                <div className="font-bold text-slate-800 flex items-center gap-1.5 mt-0.5">
                  <Database className="w-3.5 h-3.5 text-teal-600" />
                  {testResult?.info?.total_patients ?? users.filter((u) => u.role === 'patient').length} คน
                  {testResult?.latencyMs ? ` (${testResult.latencyMs} ms)` : ''}
                </div>
              </div>
            </div>

            {/* Detected Server IPs */}
            {testResult?.info?.local_ips && testResult.info.local_ips.length > 0 && (
              <div className="p-2.5 rounded-xl bg-emerald-50/60 border border-emerald-200 text-emerald-950">
                <div className="font-bold flex items-center gap-1 text-[11px]">
                  <Globe className="w-3.5 h-3.5 text-emerald-700" />
                  IP ของเครื่องโฮสต์เซิร์ฟเวอร์บนวง LAN เดียวกัน:
                </div>
                <div className="flex flex-wrap gap-1.5 mt-1">
                  {testResult.info.local_ips.map((ip: string) => (
                    <button
                      key={ip}
                      onClick={() => {
                        const target = `http://${ip}:5000/api`;
                        setInputUrl(target);
                        copyToClipboard(target, ip);
                      }}
                      className="px-2 py-0.5 rounded-md bg-white border border-emerald-300 font-mono text-[11px] font-bold text-emerald-800 hover:bg-emerald-100 flex items-center gap-1 cursor-pointer transition"
                      title="คลิกเพื่อนำ IP นี้ไปใช้เป็น URL และคัดลอก"
                    >
                      <span>http://{ip}:5000/api</span>
                      {copiedText === ip ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3 text-slate-400" />}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* URL Input Form */}
          <div className="space-y-2">
            <label className="font-bold text-slate-700 block">
              กำหนด Central API Base URL สำหรับให้อุปกรณ์อื่น (ตู้ Kiosk / เครื่องหมอ) เชื่อมต่อ:
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={inputUrl}
                onChange={(e) => setInputUrl(e.target.value)}
                placeholder="http://192.168.x.x:5000/api"
                className="flex-1 px-3.5 py-2.5 rounded-xl border border-slate-300 font-mono text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
              <button
                type="button"
                onClick={() => handleTestConnection()}
                disabled={isTesting}
                className="px-3.5 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold border border-slate-300 flex items-center gap-1.5 cursor-pointer disabled:opacity-50 transition"
                title="ทดสอบ Ping เซิร์ฟเวอร์"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isTesting ? 'animate-spin' : ''}`} />
                <span>ทดสอบ</span>
              </button>
            </div>
            <p className="text-[11px] text-slate-500 leading-relaxed">
              * หากปล่อยว่างหรือใช้ค่าเริ่มต้น ระบบจะตรวจจับ IP เครื่องโฮสต์โดยอัตโนมัติ (Auto-Detect LAN)
            </p>
          </div>

          {/* Multi-Device Setup Guide */}
          <div className="p-3.5 rounded-2xl bg-gradient-to-br from-cyan-50/60 to-blue-50/40 border border-cyan-200 text-cyan-950 space-y-2">
            <div className="font-bold flex items-center gap-1.5 text-xs text-cyan-900">
              <HelpCircle className="w-4 h-4 text-cyan-700" />
              วิธีใช้งานพร้อมกันระหว่างตู้ Kiosk และเครื่องแพทย์ (Multi-Device Deployment):
            </div>
            <ol className="list-decimal list-inside space-y-1 text-[11px] text-slate-700 leading-relaxed pl-1">
              <li>
                <strong>เครื่องหลัก (Host PC):</strong> เปิดรันเซิร์ฟเวอร์ด้วย{' '}
                <code className="bg-white px-1.5 py-0.5 rounded border border-cyan-300 font-mono text-[10px] text-cyan-900">
                  run_strongcare.bat
                </code>
              </li>
              <li>
                <strong>ตู้ Kiosk / แท็บเล็ต:</strong> เชื่อมต่อ Wi-Fi วงเดียวกัน แล้วเปิดบราวเซอร์ไปที่{' '}
                <code className="bg-white px-1.5 py-0.5 rounded border border-cyan-300 font-mono text-[10px] text-cyan-900">
                  http://{testResult?.info?.local_ips?.[0] || '192.168.x.x'}:3000
                </code>
              </li>
              <li>
                <strong>เครื่องแพทย์ (Doctor Workstation):</strong> เปิดบราวเซอร์ไปที่ IP เดียวกัน คนไข้ใหม่ที่ลงทะเบียนสแกนหน้าจะเด้งขึ้นหน้าจอหมอทันทีแบบเรียลไทม์!
              </li>
            </ol>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="px-5 py-3.5 bg-slate-50 border-t border-slate-200 flex items-center justify-between gap-2 flex-wrap flex-shrink-0">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleResetToAuto}
              className="px-3 py-2 rounded-xl bg-white hover:bg-slate-100 text-slate-700 font-bold border border-slate-300 text-xs cursor-pointer transition"
            >
              รีเซ็ตเป็นอัตโนมัติ
            </button>
            <button
              type="button"
              onClick={handleManualSyncNow}
              disabled={isSyncing}
              className="px-3 py-2 rounded-xl bg-teal-50 hover:bg-teal-100 text-teal-800 font-bold border border-teal-200 text-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-50 transition"
            >
              <RefreshCw className={`w-3 h-3 ${isSyncing ? 'animate-spin' : ''}`} />
              <span>ซิงค์ข้อมูลเดี๋ยวนี้</span>
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold text-xs cursor-pointer transition"
            >
              ปิด
            </button>
            <button
              type="button"
              onClick={handleSaveCustomUrl}
              className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center gap-1.5 cursor-pointer shadow-sm transition"
            >
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>บันทึกและเชื่อมต่อ</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
