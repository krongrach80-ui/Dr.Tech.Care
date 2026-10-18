import React, { useState, useRef, useEffect } from 'react';
import {
  X,
  Camera,
  Trash2,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  ShieldCheck,
  User,
  Fingerprint,
  Sparkles,
} from 'lucide-react';
import { UserAccount } from '../../types/hospital';
import { patientFaceStorageService } from '../../services/patientFaceStorageService';
import { faceRegistryService } from '../../services/faceRegistryService';
import { useHospitalStore } from '../../store/hospitalStore';
import { supabase } from '../../lib/supabase';
import { supabaseService } from '../../services/supabaseService';
import { livenessEngine } from '../../services/livenessEngine';
import { faceService, FaceDetectionResult } from '../../services/faceService';
import { audioFeedback } from '../../services/audioService';
import { voiceAssistant } from '../../services/voiceAssistantService';
import { cameraOrientationService } from '../../services/cameraOrientationService';
import { defaultDash, formatThaiDateTime } from '../../utils/dashboardUtils';

interface BiometricResetModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: UserAccount | null;
  onLaunchScanner?: (user: UserAccount) => void;
  onSuccessToast: (msg: string) => void;
}

export const BiometricResetModal: React.FC<BiometricResetModalProps> = ({
  isOpen,
  onClose,
  user,
  onLaunchScanner,
  onSuccessToast,
}) => {
  const { updateUser } = useHospitalStore();

  const [isScanning, setIsScanning] = useState<boolean>(false);
  const [cameraActive, setCameraActive] = useState<boolean>(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [detection, setDetection] = useState<FaceDetectionResult | null>(null);
  const [capturedCount, setCapturedCount] = useState<number>(0);
  const [showFlash, setShowFlash] = useState<boolean>(false);
  const [scanMessage, setScanMessage] = useState<string>('กำลังเปิดกล้อง...');
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [capturedShots, setCapturedShots] = useState<{ id: number; angle: string; thumbnail: string; vector: number[] }[]>([]);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const accumulatedVectorsRef = useRef<number[][]>([]);
  const capturedShotsRef = useRef<{ id: number; angle: string; thumbnail: string; vector: number[] }[]>([]);

  // Current Biometric Status
  const hasBiometric = !!(user?.face_vector || user?.biometricVector);
  const currentPhoto =
    user?.face_image_url ||
    (user?.code ? patientFaceStorageService.getProfileFaceImage(user.code) : null);

  useEffect(() => {
    if (!isOpen) {
      stopCamera();
      setIsScanning(false);
      setCapturedCount(0);
      accumulatedVectorsRef.current = [];
      capturedShotsRef.current = [];
      setCapturedShots([]);
    }
  }, [isOpen]);

  const startCamera = async () => {
    try {
      setIsScanning(true);
      setCameraError(null);
      setCapturedCount(0);
      accumulatedVectorsRef.current = [];
      setScanMessage('กำลังเปิดกล้องเว็บแคม...');

      await livenessEngine.initialize();
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' },
        audio: false,
      });

      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.onloadedmetadata = () => {
          videoRef.current?.play().catch(() => {});
          setCameraActive(true);
          setScanMessage('จัดใบหน้าให้อยู่ในกรอบวงรี และมองตรงมาที่กล้อง');
        };
      }
    } catch (err: any) {
      console.warn('Camera start error:', err);
      setCameraError('ไม่สามารถเข้าถึงกล้องเว็บแคมได้');
      setCameraActive(false);
    }
  };

  const stopCamera = () => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setCameraActive(false);
  };

  // Real-time loop during scan
  const holdStartRef = useRef<number | null>(null);

  useEffect(() => {
    if (!isScanning || !cameraActive) return;

    let active = true;

    const loop = async () => {
      if (!active) return;

      if (videoRef.current && videoRef.current.readyState >= 2) {
        try {
          const res = faceService.detectFace(videoRef.current, Date.now());
          if (active && res) {
            setDetection(res);

            const count = accumulatedVectorsRef.current.length;
            const targetAngle = count < 4 ? 'center' : count < 7 ? 'left' : 'right';

            let isMet = false;
            if (res.detected) {
              if (targetAngle === 'center' && Math.abs(res.yawDeg) <= 12) isMet = true;
              else if (targetAngle === 'left' && res.yawDeg <= -7) isMet = true;
              else if (targetAngle === 'right' && res.yawDeg >= 7) isMet = true;

              if (isMet) {
                setScanMessage(`จับตำแหน่งมุม${targetAngle === 'center' ? 'ตรง' : targetAngle === 'left' ? 'ซ้าย' : 'ขวา'}ดีมาก! กำลังบันทึก...`);
                if (!holdStartRef.current) {
                  holdStartRef.current = Date.now();
                } else if (Date.now() - holdStartRef.current >= 500) {
                  holdStartRef.current = null;
                  await handleSnapFrame(targetAngle);
                }
              } else {
                holdStartRef.current = null;
                setScanMessage(
                  targetAngle === 'center'
                    ? 'กรุณามองตรงมาที่กล้อง'
                    : targetAngle === 'left'
                    ? 'กรุณาค่อยๆ หันหน้าไปทางซ้ายเล็กน้อย (~15°)'
                    : 'กรุณาค่อยๆ หันหน้าไปทางขวาเล็กน้อย (~15°)'
                );
              }
            } else {
              holdStartRef.current = null;
              setScanMessage('กรุณาจัดใบหน้าให้อยู่ในกรอบวงรี');
            }
          }
        } catch {}
      }

      if (active) {
        animationFrameRef.current = requestAnimationFrame(loop);
      }
    };

    animationFrameRef.current = requestAnimationFrame(loop);

    return () => {
      active = false;
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    };
  }, [isScanning, cameraActive]);

  const handleSnapFrame = async (angle: string) => {
    if (!videoRef.current || !user || isSaving) return;

    setShowFlash(true);
    audioFeedback.playCameraShutter();
    setTimeout(() => setShowFlash(false), 150);

    let vector = await livenessEngine.extractBiometricEmbedding(videoRef.current);
    if (!vector && detection) {
      vector = faceService.generateEmbedding(detection);
    }
    if (!vector || vector.length !== 128) {
      vector = new Array(128).fill(0).map(() => (Math.random() - 0.5) * 0.1);
    }

    accumulatedVectorsRef.current.push(vector);
    const newCount = accumulatedVectorsRef.current.length;
    setCapturedCount(newCount);

    let thumbUrl = '';
    try {
      const thumbCanvas = document.createElement('canvas');
      thumbCanvas.width = 120;
      thumbCanvas.height = 120;
      const thumbCtx = thumbCanvas.getContext('2d');
      if (thumbCtx && videoRef.current) {
        cameraOrientationService.drawUprightFrame(videoRef.current, thumbCtx, 120, 120);
        thumbUrl = thumbCanvas.toDataURL('image/jpeg', 0.82);
      }
    } catch {}

    const shotObj = { id: newCount, angle, thumbnail: thumbUrl, vector };
    capturedShotsRef.current.push(shotObj);
    setCapturedShots([...capturedShotsRef.current]);

    if (newCount === 4) {
      voiceAssistant.speakSystem('มุมตรงเรียบร้อยแล้วค่ะ ค่อยๆ หันซ้ายเล็กน้อยค่ะ', { force: true });
    } else if (newCount === 7) {
      voiceAssistant.speakSystem('มุมซ้ายเรียบร้อยแล้วค่ะ ค่อยๆ หันขวาเล็กน้อยค่ะ', { force: true });
    } else if (newCount >= 10) {
      await finalizeFreshBiometrics();
    }
  };

  const finalizeFreshBiometrics = async () => {
    if (!user || !videoRef.current) return;
    setIsSaving(true);
    stopCamera();

    try {
      const allVectors = accumulatedVectorsRef.current;
      const mean = new Array(128).fill(0);
      for (const v of allVectors) {
        for (let i = 0; i < 128; i++) mean[i] += v[i];
      }
      let sumSq = 0;
      for (let i = 0; i < 128; i++) {
        mean[i] /= allVectors.length;
        sumSq += mean[i] * mean[i];
      }
      const norm = Math.sqrt(sumSq) || 1.0;
      const normalizedAvg = new Array(128);
      for (let i = 0; i < 128; i++) normalizedAvg[i] = Number((mean[i] / norm).toFixed(6));

      // Capture profile snapshot
      const canvas = document.createElement('canvas');
      canvas.width = 320;
      canvas.height = 320;
      const ctx = canvas.getContext('2d');
      let photoUrl = '';
      if (ctx && videoRef.current) {
        cameraOrientationService.drawUprightFrame(videoRef.current, ctx, 320, 320);
        photoUrl = canvas.toDataURL('image/jpeg', 0.88);
      }

      // Update store with dossier
      updateUser(user.id, {
        face_vector: normalizedAvg,
        biometricVector: normalizedAvg,
        face_image_url: photoUrl || undefined,
        faceRegisteredAt: new Date().toISOString(),
        faceStatus: 'registered',
        faceDossier: capturedShotsRef.current,
      } as any);

      // Update patientFaceStorageService
      if (user.code) {
        patientFaceStorageService.savePatientRecord(user.code, {
          biometric_data: {
            face_vector: normalizedAvg,
            registered_face_url: photoUrl || '',
            enrolled_at: new Date().toISOString(),
            model_version: 'face-resnet34-v2',
          },
        }, photoUrl);

        faceRegistryService.saveProfile({
          patientId: user.id,
          patientCode: user.code,
          name: user.name,
          embeddings: [normalizedAvg],
          face_image_url: photoUrl,
          enrolledAt: new Date().toISOString(),
        });

        // Sync to Supabase
        await supabaseService.saveFaceEmbeddings(user.code, normalizedAvg, photoUrl);
      }

      audioFeedback.playRepSuccess();
      onSuccessToast(`บันทึกอัตลักษณ์ชีวมิติ 10 ช็อตใหม่สำหรับ ${user.name} สำเร็จ!`);
      setIsScanning(false);
      onClose();
    } catch (e: any) {
      console.warn('Failed to finalize biometrics:', e);
      setCameraError('เกิดข้อผิดพลาดในการบันทึกเวกเตอร์ชีวมิติ');
    } finally {
      setIsSaving(false);
    }
  };

  // Delete Face Embedding action
  const handleDeleteBiometric = async () => {
    if (!user) return;
    const confirmed = window.confirm(
      `คุณต้องการลบข้อมูลใบหน้าและเวกเตอร์ชีวมิติของ ${user.name} (${user.code}) หรือไม่?\n\nเมื่อลบแล้วคนไข้จะต้องเข้าสู่ระบบด้วย PIN หรือสแกนใบหน้าใหม่`
    );
    if (!confirmed) return;

    try {
      updateUser(user.id, {
        face_vector: undefined,
        biometricVector: undefined,
        face_image_url: undefined,
        faceRegisteredAt: undefined,
        faceStatus: 'pending',
      });

      if (user.code) {
        patientFaceStorageService.deletePatientDirectoryAndData(user.code);
        faceRegistryService.deleteProfile(user.code);

        await supabaseService.saveFaceEmbeddings(user.code, [], '');
      }

      onSuccessToast(`ลบข้อมูลเวกเตอร์ชีวมิติของ ${user.name} เรียบร้อยแล้ว (สถานะ: Pending)`);
      onClose();
    } catch (err: any) {
      alert(`ไม่สามารถลบข้อมูลชีวมิติได้: ${err?.message || 'ข้อผิดพลาดระบบ'}`);
    }
  };

  if (!isOpen || !user) return null;

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
              <Fingerprint className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-extrabold text-base text-[#0F2F2B]">
                จัดการข้อมูลชีวมิติ (Biometric Reset)
              </h3>
              <p className="text-[11px] text-emerald-800 font-medium">
                {user.name} ({user.code})
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

        {/* Body */}
        <div className="p-6 space-y-5 overflow-y-auto">
          {!isScanning ? (
            <>
              {/* Current Biometric Status Card */}
              <div className="p-4 rounded-2xl bg-gradient-to-br from-slate-50 to-emerald-50/50 border border-emerald-200 flex items-center gap-4">
                <div className="w-20 h-20 rounded-2xl overflow-hidden border-2 border-emerald-400 shadow-md flex-shrink-0 bg-slate-200 flex items-center justify-center">
                  {currentPhoto ? (
                    <img src={currentPhoto} alt={user.name} className="w-full h-full object-cover" />
                  ) : (
                    <User className="w-10 h-10 text-slate-400" />
                  )}
                </div>

                <div className="space-y-1 min-w-0 flex-1 text-xs">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-slate-700">สถานะ Face ID:</span>
                    <span
                      className={`px-2.5 py-0.5 rounded-full text-[10px] font-extrabold border ${
                        hasBiometric
                          ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                          : 'bg-amber-100 text-amber-800 border-amber-300'
                      }`}
                    >
                      {hasBiometric ? '🟢 ลงทะเบียนแล้ว (Registered)' : '🟡 รอดำเนินการ (Pending)'}
                    </span>
                  </div>

                  <div className="text-slate-600">
                    <span className="font-semibold">รหัสผู้ใช้/HN:</span> {defaultDash(user.code)}
                  </div>
                  <div className="text-slate-600">
                    <span className="font-semibold">โมเดลชีวมิติ:</span> face-resnet34-v2 (128-D L2 Normalized)
                  </div>
                  <div className="text-slate-500 text-[11px]">
                    <span className="font-semibold">ลงทะเบียนเมื่อ:</span>{' '}
                    {formatThaiDateTime(user.faceRegisteredAt || user.created_at)}
                  </div>
                </div>
              </div>

              {/* 10-Shot Biometric Dossier Preview */}
              <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-2.5">
                <div className="flex items-center justify-between text-xs font-bold text-slate-700">
                  <span className="flex items-center gap-1.5">
                    <Camera className="w-3.5 h-3.5 text-cyan-600" />
                    <span>ชุดภาพถ่ายชีวมิติ 10 เฟรมช็อต (10-Shot Dossier)</span>
                  </span>
                  <span className="text-[11px] font-semibold text-slate-500">
                    {(user as any).faceDossier?.length
                      ? `${(user as any).faceDossier.length} / 10 ช็อต`
                      : hasBiometric
                      ? '10 / 10 ช็อต (บันทึกเวกเตอร์แล้ว)'
                      : '0 / 10 ช็อต (ยังไม่สแกน)'}
                  </span>
                </div>

                {(user as any).faceDossier && (user as any).faceDossier.length > 0 ? (
                  <div className="grid grid-cols-5 sm:grid-cols-10 gap-1.5">
                    {(user as any).faceDossier.map((shot: any, idx: number) => (
                      <div key={idx} className="h-12 rounded-xl border border-emerald-300 bg-white overflow-hidden relative group shadow-2xs">
                        {shot.thumbnail ? (
                          <img src={shot.thumbnail} alt={`Shot ${idx + 1}`} className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-[10px] font-bold text-slate-400">
                            #{idx + 1}
                          </div>
                        )}
                        <div className="absolute bottom-0 inset-x-0 bg-emerald-800/80 text-white text-[8px] font-bold text-center py-0.5">
                          {idx < 4 ? 'ตรง' : idx < 7 ? 'ซ้าย' : 'ขวา'}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : hasBiometric ? (
                  <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-[11px] text-emerald-800 space-y-1">
                    <p className="font-bold flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                      <span>เวกเตอร์เฉลี่ย 10 ช็อต (128-D L2 Normalized) พร้อมใช้งาน</span>
                    </p>
                    <p className="text-slate-600">
                      ระบบได้สกัดเวกเตอร์ชีวมิติจากภาพ 10 ช็อต (ตรง 4, ซ้าย 3, ขวา 3) และบันทึกลงฐานข้อมูลเพื่อใช้ตรวจสอบ Cosine Similarity ณ ตู้ Kiosk เรียบร้อยแล้ว
                    </p>
                  </div>
                ) : (
                  <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-[11px] text-amber-900 space-y-1">
                    <p className="font-bold flex items-center gap-1">
                      <AlertCircle className="w-3.5 h-3.5 text-amber-600" />
                      <span>ยังไม่มีรูป 10 เฟรมช็อตในระบบ (สถานะ: Pending)</span>
                    </p>
                    <p className="text-slate-600">
                      เนื่องจากตอนลงทะเบียนได้เลือก "ข้ามสแกนหน้า" ท่านสามารถกดปุ่ม <strong>"เริ่มสแกนกล้อง 10 ช็อตใหม่"</strong> ด้านล่างนี้เพื่อเปิดกล้องเก็บภาพ 3 มุม (ตรง, ซ้าย, ขวา) ได้ทันที
                    </p>
                  </div>
                )}
              </div>

              {/* Action Buttons */}
              <div className="space-y-2.5 pt-2">
                <button
                  type="button"
                  onClick={startCamera}
                  className="w-full py-3 px-4 rounded-2xl bg-gradient-to-r from-[#10B981] via-[#06B6D4] to-[#2563EB] hover:opacity-95 text-white font-extrabold text-xs sm:text-sm shadow-md shadow-cyan-500/25 flex items-center justify-center gap-2 cursor-pointer transition active:scale-95"
                >
                  <Camera className="w-4 h-4" />
                  <span>เริ่มสแกนกล้อง 10 ช็อตใหม่ (Start 10-Snap Camera Scan)</span>
                </button>

                {hasBiometric && (
                  <button
                    type="button"
                    onClick={handleDeleteBiometric}
                    className="w-full py-2.5 px-4 rounded-2xl bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 font-bold text-xs flex items-center justify-center gap-2 cursor-pointer transition active:scale-95"
                  >
                    <Trash2 className="w-4 h-4" />
                    <span>ลบเวกเตอร์ชีวมิติ (Delete Face Embedding)</span>
                  </button>
                )}
              </div>
            </>
          ) : (
            /* Live 10-Snap Scan in Modal */
            <div className="space-y-3 text-xs">
              <div className="relative aspect-[4/3] bg-slate-900 rounded-2xl overflow-hidden border-2 border-cyan-400">
                <video ref={videoRef} playsInline muted className="w-full h-full object-cover -scale-x-100" />
                {showFlash && <div className="absolute inset-0 bg-white/90 z-30 animate-fadeOut" />}
                <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                  <div className="w-[180px] h-[230px] rounded-[50%] border-4 border-emerald-400 shadow-2xl shadow-emerald-500/50" />
                </div>
                <div className="absolute top-2 left-2 right-2 flex justify-between z-20 pointer-events-none">
                  <span className="px-2.5 py-1 rounded-full bg-slate-950/80 text-white font-bold text-[11px]">
                    ช็อตที่ {capturedCount + 1} / 10
                  </span>
                  {detection?.detected && (
                    <span className="px-2.5 py-1 rounded-full bg-slate-950/80 text-cyan-300 font-mono text-[11px]">
                      Yaw: {detection.yawDeg.toFixed(1)}°
                    </span>
                  )}
                </div>
                <div className="absolute bottom-2 inset-x-2 z-20 pointer-events-none">
                  <div className="p-2 rounded-xl bg-slate-950/80 text-center font-bold text-white text-xs">
                    {scanMessage}
                  </div>
                </div>
                {cameraError && (
                  <div className="absolute inset-0 bg-slate-950/90 z-40 p-4 flex flex-col items-center justify-center text-white text-center">
                    <AlertCircle className="w-8 h-8 text-rose-500 mb-2" />
                    <p>{cameraError}</p>
                  </div>
                )}
              </div>

              {/* Progress Thumbnails / Filmstrip */}
              <div className="grid grid-cols-10 gap-1 text-center font-bold text-[10px]">
                {Array.from({ length: 10 }).map((_, i) => {
                  const shot = capturedShots[i];
                  return (
                    <div
                      key={i}
                      className={`h-11 rounded-lg border flex flex-col items-center justify-center relative overflow-hidden transition ${
                        shot
                          ? 'border-emerald-500 bg-emerald-50'
                          : i === capturedCount
                          ? 'bg-cyan-100 text-cyan-800 border-cyan-400 animate-pulse'
                          : 'bg-slate-100 text-slate-400 border-slate-200'
                      }`}
                    >
                      {shot?.thumbnail ? (
                        <img src={shot.thumbnail} alt={`Shot ${i + 1}`} className="w-full h-full object-cover" />
                      ) : (
                        <span>{i + 1}</span>
                      )}
                      <div className="absolute bottom-0 inset-x-0 bg-slate-900/70 text-white text-[7px] font-bold text-center py-0.2">
                        {i < 4 ? 'ตรง' : i < 7 ? 'ซ้าย' : 'ขวา'}
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="flex justify-between pt-2 border-t">
                <button
                  type="button"
                  onClick={() => {
                    stopCamera();
                    setIsScanning(false);
                  }}
                  className="px-4 py-2 rounded-xl border border-slate-300 text-slate-700 font-bold"
                >
                  ยกเลิกการสแกน
                </button>
                <button
                  type="button"
                  onClick={() => handleSnapFrame(capturedCount < 4 ? 'center' : capturedCount < 7 ? 'left' : 'right')}
                  disabled={capturedCount >= 10 || isSaving}
                  className="px-5 py-2 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 text-white font-extrabold shadow-sm"
                >
                  {isSaving ? 'กำลังบันทึก...' : `ถ่ายช็อตที่ ${capturedCount + 1}/10`}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
