/**
 * Dr.Tech.Care - 3-Step Interactive Liveness Scan HUD (Vertical Kiosk 9:16)
 * Guides elderly patient through: 1. หน้าตรง -> 2. หันซ้าย -> 3. หันขวา
 * Displays live Euler Yaw degrees, hold progress, lighting warnings, and camera error states
 */

import React from 'react';
import {
  Camera,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  Key,
  Shield,
  Zap,
  Sun,
  Moon,
  Users,
} from 'lucide-react';
import {
  CameraState,
  LivenessChallenge,
  LivenessFrameData,
  LivenessNonce,
} from '../../types/biometrics';

interface LivenessScanHUDProps {
  videoRef: React.RefObject<HTMLVideoElement>;
  cameraState: CameraState;
  frameData: LivenessFrameData | null;
  activeNonce: LivenessNonce | null;
  currentChallenge: LivenessChallenge;
  completedChallenges: Record<LivenessChallenge, boolean>;
  holdProgress: number; // 0 - 100
  holdElapsedMs?: number;
  targetHoldMs?: number;
  isProcessingBiometrics: boolean;
  biometricMatchMessage: string | null;
  onRetryCamera: () => void;
  onFallbackToPin: () => void;
}

export const LivenessScanHUD: React.FC<LivenessScanHUDProps> = ({
  videoRef,
  cameraState,
  frameData,
  activeNonce,
  currentChallenge,
  completedChallenges,
  holdProgress,
  holdElapsedMs = 0,
  targetHoldMs = 1200,
  isProcessingBiometrics,
  biometricMatchMessage,
  onRetryCamera,
  onFallbackToPin,
}) => {
  const qg = frameData?.qualityGate;
  const yaw = Math.round(frameData?.yawDeg || 0);

  return (
    <div className="w-full flex-1 flex flex-col items-center justify-between relative overflow-hidden select-none">
      {/* 1. Header Information & Security Nonce Badge */}
      <div className="w-full bg-[#E3F5FC] border border-[#BDE3F5] rounded-3xl py-2.5 px-4 text-center shadow-sm relative mb-2">
        <div className="flex items-center justify-between mb-1">
          <span className="inline-flex items-center gap-1 text-[11px] font-black text-emerald-800 bg-emerald-200/80 px-2.5 py-0.5 rounded-full">
            <Shield className="w-3.5 h-3.5 text-emerald-700" />
            <span>ระบบสแกนชีวมิติ 3 มิติ (3D Liveness)</span>
          </span>

          {activeNonce && (
            <span
              className="inline-flex items-center gap-1 text-[10px] font-mono font-bold text-slate-700 bg-white/90 px-2 py-0.5 rounded-full border border-slate-300"
              title={`Session Nonce: ${activeNonce.nonce}`}
            >
              <span>🔒 ป้องกันวิดีโอย้อนกลับ</span>
            </span>
          )}
        </div>

        <h2 className="text-lg sm:text-xl font-black text-[#0B2B2B]">
          {isProcessingBiometrics
            ? '🧬 กำลังประมวลผลเวกเตอร์อัตลักษณ์ 128 มิติ...'
            : 'กรุณาปฏิบัติตามคำแนะนำบนหน้าจอ'}
        </h2>

        {/* 3-Step Checklist Pills */}
        <div className="grid grid-cols-3 gap-1.5 sm:gap-2 mt-2">
          {[
            { id: 'front' as LivenessChallenge, label: '1. หน้าตรง' },
            { id: 'turn_left' as LivenessChallenge, label: '2. หันซ้าย' },
            { id: 'turn_right' as LivenessChallenge, label: '3. หันขวา' },
          ].map((item) => {
            const isDone = completedChallenges[item.id];
            const isCurrent = currentChallenge === item.id && !isProcessingBiometrics;

            return (
              <div
                key={item.id}
                className={`py-1.5 px-2 rounded-xl text-xs font-black transition-all flex items-center justify-center gap-1 ${
                  isDone
                    ? 'bg-emerald-600 text-white shadow-sm'
                    : isCurrent
                    ? holdProgress > 0
                      ? 'bg-emerald-500 text-white ring-2 ring-emerald-400 scale-102 shadow-md animate-pulse'
                      : 'bg-amber-400 text-slate-900 ring-2 ring-amber-500 scale-102 shadow-md'
                    : 'bg-white/80 text-slate-500 border border-slate-200'
                }`}
              >
                {isDone ? (
                  <CheckCircle2 className="w-4 h-4 stroke-[3]" />
                ) : (
                  <span>{isCurrent ? (holdProgress > 0 ? '⚡' : '👉') : '⏳'}</span>
                )}
                <span>{item.label}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* 2. Main Camera Viewport with Oval Target & HUD Overlays */}
      <div className="w-full flex-1 min-h-[300px] max-h-[420px] rounded-[32px] overflow-hidden border-2 border-emerald-400 relative bg-slate-950 flex items-center justify-center shadow-2xl my-1">
        {/* Live Video Element */}
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className={`w-full h-full object-cover transform -scale-x-100 transition-opacity duration-300 ${
            cameraState.isActive ? 'opacity-95' : 'opacity-0'
          }`}
        />

        {/* 2.1 Camera Hardware Error State Overlay */}
        {cameraState.errorCode && (
          <div className="absolute inset-0 bg-slate-950/95 flex flex-col items-center justify-center p-6 text-center z-30 animate-fadeIn">
            <div className="w-16 h-16 rounded-full bg-rose-500/20 border-2 border-rose-500 flex items-center justify-center mb-3 text-rose-400">
              <AlertTriangle className="w-8 h-8" />
            </div>

            <h3 className="text-lg font-black text-white mb-2">
              {cameraState.errorCode === 'NOT_FOUND'
                ? 'ไม่พบกล้องเว็บแคม'
                : cameraState.errorCode === 'PERMISSION_DENIED'
                ? 'ยังไม่ได้รับอนุญาตให้ใช้กล้อง'
                : 'ไม่สามารถเปิดกล้องได้'}
            </h3>

            <p className="text-xs sm:text-sm text-slate-300 max-w-sm mb-5 leading-relaxed">
              {cameraState.errorMessageTh || 'กรุณาตรวจสอบการเชื่อมต่ออุปกรณ์กล้องเว็บแคม'}
            </p>

            <div className="flex flex-col sm:flex-row items-center gap-2.5 w-full max-w-xs">
              <button
                onClick={onRetryCamera}
                className="w-full py-3 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-sm flex items-center justify-center gap-2 shadow-md transition cursor-pointer"
              >
                <RotateCcw className="w-4 h-4" />
                <span>ลองเชื่อมต่อกล้องใหม่</span>
              </button>

              <button
                onClick={onFallbackToPin}
                className="w-full py-3 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-600 font-extrabold text-sm flex items-center justify-center gap-2 transition cursor-pointer"
              >
                <Key className="w-4 h-4 text-emerald-400" />
                <span>ใช้รหัส PIN 6 หลัก</span>
              </button>
            </div>
          </div>
        )}

        {/* 2.2 Oval Target Guide (Yellow = Waiting, Green = Condition Met / Holding) */}
        {cameraState.isActive && !isProcessingBiometrics && (
          <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
            {/* Dark vignette backdrop with centered transparent oval cutout */}
            <div
              className={`w-44 h-60 sm:w-52 sm:h-72 rounded-[50%] border-4 transition-all duration-300 flex flex-col items-center justify-between p-3 ${
                holdProgress > 0
                  ? 'border-emerald-400 shadow-[0_0_30px_rgba(34,197,94,0.85)] bg-emerald-500/10 ring-4 ring-emerald-400/40'
                  : 'border-amber-400/90 shadow-[0_0_20px_rgba(251,191,36,0.4)] bg-black/20'
              }`}
            >
              {/* Top Guide Indicator */}
              <div className={`text-[10px] font-black px-2.5 py-0.5 rounded-full backdrop-blur-sm transition-colors ${
                holdProgress > 0 ? 'bg-emerald-600 text-white' : 'bg-black/70 text-amber-300'
              }`}>
                ศีรษะ
              </div>

              {/* Bottom Guide Indicator */}
              <div className={`text-[10px] font-black px-2.5 py-0.5 rounded-full backdrop-blur-sm transition-colors ${
                holdProgress > 0 ? 'bg-emerald-600 text-white' : 'bg-black/70 text-amber-300'
              }`}>
                คาง
              </div>
            </div>
          </div>
        )}

        {/* 2.3 Live Euler Yaw Angle Meter */}
        {cameraState.isActive && !isProcessingBiometrics && (
          <div className="absolute top-3 left-3 z-20 bg-black/75 backdrop-blur-md px-3 py-1.5 rounded-xl border border-white/20 text-white flex items-center gap-2">
            <span className="text-[11px] font-bold text-slate-300">มุมศีรษะ (Yaw):</span>
            <span
              className={`font-mono font-black text-xs px-2 py-0.5 rounded ${
                Math.abs(yaw) <= 10.5
                  ? 'bg-emerald-500/30 text-emerald-300'
                  : 'bg-amber-500/30 text-amber-300'
              }`}
            >
              {yaw < -5 ? `${yaw}° (ซ้าย)` : yaw > 5 ? `+${yaw}° (ขวา)` : `${yaw}° (หน้าตรง)`}
            </span>
          </div>
        )}

        {/* 2.3.1 Dev Debug Overlay (Active in dev or demo mode) */}
        {import.meta.env.DEV && (
          <div className="absolute top-12 left-3 z-20 bg-black/85 backdrop-blur-md px-3 py-2 rounded-xl border border-cyan-400/60 text-white font-mono text-[11px] shadow-xl pointer-events-none space-y-1">
            <div className="text-cyan-300 font-extrabold flex items-center gap-1.5 border-b border-cyan-400/30 pb-0.5">
              <span className="w-2 h-2 rounded-full bg-cyan-400 animate-ping inline-block" />
              <span>[DEV DEBUG] Liveness</span>
            </div>
            <div className="flex justify-between gap-3">
              <span className="text-slate-300">Yaw:</span>
              <span className={`font-bold ${yaw < -14 ? 'text-cyan-300' : yaw > 14 ? 'text-amber-300' : 'text-emerald-300'}`}>
                {yaw > 0 ? `+${yaw}` : yaw}° {yaw < -14 ? '(ซ้าย)' : yaw > 14 ? '(ขวา)' : '(ตรง)'}
              </span>
            </div>
            <div className="flex justify-between gap-3">
              <span className="text-slate-300">ขั้น:</span>
              <span className="text-yellow-300 font-bold">
                {currentChallenge === 'front' ? '1.หน้าตรง' : currentChallenge === 'turn_left' ? '2.หันซ้าย' : '3.หันขวา'}
              </span>
            </div>
            <div className="flex justify-between gap-3">
              <span className="text-slate-300">เวลาค้าง:</span>
              <span className={`font-bold ${holdProgress > 0 ? 'text-emerald-300' : 'text-slate-400'}`}>
                {((holdElapsedMs || 0) / 1000).toFixed(1)}s / {((targetHoldMs || 1200) / 1000).toFixed(1)}s ({holdProgress}%)
              </span>
            </div>
          </div>
        )}

        {/* 2.4 Lighting & Quality Warning Pill */}
        {cameraState.isActive && qg && !qg.passed && !isProcessingBiometrics && (
          <div className="absolute top-3 right-3 z-20 bg-amber-950/85 text-amber-300 backdrop-blur-md px-3 py-1 rounded-xl border border-amber-500/40 text-xs font-bold flex items-center gap-1.5 animate-bounce">
            {qg.isTooDark ? (
              <Moon className="w-3.5 h-3.5 text-amber-400" />
            ) : qg.faceCount > 1 ? (
              <Users className="w-3.5 h-3.5 text-rose-400" />
            ) : (
              <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
            )}
            <span>{qg.errorMessageTh || 'จัดใบหน้าให้อยู่ในกรอบ'}</span>
          </div>
        )}

        {/* 2.5 Hold Progress Bar (For current challenge hold) */}
        {cameraState.isActive && !isProcessingBiometrics && holdProgress > 0 && (
          <div className="absolute bottom-12 inset-x-6 z-20 bg-black/85 backdrop-blur-md rounded-2xl p-2.5 border border-emerald-400 flex flex-col items-center animate-fadeIn">
            <div className="flex items-center justify-between w-full text-xs font-black text-white mb-1">
              <span className="flex items-center gap-1.5 text-yellow-300">
                <Zap className="w-3.5 h-3.5 fill-yellow-400 animate-bounce" />
                <span>กำลังบันทึกท่า (ค้างไว้จนครบ 100%)...</span>
              </span>
              <span className="font-mono text-yellow-300 text-sm">{holdProgress}%</span>
            </div>
            <div className="w-full h-2.5 bg-slate-700 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-emerald-400 to-yellow-400 rounded-full transition-all duration-75"
                style={{ width: `${holdProgress}%` }}
              />
            </div>
          </div>
        )}

        {/* 2.6 Biometric Processing HUD */}
        {isProcessingBiometrics && (
          <div className="absolute inset-0 z-30 bg-black/85 backdrop-blur-md flex flex-col items-center justify-center p-6 text-center animate-fadeIn">
            <div className="w-20 h-20 rounded-full border-4 border-emerald-400 border-t-transparent animate-spin flex items-center justify-center mb-4">
              <Shield className="w-8 h-8 text-emerald-400" />
            </div>

            <h3 className="text-xl font-black text-white mb-2">
              ตรวจสอบอัตลักษณ์ชีวมิติ 128 มิติ
            </h3>
            <p className="text-xs sm:text-sm text-emerald-300 max-w-sm mb-2">
              {biometricMatchMessage || 'กำลังเปรียบเทียบ Cosine Similarity กับฐานข้อมูลคนไข้...'}
            </p>
            <div className="text-[11px] text-slate-400 font-mono">
              🛡️ Zero Raw Image Policy: PDPA Safe
            </div>
          </div>
        )}

        {/* Bottom Instruction Bar */}
        <div className="absolute bottom-2 inset-x-2 bg-black/75 backdrop-blur-md rounded-xl py-1 px-3 text-center text-white text-[11px] font-bold z-10">
          {currentChallenge === 'front' && '👀 1. มองตรงเข้าหากล้อง ค้างไว้ 1.2 วินาที'}
          {currentChallenge === 'turn_left' && '👈 2. ค่อยๆ หันศีรษะไปทางซ้าย (Yaw < -14°) ค้างไว้ 1.2 วินาที'}
          {currentChallenge === 'turn_right' && '👉 3. ค่อยๆ หันศีรษะไปทางขวา (Yaw > +14°) ค้างไว้ 1.2 วินาที'}
        </div>
      </div>

      {/* 3. Bottom Quick Actions for Elderly */}
      <div className="w-full flex items-center gap-2 mt-1">
        <button
          onClick={onFallbackToPin}
          className="w-full min-h-[50px] sm:min-h-[58px] py-2.5 px-4 rounded-2xl bg-white hover:bg-slate-50 border-2 border-slate-300 text-slate-700 font-black text-sm sm:text-base shadow-sm transition flex items-center justify-center gap-2 cursor-pointer active:scale-95"
          id="btnFallbackPinFromHUD"
        >
          <Key className="w-5 h-5 text-emerald-600" />
          <span>หรือ สลับไปเข้าสู่ระบบด้วยรหัส PIN 6 หลัก</span>
        </button>
      </div>
    </div>
  );
};
