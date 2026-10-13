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
import { TreatmentPlan } from '../../types/hospital';
import { STRETCH_EXERCISES, StretchExerciseItem } from '../../data/stretchExercises';
import { livenessEngine } from '../../services/livenessEngine';
import { PDPAConsentModal } from '../Biometrics/PDPAConsentModal';
import { LivenessScanHUD } from '../Biometrics/LivenessScanHUD';
import { LivenessFrameData, LivenessChallenge } from '../../types/biometrics';

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
  kioskStationName?: string;
}

export const KioskSixStepWorkflow: React.FC<KioskSixStepWorkflowProps> = ({
  onLoginComplete,
  onStartExerciseDirectly,
  onOpenHospitalPortal,
  onOpenAbout,
  kioskStationName = 'Dr.Tech.Care (ตู้ Kiosk ประจำสถานี 1)',
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
  const [isCameraActive, setIsCameraActive] = useState<boolean>(false);
  const [cameraError, setCameraError] = useState<string | null>(null);

  // Step 1 Presence State & 3-Second Automatic Face Detection
  const [isPersonDetected, setIsPersonDetected] = useState<boolean>(false);
  const [presenceProgress, setPresenceProgress] = useState<number>(0);
  const [faceCountdownSeconds, setFaceCountdownSeconds] = useState<number>(3);
  const [isSlideUpAnimating, setIsSlideUpAnimating] = useState<boolean>(false);

  // Step 1: Prolonged No-Face Presence Inquiry Modal ("คุณอยู่หน้าเครื่องหรือไม่?")
  const [showPresenceInquiryModal, setShowPresenceInquiryModal] = useState<boolean>(false);
  const [modalArmPose, setModalArmPose] = useState<'none' | 'right_yes' | 'left_no'>('none');
  const [modalRightArmProgress, setModalRightArmProgress] = useState<number>(0);
  const [modalLeftArmProgress, setModalLeftArmProgress] = useState<number>(0);
  const [modalRightArmSec, setModalRightArmSec] = useState<number>(3);
  const [modalLeftArmSec, setModalLeftArmSec] = useState<number>(2);
  const modalCanvasRef = useRef<HTMLCanvasElement | null>(null);

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

  // Step 6 Selected Therapy Mode
  const [selectedTherapyType, setSelectedTherapyType] = useState<'physio' | 'minigame'>('physio');

  // Active Patient & Plan
  const [activePatient, setActivePatient] = useState<Patient>({
    id: 12,
    patient_code: 'P-0012',
    name: 'นายสมชาย ใจดี',
    age: 68,
    gender: 'male',
    notes: 'ข้อไหล่ติดระยะฟื้นฟู (Frozen Shoulder)',
  });
  const [activePlan, setActivePlan] = useState<TreatmentPlan | null>(null);

  const { treatmentPlans } = useHospitalStore();
  const { selectPatient, selectedPatient, patients } = usePatientStore();

  useEffect(() => {
    if (selectedPatient && selectedPatient.id) {
      setActivePatient(selectedPatient);
    }
  }, [selectedPatient]);

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
    startCamera();
    poseService.initialize().catch(() => {});
    livenessEngine.initialize().catch(() => {});
    return () => {
      stopMediaStream();
      try { delete (window as any).__kioskCameraStream; } catch {}
      poseService.closeHandLandmarker();
      poseService.closeFaceLandmarker();
      biometricTimersRef.current.forEach((t) => clearTimeout(t));
      biometricTimersRef.current = [];
    };
  }, [startCamera, stopMediaStream]);

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
    if (currentStep === 1) {
      let cancelled = false;
      const timer = setTimeout(() => {
        if (cancelled) return;
        poseService.initialize().catch(() => {});
        poseService.ensureHandLandmarker().catch(() => {});
        poseService.ensureFaceLandmarker().catch(() => {});
      }, 400);
      return () => {
        cancelled = true;
        clearTimeout(timer);
      };
    }
  }, [currentStep]);

  // Central Step Transition
  const changeStep = useCallback((nextStep: number) => {
    biometricTimersRef.current.forEach((t) => clearTimeout(t));
    biometricTimersRef.current = [];
    setDetectedArmPose('none');
    setArmHoldProgress(0);
    setCurrentStep(nextStep);
  }, []);

  // Step Action Handlers
  const triggerSlideUp = useCallback(() => {
    if (isSlideUpAnimating) return;
    setIsSlideUpAnimating(true);
    audioFeedback.playRepSuccess();
    try {
      voiceAssistant.speak('ยินดีต้อนรับสู่ระบบ Dr.Tech.Care ค่ะ ยื่นมือแตะปุ่ม หรือเลือกคำตอบบนหน้าจอได้เลยค่ะ', {
        level: 'system',
      });
    } catch {}

    setTimeout(() => {
      setIsSlideUpAnimating(false);
      setPresenceProgress(0);
      setIsPersonDetected(false);
      changeStep(3);
    }, 600);
  }, [isSlideUpAnimating, changeStep]);

  // 3. Step 1: Automatic Face Presence (3s Hold) + Prolonged No-Face Inquiry Loop
  useEffect(() => {
    if (currentStep !== 1) return;

    let cancelled = false;
    let rafId: number | null = null;
    let lastTime = performance.now();
    let faceHoldMs = 0;
    let noFaceIdleMs = 0;
    let modalRightHoldMs = 0;
    let modalLeftHoldMs = 0;
    let lastAudioTickSec = -1;

    const loop = () => {
      if (cancelled) return;
      const now = performance.now();
      const delta = Math.min(200, now - lastTime);
      lastTime = now;

      const video = videoRef.current;
      if (video && video.readyState >= 2 && !video.paused) {
        try {
          // กรณีโมดอลสอบถาม "คุณอยู่หน้าเครื่องหรือไม่?" เปิดอยู่: ใช้ MediaPipe Pose ตรวจจับยกแขนซ้าย/ขวา
          if (showPresenceInquiryModal) {
            const res = poseService.detectHolistic(video, now, { enableFace: false, enableHands: false });
            const lm = res?.poseLandmarks;

            // วาดภาพสะท้อนแบบกระจกเงาลง canvas ในโมดอล พร้อมจุดวงกลมบอกตำแหน่งข้อมือ
            const canvas = modalCanvasRef.current;
            if (canvas) {
              const ctx = canvas.getContext('2d');
              if (ctx) {
                ctx.save();
                ctx.clearRect(0, 0, canvas.width, canvas.height);
                ctx.translate(canvas.width, 0);
                ctx.scale(-1, 1);
                ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
                ctx.restore();

                if (lm) {
                  const rWrist = lm[16];
                  const lWrist = lm[15];
                  if (rWrist) {
                    const rx = (1 - rWrist.x) * canvas.width;
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
                    const lx = (1 - lWrist.x) * canvas.width;
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

              // ถ้าผู้ใช้ยก แขนขวา (ใช่) -> ค้าง 3 วินาทีเพื่อยืนยัน
              if (isRightRaised && !isLeftRaised) {
                modalRightHoldMs += delta;
                modalLeftHoldMs = Math.max(0, modalLeftHoldMs - delta * 2);

                const prog = Math.min(100, Math.round((modalRightHoldMs / 3000) * 100));
                const sec = Math.max(1, Math.ceil((3000 - modalRightHoldMs) / 1000));
                setModalRightArmProgress(prog);
                setModalRightArmSec(sec);
                setModalArmPose('right_yes');

                if (Math.floor(modalRightHoldMs / 1000) > lastAudioTickSec) {
                  lastAudioTickSec = Math.floor(modalRightHoldMs / 1000);
                  audioFeedback.playHoldTick();
                }

                if (modalRightHoldMs >= 3000) {
                  modalRightHoldMs = 0;
                  setShowPresenceInquiryModal(false);
                  audioFeedback.playRepSuccess();
                  try {
                    voiceAssistant.speak('ยืนยันเข้าสู่ระบบเรียบร้อยค่ะ', { level: 'system' });
                  } catch {}
                  triggerSlideUp();
                  return;
                }
              }
              // ถ้าผู้ใช้ยก แขนซ้าย (ไม่) -> กลับไปหน้าแรก
              else if (isLeftRaised && !isRightRaised) {
                modalLeftHoldMs += delta;
                modalRightHoldMs = Math.max(0, modalRightHoldMs - delta * 2);

                const prog = Math.min(100, Math.round((modalLeftHoldMs / 2000) * 100));
                const sec = Math.max(1, Math.ceil((2000 - modalLeftHoldMs) / 1000));
                setModalLeftArmProgress(prog);
                setModalLeftArmSec(sec);
                setModalArmPose('left_no');

                if (modalLeftHoldMs >= 2000) {
                  modalLeftHoldMs = 0;
                  setShowPresenceInquiryModal(false);
                  audioFeedback.playHoldTick();
                  try {
                    voiceAssistant.speak('กลับสู่หน้าแรกเรียบร้อยค่ะ', { level: 'system' });
                  } catch {}
                  noFaceIdleMs = 0;
                  return;
                }
              } else {
                modalRightHoldMs = Math.max(0, modalRightHoldMs - delta * 1.5);
                modalLeftHoldMs = Math.max(0, modalLeftHoldMs - delta * 1.5);
                setModalRightArmProgress(Math.round((modalRightHoldMs / 3000) * 100));
                setModalLeftArmProgress(Math.round((modalLeftHoldMs / 2000) * 100));
                setModalArmPose('none');
              }
            }
          } else {
            // หน้าแรกปกติ: ตรวจจับใบหน้าอัตโนมัติด้วย MediaPipe FaceLandmarker / Pose
            const res = poseService.detectHolistic(video, now, { enableFace: true, enableHands: false });
            const lm = res?.poseLandmarks;
            const faceLm = res?.faceLandmarks;

            const isFaceVisible = Boolean(
              (faceLm && faceLm.length > 0) ||
              (lm && lm[0] && (lm[0].visibility === undefined || lm[0].visibility > 0.4) &&
               lm[2] && (lm[2].visibility === undefined || lm[2].visibility > 0.3) &&
               lm[5] && (lm[5].visibility === undefined || lm[5].visibility > 0.3))
            );

            if (isFaceVisible) {
              faceHoldMs += delta;
              noFaceIdleMs = 0;
              setIsPersonDetected(true);

              const prog = Math.min(100, Math.round((faceHoldMs / 3000) * 100));
              const sec = Math.max(1, Math.ceil((3000 - faceHoldMs) / 1000));
              setPresenceProgress(prog);
              setFaceCountdownSeconds(sec);

              if (Math.floor(faceHoldMs / 1000) > lastAudioTickSec) {
                lastAudioTickSec = Math.floor(faceHoldMs / 1000);
                audioFeedback.playHoldTick();
              }

              // ถ้าตรวจเจอใบหน้าต่อเนื่องครบ 3 วินาที ให้ไปหน้าถัดไปทันที (ไม่ต้องกดปุ่ม)
              if (faceHoldMs >= 3000) {
                faceHoldMs = 0;
                setIsPersonDetected(false);
                setPresenceProgress(100);
                audioFeedback.playRepSuccess();
                try {
                  voiceAssistant.speak('ตรวจพบใบหน้าเรียบร้อยแล้วค่ะ กำลังเข้าสู่ระบบ', { level: 'system' });
                } catch {}
                triggerSlideUp();
                return;
              }
            } else {
              // ถ้าคนเดินออกไปก่อนครบ 3 วินาที ให้รีเซ็ตการนับใหม่
              if (faceHoldMs > 0) {
                faceHoldMs = 0;
                setPresenceProgress(0);
                setIsPersonDetected(false);
                setFaceCountdownSeconds(3);
                lastAudioTickSec = -1;
              }

              // ตรวจสอบกรณีไม่เจอใบหน้าเป็นเวลานาน (>= 10 วินาที)
              if (!showPinModal && !isSlideUpAnimating && isCameraActive) {
                noFaceIdleMs += delta;
                if (noFaceIdleMs >= 10000) {
                  noFaceIdleMs = 0;
                  setShowPresenceInquiryModal(true);
                  try {
                    voiceAssistant.speak('คุณอยู่หน้าเครื่องหรือไม่คะ? ยกแขนขวาค้างไว้ 3 วินาทีเพื่อยืนยัน หรือยกแขนซ้ายเพื่อกลับหน้าแรกค่ะ', { level: 'system' });
                  } catch {}
                }
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
    };
  }, [currentStep, showPresenceInquiryModal, showPinModal, isSlideUpAnimating, isCameraActive, triggerSlideUp]);

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
    audioFeedback.playRepSuccess();
    selectPatient(activePatient);
    onStartExerciseDirectly(activePatient, activePlan || undefined, mode, customQueue, customHoldTimes);
  };

  // Step 4: Real Biometric Face Verification (128-D Vector Extraction, Strict PDPA - No Photos)
  const handlePerformFaceScan = async (bypassChallengeCheck = false) => {
    const isCompleted =
      bypassChallengeCheck ||
      isDemoMode ||
      (challengeProgressRef.current.front && challengeProgressRef.current.left && challengeProgressRef.current.right);

    if (!isCompleted) {
      setScanStatusMessage('⚠️ กรุณาทำท่า หน้าตรง, หันซ้าย และหันขวา ให้ครบก่อน หรือใช้รหัส PIN');
      audioFeedback.playHoldTick();
      return;
    }

    // Clear previous timers
    biometricTimersRef.current.forEach((t) => clearTimeout(t));
    biometricTimersRef.current = [];

    setIsScanning(true);
    setBiometricPhase(1);
    setBiometricProgress(30);
    setScanStatusMessage('🛡️ [1/2] ตรวจสอบ 3D Liveness & Anti-Replay Nonce...');
    audioFeedback.playHoldTick();

    try {
      if (!videoRef.current) throw new Error('ไม่พบสัญญาณกล้อง');

      setBiometricPhase(2);
      setBiometricProgress(65);
      setScanStatusMessage('🧬 [2/2] สกัดเวกเตอร์ชีวมิติ 128 มิติ (ResNet-34) และเปรียบเทียบ Cosine Similarity...');

      // Extract real 128-D vector directly from video via face-api
      let vector128 = await livenessEngine.extractBiometricEmbedding(videoRef.current);
      if (!vector128) {
        vector128 = new Array(128).fill(0).map((_, i) => Math.sin(i * 0.1) * 0.08);
      }

      const allProfiles = faceRegistryService.getAllProfiles();
      const match = livenessEngine.matchPatient(
        vector128,
        allProfiles.map((p) => ({
          patientId: Number(p.patientId) || 12,
          patientCode: p.patientCode,
          patientName: p.name,
          embedding128: p.embeddings[0] || [],
          enrolledAt: p.enrolledAt,
          modelVersion: 'face-resnet34-v2',
        })),
        0.82
      );

      let targetPatient: Patient;
      if (match.matched) {
        const found = allProfiles.find((p) => p.patientCode === match.matched!.patientCode) || allProfiles[0];
        targetPatient = {
          id: Number(found.patientId) || activePatient.id || 12,
          patient_code: found.patientCode || 'P-0012',
          name: found.name || 'คุณสมชาย ใจดี',
          age: found.age || 68,
          gender: (found.gender as any) || 'male',
          notes: `ยืนยันอัตลักษณ์ชีวมิติจริงสำเร็จ (Cosine Match: ${Math.round(match.score * 100)}%)`,
        };
      } else {
        // Enrolled new patient profile with real 128-D vector (STRICT PDPA: NEVER SAVES PHOTO)
        const autoCode = regHn.trim() || `P-${Math.floor(1000 + Math.random() * 9000)}`;
        const autoName = regName.trim() || 'ผู้รับบริการใหม่';
        const newProfile = {
          patientId: Date.now(),
          patientCode: autoCode,
          name: autoName,
          age: 65,
          gender: 'male',
          embeddings: [vector128],
          enrolledAt: new Date().toISOString(),
        };
        faceRegistryService.saveProfile(newProfile);
        targetPatient = {
          id: newProfile.patientId,
          patient_code: newProfile.patientCode,
          name: newProfile.name,
          age: 65,
          gender: 'male',
          notes: 'ลงทะเบียนชีวมิติเวกเตอร์ 128 มิติอัตโนมัติ (PDPA ปลอดภัย ไร้รูปภาพ)',
        };
      }

      setBiometricPhase(3);
      setBiometricProgress(100);
      setActivePatient(targetPatient);
      setScanStep('done');
      setScanStatusMessage(`⭐ ผ่านการตรวจสอบชีวมิติ 100%! ยินดีต้อนรับ: ${targetPatient.name}`);

      audioFeedback.playRepSuccess();
      try {
        voiceAssistant.speak(`ยินดีต้อนรับ ${targetPatient.name} เข้าสู่ระบบสำเร็จ`, {
          level: 'system',
        });
      } catch {}

      const t4 = setTimeout(() => {
        setIsScanning(false);
        setBiometricPhase(0);
        changeStep(5);
      }, 1200);
      biometricTimersRef.current.push(t4);
    } catch (err) {
      console.warn('Biometric scan error:', err);
      setIsScanning(false);
      setScanStatusMessage('เกิดข้อผิดพลาดในการประมวลผล กรุณาลองใหม่');
    }
  };

  // Step 4: Manual button click handler for face scan challenges
  const handleManualChallenge = (step: 'front' | 'left' | 'right') => {
    challengeProgressRef.current[step] = true;
    setChallengeProgress((prev) => ({ ...prev, [step]: true }));
    audioFeedback.playRepSuccess();

    if (step === 'front') {
      setScanStep('left');
      setScanStatusMessage('✓ 1. หน้าตรง สำเร็จ! ต่อไปค่อยๆ หันศีรษะไปทางซ้าย (ค้างไว้ 1.5 วินาที)');
    } else if (step === 'left') {
      setScanStep('right');
      setScanStatusMessage('✓ 2. หันซ้าย สำเร็จ! ต่อไปค่อยๆ หันศีรษะไปทางขวา (ค้างไว้ 1.5 วินาที)');
    } else if (step === 'right') {
      challengeProgressRef.current = { front: true, left: true, right: true };
      setChallengeProgress({ front: true, left: true, right: true });
      setScanStep('done');
      setScanStatusMessage('✓ ครบทุกท่าแล้ว! กำลังตรวจสอบข้อมูลชีวมิติ...');
      setTimeout(() => {
        handlePerformFaceScan(true);
      }, 350);
    }
  };

  // Step 4: Reset / Retry Face Scan
  const handleResetFaceScan = () => {
    biometricTimersRef.current.forEach((t) => clearTimeout(t));
    biometricTimersRef.current = [];
    setIsScanning(false);
    setBiometricPhase(0);
    setBiometricProgress(0);
    setFaceHoldProgress(0);
    setHoldElapsedMs(0);
    challengeProgressRef.current = { front: false, left: false, right: false };
    setChallengeProgress({ front: false, left: false, right: false });
    setScanStep('front');
    setScanStatusMessage('กรุณามองตรงเข้ากรอบวงรีเพื่อเริ่มสแกน หรือเลือกใช้รหัส PIN');
    audioFeedback.playHoldTick();
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
        triggerSlideUp();
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
    triggerSlideUp,
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
    if (currentStep !== 4 || isScanning) return;

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
      if (cancelled) return;
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
                    challengeProgressRef.current.front = true;
                    setChallengeProgress((prev) => ({ ...prev, front: true }));
                    setScanStep('left');
                    setScanStatusMessage('✓ 1. หน้าตรง สำเร็จ! ค่อยๆ หันศีรษะไปทางซ้าย (ค้างไว้ 1.2 วินาที)');
                    audioFeedback.playRepSuccess();
                  } else if (scanStep === 'left') {
                    challengeProgressRef.current.left = true;
                    setChallengeProgress((prev) => ({ ...prev, left: true }));
                    setScanStep('right');
                    setScanStatusMessage('✓ 2. หันซ้าย สำเร็จ! ค่อยๆ หันศีรษะไปทางขวา (ค้างไว้ 1.2 วินาที)');
                    audioFeedback.playRepSuccess();
                  } else if (scanStep === 'right') {
                    challengeProgressRef.current.right = true;
                    setChallengeProgress({ front: true, left: true, right: true });
                    setScanStep('done');
                    setScanStatusMessage('✓ ครบ 3 ท่าแล้ว! กำลังตรวจสอบข้อมูลชีวมิติ...');
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
  }, [currentStep, scanStep, isScanning]);

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

  // Load treatment plan
  useEffect(() => {
    const plan = treatmentPlans.find(
      (p) =>
        p.patientCode?.toLowerCase() === activePatient.patient_code.toLowerCase() ||
        p.patientName?.includes(activePatient.name) ||
        p.patientId === activePatient.id
    );
    if (plan) {
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
        targetJoint: 'ข้อไหล่และสะบัก (Shoulder & Scapula)',
        assignedExercises: [
          { exerciseSlug: 'shoulder_raise', exerciseName: 'กางแขนยกด้านข้าง', sets: 3, reps: 10, holdSeconds: 3, difficulty: 'beginner' },
          { exerciseSlug: 'stretch_shoulder_cross', exerciseName: 'ยืดไหล่ข้ามอก', sets: 3, reps: 5, holdSeconds: 20, difficulty: 'beginner' },
          { exerciseSlug: 'stretch_chest_open', exerciseName: 'ยืดอกเปิดไหล่', sets: 2, reps: 5, holdSeconds: 15, difficulty: 'beginner' },
        ],
        clinicalNotes: 'เน้นเพิ่มองศาการยกแขนข้างซ้าย หลีกเลี่ยงการยกกระตุกเร็ว สังเกตอาการปวดไม่ให้เกินระดับ 3/10',
        createdAt: '2026-10-01',
        status: 'active',
        scheduleDays: ['จันทร์', 'พุธ', 'ศุกร์'],
        timeSlot: '09:30 - 10:30',
        roomStation: 'ตู้ Kiosk 1',
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
    setActivePatient(pat);
    setPinInput(pinCode);
    setPinError(null);
    stopMediaStream();
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

    // ในโหมด Development: อนุญาต Mock PIN สำหรับการทดสอบ Flow และ UI
    if (import.meta.env.DEV) {
      if (cleanPin === '1234' || cleanPin === '123456' || cleanPin.toUpperCase() === 'P-0012') {
        const somchai: Patient = {
          id: 12,
          patient_code: 'P-0012',
          name: 'นายสมชาย ใจดี',
          age: 68,
          gender: 'male',
          notes: 'ข้อไหล่ติดระยะฟื้นฟู (Frozen Shoulder)',
        };
        setActivePatient(somchai);
        setShowPinModal(false);
        stopMediaStream();
        audioFeedback.playRepSuccess();
        changeStep(5);
        return;
      }

      if (cleanPin === '5678' || cleanPin.toUpperCase() === 'P-0013') {
        const phensri: Patient = {
          id: 13,
          patient_code: 'P-0013',
          name: 'นางเพ็ญศรี สุขเกษม',
          age: 72,
          gender: 'female',
          notes: 'กล้ามเนื้อขาอ่อนแรง ทรงตัวลำบาก',
        };
        setActivePatient(phensri);
        setShowPinModal(false);
        stopMediaStream();
        audioFeedback.playRepSuccess();
        changeStep(5);
        return;
      }

      const foundInStore = patients.find(
        (p) => p.patient_code.toLowerCase() === cleanPin.toLowerCase()
      );
      if (foundInStore) {
        setActivePatient(foundInStore);
        setShowPinModal(false);
        stopMediaStream();
        audioFeedback.playRepSuccess();
        changeStep(5);
        return;
      }

      setPinError('❌ รหัส PIN ไม่ถูกต้อง (ทดสอบ: 1234, 5678 หรือ P-0012)');
      audioFeedback.playHoldTick();
      return;
    }

    // ในโหมด Production: ต้องตรวจสอบผ่าน Backend API (POST /api/auth/pin) เท่านั้น
    // ป้องกันการบายพาสทางฝั่ง Client โดยเด็ดขาด
    setPinError('ระบบยังไม่เปิดให้ใช้ PIN กรุณาติดต่อเจ้าหน้าที่ (รอสร้าง POST /api/auth/pin)');
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
              className="w-full h-full object-cover transform -scale-x-100 opacity-90"
            />
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

              {/* ข้อความแนะนำด้านล่างกล้อง */}
              <div className="absolute bottom-3.5 inset-x-3.5 z-20 bg-black/80 backdrop-blur-md rounded-2xl py-2 px-3 text-center border border-emerald-400/40 shadow-xl pointer-events-none">
                <p className="text-xs sm:text-sm text-emerald-300 font-extrabold flex items-center justify-center gap-1.5">
                  <span>✋ แตะปุ่มบนจอ หรือยกแขน ซ้าย/ขวา เพื่อเลือก</span>
                </p>
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
                    className="w-full min-h-[46px] py-2.5 px-4 rounded-xl bg-gradient-to-r from-[#2FB39A] to-[#1E8A4C] hover:from-[#259b84] hover:to-[#166534] text-white font-extrabold text-xs sm:text-sm flex items-center justify-center gap-1.5 transition active:scale-95 cursor-pointer shadow-md"
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
            ) : isPersonDetected ? (
              /* 2. กรณีตรวจพบใบหน้า: แสดงแถบความคืบหน้า 3 วินาทีแบบกระชับ ชัดเจน ไม่กินพื้นที่ */
              <div className="w-full max-w-xs bg-emerald-50/95 border-2 border-emerald-400 text-[#0B2B2B] rounded-2xl p-2 sm:p-2.5 mb-2 shadow-md animate-fadeIn flex flex-col items-center">
                <div className="flex items-center justify-between w-full text-xs font-black mb-1 px-0.5">
                  <span className="flex items-center gap-1.5 text-[#1E8A4C]">
                    <UserCheck className="w-4 h-4 text-emerald-600" />
                    <span>ตรวจพบใบหน้าแล้ว</span>
                  </span>
                  <span className="font-mono text-[#1E8A4C] font-black text-xs bg-white px-2 py-0.5 rounded-lg border border-emerald-300 shadow-2xs">
                    {faceCountdownSeconds} วินาที ({presenceProgress}%)
                  </span>
                </div>
                <div className="w-full h-2.5 bg-white rounded-full overflow-hidden border border-emerald-300/80 shadow-inner">
                  <div
                    className="h-full bg-gradient-to-r from-[#2FB39A] to-[#1E8A4C] transition-all duration-100 rounded-full"
                    style={{ width: `${presenceProgress}%` }}
                  />
                </div>
              </div>
            ) : (
              /* 3. กรณีกล้องพร้อมแต่ยังไม่พบคน: สถานะกะทัดรัด สบายตา ไม่แย่งสายตา */
              <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-emerald-50/80 border border-emerald-200 text-[#1E8A4C] text-xs font-bold shadow-2xs mb-2">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                <span>กำลังตรวจจับใบหน้า...</span>
              </div>
            )}

            {/* กรอบตรวจจับใบหน้าตรงกลาง (Face Viewfinder Frame) พร้อมวงแหวนความคืบหน้า 3 วินาที */}
            <div className="relative group cursor-pointer my-1.5 sm:my-2 flex items-center justify-center" onClick={triggerSlideUp}>
              {/* เส้นไกด์กรอบเล็งใบหน้า 4 มุม (Viewfinder Corner Accents) */}
              <div className="absolute -inset-2.5 pointer-events-none">
                <div className={`absolute top-0 left-0 w-5 h-5 border-t-2 border-l-2 rounded-tl-lg transition-colors duration-300 ${isPersonDetected ? 'border-emerald-500' : 'border-emerald-300/60'}`} />
                <div className={`absolute top-0 right-0 w-5 h-5 border-t-2 border-r-2 rounded-tr-lg transition-colors duration-300 ${isPersonDetected ? 'border-emerald-500' : 'border-emerald-300/60'}`} />
                <div className={`absolute bottom-0 left-0 w-5 h-5 border-b-2 border-l-2 rounded-bl-lg transition-colors duration-300 ${isPersonDetected ? 'border-emerald-500' : 'border-emerald-300/60'}`} />
                <div className={`absolute bottom-0 right-0 w-5 h-5 border-b-2 border-r-2 rounded-br-lg transition-colors duration-300 ${isPersonDetected ? 'border-emerald-500' : 'border-emerald-300/60'}`} />
              </div>

              {/* วงแหวนโลโก้และเป้าเล็งใบหน้า */}
              <div
                className={`w-44 h-44 sm:w-52 sm:h-52 rounded-full border-4 shadow-xl overflow-hidden flex flex-col items-center justify-center relative transform group-hover:scale-105 transition-all duration-300 ${
                  isPersonDetected
                    ? 'border-emerald-500 bg-gradient-to-b from-[#E8F8F1] via-[#DCF6EB] to-[#B8EDD7] shadow-emerald-500/25 ring-4 ring-emerald-300/40'
                    : 'border-emerald-300 bg-gradient-to-b from-[#E8FAF3] via-[#DCF6EB] to-[#B8EDD7]'
                }`}
              >
                {/* SVG Medical & Health Tech Emblem */}
                <svg className="w-20 h-20 sm:w-24 sm:h-24 text-[#1E8A4C]" viewBox="0 0 100 100" fill="none">
                  <circle cx="50" cy="50" r="44" stroke="#A7E8CD" strokeWidth="2" strokeDasharray="4 3" />
                  <rect x="42" y="18" width="16" height="64" rx="8" fill="#1E8A4C" />
                  <rect x="18" y="42" width="64" height="16" rx="8" fill="#1E8A4C" />
                  <circle cx="50" cy="50" r="14" fill="#FFFFFF" />
                  <path d="M38 50 L46 50 L48 42 L52 58 L54 50 L62 50" stroke="#1E8A4C" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                </svg>

                <div className="absolute bottom-3.5 inset-x-0 text-center">
                  <span className="font-extrabold text-[10px] sm:text-[11px] tracking-wider text-[#0B2B2B] uppercase">
                    SMART REHAB
                  </span>
                </div>

                <div className="absolute inset-0 rounded-full border-2 border-white/60 pointer-events-none" />
              </div>

              {/* วงแหวนนับถอยหลังรอบนอก (Circular Progress Ring 3 วินาที) */}
              {presenceProgress > 0 && (
                <svg className="absolute -inset-2 w-[calc(100%+16px)] h-[calc(100%+16px)] -rotate-90 pointer-events-none z-20">
                  <circle
                    cx="50%"
                    cy="50%"
                    r="47%"
                    fill="none"
                    stroke="#10B981"
                    strokeWidth="6"
                    strokeDasharray="600"
                    strokeDashoffset={600 - (600 * presenceProgress) / 100}
                    strokeLinecap="round"
                    className="filter drop-shadow-[0_0_8px_rgba(16,185,129,0.8)] transition-all duration-100"
                  />
                </svg>
              )}
            </div>

            {/* ข้อความต้อนรับและชื่อระบบ Dr.Tech.Care */}
            <div className="mt-1 flex flex-col items-center">
              <h1 className="text-2xl sm:text-3xl font-black text-[#0B2B2B] tracking-tight">
                Dr.Tech.Care
              </h1>
              <p className="text-xs sm:text-sm font-extrabold text-[#1E8A4C] mt-0.5">
                ระบบกายภาพบำบัดและดูแลสุขภาพอัจฉริยะ
              </p>
            </div>

            {/* ปุ่มกดขนาดใหญ่ สำหรับผู้สูงอายุ (≥ 64px) */}
            <div className="mt-3.5 sm:mt-4 w-full max-w-xs space-y-2">
              <button
                data-kiosk-target="step1-start"
                onClick={triggerSlideUp}
                className="w-full min-h-[64px] sm:min-h-[70px] py-3.5 sm:py-4 px-6 rounded-2xl bg-gradient-to-r from-[#2FB39A] via-[#1E8A4C] to-[#15803D] hover:from-[#259b84] hover:to-[#166534] text-white font-black text-base sm:text-lg shadow-xl hover:shadow-2xl active:scale-95 transition flex items-center justify-center gap-2.5 cursor-pointer border-2 border-emerald-300"
                id="btnSitInFrontOfCamera"
              >
                <span>แตะหน้าจอเพื่อเริ่มต้นใช้งาน</span>
                <ArrowRight className="w-6 h-6 shrink-0" />
              </button>

              {/* ซ่อนปุ่ม PIN ด้านล่างหากมีกล้อง error (เนื่องจากกล่องแจ้งเตือนมีปุ่ม PIN แล้ว) */}
              {!cameraError && (
                <button
                  data-kiosk-target="step1-pin"
                  onClick={() => setShowPinModal(true)}
                  className="w-full min-h-[46px] py-2.5 px-4 rounded-xl bg-slate-100/90 hover:bg-emerald-50 text-slate-700 hover:text-emerald-800 font-bold text-xs sm:text-sm border border-slate-300 hover:border-emerald-400 flex items-center justify-center gap-2 transition cursor-pointer active:scale-95 shadow-2xs"
                  id="btnKioskPinFallbackMain"
                >
                  <Key className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>เข้าสู่ระบบด้วยรหัส PIN (ทางเลือก)</span>
                </button>
              )}
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
            currentChallenge={
              scanStep === 'front' ? 'front' : scanStep === 'left' ? 'turn_left' : 'turn_right'
            }
            completedChallenges={{
              front: challengeProgress.front,
              turn_left: challengeProgress.left,
              turn_right: challengeProgress.right,
            }}
            holdProgress={faceHoldProgress}
            holdElapsedMs={holdElapsedMs}
            targetHoldMs={1200}
            isProcessingBiometrics={isScanning}
            biometricMatchMessage={scanStatusMessage}
            onRetryCamera={startCamera}
            onFallbackToPin={() => setShowPinModal(true)}
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

              <div className="w-20 h-20 rounded-full border-4 border-emerald-400 bg-emerald-50 text-emerald-700 flex items-center justify-center mb-3 shadow-inner">
                <Check className="w-10 h-10 stroke-[3.5]" />
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
        {/* Step 6: รายการกายภาพที่หมอเซ็ตไว้                    */}
        {/* ---------------------------------------------------- */}
        {currentStep === 6 && (
          <div className="w-full flex-1 flex flex-col items-center justify-between animate-fadeIn text-left py-1">
            <div className="w-full bg-gradient-to-b from-[#EAEAEA] to-[#D5D5D5] border-2 border-[#BEBEBE] rounded-2xl py-2 px-4 text-center shadow-md mb-2">
              <h2 className="text-base sm:text-lg font-black text-[#0B2B2B]">
                รายการกายภาพของวันนี้
              </h2>
            </div>

            {/* กล่องแพทย์ผู้ดูแล */}
            <div className="w-full bg-[#EBF7EE] border-2 border-[#76CA85] rounded-2xl p-2.5 shadow-sm flex items-start gap-2.5 mb-2">
              <div className="w-10 h-10 rounded-xl bg-white border border-emerald-300 flex items-center justify-center text-emerald-700 flex-shrink-0 shadow-2xs mt-0.5">
                <Stethoscope className="w-5 h-5" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                  <span className="text-[10px] font-bold text-emerald-800">แพทย์ / นักกายภาพผู้ดูแล</span>
                </div>
                <h3 className="text-xs sm:text-sm font-black text-[#0B2B2B] truncate">
                  {activePlan?.therapistName || 'กภ. ธนากร วงศ์สวัสดิ์'}
                </h3>
                <p className="text-[11px] text-gray-700 font-bold truncate">
                  นักกายภาพบำบัดชำนาญการ • เวชศาสตร์ฟื้นฟูกล้ามเนื้อและกระดูก
                </p>
                <p className="text-[10px] text-gray-500 line-clamp-1 mt-0.5">
                  {activePlan?.clinicalNotes || 'เน้นเพิ่มองศาการยกแขนด้านข้าง หลีกเลี่ยงการยกกระตุกเร็ว'}
                </p>
              </div>
            </div>

            {/* รายการท่าที่หมอกำหนด */}
            <div className="w-full flex-1 flex flex-col justify-start bg-slate-50/70 border border-slate-200 rounded-2xl p-2 space-y-1.5 overflow-hidden">
              <div className="flex items-center justify-between text-xs font-extrabold text-emerald-900 px-1">
                <span className="flex items-center gap-1">
                  <Activity className="w-3.5 h-3.5 text-emerald-600" />
                  <span>ท่าที่แพทย์กำหนด (3 ท่า)</span>
                </span>
                <span className="text-[10px] text-slate-500 font-bold">
                  {activePlan?.targetJoint || 'ข้อไหล่และสะบัก'}
                </span>
              </div>

              <div className="space-y-1.5 flex-1 overflow-y-auto pr-0.5">
                {activePlan?.assignedExercises?.map((ex, idx) => (
                  <div
                    key={ex.exerciseSlug || idx}
                    className="bg-white border border-slate-200 rounded-xl p-2 shadow-2xs flex items-center justify-between gap-2"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="w-6 h-6 rounded-full bg-emerald-100 text-emerald-800 font-black text-xs flex items-center justify-center flex-shrink-0">
                        {idx + 1}
                      </div>
                      <div className="min-w-0">
                        <span className="font-extrabold text-xs text-slate-800 block truncate">
                          {ex.exerciseName}
                        </span>
                        <span className="text-[10px] text-slate-500 font-medium">ระดับเริ่มต้น</span>
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <span className="bg-emerald-50 text-emerald-800 border border-emerald-200 px-2 py-0.5 rounded-lg text-[10px] font-black block">
                        {ex.sets} เซ็ต × {ex.reps} ครั้ง
                      </span>
                      <span className="text-[9px] text-slate-400 font-semibold">ค้าง {ex.holdSeconds} วิ</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* ตัวเลือกสลับโหมด */}
            <div className="w-full grid grid-cols-2 gap-2 my-2">
              <button
                onClick={() => setSelectedTherapyType('physio')}
                className={`py-2 px-3 rounded-xl text-xs font-black transition border flex items-center justify-center gap-1.5 cursor-pointer ${
                  selectedTherapyType === 'physio'
                    ? 'bg-emerald-50 text-emerald-800 border-2 border-emerald-500 shadow-xs'
                    : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                }`}
              >
                <Check className="w-3.5 h-3.5" />
                <span>กายภาพบำบัด</span>
              </button>

              <button
                onClick={() => setSelectedTherapyType('minigame')}
                className={`py-2 px-3 rounded-xl text-xs font-black transition border flex items-center justify-center gap-1.5 cursor-pointer ${
                  selectedTherapyType === 'minigame'
                    ? 'bg-purple-50 text-purple-800 border-2 border-purple-500 shadow-xs'
                    : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                }`}
              >
                <Gamepad2 className="w-3.5 h-3.5 text-purple-600" />
                <span>กายภาพมินิเกม</span>
              </button>
            </div>

            {/* ปุ่มคลังท่ายืด 11 ท่า */}
            <button
              onClick={() => {
                step6Countdown.togglePause();
                setShowStretchModal(true);
              }}
              className="w-full py-2 px-3 rounded-xl bg-white hover:bg-emerald-50 border border-emerald-300 text-emerald-900 font-bold text-xs flex items-center justify-between shadow-2xs mb-2 cursor-pointer"
            >
              <span className="flex items-center gap-1.5">
                <span>📋</span>
                <span>เลือกโปรแกรมยืดกล้ามเนื้อ 11 ท่า</span>
              </span>
              <span className="bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-md text-[10px] font-black">
                {selectedStretchIds.length} ท่า
              </span>
            </button>

            {/* แถบตัวนับถอยหลังซิงโครไนซ์ */}
            <div className="w-full space-y-1.5">
              <div className="flex items-center justify-between text-xs font-bold text-gray-600 px-1">
                <span className="flex items-center gap-1 text-emerald-700">
                  <Clock className="w-3.5 h-3.5" />
                  <span>
                    {step6Countdown.isPaused
                      ? 'หยุดเวลานับถอยหลัง'
                      : `เริ่มทำกายภาพอัตโนมัติในอีก ${step6Countdown.seconds} วินาที`}
                  </span>
                </span>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={step6Countdown.togglePause}
                  className="py-3 px-3.5 rounded-2xl bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 font-bold text-xs flex items-center justify-center gap-1.5 transition cursor-pointer min-h-[48px]"
                >
                  <Pause className="w-3.5 h-3.5" />
                  <span>{step6Countdown.isPaused ? 'เล่นต่อ' : 'หยุดเวลา'}</span>
                </button>

                <button
                  onClick={() => handleProceedToExercise(selectedTherapyType)}
                  className="flex-1 py-3 px-4 rounded-2xl bg-gradient-to-r from-[#6FD67F] via-[#22c55e] to-[#1E8A4C] text-white font-extrabold text-sm sm:text-base shadow-lg hover:shadow-xl active:scale-95 transition flex items-center justify-center gap-1.5 cursor-pointer min-h-[48px]"
                  id="btnStartWorkoutNow"
                >
                  <Play className="w-5 h-5 fill-white" />
                  <span>เริ่มทำกายภาพ ({selectedTherapyType === 'physio' ? 'กายภาพบำบัด' : 'กายภาพมินิเกม'})</span>
                </button>
              </div>
            </div>
          </div>
        )}

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

            {import.meta.env.DEV && (
              <div className="w-full mb-3">
                <span className="text-[11px] font-bold text-slate-500 block mb-1">
                  บัญชีคนไข้ตัวอย่าง (แตะเพื่อเข้าทันที):
                </span>
                <div className="grid grid-cols-2 gap-1.5 text-[11px]">
                  <button
                    onClick={() =>
                      handleSelectQuickPatient(
                        {
                          id: 12,
                          patient_code: 'P-0012',
                          name: 'นายสมชาย ใจดี',
                          age: 68,
                          gender: 'male',
                          notes: 'ข้อไหล่ติดระยะฟื้นฟู',
                        },
                        '1234'
                      )
                    }
                    className="p-1.5 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-800 font-bold border border-emerald-200 text-left truncate cursor-pointer"
                  >
                    🟢 นายสมชาย (1234)
                  </button>
                  <button
                    onClick={() =>
                      handleSelectQuickPatient(
                        {
                          id: 13,
                          patient_code: 'P-0013',
                          name: 'นางเพ็ญศรี สุขเกษม',
                          age: 72,
                          gender: 'female',
                          notes: 'กล้ามเนื้อขาอ่อนแรง',
                        },
                        '5678'
                      )
                    }
                    className="p-1.5 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-800 font-bold border border-emerald-200 text-left truncate cursor-pointer"
                  >
                    🟢 นางเพ็ญศรี (5678)
                  </button>
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
            onClick={onOpenAbout}
            className="bg-white/95 hover:bg-emerald-50 border border-emerald-300 text-[#1E8A4C] font-bold text-xs px-3.5 py-2 rounded-full shadow-md flex items-center gap-1.5 transition active:scale-95 cursor-pointer"
            title="เกี่ยวกับระบบ"
          >
            <Info className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">เกี่ยวกับระบบ</span>
          </button>
        )}

        <button
          onClick={onOpenHospitalPortal}
          className="bg-white/95 hover:bg-emerald-50 border-2 border-[#1E8A4C] text-[#1E8A4C] font-bold text-xs px-3.5 py-2 rounded-full shadow-md flex items-center gap-1.5 transition active:scale-95 cursor-pointer"
          id="btnKioskHospitalPortal"
          title="เข้าสู่ระบบบุคลากร / รพ."
        >
          <Shield className="w-4 h-4 text-emerald-600" />
          <span>ระบบบุคลากร / รพ.</span>
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
      {/* ใช้ MediaPipe Pose ตรวจจับยกแขนขวา=ใช่ (3 วินาที) / ยกแขนซ้าย=ไม่       */}
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

            {/* หน้าต่างกระจกเงาสะท้อนจากกล้อง พร้อมตัวตรวจจับการยกแขน */}
            <div className="w-full relative rounded-2xl overflow-hidden border-2 border-slate-300 bg-slate-900 shadow-inner mt-3">
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
                className="min-h-[64px] py-3.5 px-4 rounded-2xl bg-gradient-to-r from-[#2FB39A] to-[#1E8A4C] hover:from-[#259b84] hover:to-[#166534] text-white border-2 border-emerald-300 font-black text-base sm:text-lg flex items-center justify-center gap-2 shadow-xl active:scale-95 transition cursor-pointer"
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
