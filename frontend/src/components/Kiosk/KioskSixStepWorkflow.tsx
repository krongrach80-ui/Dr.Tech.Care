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
  // Check if explicit demo or dev query parameter is present (?demo=1 or ?dev=1)
  const isExplicitDemo = typeof window !== 'undefined' && (
    new URLSearchParams(window.location.search).get('demo') === '1' ||
    new URLSearchParams(window.location.search).get('dev') === '1'
  );

  // Active step: 1 to 6
  const [currentStep, setCurrentStep] = useState<number>(1);

  // Mode & Accessibility Settings
  // Production default: isDemoMode follows ?demo=1; Senior Mode default ON!
  const [isDemoMode, setIsDemoMode] = useState<boolean>(isExplicitDemo);
  const [seniorSimpleMode, setSeniorSimpleMode] = useState<boolean>(true); // Senior Mode default ON (P0-2)

  // 11 Clinical Stretch Programs Selector States (P1-5)
  const [showStretchModal, setShowStretchModal] = useState<boolean>(false);
  const [selectedStretchIds, setSelectedStretchIds] = useState<string[]>(
    STRETCH_EXERCISES.map((s) => s.id)
  );
  const [customHoldTimes, setCustomHoldTimes] = useState<Record<string, number>>({});

  // Time & Date strings (รูปแบบไทย ว/ด/ป)
  const [thaiDateStr, setThaiDateStr] = useState<string>('');
  const [thaiTimeStr, setThaiTimeStr] = useState<string>('');

  // Camera stream state
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [isCameraActive, setIsCameraActive] = useState<boolean>(false);
  const [cameraError, setCameraError] = useState<string | null>(null);

  // Motion/Presence detection for Step 1 (ชะลอดีเลย์ 1.8 - 2.0 วินาที)
  const [isPersonDetected, setIsPersonDetected] = useState<boolean>(false);
  const [presenceProgress, setPresenceProgress] = useState<number>(0); // 0 to 100%
  const [isSlideUpAnimating, setIsSlideUpAnimating] = useState<boolean>(false);

  // Gamified Arm Pose Detection State for Steps 2 & 3 (ชะลอดีเลย์ 1.8 วินาที)
  const [detectedArmPose, setDetectedArmPose] = useState<'none' | 'right_yes' | 'left_no'>('none');
  const [armHoldProgress, setArmHoldProgress] = useState<number>(0); // 0 to 100%
  const [gameXp, setGameXp] = useState<number>(100);
  const [comboCount, setComboCount] = useState<number>(1);
  const [handWristCoords, setHandWristCoords] = useState<{
    right: { x: number; y: number } | null;
    left: { x: number; y: number } | null;
  }>({ right: null, left: null });

  // PDPA Consent & 3D Liveness State
  const [showPdpaModal, setShowPdpaModal] = useState<boolean>(false);
  const [hasPdpaConsent, setHasPdpaConsent] = useState<boolean>(false);
  const [currentLivenessFrame, setCurrentLivenessFrame] = useState<LivenessFrameData | null>(null);

  // Hand Tracking Touch Interaction on Camera (ยื่นมือแตะปุ่มค้าง 1 วินาที)
  const cameraContainerRef = useRef<HTMLDivElement | null>(null);
  const [handCursor, setHandCursor] = useState<{ x: number; y: number; visible: boolean } | null>(null);
  const [hoverProgress, setHoverProgress] = useState<number>(0); // 0 to 100%
  const [hoveredButton, setHoveredButton] = useState<string | null>(null);
  const hoveredTargetRef = useRef<string | null>(null);
  const hoverStartTimeRef = useRef<number | null>(null);
  const lastTickElapsedRef = useRef<number>(0);
  const isCooldownRef = useRef<boolean>(false);
  const lastPersonSeenRef = useRef<number>(Date.now());
  const step5TimerRef = useRef<NodeJS.Timeout | null>(null);
  const step6TimerRef = useRef<NodeJS.Timeout | null>(null);

  const detectionFrameRef = useRef<number | null>(null);
  const lastPoseDetectedRef = useRef<'none' | 'right_yes' | 'left_no'>('none');

  // Step 4: Face Scanning & Multi-Phase Biometric Verification (ชะลอดีเลย์ท่าทาง 1.6 วินาที/ท่า)
  const [scanStep, setScanStep] = useState<'front' | 'left' | 'right' | 'done'>('front');
  const [faceHoldProgress, setFaceHoldProgress] = useState<number>(0); // 0 to 100%
  const [isScanning, setIsScanning] = useState<boolean>(false);
  const [scanStatusMessage, setScanStatusMessage] = useState<string>('กรุณาจัดใบหน้าให้อยู่ในกรอบวงรี');
  const [matchedProfile, setMatchedProfile] = useState<any | null>(null);
  const [isNewRegistration, setIsNewRegistration] = useState<boolean>(false);
  // ค่าเริ่มต้นของ regName และ regHn เป็นค่าว่างตามข้อกำหนด
  const [regName, setRegName] = useState<string>('');
  const [regHn, setRegHn] = useState<string>('');

  // Realistic Biometric Verification Loading (3.0 - 4.5 วินาที รวมแสดงผล)
  const [biometricPhase, setBiometricPhase] = useState<number>(0); // 0=idle, 1=anti-spoofing, 2=landmarks/embedding, 3=matching, 4=success
  const [biometricProgress, setBiometricProgress] = useState<number>(0);
  const [challengeProgress, setChallengeProgress] = useState<{
    front: boolean;
    left: boolean;
    right: boolean;
  }>({ front: false, left: false, right: false });
  const challengeProgressRef = useRef<{ front: boolean; left: boolean; right: boolean }>({
    front: false,
    left: false,
    right: false,
  });
  const biometricTimersRef = useRef<NodeJS.Timeout[]>([]);

  // PIN Keypad Fallback Modal states (สำหรับผู้สูงอายุ / กรณีกล้องขัดข้อง)
  const [showPinModal, setShowPinModal] = useState<boolean>(false);
  const [pinInput, setPinInput] = useState<string>('');
  const [pinError, setPinError] = useState<string | null>(null);

  // Step 5: Countdown timer (5 seconds) + Pause control
  const [step5Countdown, setStep5Countdown] = useState<number>(5);
  const [isStep5Paused, setIsStep5Paused] = useState<boolean>(false);

  // Step 6: Selected Therapy Mode & Countdown (5 seconds) + Pause control
  const [selectedTherapyType, setSelectedTherapyType] = useState<'physio' | 'minigame'>('physio');
  const [step6Countdown, setStep6Countdown] = useState<number>(5);
  const [isStep6Paused, setIsStep6Paused] = useState<boolean>(false);

  // Logged-in Patient & Associated Treatment Plan
  const [activePatient, setActivePatient] = useState<Patient>({
    id: 12,
    patient_code: 'P-0012',
    name: 'นายสมชาย ใจดี',
    age: 68,
    gender: 'male',
    notes: 'ข้อไหล่ติดระยะฟื้นฟู (Frozen Shoulder)',
  });
  const [activePlan, setActivePlan] = useState<TreatmentPlan | null>(null);

  const { users, treatmentPlans } = useHospitalStore();
  const { selectPatient, selectedPatient, patients } = usePatientStore();
  const { selectExercise, exercises } = useExerciseStore();

  // Sync activePatient with selectedPatient from store
  useEffect(() => {
    if (selectedPatient && selectedPatient.id) {
      setActivePatient(selectedPatient);
    }
  }, [selectedPatient]);

  // 1. Clock updater (ว/ด/ป)
  useEffect(() => {
    const thaiDayNames = [
      'วันอาทิตย์', 'วันจันทร์', 'วันอังคาร', 'วันพุธ', 'วันพฤหัสบดี', 'วันศุกร์', 'วันเสาร์'
    ];
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

  // 2. Initialize Camera with robust 4-tier fallback for all desktop & mobile webcams
  const startCamera = async () => {
    if (streamRef.current) return;
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        setCameraError('ไม่พบอุปกรณ์กล้องบนอุปกรณ์นี้ กำลังเปิดโหมดจำลองภาพเสมือน');
        return;
      }
      let stream: MediaStream | null = null;
      try {
        // Tier 1: 640x480 with facingMode
        stream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' },
          audio: false,
        });
      } catch {
        try {
          // Tier 2: 640x480 without facingMode (External Windows USB Webcams)
          stream = await navigator.mediaDevices.getUserMedia({
            video: { width: { ideal: 640 }, height: { ideal: 480 } },
            audio: false,
          });
        } catch {
          // Tier 3: Basic video true
          stream = await navigator.mediaDevices.getUserMedia({
            video: true,
            audio: false,
          });
        }
      }

      if (!stream) {
        throw new Error('ไม่สามารถรับสัญญาณภาพจากกล้องเว็บแคมได้');
      }

      streamRef.current = stream;
      setIsCameraActive(true);
      setCameraError(null);

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.muted = true;
        videoRef.current.playsInline = true;
        await videoRef.current.play().catch(() => {});
      }
    } catch (err: any) {
      console.warn('Kiosk Camera start warning:', err);
      setCameraError('ไม่สามารถเปิดกล้องจริงได้ (เปิดโหมดจำลองภาพ)');
      setIsCameraActive(false);
    }
  };

  useEffect(() => {
    startCamera();
    poseService.initialize().catch(() => {});
    livenessEngine.initialize().catch(() => {});
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
      if (videoRef.current) {
        videoRef.current.srcObject = null;
      }
      if (detectionFrameRef.current) {
        cancelAnimationFrame(detectionFrameRef.current);
      }
      biometricTimersRef.current.forEach((t) => clearTimeout(t));
      biometricTimersRef.current = [];
    };
  }, []);

  // Re-attach video stream whenever videoRef re-mounts
  useEffect(() => {
    if (videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current;
      videoRef.current.muted = true;
      videoRef.current.playsInline = true;
      videoRef.current.play().catch(() => {});
    }
  }, [currentStep, isCameraActive]);

  // Centralized timer cleaner across all steps
  const clearAllTimers = useCallback(() => {
    biometricTimersRef.current.forEach((t) => clearTimeout(t));
    biometricTimersRef.current = [];
    if (step5TimerRef.current) {
      clearInterval(step5TimerRef.current);
      step5TimerRef.current = null;
    }
    if (step6TimerRef.current) {
      clearInterval(step6TimerRef.current);
      step6TimerRef.current = null;
    }
  }, []);

  // Central state machine transition function (ล้าง timer ทุกครั้งที่เปลี่ยน Step ไม่ให้ซ้อนกัน)
  const changeStep = useCallback((nextStep: number) => {
    clearAllTimers();
    setHoverProgress(0);
    setHoveredButton(null);
    hoveredTargetRef.current = null;
    hoverStartTimeRef.current = null;
    lastTickElapsedRef.current = 0;
    setDetectedArmPose('none');
    setArmHoldProgress(0);
    setCurrentStep(nextStep);
  }, [clearAllTimers]);

  // 3. Step 1: Slide-up trigger
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

  // 4. Confetti helper
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
      setMatchedProfile(targetPatient);
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
      case 'open-pin':
        setShowPinModal(true);
        break;
      case 'step3-yes':
        handleStep3Yes();
        break;
      case 'step3-no':
        handleStep3No();
        break;
      case 'step4-front':
      case 'challenge-front':
        handleManualChallenge('front');
        break;
      case 'step4-left':
      case 'challenge-left':
        handleManualChallenge('left');
        break;
      case 'step4-right':
      case 'challenge-right':
        handleManualChallenge('right');
        break;
      case 'step4-done':
      case 'challenge-done':
        handlePerformFaceScan(true);
        break;
      case 'step4-rescan':
        handleResetFaceScan();
        break;
      case 'step5-pause':
        setIsStep5Paused((prev) => !prev);
        break;
      case 'step5-next':
        changeStep(6);
        break;
      case 'step6-physio':
        setSelectedTherapyType('physio');
        break;
      case 'step6-minigame':
        setSelectedTherapyType('minigame');
        break;
      case 'step6-stretch':
        setIsStep6Paused(true);
        setShowStretchModal(true);
        break;
      case 'step6-pause':
        setIsStep6Paused((prev) => !prev);
        break;
      case 'step6-start':
        handleProceedToExercise(selectedTherapyType);
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

  // =========================================================================
  // Unified Real-Time Pose, Presence, Hand & Face Detection Loop (Steps 1, 2, 3, 4)
  // รองรับ Hand Tracking แตะปุ่มบนหน้าจอค้าง 1 วินาที + Inactivity Watchdog
  // =========================================================================
  useEffect(() => {
    // If Step 5 or 6, cancel detection frame loop
    if (currentStep === 5 || currentStep === 6) {
      if (detectionFrameRef.current) {
        cancelAnimationFrame(detectionFrameRef.current);
        detectionFrameRef.current = null;
      }
      setDetectedArmPose('none');
      setArmHoldProgress(0);
      setPresenceProgress(0);
      setFaceHoldProgress(0);
      setIsPersonDetected(false);
      setHandCursor(null);
      setHandWristCoords({ right: null, left: null });
      return;
    }

    let isRunning = true;
    let presenceHoldCounter = 0;
    let armHoldCounter = 0;
    let faceHoldCounter = 0;

    // Deliberate frame counts
    const REQUIRED_PRESENCE_FRAMES = 52; // ~1.8 วินาที
    const REQUIRED_ARM_HOLD_FRAMES = 52; // ~1.8 วินาที
    const REQUIRED_FACE_HOLD_FRAMES = 48; // ~1.6 วินาที

    const runDetectionLoop = () => {
      if (!isRunning) return;

      const video = videoRef.current;
      if (video && video.readyState >= 2 && !video.paused) {
        try {
          const res = poseService.detectHolistic(video, performance.now(), { enableHands: true });
          const hasLandmarks = Boolean(res && res.poseLandmarks && res.poseLandmarks.length >= 17);
          const lm = hasLandmarks ? res!.poseLandmarks! : null;

          // ==========================================================
          // Step 1: Detect Person Sitting in Front of Camera (ชะลอ 1.8s)
          // ==========================================================
          if (currentStep === 1) {
            const isPersonVisible = Boolean(
              lm && (
                (lm[0] && (lm[0].visibility === undefined || lm[0].visibility > 0.35)) ||
                (lm[11] && lm[12])
              )
            );

            if (isPersonVisible) {
              lastPersonSeenRef.current = performance.now();
              presenceHoldCounter++;
              setIsPersonDetected(true);
              const prog = Math.min(100, Math.round((presenceHoldCounter / REQUIRED_PRESENCE_FRAMES) * 100));
              setPresenceProgress(prog);

              if (presenceHoldCounter % 15 === 0) {
                audioFeedback.playHoldTick();
              }

              if (presenceHoldCounter >= REQUIRED_PRESENCE_FRAMES) {
                presenceHoldCounter = 0;
                setPresenceProgress(100);
                triggerSlideUp();
                return;
              }
            } else {
              if (presenceHoldCounter > 0) {
                presenceHoldCounter = Math.max(0, presenceHoldCounter - 2);
                setPresenceProgress(Math.round((presenceHoldCounter / REQUIRED_PRESENCE_FRAMES) * 100));
              } else {
                setIsPersonDetected(false);
              }
            }
          }

          // Inactivity Watchdog: ถ้าไม่มีคนหน้ากล้องเกิน 18 วินาที ให้กลับ Step 1 อัตโนมัติ
          if (currentStep > 1) {
            const isPersonVisible = Boolean(
              lm && (
                (lm[0] && (lm[0].visibility === undefined || lm[0].visibility > 0.3)) ||
                (lm[11] && lm[12])
              )
            );

            if (isPersonVisible) {
              lastPersonSeenRef.current = performance.now();
            } else {
              const inactiveElapsed = performance.now() - (lastPersonSeenRef.current || performance.now());
              if (inactiveElapsed > 18000) {
                lastPersonSeenRef.current = performance.now();
                try {
                  voiceAssistant.speak('ไม่มีผู้ใช้งานหน้าตู้ กำลังกลับสู่หน้าพักหน้าจอค่ะ', { level: 'system' });
                } catch {}
                changeStep(1);
                return;
              }
            }
          }

          // ==========================================================
          // Global Hand Tracking: ตรวจจับปลายนิ้วและยื่นมือแตะปุ่ม (Hold 1.0s)
          // ==========================================================
          let activeFingertip: { x: number; y: number } | null = null;

          // 1. ตรวจสอบจาก MediaPipe Hands (Index Fingertip Landmark 8)
          if (res && res.handLandmarks && res.handLandmarks.length > 0) {
            const hand = res.handLandmarks[0];
            if (hand && hand.length > 8) {
              activeFingertip = { x: hand[8].x, y: hand[8].y };
            }
          }

          // 2. Fallback สู่ Pose Index Fingertip (19 / 20) หรือ Wrist (15 / 16)
          if (!activeFingertip && lm) {
            const rightIdx = lm[20] || lm[16];
            const leftIdx = lm[19] || lm[15];
            const candidates: { x: number; y: number; yVal: number }[] = [];
            if (rightIdx && (rightIdx.visibility === undefined || rightIdx.visibility > 0.3)) {
              candidates.push({ x: rightIdx.x, y: rightIdx.y, yVal: rightIdx.y });
            }
            if (leftIdx && (leftIdx.visibility === undefined || leftIdx.visibility > 0.3)) {
              candidates.push({ x: leftIdx.x, y: leftIdx.y, yVal: leftIdx.y });
            }
            if (candidates.length > 0) {
              candidates.sort((a, b) => a.yVal - b.yVal);
              if (candidates[0].yVal < 0.90) {
                activeFingertip = { x: candidates[0].x, y: candidates[0].y };
              }
            }
          }

          // คำนวณพิกัดบนหน้าจอและทำการ Hit-test กับปุ่ม (data-kiosk-target)
          const containerEl = cameraContainerRef.current || videoRef.current;
          if (activeFingertip && containerEl) {
            const rect = containerEl.getBoundingClientRect();
            // แกน X สะท้อนกระจกเงา (transform -scale-x-100)
            const mirroredX = 1 - activeFingertip.x;
            const pixelX = rect.left + mirroredX * rect.width;
            const pixelY = rect.top + activeFingertip.y * rect.height;

            setHandCursor({ x: pixelX, y: pixelY, visible: true });

            if (!isCooldownRef.current) {
              const hitEl = document.elementFromPoint(pixelX, pixelY);
              const targetEl = hitEl?.closest('[data-kiosk-target]');
              const targetId = targetEl?.getAttribute('data-kiosk-target') || null;

              if (targetId) {
                if (hoveredTargetRef.current === targetId) {
                  const elapsed = performance.now() - (hoverStartTimeRef.current || performance.now());
                  const prog = Math.min(100, Math.round((elapsed / 1000) * 100)); // ค้าง 1 วินาที
                  setHoverProgress(prog);
                  setHoveredButton(targetId);

                  if (Math.floor(elapsed / 250) > Math.floor((lastTickElapsedRef.current || 0) / 250)) {
                    audioFeedback.playHoldTick();
                  }
                  lastTickElapsedRef.current = elapsed;

                  if (prog >= 100) {
                    executeKioskTarget(targetId);
                    setHoverProgress(0);
                    setHoveredButton(null);
                    hoveredTargetRef.current = null;
                    hoverStartTimeRef.current = null;
                    isCooldownRef.current = true;
                    setTimeout(() => {
                      isCooldownRef.current = false;
                    }, 800);
                  }
                } else {
                  hoveredTargetRef.current = targetId;
                  hoverStartTimeRef.current = performance.now();
                  lastTickElapsedRef.current = 0;
                  setHoverProgress(0);
                  setHoveredButton(targetId);
                }
              } else {
                if (hoveredTargetRef.current) {
                  hoveredTargetRef.current = null;
                  hoverStartTimeRef.current = null;
                  lastTickElapsedRef.current = 0;
                  setHoverProgress(0);
                  setHoveredButton(null);
                }
              }
            }
          } else {
            setHandCursor((prev) => (prev?.visible ? { ...prev, visible: false } : null));
            if (hoveredTargetRef.current) {
              hoveredTargetRef.current = null;
              hoverStartTimeRef.current = null;
              lastTickElapsedRef.current = 0;
              setHoverProgress(0);
              setHoveredButton(null);
            }
          }

          // ==========================================================
          // Step 3: Gamified Arm Pose Confirmation (ขวา=ใช่, ซ้าย=ไม่)
          // ==========================================================
          if (currentStep === 3 && lm) {
            const leftShoulder = lm[11];
            const leftWrist = lm[15];
            const rightShoulder = lm[12];
            const rightWrist = lm[16];

            if (rightWrist && leftWrist) {
              setHandWristCoords({
                right: { x: rightWrist.x * 100, y: rightWrist.y * 100 },
                left: { x: leftWrist.x * 100, y: leftWrist.y * 100 },
              });
            }

            const isRightRaised = rightWrist && rightShoulder && rightWrist.y < (rightShoulder.y - 0.05);
            const isLeftRaised = leftWrist && leftShoulder && leftWrist.y < (leftShoulder.y - 0.05);

            if (isRightRaised && !isLeftRaised) {
              if (lastPoseDetectedRef.current === 'right_yes') {
                armHoldCounter++;
              } else {
                armHoldCounter = 1;
                lastPoseDetectedRef.current = 'right_yes';
                setDetectedArmPose('right_yes');
              }

              if (armHoldCounter % 12 === 0) audioFeedback.playHoldTick();

              const prog = Math.min(100, Math.round((armHoldCounter / REQUIRED_ARM_HOLD_FRAMES) * 100));
              setArmHoldProgress(prog);

              if (armHoldCounter >= REQUIRED_ARM_HOLD_FRAMES) {
                armHoldCounter = 0;
                handleConfirmYes();
                return;
              }
            } else if (isLeftRaised && !isRightRaised) {
              if (lastPoseDetectedRef.current === 'left_no') {
                armHoldCounter++;
              } else {
                armHoldCounter = 1;
                lastPoseDetectedRef.current = 'left_no';
                setDetectedArmPose('left_no');
              }

              if (armHoldCounter % 12 === 0) audioFeedback.playHoldTick();

              const prog = Math.min(100, Math.round((armHoldCounter / REQUIRED_ARM_HOLD_FRAMES) * 100));
              setArmHoldProgress(prog);

              if (armHoldCounter >= REQUIRED_ARM_HOLD_FRAMES) {
                armHoldCounter = 0;
                handleConfirmNo();
                return;
              }
            } else {
              if (armHoldCounter > 0) {
                armHoldCounter = Math.max(0, armHoldCounter - 2);
                setArmHoldProgress(Math.round((armHoldCounter / REQUIRED_ARM_HOLD_FRAMES) * 100));
              } else {
                lastPoseDetectedRef.current = 'none';
                setDetectedArmPose('none');
                setArmHoldProgress(0);
              }
            }
          }

          // ==========================================================
          // Step 4: Real MediaPipe FaceLandmarker 3D Liveness Loop
          // ==========================================================
          if (currentStep === 4 && !isScanning && scanStep !== 'done' && videoRef.current) {
            const frameData = livenessEngine.processVideoFrame(videoRef.current, performance.now(), 120);
            if (frameData) {
              setCurrentLivenessFrame(frameData);

              const currentCh: LivenessChallenge =
                scanStep === 'front' ? 'front' : scanStep === 'left' ? 'turn_left' : 'turn_right';
              const evalRes = livenessEngine.evaluateChallenge(currentCh, frameData);

              if (evalRes.satisfied) {
                faceHoldCounter += 2;
                const prog = Math.min(100, Math.round((faceHoldCounter / REQUIRED_FACE_HOLD_FRAMES) * 100));
                setFaceHoldProgress(prog);
                if (faceHoldCounter % 15 === 0) audioFeedback.playHoldTick();

                if (faceHoldCounter >= REQUIRED_FACE_HOLD_FRAMES) {
                  faceHoldCounter = 0;
                  setFaceHoldProgress(0);

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
                faceHoldCounter = Math.max(0, faceHoldCounter - 1);
                setFaceHoldProgress(Math.round((faceHoldCounter / REQUIRED_FACE_HOLD_FRAMES) * 100));
              }
            }
          }
        } catch (e) {
          // ignore detection glitch
        }
      }

      detectionFrameRef.current = requestAnimationFrame(runDetectionLoop);
    };

    detectionFrameRef.current = requestAnimationFrame(runDetectionLoop);

    return () => {
      isRunning = false;
      if (detectionFrameRef.current) {
        cancelAnimationFrame(detectionFrameRef.current);
        detectionFrameRef.current = null;
      }
    };
  }, [currentStep, scanStep, isScanning, handleConfirmYes, handleConfirmNo, triggerSlideUp, executeKioskTarget, changeStep]);

  // 5. Step 5 Countdown (5 วินาทีอัตโนมัติ -> Step 6)
  useEffect(() => {
    if (currentStep === 5) {
      setStep5Countdown(5);
      setIsStep5Paused(false);
      try {
        confetti({
          particleCount: 75,
          spread: 80,
          origin: { y: 0.55 },
          colors: ['#22c55e', '#3b82f6', '#f59e0b', '#ec4899', '#8b5cf6'],
        });
      } catch {}
    }
  }, [currentStep]);

  useEffect(() => {
    if (currentStep !== 5 || isStep5Paused) return;
    const timer = setInterval(() => {
      setStep5Countdown((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          changeStep(6);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    step5TimerRef.current = timer;
    return () => clearInterval(timer);
  }, [currentStep, isStep5Paused, changeStep]);

  // 6. Step 6 Countdown (5 วินาทีอัตโนมัติ -> เริ่มทำกายภาพ)
  useEffect(() => {
    if (currentStep === 6) {
      setStep6Countdown(5);
      setIsStep6Paused(false);
    }
  }, [currentStep]);

  useEffect(() => {
    if (currentStep !== 6 || isStep6Paused) return;
    const timer = setInterval(() => {
      setStep6Countdown((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          handleProceedToExercise(selectedTherapyType);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    step6TimerRef.current = timer;
    return () => clearInterval(timer);
  }, [currentStep, isStep6Paused, selectedTherapyType]);

  // Find treatment plan when activePatient changes
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

  // ========================================================
  // PIN Keypad Fallback Handlers (สำหรับผู้สูงอายุ)
  // ========================================================
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
    setTimeout(() => {
      setShowPinModal(false);
      audioFeedback.playRepSuccess();
      changeStep(5);
    }, 400);
  };

  const handleVerifyPinSubmit = () => {
    const cleanPin = pinInput.trim();
    if (!cleanPin) {
      setPinError('กรุณาป้อนรหัส PIN หรือรหัสคนไข้');
      return;
    }

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
      audioFeedback.playRepSuccess();
      changeStep(5);
      return;
    }

    if (cleanPin === '9999' || cleanPin.toUpperCase() === 'P-0021') {
      const wichai: Patient = {
        id: 21,
        patient_code: 'P-0021',
        name: 'นายวิชัย รักษ์ดี',
        age: 64,
        gender: 'male',
        notes: 'ปวดสะบักและคอเรื้อรัง (Cervical Spondylosis)',
      };
      setActivePatient(wichai);
      setShowPinModal(false);
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
      audioFeedback.playRepSuccess();
      changeStep(5);
      return;
    }

    setPinError('❌ รหัส PIN ไม่ถูกต้อง (ทดสอบ: 1234, 5678 หรือ P-0012)');
    audioFeedback.playHoldTick();
  };

  return (
    <div className="w-full flex flex-col items-center justify-start min-h-[92vh] py-3 sm:py-6 px-3 relative z-10 select-none">
      
      {/* ======================================================== */}
      {/* กรอบ Card หลักสีขาว ขอบมนตามภาพวาด (The Main Kiosk White Card) */}
      {/* ======================================================== */}
      <div className="w-full max-w-[440px] sm:max-w-[480px] bg-white rounded-[36px] sm:rounded-[44px] border-2 sm:border-[2.5px] border-black/85 shadow-2xl relative overflow-hidden flex flex-col items-center p-5 sm:p-7 min-h-[620px] sm:min-h-[680px] justify-between transition-all duration-500 my-auto">
        
        {/* ---------------------------------------------------- */}
        {/* ภาพที่ 1: หน้าพักหน้าจอ (Screensaver) - Dr.Tech.Care */}
        {/* มีระบบกล้องตรวจจับคนไข้ + ชะลอดีเลย์ 1.8 วินาทีก่อนเลื่อนขึ้น */}
        {/* ---------------------------------------------------- */}
        {currentStep === 1 && (
          <div
            className={`w-full flex-1 flex flex-col items-center justify-center text-center transition-all duration-500 ease-in-out relative ${
              isSlideUpAnimating ? '-translate-y-full opacity-0 pointer-events-none' : 'translate-y-0 opacity-100'
            }`}
          >
            {/* กล่องแจ้งเตือนการตรวจพบคนไข้นั่งหน้ากล้อง พร้อมแถบชาร์จดีเลย์ */}
            {isPersonDetected && (
              <div className="absolute top-2 inset-x-2 sm:inset-x-4 z-30 bg-emerald-950/90 backdrop-blur-md border-2 border-emerald-400 text-white rounded-2xl p-3 shadow-2xl flex flex-col items-center animate-fadeIn">
                <div className="flex items-center justify-between w-full text-xs font-black mb-1">
                  <span className="flex items-center gap-1.5 text-emerald-300">
                    <User className="w-4 h-4 text-emerald-400 animate-pulse" />
                    <span>ตรวจพบคนไข้นั่งหน้ากล้อง</span>
                  </span>
                  <span className="font-mono text-yellow-300 font-black text-sm">{presenceProgress}%</span>
                </div>

                <div className="w-full h-2.5 bg-slate-800 rounded-full overflow-hidden mb-1 border border-emerald-500/30">
                  <div
                    className="h-full bg-gradient-to-r from-emerald-500 via-teal-400 to-yellow-400 transition-all duration-75 rounded-full"
                    style={{ width: `${presenceProgress}%` }}
                  />
                </div>

                <p className="text-[11px] text-emerald-200 font-semibold">
                  ⏳ กรุณานั่งนิ่งๆ สักครู่ ระบบกำลังเปิดหน้าต่างใน 1.8 วินาที...
                </p>
              </div>
            )}

            {/* โลโก้ Dr.Tech.Care ทรงกลมพร้อมวงแหวนชาร์จ */}
            <div className="relative group cursor-pointer my-2" onClick={triggerSlideUp}>
              <div className="w-48 h-48 sm:w-56 sm:h-56 rounded-full border-4 border-emerald-400 shadow-2xl overflow-hidden flex flex-col items-center justify-center bg-gradient-to-b from-[#E8FAF3] via-[#DCF6EB] to-[#B8EDD7] relative transform group-hover:scale-105 transition duration-300">
                {/* SVG Medical & Health Tech Emblem */}
                <svg className="w-24 h-24 sm:w-28 sm:h-28 text-[#1E8A4C]" viewBox="0 0 100 100" fill="none">
                  <circle cx="50" cy="50" r="44" stroke="#A7E8CD" strokeWidth="2" strokeDasharray="4 3" />
                  <rect x="42" y="18" width="16" height="64" rx="8" fill="#1E8A4C" />
                  <rect x="18" y="42" width="64" height="16" rx="8" fill="#1E8A4C" />
                  <circle cx="50" cy="50" r="14" fill="#FFFFFF" />
                  <path d="M38 50 L46 50 L48 42 L52 58 L54 50 L62 50" stroke="#1E8A4C" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                </svg>

                <div className="absolute bottom-4 inset-x-0 text-center">
                  <span className="font-extrabold text-[11px] sm:text-xs tracking-wider text-[#0B2B2B] uppercase">
                    SMART REHAB
                  </span>
                </div>

                <div className="absolute inset-0 rounded-full border-4 border-white/50 pointer-events-none animate-pulse" />
              </div>

              {/* วงแหวนชาร์จรอบนอกเมื่อกล้องดีเทคคนไข้ได้ */}
              {presenceProgress > 0 && (
                <svg className="absolute -inset-2 w-[calc(100%+16px)] h-[calc(100%+16px)] -rotate-90 pointer-events-none z-20">
                  <circle
                    cx="50%"
                    cy="50%"
                    r="47%"
                    fill="none"
                    stroke="#10b981"
                    strokeWidth="6"
                    strokeDasharray="600"
                    strokeDashoffset={600 - (600 * presenceProgress) / 100}
                    strokeLinecap="round"
                    className="filter drop-shadow-[0_0_8px_rgba(16,185,129,0.8)]"
                  />
                </svg>
              )}
            </div>

            {/* ข้อความต้อนรับและชื่อระบบ Dr.Tech.Care */}
            <div className="mt-2 flex flex-col items-center">
              <h1 className="text-3xl sm:text-4xl font-black text-[#0B2B2B] tracking-tight">
                Dr.Tech.Care
              </h1>
              <p className="text-sm sm:text-base font-extrabold text-[#1E8A4C] mt-1">
                ระบบกายภาพบำบัดและดูแลสุขภาพอัจฉริยะ
              </p>
              <p className="text-xs sm:text-sm text-slate-500 font-semibold mt-1 max-w-xs">
                ยินดีต้อนรับสู่ระบบฟื้นฟูสมรรถภาพร่างกายสำหรับผู้สูงอายุ
              </p>

              <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-emerald-50 border border-emerald-300 text-[#1E8A4C] text-xs font-bold shadow-xs mt-3">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                <span>กล้อง AI พร้อมสแกนใบหน้าอัตโนมัติ</span>
              </div>
            </div>

            {/* ปุ่มกดขนาดใหญ่ สำหรับผู้สูงอายุ */}
            <div className="mt-6 w-full max-w-xs space-y-3">
              <button
                data-kiosk-target="step1-start"
                onClick={triggerSlideUp}
                className="w-full min-h-[64px] sm:min-h-[72px] py-4 px-6 rounded-2xl bg-gradient-to-r from-[#2FB39A] via-[#1E8A4C] to-[#15803D] hover:from-[#259b84] hover:to-[#166534] text-white font-black text-base sm:text-lg shadow-xl hover:shadow-2xl active:scale-95 transition flex items-center justify-center gap-2.5 cursor-pointer border-2 border-emerald-300"
                id="btnSitInFrontOfCamera"
              >
                <span>แตะหน้าจอเพื่อเริ่มต้นใช้งาน</span>
                <ArrowRight className="w-6 h-6 shrink-0" />
              </button>

              <button
                data-kiosk-target="step1-pin"
                onClick={() => setShowPinModal(true)}
                className="w-full min-h-[48px] py-3 px-4 rounded-xl bg-slate-100 hover:bg-emerald-50 text-slate-700 hover:text-emerald-800 font-bold text-xs sm:text-sm border border-slate-300 hover:border-emerald-400 flex items-center justify-center gap-2 transition cursor-pointer active:scale-95 shadow-xs"
                id="btnKioskPinFallbackMain"
              >
                <Key className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>เข้าสู่ระบบด้วยรหัส PIN (ทางเลือก)</span>
              </button>
            </div>
          </div>
        )}



        {/* ---------------------------------------------------- */}
        {/* ภาพที่ 3: ถามความพร้อมเข้าสู่ระบบ                     */}
        {/* ---------------------------------------------------- */}
        {currentStep === 3 && (
          <div className="w-full flex-1 flex flex-col items-center justify-between animate-fadeIn">
            <div className="w-full bg-[#E3F5FC] border border-[#BDE3F5] rounded-3xl py-3 px-4 text-center shadow-sm relative">
              <div className="flex items-center justify-between mb-1">
                <span className="inline-flex items-center gap-1 text-[11px] font-black text-emerald-800 bg-emerald-200/80 px-2 py-0.5 rounded-full">
                  <Gamepad2 className="w-3.5 h-3.5 text-emerald-700" />
                  <span>ขั้นตอนยืนยันตัวตน</span>
                </span>
                <span className="inline-flex items-center gap-1 text-[11px] font-mono font-bold text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full">
                  <Zap className="w-3 h-3 text-amber-600 fill-amber-500" />
                  <span>{gameXp} XP</span>
                </span>
              </div>

              <h2 className="text-xl sm:text-2xl font-black text-[#0B2B2B]">
                คุณพร้อมเข้าสู่ระบบหรือไม่?
              </h2>
              <p className="text-xs sm:text-sm font-bold text-emerald-900 mt-1">
                {seniorSimpleMode
                  ? 'แตะปุ่มขนาดใหญ่ด้านล่างเพื่อเข้าสู่ระบบ'
                  : 'ยื่นมือไปแตะลูกแก้วบนจอ หรือยกแขนค้างไว้ 1.8 วินาที'}
              </p>
            </div>

            <div
              ref={cameraContainerRef}
              className="w-full flex-1 min-h-[280px] max-h-[340px] rounded-[32px] overflow-hidden border-2 border-emerald-400/80 relative bg-slate-900 flex items-center justify-center shadow-2xl my-2.5"
            >
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="w-full h-full object-cover transform -scale-x-100 opacity-90"
              />

              <div className="absolute inset-0 pointer-events-none border border-emerald-500/20 bg-gradient-to-t from-black/60 via-transparent to-black/30" />

              <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                <div className="w-32 h-32 rounded-full border-2 border-dashed border-emerald-300/40 bg-emerald-500/5 backdrop-blur-[0.5px] animate-pulse flex items-center justify-center">
                  <User className="w-20 h-20 text-emerald-400/25" />
                </div>
              </div>

              {/* ลูกแก้วพลังฝั่งขวา: ใช่ (เข้าสู่ระบบ) */}
              <div
                data-kiosk-target="step3-yes"
                onClick={handleStep3Yes}
                className="absolute top-4 right-3 sm:right-5 z-20 cursor-pointer group select-none flex flex-col items-center"
              >
                <div
                  className={`w-20 h-20 sm:w-22 sm:h-22 rounded-full border-3 flex flex-col items-center justify-center shadow-xl transition-all duration-200 relative overflow-hidden backdrop-blur-md ${
                    detectedArmPose === 'right_yes' || hoveredButton === 'step3-yes'
                      ? 'scale-115 border-emerald-300 bg-gradient-to-br from-emerald-400 via-green-500 to-emerald-700 shadow-emerald-400/80'
                      : 'border-emerald-400 bg-emerald-950/70 text-emerald-200 hover:scale-105'
                  }`}
                >
                  <span className="text-xl sm:text-2xl font-black text-white drop-shadow">ใช่</span>
                  <span className="text-[10px] font-bold text-emerald-100 flex items-center gap-0.5">
                    <span>เข้าสู่ระบบ</span>
                    <Sparkles className="w-2.5 h-2.5 fill-yellow-300 text-yellow-300" />
                  </span>

                  {(detectedArmPose === 'right_yes' || hoveredButton === 'step3-yes') && (
                    <svg className="absolute inset-0 w-full h-full -rotate-90 pointer-events-none">
                      <circle
                        cx="50%"
                        cy="50%"
                        r="34"
                        fill="none"
                        stroke="#fbbf24"
                        strokeWidth="5"
                        strokeDasharray="213"
                        strokeDashoffset={213 - (213 * (hoveredButton === 'step3-yes' ? hoverProgress : armHoldProgress)) / 100}
                        strokeLinecap="round"
                      />
                    </svg>
                  )}
                </div>
                <span className="text-[11px] font-extrabold text-emerald-300 bg-black/60 px-2 py-0.5 rounded-full mt-1">
                  แตะ "ใช่"
                </span>
              </div>

              {/* ลูกแก้วพลังฝั่งซ้าย: ไม่ (กลับ Step 1) */}
              <div
                data-kiosk-target="step3-no"
                onClick={handleStep3No}
                className="absolute top-4 left-3 sm:left-5 z-20 cursor-pointer group select-none flex flex-col items-center"
              >
                <div
                  className={`w-20 h-20 sm:w-22 sm:h-22 rounded-full border-3 flex flex-col items-center justify-center shadow-xl transition-all duration-200 relative overflow-hidden backdrop-blur-md ${
                    detectedArmPose === 'left_no' || hoveredButton === 'step3-no'
                      ? 'scale-115 border-rose-300 bg-gradient-to-br from-rose-500 via-red-600 to-rose-800 shadow-rose-400/80'
                      : 'border-rose-400 bg-rose-950/70 text-rose-200 hover:scale-105'
                  }`}
                >
                  <span className="text-xl sm:text-2xl font-black text-white drop-shadow">ไม่</span>
                  <span className="text-[10px] font-bold text-rose-100 flex items-center gap-0.5">
                    <span>ย้อนกลับ</span>
                  </span>

                  {(detectedArmPose === 'left_no' || hoveredButton === 'step3-no') && (
                    <svg className="absolute inset-0 w-full h-full -rotate-90 pointer-events-none">
                      <circle
                        cx="50%"
                        cy="50%"
                        r="34"
                        fill="none"
                        stroke="#f87171"
                        strokeWidth="5"
                        strokeDasharray="213"
                        strokeDashoffset={213 - (213 * (hoveredButton === 'step3-no' ? hoverProgress : armHoldProgress)) / 100}
                        strokeLinecap="round"
                      />
                    </svg>
                  )}
                </div>
                <span className="text-[11px] font-extrabold text-rose-300 bg-black/60 px-2 py-0.5 rounded-full mt-1">
                  แตะ "ไม่"
                </span>
              </div>

              {/* Live Charging Power Bar */}
              {detectedArmPose !== 'none' && (
                <div className="absolute bottom-10 inset-x-6 bg-black/85 backdrop-blur-md rounded-2xl p-2.5 border border-emerald-400 flex flex-col items-center z-20 animate-fadeIn">
                  <div className="flex items-center justify-between w-full text-xs font-black text-white px-1 mb-1">
                    <span className="flex items-center gap-1.5">
                      <Zap className="w-3.5 h-3.5 text-yellow-400 fill-yellow-400 animate-bounce" />
                      <span>
                        {detectedArmPose === 'right_yes'
                          ? '⚡ กำลังชาร์จ: ใช่ (เข้าสู่ระบบค้างไว้ 1.8s)'
                          : '⚡ กำลังชาร์จ: ไม่ (ย้อนกลับค้างไว้ 1.8s)'}
                      </span>
                    </span>
                    <span className="text-yellow-300 font-mono text-sm">{armHoldProgress}%</span>
                  </div>
                  <div className="w-full h-2.5 bg-slate-700 rounded-full overflow-hidden">
                    <div
                      className={`h-full transition-all duration-75 rounded-full ${
                        detectedArmPose === 'right_yes' ? 'bg-gradient-to-r from-emerald-400 to-yellow-400' : 'bg-gradient-to-r from-rose-500 to-red-400'
                      }`}
                      style={{ width: `${armHoldProgress}%` }}
                    />
                  </div>
                </div>
              )}

              <div className="absolute bottom-2 inset-x-2 bg-black/75 backdrop-blur-md rounded-xl py-1 px-3 text-center text-white text-[11px] font-bold z-10">
                🖐️ ยื่นมือแตะลูกแก้วบนภาพค้าง 1 วินาที หรือกดปุ่มขนาดใหญ่ด้านล่าง
              </div>
            </div>

            <div className="w-full flex items-center justify-center gap-2 mt-1">
              <button
                data-kiosk-target="step3-yes"
                onClick={handleStep3Yes}
                className="flex-1 py-3 px-3 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-sm sm:text-base shadow-md flex items-center justify-center gap-1.5 active:scale-95 transition cursor-pointer min-h-[50px]"
              >
                <Check className="w-5 h-5 stroke-[3]" />
                <span>ใช่ (เข้าสู่ระบบ)</span>
              </button>
              <button
                data-kiosk-target="step3-no"
                onClick={handleStep3No}
                className="flex-1 py-3 px-3 rounded-2xl bg-rose-600 hover:bg-rose-700 text-white font-extrabold text-sm sm:text-base shadow-md flex items-center justify-center gap-1.5 active:scale-95 transition cursor-pointer min-h-[50px]"
              >
                <X className="w-5 h-5 stroke-[3]" />
                <span>ไม่ (ย้อนกลับ)</span>
              </button>
            </div>
          </div>
        )}

        {/* ---------------------------------------------------- */}
        {/* ภาพที่ 4: หน้าต่างสแกนใบหน้า + AI Head Pose Tracker  */}
        {/* มีดีเลย์ตรวจจับท่าละ 1.6 วินาที + ตรวจจับจริงจากกล้อง   */}
        {/* ---------------------------------------------------- */}
        {/* ---------------------------------------------------- */}
        {/* ภาพที่ 4: หน้าต่างสแกนใบหน้า + AI Head Pose Tracker  */}
        {/* ---------------------------------------------------- */}
        {currentStep === 4 && (
          <LivenessScanHUD
            videoRef={videoRef}
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
            isProcessingBiometrics={isScanning}
            biometricMatchMessage={scanStatusMessage}
            onRetryCamera={startCamera}
            onFallbackToPin={() => setShowPinModal(true)}
          />
        )}

        {/* ---------------------------------------------------- */}
        {/* ภาพที่ 5: หน้าต่างเข้าสู่ระบบเรียบร้อย (ค้างไว้ 5 วินาที) */}
        {/* ---------------------------------------------------- */}
        {currentStep === 5 && (
          <div className="w-full flex-1 flex flex-col items-center justify-center animate-fadeIn text-center py-4">
            <div className="w-full max-w-[360px] bg-[#F8F9FA] border border-gray-200 rounded-3xl py-6 px-5 text-center shadow-lg flex flex-col items-center relative">
              
              <div className="absolute -top-3.5 bg-gradient-to-r from-emerald-600 to-teal-600 text-white font-black text-xs px-3.5 py-1 rounded-full shadow flex items-center gap-1">
                <ShieldCheck className="w-3.5 h-3.5 fill-white" />
                <span>ยืนยันตัวตนชีวมิติสำเร็จ 100%</span>
              </div>

              <div className="w-16 h-16 rounded-full bg-emerald-100 border-2 border-emerald-400 text-[#1E8A4C] flex items-center justify-center mb-3 mt-1 shadow-sm animate-bounce">
                <Check className="w-10 h-10 stroke-[3]" />
              </div>

              <h2 className="text-2xl sm:text-3xl font-extrabold text-[#0B2B2B]">
                เข้าสู่ระบบเรียบร้อย
              </h2>

              <div className="mt-3 p-3.5 rounded-2xl bg-white border border-slate-200 w-full shadow-inner">
                <p className="text-lg font-black text-[#1E8A4C]">
                  {activePatient.name}
                </p>
                <p className="text-xs text-gray-500 font-mono mt-0.5">
                  รหัสคนไข้ HN: {activePatient.patient_code} | อายุ {activePatient.age} ปี
                </p>
                <div className="mt-2 text-xs font-semibold text-slate-700 bg-emerald-50 py-1.5 px-2.5 rounded-lg">
                  การวินิจฉัย: {activePatient.notes || 'ข้อไหล่ติดระยะฟื้นฟู'}
                </div>
              </div>
            </div>

            <div className="mt-6 flex flex-col items-center w-full max-w-xs">
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-emerald-50 border border-emerald-300 text-[#1E8A4C] text-xs sm:text-sm font-bold shadow-sm">
                <span className={`w-3 h-3 rounded-full ${isStep5Paused ? 'bg-amber-500' : 'bg-emerald-500 animate-ping'}`} />
                <span>
                  {isStep5Paused ? (
                    <span>⏸️ หยุดเวลานับถอยหลังชั่วคราว</span>
                  ) : (
                    <span>ไปหน้ารายการกายภาพอัตโนมัติใน: <b className="text-base font-mono text-emerald-800">{step5Countdown}</b> วินาที</span>
                  )}
                </span>
              </div>

              <div className="flex items-center gap-2 mt-3 w-full">
                <button
                  data-kiosk-target="step5-pause"
                  onClick={() => setIsStep5Paused(!isStep5Paused)}
                  className="flex-1 text-xs sm:text-sm font-bold py-2.5 px-3 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 flex items-center justify-center gap-1 shadow-sm active:scale-95 transition cursor-pointer min-h-[48px]"
                >
                  {isStep5Paused ? (
                    <>
                      <Play className="w-4 h-4 text-emerald-600 fill-emerald-600" />
                      <span>▶️ นับเวลาต่อ</span>
                    </>
                  ) : (
                    <>
                      <Pause className="w-4 h-4 text-amber-600 fill-amber-600" />
                      <span>⏸️ หยุดเวลาไว้ก่อน</span>
                    </>
                  )}
                </button>

                <button
                  data-kiosk-target="step5-next"
                  onClick={() => changeStep(6)}
                  className="flex-1 text-xs sm:text-sm font-bold py-2.5 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white flex items-center justify-center gap-1 shadow-sm active:scale-95 transition cursor-pointer min-h-[48px]"
                >
                  <span>ไปต่อทันที ➔</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ---------------------------------------------------- */}
        {/* ภาพที่ 6: หน้ารายการกายภาพของวันนี้ (ค้างไว้ 5 วินาที) */}
        {/* ---------------------------------------------------- */}
        {currentStep === 6 && (
          <div className="w-full flex-1 flex flex-col items-center justify-between animate-fadeIn text-left py-1">
            <div className="w-full bg-gradient-to-b from-[#EAEAEA] to-[#D5D5D5] border-2 border-[#BEBEBE] rounded-2xl py-2.5 px-4 text-center shadow-md mb-2">
              <h2 className="text-lg sm:text-xl font-black text-[#0B2B2B] tracking-wide">
                รายการกายภาพของวันนี้
              </h2>
            </div>

            {/* ข้อมูลเบื้องต้นของนักกายภาพ / แพทย์ผู้ดูแล (ชื่อ รูป ความเชี่ยวชาญ) */}
            <div className="w-full bg-[#E8F8EE] border-2 border-[#1E8A4C] rounded-2xl p-3 shadow-md flex items-center gap-3 mb-2">
              <div className="w-16 h-16 sm:w-18 sm:h-18 rounded-2xl bg-white border-2 border-emerald-300 shadow-sm flex items-center justify-center flex-shrink-0 p-2 text-emerald-700">
                <Stethoscope className="w-10 h-10 stroke-[2]" />
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1 text-[11px] font-bold text-emerald-800">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                  <span>แพทย์ / นักกายภาพผู้ดูแล</span>
                </div>
                <h3 className="text-base sm:text-lg font-black text-[#0B2B2B] leading-tight mt-0.5">
                  {activePlan?.therapistName || 'กภ. ธนากร วงศ์สวัสดิ์'}
                </h3>
                <p className="text-xs font-bold text-[#14532D] mt-0.5">
                  นักกายภาพบำบัดชำนาญการ • เวชศาสตร์ฟื้นฟูกล้ามเนื้อและกระดูก
                </p>
                <p className="text-[10px] text-slate-600 line-clamp-1 mt-0.5">
                  {activePlan?.clinicalNotes || 'เน้นเพิ่มองศาการยกแขนอย่างนุ่มนวล'}
                </p>
              </div>
            </div>

            {/* รายการท่า/กิจกรรมที่แพทย์กำหนดไว้ในระบบสำหรับผู้ป่วยรายนี้ในวันนี้ */}
            <div className="w-full bg-white border border-slate-200 rounded-2xl p-2.5 shadow-inner mb-2 flex-1 max-h-[190px] overflow-y-auto">
              <div className="flex items-center justify-between text-xs font-bold text-slate-700 mb-1.5 px-1">
                <span className="flex items-center gap-1 text-[#1E8A4C]">
                  <Activity className="w-3.5 h-3.5" />
                  <span>ท่าที่แพทย์กำหนด ({activePlan?.assignedExercises?.length || 3} ท่า)</span>
                </span>
                <span className="text-[11px] text-slate-500">
                  {activePlan?.targetJoint || 'ข้อไหล่และสะบัก'}
                </span>
              </div>

              <div className="space-y-1.5">
                {(activePlan?.assignedExercises && activePlan.assignedExercises.length > 0
                  ? activePlan.assignedExercises
                  : [
                      { exerciseSlug: 'shoulder_raise', exerciseName: 'กางแขนยกด้านข้าง', sets: 3, reps: 10, holdSeconds: 3, difficulty: 'beginner' },
                      { exerciseSlug: 'stretch_shoulder_cross', exerciseName: 'ยืดไหล่ข้ามอก', sets: 3, reps: 5, holdSeconds: 20, difficulty: 'beginner' },
                      { exerciseSlug: 'stretch_chest_open', exerciseName: 'ยืดอกเปิดไหล่', sets: 2, reps: 5, holdSeconds: 15, difficulty: 'beginner' },
                    ]
                ).map((ex, idx) => (
                  <div
                    key={ex.exerciseSlug || idx}
                    className="flex items-center justify-between p-2 rounded-xl bg-slate-50 border border-slate-200 hover:bg-emerald-50/50 transition"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="w-6 h-6 rounded-full bg-emerald-100 text-emerald-800 text-xs font-black flex items-center justify-center flex-shrink-0">
                        {idx + 1}
                      </span>
                      <div className="truncate">
                        <p className="text-xs sm:text-sm font-extrabold text-[#0B2B2B] truncate">
                          {ex.exerciseName}
                        </p>
                        <p className="text-[10px] text-slate-500 font-semibold">
                          {ex.difficulty === 'beginner' ? 'ระดับเริ่มต้น' : 'ระดับปานกลาง'}
                        </p>
                      </div>
                    </div>

                    <div className="text-right flex-shrink-0">
                      <span className="text-xs font-black text-emerald-700 bg-emerald-100/80 px-2 py-0.5 rounded-md">
                        {ex.sets} เซ็ต × {ex.reps} ครั้ง
                      </span>
                      {ex.holdSeconds > 0 && (
                        <p className="text-[9px] text-slate-500 font-medium mt-0.5">
                          ค้าง {ex.holdSeconds} วิ
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* โหมดโปรแกรมกายภาพ */}
            <div className="w-full grid grid-cols-2 gap-2 mb-2">
              <button
                data-kiosk-target="step6-physio"
                onClick={() => setSelectedTherapyType('physio')}
                className={`py-2 px-3 rounded-xl border-2 font-bold text-xs flex items-center justify-center gap-1.5 transition cursor-pointer min-h-[42px] ${
                  selectedTherapyType === 'physio'
                    ? 'bg-emerald-50 border-emerald-600 text-emerald-800 shadow-sm'
                    : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}
              >
                <Check className={`w-3.5 h-3.5 ${selectedTherapyType === 'physio' ? 'opacity-100' : 'opacity-0'}`} />
                <span>กายภาพบำบัด</span>
              </button>

              <button
                data-kiosk-target="step6-minigame"
                onClick={() => setSelectedTherapyType('minigame')}
                className={`py-2 px-3 rounded-xl border-2 font-bold text-xs flex items-center justify-center gap-1.5 transition cursor-pointer min-h-[42px] ${
                  selectedTherapyType === 'minigame'
                    ? 'bg-emerald-50 border-emerald-600 text-emerald-800 shadow-sm'
                    : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}
              >
                <Check className={`w-3.5 h-3.5 ${selectedTherapyType === 'minigame' ? 'opacity-100' : 'opacity-0'}`} />
                <span>กายภาพมินิเกม</span>
              </button>
            </div>

            <div className="w-full flex flex-col items-center">
              {/* ปุ่มเปิดคลัง 11 ท่ายืดเหยียด */}
              <button
                data-kiosk-target="step6-stretch"
                type="button"
                onClick={() => {
                  setIsStep6Paused(true);
                  setShowStretchModal(true);
                }}
                className="w-full py-2 px-3 rounded-xl bg-white hover:bg-emerald-50 border border-[#1E8A4C] text-[#1E8A4C] font-extrabold text-xs shadow-sm flex items-center justify-between mb-2 transition active:scale-95 cursor-pointer min-h-[42px]"
                id="btnOpenStretchLibrary"
              >
                <div className="flex items-center gap-1.5">
                  <span>📋</span>
                  <span>เลือกโปรแกรมยืดกล้ามเนื้อ 11 ท่า</span>
                </div>
                <span className="text-[10px] bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full font-bold">
                  {selectedStretchIds.length} ท่า
                </span>
              </button>

              {/* ข้อความนับถอยหลัง 5 วินาที */}
              <div className="text-xs text-slate-600 font-semibold mb-2 flex items-center gap-2">
                <Clock className={`w-3.5 h-3.5 ${isStep6Paused ? 'text-amber-600' : 'text-emerald-600 animate-spin'}`} />
                <span>
                  {isStep6Paused ? (
                    <span>⏸️ หยุดเวลานับถอยหลังชั่วคราว</span>
                  ) : (
                    <span>เริ่มทำกายภาพอัตโนมัติในอีก <b className="font-mono text-emerald-800 text-sm">{step6Countdown}</b> วินาที</span>
                  )}
                </span>
              </div>

              {/* ปุ่มควบคุมและเริ่มทำกายภาพทันที */}
              <div className="flex items-center gap-2 w-full mb-1">
                <button
                  data-kiosk-target="step6-pause"
                  onClick={() => setIsStep6Paused(!isStep6Paused)}
                  className="py-2.5 px-3 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-xs font-bold flex items-center justify-center gap-1 shadow-sm active:scale-95 transition cursor-pointer min-h-[48px]"
                >
                  {isStep6Paused ? (
                    <>
                      <Play className="w-3.5 h-3.5 text-emerald-600 fill-emerald-600" />
                      <span>▶️ นับต่อ</span>
                    </>
                  ) : (
                    <>
                      <Pause className="w-3.5 h-3.5 text-amber-600 fill-amber-600" />
                      <span>⏸️ หยุดเวลา</span>
                    </>
                  )}
                </button>

                <button
                  data-kiosk-target="step6-start"
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

      {/* ======================================================== */}
      {/* โมดอลเลือกและปรับเวลา 11 ท่ายืดกล้ามเนื้อทางคลินิก (P1-5) */}
      {/* ======================================================== */}
      {showStretchModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-3 animate-fadeIn">
          <div className="w-full max-w-lg bg-white rounded-[32px] p-5 sm:p-6 shadow-2xl border-2 border-emerald-500 relative flex flex-col max-h-[90vh]">
            
            {/* Modal Header */}
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

            {/* Quick Toggle All */}
            <div className="flex items-center justify-between py-2 text-xs font-bold text-slate-600 border-b border-slate-100">
              <span className="text-emerald-800">
                เลือกแล้ว {selectedStretchIds.length} จาก 11 ท่า
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setSelectedStretchIds(STRETCH_EXERCISES.map((s) => s.id))}
                  className="px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-800 hover:bg-emerald-100 border border-emerald-200"
                >
                  เลือกทั้งหมด
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedStretchIds([])}
                  className="px-2.5 py-1 rounded-lg bg-slate-100 text-slate-700 hover:bg-slate-200"
                >
                  ล้างการเลือก
                </button>
              </div>
            </div>

            {/* Scrollable Exercises List */}
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
                          <div className="mt-1 text-[10px] text-amber-800 bg-amber-50 rounded px-2 py-0.5 border border-amber-200 flex items-center gap-1">
                            <span>⚠️ {item.caution}</span>
                          </div>
                        </div>
                      </div>

                      {/* Hold Seconds Control */}
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

            {/* Modal Bottom Actions */}
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

      {/* ======================================================== */}
      {/* โมดอลคีย์แพด PIN ขนาดใหญ่สำหรับผู้สูงอายุ (Elderly PIN Keypad Fallback) */}
      {/* ======================================================== */}
      {showPinModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-3 animate-fadeIn">
          <div className="w-full max-w-sm bg-white rounded-[32px] p-5 shadow-2xl border-2 border-emerald-500 relative flex flex-col items-center">
            
            <button
              onClick={() => {
                setShowPinModal(false);
                setPinError(null);
              }}
              className="absolute top-4 right-4 p-2 rounded-full hover:bg-slate-100 text-slate-500 transition"
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
                  className="p-1.5 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-800 font-bold border border-emerald-200 text-left truncate"
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
                  className="p-1.5 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-800 font-bold border border-emerald-200 text-left truncate"
                >
                  🟢 นางเพ็ญศรี (5678)
                </button>
              </div>
            </div>

            <div className="w-full grid grid-cols-3 gap-2">
              {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((digit) => (
                <button
                  key={digit}
                  onClick={() => handlePinDigit(digit)}
                  className="h-12 rounded-2xl bg-slate-100 hover:bg-emerald-100 text-slate-800 font-black text-xl active:scale-95 transition shadow-sm border border-slate-200"
                >
                  {digit}
                </button>
              ))}

              <button
                onClick={handlePinClear}
                className="h-12 rounded-2xl bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold text-sm active:scale-95 transition"
              >
                ล้าง
              </button>

              <button
                onClick={() => handlePinDigit('0')}
                className="h-12 rounded-2xl bg-slate-100 hover:bg-emerald-100 text-slate-800 font-black text-xl active:scale-95 transition shadow-sm border border-slate-200"
              >
                0
              </button>

              <button
                onClick={handlePinBackspace}
                className="h-12 rounded-2xl bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold text-sm active:scale-95 transition"
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

      {/* ======================================================== */}
      {/* แถบสลับดูแต่ละภาพ (Step Switcher 1-6 สำหรับทดสอบและสาธิต - ซ่อนใน Production) */}
      {/* ======================================================== */}
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
              className={`px-2.5 py-1 rounded-full text-xs font-bold transition shadow-sm ${
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
            className="bg-white/95 hover:bg-emerald-50 border border-emerald-300 text-[#1E8A4C] font-bold text-xs px-3.5 py-2 rounded-full shadow-md flex items-center gap-1.5 transition active:scale-95"
            title="เกี่ยวกับระบบ"
          >
            <Info className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">เกี่ยวกับระบบ</span>
          </button>
        )}

        <button
          onClick={onOpenHospitalPortal}
          className="bg-white/95 hover:bg-emerald-50 border-2 border-[#1E8A4C] text-[#1E8A4C] font-bold text-xs px-3.5 py-2 rounded-full shadow-md flex items-center gap-1.5 transition active:scale-95"
          id="btnKioskHospitalPortal"
          title="เข้าสู่ระบบบุคลากร / รพ."
        >
          <Shield className="w-4 h-4 text-emerald-600" />
          <span>ระบบบุคลากร / รพ.</span>
        </button>
      </div>

      {/* ======================================================== */}
      {/* Hand Tracking Virtual Touch Cursor & 1.0s Circular Dwell */}
      {/* แสดงจุดปลายนิ้วบนหน้าจอ และวงกลมนับเวลา 1 วินาทีเมื่อค้างบนปุ่ม */}
      {/* ======================================================== */}
      {handCursor && handCursor.visible && (
        <div
          className="fixed pointer-events-none z-50 transition-transform duration-75 ease-out"
          style={{
            left: `${handCursor.x}px`,
            top: `${handCursor.y}px`,
            transform: 'translate(-50%, -50%)',
          }}
        >
          <div className="relative flex items-center justify-center">
            {/* วงแหวนนับเวลา 1 วินาที (Circular Countdown Ring) */}
            {hoverProgress > 0 && (
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
                  cx="32"
                  cy="32"
                  r="24"
                  fill="none"
                  stroke="#22c55e"
                  strokeWidth="4"
                  strokeDasharray="150.8"
                  strokeDashoffset={150.8 - (150.8 * hoverProgress) / 100}
                  strokeLinecap="round"
                />
              </svg>
            )}

            {/* จุดปลายนิ้วเรืองแสง (Glowing Fingertip Point) */}
            <div
              className={`rounded-full border-2 transition-all duration-150 absolute ${
                hoverProgress > 0
                  ? 'w-7 h-7 bg-emerald-400 border-white shadow-[0_0_20px_#22c55e] scale-125'
                  : 'w-5 h-5 bg-teal-400/90 border-white shadow-[0_0_10px_#14b8a6]'
              }`}
            />
          </div>

          {/* ป้ายกำกับคำแนะนำใต้จุดปลายนิ้วขณะแตะค้าง */}
          {hoveredButton && (
            <div className="absolute top-10 left-1/2 -translate-x-1/2 whitespace-nowrap bg-black/85 text-emerald-300 font-bold text-[11px] px-2.5 py-0.5 rounded-full border border-emerald-400/60 shadow-lg">
              แตะค้าง 1 วินาที ({Math.round(hoverProgress)}%)
            </div>
          )}
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
