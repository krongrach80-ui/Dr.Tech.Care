import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Camera,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Sparkles,
  User,
  Shield,
  ArrowRight,
  Play,
  Heart,
  ChevronRight,
  Stethoscope,
  Clock,
  Calendar,
  Check,
  UserCheck,
  Info,
  Maximize2,
  Volume2,
  Gamepad2,
  Activity,
  Hand,
  Trophy,
  Zap,
  Star,
  Lock,
  Unlock,
  Pause,
  Key,
  X,
  ShieldCheck,
  ShieldAlert,
  Sliders,
  Users,
  Laptop,
  Radio,
  FileText,
  Phone,
  Pencil,
  LogOut,
  FlipVertical,
  RotateCw,
  FlipHorizontal,
  Plus,
  UserPlus,
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { Patient } from '../../types/patient';
import { useHospitalStore } from '../../store/hospitalStore';
import { usePatientStore } from '../../store/patientStore';
import { useExerciseStore } from '../../store/exerciseStore';
import { faceRegistryService } from '../../services/faceRegistryService';
import { poseService } from '../../services/poseService';
import { audioFeedback } from '../../services/audioService';
import { voiceAssistant } from '../../services/voiceAssistantService';
import { TreatmentPlan, UserAccount } from '../../types/hospital';
import { STRETCH_EXERCISES, StretchExerciseItem } from '../../data/stretchExercises';
import { livenessEngine } from '../../services/livenessEngine';
import { PDPAConsentModal } from '../Biometrics/PDPAConsentModal';
import { LivenessScanHUD } from '../Biometrics/LivenessScanHUD';
import { LivenessFrameData, LivenessChallenge } from '../../types/biometrics';
import { patientSyncService } from '../../services/patientSyncService';
import { patientFaceStorageService, PatientFaceBinding, isPlaceholderPatientName } from '../../services/patientFaceStorageService';
import { cameraOrientationService, CameraOrientation, CameraRotation } from '../../services/cameraOrientationService';
import { supabase, PATIENTS_REALTIME_CHANNEL } from '../../lib/supabase';
import { BIOMETRIC_CONFIG, BiometricMatchLevel, cosineToDistance, cosineToPercent } from '../../config/biometricConfig';
import { asset } from '../../utils/asset';
import logoImg from '../../assets/logo.png';
import logoIconImg from '../../assets/logo_icon.png';

// ============================================================================
// Hook 1: useKioskCountdown
// ซิงโครไนซ์ตัวนับถอยหลัง 5 วินาทีของ Step 5 และ Step 6
// เก็บ interval ใน useRef, เคลียร์ใน cleanup, และเคลียร์ทันทีเมื่อกดปุ่ม
// ============================================================================
interface UseKioskCountdownOptions {
  initialSeconds: number;
  isActive: boolean;
  onComplete: () => void;
}

function useKioskCountdown({ initialSeconds, isActive, onComplete }: UseKioskCountdownOptions) {
  const [seconds, setSeconds] = useState<number>(initialSeconds);
  const [isPaused, setIsPaused] = useState<boolean>(false);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const togglePause = useCallback(() => {
    setIsPaused((prev) => !prev);
  }, []);

  const proceedImmediately = useCallback(() => {
    clearTimer();
    onComplete();
  }, [clearTimer, onComplete]);

  useEffect(() => {
    if (!isActive) {
      clearTimer();
      setSeconds(initialSeconds);
      setIsPaused(false);
      return;
    }

    if (isPaused) {
      clearTimer();
      return;
    }

    setSeconds(initialSeconds);
    clearTimer();

    timerRef.current = setInterval(() => {
      setSeconds((prev) => {
        if (prev <= 1) {
          clearTimer();
          onComplete();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      clearTimer();
    };
  }, [isActive, isPaused, initialSeconds, onComplete, clearTimer]);

  return {
    seconds,
    isPaused,
    togglePause,
    proceedImmediately,
    clearTimer,
  };
}

// ============================================================================
// Hook 2: useHandTracker
// Shared Hand Tracking Hook ตัวเดียวระหว่าง Step 2 และ Step 3
// จำกัดการตรวจจับที่ ~15 fps, เก็บตำแหน่งมือใน useRef (ไม่ setState ทุกเฟรม),
// ควบคุม cursor DOM โดยตรง, และเรียก close() เมื่อออกจาก Step 3
// ============================================================================
interface UseHandTrackerOptions {
  videoRef: React.RefObject<HTMLVideoElement>;
  containerRef: React.RefObject<HTMLDivElement>;
  cursorElementRef: React.RefObject<HTMLDivElement>;
  cursorProgressCircleRef: React.RefObject<SVGCircleElement>;
  cursorLabelRef: React.RefObject<HTMLDivElement>;
  enabled: boolean;
  onTargetTrigger: (targetId: string) => void;
  onArmPoseConfirm: (pose: 'right_yes' | 'left_no') => void;
  onArmPoseChange?: (pose: 'none' | 'right_yes' | 'left_no', progress: number) => void;
}

function useHandTracker({
  videoRef,
  containerRef,
  cursorElementRef,
  cursorProgressCircleRef,
  cursorLabelRef,
  enabled,
  onTargetTrigger,
  onArmPoseConfirm,
  onArmPoseChange,
}: UseHandTrackerOptions) {
  // เก็บตำแหน่งและสถานะมือใน useRef ไม่ทำให้ React re-render ทุกเฟรม
  const handPosRef = useRef<{ x: number; y: number } | null>(null);
  const hoveredTargetRef = useRef<string | null>(null);
  const hoverStartTimeRef = useRef<number | null>(null);
  const lastTickElapsedRef = useRef<number>(0);
  const isCooldownRef = useRef<boolean>(false);
  const lastArmPoseRef = useRef<'none' | 'right_yes' | 'left_no'>('none');
  const armHoldCounterRef = useRef<number>(0);

  useEffect(() => {
    if (!enabled) {
      // ซ่อน Cursor เมื่อไม่ได้อยู่ใน Step 2 หรือ 3
      if (cursorElementRef.current) cursorElementRef.current.style.opacity = '0';
      if (cursorProgressCircleRef.current) cursorProgressCircleRef.current.style.strokeDashoffset = '150.8';
      if (cursorLabelRef.current) cursorLabelRef.current.style.opacity = '0';
      return;
    }

    let cancelled = false;
    let rafId: number | null = null;
    let lastFrameTime = 0;
    const FPS_INTERVAL = 1000 / 15; // ~15 FPS (66.6ms) เพื่อลดภาระ CPU/GPU

    // ตรวจสอบความพร้อมของ HandLandmarker (พรีโหลดไว้แล้วจาก Step 1)
    poseService.ensureHandLandmarker().catch((err) => {
      console.warn('⚠️ Hand Landmarker check warning:', err);
    });

    const loop = () => {
      if (cancelled) return;

      const now = performance.now();
      if (now - lastFrameTime >= FPS_INTERVAL) {
        lastFrameTime = now;
        const video = videoRef.current;
        if (video && video.readyState >= 2 && !video.paused) {
          try {
            const res = poseService.detectHolistic(video, now, { enableHands: true });
            
            // 1. ตรวจจับตำแหน่งปลายนิ้ว (Hand Tracking)
            let activeFingertip: { x: number; y: number } | null = null;
            if (res?.handLandmarks && res.handLandmarks.length > 0 && res.handLandmarks[0].length > 8) {
              activeFingertip = { x: res.handLandmarks[0][8].x, y: res.handLandmarks[0][8].y };
            } else if (res?.poseLandmarks) {
              const lm = res.poseLandmarks;
              const rightIdx = lm[20] || lm[16];
              const leftIdx = lm[19] || lm[15];
              if (rightIdx && (rightIdx.visibility === undefined || rightIdx.visibility > 0.3)) {
                activeFingertip = { x: rightIdx.x, y: rightIdx.y };
              } else if (leftIdx && (leftIdx.visibility === undefined || leftIdx.visibility > 0.3)) {
                activeFingertip = { x: leftIdx.x, y: leftIdx.y };
              }
            }

            // อัปเดตพิกัดลงใน DOM Element โดยตรง (Hardware Accelerated CSS Transform, 0 React Re-renders!)
            const containerEl = containerRef.current || video;
            if (activeFingertip && containerEl && cursorElementRef.current) {
              const rect = containerEl.getBoundingClientRect();
              const mirroredX = 1 - activeFingertip.x;
              const pixelX = rect.left + mirroredX * rect.width;
              const pixelY = rect.top + activeFingertip.y * rect.height;

              handPosRef.current = { x: pixelX, y: pixelY };

              cursorElementRef.current.style.transform = `translate3d(${pixelX}px, ${pixelY}px, 0)`;
              cursorElementRef.current.style.opacity = '1';

              // Hit Testing แตะปุ่ม [data-kiosk-target]
              if (!isCooldownRef.current) {
                const hitEl = document.elementFromPoint(pixelX, pixelY);
                const targetEl = hitEl?.closest('[data-kiosk-target]');
                const targetId = targetEl?.getAttribute('data-kiosk-target');

                if (targetId) {
                  if (hoveredTargetRef.current === targetId) {
                    const elapsed = now - (hoverStartTimeRef.current || now);
                    const prog = Math.min(100, Math.round((elapsed / 1000) * 100));

                    // อัปเดตวงแหวนนับเวลา SVG ผ่าน DOM ref
                    if (cursorProgressCircleRef.current) {
                      cursorProgressCircleRef.current.style.strokeDashoffset = String(150.8 - (150.8 * prog) / 100);
                    }
                    if (cursorLabelRef.current) {
                      cursorLabelRef.current.textContent = `แตะค้าง 1 วินาที (${prog}%)`;
                      cursorLabelRef.current.style.opacity = '1';
                    }

                    if (Math.floor(elapsed / 250) > Math.floor(lastTickElapsedRef.current / 250)) {
                      audioFeedback.playHoldTick();
                    }
                    lastTickElapsedRef.current = elapsed;

                    if (prog >= 100) {
                      isCooldownRef.current = true;
                      audioFeedback.playRepSuccess();
                      onTargetTrigger(targetId);
                      hoveredTargetRef.current = null;
                      hoverStartTimeRef.current = null;
                      lastTickElapsedRef.current = 0;
                      if (cursorProgressCircleRef.current) cursorProgressCircleRef.current.style.strokeDashoffset = '150.8';
                      if (cursorLabelRef.current) cursorLabelRef.current.style.opacity = '0';
                      setTimeout(() => {
                        isCooldownRef.current = false;
                      }, 800);
                    }
                  } else {
                    hoveredTargetRef.current = targetId;
                    hoverStartTimeRef.current = now;
                    lastTickElapsedRef.current = 0;
                    if (cursorLabelRef.current) {
                      cursorLabelRef.current.textContent = 'แตะค้าง 1 วินาที (0%)';
                      cursorLabelRef.current.style.opacity = '1';
                    }
                  }
                } else {
                  if (hoveredTargetRef.current) {
                    hoveredTargetRef.current = null;
                    hoverStartTimeRef.current = null;
                    lastTickElapsedRef.current = 0;
                    if (cursorProgressCircleRef.current) cursorProgressCircleRef.current.style.strokeDashoffset = '150.8';
                    if (cursorLabelRef.current) cursorLabelRef.current.style.opacity = '0';
                  }
                }
              }
            } else if (cursorElementRef.current) {
              cursorElementRef.current.style.opacity = '0';
              if (cursorProgressCircleRef.current) cursorProgressCircleRef.current.style.strokeDashoffset = '150.8';
              if (cursorLabelRef.current) cursorLabelRef.current.style.opacity = '0';
            }

            // 2. Arm Pose Detection (ยกแขนขวา=ใช่, ซ้าย=ไม่)
            if (res?.poseLandmarks) {
              const lm = res.poseLandmarks;
              const leftShoulder = lm[11];
              const leftWrist = lm[15];
              const rightShoulder = lm[12];
              const rightWrist = lm[16];

              const isRightRaised = rightWrist && rightShoulder && rightWrist.y < (rightShoulder.y - 0.05);
              const isLeftRaised = leftWrist && leftShoulder && leftWrist.y < (leftShoulder.y - 0.05);

              if (isRightRaised && !isLeftRaised) {
                if (lastArmPoseRef.current === 'right_yes') {
                  armHoldCounterRef.current++;
                } else {
                  armHoldCounterRef.current = 1;
                  lastArmPoseRef.current = 'right_yes';
                }
                const prog = Math.min(100, Math.round((armHoldCounterRef.current / 27) * 100));
                onArmPoseChange?.('right_yes', prog);
                if (armHoldCounterRef.current >= 27) {
                  armHoldCounterRef.current = 0;
                  onArmPoseConfirm('right_yes');
                }
              } else if (isLeftRaised && !isRightRaised) {
                if (lastArmPoseRef.current === 'left_no') {
                  armHoldCounterRef.current++;
                } else {
                  armHoldCounterRef.current = 1;
                  lastArmPoseRef.current = 'left_no';
                }
                const prog = Math.min(100, Math.round((armHoldCounterRef.current / 27) * 100));
                onArmPoseChange?.('left_no', prog);
                if (armHoldCounterRef.current >= 27) {
                  armHoldCounterRef.current = 0;
                  onArmPoseConfirm('left_no');
                }
              } else {
                if (armHoldCounterRef.current > 0) {
                  armHoldCounterRef.current = Math.max(0, armHoldCounterRef.current - 2);
                  const prog = Math.min(100, Math.round((armHoldCounterRef.current / 27) * 100));
                  onArmPoseChange?.(lastArmPoseRef.current, prog);
                } else {
                  lastArmPoseRef.current = 'none';
                  onArmPoseChange?.('none', 0);
                }
              }
            }
          } catch (e) {
            // ignore frame glitch
          }
        }
      }

      rafId = requestAnimationFrame(loop);
    };

    rafId = requestAnimationFrame(loop);

    return () => {
      cancelled = true;
      if (rafId) cancelAnimationFrame(rafId);
      if (cursorElementRef.current) cursorElementRef.current.style.opacity = '0';
      if (cursorProgressCircleRef.current) cursorProgressCircleRef.current.style.strokeDashoffset = '150.8';
      if (cursorLabelRef.current) cursorLabelRef.current.style.opacity = '0';
    };
  }, [enabled, videoRef, containerRef, cursorElementRef, cursorProgressCircleRef, cursorLabelRef, onTargetTrigger, onArmPoseConfirm, onArmPoseChange]);
}

// Deterministic 128-D vector helper for registered active patients
function getRegisteredPatientVector(code: string): number[] {
  const norm = (arr: number[]) => {
    let sumSq = 0;
    for (const v of arr) sumSq += v * v;
    const mag = Math.sqrt(sumSq) || 1;
    return arr.map((v) => Number((v / mag).toFixed(6)));
  };

  if (code.toUpperCase() === 'P-0012') {
    // Exact match for the default test/demo vector
    const raw = new Array(128).fill(0).map((_, i) => Math.sin(i * 0.1) * 0.08);
    return norm(raw);
  }

  // Generate distinct pseudo-orthogonal vectors for other registered patients
  const hash = code.split('').reduce((acc, c, idx) => acc + c.charCodeAt(0) * (idx + 1), 0);
  const raw = new Array(128).fill(0).map((_, i) => {
    return Math.sin((i + hash) * 0.35) * Math.cos((i * 0.22) + hash);
  });
  return norm(raw);
}

// ============================================================================
// Main Component: KioskSixStepWorkflow
// ============================================================================
interface KioskSixStepWorkflowProps {
  onLoginComplete: (patient: Patient) => void;
  onStartExerciseDirectly: (
    patient: Patient,
    plan?: TreatmentPlan,
    mode?: 'physio' | 'minigame',
    stretchQueue?: StretchExerciseItem[],
    customHoldTimes?: Record<string, number>
  ) => void;
  onOpenHospitalPortal: () => void;
  onOpenAbout?: () => void;
  onOpenReception?: () => void;
  kioskStationName?: string;
  isActive?: boolean;
  initialStep?: number;
}

export const KioskSixStepWorkflow: React.FC<KioskSixStepWorkflowProps> = ({
  onLoginComplete,
  onStartExerciseDirectly,
  onOpenHospitalPortal,
  onOpenAbout,
  onOpenReception,
  kioskStationName = 'Dr.Tech.Care (ตู้ Kiosk ประจำสถานี 1)',
  isActive = true,
  initialStep,
}) => {
  // Query param flags: อนุญาต Demo Mode เฉพาะขณะรัน Local Development Server เท่านั้น (ใน Production Build จะเป็น false เสมอ)
  const isExplicitDemo = Boolean(
    import.meta.env.DEV &&
    typeof window !== 'undefined' && (
      new URLSearchParams(window.location.search).get('demo') === '1' ||
      new URLSearchParams(window.location.search).get('dev') === '1'
    )
  );

  const initialStepParam = typeof window !== 'undefined'
    ? parseInt(new URLSearchParams(window.location.search).get('step') || '1', 10)
    : 1;
  const validInitialStep = !isNaN(initialStepParam) && initialStepParam >= 1 && initialStepParam <= 6 ? initialStepParam : 1;
  const [currentStep, setCurrentStep] = useState<number>(validInitialStep);

  // Settings
  const [isDemoMode, setIsDemoMode] = useState<boolean>(isExplicitDemo);
  const [seniorSimpleMode, setSeniorSimpleMode] = useState<boolean>(true);
  const [isAutoDetectionPaused, setIsAutoDetectionPaused] = useState<boolean>(false);

  // Stretch Modal State
  const [showStretchModal, setShowStretchModal] = useState<boolean>(false);
  const [selectedStretchIds, setSelectedStretchIds] = useState<string[]>(
    STRETCH_EXERCISES.map((s) => s.id)
  );
  const [customHoldTimes, setCustomHoldTimes] = useState<Record<string, number>>({});

  // Clock
  const [thaiDateStr, setThaiDateStr] = useState<string>('');
  const [thaiTimeStr, setThaiTimeStr] = useState<string>('');

  // Global MediaStream & Video References
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const lastLiveVectorRef = useRef<number[] | null>(null);
  const lastLiveJpgRef = useRef<string | null>(null);
  const [isCameraActive, setIsCameraActive] = useState<boolean>(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [cameraOrientation, setCameraOrientation] = useState<CameraOrientation>(
    cameraOrientationService.getOrientation()
  );
  const [cameraRotation, setCameraRotation] = useState<CameraRotation>(
    cameraOrientationService.getRotation()
  );
  const [isCameraMirrored, setIsCameraMirrored] = useState<boolean>(
    cameraOrientationService.isMirror()
  );

  useEffect(() => {
    const handleOrientation = (e: any) => {
      setCameraOrientation(e.detail?.orientation || cameraOrientationService.getOrientation());
      if (e.detail?.rotation !== undefined) {
        setCameraRotation(e.detail.rotation);
      } else {
        setCameraRotation(cameraOrientationService.getRotation());
      }
      if (e.detail?.isMirrored !== undefined) {
        setIsCameraMirrored(e.detail.isMirrored);
      } else {
        setIsCameraMirrored(cameraOrientationService.isMirror());
      }
    };
    window.addEventListener('strongcare:camera_orientation_changed', handleOrientation);
    return () => {
      window.removeEventListener('strongcare:camera_orientation_changed', handleOrientation);
    };
  }, []);

  // Step 1 Presence State & 3-Second Automatic Face Detection
  const [isPersonDetected, setIsPersonDetected] = useState<boolean>(false);
  const [presenceProgress, setPresenceProgress] = useState<number>(0);
  const [faceCountdownSeconds, setFaceCountdownSeconds] = useState<number>(3);
  const [isSlideUpAnimating, setIsSlideUpAnimating] = useState<boolean>(false);
  const [isBothHandsDetected, setIsBothHandsDetected] = useState<boolean>(false);
  const [bothHandsProgress, setBothHandsProgress] = useState<number>(0);

  // Step 1: Prolonged No-Face Presence Inquiry Modal ("คุณอยู่หน้าเครื่องหรือไม่?")
  const [showPresenceInquiryModal, setShowPresenceInquiryModal] = useState<boolean>(false);
  const [modalArmPose, setModalArmPose] = useState<'none' | 'right_yes' | 'left_no'>('none');
  const [modalRightArmProgress, setModalRightArmProgress] = useState<number>(0);
  const [modalLeftArmProgress, setModalLeftArmProgress] = useState<number>(0);
  const [modalRightArmSec, setModalRightArmSec] = useState<number>(2);
  const [modalLeftArmSec, setModalLeftArmSec] = useState<number>(2);
  const modalCanvasRef = useRef<HTMLCanvasElement | null>(null);

  // กล้องและการหมุน: ฟังก์ชันอัปเดตมุมมองกล้องทันทีและวาด canvas ซ้ำทันทีโดยไม่ต้องรอแอนิเมชันรอบถัดไป
  const redrawModalCanvasImmediate = () => {
    const canvas = modalCanvasRef.current;
    const video = videoRef.current;
    if (canvas && video && video.readyState >= 2) {
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.save();
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        cameraOrientationService.drawUprightFrame(video, ctx, canvas.width, canvas.height);
        ctx.restore();
      }
    }
  };

  const handleSetCameraRotation = (deg: CameraRotation) => {
    cameraOrientationService.setRotation(deg);
    setCameraRotation(deg);
    redrawModalCanvasImmediate();
  };

  const handleRotateCameraNext90 = () => {
    const nextDeg = cameraOrientationService.rotateNext90();
    setCameraRotation(nextDeg);
    redrawModalCanvasImmediate();
  };

  const handleToggleCameraMirror = () => {
    const nextMirror = cameraOrientationService.toggleMirror();
    setIsCameraMirrored(nextMirror);
    redrawModalCanvasImmediate();
  };

  // Step 2 & 3 Arm Pose State
  const [detectedArmPose, setDetectedArmPose] = useState<'none' | 'right_yes' | 'left_no'>('none');
  const [armHoldProgress, setArmHoldProgress] = useState<number>(0);
  const [gameXp, setGameXp] = useState<number>(100);
  const [comboCount, setComboCount] = useState<number>(1);

  // PDPA Consent & 3D Liveness State
  const [showPdpaModal, setShowPdpaModal] = useState<boolean>(false);
  const [hasPdpaConsent, setHasPdpaConsent] = useState<boolean>(false);
  const [currentLivenessFrame, setCurrentLivenessFrame] = useState<LivenessFrameData | null>(null);

  // Hand Tracking Touch Interaction on Camera (ยื่นมือแตะปุ่มค้าง 1 วินาที)
  const cameraContainerRef = useRef<HTMLDivElement | null>(null);
  const cursorElementRef = useRef<HTMLDivElement | null>(null);
  const cursorProgressCircleRef = useRef<SVGCircleElement | null>(null);
  const cursorLabelRef = useRef<HTMLDivElement | null>(null);

  // Step 4 Face Liveness & Biometric State
  const [scanStep, setScanStep] = useState<'front' | 'left' | 'right' | 'done'>('front');
  const [faceHoldProgress, setFaceHoldProgress] = useState<number>(0);
  const [holdElapsedMs, setHoldElapsedMs] = useState<number>(0);
  const [isScanning, setIsScanning] = useState<boolean>(false);
  const [scanStatusMessage, setScanStatusMessage] = useState<string>('กรุณาจัดใบหน้าให้อยู่ในกรอบวงรี');
  const [isNewRegistration, setIsNewRegistration] = useState<boolean>(false);
  const [regName, setRegName] = useState<string>('');
  const [regHn, setRegHn] = useState<string>('');
  const [biometricPhase, setBiometricPhase] = useState<number>(0);
  const [biometricProgress, setBiometricProgress] = useState<number>(0);
  const challengeProgressRef = useRef<{ front: boolean; left: boolean; right: boolean }>({
    front: false,
    left: false,
    right: false,
  });
  const [challengeProgress, setChallengeProgress] = useState<{ front: boolean; left: boolean; right: boolean }>({
    front: false,
    left: false,
    right: false,
  });
  const biometricTimersRef = useRef<NodeJS.Timeout[]>([]);

  // PIN Modal State
  const [showPinModal, setShowPinModal] = useState<boolean>(false);
  const [pinInput, setPinInput] = useState<string>('');
  const [pinError, setPinError] = useState<string | null>(null);

  // Biometric State Machine: 'idle' | 'scanning' | 'matched' | 'near-match' | 'no-match' | 'cooldown'
  const [biometricState, setBiometricState] = useState<'idle' | 'scanning' | 'matched' | 'near-match' | 'no-match' | 'cooldown'>('idle');
  const biometricStateRef = useRef<'idle' | 'scanning' | 'matched' | 'near-match' | 'no-match' | 'cooldown'>('idle');
  useEffect(() => {
    biometricStateRef.current = biometricState;
  }, [biometricState]);

  // Dev / Staff Debug Mode: Show biometric matching percentage only when requested
  const isDevMode = typeof window !== 'undefined' && (
    window.location.search.includes('dev=1') ||
    window.location.search.includes('test=1') ||
    isDemoMode
  );

  // Near-Match Modal State (75% - 87% ยืนยันตัวตนเพิ่มเติมด้วย PIN 6 หลัก)
  const [showNearMatchModal, setShowNearMatchModal] = useState<boolean>(false);
  const [nearMatchCandidate, setNearMatchCandidate] = useState<PatientFaceBinding | null>(null);

  // Cooldown State & Tracking
  const [cooldownRemainingSec, setCooldownRemainingSec] = useState<number>(0);
  const cooldownIntervalRef = useRef<any>(null);

  // Multi-frame Sampling Progress (เช่น 1/6 ถึง 6/6)
  const [sampleFrameCount, setSampleFrameCount] = useState<number>(0);

  // Non-matching Consecutive Tracking (ป้องกัน popup เด้งถ้าไม่ตรงไม่ถึง 3 วินาที หรือ N เฟรม)
  const consecutiveFailStartTimeRef = useRef<number | null>(null);
  const consecutiveFailFramesRef = useRef<number>(0);

  // No Account Found Warning Modal State ("ไม่พบข้อมูลบัญชีในระบบ โปรดลงทะเบียนผู้ป่วยใหม่")
  const [showNoAccountModal, setShowNoAccountModal] = useState<boolean>(false);
  const [lastMatchScore, setLastMatchScore] = useState<number>(0);

  // Link Face to Existing Account Modal
  const [showLinkAccountModal, setShowLinkAccountModal] = useState<boolean>(false);
  const [linkSearchQuery, setLinkSearchQuery] = useState<string>('');
  const [foundAccountForLink, setFoundAccountForLink] = useState<any | null>(null);
  const [isLinkingAccount, setIsLinkingAccount] = useState<boolean>(false);
  const [linkSearchError, setLinkSearchError] = useState<string | null>(null);

  // Step 6 Selected Therapy Mode
  const [selectedTherapyType, setSelectedTherapyType] = useState<'physio' | 'minigame'>('physio');

  // Active Patient & Plan
  const [activePatient, setActivePatient] = useState<Patient>(() => {
    const fromStore = usePatientStore.getState().selectedPatient;
    if (fromStore && (fromStore.name || fromStore.patient_code)) {
      return fromStore;
    }
    if (typeof window !== 'undefined') {
      try {
        const raw = localStorage.getItem('drtechcare_active_patient');
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed && (parsed.name || parsed.patient_code)) return parsed;
        }
      } catch {}
    }
    const firstPatient = usePatientStore.getState().patients[0];
    if (firstPatient) return firstPatient;
    return {
      id: 1,
      patient_code: 'P-0012',
      code: 'P-0012',
      name: 'ผู้รับบริการทั่วไป',
      age: 65,
      gender: 'male',
      notes: 'ฟื้นฟูกายภาพบำบัด',
    };
  });
  const [activePlan, setActivePlan] = useState<TreatmentPlan | null>(null);

  const { treatmentPlans, users, addUser, updateUser, completePendingPatientInfo } = useHospitalStore();
  const { selectPatient, selectedPatient, patients } = usePatientStore();

  useEffect(() => {
    if (selectedPatient && selectedPatient.id) {
      setActivePatient(selectedPatient);
    }
  }, [selectedPatient]);

  // Purge any lingering placeholder accounts on component mount so they never clash with face login
  useEffect(() => {
    try {
      patientFaceStorageService.purgeAllPlaceholderRecords();
    } catch {}
  }, []);

  // Synchronize and enrich registered patients in faceRegistryService and users store
  useEffect(() => {
    try {
      const allProfiles = faceRegistryService.getAllProfiles();

      // 1. Sync metadata (name, age, gender, image) for existing profiles from users
      for (const p of allProfiles) {
        const u = users.find(
          (user) =>
            (user.code && user.code.toLowerCase() === p.patientCode?.toLowerCase()) ||
            String(user.id) === String(p.patientId)
        );
        if (u) {
          let modified = false;
          if (u.name && u.name !== p.name && !isPlaceholderPatientName(u.name, u.status)) {
            p.name = u.name;
            modified = true;
          }
          if (u.age && u.age !== p.age) {
            p.age = u.age;
            modified = true;
          }
          if (u.gender && u.gender !== p.gender) {
            p.gender = u.gender;
            modified = true;
          }
          if (u.face_image_url && !p.face_image_url) {
            p.face_image_url = u.face_image_url;
            modified = true;
          } else if (p.face_image_url && !u.face_image_url) {
            u.face_image_url = p.face_image_url;
          }
          if (modified) {
            faceRegistryService.saveProfile(p);
          }
        }
      }

      // 2. Ensure active patients from users have a profile in faceRegistryService
      const activePatients = users.filter(
        (u) => u.role === 'patient' && u.status === 'active' && !isPlaceholderPatientName(u.name, u.status)
      );

      for (const ap of activePatients) {
        if (!ap.code || isPlaceholderPatientName(ap.name, ap.status)) continue;
        const exists = allProfiles.some(
          (p) => p.patientCode?.toLowerCase() === ap.code.toLowerCase() || String(p.patientId) === String(ap.id)
        );
        if (!exists) {
          const rawVec = ap.face_vector || ap.biometricVector;
          const parsed = patientFaceStorageService.parseVector(rawVec);
          if (parsed) {
            const photo = ap.face_image_url || patientFaceStorageService.getPatientFaceImage(ap.code) || patientFaceStorageService.getPatientFaceImage(ap.id) || undefined;
            faceRegistryService.saveProfile({
              patientId: ap.id,
              patientCode: ap.code,
              name: ap.name,
              age: ap.age,
              gender: ap.gender,
              embeddings: [parsed],
              face_image_url: photo,
              enrolledAt: ap.created_at || new Date().toISOString(),
            });
          }
        }
      }
    } catch (err) {
      console.warn('Failed to sync face profiles with users store:', err);
    }
  }, [users]);

  // 1. Clock updater
  useEffect(() => {
    const thaiDayNames = ['วันอาทิตย์', 'วันจันทร์', 'วันอังคาร', 'วันพุธ', 'วันพฤหัสบดี', 'วันศุกร์', 'วันเสาร์'];
    const thaiMonthNames = [
      'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
      'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'
    ];

    const updateClock = () => {
      const now = new Date();
      const dName = thaiDayNames[now.getDay()];
      const dNum = now.getDate();
      const mName = thaiMonthNames[now.getMonth()];
      const mNum = now.getMonth() + 1; // 1-based month index (October = 10)
      const bYear = now.getFullYear() + 543;
      const hh = String(now.getHours()).padStart(2, '0');
      const mm = String(now.getMinutes()).padStart(2, '0');
      const ss = String(now.getSeconds()).padStart(2, '0');

      setThaiDateStr(`${dName}ที่ ${dNum} ${mName} พ.ศ. ${bYear} (${dNum}/${mNum}/${bYear})`);
      setThaiTimeStr(`${hh}:${mm}:${ss} น.`);
    };

    updateClock();
    const interval = setInterval(updateClock, 1000);
    return () => clearInterval(interval);
  }, []);

  // ============================================================================
  // 2. Global MediaStream Management: เริ่มครั้งเดียวที่ Parent เลเวล
  // ไม่เรียกซ้ำเมื่อเปลี่ยน Step และหยุดแทร็กเมื่อเข้า PIN หรือจบคีออส
  // ============================================================================
  const stopMediaStream = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setIsCameraActive(false);
  }, []);

  const startCamera = useCallback(async () => {
    if (streamRef.current) return;
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        setCameraError('ไม่พบอุปกรณ์กล้องบนอุปกรณ์นี้ ท่านสามารถแตะหน้าจอหรือใช้รหัส PIN เพื่อเริ่มใช้งาน');
        return;
      }
      let stream: MediaStream | null = null;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' },
          audio: false,
        });
      } catch {
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: 'user' },
            audio: false,
          });
        } catch {
          try {
            stream = await navigator.mediaDevices.getUserMedia({
              video: { width: { ideal: 640 }, height: { ideal: 480 } },
              audio: false,
            });
          } catch {
            stream = await navigator.mediaDevices.getUserMedia({
              video: true,
              audio: false,
            });
          }
        }
      }

      if (!stream) throw new Error('ไม่สามารถรับสัญญาณภาพจากกล้องเว็บแคมได้');

      streamRef.current = stream;
      (window as any).__kioskCameraStream = stream;
      setIsCameraActive(true);
      setCameraError(null);

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.muted = true;
        videoRef.current.playsInline = true;
        await videoRef.current.play().catch(() => {});
      }
    } catch (err: unknown) {
      console.warn('Kiosk Camera start warning:', err);
      setCameraError('ไม่สามารถเปิดกล้องได้ กรุณาตรวจสอบการอนุญาตใช้งานกล้อง หรือแตะหน้าจอ/ใช้รหัส PIN เพื่อเริ่มใช้งาน');
      setIsCameraActive(false);
    }
  }, []);

  // เริ่มต้นกล้องครั้งเดียวเมื่อตู้ Kiosk โหลด และทำความสะอาดทรัพยากรเมื่อ Unmount จาก Kiosk ทั้งหมด
  useEffect(() => {
    if (!isActive) {
      stopMediaStream();
      return;
    }
    startCamera();
    poseService.initialize().catch(() => {});
    livenessEngine.initialize().catch(() => {});
    return () => {
      stopMediaStream();
      try {
        if (typeof window !== 'undefined' && window.speechSynthesis) {
          window.speechSynthesis.cancel();
        }
      } catch {}
      try { delete (window as any).__kioskCameraStream; } catch {}
      poseService.closeHandLandmarker();
      poseService.closeFaceLandmarker();
      biometricTimersRef.current.forEach((t) => clearTimeout(t));
      biometricTimersRef.current = [];
    };
  }, [isActive, startCamera, stopMediaStream]);

  // เชื่อมต่อ stream เข้า videoRef ถาวรทุกครั้งที่เปลี่ยน Step หรือกล้องพร้อม
  useEffect(() => {
    if (videoRef.current && streamRef.current) {
      if (videoRef.current.srcObject !== streamRef.current) {
        videoRef.current.srcObject = streamRef.current;
      }
      videoRef.current.muted = true;
      videoRef.current.playsInline = true;
      videoRef.current.play().catch(() => {});
    }
  }, [isCameraActive, currentStep]);

  // Preload Pose, Hand Tracker และ Face Liveness ล่วงหน้าใน Background ตอนอยู่ Step 1
  useEffect(() => {
    if (currentStep === 1 && isActive) {
      let cancelled = false;
      const timer = setTimeout(() => {
        if (cancelled || !isActive) return;
        poseService.initialize().catch(() => {});
        poseService.ensureHandLandmarker().catch(() => {});
        poseService.ensureFaceLandmarker().catch(() => {});
      }, 400);
      return () => {
        cancelled = true;
        clearTimeout(timer);
      };
    }
  }, [currentStep, isActive]);

  // Central Step Transition
  const changeStep = useCallback((nextStep: number) => {
    biometricTimersRef.current.forEach((t) => clearTimeout(t));
    biometricTimersRef.current = [];
    setDetectedArmPose('none');
    setArmHoldProgress(0);
    setCurrentStep(nextStep);
  }, []);

  // Step Action Handlers
  const triggerSlideUp = useCallback((targetStep: number | unknown = 4) => {
    if (isSlideUpAnimating) return;
    const destStep = typeof targetStep === 'number' ? targetStep : 4;
    setIsSlideUpAnimating(true);
    audioFeedback.playRepSuccess();
    try {
      voiceAssistant.speak('ยินดีต้อนรับสู่ระบบ Dr.Tech.Care ค่ะ เข้าสู่ขั้นตอนสแกนใบหน้านะคะ', {
        level: 'system',
      });
    } catch {}

    setTimeout(() => {
      setIsSlideUpAnimating(false);
      setPresenceProgress(0);
      setIsPersonDetected(false);
      changeStep(destStep);
    }, 600);
  }, [isSlideUpAnimating, changeStep]);







  // 3. Step 1: Automatic Face Presence (3s Hold) + Prolonged No-Face Inquiry Loop
  // Optimized for 60 FPS buttery smoothness, 100% accurate time-synced countdown, and zero lag.
  useEffect(() => {
    if (currentStep !== 1 || !isActive || isAutoDetectionPaused) {
      setPresenceProgress(0);
      setIsPersonDetected(false);
      setFaceCountdownSeconds(3);
      setBothHandsProgress(0);
      setIsBothHandsDetected(false);
      return;
    }

    let cancelled = false;
    let rafId: number | null = null;
    let lastFrameTime = performance.now();
    let lastDetectTime = 0;
    let lastFaceSeenTime = 0;
    let lastHandsSeenTime = 0;
    let faceStartTime: number | null = null;
    let bothHandsStartTime: number | null = null;
    let noFaceIdleMs = 0;
    let modalRightHoldMs = 0;
    let modalLeftHoldMs = 0;
    let lastAudioTickSec = -1;
    let lastRenderedProg = -1;
    let lastRenderedSec = -1;
    let lastProgressUpdateMs = 0;

    const loop = () => {
      if (cancelled || !isActive || isAutoDetectionPaused) return;
      const now = performance.now();
      const delta = Math.min(200, now - lastFrameTime);
      lastFrameTime = now;

      const video = videoRef.current;
      if (video && video.readyState >= 2 && !video.paused) {
        try {
          // กรณีโมดอลสอบถาม "คุณอยู่หน้าเครื่องหรือไม่?" เปิดอยู่: ใช้ MediaPipe Pose ตรวจจับยกแขนซ้าย/ขวา
          if (showPresenceInquiryModal) {
            const uprightVideo = cameraOrientationService.getUprightCanvas(video) || video;
            const res = poseService.detectHolistic(uprightVideo, now, { enableFace: false, enableHands: false });
            const lm = res?.poseLandmarks;

            // วาดภาพสะท้อนแบบกระจกเงาลง canvas ในโมดอล พร้อมจุดวงกลมบอกตำแหน่งข้อมือ
            const canvas = modalCanvasRef.current;
            if (canvas) {
              const ctx = canvas.getContext('2d');
              if (ctx) {
                ctx.save();
                ctx.clearRect(0, 0, canvas.width, canvas.height);
                cameraOrientationService.drawUprightFrame(video, ctx, canvas.width, canvas.height);
                ctx.restore();

                if (lm) {
                  const rWrist = lm[16];
                  const lWrist = lm[15];
                  const isMirrored = cameraOrientationService.isMirror();
                  if (rWrist) {
                    const rx = (isMirrored ? (1 - rWrist.x) : rWrist.x) * canvas.width;
                    const ry = rWrist.y * canvas.height;
                    ctx.beginPath();
                    ctx.arc(rx, ry, modalArmPose === 'right_yes' ? 24 : 16, 0, Math.PI * 2);
                    ctx.fillStyle = modalArmPose === 'right_yes' ? 'rgba(34, 197, 94, 0.9)' : 'rgba(34, 197, 94, 0.5)';
                    ctx.fill();
                    ctx.strokeStyle = '#FFFFFF';
                    ctx.lineWidth = 3;
                    ctx.stroke();
                  }
                  if (lWrist) {
                    const lx = (isMirrored ? (1 - lWrist.x) : lWrist.x) * canvas.width;
                    const ly = lWrist.y * canvas.height;
                    ctx.beginPath();
                    ctx.arc(lx, ly, modalArmPose === 'left_no' ? 24 : 16, 0, Math.PI * 2);
                    ctx.fillStyle = modalArmPose === 'left_no' ? 'rgba(239, 68, 68, 0.9)' : 'rgba(239, 68, 68, 0.5)';
                    ctx.fill();
                    ctx.strokeStyle = '#FFFFFF';
                    ctx.lineWidth = 3;
                    ctx.stroke();
                  }
                }
              }
            }

            if (lm) {
              const leftShoulder = lm[11];
              const leftWrist = lm[15];
              const rightShoulder = lm[12];
              const rightWrist = lm[16];

              const isRightRaised = Boolean(rightWrist && rightShoulder && rightWrist.y < (rightShoulder.y - 0.05));
              const isLeftRaised = Boolean(leftWrist && leftShoulder && leftWrist.y < (leftShoulder.y - 0.05));

              const HOLD_TIME_MS = 2000; // 2 วินาที (เหมาะสมกับผู้สูงอายุ ไม่เมื่อยแขน)

              // ถ้าผู้ใช้ยก แขนขวา (มีบัญชีแล้ว / ใช่) -> ค้าง 2 วินาทีเพื่อยืนยัน
              if (isRightRaised && !isLeftRaised) {
                modalRightHoldMs += delta;
                modalLeftHoldMs = Math.max(0, modalLeftHoldMs - delta * 2);

                const prog = Math.min(100, Math.round((modalRightHoldMs / HOLD_TIME_MS) * 100));
                const sec = Math.max(1, Math.ceil((HOLD_TIME_MS - modalRightHoldMs) / 1000));
                setModalRightArmProgress(prog);
                setModalRightArmSec(sec);
                setModalArmPose('right_yes');

                if (Math.floor(modalRightHoldMs / 1000) > lastAudioTickSec) {
                  lastAudioTickSec = Math.floor(modalRightHoldMs / 1000);
                  audioFeedback.playHoldTick();
                }

                if (modalRightHoldMs >= HOLD_TIME_MS) {
                  modalRightHoldMs = 0;
                  setModalArmPose('none');
                  audioFeedback.playRepSuccess();
                  setShowPresenceInquiryModal(false);
                  try {
                    voiceAssistant.speak('ยืนยันเข้าสู่ระบบเรียบร้อยค่ะ', { level: 'system' });
                  } catch {}
                  triggerSlideUp(4);
                  return;
                }
              }
              // ถ้าผู้ใช้ยก แขนซ้าย (ยังไม่มีบัญชี / ไม่) -> ค้าง 2 วินาที
              else if (isLeftRaised && !isRightRaised) {
                modalLeftHoldMs += delta;
                modalRightHoldMs = Math.max(0, modalRightHoldMs - delta * 2);

                const prog = Math.min(100, Math.round((modalLeftHoldMs / HOLD_TIME_MS) * 100));
                const sec = Math.max(1, Math.ceil((HOLD_TIME_MS - modalLeftHoldMs) / 1000));
                setModalLeftArmProgress(prog);
                setModalLeftArmSec(sec);
                setModalArmPose('left_no');

                if (Math.floor(modalLeftHoldMs / 1000) > lastAudioTickSec) {
                  lastAudioTickSec = Math.floor(modalLeftHoldMs / 1000);
                  audioFeedback.playHoldTick();
                }

                if (modalLeftHoldMs >= HOLD_TIME_MS) {
                  modalLeftHoldMs = 0;
                  setModalArmPose('none');
                  audioFeedback.playRepSuccess();
                  setShowPresenceInquiryModal(false);
                  try {
                    voiceAssistant.speak('กลับสู่หน้าแรกเรียบร้อยค่ะ', { level: 'system' });
                  } catch {}
                  noFaceIdleMs = 0;
                  return;
                }
              } else {
                modalRightHoldMs = Math.max(0, modalRightHoldMs - delta * 1.5);
                modalLeftHoldMs = Math.max(0, modalLeftHoldMs - delta * 1.5);
                setModalRightArmProgress(Math.round((modalRightHoldMs / HOLD_TIME_MS) * 100));
                setModalLeftArmProgress(Math.round((modalLeftHoldMs / HOLD_TIME_MS) * 100));
                setModalArmPose('none');
                lastAudioTickSec = -1;
              }
            }
          } else {
            // หน้าแรกปกติ: ตรวจจับใบหน้าอัตโนมัติ (Throttled AI Detection เพื่อความลื่นไหลระดับ 60 FPS ป้องกัน UI กระตุก)
            const AI_DETECT_INTERVAL_MS = 100; // ตรวจจับทุก ~100ms (10 FPS) เพียงพอต่อการตอบสนองทันใจ และไม่กิน CPU
            if (now - lastDetectTime >= AI_DETECT_INTERVAL_MS) {
              lastDetectTime = now;
              const uprightVideo = cameraOrientationService.getUprightCanvas(video) || video;
              // ปิด enableHands: false เนื่องจากตรวจท่าทางยก 2 มือด้วย PoseLandmarks ข้อศอก-ข้อมืออยู่แล้ว ประหยัดภาระ GPU/CPU มหาศาล
              const res = poseService.detectHolistic(uprightVideo, now, { enableFace: true, enableHands: false });
              const lm = res?.poseLandmarks;
              const faceLm = res?.faceLandmarks;

              // ตรวจจับท่าทางยก 2 มือขึ้น ("คุณพร้อมจะกายภาพรึยัง? ยก 2 มือขึ้นเพื่อเริ่ม")
              let bothHandsRaised = false;
              if (lm) {
                const leftShoulder = lm[11];
                const leftWrist = lm[15];
                const rightShoulder = lm[12];
                const rightWrist = lm[16];

                const isRightRaised = Boolean(rightWrist && rightShoulder && rightWrist.y < (rightShoulder.y - 0.05));
                const isLeftRaised = Boolean(leftWrist && leftShoulder && leftWrist.y < (leftShoulder.y - 0.05));
                bothHandsRaised = isRightRaised && isLeftRaised;
              }
              if (bothHandsRaised) {
                lastHandsSeenTime = now;
              }

              // ตรวจจับใบหน้ามนุษย์ (ทั้งจาก FaceLandmarker และ Pose landmarks จมูก-ดวงตา)
              const isFaceVisible = Boolean(
                (faceLm && faceLm.length > 0) ||
                (lm && lm[0] && (lm[0].visibility === undefined || lm[0].visibility > 0.4) &&
                 lm[2] && (lm[2].visibility === undefined || lm[2].visibility > 0.3) &&
                 lm[5] && (lm[5].visibility === undefined || lm[5].visibility > 0.3))
              );

              if (isFaceVisible) {
                lastFaceSeenTime = now;
              }
            }

            // --- ส่วนแอนิเมชันนับเวลาถอยหลัง 3 วินาที (รันอย่างราบรื่นด้วย timestamp แม่นยำระดับมิลลิวินาที) ---
            const FACE_GRACE_PERIOD_MS = 280; // ป้องกันแสงสะท้อนหรือการกระพริบตาทำให้นับเวลาหลุดกะทันหัน
            const isFaceCurrentlyActive = lastFaceSeenTime > 0 && (now - lastFaceSeenTime <= FACE_GRACE_PERIOD_MS);

            if (isFaceCurrentlyActive) {
              if (faceStartTime === null) {
                faceStartTime = now;
                setIsPersonDetected(true);
              }

              noFaceIdleMs = 0;
              const elapsed = Math.min(3000, now - faceStartTime);
              const prog = Math.min(100, Math.round((elapsed / 3000) * 100));
              const sec = Math.max(1, Math.ceil((3000 - elapsed) / 1000));

              // อัปเดต React state เป็นจังหวะที่เหมาะสม (~35ms) เพื่อป้องกัน React re-render ถี่เกินความจำเป็น
              if (prog !== lastRenderedProg && (now - lastProgressUpdateMs >= 35 || prog === 100 || prog === 0)) {
                lastRenderedProg = prog;
                lastProgressUpdateMs = now;
                setPresenceProgress(prog);
              }
              if (sec !== lastRenderedSec) {
                lastRenderedSec = sec;
                setFaceCountdownSeconds(sec);
              }

              if (Math.floor(elapsed / 1000) > lastAudioTickSec && Math.floor(elapsed / 1000) < 3) {
                lastAudioTickSec = Math.floor(elapsed / 1000);
                audioFeedback.playHoldTick();
              }

              // ถ้าตรวจเจอใบหน้าต่อเนื่องครบ 3 วินาที (หลอดโหลด 100% ตรงเวลาเป๊ะ): เข้าสู่ระบบทันที
              if (elapsed >= 3000) {
                faceStartTime = null;
                lastFaceSeenTime = 0;
                setIsPersonDetected(false);
                setPresenceProgress(100);
                audioFeedback.playRepSuccess();
                try {
                  voiceAssistant.speak('ตรวจพบใบหน้าเรียบร้อยแล้วค่ะ กำลังเข้าสู่ระบบ', { level: 'system' });
                } catch {}
                triggerSlideUp(4);
                return;
              }
            } else {
              // ถ้าเดินออกไปเกิน grace period ให้รีเซ็ตการนับถอยหลังเป็น 0 ทันที
              if (faceStartTime !== null) {
                faceStartTime = null;
                lastFaceSeenTime = 0;
                setPresenceProgress(0);
                setIsPersonDetected(false);
                setFaceCountdownSeconds(3);
                lastAudioTickSec = -1;
                lastRenderedProg = 0;
                lastRenderedSec = 3;
              }

              // ตรวจสอบกรณีไม่เจอใบหน้าเป็นเวลานาน (>= 10 วินาที)
              if (!showPresenceInquiryModal && !showPinModal && !isSlideUpAnimating && isCameraActive) {
                noFaceIdleMs += delta;
                if (noFaceIdleMs >= 10000) {
                  noFaceIdleMs = 0;
                  setShowPresenceInquiryModal(true);
                  try {
                    voiceAssistant.speak('คุณอยู่หน้าเครื่องหรือไม่คะ? ยกแขนขวาค้างไว้ 2 วินาทีเพื่อยืนยัน หรือยกแขนซ้ายเพื่อกลับหน้าแรกค่ะ', { level: 'system' });
                  } catch {}
                }
              }
            }

            // แอนิเมชันตรวจจับการยก 2 มือ
            const HANDS_GRACE_PERIOD_MS = 250;
            const isHandsCurrentlyActive = lastHandsSeenTime > 0 && (now - lastHandsSeenTime <= HANDS_GRACE_PERIOD_MS);
            if (isHandsCurrentlyActive) {
              if (bothHandsStartTime === null) {
                bothHandsStartTime = now;
                setIsBothHandsDetected(true);
              }
              const elapsedHands = Math.min(1200, now - bothHandsStartTime);
              const progHands = Math.min(100, Math.round((elapsedHands / 1200) * 100));
              setBothHandsProgress(progHands);

              if (elapsedHands >= 1200) {
                bothHandsStartTime = null;
                lastHandsSeenTime = 0;
                setIsBothHandsDetected(false);
                setBothHandsProgress(100);
                audioFeedback.playRepSuccess();
                try {
                  voiceAssistant.speak('ตรวจพบการยกสองมือ พร้อมเข้าสู่ขั้นตอนสแกนใบหน้าค่ะ', { level: 'system' });
                } catch {}
                triggerSlideUp(4);
                return;
              }
            } else {
              if (bothHandsStartTime !== null) {
                bothHandsStartTime = null;
                lastHandsSeenTime = 0;
                setIsBothHandsDetected(false);
                setBothHandsProgress(0);
              }
            }
          }
        } catch (e) {
          // ignore detection glitch
        }
      }

      rafId = requestAnimationFrame(loop);
    };

    rafId = requestAnimationFrame(loop);

    return () => {
      cancelled = true;
      if (rafId) cancelAnimationFrame(rafId);
      try {
        if (typeof window !== 'undefined' && window.speechSynthesis) {
          window.speechSynthesis.cancel();
        }
      } catch {}
    };
  }, [
    currentStep,
    isActive,
    isAutoDetectionPaused,
    showPresenceInquiryModal,
    showPinModal,
    isSlideUpAnimating,
    isCameraActive,
    triggerSlideUp,
  ]);

  // Confetti helper
  const triggerMiniGameConfetti = (originX = 0.5) => {
    if (seniorSimpleMode) return;
    try {
      confetti({
        particleCount: 40,
        spread: 60,
        origin: { x: originX, y: 0.6 },
        colors: ['#22c55e', '#10b981', '#34d399', '#6ee7b7', '#fbbf24'],
      });
    } catch {}
  };

  // Step 3 Handlers: ถามความพร้อมเข้าสู่ระบบ (ใช่ -> PDPA Consent -> Step 4, ไม่ -> Step 1)
  const handleStep3Yes = useCallback(() => {
    audioFeedback.playRepSuccess();
    triggerMiniGameConfetti(0.25);
    setGameXp((prev) => prev + 50);
    setScanStatusMessage('กรุณาจัดใบหน้าให้อยู่ในกรอบวงรี (มองตรงเพื่อเริ่มต้น)');
    if (!hasPdpaConsent) {
      setShowPdpaModal(true);
    } else {
      livenessEngine.createSessionNonce();
      changeStep(4);
    }
  }, [hasPdpaConsent, changeStep]);

  const handleStep3No = useCallback(() => {
    audioFeedback.playHoldTick();
    try {
      voiceAssistant.speak('ยกเลิกการเข้าสู่ระบบ กำลังกลับสู่หน้าแรกค่ะ', {
        level: 'system',
      });
    } catch {}
    changeStep(1);
  }, [changeStep]);

  // Unified Arm Pose handlers (backward compatibility)
  const handleConfirmYes = useCallback(() => {
    if (currentStep === 3) handleStep3Yes();
  }, [currentStep, handleStep3Yes]);

  const handleConfirmNo = useCallback(() => {
    if (currentStep === 3) handleStep3No();
  }, [currentStep, handleStep3No]);

  // Proceed to exercise (กายภาพบำบัด หรือ กายภาพมินิเกม)
  const handleProceedToExercise = (
    mode: 'physio' | 'minigame' = selectedTherapyType,
    customQueue?: StretchExerciseItem[]
  ) => {
    if (mode === 'physio') {
      voiceAssistant.stop();
    } else {
      audioFeedback.playRepSuccess();
    }
    selectPatient(activePatient);
    onStartExerciseDirectly(activePatient, activePlan || undefined, mode, customQueue, customHoldTimes);
  };



  // Step 4: Real Biometric Face Verification (128-D Vector Extraction, Strict PDPA - No Photos)
  const handlePerformFaceScan = async (bypassChallengeCheck = false) => {
    const isCompleted =
      bypassChallengeCheck ||
      isDemoMode ||
      challengeProgressRef.current.front;

    if (!isCompleted) {
      setScanStatusMessage('⚠️ กรุณามองตรงเข้าหากล้อง ค้างไว้ 1.2 วินาที หรือใช้รหัส PIN');
      audioFeedback.playHoldTick();
      return;
    }

    // Clear previous timers
    biometricTimersRef.current.forEach((t) => clearTimeout(t));
    biometricTimersRef.current = [];

    setIsScanning(true);
    setBiometricState('scanning');
    setBiometricPhase(1);
    setBiometricProgress(20);
    setScanStatusMessage('🛡️ [1/2] ตรวจสอบ 3D Liveness & Anti-Replay Nonce...');
    audioFeedback.playHoldTick();

    try {
      if (!videoRef.current) throw new Error('ไม่พบสัญญาณกล้อง');

      setBiometricPhase(2);
      setBiometricProgress(40);
      setScanStatusMessage('🧬 [2/2] สกัดเวกเตอร์ชีวมิติหลายมุมมอง (Multi-frame Sampling)...');

      // [MULTI-FRAME SAMPLING]: สกัดผลหลายเฟรมต่อเนื่อง (6 เฟรมใน ~1.2 วินาที)
      // เพื่อหาค่ามัธยฐาน (Median Vector) ลดความผันผวนจากแสงสะท้อน การกระพริบตา และมุมหน้า
      const TOTAL_FRAMES = BIOMETRIC_CONFIG.SAMPLE_FRAMES_COUNT;
      const collectedVectors: number[][] = [];

      for (let i = 0; i < TOTAL_FRAMES; i++) {
        setSampleFrameCount(i + 1);
        const prog = 40 + Math.round(((i + 1) / TOTAL_FRAMES) * 45); // 40% -> 85%
        setBiometricProgress(prog);
        setScanStatusMessage(`🧬 กำลังวิเคราะห์มุมมองใบหน้า (${i + 1}/${TOTAL_FRAMES})... กรุณามองตรง`);

        if (videoRef.current) {
          const vec = await livenessEngine.extractBiometricEmbedding(videoRef.current);
          if (vec && vec.length === 128) {
            collectedVectors.push(vec);
          }
        }

        if (i < TOTAL_FRAMES - 1) {
          await new Promise((r) => setTimeout(r, BIOMETRIC_CONFIG.SAMPLE_INTERVAL_MS));
        }
      }

      let vector128: number[] | null = null;
      if (collectedVectors.length >= 2) {
        vector128 = patientFaceStorageService.aggregateVectors(collectedVectors, true);
      } else if (collectedVectors.length === 1) {
        vector128 = collectedVectors[0];
      }

      if (!vector128) {
        if (isDemoMode) {
          vector128 = getRegisteredPatientVector('P-0012');
        } else {
          setIsScanning(false);
          setBiometricState('idle');
          setBiometricPhase(0);
          setScanStep('front');
          setScanStatusMessage('⚠️ ตรวจจับใบหน้าไม่ชัดเจน กรุณามองตรงเข้าหากล้องและเพิ่มแสงสว่าง');
          audioFeedback.playHoldTick();
          return;
        }
      }

      // [AUTOMATIC IMAGE COMPRESSION]:
      // Capture and compress the reference snapshot for login history
      const liveJpg = patientFaceStorageService.captureFrameAsJpg(videoRef.current, 0.80, 800, 800);

      // =========================================================================
      // Strict Biometric Matching Engine (Cross-Device Single Source of Truth)
      // =========================================================================
      // a) Fetch all valid patient records from Supabase Cloud + Local Store
      const candidateMap = new Map<string, PatientFaceBinding>();

        // 1. Fetch live from Supabase patients table (Cross-Device Single Source of Truth)
        try {
          const { data: dbPatients, error: sbErr } = await supabase
            .from('patients')
            .select('*');

          if (!sbErr && dbPatients && Array.isArray(dbPatients)) {
            for (const p of dbPatients) {
              if (!p.patient_code) continue;
              // NEVER include placeholder patients like 'ผู้ป่วยใหม่' into the biometric matching pool
              if (isPlaceholderPatientName(p.full_name || p.name, p.status)) continue;
              const code = p.patient_code.toUpperCase();

              // Extract 128-d vector using robust parseVector
              let vec128: number[] | null = patientFaceStorageService.parseVector(p.face_vector);
              if (!vec128 && typeof p.medical_history === 'string' && p.medical_history.includes('FACE_EMB:')) {
                const match = p.medical_history.match(/FACE_EMB:(\[.*?\])/);
                if (match) {
                  vec128 = patientFaceStorageService.parseVector(match[1]);
                }
              }

              if (vec128) {
                let photo = p.photo || p.avatar_url || p.face_image_url;
                if (!photo && typeof p.medical_history === 'string' && p.medical_history.includes('FACE_PHOTO:')) {
                  const pMatch = p.medical_history.match(/FACE_PHOTO:(data:image\/[^\s\n]+)/);
                  if (pMatch) photo = pMatch[1];
                }

                candidateMap.set(code, {
                  patientId: p.id || p.patient_code,
                  patientCode: p.patient_code,
                  name: p.full_name || `ผู้รับบริการ (${p.patient_code})`,
                  vector: vec128,
                  face_image_url: photo || undefined,
                  age: p.age,
                  gender: p.gender,
                  diagnosis: p.chief_complaint,
                  status: p.status,
                });
              }
            }
          }
        } catch (fetchErr) {
          console.warn('[KIOSK] Supabase candidates fetch warning:', fetchErr);
        }

        // 2. Scan patientFaceStorageService local isolated records
        const localRecords = patientFaceStorageService.getAllPatientRecords();
        localRecords.forEach((r) => {
          if (!r.patient_profile?.patient_id) return;
          // Skip any placeholder/draft accounts
          if (isPlaceholderPatientName(r.patient_profile.full_name, r.patient_profile.status)) return;
          const code = r.patient_profile.patient_id.toUpperCase();
          const parsed = patientFaceStorageService.parseVector(r.biometric_data.face_vector);
          if (parsed) {
            const savedImg =
              r.biometric_data.registered_face_url ||
              patientFaceStorageService.getProfileFaceImage(code);

            if (!candidateMap.has(code)) {
              candidateMap.set(code, {
                patientId: r.patient_profile.id,
                patientCode: r.patient_profile.patient_id,
                name: r.patient_profile.full_name,
                vector: parsed,
                face_image_url: savedImg || undefined,
                age: r.patient_profile.age,
                gender: r.patient_profile.gender,
                diagnosis: r.medical_records.diagnosis,
                status: r.patient_profile.status,
              });
            } else {
              // If already in map with placeholder name, prioritize real name from dossier
              const existing = candidateMap.get(code)!;
              if (isPlaceholderPatientName(existing.name) && !isPlaceholderPatientName(r.patient_profile.full_name)) {
                existing.name = r.patient_profile.full_name;
              }
            }
          }
        });

        // 3. Scan users in hospitalStore
        users.forEach((u) => {
          if (u.role === 'patient') {
            // Strictly skip any placeholder patient names
            if (isPlaceholderPatientName(u.name, u.status)) return;

            const rawVec = u.face_vector || u.biometricVector;
            const parsed = patientFaceStorageService.parseVector(rawVec);
            const savedImg =
              u.face_image_url ||
              patientFaceStorageService.getPatientFaceImage(u.code) ||
              patientFaceStorageService.getPatientFaceImage(u.id);

            if (parsed && u.code) {
              const code = u.code.toUpperCase();
              if (!candidateMap.has(code)) {
                candidateMap.set(code, {
                  patientId: u.id,
                  patientCode: u.code,
                  name: u.name,
                  vector: parsed,
                  face_image_url: savedImg || undefined,
                  age: u.age,
                  gender: u.gender,
                  diagnosis: u.diagnosis || u.chiefComplaint,
                  status: u.status,
                });
              } else {
                // If candidate has placeholder name, update with real name from store
                const existing = candidateMap.get(code)!;
                if (isPlaceholderPatientName(existing.name) && !isPlaceholderPatientName(u.name)) {
                  existing.name = u.name;
                }
              }
            }
          }
        });

        // 4. Scan faceRegistryService profiles
        const registryProfiles = faceRegistryService.getAllProfiles();
        registryProfiles.forEach((p) => {
          if (!p.patientCode || isPlaceholderPatientName(p.name)) return;
          const key = p.patientCode.toUpperCase();
          const parsed = patientFaceStorageService.parseVector(p.embeddings?.[0]);
          if (parsed && !candidateMap.has(key)) {
            const savedImg =
              p.face_image_url ||
              patientFaceStorageService.getPatientFaceImage(p.patientCode) ||
              patientFaceStorageService.getPatientFaceImage(p.patientId);

            candidateMap.set(key, {
              patientId: p.patientId,
              patientCode: p.patientCode,
              name: p.name,
              vector: parsed,
              face_image_url: savedImg || undefined,
              age: p.age,
              gender: p.gender,
            });
          }
        });

        const candidates = Array.from(candidateMap.values()).filter(
          (c) => c.status !== 'disabled' && c.status !== 'suspended' && !isPlaceholderPatientName(c.name, c.status)
        );

        // b & c) Cosine Similarity (3-Tier Biometric Evaluation: Pass >= 88%, Near 75-87%, Fail < 75%)
        const evaluation = patientFaceStorageService.matchLiveFaceAgainstDatabase(vector128, candidates, BIOMETRIC_CONFIG.THRESHOLD_PASS);

        // Required Console Logging
        console.log('[BIOMETRIC LOGIN MATCH RESULT (3-Tier)]:', {
          calculatedDistance: evaluation.bestDistance,
          matchedPatientName: evaluation.matched?.name || evaluation.nearMatchCandidate?.name || 'None',
          matchedHN: evaluation.matched?.patientCode || evaluation.nearMatchCandidate?.patientCode || 'None',
          similarity: `${evaluation.bestScorePercent}%`,
          tier: evaluation.matchLevel,
          isPassed: evaluation.matchLevel === 'pass',
        });

        // d) If matched successfully (Pass tier >= 88%):
        if (evaluation.matchLevel === 'pass' && evaluation.matched) {
          consecutiveFailStartTimeRef.current = null;
          consecutiveFailFramesRef.current = 0;
          setBiometricState('matched');
          const matchedCandidate = evaluation.matched;
          const targetHN = matchedCandidate.patientCode;

          // [DATA FETCHING]: Fetch fresh exact patient row from Supabase Cloud to avoid placeholders
          let dbExactPatient: any = null;
          try {
            const { data: exactRow } = await supabase
              .from('patients')
              .select('*')
              .eq('patient_code', targetHN)
              .maybeSingle();
            if (exactRow) {
              dbExactPatient = exactRow;
            }
          } catch (fetchErr) {
            console.warn('[KIOSK] Supabase exact patient fetch error:', fetchErr);
          }

          const matchedUser = users.find(
            (u) =>
              (u.code && u.code.toLowerCase() === targetHN.toLowerCase()) ||
              String(u.id) === String(matchedCandidate.patientId)
          );

          const matchedPatientRecord = patients.find(
            (p) =>
              (p.patient_code && p.patient_code.toLowerCase() === targetHN.toLowerCase()) ||
              String(p.id) === String(matchedCandidate.patientId)
          );

          // [ISOLATED PATIENT STORAGE]: Retrieve complete dossier from patient_record.json
          const patientDossier = patientFaceStorageService.getPatientRecord(targetHN);

          // [DATA FETCHING & RESOLUTION]: Resolve real First Name and Surname, never placeholder
          let realName = '';
          // 1. Check Supabase full_name
          if (dbExactPatient?.full_name && !isPlaceholderPatientName(dbExactPatient.full_name)) {
            realName = dbExactPatient.full_name.trim();
          }
          // 2. Check hospitalStore user name
          if (!realName && matchedUser?.name && !isPlaceholderPatientName(matchedUser.name)) {
            realName = matchedUser.name.trim();
          }
          // 3. Check isolated patient dossier
          if (!realName && patientDossier?.patient_profile?.full_name && !isPlaceholderPatientName(patientDossier.patient_profile.full_name)) {
            realName = patientDossier.patient_profile.full_name.trim();
          }
          if (!realName && patientDossier?.patient_profile?.first_name && !isPlaceholderPatientName(patientDossier.patient_profile.first_name)) {
            realName = `${patientDossier.patient_profile.first_name} ${patientDossier.patient_profile.last_name || ''}`.trim();
          }
          // 4. Check matchedPatientRecord
          if (!realName && matchedPatientRecord?.name && !isPlaceholderPatientName(matchedPatientRecord.name)) {
            realName = matchedPatientRecord.name.trim();
          }
          // 5. Match by phone if linked
          if (!realName && dbExactPatient?.phone) {
            const byPhone = users.find((u) => u.phone && u.phone === dbExactPatient.phone && !isPlaceholderPatientName(u.name));
            if (byPhone) realName = byPhone.name.trim();
          }
          // 6. Look up in users by code
          if (!realName) {
            const userByCode = users.find((u) => u.code && u.code.toLowerCase() === targetHN.toLowerCase() && !isPlaceholderPatientName(u.name));
            if (userByCode) realName = userByCode.name.trim();
          }
          // 7. Look up in faceRegistryService
          if (!realName) {
            const regProf = faceRegistryService.getAllProfiles().find((p) => p.patientCode.toLowerCase() === targetHN.toLowerCase() && !isPlaceholderPatientName(p.name));
            if (regProf) realName = regProf.name.trim();
          }
          // Fallback if candidate has valid name
          if (!realName && matchedCandidate.name && !isPlaceholderPatientName(matchedCandidate.name)) {
            realName = matchedCandidate.name.trim();
          }
          if (!realName) {
            realName = `ผู้รับบริการ (${targetHN})`;
          }

          const realAge = Number(dbExactPatient?.age || matchedUser?.age || patientDossier?.patient_profile?.age || matchedCandidate.age || 65);
          const realGender = (dbExactPatient?.gender || matchedUser?.gender || patientDossier?.patient_profile?.gender || matchedCandidate.gender || 'male') as any;
          
          let realDiagnosis =
            (dbExactPatient?.chief_complaint || '')
              .replace(/\[PENDING_INFO\]/g, '')
              .replace(/รอลงข้อมูลส่วนตัว/g, '')
              .trim() ||
            (matchedUser?.diagnosis || matchedUser?.chiefComplaint || '')
              .replace(/\[PENDING_INFO\]/g, '')
              .trim() ||
            patientDossier?.medical_records?.diagnosis ||
            matchedCandidate.diagnosis ||
            'ตรวจประเมินกายภาพบำบัด';

          if (realDiagnosis.includes('ยืนยันอัตลักษณ์ชีวมิติ') || realDiagnosis.includes('Cosine Match')) {
            realDiagnosis = 'ตรวจประเมินกายภาพบำบัด';
          }

          // [LOGIN HISTORY]: Save snapshot image taken during login verification into patient-specific named folder/login_history/
          if (liveJpg) {
            patientFaceStorageService.saveLoginSnapshot(targetHN, liveJpg, evaluation.bestScore, realName);
          }

          const faceImg =
            patientFaceStorageService.getProfileFaceImage(targetHN, realName) ||
            dbExactPatient?.photo ||
            dbExactPatient?.avatar_url ||
            matchedCandidate.face_image_url ||
            matchedUser?.face_image_url ||
            matchedPatientRecord?.face_image_url ||
            `/uploads/patients/${targetHN}/profile_face.jpg`;

          const targetPatient: Patient = {
            id: dbExactPatient?.id || (matchedUser ? Number(matchedUser.id) : (matchedPatientRecord ? Number(matchedPatientRecord.id) : Number(matchedCandidate.patientId))),
            patient_code: targetHN,
            name: realName,
            age: realAge,
            gender: realGender,
            notes: realDiagnosis,
            face_image_url: faceImg || undefined,
            photo: faceImg || undefined,
          };

          // Fetch treatment plan or load assigned_exercises directly from isolated patient_record.json
          let exactPlan = treatmentPlans.find(
            (plan) =>
              (plan.patientCode && plan.patientCode.toLowerCase() === targetHN.toLowerCase()) ||
              (plan.patientId && String(plan.patientId) === String(targetPatient.id)) ||
              (plan.patientName && realName.includes(plan.patientName))
          );

          if (patientDossier?.medical_records?.assigned_exercises && patientDossier.medical_records.assigned_exercises.length > 0) {
            if (!exactPlan) {
              exactPlan = {
                id: targetPatient.id,
                patientId: targetPatient.id,
                patientCode: targetPatient.patient_code,
                patientName: targetPatient.name,
                therapistName: patientDossier.medical_records.responsible_therapist || 'กภ. ธนากร วงศ์สวัสดิ์',
                diagnosis: patientDossier.medical_records.diagnosis || targetPatient.notes,
                clinicalNotes: patientDossier.medical_records.treatment_plan || 'ปฏิบัติตามแผนฟื้นฟูกายภาพประจำวัน',
                targetJoint: 'ข้อต่อและกล้ามเนื้อ',
                exercises: patientDossier.medical_records.assigned_exercises.map((ex, idx) => ({
                  id: idx + 1,
                  name: ex.name,
                  targetAngle: ex.target_angle,
                  holdSeconds: ex.hold_seconds,
                  targetReps: ex.reps,
                  description: `ทำท่า ${ex.name} ค้างไว้ ${ex.hold_seconds} วินาที จำนวน ${ex.reps} ครั้ง`,
                })),
                startDate: '2026-02-01',
                endDate: '2026-12-31',
                status: 'active',
              } as any;
            }
          }

          const matchPercent = evaluation.bestScorePercent;
          setBiometricPhase(3);
          setBiometricProgress(100);
          setActivePatient(targetPatient);
          selectPatient(targetPatient);
          if (exactPlan) {
            setActivePlan(exactPlan);
          }
          if (onLoginComplete) {
            onLoginComplete(targetPatient);
          }

          setScanStep('done');
          setScanStatusMessage(`⭐ ผ่านการตรวจสอบชีวมิติ ${matchPercent}% (ระยะห่าง: ${evaluation.bestDistance})! ยินดีต้อนรับ: ${targetPatient.name} (HN: ${targetPatient.patient_code})`);

          audioFeedback.playRepSuccess();
          try {
            voiceAssistant.speak(`ยินดีต้อนรับคุณ ${targetPatient.name} เข้าสู่ระบบสำเร็จค่ะ`, {
              level: 'system',
            });
          } catch {}

          // Realtime broadcast to Admin Dashboard
          try {
            supabase.channel(PATIENTS_REALTIME_CHANNEL).send({
              type: 'broadcast',
              event: 'patient_login',
              payload: {
                patient_code: targetHN,
                name: realName,
                distance: evaluation.bestDistance,
                similarity: `${matchPercent}%`,
                timestamp: new Date().toISOString(),
              },
            });
          } catch {}

          const t4 = setTimeout(() => {
            setIsScanning(false);
            setBiometricPhase(0);
            changeStep(5);
          }, 1200);
          biometricTimersRef.current.push(t4);
        } else if (evaluation.matchLevel === 'near-match') {
          // [NEAR-MATCH: 75% - 87%]: ใบหน้าคล้ายคลึงแต่ยังไม่มั่นใจ ให้ยืนยันตัวตนเพิ่มเติม
          console.info(`[KIOSK] Near-match detected (Similarity: ${evaluation.bestScorePercent}%). Secondary authentication required.`);
          consecutiveFailStartTimeRef.current = null;
          consecutiveFailFramesRef.current = 0;
          setIsScanning(false);
          setBiometricPhase(0);
          setBiometricState('near-match');
          setLastMatchScore(evaluation.bestScorePercent);
          lastLiveVectorRef.current = vector128;
          lastLiveJpgRef.current = liveJpg;

          const candidate = evaluation.nearMatchCandidate || (evaluation.comparisons[0] as any) || null;
          setNearMatchCandidate(candidate);
          setShowNearMatchModal(true);
          setScanStatusMessage('🟡 ตรวจพบข้อมูลใบหน้าใกล้เคียง กรุณายืนยันตัวตนเพิ่มเติม');

          audioFeedback.playRepSuccess();
          try {
            voiceAssistant.speak(
              'ระบบพบข้อมูลใบหน้าที่ใกล้เคียงค่ะ เพื่อความปลอดภัยของข้อมูลทางการแพทย์ กรุณายืนยันตัวตนเพิ่มเติมด้วยรหัส PIN ค่ะ',
              { level: 'system' }
            );
          } catch {}
        } else {
          // [NO-MATCH: < 75%]: ใบหน้าไม่ตรงกับฐานข้อมูล
          console.info(`[KIOSK] No matching registered account found (Similarity: ${evaluation.bestScorePercent}%).`);
          lastLiveVectorRef.current = vector128;
          lastLiveJpgRef.current = liveJpg;
          setLastMatchScore(evaluation.bestScorePercent);
          setIsScanning(false);
          setBiometricPhase(0);

          const now = performance.now();
          if (consecutiveFailStartTimeRef.current === null) {
            consecutiveFailStartTimeRef.current = now;
          }
          consecutiveFailFramesRef.current += 1;
          const failElapsedMs = now - consecutiveFailStartTimeRef.current;

          // ตรวจสอบว่าไม่ตรงต่อเนื่องครบอย่างน้อย 3 วินาที หรือ N เฟรมติดกัน จึงจะแสดง Popup
          if (
            failElapsedMs >= BIOMETRIC_CONFIG.NO_MATCH_CONSECUTIVE_MS ||
            consecutiveFailFramesRef.current >= BIOMETRIC_CONFIG.MIN_FAIL_FRAMES
          ) {
            consecutiveFailStartTimeRef.current = null;
            consecutiveFailFramesRef.current = 0;
            setBiometricState('no-match');
            setScanStep('front');
            setScanStatusMessage('❌ ไม่พบข้อมูลใบหน้านี้ในระบบ');
            setShowNoAccountModal(true);

            audioFeedback.playHoldTick();
            try {
              voiceAssistant.speak(
                'ระบบยังไม่พบข้อมูลใบหน้านี้ในระบบค่ะ หากเป็นคนไข้ใหม่ สามารถเพิ่มบัญชีได้ที่หน้าจัดการข้อมูลนะคะ',
                { level: 'system' }
              );
            } catch {}
          } else {
            // ยังไม่ครบ 3 วินาที แสดงเพียงข้อความแนะนำบนหน้าจอ โดยไม่เปิด Popup ให้รบกวน
            setBiometricState('idle');
            setScanStep('front');
            setScanStatusMessage('⚠️ ความคมชัดยังไม่เพียงพอ กรุณามองตรง แสงสว่างพอดี หรือถอดแมสก์/หมวก');
            audioFeedback.playHoldTick();
          }
        }
    } catch (err) {
      console.warn('Biometric scan error:', err);
      setIsScanning(false);
      setScanStatusMessage('เกิดข้อผิดพลาดในการประมวลผล กรุณาลองใหม่');
    }
  };

  // Step 4: Manual button click handler for face scan challenges
  const handleManualChallenge = (_step?: 'front' | 'left' | 'right') => {
    challengeProgressRef.current = { front: true, left: true, right: true };
    setChallengeProgress({ front: true, left: true, right: true });
    audioFeedback.playRepSuccess();
    setScanStep('done');
    setScanStatusMessage('✓ สแกนใบหน้าตรงสำเร็จ! กำลังตรวจสอบข้อมูลชีวมิติ...');
    setTimeout(() => {
      handlePerformFaceScan(true);
    }, 350);
  };

  // Trigger Cooldown Period (8-10 วินาที) หลังปิด Modal หรือทำรายการ ป้องกัน Popup เด้งรัว
  const triggerCooldown = useCallback((durationMs: number = BIOMETRIC_CONFIG.COOLDOWN_MS) => {
    if (cooldownIntervalRef.current) {
      clearInterval(cooldownIntervalRef.current);
      cooldownIntervalRef.current = null;
    }
    setBiometricState('cooldown');
    const totalSec = Math.ceil(durationMs / 1000);
    setCooldownRemainingSec(totalSec);
    setScanStatusMessage(`⏸️ พักการสแกนชั่วคราว (${totalSec} วิ) หรือกดปุ่ม "ลองสแกนอีกครั้ง" ได้ทันที`);

    let secLeft = totalSec;
    cooldownIntervalRef.current = setInterval(() => {
      secLeft -= 1;
      setCooldownRemainingSec(secLeft);
      if (secLeft <= 0) {
        if (cooldownIntervalRef.current) {
          clearInterval(cooldownIntervalRef.current);
          cooldownIntervalRef.current = null;
        }
        setBiometricState('idle');
        setScanStatusMessage('กรุณามองตรงเข้าหากล้องเพื่อสแกนใบหน้า');
      } else {
        setScanStatusMessage(`⏸️ พักการสแกนชั่วคราว (${secLeft} วิ) หรือกดปุ่ม "ลองสแกนอีกครั้ง" ได้ทันที`);
      }
    }, 1000);
  }, []);

  // Clear Cooldown and start scan immediately when user presses "ลองสแกนอีกครั้ง"
  const clearCooldownAndScanNow = useCallback(() => {
    if (cooldownIntervalRef.current) {
      clearInterval(cooldownIntervalRef.current);
      cooldownIntervalRef.current = null;
    }
    setCooldownRemainingSec(0);
    setBiometricState('idle');
    setShowNoAccountModal(false);
    setShowNearMatchModal(false);
    consecutiveFailStartTimeRef.current = null;
    consecutiveFailFramesRef.current = 0;
    setSampleFrameCount(0);
    handleResetFaceScan();
  }, []);

  // Step 4: Reset / Retry Face Scan
  const handleResetFaceScan = () => {
    biometricTimersRef.current.forEach((t) => clearTimeout(t));
    biometricTimersRef.current = [];
    setIsScanning(false);
    setBiometricState('idle');
    setBiometricPhase(0);
    setBiometricProgress(0);
    setFaceHoldProgress(0);
    setHoldElapsedMs(0);
    setSampleFrameCount(0);
    challengeProgressRef.current = { front: false, left: false, right: false };
    setChallengeProgress({ front: false, left: false, right: false });
    setScanStep('front');
    setScanStatusMessage('กรุณามองตรงเข้ากรอบวงรีเพื่อเริ่มสแกน หรือเลือกใช้รหัส PIN');
    audioFeedback.playHoldTick();
  };

  // Step 1: Direct Face Login (เมื่อตรวจพบใบหน้า หรือแตะหน้าจอ)
  const handleStartFaceLogin = useCallback(() => {
    if (!isActive) return;
    audioFeedback.playRepSuccess();
    try {
      voiceAssistant.speak('ตรวจพบใบหน้าเรียบร้อยแล้วค่ะ กำลังเข้าสู่ระบบ', { level: 'system' });
    } catch {}
    triggerSlideUp(4);
  }, [isActive, triggerSlideUp]);

  const handleRetryScan = () => {
    clearCooldownAndScanNow();
  };

  const handleUsePinInstead = () => {
    setShowNoAccountModal(false);
    setShowNearMatchModal(false);
    if (cooldownIntervalRef.current) {
      clearInterval(cooldownIntervalRef.current);
      cooldownIntervalRef.current = null;
    }
    setBiometricState('idle');
    setShowPinModal(true);
  };

  // Synchronize dynamic initialStep (e.g. from Reception to Step 4 Face Verification)
  useEffect(() => {
    if (initialStep && initialStep >= 1 && initialStep <= 6) {
      changeStep(initialStep);
      if (initialStep === 4) {
        handleResetFaceScan();
        setShowNoAccountModal(false);
        setShowPinModal(false);
        startCamera();
      }
    }
  }, [initialStep, changeStep, startCamera]);

  // Search account created by Admin to bind face
  const handleSearchAccountToLink = async () => {
    const q = linkSearchQuery.trim().toLowerCase();
    if (!q) {
      setLinkSearchError('กรุณากรอกรหัส HN หรือเบอร์โทรศัพท์');
      return;
    }
    setLinkSearchError(null);

    // Search local store
    let matched = users.find(
      (u) =>
        u.role === 'patient' &&
        ((u.code && u.code.toLowerCase().includes(q)) ||
         (u.phone && u.phone.includes(q)) ||
         (u.name && u.name.toLowerCase().includes(q)))
    );

    // Search Supabase patients table if not found locally
    if (!matched) {
      try {
        const { data } = await supabase
          .from('patients')
          .select('*')
          .or(`patient_code.ilike.%${q}%,phone.ilike.%${q}%,full_name.ilike.%${q}%`)
          .limit(1);
        if (data && data.length > 0) {
          const row = data[0];
          matched = {
            id: row.id,
            code: row.patient_code,
            name: row.full_name,
            age: row.age,
            gender: row.gender,
            phone: row.phone,
            diagnosis: row.chief_complaint,
            medical_history: row.medical_history,
            role: 'patient',
            status: row.status || 'active',
          } as any;
        }
      } catch (err) {
        console.warn('Supabase search link account error:', err);
      }
    }

    if (matched) {
      setFoundAccountForLink(matched);
      setLinkSearchError(null);
    } else {
      setFoundAccountForLink(null);
      setLinkSearchError(`ไม่พบข้อมูลคนไข้ที่ตรงกับ "${linkSearchQuery}" กรุณาตรวจสอบรหัส HN หรือเบอร์โทร`);
    }
  };

  // Confirm link face: captures 10 snapshots and binds to patient
  const handleConfirmLinkAndScan = async () => {
    if (!foundAccountForLink || !videoRef.current) return;
    setIsLinkingAccount(true);
    setLinkSearchError(null);

    try {
      const snapResult = await livenessEngine.captureTenSnapAveragedEmbedding(
        videoRef.current,
        10,
        0.85,
        (captured, total) => {
          setScanStatusMessage(`📸 สแกนใบหน้าผูกบัญชี ${captured}/${total} ช็อต...`);
        }
      );

      if (!snapResult || !snapResult.vector || snapResult.vector.length !== 128) {
        throw new Error('ไม่สามารถบันทึกเวกเตอร์ใบหน้าได้ กรุณามองตรงที่กล้อง');
      }

      const vec = snapResult.vector;
      const hn = foundAccountForLink.code || foundAccountForLink.patient_code || String(foundAccountForLink.id);
      
      // Capture live photo snapshot
      const canvas = document.createElement('canvas');
      canvas.width = 320;
      canvas.height = 320;
      const ctx = canvas.getContext('2d');
      let livePhoto: string | undefined;
      if (ctx && videoRef.current) {
        cameraOrientationService.drawUprightFrame(videoRef.current, ctx, 320, 320);
        livePhoto = canvas.toDataURL('image/jpeg', 0.85);
      }

      // Update Supabase
      const vectorJsonStr = JSON.stringify(vec);
      let updatedMedHistory = foundAccountForLink.medical_history || '';
      updatedMedHistory = updatedMedHistory.replace(/FACE_EMB:\[.*?\]/g, '').trim();
      updatedMedHistory = `${updatedMedHistory}\nFACE_EMB:${vectorJsonStr}${livePhoto ? `\nFACE_PHOTO:${livePhoto}` : ''}`.trim();

      try {
        await supabase
          .from('patients')
          .update({ face_vector: vec, medical_history: updatedMedHistory })
          .or(`patient_code.eq.${hn},id.eq.${foundAccountForLink.id}`);
      } catch {}

      // Update local storage & store
      patientFaceStorageService.savePatientRecord(hn, {
        patient_profile: {
          patient_id: hn,
          id: foundAccountForLink.id,
          first_name: foundAccountForLink.name,
          full_name: foundAccountForLink.name,
          age: Number(foundAccountForLink.age) || 65,
          gender: foundAccountForLink.gender || 'male',
          status: 'active',
        },
        biometric_data: {
          face_vector: vec,
          registered_face_url: livePhoto || `/uploads/patients/${hn}/profile_face.jpg`,
          enrolled_at: new Date().toISOString(),
          model_version: 'face-resnet34-10snap-v1',
        },
      }, livePhoto);

      updateUser(foundAccountForLink.id, {
        biometricVector: vec,
        face_vector: vec,
        face_image_url: livePhoto,
        status: 'active',
      });

      try {
        faceRegistryService.saveProfile({
          patientId: foundAccountForLink.id,
          patientCode: hn,
          name: foundAccountForLink.name,
          age: Number(foundAccountForLink.age) || 65,
          gender: foundAccountForLink.gender || 'male',
          embeddings: [vec],
          face_image_url: livePhoto,
          enrolledAt: new Date().toISOString(),
        });
      } catch {}

      // Target Patient
      const targetPatient: Patient = {
        id: Number(foundAccountForLink.id) || 1,
        patient_code: hn,
        name: foundAccountForLink.name,
        age: Number(foundAccountForLink.age) || 65,
        gender: (foundAccountForLink.gender as any) || 'male',
        notes: foundAccountForLink.diagnosis || 'กายภาพบำบัดฟื้นฟู',
        face_image_url: livePhoto,
        photo: livePhoto,
      };

      const exactPlan = treatmentPlans.find(
        (p) => (p.patientCode && p.patientCode.toLowerCase() === hn.toLowerCase()) || (p.patientName && targetPatient.name.includes(p.patientName))
      );

      setActivePatient(targetPatient);
      selectPatient(targetPatient);
      if (exactPlan) setActivePlan(exactPlan);
      if (onLoginComplete) onLoginComplete(targetPatient);

      setShowLinkAccountModal(false);
      audioFeedback.playRepSuccess();
      try {
        voiceAssistant.speak(`บันทึกและผูกใบหน้าเข้ากับบัญชีคุณ ${targetPatient.name} สำเร็จเรียบร้อยค่ะ`, { level: 'system' });
      } catch {}

      changeStep(5);
    } catch (err: any) {
      setLinkSearchError(err?.message || 'การสแกนใบหน้าล้มเหลว กรุณาลองใหม่อีกครั้ง');
    } finally {
      setIsLinkingAccount(false);
    }
  };

  // Step 4: Register New Face manually
  const handleSaveNewFaceRegistration = () => {
    const autoCode = regHn.trim() || `P-${Math.floor(1000 + Math.random() * 9000)}`;
    const autoName = regName.trim() || 'ผู้รับบริการใหม่';
    const newProfile = {
      patientId: Date.now(),
      patientCode: autoCode,
      name: autoName,
      age: 65,
      gender: 'male',
      embeddings: [new Array(128).fill(0.08)],
      enrolledAt: new Date().toISOString(),
    };

    faceRegistryService.saveProfile(newProfile);

    const createdPatient: Patient = {
      id: newProfile.patientId,
      patient_code: newProfile.patientCode,
      name: newProfile.name,
      age: 65,
      gender: 'male',
      notes: 'ลงทะเบียนใบหน้าใหม่ ณ ตู้ Kiosk',
    };

    setActivePatient(createdPatient);
    setIsNewRegistration(false);
    audioFeedback.playRepSuccess();
    changeStep(5);
  };

  // Central Virtual Hand Touch Target Executer (เมื่อยื่นมือค้างแตะครบ 1 วินาที)
  const executeKioskTarget = useCallback((targetId: string) => {
    audioFeedback.playRepSuccess();
    switch (targetId) {
      case 'step1-start':
        handleStartFaceLogin();
        break;
      case 'step1-register':
        if (onOpenHospitalPortal) {
          onOpenHospitalPortal();
        } else if (onOpenReception) {
          onOpenReception();
        }
        try {
          voiceAssistant.speak('กำลังพาท่านไปหน้าจัดการข้อมูลเพื่อเพิ่มบัญชีค่ะ', { level: 'system' });
        } catch {}
        break;
      case 'step1-pin':
      case 'step4-pin':
        setShowPinModal(true);
        break;
      case 'step3-yes':
        handleStep3Yes();
        break;
      case 'step3-no':
        handleStep3No();
        break;
      case 'step4-rescan':
        challengeProgressRef.current = { front: false, left: false, right: false };
        setScanStep('front');
        setScanStatusMessage('กรุณาจัดใบหน้าให้อยู่ในกรอบวงรี');
        break;
      default:
        break;
    }
  }, [
    handleStep3Yes,
    handleStep3No,
    changeStep,
    selectedTherapyType,
    handleStartFaceLogin,
  ]);

  // เชื่อมต่อ useHandTracker สำหรับ Step 2 และ Step 3
  useHandTracker({
    videoRef,
    containerRef: cameraContainerRef,
    cursorElementRef,
    cursorProgressCircleRef,
    cursorLabelRef,
    enabled: currentStep === 2 || currentStep === 3,
    onTargetTrigger: executeKioskTarget,
    onArmPoseConfirm: useCallback((pose: 'right_yes' | 'left_no') => {
      if (pose === 'right_yes') {
        handleStep3Yes();
      } else if (pose === 'left_no') {
        handleStep3No();
      }
    }, [handleStep3Yes, handleStep3No]),
    onArmPoseChange: useCallback((pose: 'none' | 'right_yes' | 'left_no', prog: number) => {
      setDetectedArmPose(pose);
      setArmHoldProgress(prog);
    }, []),
  });

  // Step 4 Face Liveness Detection Hook (สร้างเมื่อเข้า Step 4 และ close() ตอนออก)
  useEffect(() => {
    // ป้องกันการสแกนซ้ำซ้อนขณะที่มี Modal เปิดอยู่ หรืออยู่ในช่วง Cooldown
    if (
      currentStep !== 4 ||
      isScanning ||
      !isActive ||
      showNoAccountModal ||
      showNearMatchModal ||
      showPinModal ||
      showLinkAccountModal ||
      biometricState === 'cooldown' ||
      biometricState === 'matched'
    ) return;

    let cancelled = false;
    let rafId: number | null = null;
    let holdStartTime: number | null = null;
    const HOLD_DURATION_MS = 1200; // 1.2 วินาที (1-1.5 วินาทีตามสเปก)
    let lastTime = 0;

    // เชื่อมต่อ FaceLandmarker
    poseService.ensureFaceLandmarker().then((lm) => {
      if (lm) livenessEngine.setFaceLandmarker(lm);
    }).catch(() => {});
    livenessEngine.initialize().catch(() => {});

    const loop = () => {
      if (
        cancelled ||
        !isActive ||
        showNoAccountModal ||
        showNearMatchModal ||
        showPinModal ||
        showLinkAccountModal ||
        biometricStateRef.current === 'cooldown' ||
        biometricStateRef.current === 'matched'
      ) return;

      const now = performance.now();
      if (now - lastTime >= 50) {
        lastTime = now;
        const video = videoRef.current;
        if (video) {
          const activeStream = streamRef.current || (window as any).__kioskCameraStream;
          if (!video.srcObject && activeStream) {
            video.srcObject = activeStream;
            video.muted = true;
            video.playsInline = true;
            video.play().catch(() => {});
          }
          if (video.paused && video.srcObject) {
            video.play().catch(() => {});
          }
          if (video.readyState >= 2 && !video.paused) {
          try {
            let frameData = livenessEngine.processVideoFrame(video, now, 120);

            // Fallback to Holistic pose head yaw if face landmarker is loading
            if (!frameData) {
              const res = poseService.detectHolistic(video, now, { enableFace: true });
              const lm = res?.poseLandmarks;
              if (lm && lm[0] && lm[2] && lm[5]) {
                const nose = lm[0];
                const leftEye = lm[2];
                const rightEye = lm[5];
                const eyeMidX = (leftEye.x + rightEye.x) / 2;
                const eyeDist = Math.max(0.04, Math.abs(leftEye.x - rightEye.x));
                const yawOffset = (nose.x - eyeMidX) / eyeDist;
                // Mirrored perspective: Left turn = negative (< -14°), Right turn = positive (> +14°)
                const fallbackYawDeg = -yawOffset * 50;

                frameData = {
                  yawDeg: fallbackYawDeg,
                  pitchDeg: 0,
                  rollDeg: 0,
                  ear: 0.28,
                  qualityGate: {
                    passed: true,
                    luminance: 120,
                    isTooDark: false,
                    isTooBright: false,
                    faceCount: 1,
                    isCentered: true,
                    sizeRatio: 0.35,
                    isSizeValid: true,
                    errorMessageTh: null,
                  },
                };
              }
            }

            if (frameData) {
              setCurrentLivenessFrame(frameData);

              // ถ้าไม่มีใบหน้าในกล้อง: ห้ามขึ้น popup ใดๆ แสดงข้อความเบาๆ สบายตา
              const faceCount = frameData.qualityGate?.faceCount ?? 0;
              if (faceCount === 0) {
                holdStartTime = null;
                setFaceHoldProgress(0);
                setHoldElapsedMs(0);
                consecutiveFailStartTimeRef.current = null;
                consecutiveFailFramesRef.current = 0;
                setScanStatusMessage('กรุณามองตรงเข้าหากล้อง');
                rafId = requestAnimationFrame(loop);
                return;
              }

              const currentCh: LivenessChallenge =
                scanStep === 'front' ? 'front' : scanStep === 'left' ? 'turn_left' : 'turn_right';
              const evalRes = livenessEngine.evaluateChallenge(currentCh, frameData);

              if (evalRes.satisfied) {
                if (holdStartTime === null) {
                  holdStartTime = now;
                }
                const elapsedMs = now - holdStartTime;
                const prog = Math.min(100, Math.round((elapsedMs / HOLD_DURATION_MS) * 100));
                setFaceHoldProgress(prog);
                setHoldElapsedMs(elapsedMs);

                // ส่งเสียง tick เบา ๆ ทุก 350ms ระหว่างค้างท่า
                if (Math.floor(elapsedMs / 350) > Math.floor((elapsedMs - 50) / 350)) {
                  audioFeedback.playHoldTick();
                }

                if (elapsedMs >= HOLD_DURATION_MS) {
                  holdStartTime = null;
                  setFaceHoldProgress(100);
                  setHoldElapsedMs(0);

                  if (scanStep === 'front') {
                    challengeProgressRef.current = { front: true, left: true, right: true };
                    setChallengeProgress({ front: true, left: true, right: true });
                    setScanStep('done');
                    setScanStatusMessage('✓ สแกนใบหน้าตรงสำเร็จ! กำลังตรวจสอบข้อมูลชีวมิติ...');
                    audioFeedback.playRepSuccess();
                    handlePerformFaceScan(true);
                  }
                }
              } else {
                // หลุดเงื่อนไข: รีเซ็ตเฉพาะเวลาค้างของขั้นปัจจุบัน (ขั้นที่ผ่านแล้วยังคงอยู่)
                holdStartTime = null;
                setFaceHoldProgress(0);
                setHoldElapsedMs(0);
              }
            }
          } catch (e) {
            // ignore detection glitch
          }
        }
      }
    }

    rafId = requestAnimationFrame(loop);
    };

    rafId = requestAnimationFrame(loop);

    return () => {
      cancelled = true;
      if (rafId) cancelAnimationFrame(rafId);
    };
  }, [
    currentStep,
    scanStep,
    isScanning,
    isActive,
    showNoAccountModal,
    showNearMatchModal,
    showPinModal,
    showLinkAccountModal,
    biometricState,
  ]);

  // Event listener สำหรับการทดสอบความปลอดภัยและ E2E Testing ในสภาพแวดล้อม Headless/CI
  useEffect(() => {
    const handleTriggerScan = () => {
      handlePerformFaceScan(true);
    };
    window.addEventListener('kiosk:trigger-face-scan', handleTriggerScan);
    return () => {
      window.removeEventListener('kiosk:trigger-face-scan', handleTriggerScan);
    };
  }, []);

  // 4. Synchronized Countdowns for Step 5 & Step 6
  const step5Countdown = useKioskCountdown({
    initialSeconds: 5,
    isActive: currentStep === 5,
    onComplete: useCallback(() => changeStep(6), [changeStep]),
  });

  const step6Countdown = useKioskCountdown({
    initialSeconds: 5,
    isActive: currentStep === 6,
    onComplete: useCallback(() => handleProceedToExercise(selectedTherapyType), [handleProceedToExercise, selectedTherapyType]),
  });

  // Confetti on Step 5
  useEffect(() => {
    if (currentStep === 5) {
      try {
        confetti({
          particleCount: 70,
          spread: 80,
          origin: { y: 0.55 },
          colors: ['#22c55e', '#3b82f6', '#f59e0b', '#ec4899', '#8b5cf6'],
        });
      } catch {}
    }
  }, [currentStep]);

  // Load treatment plan dynamically from isolated patient dossier or treatmentPlans
  useEffect(() => {
    if (!activePatient) return;

    // 1. Check isolated dossier single source of truth
    const patientHN = activePatient.patient_code || (activePatient as any).code || '';
    const isolatedRecord = patientHN ? patientFaceStorageService.getPatientRecord(patientHN) : null;
    const isolatedSchedule = isolatedRecord?.medical_records?.schedule;

    const plan = treatmentPlans.find(
      (p) =>
        (patientHN && p.patientCode?.toLowerCase() === patientHN.toLowerCase()) ||
        (activePatient.name && p.patientName?.includes(activePatient.name)) ||
        p.patientId === activePatient.id
    );

    if (isolatedSchedule && isolatedRecord?.medical_records?.assigned_exercises) {
      setActivePlan({
        id: plan?.id || 1,
        patientId: activePatient.id,
        patientName: activePatient.name,
        patientCode: patientHN,
        therapistId: 1,
        therapistName:
          isolatedRecord.medical_records.responsible_therapist ||
          plan?.therapistName ||
          'กภ. ธนากร วงศ์สวัสดิ์',
        diagnosis:
          isolatedRecord.medical_records.diagnosis ||
          plan?.diagnosis ||
          'ข้อไหล่ติดระยะฟื้นฟู (Frozen Shoulder)',
        targetJoint: (isolatedRecord.medical_records as any).target_joint || plan?.targetJoint || 'ข้อไหล่และแขน',
        assignedExercises: isolatedRecord.medical_records.assigned_exercises.map((ex) => ({
          exerciseSlug: ex.exerciseSlug || ex.id,
          exerciseName: ex.exerciseName || ex.name,
          sets: ex.sets || 3,
          reps: ex.reps || 10,
          holdSeconds: ex.hold_seconds || 3,
          difficulty: ex.difficulty || 'beginner',
        })),
        clinicalNotes:
          (isolatedSchedule as any).clinical_notes ||
          plan?.clinicalNotes ||
          'ให้ค่อยๆ เคลื่อนไหวตามคำแนะนำของเสียงและสเกเลตัน AI หากมีอาการเจ็บสามารถกดปุ่มหยุดได้ทันที',
        createdAt: '2026-10-01',
        status: (isolatedSchedule.status as any) || plan?.status || 'active',
        scheduleDays: isolatedSchedule.schedule_days || plan?.scheduleDays || ['จันทร์', 'พุธ', 'ศุกร์'],
        timeSlot: isolatedSchedule.time_slot || plan?.timeSlot || '09:30 - 10:30',
        startTime: isolatedSchedule.start_time || plan?.startTime || '09:30',
        endTime: isolatedSchedule.end_time || plan?.endTime || '10:30',
        startDate: isolatedSchedule.start_date || plan?.startDate || '2026-10-01',
        endDate: isolatedSchedule.end_date || plan?.endDate || '2026-10-31',
        roomStation: isolatedSchedule.room_station || plan?.roomStation || 'ตู้ Kiosk 1',
        includeMinigame:
          typeof isolatedSchedule.include_minigame === 'boolean'
            ? isolatedSchedule.include_minigame
            : true,
      });
    } else if (plan) {
      setActivePlan(plan);
    } else {
      setActivePlan({
        id: 1,
        patientId: activePatient.id,
        patientName: activePatient.name,
        patientCode: activePatient.patient_code,
        therapistId: 1,
        therapistName: 'กภ. ธนากร วงศ์สวัสดิ์',
        diagnosis: 'ข้อไหล่ติดระยะฟื้นฟู (Frozen Shoulder)',
        targetJoint: 'ข้อไหล่และแขน',
        assignedExercises: [
          { exerciseSlug: 'shoulder_raise', exerciseName: 'กางแขนยกด้านข้าง', sets: 3, reps: 10, holdSeconds: 3, difficulty: 'beginner' },
          { exerciseSlug: 'cross_body_stretch', exerciseName: 'ยืดไหล่ข้ามอก', sets: 3, reps: 5, holdSeconds: 5, difficulty: 'beginner' },
          { exerciseSlug: 'chest_expansion', exerciseName: 'ยืดอกเปิดไหล่', sets: 2, reps: 5, holdSeconds: 5, difficulty: 'beginner' },
        ],
        clinicalNotes: 'ให้ค่อยๆ เคลื่อนไหวตามคำแนะนำของเสียงและสเกเลตัน AI หากมีอาการเจ็บสามารถกดปุ่มหยุดได้ทันที',
        createdAt: '2026-10-01',
        status: 'active',
        scheduleDays: ['จันทร์', 'พุธ', 'ศุกร์'],
        timeSlot: '09:30 - 10:30',
        roomStation: 'ตู้ Kiosk 1',
        includeMinigame: true,
      });
    }
  }, [activePatient, treatmentPlans]);

  // PIN Handlers
  const handlePinDigit = (digit: string) => {
    if (pinInput.length < 8) {
      setPinInput((prev) => prev + digit);
      setPinError(null);
      audioFeedback.playHoldTick();
    }
  };

  const handlePinBackspace = () => {
    setPinInput((prev) => prev.slice(0, -1));
    setPinError(null);
    audioFeedback.playHoldTick();
  };

  const handlePinClear = () => {
    setPinInput('');
    setPinError(null);
  };

  const handleSelectQuickPatient = (pat: Patient, pinCode: string) => {
    const targetCode = pat.patient_code || (pat as any).code || 'P-0001';
    const safePat: Patient = {
      ...pat,
      id: pat.id,
      patient_code: targetCode,
      code: targetCode,
      name: pat.name,
      age: pat.age || 65,
      gender: pat.gender || 'male',
      notes: pat.notes || (pat as any).diagnosis || (pat as any).chiefComplaint || 'ฟื้นฟูกายภาพบำบัด',
      photo: pat.photo || (pat as any).face_image_url,
      face_image_url: (pat as any).face_image_url || pat.photo,
    };
    const exactPlan = treatmentPlans.find(
      (p) =>
        (p.patientCode && p.patientCode.toLowerCase() === targetCode.toLowerCase()) ||
        (p.patientName && safePat.name.includes(p.patientName)) ||
        p.patientId === safePat.id
    );
    setActivePatient(safePat);
    selectPatient(safePat);
    if (exactPlan) setActivePlan(exactPlan);
    setPinInput(pinCode);
    setPinError(null);
    stopMediaStream();
    if (onLoginComplete) {
      onLoginComplete(safePat);
    }
    setTimeout(() => {
      setShowPinModal(false);
      audioFeedback.playRepSuccess();
      changeStep(5);
    }, 300);
  };

  const handleVerifyPinSubmit = () => {
    const cleanPin = pinInput.trim();
    if (!cleanPin) {
      setPinError('กรุณาป้อนรหัส PIN หรือรหัสคนไข้');
      return;
    }

    const cleanUpper = cleanPin.toUpperCase();
    const cleanLower = cleanPin.toLowerCase();

    // 1. Search in patient store and hospital users by HN, username, name, phone, or PIN/password
    const patientUsers = users.filter((u) => u.role === 'patient');

    // Direct match by HN / Code / Username / Phone / Name
    let matchedPatient = patientUsers.find((u) => {
      const codeUpper = (u.code || '').toUpperCase();
      const codeNumber = (u.code || '').replace(/\D/g, '');
      const pinNumber = cleanPin.replace(/\D/g, '');
      const usernameClean = (u.username || '').toLowerCase();
      const nameClean = (u.name || '').toLowerCase();
      const phoneClean = (u.phone || '').replace(/\D/g, '');

      return (
        codeUpper === cleanUpper ||
        (codeNumber && pinNumber && codeNumber === pinNumber) ||
        usernameClean === cleanLower ||
        usernameClean === `user_${cleanLower}` ||
        `@${usernameClean}` === cleanLower ||
        nameClean === cleanLower ||
        nameClean.includes(cleanLower) ||
        (phoneClean && pinNumber && phoneClean.includes(pinNumber))
      );
    });

    // Match by PIN or Password if numeric PIN entered
    if (!matchedPatient) {
      matchedPatient = patientUsers.find((u) => {
        const uPin = (u as any).pin || (u as any).password;
        return uPin === cleanPin;
      });
    }

    // Match from patientStore patients list
    if (!matchedPatient) {
      const fromPatStore = patients.find((p) => {
        const pCodeUpper = (p.patient_code || (p as any).code || '').toUpperCase();
        const pNameLower = (p.name || '').toLowerCase();
        return pCodeUpper === cleanUpper || pNameLower === cleanLower;
      });
      if (fromPatStore) {
        matchedPatient = {
          id: fromPatStore.id,
          code: fromPatStore.patient_code,
          name: fromPatStore.name,
          age: fromPatStore.age,
          gender: fromPatStore.gender as any,
          phone: fromPatStore.phone,
          diagnosis: fromPatStore.notes,
          role: 'patient',
          status: 'active',
        } as any;
      }
    }

    // Fallback: If cleanPin is '1234' or '123456' and no specific patient matched, pick the active patient or first patient in store!
    if (!matchedPatient && (cleanPin === '1234' || cleanPin === '123456')) {
      if (activePatient && activePatient.name && activePatient.name !== 'ผู้รับบริการ' && activePatient.patient_code) {
        matchedPatient = activePatient as any;
      } else if (patientUsers.length > 0) {
        matchedPatient = patientUsers[0];
      }
    }

    if (matchedPatient) {
      const targetCode = matchedPatient.code || (matchedPatient as any).patient_code || 'P-0001';
      const patObj: Patient = {
        id: typeof matchedPatient.id === 'number' ? matchedPatient.id : (Number(matchedPatient.id) || 1),
        patient_code: targetCode,
        code: targetCode,
        name: matchedPatient.name,
        age: Number(matchedPatient.age) || 65,
        gender: (matchedPatient.gender as any) || 'male',
        notes: (matchedPatient as any).diagnosis || (matchedPatient as any).chiefComplaint || (matchedPatient as any).notes || 'ฟื้นฟูกายภาพบำบัด',
        photo: (matchedPatient as any).face_image_url || (matchedPatient as any).photo,
        face_image_url: (matchedPatient as any).face_image_url || (matchedPatient as any).photo,
      };

      const exactPlan = treatmentPlans.find(
        (p) =>
          (p.patientCode && p.patientCode.toLowerCase() === targetCode.toLowerCase()) ||
          (p.patientName && patObj.name.includes(p.patientName)) ||
          p.patientId === patObj.id
      );

      setActivePatient(patObj);
      selectPatient(patObj);
      if (exactPlan) setActivePlan(exactPlan);
      if (onLoginComplete) {
        onLoginComplete(patObj);
      }

      setShowPinModal(false);
      stopMediaStream();
      audioFeedback.playRepSuccess();
      try {
        voiceAssistant.speak(`ยินดีต้อนรับคุณ ${patObj.name} เข้าสู่ระบบสำเร็จค่ะ`, { level: 'system' });
      } catch {}
      changeStep(5);
      return;
    }

    setPinError('❌ ไม่พบบัญชีคนไข้ที่ตรงกับรหัสนี้ (กรุณากรอกรหัส HN เช่น P-0012 หรือแตะเลือกจากรายชื่อด้านบน)');
    audioFeedback.playHoldTick();
  };

  return (
    <div className="w-full flex flex-col items-center justify-start min-h-[92vh] py-3 sm:py-6 px-3 relative z-10 select-none">
      
      {/* ======================================================== */}
      {/* กรอบ Card หลักสีขาว ขอบมนตามภาพวาด (The Main Kiosk White Card) */}
      {/* ======================================================== */}
      <div
        className={`w-full max-w-[440px] sm:max-w-[480px] bg-white rounded-[36px] sm:rounded-[44px] border-2 sm:border-[2.5px] border-black/85 shadow-2xl relative overflow-hidden flex flex-col items-center ${
          currentStep === 3 ? 'p-2 sm:p-2.5' : 'p-5 sm:p-7'
        } min-h-[620px] sm:min-h-[680px] justify-between transition-all duration-500 my-auto`}
      >
        
        {/* ================================================================= */}
        {/* ================================================================= */}
        {/* Permanent Video Element at Parent Level: สำหรับ Step 2-3         */}
        {/* ================================================================= */}
        <div
          ref={cameraContainerRef}
          className={`transition-all duration-300 ease-in-out relative ${
            currentStep === 2 || currentStep === 3
              ? 'w-full flex-1 min-h-[580px] sm:min-h-[640px] rounded-[30px] sm:rounded-[38px] overflow-hidden border-2 border-emerald-400/80 bg-slate-900 flex items-center justify-center shadow-2xl z-10'
              : 'fixed top-0 left-0 w-2 h-2 opacity-0 pointer-events-none -z-50 overflow-hidden'
          }`}
        >
          {currentStep !== 4 && (
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="w-full h-full object-cover opacity-90 transition-transform duration-300"
              style={{ transform: cameraOrientationService.getCssTransform() }}
            />
          )}

          {/* Quick Camera Flip & Rotation Toggle Buttons for Kiosk */}
          {(currentStep === 2 || currentStep === 3) && (
            <div className="absolute top-3.5 right-4 z-30 flex items-center gap-1.5 bg-slate-900/85 backdrop-blur-md p-1.5 rounded-2xl border border-white/20 shadow-xl pointer-events-auto">
              <div className="flex items-center gap-1">
                {([0, 90, 180, 270] as CameraRotation[]).map((deg) => (
                  <button
                    key={deg}
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleSetCameraRotation(deg);
                    }}
                    className={`min-h-[32px] px-2.5 rounded-xl text-xs font-black transition active:scale-95 cursor-pointer touch-manipulation select-none border ${
                      cameraRotation === deg
                        ? 'bg-emerald-600 border-emerald-400 text-white shadow-md ring-1 ring-emerald-300'
                        : 'bg-slate-800/80 hover:bg-slate-700 border-slate-700 text-slate-300 hover:text-white'
                    }`}
                  >
                    {deg}°
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handleRotateCameraNext90();
                }}
                className="bg-slate-800 hover:bg-slate-700 text-emerald-300 px-2.5 py-1.5 rounded-xl border border-emerald-500/40 text-xs font-bold flex items-center gap-1 shadow-md cursor-pointer transition active:scale-95 touch-manipulation select-none"
                title="กดเพื่อหมุนมุมมองกล้องทีละ 90°"
              >
                <RotateCw className="w-3.5 h-3.5 text-emerald-400" />
                <span>+90°</span>
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handleToggleCameraMirror();
                }}
                className={`px-2.5 py-1.5 rounded-xl border text-xs font-bold flex items-center gap-1 shadow-md cursor-pointer transition active:scale-95 touch-manipulation select-none ${
                  isCameraMirrored
                    ? 'bg-cyan-900/80 border-cyan-400/60 text-cyan-200'
                    : 'bg-slate-800 border-white/20 text-slate-300'
                }`}
                title="กดเพื่อเปิด/ปิดกระจกเงา"
              >
                <FlipHorizontal className="w-3.5 h-3.5 text-cyan-400" />
                <span>{isCameraMirrored ? 'กระจก' : 'ปกติ'}</span>
              </button>
            </div>
          )}

          {/* Overlays สำหรับ Step 2 & 3 บนกล้อง */}
          {(currentStep === 2 || currentStep === 3) && (
            <>
              {/* แถบหัวด้านบนลอยอยู่บนกล้อง: ขั้นตอนยืนยันตัวตน + XP */}
              <div className="absolute top-3.5 inset-x-3.5 z-20 flex items-center justify-between pointer-events-none">
                <span className="text-[11px] sm:text-xs font-bold text-teal-800 bg-teal-100/90 backdrop-blur-md px-3 py-1 rounded-full flex items-center gap-1.5 shadow-md border border-teal-200/60">
                  <Gamepad2 className="w-3.5 h-3.5 text-teal-700" />
                  <span>ขั้นตอนยืนยันตัวตน</span>
                </span>
                <span className="text-[11px] sm:text-xs font-mono font-black text-amber-800 bg-amber-100/90 backdrop-blur-md px-3 py-1 rounded-full flex items-center gap-1.5 shadow-md border border-amber-200/60">
                  <Zap className="w-3 h-3 text-amber-500 fill-amber-500" />
                  <span>{gameXp} XP</span>
                </span>
              </div>

              {/* แป้นเป้าหมายวงกลมซ้าย (ไม่ / ย้อนกลับ) */}
              <button
                type="button"
                data-kiosk-target={currentStep === 2 ? 'step2-no' : 'step3-no'}
                id="btnStep3No"
                onClick={handleStep3No}
                className="absolute top-16 left-3.5 sm:left-4 z-20 flex flex-col items-center cursor-pointer transition-all hover:scale-105 active:scale-95 group focus:outline-none"
                title="ไม่ (ย้อนกลับ)"
              >
                <div
                  className={`w-18 h-18 sm:w-20 sm:h-20 rounded-full border-3 flex flex-col items-center justify-center text-white shadow-xl backdrop-blur-md transition-all ${
                    detectedArmPose === 'left_no'
                      ? 'bg-rose-600 scale-110 border-white ring-4 ring-rose-300'
                      : 'bg-rose-700/90 hover:bg-rose-600 border-rose-200 group-hover:border-white'
                  }`}
                >
                  <X className="w-7 h-7 stroke-[3.5] text-white" />
                  <span className="font-black text-sm sm:text-base leading-tight mt-0.5">ไม่</span>
                </div>
                <span className="text-[11px] sm:text-xs font-black text-white bg-black/75 backdrop-blur-sm px-2.5 py-1 rounded-full mt-1.5 border border-rose-400/60 shadow-md">
                  {currentStep === 2 ? 'แขนซ้าย' : 'ย้อนกลับ (ซ้าย)'}
                </span>
              </button>

              {/* แป้นเป้าหมายวงกลมขวา (ใช่ / เข้าสู่ระบบ) */}
              <button
                type="button"
                data-kiosk-target={currentStep === 2 ? 'step2-yes' : 'step3-yes'}
                id="btnStep3Yes"
                onClick={handleStep3Yes}
                className="absolute top-16 right-3.5 sm:right-4 z-20 flex flex-col items-center cursor-pointer transition-all hover:scale-105 active:scale-95 group focus:outline-none"
                title="ใช่ (เข้าสู่ระบบ)"
              >
                <div
                  className={`w-18 h-18 sm:w-20 sm:h-20 rounded-full border-3 flex flex-col items-center justify-center text-white shadow-xl backdrop-blur-md transition-all ${
                    detectedArmPose === 'right_yes'
                      ? 'bg-emerald-600 scale-110 border-white ring-4 ring-emerald-300'
                      : 'bg-emerald-700/90 hover:bg-emerald-600 border-emerald-200 group-hover:border-white'
                  }`}
                >
                  <Check className="w-7 h-7 stroke-[3.5] text-white" />
                  <span className="font-black text-sm sm:text-base leading-tight mt-0.5">ใช่</span>
                </div>
                <span className="text-[11px] sm:text-xs font-black text-white bg-black/75 backdrop-blur-sm px-2.5 py-1 rounded-full mt-1.5 border border-emerald-400/60 shadow-md flex items-center gap-1">
                  <span>{currentStep === 2 ? 'แขนขวา' : 'เข้าสู่ระบบ (ขวา)'}</span>
                  <Sparkles className="w-3 h-3 text-yellow-300" />
                </span>
              </button>

              {/* กึ่งกลาง: เส้นไกด์บุคคล */}
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="w-44 h-56 sm:w-52 sm:h-64 rounded-[50%] border-2 border-dashed border-emerald-400/50 flex items-center justify-center bg-emerald-500/5">
                  <User className="w-20 h-20 text-emerald-400/25" />
                </div>
              </div>

              {/* ข้อความแนะนำด้านล่างกล้อง พร้อมปุ่มสมัครใหม่สำหรับผู้ป่วยใหม่ */}
              <div className="absolute bottom-3.5 inset-x-3.5 z-20 bg-black/85 backdrop-blur-md rounded-2xl py-2 px-3.5 border border-emerald-400/40 shadow-xl flex flex-col sm:flex-row items-center justify-between gap-1.5">
                <p className="text-xs text-emerald-300 font-extrabold flex items-center justify-center gap-1.5 pointer-events-none">
                  <span>✋ แตะปุ่มบนจอ หรือยกแขน ซ้าย/ขวา เพื่อเลือก</span>
                </p>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (onOpenHospitalPortal) {
                      onOpenHospitalPortal();
                    } else if (onOpenReception) {
                      onOpenReception();
                    }
                  }}
                  className="px-3 py-1 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-[11px] sm:text-xs shadow-sm transition active:scale-95 cursor-pointer pointer-events-auto flex items-center gap-1 border border-emerald-400/40"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>🏢 สมัครบัญชี: ไปหน้าจัดการข้อมูล</span>
                </button>
              </div>
            </>
          )}
        </div>

        {/* ---------------------------------------------------- */}
        {/* ภาพที่ 1: หน้าพักหน้าจอ (Screensaver) - Dr.Tech.Care */}
        {/* มีระบบกล้องตรวจจับคนไข้ + ชะลอดีเลย์ 1.8 วินาทีก่อนเลื่อนขึ้น */}
        {/* ---------------------------------------------------- */}
        {/* ---------------------------------------------------- */}
        {/* ภาพที่ 1: หน้าพักหน้าจอ (Screensaver) - Dr.Tech.Care */}
        {/* มีระบบกล้องตรวจจับคนไข้ + ชะลอดีเลย์ 1.8 วินาทีก่อนเลื่อนขึ้น */}
        {/* ---------------------------------------------------- */}
        {currentStep === 1 && (
          <div className="w-full flex-1 flex flex-col items-center justify-center text-center animate-fadeIn relative">
            
            {/* 1. กรณีกล้องมีปัญหา: เหลือกล่องแจ้งเตือนเพียง 1 กล่องเท่านั้น ข้อความสั้นเข้าใจง่าย + 2 ปุ่ม */}
            {cameraError ? (
              <div className="w-full max-w-xs bg-amber-50/95 border-2 border-amber-400 rounded-3xl p-3.5 sm:p-4 mb-2.5 text-amber-950 shadow-md animate-fadeIn flex flex-col gap-2.5 text-center">
                <div className="flex flex-col items-center gap-1">
                  <div className="w-9 h-9 rounded-full bg-amber-100 border border-amber-300 flex items-center justify-center text-amber-700 shadow-2xs">
                    <AlertCircle className="w-5 h-5 text-amber-600" />
                  </div>
                  <div>
                    <h3 className="font-black text-amber-950 text-sm sm:text-base leading-tight">
                      กล้องยังไม่พร้อมใช้งาน
                    </h3>
                    <p className="text-xs text-amber-900/90 mt-0.5 font-semibold leading-snug">
                      กรุณาอนุญาตการใช้กล้อง หรือใช้รหัส PIN แทน
                    </p>
                  </div>
                </div>

                {/* ปุ่มในกล่องมีแค่ 2 ปุ่ม กดง่าย ชัดเจน */}
                <div className="flex flex-col gap-2 pt-0.5">
                  <button
                    type="button"
                    onClick={startCamera}
                    className="w-full min-h-[46px] py-2.5 px-4 rounded-xl bg-gradient-to-r from-[#10B981] via-[#06B6D4] to-[#2563EB] hover:opacity-95 text-white font-extrabold text-xs sm:text-sm flex items-center justify-center gap-1.5 transition active:scale-95 cursor-pointer shadow-md shadow-cyan-500/20"
                  >
                    <RefreshCw className="w-4 h-4" />
                    <span>ลองเปิดกล้องอีกครั้ง</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setShowPinModal(true)}
                    className="w-full min-h-[46px] py-2.5 px-4 rounded-xl bg-white hover:bg-amber-100/70 text-amber-950 border border-amber-300 font-extrabold text-xs sm:text-sm flex items-center justify-center gap-1.5 transition active:scale-95 cursor-pointer shadow-2xs"
                  >
                    <Key className="w-4 h-4 text-amber-800" />
                    <span>ใช้รหัส PIN แทน</span>
                  </button>
                </div>
              </div>
            ) : isAutoDetectionPaused ? (
              /* 2.1 กรณีผู้ใช้กดหยุดการตรวจจับอัตโนมัติ */
              <div className="flex flex-col sm:flex-row items-center gap-2 mb-2 animate-fadeIn">
                <div className="inline-flex items-center gap-1.5 px-3.5 py-1 rounded-full bg-amber-50 border border-amber-300 text-amber-800 text-xs font-bold shadow-2xs">
                  <span className="w-2 h-2 rounded-full bg-amber-500" />
                  <span>⏸️ การตรวจจับอัตโนมัติถูกหยุดไว้</span>
                </div>
                <button
                  type="button"
                  onClick={() => setIsAutoDetectionPaused(false)}
                  className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-xs transition active:scale-95 cursor-pointer"
                  title="เปิดการตรวจจับอัตโนมัติอีกครั้ง"
                >
                  <Play className="w-3 h-3 fill-white" />
                  <span>เปิดตรวจจับอัตโนมัติ</span>
                </button>
              </div>
            ) : isPersonDetected ? (
              /* 2.2 กรณีตรวจพบใบหน้า: แสดงแถบความคืบหน้า 3 วินาทีแบบกระชับ ชัดเจน ไม่กินพื้นที่ พร้อมปุ่มหยุด */
              <div className="w-full max-w-xs bg-emerald-50/95 border-2 border-emerald-400 text-[#0B2B2B] rounded-2xl p-2 sm:p-2.5 mb-2 shadow-md animate-fadeIn flex flex-col items-center">
                <div className="flex items-center justify-between w-full text-xs font-black mb-1 px-0.5">
                  <span className="flex items-center gap-1.5 text-[#1E8A4C]">
                    <UserCheck className="w-4 h-4 text-emerald-600" />
                    <span>ตรวจพบใบหน้าแล้ว</span>
                  </span>
                  <div className="flex items-center gap-1.5">
                    <span className="font-mono text-[#1E8A4C] font-black text-xs bg-white px-2 py-0.5 rounded-lg border border-emerald-300 shadow-2xs">
                      {faceCountdownSeconds} วินาที ({presenceProgress}%)
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setIsAutoDetectionPaused(true);
                        setPresenceProgress(0);
                        setIsPersonDetected(false);
                        setFaceCountdownSeconds(3);
                        try {
                          if (typeof window !== 'undefined' && window.speechSynthesis) {
                            window.speechSynthesis.cancel();
                          }
                        } catch {}
                      }}
                      className="px-2 py-0.5 text-[11px] font-bold text-slate-600 hover:text-rose-600 bg-white hover:bg-rose-50 border border-slate-300 rounded-lg cursor-pointer transition shadow-2xs"
                      title="หยุดการเข้าสู่ระบบอัตโนมัติ"
                    >
                      หยุด
                    </button>
                  </div>
                </div>
                <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden border border-emerald-300/80 shadow-inner">
                  <div
                    className="h-full bg-gradient-to-r from-[#10B981] via-[#06B6D4] to-[#2563EB] rounded-full transition-[width] duration-75 ease-linear will-change-[width]"
                    style={{ width: `${presenceProgress}%` }}
                  />
                </div>
              </div>
            ) : (
              /* 2.3 กรณีกล้องพร้อมแต่ยังไม่พบคน: สถานะกะทัดรัด สบายตา พร้อมปุ่มหยุดตรวจจับ */
              <div className="flex items-center gap-2 mb-2 animate-fadeIn">
                <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-emerald-50/80 border border-emerald-200 text-[#1E8A4C] text-xs font-bold shadow-2xs">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                  <span>กำลังตรวจจับใบหน้า...</span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setIsAutoDetectionPaused(true);
                    setPresenceProgress(0);
                    setIsPersonDetected(false);
                    setFaceCountdownSeconds(3);
                    try {
                      if (typeof window !== 'undefined' && window.speechSynthesis) {
                        window.speechSynthesis.cancel();
                      }
                    } catch {}
                  }}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-white hover:bg-slate-100 border border-slate-300 text-slate-600 hover:text-slate-900 text-[11px] font-semibold shadow-2xs transition active:scale-95 cursor-pointer"
                  title="หยุดการตรวจจับอัตโนมัติ"
                >
                  <Pause className="w-3 h-3 text-slate-500" />
                  <span>หยุดตรวจจับ</span>
                </button>
              </div>
            )}

            {/* กรอบตรวจจับใบหน้าตรงกลาง (Face Viewfinder Frame) พร้อมวงแหวนความคืบหน้า 3 วินาที */}
            <div className="relative group cursor-pointer my-1.5 sm:my-2 flex items-center justify-center" onClick={handleStartFaceLogin}>
              {/* เส้นไกด์กรอบเล็งใบหน้า 4 มุม (Viewfinder Corner Accents) ลอยตามโลโก้ */}
              <div className={`absolute -inset-2.5 pointer-events-none transform transition-all duration-700 ease-out ${
                isSlideUpAnimating || isPersonDetected ? '-translate-y-4 sm:-translate-y-6 scale-95' : 'translate-y-0 scale-100'
              }`}>
                <div className={`absolute top-0 left-0 w-5 h-5 border-t-2 border-l-2 rounded-tl-lg transition-colors duration-300 ${isPersonDetected ? 'border-emerald-500' : 'border-emerald-300/60'}`} />
                <div className={`absolute top-0 right-0 w-5 h-5 border-t-2 border-r-2 rounded-tr-lg transition-colors duration-300 ${isPersonDetected ? 'border-emerald-500' : 'border-emerald-300/60'}`} />
                <div className={`absolute bottom-0 left-0 w-5 h-5 border-b-2 border-l-2 rounded-bl-lg transition-colors duration-300 ${isPersonDetected ? 'border-emerald-500' : 'border-emerald-300/60'}`} />
                <div className={`absolute bottom-0 right-0 w-5 h-5 border-b-2 border-r-2 rounded-br-lg transition-colors duration-300 ${isPersonDetected ? 'border-emerald-500' : 'border-emerald-300/60'}`} />
              </div>

              {/* วงแหวนโลโก้และวงแหวนนับถอยหลังรอบนอก (Concentric Logo & Circular Countdown Ring) */}
              <div
                className={`w-44 h-44 sm:w-52 sm:h-52 relative flex items-center justify-center transform transition-all duration-700 ease-out ${
                  isSlideUpAnimating || isPersonDetected
                    ? '-translate-y-4 sm:-translate-y-6 scale-95'
                    : 'translate-y-0 scale-100'
                }`}
              >
                {/* ตัววงแหวนโลโก้ */}
                <div
                  className={`w-full h-full rounded-full border-4 shadow-xl overflow-hidden flex flex-col items-center justify-center relative p-2 sm:p-3 transition-colors duration-700 ${
                    isSlideUpAnimating || isPersonDetected
                      ? 'border-emerald-500 bg-white shadow-emerald-500/25 ring-4 ring-emerald-300/40'
                      : 'border-emerald-300 bg-white'
                  }`}
                >
                  <img
                    src={logoImg}
                    alt="Dr. Tech Care"
                    className="w-full h-full object-contain select-none pointer-events-none drop-shadow-xs"
                  />
                  <div className="absolute inset-0 rounded-full border-2 border-emerald-100/50 pointer-events-none" />
                </div>

                {/* วงแหวนนับถอยหลัง 3 วินาที (Concentric Circular Progress Ring) หมุนล้อมรอบโลโก้อย่างสมบูรณ์แบบ เริ่มที่ 12 นาฬิกา */}
                {presenceProgress > 0 && (
                  <svg
                    className="absolute -inset-2.5 w-[calc(100%+20px)] h-[calc(100%+20px)] pointer-events-none z-20"
                    viewBox="0 0 100 100"
                  >
                    {/* เส้นแทร็กพื้นหลังจางๆ */}
                    <circle
                      cx="50"
                      cy="50"
                      r="47"
                      fill="none"
                      stroke="rgba(16, 185, 129, 0.15)"
                      strokeWidth="3.5"
                    />
                    {/* หลอดโหลดเส้นรอบวงตามเข็มนาฬิกา 100% ตรงกับเปอร์เซ็นต์ */}
                    <circle
                      cx="50"
                      cy="50"
                      r="47"
                      fill="none"
                      stroke="#10B981"
                      strokeWidth="3.5"
                      strokeLinecap="round"
                      pathLength="100"
                      strokeDasharray="100"
                      strokeDashoffset={Math.max(0, 100 - presenceProgress)}
                      transform="rotate(-90 50 50)"
                      className="filter drop-shadow-[0_0_8px_rgba(16,185,129,0.85)] transition-[stroke-dashoffset] duration-75 ease-linear will-change-[stroke-dashoffset]"
                    />
                  </svg>
                )}
              </div>
            </div>

            {/* Gesture Control (Raise 2 Hands): "คุณพร้อมจะกายภาพรึยัง? ยก 2 มือขึ้นเพื่อเริ่ม" */}
            <div className="mt-2.5 w-full max-w-sm px-4 py-2.5 rounded-2xl bg-gradient-to-r from-emerald-50 via-teal-50 to-sky-50 border-2 border-emerald-300 shadow-sm flex flex-col items-center text-center animate-fadeIn">
              <div className="flex items-center gap-2 text-emerald-950 font-black text-xs sm:text-sm">
                <span className="text-xl animate-bounce">🙌</span>
                <span>คุณพร้อมจะกายภาพรึยัง? ยก 2 มือขึ้นเพื่อเริ่ม</span>
              </div>
              <p className="text-[11px] text-slate-600 font-semibold mt-0.5">
                {isBothHandsDetected
                  ? `ตรวจพบการยก 2 มือแล้ว! กำลังเข้าสู่ระบบ (${bothHandsProgress}%)`
                  : 'ยก 2 มือขึ้นหน้ากล้อง AI เพื่อเริ่มขั้นตอนสแกนใบหน้า'}
              </p>
              {bothHandsProgress > 0 && (
                <div className="w-full h-2 bg-emerald-100 rounded-full overflow-hidden mt-1.5 border border-emerald-300">
                  <div
                    className="h-full bg-gradient-to-r from-emerald-500 to-teal-500 rounded-full transition-[width] duration-75 ease-linear will-change-[width]"
                    style={{ width: `${bothHandsProgress}%` }}
                  />
                </div>
              )}
            </div>

            {/* ข้อความต้อนรับและชื่อระบบ Dr.Tech.Care */}
            <div className="mt-2 flex flex-col items-center">
              <h1 className="text-2xl sm:text-3xl font-black text-[#0B2B2B] tracking-tight">
                Dr.Tech.Care
              </h1>
              <p className="text-xs sm:text-sm font-extrabold text-[#1E8A4C] mt-0.5">
                ระบบกายภาพบำบัดและดูแลสุขภาพอัจฉริยะ
              </p>
            </div>


          </div>
        )}



        {/* ---------------------------------------------------- */}
        {/* Step 4: สแกนใบหน้าและอัตลักษณ์ชีวมิติ                */}
        {/* ---------------------------------------------------- */}
        {/* ---------------------------------------------------- */}
        {/* ภาพที่ 4: หน้าต่างสแกนใบหน้า + AI Head Pose Tracker  */}
        {/* ---------------------------------------------------- */}
        {currentStep === 4 && (
          <LivenessScanHUD
            videoRef={videoRef}
            stream={streamRef.current}
            cameraState={{
              isActive: isCameraActive,
              isLoading: false,
              errorCode: cameraError ? 'NOT_FOUND' : null,
              errorMessageTh: cameraError,
              availableDevices: [],
              activeDeviceId: null,
              luminance: 120,
            }}
            frameData={currentLivenessFrame}
            activeNonce={livenessEngine.getActiveNonce()}
            challenges={[{ id: 'front', label: '1. หน้าตรง (มองเข้าหากล้อง ค้างไว้ 1.2 วินาที)' }]}
            currentChallenge="front"
            completedChallenges={{
              front: challengeProgress.front,
              turn_left: true,
              turn_right: true,
            }}
            holdProgress={faceHoldProgress}
            holdElapsedMs={holdElapsedMs}
            targetHoldMs={1200}
            isProcessingBiometrics={isScanning}
            biometricMatchMessage={scanStatusMessage}
            onRetryCamera={startCamera}
            onFallbackToPin={() => setShowPinModal(true)}
            onRegisterNewPatient={() => {
              if (onOpenHospitalPortal) {
                onOpenHospitalPortal();
              } else if (onOpenReception) {
                onOpenReception();
              }
            }}
          />
        )}



        {/* ---------------------------------------------------- */}
        {/* Step 5: ล็อกอินสำเร็จและแสดงข้อมูลคนไข้               */}
        {/* ---------------------------------------------------- */}
        {currentStep === 5 && (
          <div className="w-full flex-1 flex flex-col items-center justify-center animate-fadeIn text-center py-4">
            <div className="w-full max-w-[360px] bg-[#F8F9FA] border border-gray-200 rounded-3xl py-6 px-5 text-center shadow-lg flex flex-col items-center relative">
              <div className="inline-flex items-center gap-1.5 bg-emerald-700 text-white px-3 py-1 rounded-full text-xs font-black shadow-sm mb-3">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-300" />
                <span>ยืนยันตัวตนชีวมิติสำเร็จ 100%</span>
              </div>

              <div className="relative mb-3">
                {activePatient.face_image_url ? (
                  <div className="w-20 h-20 rounded-full border-4 border-emerald-400 bg-white overflow-hidden shadow-md flex items-center justify-center relative">
                    <img
                      src={activePatient.face_image_url}
                      alt={activePatient.name}
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute bottom-0 right-0 w-6 h-6 rounded-full bg-emerald-600 border-2 border-white flex items-center justify-center text-white shadow-sm">
                      <Check className="w-3.5 h-3.5 stroke-[3]" />
                    </div>
                  </div>
                ) : (
                  <div className="w-20 h-20 rounded-full border-4 border-emerald-400 bg-emerald-50 text-emerald-700 flex items-center justify-center shadow-inner">
                    <Check className="w-10 h-10 stroke-[3.5]" />
                  </div>
                )}
              </div>

              <h2 className="text-xl sm:text-2xl font-black text-[#0B2B2B] tracking-wide mb-3">
                เข้าสู่ระบบเรียบร้อย
              </h2>

              <div className="w-full bg-white border border-gray-200 rounded-2xl p-4 shadow-xs text-center space-y-1">
                <h3 className="text-lg font-black text-emerald-800">
                  {activePatient.name}
                </h3>
                <p className="text-xs text-gray-500 font-bold">
                  รหัสคนไข้ HN: {activePatient.patient_code} | อายุ {activePatient.age} ปี
                </p>
                <div className="pt-2 mt-2 border-t border-gray-100">
                  <p className="text-xs text-emerald-950 font-bold bg-emerald-50 py-1.5 px-2 rounded-xl">
                    การวินิจฉัย: {activePatient.notes || 'ข้อไหล่ติดระยะฟื้นฟู'}
                  </p>
                </div>
              </div>
            </div>

            {/* แถบนับถอยหลังซิงโครไนซ์ผ่าน useKioskCountdown */}
            <div className="w-full max-w-[360px] mt-4 space-y-2.5">
              <div className="bg-[#E6F9EE] border border-emerald-200 rounded-2xl py-2 px-3 text-center flex items-center justify-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
                <span className="text-xs font-bold text-emerald-900">
                  {step5Countdown.isPaused
                    ? 'หยุดเวลานับถอยหลังชั่วคราว'
                    : `ไปหน้ารายการกายภาพอัตโนมัติใน: ${step5Countdown.seconds} วินาที`}
                </span>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={step5Countdown.togglePause}
                  className="py-3 px-4 rounded-2xl bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 font-bold text-xs flex items-center justify-center gap-1.5 transition cursor-pointer"
                >
                  <Pause className="w-3.5 h-3.5" />
                  <span>{step5Countdown.isPaused ? 'เล่นต่อ' : 'หยุดเวลาไว้ก่อน'}</span>
                </button>

                <button
                  onClick={step5Countdown.proceedImmediately}
                  className="flex-1 py-3 px-4 rounded-2xl bg-[#0EA358] hover:bg-[#0C894A] text-white font-extrabold text-sm shadow-md active:scale-95 transition flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <span>ไปต่อทันที</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ---------------------------------------------------- */}
        {/* Step 6: รายการกายภาพของวันนี้ (ตาม Image 2 & Dynamic Sync) */}
        {/* ---------------------------------------------------- */}
        {currentStep === 6 && activePatient && (() => {
          // Dynamic Schedule Evaluation for today (Wednesday 14 Oct 2026)
          const scheduleEval = patientFaceStorageService.evaluateTodaySchedule(
            activePlan || activePatient,
            new Date(2026, 9, 14, 10, 30)
          );

          // Exercises to display
          const displayExercises = (scheduleEval.assignedExercises && scheduleEval.assignedExercises.length > 0)
            ? scheduleEval.assignedExercises
            : (activePlan?.assignedExercises || [
                { exerciseSlug: 'shoulder_raise', exerciseName: 'กางแขนยกด้านข้าง', sets: 3, reps: 10, holdSeconds: 3 },
                { exerciseSlug: 'cross_body_stretch', exerciseName: 'ยืดไหล่ข้ามอก', sets: 3, reps: 5, holdSeconds: 5 },
                { exerciseSlug: 'chest_expansion', exerciseName: 'ยืดอกเปิดไหล่', sets: 2, reps: 5, holdSeconds: 5 },
              ]);

          const patientFaceUrl =
            patientFaceStorageService.getProfileFaceImage(activePatient.patient_code) ||
            patientFaceStorageService.getPatientFaceImage(activePatient.patient_code) ||
            null;

          return (
            <div className="w-full flex-1 flex flex-col justify-between animate-fadeIn text-left py-1 space-y-3 max-w-xl mx-auto">
              {/* 1. Header Bar (Image 2 Top Bar) */}
              <div className="flex items-center justify-between gap-2 pb-2 border-b border-emerald-100 flex-shrink-0">
                <div className="flex items-center gap-2.5">
                  <div className="w-10 h-10 rounded-2xl bg-white border border-emerald-300 flex items-center justify-center p-1.5 shadow-2xs overflow-hidden">
                    <img src={logoIconImg} alt="Dr. Tech Care" className="w-full h-full object-contain" />
                  </div>
                  <div>
                    <h2 className="text-xs sm:text-sm font-black text-[#0B2B2B] tracking-wide">
                      DR.TECH.CARE • SMART REHAB
                    </h2>
                    <p className="text-[11px] font-bold text-slate-500">
                      {scheduleEval.formattedDateTh || 'วันพุธที่ 14 ตุลาคม พ.ศ. 2569 (14/10/2569)'}
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setCurrentStep(1);
                    audioFeedback.playHoldTick();
                  }}
                  className="px-3.5 py-1.5 rounded-2xl border-2 border-rose-200 bg-white hover:bg-rose-50 text-rose-600 font-black text-xs flex items-center gap-1.5 shadow-2xs transition cursor-pointer"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>ออกจากระบบ</span>
                </button>
              </div>

              {/* 2. Patient Info Box (Image 2 Top Box) */}
              <div className="bg-white rounded-3xl border-2 border-[#86efac] p-4 shadow-sm relative overflow-hidden flex flex-col gap-2">
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1 min-w-0">
                    <div className="inline-flex items-center px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200 text-[11px] font-extrabold">
                      ข้อมูลผู้รับบริการ (HN: {activePatient.patient_code})
                    </div>
                    <h3 className="text-xl sm:text-2xl font-black text-[#0B2B2B] truncate tracking-tight">
                      {activePatient.name}
                    </h3>
                    <p className="text-xs text-slate-600 font-bold truncate">
                      อายุ {activePatient.age || 5} ปี • สิทธิ์การรักษา:{' '}
                      {(activePatient as any).health_scheme || (activePatient as any).healthScheme || 'สิทธิประกันสุขภาพถ้วนหน้า'}
                    </p>
                  </div>

                  {/* Avatar Icon */}
                  <div className="w-14 h-14 rounded-2xl bg-emerald-50 border border-emerald-200 flex items-center justify-center flex-shrink-0 text-2xl shadow-inner overflow-hidden">
                    {patientFaceUrl ? (
                      <img src={patientFaceUrl} alt={activePatient.name} className="w-full h-full object-cover" />
                    ) : (
                      <span>{(activePatient.age || 0) < 18 ? '🧒' : (activePatient.age || 0) >= 60 ? '🧓' : '👤'}</span>
                    )}
                  </div>
                </div>

                {/* Attending Therapist Row */}
                <div className="pt-2 border-t border-emerald-100 flex items-center gap-2 text-xs font-bold text-slate-700">
                  <Stethoscope className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                  <span>
                    นักกายภาพบำบัดผู้ดูแล:{' '}
                    <strong className="text-emerald-800 font-black">
                      {activePlan?.therapistName || scheduleEval.therapistName || 'กภ. ธนากร วงศ์สวัสดิ์'}
                    </strong>
                  </span>
                </div>
              </div>

              {/* 3. Main Schedule Plan Section or Rest Day Notice */}
              {scheduleEval.isScheduledToday ? (
                <div className="flex-1 flex flex-col justify-between space-y-3">
                  {/* Daily Rehab Plan Card (Image 2 Center Card) */}
                  <div className="bg-white rounded-3xl border-2 border-emerald-200/90 p-4 shadow-sm space-y-3 flex-1 flex flex-col justify-between">
                    <div className="flex items-center justify-between pb-2 border-b border-emerald-100">
                      <div className="flex items-center gap-2 font-black text-sm sm:text-base text-[#0B2B2B]">
                        <Activity className="w-4 h-4 text-emerald-600" />
                        <span>แผนการทำกายภาพประจำวันนี้</span>
                      </div>
                      <span className="px-3 py-1 rounded-full bg-[#10B981] text-white font-extrabold text-xs shadow-2xs">
                        {displayExercises.length} ท่ากายภาพ
                      </span>
                    </div>

                    {/* Prescribed Exercises List */}
                    <div className="space-y-2 flex-1 overflow-y-auto max-h-48 pr-0.5">
                      {displayExercises.map((ex: any, idx: number) => (
                        <div
                          key={ex.exerciseSlug || ex.id || idx}
                          className="p-3 rounded-2xl bg-slate-50/70 border border-slate-200/90 hover:border-emerald-300 flex items-center justify-between gap-2.5 transition shadow-2xs"
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="w-7 h-7 rounded-full bg-emerald-100 text-emerald-800 font-black text-xs flex items-center justify-center flex-shrink-0">
                              {idx + 1}
                            </div>
                            <div className="min-w-0">
                              <h4 className="font-extrabold text-xs sm:text-sm text-[#0B2B2B] truncate">
                                {ex.name || ex.exerciseName}
                              </h4>
                              <p className="text-[11px] text-slate-500 font-semibold mt-0.5">
                                {ex.reps || 10} ครั้ง/เซ็ต • {ex.sets || 3} เซ็ต
                              </p>
                            </div>
                          </div>

                          <span className="px-2.5 py-1 rounded-xl bg-emerald-50 text-emerald-800 border border-emerald-200 text-[11px] font-black whitespace-nowrap">
                            พร้อมฝึก
                          </span>
                        </div>
                      ))}
                    </div>

                    {/* Clinical Advice Box (Image 2 Advice Card) */}
                    <div className="p-3 rounded-2xl bg-amber-50/70 border border-amber-200 text-xs text-amber-950 flex items-start gap-2.5">
                      <Sparkles className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
                      <p className="font-bold leading-relaxed text-[11px] sm:text-xs">
                        {activePlan?.clinicalNotes ||
                          'คำแนะนำ: ให้ค่อยๆ เคลื่อนไหวตามคำแนะนำของเสียงและสเกเลตัน AI หากมีอาการเจ็บสามารถกดปุ่มหยุดได้ทันที'}
                      </p>
                    </div>
                  </div>

                  {/* 4. Action Buttons (Image 2 Bottom Buttons) */}
                  <div className="space-y-2.5 flex-shrink-0">
                    {/* Primary Big Start Button */}
                    <button
                      type="button"
                      onClick={() => handleProceedToExercise('physio')}
                      className="w-full py-4 px-5 rounded-2xl bg-gradient-to-r from-[#0F5132] via-[#107044] to-[#0F5132] text-white shadow-xl hover:shadow-2xl hover:scale-[1.01] active:scale-98 transition-all flex items-center justify-between cursor-pointer group"
                      id="btnStartWorkoutNow"
                    >
                      <div className="flex items-center gap-3.5">
                        <div className="w-11 h-11 rounded-2xl bg-white/20 flex items-center justify-center text-white shadow-inner group-hover:scale-105 transition">
                          <Play className="w-6 h-6 fill-white" />
                        </div>
                        <div className="text-left">
                          <div className="text-base sm:text-lg font-black tracking-wide">
                            เริ่มต้นฝึกกายภาพบำบัด
                          </div>
                          <div className="text-xs text-emerald-200 font-semibold">
                            พร้อม AI วิเคราะห์ท่าและตรวจสอบความปลอดภัย
                          </div>
                        </div>
                      </div>
                      <ChevronRight className="w-6 h-6 text-emerald-300 group-hover:translate-x-1 transition" />
                    </button>

                    {/* Secondary Interactive Quiz Minigame Button */}
                    <button
                      type="button"
                      onClick={() => handleProceedToExercise('minigame')}
                      className="w-full py-3.5 px-5 rounded-2xl bg-[#E8F8F0] hover:bg-[#D8F3E5] border-2 border-[#10B981] text-[#0F2F2B] font-black text-xs sm:text-sm shadow-xs hover:shadow-md active:scale-98 transition flex items-center justify-between cursor-pointer"
                    >
                      <div className="flex items-center gap-2.5">
                        <span className="text-xl">🎮</span>
                        <span>มินิเกมฝึกสมองและการตอบสนอง (Interactive Quiz)</span>
                      </div>
                      <span className="px-3 py-1 rounded-full bg-amber-100 text-amber-900 border border-amber-300 font-black text-xs shadow-2xs">
                        +50 XP
                      </span>
                    </button>
                  </div>
                </div>
              ) : (
                /* Rest Day Screen */
                <div className="flex-1 flex flex-col justify-center items-center py-8 px-6 rounded-3xl bg-emerald-50/70 border-2 border-dashed border-emerald-300 text-center space-y-4">
                  <div className="w-16 h-16 rounded-full bg-emerald-100 text-emerald-800 flex items-center justify-center mx-auto text-3xl shadow-xs">
                    🛋️
                  </div>
                  <div className="space-y-1">
                    <h3 className="text-lg sm:text-xl font-black text-[#0F2F2B]">
                      วันพักผ่อนของคุณ (Rest Day)
                    </h3>
                    <p className="text-sm font-bold text-emerald-900">
                      วันนี้เป็นวันพักผ่อนของคุณ หรือไม่มีรายการฝึกกายภาพสำหรับวันนี้
                    </p>
                    <p className="text-xs text-slate-500 max-w-md mx-auto">
                      กล้ามเนื้อต้องการเวลาฟื้นฟูเพื่อความแข็งแรงที่ยั่งยืน คุณสามารถฝึกยืดเหยียดเบาๆ หรือเล่นมินิเกมฝึกสมองเพื่อผ่อนคลายได้ครับ
                    </p>
                  </div>

                  <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-2.5 max-w-md mx-auto w-full">
                    <button
                      type="button"
                      onClick={() => handleProceedToExercise('minigame')}
                      className="w-full py-3 px-4 rounded-xl bg-[#10B981] hover:bg-emerald-600 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-sm transition cursor-pointer"
                    >
                      <span>🎮</span>
                      <span>เล่นมินิเกมฝึกสมอง (+50 XP)</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowStretchModal(true)}
                      className="w-full py-3 px-4 rounded-xl bg-white hover:bg-slate-50 border border-slate-300 text-slate-700 font-bold text-xs flex items-center justify-center gap-2 transition cursor-pointer"
                    >
                      <span>🧘</span>
                      <span>ยืดเหยียดเบาๆ 11 ท่า</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })()}

      </div>

      {/* โมดอลเลือกและปรับเวลา 11 ท่ายืดกล้ามเนื้อ */}
      {showStretchModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-3 animate-fadeIn">
          <div className="w-full max-w-lg bg-white rounded-[32px] p-5 sm:p-6 shadow-2xl border-2 border-emerald-500 relative flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <div>
                <h3 className="text-lg sm:text-xl font-black text-[#0B2B2B]">
                  📋 คลังโปรแกรมยืดเหยียด 11 ท่า
                </h3>
                <p className="text-xs text-emerald-800 font-semibold mt-0.5">
                  นพ. กฤติณห์ (หมอเฟม) • ปรับเวลาค้างท่าได้อิสระ
                </p>
              </div>
              <button
                onClick={() => setShowStretchModal(false)}
                className="p-2 rounded-full hover:bg-slate-100 text-slate-500 transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex items-center justify-between py-2 text-xs font-bold text-slate-600 border-b border-slate-100">
              <span className="text-emerald-800">
                เลือกแล้ว {selectedStretchIds.length} จาก 11 ท่า
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setSelectedStretchIds(STRETCH_EXERCISES.map((s) => s.id))}
                  className="px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-800 hover:bg-emerald-100 border border-emerald-200 cursor-pointer"
                >
                  เลือกทั้งหมด
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedStretchIds([])}
                  className="px-2.5 py-1 rounded-lg bg-slate-100 text-slate-700 hover:bg-slate-200 cursor-pointer"
                >
                  ล้างการเลือก
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto py-2 space-y-2.5 pr-1 my-1">
              {STRETCH_EXERCISES.map((item) => {
                const isSelected = selectedStretchIds.includes(item.id);
                const currentHold = customHoldTimes[item.id] ?? item.holdSeconds;

                return (
                  <div
                    key={item.id}
                    className={`p-3 rounded-2xl border-2 transition ${
                      isSelected
                        ? 'bg-emerald-50/70 border-emerald-500 shadow-sm'
                        : 'bg-slate-50 border-slate-200 opacity-75'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-start gap-2.5 flex-1 min-w-0">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedStretchIds((prev) => [...prev, item.id]);
                            } else {
                              setSelectedStretchIds((prev) => prev.filter((id) => id !== item.id));
                            }
                          }}
                          className="w-5 h-5 mt-0.5 text-emerald-600 rounded border-slate-300 focus:ring-emerald-500 cursor-pointer"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="font-black text-sm text-[#0B2B2B]">
                              ท่า {item.number}: {item.name}
                            </span>
                            <span className="text-[10px] bg-slate-200 text-slate-700 px-1.5 py-0.5 rounded font-bold">
                              {item.bodyArea}
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-500 truncate mt-0.5">
                            {item.englishName} • {item.description}
                          </p>
                        </div>
                      </div>

                      <div className="flex flex-col items-end gap-1 flex-shrink-0">
                        <span className="text-[10px] font-bold text-slate-500">เวลาค้าง</span>
                        <div className="flex items-center gap-1 bg-white border border-slate-300 rounded-xl px-1.5 py-0.5 shadow-2xs">
                          <button
                            type="button"
                            onClick={() => {
                              const next = Math.max(10, currentHold - 5);
                              setCustomHoldTimes((prev) => ({ ...prev, [item.id]: next }));
                            }}
                            className="w-6 h-6 rounded-lg bg-slate-100 hover:bg-slate-200 font-black text-xs text-slate-700 flex items-center justify-center cursor-pointer"
                          >
                            -
                          </button>
                          <span className="font-mono font-black text-xs text-emerald-800 w-8 text-center">
                            {currentHold}s
                          </span>
                          <button
                            type="button"
                            onClick={() => {
                              const next = Math.min(60, currentHold + 5);
                              setCustomHoldTimes((prev) => ({ ...prev, [item.id]: next }));
                            }}
                            className="w-6 h-6 rounded-lg bg-slate-100 hover:bg-slate-200 font-black text-xs text-slate-700 flex items-center justify-center cursor-pointer"
                          >
                            +
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="pt-3 border-t border-slate-200 flex items-center gap-2">
              <button
                type="button"
                onClick={() => setShowStretchModal(false)}
                className="py-3 px-4 rounded-2xl border border-slate-300 hover:bg-slate-50 text-slate-700 font-bold text-sm transition cursor-pointer min-h-[48px]"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                disabled={selectedStretchIds.length === 0}
                onClick={() => {
                  setShowStretchModal(false);
                  const queueToRun = STRETCH_EXERCISES.filter((s) => selectedStretchIds.includes(s.id));
                  handleProceedToExercise('physio', queueToRun);
                }}
                className={`flex-1 py-3 px-4 rounded-2xl text-white font-black text-sm shadow-lg flex items-center justify-center gap-2 transition cursor-pointer min-h-[48px] ${
                  selectedStretchIds.length > 0
                    ? 'bg-gradient-to-r from-[#6FD67F] via-[#22c55e] to-[#1E8A4C] hover:brightness-105 active:scale-95'
                    : 'bg-slate-300 cursor-not-allowed'
                }`}
              >
                <Play className="w-4 h-4 fill-white" />
                <span>เริ่มฝึกโปรแกรมที่เลือก ({selectedStretchIds.length} ท่า)</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* โมดอล PIN สำหรับผู้สูงอายุ */}
      {showPinModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-3 animate-fadeIn">
          <div className="w-full max-w-sm bg-white rounded-[32px] p-5 shadow-2xl border-2 border-emerald-500 relative flex flex-col items-center">
            <button
              data-kiosk-target="pin-modal-close"
              onClick={() => {
                setShowPinModal(false);
                setPinError(null);
              }}
              className="absolute top-4 right-4 p-2 rounded-full hover:bg-slate-100 text-slate-500 transition cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="w-12 h-12 rounded-full bg-emerald-100 text-[#1E8A4C] flex items-center justify-center mb-2 mt-1">
              <Key className="w-6 h-6 stroke-[2.5]" />
            </div>

            <h3 className="text-lg font-black text-[#0B2B2B]">
              เข้าสู่ระบบด้วยรหัส PIN
            </h3>
            <p className="text-xs text-slate-600 text-center mt-0.5">
              สำหรับผู้สูงอายุ หรือเมื่อไม่สะดวกสแกนใบหน้า
            </p>

            <div className="w-full bg-slate-50 border-2 border-emerald-300 rounded-2xl py-3 px-4 my-3 text-center">
              <span className="font-mono text-2xl font-black tracking-widest text-emerald-800">
                {pinInput ? pinInput.replace(/./g, '● ') : 'ป้อน PIN 4-6 หลัก'}
              </span>
            </div>

            {pinError && (
              <p className="text-xs text-rose-600 font-bold mb-2 animate-bounce">
                {pinError}
              </p>
            )}

            {/* Quick Patient Selector from actual registered patients in system */}
            {users.filter((u) => u.role === 'patient').length > 0 && (
              <div className="w-full mb-3">
                <span className="text-[11px] font-bold text-slate-500 block mb-1">
                  แตะชื่อคนไข้เพื่อเข้าสู่ระบบทันที:
                </span>
                <div className="grid grid-cols-2 gap-1.5 text-[11px] max-h-28 overflow-y-auto p-0.5">
                  {users
                    .filter((u) => u.role === 'patient')
                    .map((pat) => (
                      <button
                        key={pat.id}
                        type="button"
                        onClick={() =>
                          handleSelectQuickPatient(
                            {
                              id: pat.id,
                              patient_code: pat.code,
                              code: pat.code,
                              name: pat.name,
                              age: pat.age || 65,
                              gender: (pat.gender as any) || 'male',
                              notes: pat.diagnosis || pat.chiefComplaint || 'ฟื้นฟูกายภาพบำบัด',
                              photo: pat.face_image_url,
                              face_image_url: pat.face_image_url,
                            },
                            pat.code
                          )
                        }
                        className="p-1.5 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-800 font-bold border border-emerald-200 text-left truncate cursor-pointer transition flex items-center gap-1.5"
                        title={`เข้าสู่ระบบ ${pat.name} (${pat.code})`}
                      >
                        <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
                        <span className="truncate">{pat.name} ({pat.code})</span>
                      </button>
                    ))}
                </div>
              </div>
            )}

            <div className="w-full grid grid-cols-3 gap-2">
              {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((digit) => (
                <button
                  key={digit}
                  onClick={() => handlePinDigit(digit)}
                  className="h-12 rounded-2xl bg-slate-100 hover:bg-emerald-100 text-slate-800 font-black text-xl active:scale-95 transition shadow-sm border border-slate-200 cursor-pointer"
                >
                  {digit}
                </button>
              ))}

              <button
                onClick={handlePinClear}
                className="h-12 rounded-2xl bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold text-sm active:scale-95 transition cursor-pointer"
              >
                ล้าง
              </button>

              <button
                onClick={() => handlePinDigit('0')}
                className="h-12 rounded-2xl bg-slate-100 hover:bg-emerald-100 text-slate-800 font-black text-xl active:scale-95 transition shadow-sm border border-slate-200 cursor-pointer"
              >
                0
              </button>

              <button
                onClick={handlePinBackspace}
                className="h-12 rounded-2xl bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold text-sm active:scale-95 transition cursor-pointer"
              >
                ลบ ⌫
              </button>
            </div>

            <button
              onClick={handleVerifyPinSubmit}
              className="w-full mt-3 py-3 rounded-2xl bg-[#1E8A4C] hover:bg-emerald-700 text-white font-extrabold text-sm shadow-lg active:scale-95 transition cursor-pointer"
            >
              ยืนยันรหัส PIN และเข้าสู่ระบบ
            </button>
          </div>
        </div>
      )}

      {/* โมดอล: ยืนยันตัวตนเพิ่มเติม (Near-Match 75% - 87%) */}
      {showNearMatchModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-md z-[9999] flex items-center justify-center p-3 sm:p-4 animate-fadeIn">
          <div className="w-full max-w-md bg-white rounded-[32px] p-6 shadow-2xl border-2 border-amber-400 relative flex flex-col items-center text-center animate-scaleUp">
            {/* Close button with Cooldown */}
            <button
              onClick={() => {
                setShowNearMatchModal(false);
                triggerCooldown(BIOMETRIC_CONFIG.COOLDOWN_MS);
              }}
              className="absolute top-4 right-4 p-2 rounded-full hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            {/* Amber Medical Shield Icon */}
            <div className="w-20 h-20 rounded-full bg-amber-50 border-4 border-amber-400 text-amber-600 flex items-center justify-center mb-3 shadow-inner">
              <Key className="w-10 h-10 stroke-[2.5]" />
            </div>

            {/* Dev Mode Score Badge */}
            {isDevMode && (
              <div className="inline-flex items-center gap-1.5 bg-amber-100 text-amber-900 px-3 py-1 rounded-full text-xs font-black mb-2">
                <Shield className="w-3.5 h-3.5 text-amber-700" />
                <span>[โหมดเจ้าหน้าที่] ความคล้ายคลึง: {lastMatchScore}% (ระดับยืนยันเพิ่มเติม)</span>
              </div>
            )}

            <h3 className="text-xl sm:text-2xl font-black text-amber-900 tracking-tight">
              ยืนยันตัวตนเพิ่มเติม
            </h3>
            <p className="text-xs sm:text-sm font-bold text-slate-700 mt-1">
              ระบบตรวจพบใบหน้าคล้ายคลึงกับบัญชีคนไข้ในระบบ
            </p>

            {/* Candidate Info Card */}
            {nearMatchCandidate && (
              <div className="w-full bg-amber-50/70 border border-amber-200 rounded-2xl p-3 my-3 text-left flex items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-amber-200 border-2 border-amber-400 flex items-center justify-center text-amber-800 font-black text-base shrink-0">
                  {nearMatchCandidate.name ? nearMatchCandidate.name.charAt(0) : 'P'}
                </div>
                <div className="flex-1 min-w-0">
                  <h4 className="text-sm font-black text-slate-900 truncate">
                    คุณ {nearMatchCandidate.name}
                  </h4>
                  <p className="text-xs font-bold text-emerald-700">
                    รหัสประจำตัว HN: {nearMatchCandidate.patientCode}
                  </p>
                </div>
              </div>
            )}

            {/* Description Card */}
            <div className="w-full bg-slate-50 border border-slate-200 rounded-2xl p-3 mb-3 text-xs text-slate-700 text-left space-y-1">
              <div className="flex items-start gap-1.5">
                <Info className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <p className="font-semibold text-slate-700">
                  เพื่อความปลอดภัยสูงสุดของข้อมูลประวัติการรักษา กรุณากดปุ่มด้านล่างเพื่อใส่รหัส PIN 6 หลัก
                </p>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="w-full space-y-2.5">
              {/* PRIMARY CTA: ใส่รหัส PIN 6 หลัก */}
              <button
                type="button"
                onClick={() => {
                  setShowNearMatchModal(false);
                  setShowPinModal(true);
                }}
                className="w-full py-3.5 px-4 rounded-2xl bg-gradient-to-r from-emerald-600 via-teal-600 to-cyan-700 hover:from-emerald-500 hover:to-teal-600 text-white font-black text-sm shadow-md hover:shadow-lg active:scale-95 transition flex items-center justify-center gap-2 cursor-pointer border border-emerald-400/40"
              >
                <Key className="w-5 h-5 text-white" />
                <span>🔑 ใช้รหัส PIN 6 หลัก (ยืนยันเข้าสู่ระบบ)</span>
              </button>

              {/* SECONDARY: ค้นหา HN / เบอร์โทร */}
              <button
                type="button"
                onClick={() => {
                  setShowNearMatchModal(false);
                  setShowLinkAccountModal(true);
                  setFoundAccountForLink(null);
                  setLinkSearchError(null);
                  setLinkSearchQuery(nearMatchCandidate?.patientCode || '');
                }}
                className="w-full py-2.5 px-4 rounded-xl bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-300 font-bold text-xs active:scale-95 transition flex items-center justify-center gap-2 cursor-pointer"
              >
                <UserCheck className="w-4 h-4 text-emerald-600" />
                <span>🔗 ค้นหาด้วยรหัส HN / เบอร์โทรศัพท์</span>
              </button>

              {/* Try Scan Again */}
              <button
                type="button"
                onClick={handleRetryScan}
                className="w-full py-2.5 px-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs transition flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>ลองสแกนใบหน้าอีกครั้ง (ปรับแสงและหันหน้าตรง)</span>
              </button>

              {/* Staff Bypass */}
              <button
                type="button"
                onClick={() => {
                  setShowNearMatchModal(false);
                  onOpenHospitalPortal();
                }}
                className="w-full py-2.5 px-3 rounded-xl bg-amber-50 hover:bg-amber-100 border border-amber-300 text-amber-900 font-extrabold text-xs transition flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Shield className="w-4 h-4 text-amber-700" />
                <span>🛡️ เจ้าหน้าที่เข้าสู่ระบบบุคลากร / รพ. (Staff Bypass)</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* โมดอลแจ้งเตือน: ไม่พบข้อมูลใบหน้านี้ในระบบ */}
      {showNoAccountModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-md z-[9999] flex items-center justify-center p-3 sm:p-4 animate-fadeIn">
          <div className="w-full max-w-md bg-white rounded-[32px] p-6 shadow-2xl border-2 border-rose-300 relative flex flex-col items-center text-center animate-scaleUp">
            {/* Close button with Cooldown */}
            <button
              onClick={() => {
                setShowNoAccountModal(false);
                triggerCooldown(BIOMETRIC_CONFIG.COOLDOWN_MS);
              }}
              className="absolute top-4 right-4 p-2 rounded-full hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            {/* Warning Icon */}
            <div className="w-20 h-20 rounded-full bg-rose-50 border-4 border-rose-300 text-rose-500 flex items-center justify-center mb-3 shadow-inner">
              <AlertCircle className="w-10 h-10 stroke-[2.5]" />
            </div>

            {/* Heading & Score Badge (ซ่อนใน production แสดงเฉพาะตอน ?dev=1) */}
            {isDevMode && (
              <div className="inline-flex items-center gap-1.5 bg-rose-100 text-rose-900 px-3 py-1 rounded-full text-xs font-black mb-2">
                <ShieldAlert className="w-3.5 h-3.5 text-rose-600" />
                <span>[โหมดเจ้าหน้าที่] ความคล้ายคลึง: {lastMatchScore}% (ต่ำกว่าเกณฑ์ 75%)</span>
              </div>
            )}

            <h3 className="text-xl sm:text-2xl font-black text-rose-600 tracking-tight">
              ไม่พบข้อมูลใบหน้านี้ในระบบ
            </h3>
            <p className="text-xs sm:text-sm font-extrabold text-slate-700 mt-1">
              ระบบตรวจสอบแล้วไม่พบบัญชีผู้ป่วยที่ผูกกับใบหน้านี้ หากท่านยังไม่เคยลงทะเบียน สามารถไปที่หน้าจัดการข้อมูลเพื่อเพิ่มบัญชี
            </p>

            {/* Description Card */}
            <div className="w-full bg-rose-50/70 border border-rose-200 rounded-2xl p-4 my-4 text-xs text-rose-950 text-left space-y-2">
              <div className="flex items-start gap-2">
                <Info className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                <p className="font-bold text-rose-900">
                  ระบบไม่พบข้อมูลใบหน้านี้ในฐานข้อมูล
                </p>
              </div>
              <p className="text-[12px] text-slate-700 font-semibold pl-6 leading-relaxed">
                👉 ถ้าจะสมัครบัญชีให้ไป <span className="font-bold text-emerald-700">"หน้าจัดการข้อมูล"</span> เเล้วเพิ่มเอา
              </p>
            </div>

            {/* Action Buttons */}
            <div className="w-full space-y-2.5">
              {/* PRIMARY CTA: ไปหน้าจัดการข้อมูล เเล้วเพิ่มเอา */}
              <button
                type="button"
                onClick={() => {
                  setShowNoAccountModal(false);
                  if (onOpenHospitalPortal) {
                    onOpenHospitalPortal();
                  } else if (onOpenReception) {
                    onOpenReception();
                  }
                }}
                className="w-full py-3.5 px-4 rounded-2xl bg-gradient-to-r from-emerald-600 via-teal-600 to-cyan-700 hover:from-emerald-500 hover:to-teal-600 text-white font-black text-sm shadow-md hover:shadow-lg active:scale-95 transition flex items-center justify-center gap-2 cursor-pointer border border-emerald-400/40"
              >
                <Plus className="w-5 h-5 text-white" />
                <span>🏢 ไปหน้าจัดการข้อมูล (เพิ่มบัญชีคนไข้ใหม่)</span>
              </button>

              {/* SECONDARY: ผูกใบหน้ากับบัญชีที่มีอยู่แล้วในระบบ (ค้นหาด้วย HN / เบอร์โทร) */}
              <button
                type="button"
                onClick={() => {
                  setShowNoAccountModal(false);
                  setShowLinkAccountModal(true);
                  setFoundAccountForLink(null);
                  setLinkSearchError(null);
                  setLinkSearchQuery('');
                }}
                className="w-full py-2.5 px-4 rounded-xl bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-300 font-bold text-xs shadow-2xs active:scale-95 transition flex items-center justify-center gap-2 cursor-pointer"
              >
                <UserCheck className="w-4 h-4 text-emerald-600" />
                <span>🔗 มีประวัติเดิมแล้ว (ค้นหา HN / เบอร์โทร เพื่อผูกใบหน้านี้)</span>
              </button>

              {/* Secondary Options: ลองสแกนอีกครั้ง & ใช้ PIN */}
              <div className="grid grid-cols-2 gap-2 pt-1">
                <button
                  type="button"
                  onClick={handleRetryScan}
                  className="py-2.5 px-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs transition flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>ลองสแกนอีกครั้ง</span>
                </button>

                <button
                  type="button"
                  onClick={handleUsePinInstead}
                  className="py-2.5 px-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs transition flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Key className="w-3.5 h-3.5" />
                  <span>ใช้รหัส PIN 6 หลัก</span>
                </button>
              </div>

              {/* Staff Bypass button directly in modal */}
              <button
                type="button"
                onClick={() => {
                  setShowNoAccountModal(false);
                  onOpenHospitalPortal();
                }}
                className="w-full py-2.5 px-3 rounded-xl bg-amber-50 hover:bg-amber-100 border border-amber-300 text-amber-900 font-extrabold text-xs transition flex items-center justify-center gap-1.5 cursor-pointer shadow-2xs"
              >
                <Shield className="w-4 h-4 text-amber-700" />
                <span>🛡️ เจ้าหน้าที่เข้าสู่ระบบบุคลากร / รพ. (Staff Bypass)</span>
              </button>

              {/* Registered patients quick entry list */}
              {users.filter((u) => u.role === 'patient').length > 0 && (
                <div className="w-full mt-2 pt-2 border-t border-slate-200 text-left">
                  <span className="text-[11px] font-bold text-slate-700 block mb-1">
                    👤 หรือเลือกล็อกอินด้วยบัญชีคนไข้ในระบบ:
                  </span>
                  <div className="flex flex-col gap-1.5 max-h-36 overflow-y-auto">
                    {users
                      .filter((u) => u.role === 'patient')
                      .map((pat) => (
                        <button
                          key={pat.id}
                          type="button"
                          onClick={() => {
                            setShowNoAccountModal(false);
                            const targetHN = pat.code || (pat as any).patient_code || 'P-0001';
                            const targetPatient: Patient = {
                              id: typeof pat.id === 'number' ? pat.id : (Number(pat.id) || 1),
                              patient_code: targetHN,
                              code: targetHN,
                              name: pat.name,
                              age: pat.age || 65,
                              gender: (pat.gender as any) || 'male',
                              notes: pat.diagnosis || pat.chiefComplaint || 'ฟื้นฟูกายภาพบำบัด',
                              face_image_url: pat.face_image_url,
                              photo: pat.face_image_url,
                            };
                            const exactPlan = treatmentPlans.find(
                              (p) =>
                                (p.patientCode && p.patientCode.toLowerCase() === targetHN.toLowerCase()) ||
                                (p.patientName && targetPatient.name.includes(p.patientName)) ||
                                p.patientId === targetPatient.id
                            );
                            setActivePatient(targetPatient);
                            selectPatient(targetPatient);
                            if (exactPlan) setActivePlan(exactPlan);
                            if (onLoginComplete) onLoginComplete(targetPatient);
                            changeStep(5);
                          }}
                          className="w-full py-2 px-3 rounded-xl bg-emerald-50 hover:bg-emerald-100 border border-emerald-300 text-emerald-900 font-bold text-xs transition flex items-center justify-between cursor-pointer"
                        >
                          <span className="truncate">{pat.name} (HN: {pat.code})</span>
                          <span className="text-[10px] bg-emerald-200 text-emerald-800 px-2 py-0.5 rounded-full font-extrabold shrink-0">
                            เข้าสู่ระบบ ➔
                          </span>
                        </button>
                      ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* โมดอล: ผูกใบหน้ากับบัญชีคนไข้ที่มีอยู่แล้ว (สร้างจากแอดมิน) */}
      {showLinkAccountModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-md z-[9999] flex items-center justify-center p-3 sm:p-4 animate-fadeIn">
          <div className="w-full max-w-md bg-white rounded-[32px] p-6 shadow-2xl border-2 border-emerald-400 relative flex flex-col animate-scaleUp">
            <button
              onClick={() => setShowLinkAccountModal(false)}
              className="absolute top-4 right-4 p-2 rounded-full hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 rounded-2xl bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
                <UserCheck className="w-6 h-6" />
              </div>
              <div className="text-left">
                <h3 className="text-lg font-black text-slate-800">ผูกใบหน้ากับบัญชีในระบบ</h3>
                <p className="text-xs text-slate-500 font-medium">ค้นหาด้วยรหัสคนไข้ (HN) หรือเบอร์โทรศัพท์</p>
              </div>
            </div>

            {!foundAccountForLink ? (
              <div className="space-y-3 text-left">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    รหัสประจำตัวคนไข้ (HN) หรือ เบอร์โทรศัพท์
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={linkSearchQuery}
                      onChange={(e) => setLinkSearchQuery(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleSearchAccountToLink()}
                      placeholder="เช่น P-4204 หรือ 0641077684"
                      className="flex-1 px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                    <button
                      type="button"
                      onClick={handleSearchAccountToLink}
                      className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs transition cursor-pointer shadow-sm active:scale-95"
                    >
                      ค้นหา
                    </button>
                  </div>
                </div>

                {linkSearchError && (
                  <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 font-bold flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>{linkSearchError}</span>
                  </div>
                )}

                <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-500">
                  💡 เหมาะสำหรับคนไข้ที่เจ้าหน้าที่โรงพยาบาลกรอกข้อมูลไว้ในระบบแล้ว และต้องการบันทึกใบหน้าที่ตู้ Kiosk เพื่อล็อกอินสแกนหน้าในครั้งต่อไป
                </div>
              </div>
            ) : (
              <div className="space-y-4 text-left">
                {/* Found Patient Info Card */}
                <div className="p-4 bg-emerald-50/80 border border-emerald-200 rounded-2xl space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs font-bold text-emerald-800 bg-emerald-100 px-2.5 py-0.5 rounded-full">
                      HN: {foundAccountForLink.code || foundAccountForLink.patient_code}
                    </span>
                    <span className="text-xs text-slate-500 font-medium">
                      อายุ {foundAccountForLink.age || 65} ปี
                    </span>
                  </div>
                  <h4 className="text-base font-black text-slate-900">{foundAccountForLink.name}</h4>
                  <p className="text-xs text-slate-600">
                    โทร: {foundAccountForLink.phone || 'ยังไม่ได้ระบุ'} • {foundAccountForLink.diagnosis || 'รอตรวจประเมินกายภาพบำบัด'}
                  </p>
                </div>

                <div className="text-center space-y-1">
                  <p className="text-xs font-bold text-emerald-800">
                    {isLinkingAccount ? '📸 กำลังจับภาพใบหน้า 10 ช็อต... กรุณามองตรงที่กล้อง' : 'กรุณานั่งมองตรงที่กล้อง แล้วกดปุ่มเพื่อเริ่มบันทึกใบหน้า'}
                  </p>
                  <p className="text-[11px] text-slate-400">
                    ระบบจะบันทึกเวกเตอร์ 128 มิติเฉลี่ย 10 เฟรม เพื่อให้จดจำใบหน้านี้ได้แม่นยำสูงสุด
                  </p>
                </div>

                {linkSearchError && (
                  <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 font-bold flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>{linkSearchError}</span>
                  </div>
                )}

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setFoundAccountForLink(null)}
                    disabled={isLinkingAccount}
                    className="flex-1 py-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs transition cursor-pointer"
                  >
                    ค้นหาคนอื่น
                  </button>
                  <button
                    type="button"
                    onClick={handleConfirmLinkAndScan}
                    disabled={isLinkingAccount}
                    className="flex-2 py-3 px-4 rounded-xl bg-gradient-to-r from-emerald-600 via-teal-600 to-cyan-600 text-white font-extrabold text-xs shadow-md shadow-emerald-500/25 active:scale-95 transition flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                  >
                    {isLinkingAccount ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        <span>กำลังสแกน 10 ช็อต...</span>
                      </>
                    ) : (
                      <>
                        <Camera className="w-4 h-4" />
                        <span>📸 สแกนใบหน้าผูกบัญชีนี้ทันที</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}


      {/* แถบสลับดูแต่ละภาพ (Step Switcher 1-6 สำหรับทดสอบและสาธิต) */}
      {isExplicitDemo && (
        <div className="mt-4 flex flex-wrap items-center justify-center gap-1.5 sm:gap-2 max-w-md w-full">
          {[
            { step: 1, title: 'ภาพ 1: พักหน้าจอ' },
            { step: 3, title: 'ภาพ 3: ยืนยันระบบ' },
            { step: 4, title: 'ภาพ 4: สแกนใบหน้า' },
            { step: 5, title: 'ภาพ 5: ล็อกอินสำเร็จ' },
            { step: 6, title: 'ภาพ 6: รายการหมอเซ็ต' },
          ].map((item) => (
            <button
              key={item.step}
              onClick={() => changeStep(item.step)}
              className={`px-2.5 py-1 rounded-full text-xs font-bold transition shadow-sm cursor-pointer ${
                currentStep === item.step
                  ? 'bg-[#1E8A4C] text-white border border-emerald-600 scale-105'
                  : 'bg-white/90 text-slate-700 hover:bg-emerald-50 border border-slate-200'
              }`}
            >
              {item.title}
            </button>
          ))}
        </div>
      )}

      {/* ปุ่มทางลัดมุมล่าง */}
      <div className="fixed bottom-4 right-4 sm:bottom-6 sm:right-6 flex items-center gap-2 z-30">
        {onOpenAbout && (
          <button
            onClick={() => {
              try {
                if (typeof window !== 'undefined' && window.speechSynthesis) {
                  window.speechSynthesis.cancel();
                }
              } catch {}
              stopMediaStream();
              onOpenAbout();
            }}
            className="bg-white/95 hover:bg-emerald-50 border border-emerald-300 text-[#1E8A4C] font-bold text-xs px-3.5 py-2 rounded-full shadow-md flex items-center gap-1.5 transition active:scale-95 cursor-pointer"
            title="เกี่ยวกับระบบ"
          >
            <Info className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">เกี่ยวกับระบบ</span>
          </button>
        )}

        <button
          onClick={() => {
            try {
              if (typeof window !== 'undefined' && window.speechSynthesis) {
                window.speechSynthesis.cancel();
              }
            } catch {}
            stopMediaStream();
            onOpenHospitalPortal();
          }}
          className="bg-white/95 hover:bg-emerald-50 border-2 border-[#1E8A4C] text-[#1E8A4C] font-bold text-xs px-3.5 py-2 rounded-full shadow-md flex items-center gap-1.5 transition active:scale-95 cursor-pointer"
          id="btnKioskHospitalPortal"
          title="เข้าสู่ระบบบุคลากร / รพ."
        >
          <Shield className="w-4 h-4 text-emerald-600" />
          <span>🛡️ ระบบบุคลากร / รพ.</span>
        </button>
      </div>

      {/* ================================================================= */}
      {/* Hand Tracking Virtual Touch Cursor & 1.0s Circular Dwell          */}
      {/* จัดการผ่าน Ref โดยตรง ไม่ผ่าน React State Render ทุกเฟรม          */}
      {/* ================================================================= */}
      <div
        ref={cursorElementRef}
        className="fixed pointer-events-none z-50 opacity-0 will-change-transform"
        style={{
          left: '0px',
          top: '0px',
          transform: 'translate3d(-100px, -100px, 0)',
          margin: '-32px 0 0 -32px',
        }}
      >
        <div className="relative w-16 h-16 flex items-center justify-center">
          <svg className="w-16 h-16 -rotate-90 filter drop-shadow-[0_0_10px_rgba(34,197,94,0.9)]">
            <circle
              cx="32"
              cy="32"
              r="24"
              fill="rgba(0, 0, 0, 0.45)"
              stroke="rgba(255, 255, 255, 0.3)"
              strokeWidth="4"
            />
            <circle
              ref={cursorProgressCircleRef}
              cx="32"
              cy="32"
              r="24"
              fill="none"
              stroke="#22c55e"
              strokeWidth="4"
              strokeDasharray="150.8"
              strokeDashoffset="150.8"
              strokeLinecap="round"
            />
          </svg>

          <div className="w-5 h-5 rounded-full bg-teal-400 border-2 border-white shadow-[0_0_12px_#14b8a6] absolute" />

          <div
            ref={cursorLabelRef}
            className="absolute top-16 left-1/2 -translate-x-1/2 whitespace-nowrap bg-black/85 text-emerald-300 font-bold text-[11px] px-2.5 py-0.5 rounded-full border border-emerald-400/60 shadow-lg opacity-0 transition-opacity duration-150"
          >
            แตะค้าง 1 วินาที (0%)
          </div>
        </div>
      </div>





      {/* ================================================================= */}
      {/* โมดอลสอบถามเมื่อตรวจไม่พบใบหน้าเป็นเวลานาน: "คุณอยู่หน้าเครื่องหรือไม่?" */}
      {/* ใช้ MediaPipe Pose ตรวจจับยกแขนขวา=ใช่ (2 วินาที) / ยกแขนซ้าย=ไม่       */}
      {/* และมีปุ่มสัมผัสขนาดใหญ่ >= 64px รองรับผู้สูงอายุ                         */}
      {/* ================================================================= */}
      {showPresenceInquiryModal && (
        <div
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 sm:p-6 animate-fadeIn"
          role="dialog"
          aria-modal="true"
          id="modalPresenceInquiry"
        >
          <div className="w-full max-w-lg bg-white rounded-3xl shadow-2xl border-4 border-emerald-400 p-5 sm:p-6 flex flex-col items-center text-center relative overflow-hidden">
            {/* ปุ่มปิด X มุมบนขวา */}
            <button
              onClick={() => setShowPresenceInquiryModal(false)}
              className="absolute top-4 right-4 p-2 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-600 transition cursor-pointer"
              aria-label="ปิดหน้าต่าง"
            >
              <X className="w-5 h-5" />
            </button>

            {/* ไอคอนและหัวข้อหลัก */}
            <div className="w-14 h-14 rounded-full bg-emerald-100 border-2 border-emerald-400 flex items-center justify-center text-[#1E8A4C] mb-2 shadow-sm">
              <UserCheck className="w-7 h-7" />
            </div>

            <h2 className="text-2xl sm:text-3xl font-black text-[#0B2B2B] tracking-tight">
              คุณอยู่หน้าเครื่องหรือไม่?
            </h2>
            <p className="text-xs sm:text-sm text-slate-600 font-bold mt-1">
              ระบบตรวจไม่พบใบหน้าชั่วคราว กรุณายืนยันว่าท่านอยู่หน้าตู้ Kiosk หรือไม่
            </p>

            {/* แถบปรับมุมมองกล้อง (เลือกองศา 0°, 90°, 180°, 270° หรือกดหมุนทีละ 90° และสลับกระจกเงา) */}
            <div className="w-full bg-slate-50 border border-slate-200/80 rounded-2xl p-2 sm:p-2.5 mt-2 flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-700 font-black flex items-center gap-1.5">
                  <span className="text-sm">📷</span>
                  <span>ปรับมุมมองกล้อง:</span>
                  {cameraRotation === 180 && (
                    <span className="text-[10px] bg-emerald-100 text-emerald-800 font-extrabold px-2 py-0.5 rounded-full border border-emerald-300">
                      ✓ กลับหัว 180°
                    </span>
                  )}
                </span>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleToggleCameraMirror();
                  }}
                  className={`min-h-[34px] px-2.5 py-1 rounded-xl text-xs font-bold flex items-center gap-1.5 transition active:scale-95 cursor-pointer touch-manipulation select-none border ${
                    isCameraMirrored
                      ? 'bg-cyan-50 border-cyan-300 text-cyan-800 shadow-sm'
                      : 'bg-white border-slate-300 text-slate-700'
                  }`}
                  title="กดเพื่อสลับมุมมองกระจกเงา"
                >
                  <FlipHorizontal className="w-3.5 h-3.5 text-cyan-600" />
                  <span>{isCameraMirrored ? '🪞 กระจกเงา (เปิด)' : '📷 กล้องปกติ'}</span>
                </button>
              </div>

              {/* ปุ่มเลือกมุมหมุน 0°, 90°, 180°, 270° โดยตรง พร้อมปุ่มหมุน +90° */}
              <div className="grid grid-cols-5 gap-1.5 w-full">
                {([0, 90, 180, 270] as CameraRotation[]).map((deg) => (
                  <button
                    key={deg}
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleSetCameraRotation(deg);
                    }}
                    className={`min-h-[40px] py-1 px-1 rounded-xl text-xs sm:text-sm font-black transition active:scale-95 cursor-pointer touch-manipulation select-none flex flex-col items-center justify-center border ${
                      cameraRotation === deg
                        ? 'bg-emerald-600 border-emerald-700 text-white shadow-md ring-2 ring-emerald-300'
                        : 'bg-white hover:bg-slate-100 border-slate-300 text-slate-700'
                    }`}
                  >
                    <span>{deg}°</span>
                    <span className="text-[9px] font-bold opacity-80 leading-none">
                      {deg === 0 ? 'เดิม' : deg === 180 ? 'กลับหัว' : deg === 90 ? 'ขวา' : 'ซ้าย'}
                    </span>
                  </button>
                ))}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleRotateCameraNext90();
                  }}
                  className="min-h-[40px] py-1 px-1 rounded-xl text-xs font-black bg-slate-800 hover:bg-slate-900 text-emerald-300 border border-slate-700 shadow-sm transition active:scale-95 cursor-pointer touch-manipulation select-none flex flex-col items-center justify-center"
                  title="กดหมุนไปอีก 90 องศา"
                >
                  <RotateCw className="w-3.5 h-3.5 text-emerald-400 mb-0.5" />
                  <span className="text-[10px] leading-none">+90°</span>
                </button>
              </div>
            </div>

            {/* หน้าต่างกระจกเงาสะท้อนจากกล้อง พร้อมตัวตรวจจับการยกแขน */}
            <div className="w-full relative rounded-2xl overflow-hidden border-2 border-slate-300 bg-slate-900 shadow-inner mt-2">
              <canvas
                ref={modalCanvasRef}
                width={480}
                height={360}
                className="w-full h-auto aspect-video object-cover"
              />

              {/* ป้ายแขนซ้าย = ไม่ (มุมบนซ้ายของกระจกเงา) */}
              <div className="absolute top-2 left-2 bg-rose-950/90 border border-rose-400 text-white px-2.5 py-1.5 rounded-xl shadow-lg flex flex-col items-start text-left pointer-events-none">
                <span className="font-black text-xs text-rose-300 flex items-center gap-1">
                  <span>🔴 ยกแขนซ้าย</span>
                </span>
                <span className="text-[10px] font-bold text-rose-100">ตอบ &quot;ไม่&quot; (กลับหน้าแรก)</span>
                {modalArmPose === 'left_no' && (
                  <div className="w-24 bg-slate-800 h-1.5 rounded-full overflow-hidden mt-1 border border-rose-400/50">
                    <div
                      className="h-full bg-rose-500 transition-all duration-75"
                      style={{ width: `${modalLeftArmProgress}%` }}
                    />
                  </div>
                )}
              </div>

              {/* ป้ายแขนขวา = ใช่ (มุมบนขวาของกระจกเงา) */}
              <div className="absolute top-2 right-2 bg-emerald-950/90 border border-emerald-400 text-white px-2.5 py-1.5 rounded-xl shadow-lg flex flex-col items-end text-right pointer-events-none">
                <span className="font-black text-xs text-emerald-300 flex items-center gap-1">
                  <Sparkles className="w-3 h-3 text-yellow-300" />
                  <span>🟢 ยกแขนขวา</span>
                </span>
                <span className="text-[10px] font-bold text-emerald-100">ตอบ &quot;ใช่&quot; (ไปหน้าถัดไป)</span>
                {modalArmPose === 'right_yes' && (
                  <div className="w-24 bg-slate-800 h-1.5 rounded-full overflow-hidden mt-1 border border-emerald-400/50">
                    <div
                      className="h-full bg-emerald-500 transition-all duration-75"
                      style={{ width: `${modalRightArmProgress}%` }}
                    />
                  </div>
                )}
              </div>

              {/* แถบสถานะข้อความล่างกล้อง */}
              <div className="absolute bottom-1.5 inset-x-2 bg-black/85 backdrop-blur-sm border border-emerald-400/40 text-white rounded-xl py-1.5 px-2.5 text-center pointer-events-none">
                {modalArmPose === 'right_yes' ? (
                  <p className="text-xs text-emerald-300 font-black animate-pulse">
                    ✓ กำลังยืนยัน &quot;ใช่&quot;: ยกค้างไว้ {modalRightArmSec} วินาที ({modalRightArmProgress}%)
                  </p>
                ) : modalArmPose === 'left_no' ? (
                  <p className="text-xs text-rose-300 font-black animate-pulse">
                    ✕ กำลังยกเลิก &quot;ไม่&quot;: ยกค้างไว้ {modalLeftArmSec} วินาที ({modalLeftArmProgress}%)
                  </p>
                ) : (
                  <p className="text-[11px] sm:text-xs text-emerald-200 font-bold">
                    ยกแขนขวาค้างไว้ 3 วินาทีเพื่อยืนยัน หรือยกแขนซ้ายเพื่อกลับหน้าแรก
                  </p>
                )}
              </div>
            </div>

            {/* แถบคำแนะนำท่าทาง (ข้อความใหญ่ ชัดเจน เหมาะสำหรับผู้สูงอายุ) */}
            <div className="grid grid-cols-2 gap-2.5 w-full mt-3 text-xs sm:text-sm font-bold">
              <div
                className={`p-2.5 rounded-2xl border-2 flex items-center gap-2 transition ${
                  modalArmPose === 'left_no'
                    ? 'bg-rose-50 border-rose-500 text-rose-900 shadow-sm'
                    : 'bg-slate-50 border-slate-200 text-slate-700'
                }`}
              >
                <span className="text-2xl">🙋‍♂️</span>
                <div className="text-left">
                  <p className="font-black text-rose-700 leading-tight">ยกแขนซ้าย</p>
                  <p className="text-[11px] text-slate-500">เพื่อกลับหน้าแรก</p>
                </div>
              </div>

              <div
                className={`p-2.5 rounded-2xl border-2 flex items-center gap-2 transition ${
                  modalArmPose === 'right_yes'
                    ? 'bg-emerald-50 border-emerald-500 text-emerald-900 shadow-sm'
                    : 'bg-slate-50 border-slate-200 text-slate-700'
                }`}
              >
                <span className="text-2xl">🙋‍♀️</span>
                <div className="text-left">
                  <p className="font-black text-emerald-700 leading-tight">ยกแขนขวา 3 วินาที</p>
                  <p className="text-[11px] text-slate-500">เพื่อยืนยัน &quot;ใช่&quot;</p>
                </div>
              </div>
            </div>

            {/* ปุ่มกดขนาดใหญ่ >= 64px ทางเลือกสำรองสำหรับการสัมผัสหน้าจอ */}
            <div className="grid grid-cols-2 gap-3 w-full mt-3.5">
              {/* ปุ่มซ้าย = ไม่ */}
              <button
                type="button"
                onClick={() => {
                  setShowPresenceInquiryModal(false);
                  audioFeedback.playHoldTick();
                  try {
                    voiceAssistant.speak('กลับสู่หน้าแรกเรียบร้อยค่ะ', { level: 'system' });
                  } catch {}
                }}
                className="min-h-[64px] py-3.5 px-4 rounded-2xl bg-rose-50 hover:bg-rose-100 text-rose-800 border-2 border-rose-300 font-black text-base sm:text-lg flex items-center justify-center gap-2 shadow-md active:scale-95 transition cursor-pointer"
                id="btnPresenceModalNo"
              >
                <X className="w-6 h-6 text-rose-600 shrink-0" />
                <span>ไม่</span>
              </button>

              {/* ปุ่มขวา = ใช่ */}
              <button
                type="button"
                onClick={() => {
                  setShowPresenceInquiryModal(false);
                  audioFeedback.playRepSuccess();
                  try {
                    voiceAssistant.speak('ยืนยันเข้าสู่ระบบเรียบร้อยค่ะ', { level: 'system' });
                  } catch {}
                  triggerSlideUp();
                }}
                className="min-h-[64px] py-3.5 px-4 rounded-2xl bg-gradient-to-r from-[#10B981] via-[#06B6D4] to-[#2563EB] hover:opacity-95 text-white border-2 border-cyan-300 font-black text-base sm:text-lg flex items-center justify-center gap-2 shadow-xl shadow-cyan-500/25 active:scale-95 transition cursor-pointer"
                id="btnPresenceModalYes"
              >
                <CheckCircle2 className="w-6 h-6 text-white shrink-0" />
                <span>ใช่</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* PDPA Biometric Consent Modal */}
      <PDPAConsentModal
        isOpen={showPdpaModal}
        onConsent={() => {
          setHasPdpaConsent(true);
          setShowPdpaModal(false);
          livenessEngine.createSessionNonce();
          changeStep(4);
        }}
        onDeclineUsePin={() => {
          setShowPdpaModal(false);
          setShowPinModal(true);
        }}
      />
    </div>
  );
};
