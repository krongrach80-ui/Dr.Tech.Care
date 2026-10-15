import React, { useState, useEffect } from 'react';
import { X, Camera, RotateCw, FlipHorizontal, Monitor, CheckCircle } from 'lucide-react';

interface KioskSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  isMirrored: boolean;
  rotationDegrees: number;
  onUpdateCameraSettings: (mirrored: boolean, rotation: number) => void;
}

/**
 * Staff-Only Kiosk Settings Modal (v2.1)
 * Accessible exclusively behind staff login.
 * Manages device-specific hardware adjustments (camera mirror/rotation)
 * without exposing controls to patients.
 */
export const KioskSettingsModal: React.FC<KioskSettingsModalProps> = ({
  isOpen,
  onClose,
  isMirrored,
  rotationDegrees,
  onUpdateCameraSettings,
}) => {
  const [localMirrored, setLocalMirrored] = useState<boolean>(isMirrored);
  const [localRotation, setLocalRotation] = useState<number>(rotationDegrees);
  const [savedSuccess, setSavedSuccess] = useState<boolean>(false);

  useEffect(() => {
    setLocalMirrored(isMirrored);
    setLocalRotation(rotationDegrees);
  }, [isMirrored, rotationDegrees]);

  if (!isOpen) return null;

  const handleRotate = () => {
    const nextRotation = (localRotation + 90) % 360;
    setLocalRotation(nextRotation);
    onUpdateCameraSettings(localMirrored, nextRotation);
    showSavedNotification();
  };

  const handleToggleMirror = () => {
    const nextMirror = !localMirrored;
    setLocalMirrored(nextMirror);
    onUpdateCameraSettings(nextMirror, localRotation);
    showSavedNotification();
  };

  const showSavedNotification = () => {
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-slate-700 rounded-3xl p-6 sm:p-8 max-w-md w-full shadow-2xl text-white space-y-6 animate-in zoom-in-95">
        <div className="flex items-center justify-between border-b border-slate-800 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-slate-800 flex items-center justify-center text-emerald-400">
              <Camera className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-white">ตั้งค่าฮาร์ดแวร์ตู้คีออส</h3>
              <p className="text-xs text-slate-400 font-mono">Staff-Only Kiosk Hardware Configuration</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-slate-800 hover:bg-slate-700 flex items-center justify-center text-slate-400 hover:text-white"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-4">
          {/* Camera Mirroring Toggle */}
          <div className="bg-slate-950/70 p-4 rounded-2xl border border-slate-800 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <FlipHorizontal className="w-5 h-5 text-teal-400" />
              <div>
                <h4 className="text-sm font-semibold text-white">กลับด้านกล้อง (Mirror)</h4>
                <p className="text-xs text-slate-400">สลับภาพซ้าย-ขวาเสมือนส่องกระจก</p>
              </div>
            </div>
            <button
              onClick={handleToggleMirror}
              className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all ${
                localMirrored
                  ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/30'
                  : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
              }`}
            >
              {localMirrored ? 'เปิดอยู่ (ON)' : 'ปิด (OFF)'}
            </button>
          </div>

          {/* Camera Rotation */}
          <div className="bg-slate-950/70 p-4 rounded-2xl border border-slate-800 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <RotateCw className="w-5 h-5 text-cyan-400" />
              <div>
                <h4 className="text-sm font-semibold text-white">หมุนภาพกล้อง (Rotate)</h4>
                <p className="text-xs text-slate-400">มุมปัจจุบัน: {localRotation}°</p>
              </div>
            </div>
            <button
              onClick={handleRotate}
              className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-white flex items-center gap-1.5 transition-colors"
            >
              <RotateCw className="w-3.5 h-3.5 text-cyan-400" />
              หมุน +90°
            </button>
          </div>

          {/* Device Profile Info */}
          <div className="bg-slate-950/40 p-4 rounded-2xl border border-slate-850 text-xs text-slate-400 space-y-1">
            <div className="flex items-center gap-2 text-slate-300 font-medium mb-1">
              <Monitor className="w-4 h-4 text-emerald-400" />
              <span>ข้อมูลอุปกรณ์นี้ (Device Profile):</span>
            </div>
            <p>ความละเอียดหน้าจอ: {window.innerWidth} × {window.innerHeight} px</p>
            <p>การจัดเก็บการตั้งค่า: LocalStorage (Persisted per device)</p>
          </div>

          {savedSuccess && (
            <div className="flex items-center justify-center gap-2 p-2 rounded-xl bg-emerald-950/80 border border-emerald-600 text-emerald-300 text-xs font-medium animate-in fade-in">
              <CheckCircle className="w-4 h-4" />
              <span>บันทึกการตั้งค่าลงบนอุปกรณ์นี้เรียบร้อยแล้ว</span>
            </div>
          )}
        </div>

        <div className="pt-2">
          <button
            onClick={onClose}
            className="w-full py-3 rounded-2xl bg-slate-800 hover:bg-slate-700 text-white font-semibold text-sm transition-all"
          >
            ปิดหน้าต่างการตั้งค่า
          </button>
        </div>
      </div>
    </div>
  );
};
