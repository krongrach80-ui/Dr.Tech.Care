import React, { useRef, useEffect } from 'react';
import { Camera, CameraOff, RefreshCw, AlertCircle, ShieldAlert, CheckCircle2 } from 'lucide-react';
import { PoseLandmarks } from '../../types/pose';
import { cameraOrientationService } from '../../services/cameraOrientationService';

interface MiniGameCameraViewProps {
  videoRef: React.RefObject<HTMLVideoElement>;
  isCameraReady: boolean;
  isCameraLoading: boolean;
  cameraError: string | null;
  landmarks: PoseLandmarks | null;
  isLeftRaised: boolean;
  isRightRaised: boolean;
  bothRaised: boolean;
  isHandsInFrame: boolean;
  holdSide: 'yes' | 'no' | null;
  holdProgress: number; // 0 to 1
  onToggleCamera: () => void;
  onSwitchCamera?: () => void;
}

export const MiniGameCameraView: React.FC<MiniGameCameraViewProps> = ({
  videoRef,
  isCameraReady,
  isCameraLoading,
  cameraError,
  landmarks,
  isLeftRaised,
  isRightRaised,
  bothRaised,
  isHandsInFrame,
  holdSide,
  holdProgress,
  onToggleCamera,
  onSwitchCamera,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Render skeletal pose on canvas with mirror projection
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !isCameraReady) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const parent = canvas.parentElement;
    const w = parent?.clientWidth || 400;
    const h = parent?.clientHeight || 300;
    canvas.width = w;
    canvas.height = h;

    ctx.clearRect(0, 0, w, h);

    if (landmarks && landmarks.length > 0) {
      // Helper to convert normalized coordinate to mirrored screen coordinate
      // Video is mirrored horizontally via CSS (scaleX(-1)), so canvas must match
      const getPt = (idx: number) => {
        const lm = landmarks[idx];
        if (!lm || (lm.visibility !== undefined && lm.visibility < 0.45)) return null;
        return {
          x: (1 - lm.x) * w, // Mirrored X
          y: lm.y * h,
        };
      };

      const drawBone = (idx1: number, idx2: number, color: string = 'rgba(255, 255, 255, 0.85)', lineWidth: number = 4) => {
        const p1 = getPt(idx1);
        const p2 = getPt(idx2);
        if (p1 && p2) {
          ctx.beginPath();
          ctx.moveTo(p1.x, p1.y);
          ctx.lineTo(p2.x, p2.y);
          ctx.strokeStyle = color;
          ctx.lineWidth = lineWidth;
          ctx.lineCap = 'round';
          ctx.stroke();
        }
      };

      // Draw Torso & Arms
      drawBone(11, 12, 'rgba(110, 214, 127, 0.9)', 5); // Shoulders
      drawBone(11, 13, isLeftRaised ? '#EF4444' : 'rgba(255, 255, 255, 0.8)', isLeftRaised ? 6 : 4); // Left Upper Arm (ไม่)
      drawBone(13, 15, isLeftRaised ? '#EF4444' : 'rgba(255, 255, 255, 0.8)', isLeftRaised ? 6 : 4); // Left Forearm (ไม่)
      drawBone(12, 14, isRightRaised ? '#10B981' : 'rgba(255, 255, 255, 0.8)', isRightRaised ? 6 : 4); // Right Upper Arm (ใช่)
      drawBone(14, 16, isRightRaised ? '#10B981' : 'rgba(255, 255, 255, 0.8)', isRightRaised ? 6 : 4); // Right Forearm (ใช่)

      drawBone(11, 23, 'rgba(110, 214, 127, 0.5)', 3); // Left Torso
      drawBone(12, 24, 'rgba(110, 214, 127, 0.5)', 3); // Right Torso
      drawBone(23, 24, 'rgba(110, 214, 127, 0.5)', 3); // Hips

      // Key Joints
      [11, 12, 13, 14, 23, 24].forEach((idx) => {
        const pt = getPt(idx);
        if (pt) {
          ctx.beginPath();
          ctx.arc(pt.x, pt.y, 6, 0, Math.PI * 2);
          ctx.fillStyle = '#FFFFFF';
          ctx.fill();
          ctx.lineWidth = 2.5;
          ctx.strokeStyle = '#10B981';
          ctx.stroke();
        }
      });

      // Special Highlight on Left Wrist (Landmark 15) -> "ไม่" (ยกแขนซ้าย)
      const leftWrist = getPt(15);
      if (leftWrist) {
        ctx.beginPath();
        ctx.arc(leftWrist.x, leftWrist.y, isLeftRaised ? 14 : 9, 0, Math.PI * 2);
        ctx.fillStyle = isLeftRaised ? '#EF4444' : '#FFFFFF';
        ctx.fill();
        ctx.lineWidth = isLeftRaised ? 4 : 2.5;
        ctx.strokeStyle = isLeftRaised ? '#FEE2E2' : '#EF4444';
        ctx.stroke();

        if (isLeftRaised) {
          // Floating "ไม่" Badge
          ctx.fillStyle = '#0B2B2B';
          ctx.beginPath();
          ctx.roundRect(leftWrist.x - 30, leftWrist.y - 42, 60, 26, 8);
          ctx.fill();
          ctx.fillStyle = '#F87171';
          ctx.font = 'bold 13px "Noto Sans Thai", sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText('✋ ไม่', leftWrist.x, leftWrist.y - 25);
        }
      }

      // Special Highlight on Right Wrist (Landmark 16) -> "ใช่" (ยกแขนขวา)
      const rightWrist = getPt(16);
      if (rightWrist) {
        ctx.beginPath();
        ctx.arc(rightWrist.x, rightWrist.y, isRightRaised ? 14 : 9, 0, Math.PI * 2);
        ctx.fillStyle = isRightRaised ? '#10B981' : '#FFFFFF';
        ctx.fill();
        ctx.lineWidth = isRightRaised ? 4 : 2.5;
        ctx.strokeStyle = isRightRaised ? '#D7F9E1' : '#10B981';
        ctx.stroke();

        if (isRightRaised) {
          // Floating "ใช่" Badge
          ctx.fillStyle = '#0B2B2B';
          ctx.beginPath();
          ctx.roundRect(rightWrist.x - 30, rightWrist.y - 42, 60, 26, 8);
          ctx.fill();
          ctx.fillStyle = '#4AE387';
          ctx.font = 'bold 13px "Noto Sans Thai", sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText('✋ ใช่', rightWrist.x, rightWrist.y - 25);
        }
      }
    }
  }, [landmarks, isCameraReady, isLeftRaised, isRightRaised]);

  return (
    <div className="w-full max-w-3xl relative rounded-3xl overflow-hidden border-2 border-emerald-200/90 shadow-lg bg-emerald-950/90 aspect-[16/10] sm:aspect-[16/9] min-h-[260px] flex items-center justify-center">
      
      {/* 1. Camera Ready View */}
      {isCameraReady ? (
        <>
          <video
            ref={videoRef}
            playsInline
            muted
            autoPlay
            className="w-full h-full object-cover transition-transform duration-300"
            style={{ transform: cameraOrientationService.getCssTransform() }}
            aria-label="วิดีโอจากกล้องผู้เล่น"
          />

          {/* Skeleton Canvas Overlay */}
          <canvas
            ref={canvasRef}
            className="absolute inset-0 w-full h-full pointer-events-none z-10"
          />

          {/* Top Camera Controls Overlay */}
          <div className="absolute top-3 right-3 z-20 flex items-center gap-2">
            {onSwitchCamera && (
              <button
                type="button"
                onClick={onSwitchCamera}
                className="p-2 rounded-full bg-black/50 hover:bg-black/70 text-white backdrop-blur-sm transition"
                title="สลับกล้องหน้า/หลัง"
                aria-label="สลับกล้อง"
              >
                <RefreshCw className="w-4 h-4" />
              </button>
            )}

            <button
              type="button"
              onClick={onToggleCamera}
              className="px-3 py-1.5 rounded-full bg-black/50 hover:bg-black/70 text-white backdrop-blur-sm transition text-xs font-bold flex items-center gap-1.5"
              title="ปิดกล้องและเปลี่ยนเป็นโหมดสัมผัส"
              aria-label="ปิดกล้อง"
            >
              <CameraOff className="w-4 h-4 text-rose-300" />
              <span>ปิดกล้อง</span>
            </button>
          </div>

          {/* Real-time Guidance Banner Overlays */}
          {bothRaised ? (
            <div className="absolute bottom-4 z-20 px-4 py-2 rounded-2xl bg-amber-500/95 text-white font-bold text-xs sm:text-sm flex items-center gap-2 shadow-lg animate-pulse">
              <ShieldAlert className="w-4 h-4 flex-shrink-0" />
              <span>ตรวจพบทั้งสองมือพร้อมกัน — กรุณายกมือเพียงข้างเดียว</span>
            </div>
          ) : !isHandsInFrame ? (
            <div className="absolute bottom-4 z-20 px-4 py-2 rounded-2xl bg-emerald-900/85 text-emerald-100 font-bold text-xs sm:text-sm flex items-center gap-2 shadow-lg backdrop-blur-sm">
              <AlertCircle className="w-4 h-4 text-emerald-300 flex-shrink-0" />
              <span>ขยับให้เห็นลำตัวและยกมือให้อยู่ในกรอบภาพ</span>
            </div>
          ) : holdSide ? (
            <div
              className={`absolute bottom-4 z-20 px-4 py-2 rounded-2xl font-bold text-xs sm:text-sm flex items-center gap-2 shadow-lg transition-all ${
                holdSide === 'yes'
                  ? 'bg-emerald-600 text-white ring-2 ring-emerald-300'
                  : 'bg-rose-600 text-white ring-2 ring-rose-300'
              }`}
            >
              <CheckCircle2 className="w-4 h-4 flex-shrink-0 animate-spin" />
              <span>
                กำลังตอบ &quot;{holdSide === 'yes' ? 'ใช่' : 'ไม่'}&quot; — ค้างไว้{' '}
                {Math.round(holdProgress * 100)}%
              </span>
            </div>
          ) : null}
        </>
      ) : (
        /* 2. Silhouette Placeholder View (When camera is off or loading) */
        <div className="w-full h-full bg-gradient-to-b from-[#EBF7EE] to-[#DDF2E3] flex flex-col items-center justify-center p-6 text-center select-none relative">
          
          {/* Clinical Human Silhouette Vector SVG */}
          <div className="w-32 h-44 sm:w-40 sm:h-52 text-[#0B2B2B] opacity-85 flex items-center justify-center">
            <svg
              viewBox="0 0 100 130"
              className="w-full h-full drop-shadow-md"
              fill="currentColor"
            >
              {/* Head */}
              <circle cx="50" cy="18" r="11" />
              {/* Neck & Torso */}
              <path d="M37 32 C37 30 63 30 63 32 L60 72 C60 74 40 74 40 72 Z" />
              {/* Left Arm (User's perspective) */}
              <path
                d="M37 33 L24 55 L18 80 C17 83 22 85 24 81 L30 58 L38 38 Z"
                className="transition-transform origin-top"
              />
              {/* Right Arm */}
              <path
                d="M63 33 L76 55 L82 80 C83 83 78 85 76 81 L70 58 L62 38 Z"
                className="transition-transform origin-top"
              />
              {/* Legs */}
              <path d="M41 72 L38 116 C38 120 44 120 45 116 L49 76 Z" />
              <path d="M59 72 L62 116 C62 120 56 120 55 116 L51 76 Z" />
            </svg>
          </div>

          {/* Action Prompt */}
          <div className="mt-2 flex flex-col items-center gap-2 max-w-sm">
            {cameraError ? (
              <div className="p-3 rounded-2xl bg-amber-50 border border-amber-200 text-amber-900 text-xs font-semibold mb-1">
                {cameraError}
              </div>
            ) : null}

            <button
              type="button"
              onClick={onToggleCamera}
              disabled={isCameraLoading}
              className="px-6 py-3 rounded-full bg-[#1E8A4C] hover:bg-[#156637] text-white font-extrabold text-sm sm:text-base flex items-center gap-2 shadow-lg active:scale-95 transition"
            >
              {isCameraLoading ? (
                <>
                  <RefreshCw className="w-5 h-5 animate-spin" />
                  <span>กำลังเชื่อมต่อกล้อง...</span>
                </>
              ) : (
                <>
                  <Camera className="w-5 h-5" />
                  <span>เปิดกล้องตรวจจับท่าทาง</span>
                </>
              )}
            </button>

            <span className="text-xs text-[#22473E] font-medium">
              หรือสามารถแตะปุ่ม &quot;ใช่&quot; / &quot;ไม่&quot; บนหน้าจอเพื่อตอบได้ทันที
            </span>
          </div>

        </div>
      )}

    </div>
  );
};
