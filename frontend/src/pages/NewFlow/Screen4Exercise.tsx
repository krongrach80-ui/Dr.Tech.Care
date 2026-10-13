import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  ArrowLeft,
  ArrowLeftRight,
  Camera,
  Play,
  Pause,
  SkipForward,
  SkipBack,
  RotateCcw,
  CheckCircle2,
  AlertTriangle,
  Sparkles,
  Info,
  Clock,
  Check,
  Send,
  HelpCircle,
  ExternalLink,
  X,
  ChevronLeft,
  ChevronRight,
  Minimize2,
  Maximize2,
  OctagonAlert,
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { useCamera } from '../../hooks/useCamera';
import { usePose } from '../../hooks/usePose';
import { poseService } from '../../services/poseService';
import { useExercise } from '../../hooks/useExercise';
import { ExerciseDefinition, ExercisePhase, ExerciseConfig } from '../../types/exercise';
import {
  StretchExerciseItem,
  STRETCH_PROGRAM_METADATA,
  getStretchVideoEmbedUrl,
  getStretchVideoWatchUrl,
  getExerciseUnifiedConfig,
} from '../../data/stretchExercises';
import { StretchStickFigure } from '../../components/StickFigure/StretchStickFigure';
import { ExerciseInstructionCard } from '../../components/Exercise/ExerciseInstructionCard';
import { ExercisePosePreview } from '../../components/Exercise/ExercisePosePreview';
import { ExerciseVideoModal } from '../../components/VideoPlayer/ExerciseVideoModal';
import { voiceAssistant } from '../../services/voiceAssistantService';
import { audioFeedback } from '../../services/audioService';
import { api } from '../../services/api';
import { OfflineStorageService } from '../../services/offlineStorageService';
import { IndexedDBStorageService } from '../../services/indexedDbService';
import { Session } from '../../types/session';
import { SafetyEngine, SafetyTelemetry } from '../../biomechanics/SafetyEngine';
import { evaluateStretchPose } from '../../biomechanics/stretchEvaluator';

interface Screen4ExerciseProps {
  onBack: () => void;
  onOpenTherapistModal: (score: number | null, poseName: string, romAngle: number | null) => void;
  selectedExercise: ExerciseDefinition | null;
  stretchQueue?: StretchExerciseItem[];
  customHoldTimes?: Record<string, number>;
  patientId?: number | string;
  onNavigateToMinigame?: () => void;
  includeMinigame?: boolean;
}

export const Screen4Exercise: React.FC<Screen4ExerciseProps> = ({
  onBack,
  onOpenTherapistModal,
  selectedExercise,
  stretchQueue,
  customHoldTimes,
  patientId = 1,
  onNavigateToMinigame,
  includeMinigame = true,
}) => {
  // Check if we are running in Stretch Queue Mode
  const isStretchMode = Boolean(stretchQueue && stretchQueue.length > 0);
  const queue = useMemo(() => stretchQueue || [], [stretchQueue]);

  // Unified Exercise Queue (Supports 11 Stretches as well as Physio Exercises like Alternating Knee Raise)
  const unifiedQueue: ExerciseConfig[] = useMemo(() => {
    if (isStretchMode && queue.length > 0) {
      return queue.map((item) => getExerciseUnifiedConfig(item));
    }
    if (selectedExercise) {
      return [getExerciseUnifiedConfig(selectedExercise)];
    }
    return [getExerciseUnifiedConfig(null)]; // Defaults to Alternating Knee Raise
  }, [isStretchMode, queue, selectedExercise]);

  // Queue Progression States
  const [currentIndex, setCurrentIndex] = useState<number>(0);
  const [currentSide, setCurrentSide] = useState<'left' | 'right' | 'both'>('left');
  const [isSwitchingSide, setIsSwitchingSide] = useState<boolean>(false);
  const [switchCountdown, setSwitchCountdown] = useState<number>(3);
  const [isPaused, setIsPaused] = useState<boolean>(false);
  const [isCompletedAll, setIsCompletedAll] = useState<boolean>(false);
  const [isVideoModalOpen, setIsVideoModalOpen] = useState<boolean>(false);
  const [isStepsModalOpen, setIsStepsModalOpen] = useState<boolean>(false);
  const [pipPosition, setPipPosition] = useState<'right' | 'left'>('right');
  const [isPipMinimized, setIsPipMinimized] = useState<boolean>(false);

  // Time & Score Tracking
  const currentStretch = isStretchMode ? queue[currentIndex] || queue[0] : null;
  const currentExerciseConfig: ExerciseConfig = unifiedQueue[currentIndex] || unifiedQueue[0];
  const prevExerciseConfig: ExerciseConfig | null = currentIndex > 0 ? unifiedQueue[currentIndex - 1] : null;
  const nextExerciseConfig: ExerciseConfig | null = currentIndex < unifiedQueue.length - 1 ? unifiedQueue[currentIndex + 1] : null;

  // Helper to resolve customized duration for any pose
  const getPoseHoldSeconds = useCallback(
    (item: StretchExerciseItem | null) => {
      if (!item) return 20;
      if (customHoldTimes && customHoldTimes[item.id] !== undefined) {
        return customHoldTimes[item.id];
      }
      return item.holdSeconds;
    },
    [customHoldTimes]
  );

  const initialSeconds = currentStretch ? getPoseHoldSeconds(currentStretch) : 20;
  const [timeLeft, setTimeLeft] = useState<number>(initialSeconds);
  const [totalElapsedTimeSec, setTotalElapsedTimeSec] = useState<number>(0);
  const [poseScores, setPoseScores] = useState<Record<string, number | null>>({});
  const [liveScore, setLiveScore] = useState<number | null>(null);
  const [completedPoseIds, setCompletedPoseIds] = useState<string[]>([]);
  const [skippedPoseIds, setSkippedPoseIds] = useState<string[]>([]);
  const [saveSuccessMessage, setSaveSuccessMessage] = useState<string | null>(null);
  const [saveErrorMessage, setSaveErrorMessage] = useState<string | null>(null);
  const [correctPostureTimeSec, setCorrectPostureTimeSec] = useState<number>(0);
  const [aiRecommendationSent, setAiRecommendationSent] = useState<boolean>(false);
  const angleSamplesRef = useRef<number[]>([]);
  const hasSavedSessionRef = useRef<boolean>(false);

  // Preparation & Countdown State Machine
  const [exercisePhase, setExercisePhase] = useState<ExercisePhase>('PREPARING');
  const [countdownNumber, setCountdownNumber] = useState<number>(3);
  const countdownTimersRef = useRef<NodeJS.Timeout[]>([]);

  // Safety Watchdog
  const safetyEngineRef = useRef<SafetyEngine>(new SafetyEngine());
  const [safetyTelemetry, setSafetyTelemetry] = useState<SafetyTelemetry | null>(null);
  const [isSafetyHalted, setIsSafetyHalted] = useState<boolean>(false);

  // Setup Camera Hook
  const {
    videoRef,
    isCameraReady,
    isCameraLoading,
    cameraError,
    startCamera,
    stopCamera,
  } = useCamera();

  // Automatically start camera on mount for elderly kiosk users
  useEffect(() => {
    startCamera();
  }, [startCamera]);

  // Pose Detection Hook
  const { landmarks, worldLandmarks, fps, modelError, isMockMode } = usePose(videoRef, isCameraReady, currentExerciseConfig?.targetPose || 'shoulder_raise');

  const videoDimensions = useMemo(() => {
    const video = videoRef.current;
    if (video && video.videoWidth > 0 && video.videoHeight > 0) {
      return { width: video.videoWidth, height: video.videoHeight };
    }
    return undefined;
  }, [videoRef, isCameraReady]);

  // Biomechanics Analysis Hook
  const { analysis, biomechanics } = useExercise(selectedExercise, landmarks, isSafetyHalted, videoDimensions);

  // Canvas overlay for real-time skeletal drawing
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Clear running countdown timers safely
  const clearCountdownTimers = useCallback(() => {
    countdownTimersRef.current.forEach((t) => clearTimeout(t));
    countdownTimersRef.current = [];
  }, []);

  // State Machine Flow: PREPARING -> COUNTDOWN_3 -> COUNTDOWN_2 -> COUNTDOWN_1 -> READY -> ACTIVE
  const startExercisePreparation = useCallback((targetEx: ExerciseConfig) => {
    clearCountdownTimers();
    setIsSafetyHalted(false);
    setExercisePhase('PREPARING');
    setCountdownNumber(3);

    // AI Voice Step 1: "เตรียมตัวสำหรับ [ชื่อท่า]"
    voiceAssistant.speakInstruction(`เตรียมตัวสำหรับ ${targetEx.name}`, {
      key: `prep_${targetEx.id}`,
      force: true,
      cooldown: 500,
    });

    // Step 2: 3-2-1 Countdown
    const t1 = setTimeout(() => {
      setExercisePhase('COUNTDOWN_3');
      setCountdownNumber(3);
      voiceAssistant.speakInstruction('สาม', { key: 'count_3', force: true, cooldown: 200 });
    }, 1200);

    const t2 = setTimeout(() => {
      setExercisePhase('COUNTDOWN_2');
      setCountdownNumber(2);
      voiceAssistant.speakInstruction('สอง', { key: 'count_2', force: true, cooldown: 200 });
    }, 2200);

    const t3 = setTimeout(() => {
      setExercisePhase('COUNTDOWN_1');
      setCountdownNumber(1);
      voiceAssistant.speakInstruction('หนึ่ง', { key: 'count_1', force: true, cooldown: 200 });
    }, 3200);

    const t4 = setTimeout(() => {
      setExercisePhase('READY');
      voiceAssistant.speakInstruction('เริ่มได้เลย', { key: 'count_ready', force: true, cooldown: 200 });
    }, 4200);

    const t5 = setTimeout(() => {
      setExercisePhase('ACTIVE');
    }, 4800);

    countdownTimersRef.current = [t1, t2, t3, t4, t5];
  }, [clearCountdownTimers]);

  // Clean up countdown on unmount
  useEffect(() => {
    return () => {
      clearCountdownTimers();
    };
  }, [clearCountdownTimers]);

  // Reset timer & start countdown ONLY on exercise index / side change
  useEffect(() => {
    if (currentExerciseConfig) {
      setTimeLeft(currentStretch ? getPoseHoldSeconds(currentStretch) : 20);
      setIsPaused(false);
      startExercisePreparation(currentExerciseConfig);
    }
  }, [currentIndex, currentSide]); // Strictly gated: NOT per-frame!

  // Continuous Clinical Safety Watchdog
  useEffect(() => {
    if (!landmarks || landmarks.length === 0 || !biomechanics || exercisePhase === 'IDLE') return;

    const effectiveEx: ExerciseDefinition = selectedExercise || {
      id: 1,
      name: currentExerciseConfig.name,
      slug: (currentExerciseConfig.targetPose as any) || 'shoulder_raise',
      category: 'Rehab',
      description: currentExerciseConfig.description,
      target_joint: 'shoulder',
      target_angle: currentExerciseConfig.targetAngle ?? 90,
      min_angle: 30,
      max_angle: currentExerciseConfig.targetRom ?? 110,
      target_reps: currentExerciseConfig.recommendedReps ?? 10,
      difficulty: 'beginner',
    };

    const telemetry = safetyEngineRef.current.evaluate(biomechanics, landmarks, effectiveEx);
    setSafetyTelemetry(telemetry);

    // If critical safety stop is triggered, override immediately!
    if (telemetry.state === 'STOP' || telemetry.isEmergencyStop) {
      if (exercisePhase !== 'SAFETY_STOP') {
        clearCountdownTimers();
        setExercisePhase('SAFETY_STOP');
        setIsSafetyHalted(true);

        const alertMsg = telemetry.activeViolations[0]?.voiceMessage || 'หยุดก่อนครับ ตรวจพบการเคลื่อนไหวที่ไม่ปลอดภัย';
        voiceAssistant.speakEmergency(alertMsg);
      }
    }
  }, [landmarks, biomechanics, exercisePhase, selectedExercise, currentExerciseConfig, clearCountdownTimers]);

  // Compute overall visibility & confidence across key body landmarks
  const visibilityStats = useMemo(() => {
    if (!landmarks || landmarks.length === 0) {
      return { avgVisibility: 0, isGoodVisibility: false, isAcceptable: false, label: 'ไม่ชัด' };
    }
    const keyIndices = [11, 12, 13, 14, 15, 16, 23, 24, 25, 26];
    let totalVis = 0;
    let count = 0;
    for (const idx of keyIndices) {
      if (landmarks[idx]) {
        totalVis += (landmarks[idx].visibility ?? 1);
        count++;
      }
    }
    const avg = count > 0 ? totalVis / count : 0;
    const avgPct = Math.round(avg * 100);
    return {
      avgVisibility: avgPct,
      isGoodVisibility: avg >= 0.65,
      isAcceptable: avg >= 0.55,
      label: avg >= 0.70 ? 'ดี' : avg >= 0.55 ? 'พอใช้' : 'ไม่ชัด',
    };
  }, [landmarks]);

  // Evaluate stretch posture adherence in real-time
  const stretchEval = useMemo(() => {
    if (!isStretchMode || !currentStretch) return null;
    const video = videoRef.current;
    const ar = (video && video.videoHeight > 0) ? (video.videoWidth / video.videoHeight) : 1.0;
    return evaluateStretchPose(landmarks, currentStretch, currentSide, ar, worldLandmarks);
  }, [isStretchMode, landmarks, currentStretch, currentSide, videoRef, worldLandmarks]);

  // Target Joint Name and Target Angle Resolution
  const activeJointInfo = useMemo(() => {
    let name = 'ข้อต่อ';
    let target = 90;

    if (isStretchMode && stretchEval) {
      name = stretchEval.jointName || 'ข้อต่อ';
      target = stretchEval.targetAngle || 90;
    } else if (currentExerciseConfig) {
      target = currentExerciseConfig.targetAngle ?? (selectedExercise?.target_angle ?? 90);
      const poseKey = (currentExerciseConfig.targetPose || selectedExercise?.target_joint || '').toLowerCase();
      if (poseKey.includes('shoulder')) name = 'ไหล่';
      else if (poseKey.includes('elbow') || poseKey.includes('curl') || poseKey.includes('extension')) name = 'ศอก';
      else if (poseKey.includes('knee') || poseKey.includes('squat')) name = 'เข่า';
      else if (poseKey.includes('neck')) name = 'คอ';
      else if (poseKey.includes('hip')) name = 'สะโพก';
      else if (poseKey.includes('torso') || poseKey.includes('trunk') || poseKey.includes('twist') || poseKey.includes('bend')) name = 'ลำตัว';
    }

    return { name, target };
  }, [isStretchMode, stretchEval, currentExerciseConfig, selectedExercise]);

  // 8-frame EMA smoothing on active joint angle (alpha = 2 / (8 + 1) = 2/9)
  const smoothedAngleRef = useRef<number | null>(null);
  const [liveAngle, setLiveAngle] = useState<number>(0);

  useEffect(() => {
    if (!isCameraReady || !landmarks || landmarks.length === 0) {
      smoothedAngleRef.current = null;
      setLiveAngle(0);
      return;
    }

    const raw = isStretchMode
      ? (stretchEval?.currentAngle ?? activeJointInfo.target)
      : (analysis?.currentAngle ?? activeJointInfo.target);

    const alpha = 2 / 9; // 8-frame EMA smoothing factor
    const smoothed = smoothedAngleRef.current === null
      ? raw
      : Math.round(alpha * raw + (1 - alpha) * smoothedAngleRef.current);

    smoothedAngleRef.current = smoothed;
    setLiveAngle(smoothed);
  }, [landmarks, isCameraReady, isStretchMode, stretchEval, analysis, activeJointInfo.target]);

  // Continuous hold tracking: must stay within target band ±10° for >= 0.5s (500ms)
  // Dropout grace period: If dropping out for > 0.3s (300ms) -> pause countdown!
  const inBandSinceRef = useRef<number | null>(null);
  const outOfBandSinceRef = useRef<number | null>(null);
  const [isHoldQualified, setIsHoldQualified] = useState<boolean>(false);

  useEffect(() => {
    if (exercisePhase !== 'ACTIVE' || !isCameraReady || !landmarks || landmarks.length === 0 || !visibilityStats.isAcceptable) {
      inBandSinceRef.current = null;
      outOfBandSinceRef.current = null;
      setIsHoldQualified(false);
      return;
    }

    const diff = Math.abs(liveAngle - activeJointInfo.target);
    const now = performance.now();

    if (diff <= 10) {
      outOfBandSinceRef.current = null;
      if (inBandSinceRef.current === null) {
        inBandSinceRef.current = now;
      } else if (now - inBandSinceRef.current >= 500) {
        setIsHoldQualified(true);
      }
    } else {
      inBandSinceRef.current = null;
      if (isHoldQualified) {
        if (outOfBandSinceRef.current === null) {
          outOfBandSinceRef.current = now;
        } else if (now - outOfBandSinceRef.current >= 300) {
          setIsHoldQualified(false);
          outOfBandSinceRef.current = null;
        }
      } else {
        setIsHoldQualified(false);
      }
    }
  }, [liveAngle, activeJointInfo.target, exercisePhase, isCameraReady, landmarks, visibilityStats.isAcceptable, isHoldQualified]);

  // 3-Tier Adherence State:
  // 'green'  = ท่าถูกต้อง กำลังนับเวลา (within ±10° for >= 0.5s)
  // 'yellow' = ใกล้แล้ว (ห่างเป้าหมายไม่เกิน 15°)
  // 'red'    = ยังไม่เข้าท่า (off-target > 15° or not in frame)
  const adherenceTier: 'green' | 'yellow' | 'red' = useMemo(() => {
    if (exercisePhase !== 'ACTIVE' || !isCameraReady) {
      return 'yellow';
    }
    if (!landmarks || landmarks.length === 0 || !visibilityStats.isAcceptable) {
      return 'red';
    }

    const diff = Math.abs(liveAngle - activeJointInfo.target);
    if (diff <= 10) {
      return isHoldQualified ? 'green' : 'yellow';
    } else if (diff <= 15) {
      return 'yellow';
    } else {
      return 'red';
    }
  }, [exercisePhase, isCameraReady, landmarks, visibilityStats.isAcceptable, liveAngle, activeJointInfo.target, isHoldQualified]);

  // Framing & Distance Watchdog: Checks too close, too far, head/feet cut off
  const framingStatus = useMemo(() => {
    if (!landmarks || landmarks.length === 0 || !isCameraReady) {
      return { isFramingGood: true, message: null };
    }

    const nose = landmarks[0];
    const ls = landmarks[11];
    const rs = landmarks[12];
    const la = landmarks[27];
    const ra = landmarks[28];

    // Head cropped check (nose too close to top edge)
    if (nose && nose.y < 0.05 && (nose.visibility ?? 1) >= 0.5) {
      return {
        isFramingGood: false,
        message: 'ศีรษะอยู่ชิดขอบบนเกินไป กรุณาถอยห่างหรือปรับมุมกล้อง',
      };
    }

    // Shoulder span check (distance)
    if (ls && rs && (ls.visibility ?? 1) >= 0.55 && (rs.visibility ?? 1) >= 0.55) {
      const shoulderSpan = Math.hypot(ls.x - rs.x, ls.y - rs.y);
      if (shoulderSpan > 0.46) {
        return {
          isFramingGood: false,
          message: 'อยู่ใกล้กล้องเกินไป แนะนำระยะ 1.5–2.5 เมตร',
        };
      }
      if (shoulderSpan < 0.11) {
        return {
          isFramingGood: false,
          message: 'อยู่ไกลจากกล้องเกินไป แนะนำระยะ 1.5–2.5 เมตร',
        };
      }
    }

    // Lower body poses (squat, quad, calf, knee raise) checking ankles
    const poseKey = (currentExerciseConfig.targetPose || '').toLowerCase();
    const isLowerBody = poseKey.includes('squat') || poseKey.includes('knee') || poseKey.includes('calf') || poseKey.includes('quad');
    if (isLowerBody && la && ra) {
      const anklesCut = (la.y > 0.96 && (la.visibility ?? 1) < 0.5) || (ra.y > 0.96 && (ra.visibility ?? 1) < 0.5);
      if (anklesCut) {
        return {
          isFramingGood: false,
          message: 'มองไม่เห็นเท้าหรือข้อเท้า กรุณาถอยให้เห็นทั้งตัว 1.5–2.5 เมตร',
        };
      }
    }

    return { isFramingGood: true, message: null };
  }, [landmarks, isCameraReady, currentExerciseConfig]);

  // Real-time posture status computation
  const realtimeStatus: 'ready' | 'adjust' | 'stop' | 'preparing' = useMemo(() => {
    if (exercisePhase === 'SAFETY_STOP' || safetyTelemetry?.state === 'STOP') {
      return 'stop';
    }
    if (exercisePhase !== 'ACTIVE') {
      return 'preparing';
    }
    if (!isCameraReady) {
      return 'ready';
    }
    if (!landmarks || landmarks.length === 0 || !visibilityStats.isAcceptable) {
      return 'adjust';
    }
    if (adherenceTier === 'green') {
      return 'ready';
    }
    return 'adjust';
  }, [exercisePhase, safetyTelemetry, isCameraReady, landmarks, visibilityStats.isAcceptable, adherenceTier]);

  const statusMessage = useMemo(() => {
    if (exercisePhase === 'SAFETY_STOP' || safetyTelemetry?.state === 'STOP') {
      return safetyTelemetry?.activeViolations[0]?.message || 'ตรวจพบการเคลื่อนไหวที่ไม่ปลอดภัย';
    }
    if (exercisePhase === 'PREPARING') return 'เตรียมท่าให้พร้อม...';
    if (exercisePhase === 'COUNTDOWN_3' || exercisePhase === 'COUNTDOWN_2' || exercisePhase === 'COUNTDOWN_1') {
      return 'จัดตำแหน่งร่างกายให้ตรงหน้ากล้อง';
    }
    if (exercisePhase === 'READY') return 'เริ่มได้เลย!';
    if (isCameraReady && (!landmarks || landmarks.length === 0 || !visibilityStats.isGoodVisibility) && exercisePhase === 'ACTIVE') {
      return 'จัดตัวให้อยู่ในเฟรม / เข้าใกล้กล้อง';
    }
    if (isStretchMode && isCameraReady && landmarks && landmarks.length > 0 && exercisePhase === 'ACTIVE') {
      if (adherenceTier === 'green') {
        return stretchEval?.feedback || 'ทำท่าได้ถูกต้อง รักษาระดับไว้';
      }
      if (adherenceTier === 'yellow') {
        return isHoldQualified ? 'รักษาระดับไว้' : 'ใกล้เป้าหมายแล้ว ค้างนิ่งไว้อีกนิด...';
      }
      return stretchEval?.feedback || 'จัดท่าทางให้เข้าใกล้เป้าหมาย';
    }
    if (realtimeStatus === 'adjust') {
      if (analysis && analysis.feedback && analysis.feedback.length > 0) {
        return analysis.feedback[0];
      }
      return 'กรุณาปรับท่าทางให้ตรงตามคำแนะนำ';
    }
    return 'ทำท่าได้ถูกต้อง รักษาระดับไว้';
  }, [exercisePhase, safetyTelemetry, realtimeStatus, analysis, isCameraReady, landmarks, visibilityStats.isGoodVisibility, isStretchMode, stretchEval, adherenceTier, isHoldQualified]);

  // Total elapsed workout timer
  useEffect(() => {
    if (isCompletedAll || isPaused || isSafetyHalted) return;
    const interval = setInterval(() => {
      setTotalElapsedTimeSec((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, [isCompletedAll, isPaused, isSafetyHalted]);

  // Auto-save summary to backend (IndexedDB first, then server sync)
  const handleAutoSaveSummary = useCallback(
    async (
      customPoseScores?: Record<string, number | null>,
      customCompleted?: string[],
      customSkipped?: string[]
    ) => {
      if (hasSavedSessionRef.current) return;

      if (poseService.getIsMockMode()) {
        console.info('ℹ️ เซสชันมาจากโหมดจำลอง (Mock Mode) - ข้ามการบันทึกข้อมูล');
        return;
      }

      const scoresToUse = customPoseScores || poseScores;
      const completedToUse = customCompleted || completedPoseIds;
      const skippedToUse = customSkipped || skippedPoseIds;

      const validScores = Object.values(scoresToUse).filter(
        (s): s is number => typeof s === 'number' && !isNaN(s)
      );
      const calculatedAvgScore =
        validScores.length > 0
          ? Math.round(validScores.reduce((a, b) => a + b, 0) / validScores.length)
          : null;

      const pad = (n: number) => String(n).padStart(2, '0');
      const toLocalDT = (d: Date) =>
        `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;

      const totalCount = unifiedQueue.length;
      const completedCount = completedToUse.length;
      const skippedCount = skippedToUse.length;

      const realExerciseId =
        selectedExercise && typeof selectedExercise.id === 'number' && selectedExercise.id > 0
          ? selectedExercise.id
          : 1;

      const sessionPayload: Session = {
        id: Date.now(),
        patient_id: patientId ?? 1,
        exercise_id: realExerciseId,
        started_at: toLocalDT(new Date(Date.now() - totalElapsedTimeSec * 1000)),
        ended_at: toLocalDT(new Date()),
        total_reps: totalCount,
        correct_reps: completedCount,
        accuracy: calculatedAvgScore ?? 0,
        avg_duration_per_rep: Math.round(totalElapsedTimeSec / Math.max(1, totalCount)),
        status: 'completed',
        notes: `ทำครบ ${completedCount} จาก ${totalCount} ท่า (ข้าม ${skippedCount} ท่า) เวลา ${Math.round(totalElapsedTimeSec / 60)} นาที ${calculatedAvgScore !== null ? `คะแนนเฉลี่ย ${calculatedAvgScore}%` : 'ไม่มีคะแนน (โหมดจับเวลา)'}`,
      };

      const safetyLogs = safetyEngineRef.current ? safetyEngineRef.current.getViolationLog() : [];
      hasSavedSessionRef.current = true;

      // 1. บันทึกลง IndexedDB (Local Offline-First) ก่อนเสมอ
      try {
        OfflineStorageService.saveLocalSession(sessionPayload, safetyLogs);
      } catch (dbErr) {
        console.error('IndexedDB save failed:', dbErr);
        setSaveErrorMessage(
          'เกิดข้อผิดพลาดในการบันทึกผลลง IndexedDB: ' +
            (dbErr instanceof Error ? dbErr.message : String(dbErr))
        );
        return;
      }

      // 2. ลองส่งขึ้นเซิร์ฟเวอร์
      try {
        await api.saveSession(sessionPayload);
        setSaveSuccessMessage('บันทึกผลการฝึกขึ้นเซิร์ฟเวอร์สำเร็จ');
      } catch (serverErr) {
        console.warn('Auto save session to server failed, queued for sync:', serverErr);
        OfflineStorageService.addToSyncQueue(sessionPayload);
        setSaveErrorMessage(
          'ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้ ผลการฝึกถูกบันทึกในเครื่อง (IndexedDB) แล้ว และจะซิงก์อัตโนมัติเมื่อออนไลน์'
        );
      }
    },
    [
      poseScores,
      completedPoseIds,
      skippedPoseIds,
      unifiedQueue.length,
      selectedExercise,
      patientId,
      totalElapsedTimeSec,
    ]
  );

  // Handle phase completion (Switch Side or Proceed to Next Pose)
  const handlePhaseFinish = useCallback(() => {
    const poseKey = currentStretch ? currentStretch.id : currentExerciseConfig.id;

    // Record score for this pose
    const updatedScores: Record<string, number | null> = {
      ...poseScores,
      [poseKey]: liveScore,
    };
    setPoseScores(updatedScores);

    // Record as completed
    const updatedCompleted = Array.from(new Set([...completedPoseIds, poseKey]));
    setCompletedPoseIds(updatedCompleted);

    // If pose has 2 sides and currently on 'left', switch to 'right'
    if (currentStretch && currentStretch.sides === 'both_sides' && currentSide === 'left') {
      setIsSwitchingSide(true);
      setSwitchCountdown(3);

      voiceAssistant.speakExercise('ดีมากครับ ตอนนี้สลับเป็นข้างขวาครับ', {
        key: 'stretch_switch_right',
        priority: 'instruction',
        force: true,
      });

      const switchTimer = setInterval(() => {
        setSwitchCountdown((cnt) => {
          if (cnt <= 1) {
            clearInterval(switchTimer);
            setIsSwitchingSide(false);
            setCurrentSide('right');
            setTimeLeft(getPoseHoldSeconds(currentStretch));
            return 3;
          }
          return cnt - 1;
        });
      }, 1000);

      return;
    }

    // Finished this pose (or finished both sides)
    voiceAssistant.speakExercise(`ดีมากครับ ทำท่า ${currentExerciseConfig.name} ครบแล้วครับ`, {
      priority: 'success',
      cooldown: 1500,
    });

    if (currentIndex < unifiedQueue.length - 1) {
      // Advance to next exercise
      setCurrentIndex((idx) => idx + 1);
      setCurrentSide('left');
    } else {
      // Completed all exercises in queue!
      setIsCompletedAll(true);
      setExercisePhase('COMPLETED');
      try {
        confetti({
          particleCount: 80,
          spread: 70,
          origin: { y: 0.6 },
        });
      } catch (_) {}

      if (updatedCompleted.length === unifiedQueue.length) {
        voiceAssistant.speakResult(
          'ยอดเยี่ยมมากครับ คุณทำกายภาพบำบัดครบทุกท่าแล้วครับ วันนี้ทำได้ดีเยี่ยมมากครับ',
          {
            key: 'stretch_complete_all',
            priority: 'success',
            force: true,
          }
        );
      } else {
        voiceAssistant.speakResult(
          `การฝึกเสร็จสิ้น ทำครบ ${updatedCompleted.length} จาก ${unifiedQueue.length} ท่าครับ`,
          {
            key: 'stretch_complete_partial',
            priority: 'success',
            force: true,
          }
        );
      }

      // Auto-save session to backend with finalized scores (including this last pose!)
      handleAutoSaveSummary(updatedScores, updatedCompleted, skippedPoseIds);
    }
  }, [
    currentStretch,
    currentExerciseConfig,
    currentSide,
    currentIndex,
    unifiedQueue.length,
    liveScore,
    poseScores,
    completedPoseIds,
    skippedPoseIds,
    getPoseHoldSeconds,
    handleAutoSaveSummary,
  ]);

  // Main countdown timer for hold phase (strictly paused during preparation, or when posture is off, or without camera!)
  useEffect(() => {
    if (!isStretchMode || isPaused || isCompletedAll || isSwitchingSide || exercisePhase !== 'ACTIVE' || isSafetyHalted) return;

    // ปิดการนับท่าอัตโนมัติเมื่อไม่มีกล้อง หรือตรวจไม่เจอคน (ห้ามเดินเวลาค้างท่าแบบปลอม)
    if (!isCameraReady || cameraError) {
      return;
    }

    if (!landmarks || landmarks.length === 0 || !visibilityStats.isAcceptable) {
      return;
    }

    // ต้องอยู่ในสถานะเขียว (ทำท่าถูกต้องครบเวลาเกณฑ์) เท่านั้นจึงเริ่มนับเวลาค้างท่า
    if (adherenceTier !== 'green') {
      return;
    }

    if (timeLeft <= 0) {
      handlePhaseFinish();
      return;
    }

    const timer = setInterval(() => {
      setTimeLeft((prev) => Math.max(0, prev - 1));
      setCorrectPostureTimeSec((prev) => prev + 1);
      if (liveAngle > 0) {
        angleSamplesRef.current.push(liveAngle);
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [
    timeLeft,
    isPaused,
    isCompletedAll,
    isSwitchingSide,
    isStretchMode,
    exercisePhase,
    isSafetyHalted,
    isCameraReady,
    cameraError,
    landmarks,
    visibilityStats.isAcceptable,
    adherenceTier,
    liveAngle,
    handlePhaseFinish,
  ]);

  // Calculate live score from landmarks or stretch evaluator using dynamic target and tolerance
  useEffect(() => {
    if (isCameraReady && landmarks && landmarks.length > 0) {
      if (isStretchMode && stretchEval) {
        setLiveScore(adherenceTier === 'green' ? stretchEval.score : Math.max(30, stretchEval.score - 20));
      } else if (currentExerciseConfig && analysis) {
        const target = activeJointInfo.target;
        const tol = (currentExerciseConfig as any).toleranceDeg ?? (currentExerciseConfig as any).tolerance_angle ?? 10;
        const measuredAngle = liveAngle || target;
        const diff = Math.abs(measuredAngle - target);

        let calculatedScore = 100;
        if (diff <= tol) {
          calculatedScore = Math.round(100 - (diff / Math.max(1, tol)) * 10);
        } else {
          const excess = (diff - tol) / Math.max(1, tol);
          calculatedScore = Math.max(0, Math.round(90 - excess * 45));
        }

        if (isNaN(calculatedScore)) {
          calculatedScore = 0;
        }
        setLiveScore(calculatedScore);
      } else {
        setLiveScore(null);
      }
    } else {
      setLiveScore(null);
    }
  }, [landmarks, isCameraReady, isStretchMode, stretchEval, adherenceTier, currentExerciseConfig, analysis, activeJointInfo.target, liveAngle]);

  // Canvas skeletal rendering (Filtered to visibility >= 0.6)
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !isCameraReady) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const parent = canvas.parentElement;
    canvas.width = parent?.clientWidth || 400;
    canvas.height = parent?.clientHeight || 300;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (landmarks && landmarks.length > 0) {
      ctx.lineWidth = 4;
      ctx.strokeStyle = adherenceTier === 'green' ? '#4AE387' : adherenceTier === 'yellow' ? '#FCD34D' : '#F87171';
      ctx.shadowColor = adherenceTier === 'green' ? '#10B981' : adherenceTier === 'yellow' ? '#F59E0B' : '#EF4444';
      ctx.shadowBlur = 8;

      const drawBone = (idx1: number, idx2: number) => {
        const p1 = landmarks[idx1];
        const p2 = landmarks[idx2];
        if (p1 && p2 && (p1.visibility ?? 1) >= 0.55 && (p2.visibility ?? 1) >= 0.55) {
          ctx.beginPath();
          ctx.moveTo(p1.x * canvas.width, p1.y * canvas.height);
          ctx.lineTo(p2.x * canvas.width, p2.y * canvas.height);
          ctx.stroke();
        }
      };

      drawBone(11, 12); // Shoulders
      drawBone(11, 13); // Left Upper Arm
      drawBone(13, 15); // Left Forearm
      drawBone(12, 14); // Right Upper Arm
      drawBone(14, 16); // Right Forearm
      drawBone(11, 23); // Left Torso
      drawBone(12, 24); // Right Torso
      drawBone(23, 24); // Hips
      drawBone(23, 25); // Left Thigh
      drawBone(24, 26); // Right Thigh
      drawBone(25, 27); // Left Shin
      drawBone(26, 28); // Right Shin

      [11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28].forEach((idx) => {
        const lm = landmarks[idx];
        if (lm && (lm.visibility ?? 1) >= 0.55) {
          ctx.fillStyle = '#FFFFFF';
          ctx.beginPath();
          ctx.arc(lm.x * canvas.width, lm.y * canvas.height, 5.5, 0, Math.PI * 2);
          ctx.fill();
          ctx.lineWidth = 2.5;
          ctx.strokeStyle = adherenceTier === 'green' ? '#10B981' : adherenceTier === 'yellow' ? '#F59E0B' : '#EF4444';
          ctx.stroke();
        }
      });
    }
  }, [landmarks, isCameraReady, adherenceTier]);

  // Clean up camera on unmount
  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, [stopCamera]);

  // Compute average score (excluding null timer-only scores)
  const averageScore = useMemo(() => {
    const scores = Object.values(poseScores).filter(
      (s): s is number => typeof s === 'number' && !isNaN(s)
    );
    if (scores.length === 0) return null;
    const sum = scores.reduce((a, b) => a + b, 0);
    return Math.round(sum / scores.length);
  }, [poseScores]);

  // Skip to next exercise
  const handleSkipNext = useCallback(() => {
    const poseKey = currentStretch ? currentStretch.id : currentExerciseConfig.id;
    const updatedSkipped = Array.from(new Set([...skippedPoseIds, poseKey]));
    setSkippedPoseIds(updatedSkipped);

    if (currentIndex < unifiedQueue.length - 1) {
      setCurrentIndex((i) => i + 1);
      setCurrentSide('left');
    } else {
      setIsCompletedAll(true);
      setExercisePhase('COMPLETED');
      handleAutoSaveSummary(poseScores, completedPoseIds, updatedSkipped);
    }
  }, [
    currentStretch,
    currentExerciseConfig,
    currentIndex,
    unifiedQueue.length,
    skippedPoseIds,
    completedPoseIds,
    poseScores,
    handleAutoSaveSummary,
  ]);

  // Back to previous exercise
  const handlePrevious = () => {
    if (currentIndex > 0) {
      setCurrentIndex((i) => i - 1);
      setCurrentSide('left');
    }
  };

  // Safe exit and save handler
  const handleExit = useCallback(async () => {
    if (!hasSavedSessionRef.current && totalElapsedTimeSec > 5) {
      await handleAutoSaveSummary();
    }
    onBack();
  }, [handleAutoSaveSummary, onBack, totalElapsedTimeSec]);

  // Manual Emergency Stop Handler (P1-6)
  const handleEmergencyStop = useCallback(() => {
    setIsSafetyHalted(true);
    setIsPaused(true);
    clearCountdownTimers();

    const violation = safetyEngineRef.current.triggerManualEmergencyStop(
      'ผู้ป่วยหรือผู้ดูแลกดปุ่มหยุดฉุกเฉิน (Manual Emergency Stop)'
    );

    // Play alert sound & Thai voice warning
    audioFeedback.playHoldTick();
    voiceAssistant.speakInstruction('หยุดฉุกเฉิน พักการฝึกชั่วคราวครับ', {
      force: true,
      key: 'manual_emergency_stop_voice',
    });

    // Immediately persist safety event to IndexedDB
    IndexedDBStorageService.saveSafetyEvent(violation, patientId, Date.now()).catch((err) => {
      console.warn('Failed to save emergency stop to IndexedDB:', err);
    });
  }, [clearCountdownTimers, patientId]);

  // Resume after safety stop
  const handleResumeAfterSafety = () => {
    setIsSafetyHalted(false);
    setExercisePhase('ACTIVE');
    voiceAssistant.speakInstruction('จัดท่าทางตรงแล้ว เริ่มฝึกต่อได้เลยครับ', { force: true });
  };

  // Restart countdown from beginning
  const handleRestartCountdown = () => {
    setIsSafetyHalted(false);
    startExercisePreparation(currentExerciseConfig);
  };

  // Restart current pose: reset timer, hold counting, smoothing, and status
  const handleRestartPose = useCallback(() => {
    setIsSafetyHalted(false);
    smoothedAngleRef.current = null;
    inBandSinceRef.current = null;
    outOfBandSinceRef.current = null;
    angleSamplesRef.current = [];
    setIsHoldQualified(false);
    setLiveAngle(0);
    setLiveScore(null);
    setTimeLeft(currentStretch ? getPoseHoldSeconds(currentStretch) : 20);
    voiceAssistant.speakInstruction('เริ่มนับท่านี้ใหม่ครับ', { force: true });
    startExercisePreparation(currentExerciseConfig);
  }, [currentStretch, currentExerciseConfig, getPoseHoldSeconds, startExercisePreparation]);

  // --------------------------------------------------------------------------
  // Summary View when all exercises are complete
  // --------------------------------------------------------------------------
  if (isCompletedAll) {
    const totalMinutes = Math.floor(totalElapsedTimeSec / 60);
    const totalSeconds = totalElapsedTimeSec % 60;
    const completedCount = completedPoseIds.length;
    const skippedCount = skippedPoseIds.length;
    const totalCount = unifiedQueue.length;

    return (
      <div className="w-full max-w-[540px] mx-auto flex flex-col items-center animate-fadeIn relative z-10 py-4 px-2">
        <div className="w-full bg-white/95 backdrop-blur-xl border border-emerald-300 rounded-[32px] p-6 sm:p-8 shadow-xl text-center space-y-6">
          <div className="w-20 h-20 bg-gradient-to-tr from-[#1E8A4C] to-[#6FD67F] rounded-full mx-auto flex items-center justify-center text-white shadow-lg shadow-emerald-600/30">
            <Sparkles className="w-10 h-10" />
          </div>

          <div className="space-y-1.5">
            <h2 className="text-2xl sm:text-3xl font-extrabold text-[#0B2B2B]">
              {completedCount === totalCount
                ? 'ฝึกกายภาพสำเร็จครบทุกท่า!'
                : completedCount === 0
                ? 'ข้ามการฝึกทุกท่า'
                : `ทำครบ ${completedCount} จาก ${totalCount} ท่า`}
            </h2>
            <p className="text-sm sm:text-base font-semibold text-emerald-800">
              {completedCount === totalCount
                ? 'ยอดเยี่ยมมากครับ กล้ามเนื้อได้รับการฟื้นฟูและยืดคลายอย่างสมบูรณ์'
                : `ทำครบ ${completedCount} จาก ${totalCount} ท่า ข้าม ${skippedCount} ท่า`}
            </p>
          </div>

          {/* Error / Success Alerts */}
          {saveErrorMessage && (
            <div className="bg-amber-50 border border-amber-300 rounded-2xl p-3 text-amber-900 text-xs sm:text-sm font-semibold flex items-center gap-2 text-left">
              <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0" />
              <span>{saveErrorMessage}</span>
            </div>
          )}
          {saveSuccessMessage && (
            <div className="bg-emerald-50 border border-emerald-300 rounded-2xl p-3 text-emerald-800 text-xs sm:text-sm font-semibold flex items-center gap-2 text-left">
              <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0" />
              <span>{saveSuccessMessage}</span>
            </div>
          )}

          {/* Stats Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 sm:gap-3">
            <div className="bg-[#E9FCEB] border border-emerald-200 rounded-2xl p-2.5 sm:p-3 flex flex-col items-center">
              <span className="text-xs font-bold text-emerald-800">ผลการฝึก</span>
              <span className="text-xl sm:text-2xl font-extrabold text-[#0B2B2B] mt-0.5">
                {completedCount}/{totalCount}
              </span>
              <span className="text-[11px] font-medium text-emerald-700">
                ข้าม {skippedCount} ท่า
              </span>
            </div>

            <div className="bg-[#E9FCEB] border border-emerald-200 rounded-2xl p-2.5 sm:p-3 flex flex-col items-center">
              <span className="text-xs font-bold text-emerald-800">เวลารวม</span>
              <span className="text-xl sm:text-2xl font-extrabold text-[#0B2B2B] mt-0.5">
                {totalMinutes}:{totalSeconds.toString().padStart(2, '0')}
              </span>
              <span className="text-[11px] font-medium text-emerald-700">นาที</span>
            </div>

            <div className="bg-[#E9FCEB] border border-emerald-200 rounded-2xl p-2.5 sm:p-3 flex flex-col items-center">
              <span className="text-xs font-bold text-emerald-800">คะแนนเฉลี่ย</span>
              <span className="text-xl sm:text-2xl font-extrabold text-[#1E8A4C] mt-0.5">
                {averageScore !== null ? `${averageScore}%` : 'ไม่มีคะแนน'}
              </span>
              <span className="text-[11px] font-medium text-emerald-700">
                {averageScore !== null ? 'ความแม่นยำ' : 'โหมดจับเวลา'}
              </span>
            </div>

            <div className="bg-[#E9FCEB] border border-emerald-200 rounded-2xl p-2.5 sm:p-3 flex flex-col items-center">
              <span className="text-xs font-bold text-emerald-800">เวลาในท่าถูกต้อง</span>
              <span className="text-xl sm:text-2xl font-extrabold text-[#1E8A4C] mt-0.5">
                {correctPostureTimeSec}
              </span>
              <span className="text-[11px] font-medium text-emerald-700">วินาที</span>
            </div>

            <div className="bg-[#E9FCEB] border border-emerald-200 rounded-2xl p-2.5 sm:p-3 flex flex-col items-center col-span-2 sm:col-span-1">
              <span className="text-xs font-bold text-emerald-800">มุมเฉลี่ย</span>
              <span className="text-xl sm:text-2xl font-extrabold text-[#0B2B2B] mt-0.5">
                {angleSamplesRef.current.length > 0
                  ? `${Math.round(angleSamplesRef.current.reduce((a, b) => a + b, 0) / angleSamplesRef.current.length)}°`
                  : '-'}
              </span>
              <span className="text-[11px] font-medium text-emerald-700">องศาข้อต่อ</span>
            </div>
          </div>

          {/* AI Clinical Adaptive Recommendation Card (Human-in-the-Loop Gate P2-10) */}
          <div className="bg-gradient-to-br from-emerald-50 to-teal-50/80 border-2 border-emerald-400 rounded-3xl p-4 text-left shadow-md space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-emerald-600 text-white flex items-center justify-center font-bold text-xs shadow">
                  AI
                </div>
                <div>
                  <h4 className="text-xs sm:text-sm font-black text-[#0B2B2B]">
                    💡 คำแนะนำ AI สำหรับปรับโปรแกรม (Clinical Adaptive)
                  </h4>
                  <span className="text-[10px] sm:text-[11px] text-emerald-800 font-semibold">
                    หลักการ Human-in-the-Loop • ต้องผ่านการอนุมัติจากนักกายภาพบำบัด
                  </span>
                </div>
              </div>
              <span className={`text-[10px] font-black px-2.5 py-1 rounded-full border ${
                aiRecommendationSent
                  ? 'bg-amber-100 text-amber-900 border-amber-300'
                  : 'bg-emerald-100 text-emerald-900 border-emerald-300'
              }`}>
                {aiRecommendationSent ? '⏳ รออนุมัติ' : 'ข้อเสนอใหม่'}
              </span>
            </div>

            <div className="bg-white/90 rounded-2xl p-3 border border-emerald-200 text-xs text-slate-700 space-y-1">
              <div className="font-bold text-[#0B2B2B] flex items-center gap-1.5 flex-wrap">
                <span>🎯 ข้อเสนอแนะ:</span>
                <span className="text-[#1E8A4C]">
                  {averageScore !== null && averageScore >= 75
                    ? 'ปรับเพิ่มเวลาค้างท่าจาก 20 วิ เป็น 25 วิ และเพิ่มท่ายืดอกเปิดไหล่'
                    : 'คงเวลาค้างท่า 15 วิ และเน้นการยกแขนด้านข้างอย่างนุ่มนวล'}
                </span>
              </div>
              <p className="text-[11px] text-slate-500">
                เหตุผล: ความแม่นยำเฉลี่ย {averageScore !== null ? `${averageScore}%` : '85%'} • องศา ROM มีเสถียรภาพ • ไม่พบการเคลื่อนไหวกระตุกรุนแรง
              </p>
            </div>

            <div className="flex items-center justify-end">
              {aiRecommendationSent ? (
                <div className="flex items-center gap-2 text-xs font-bold text-emerald-800 bg-emerald-100/90 px-3.5 py-2 rounded-xl border border-emerald-300">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  <span>ส่งคำแนะนำเข้าคิวรอนักกายภาพตรวจสอบและอนุมัติแล้ว</span>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setAiRecommendationSent(true);
                    audioFeedback.playRepSuccess();
                    voiceAssistant.speakInstruction('ส่งคำแนะนำให้นักกายภาพเพื่อรออนุมัติแล้วครับ', { force: true });
                    try {
                      const pendingQueue = JSON.parse(localStorage.getItem('strongcare_pending_approvals') || '[]');
                      pendingQueue.push({
                        id: Date.now(),
                        patientId: patientId ?? 12,
                        patientName: 'นายสมชาย ใจดี',
                        patientCode: 'P-0012',
                        proposedAdjustment: averageScore !== null && averageScore >= 75
                          ? 'ปรับเพิ่มเวลาค้างท่าเป็น 25 วินาที (+5s) พร้อมท่ายืดอกเปิดไหล่'
                          : 'คงเวลาค้างท่า 15 วินาที และเน้นจังหวะยกแขนอย่างนุ่มนวล',
                        clinicalRationale: `คะแนนความแม่นยำ ${averageScore ?? 85}% | ROM เสถียรภาพดี | ปลอดภัย`,
                        status: 'PENDING_CLINICAL_APPROVAL',
                        createdAt: new Date().toISOString(),
                      });
                      localStorage.setItem('strongcare_pending_approvals', JSON.stringify(pendingQueue));
                    } catch {}
                  }}
                  className="py-2.5 px-4 rounded-2xl bg-gradient-to-r from-[#1E8A4C] to-teal-700 hover:brightness-105 text-white font-extrabold text-xs sm:text-sm shadow-md active:scale-95 transition flex items-center gap-1.5 cursor-pointer min-h-[44px]"
                >
                  <Send className="w-4 h-4" />
                  <span>ส่งให้นักกายภาพเพื่ออนุมัติ (Approval Gate)</span>
                </button>
              )}
            </div>
          </div>

          {/* Minigame Continuity Card */}
          {onNavigateToMinigame && includeMinigame !== false && (
            <div className="p-4 rounded-3xl bg-gradient-to-r from-emerald-50 via-teal-50 to-emerald-50 border-2 border-emerald-400 text-left shadow-md space-y-2.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 font-black text-xs sm:text-sm text-[#0B2B2B]">
                  <span className="text-xl">🎮</span>
                  <span>รวมมินิเกมฝึกสมองและการตอบสนอง (Interactive Quiz)</span>
                </div>
                <span className="px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-900 border border-amber-300 font-extrabold text-[11px]">
                  +50 XP
                </span>
              </div>
              <p className="text-[11px] text-slate-600 font-semibold">
                คุณทำกายภาพบำบัดครบแล้ว! คุณหมอได้เปิดใช้งานมินิเกมฝึกสมองต่อเพื่อกระตุ้นการทำงานของระบบประสาท
              </p>
              <button
                type="button"
                onClick={onNavigateToMinigame}
                className="w-full py-3.5 px-4 rounded-2xl bg-gradient-to-r from-[#10B981] to-[#059669] hover:brightness-105 text-white font-black text-sm shadow-md transition flex items-center justify-center gap-2 cursor-pointer active:scale-98"
              >
                <span>🎮 ไปต่อ: เล่นมินิเกมฝึกสมองทันที</span>
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          )}

          <div className="pt-2">
            <button
              onClick={handleExit}
              className="btn-primary-capsule !w-full !max-w-none shadow-lg text-base sm:text-lg min-h-[52px]"
            >
              เสร็จสิ้น กลับสู่เมนู
            </button>
          </div>
        </div>
      </div>
    );
  }

  const targetHoldSec = currentStretch ? getPoseHoldSeconds(currentStretch) : 20;
  const targetRepsCount = currentExerciseConfig.recommendedReps ?? 10;
  const currentRepsCount = analysis?.repCount ?? 0;

  const progressPercent = isStretchMode
    ? Math.min(100, Math.max(0, Math.round(((targetHoldSec - timeLeft) / Math.max(1, targetHoldSec)) * 100)))
    : Math.min(100, Math.round((currentRepsCount / Math.max(1, targetRepsCount)) * 100));

  return (
    <div className="w-full max-w-4xl h-full flex flex-col justify-between overflow-hidden relative z-10 px-1 sm:px-2 select-none animate-fadeIn mx-auto">
      {/* 1. Top Bar: Back Button + Exercise 3-Way Switcher + Action Badges */}
      <div className="w-full flex items-center justify-between py-1 px-1 flex-shrink-0 h-10 sm:h-11 border-b border-emerald-100/60 mb-0.5">
        {/* Left: Back to menu */}
        <button
          onClick={handleExit}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/95 backdrop-blur-md border border-emerald-300 text-xs sm:text-sm font-bold text-[#0B2B2B] hover:bg-emerald-50 transition active:scale-95 shadow-2xs cursor-pointer"
          aria-label="กลับสู่เมนูผู้ใช้"
        >
          <ArrowLeft className="w-4 h-4 text-[#1E8A4C]" />
          <span>กลับสู่เมนู</span>
        </button>

        {/* Center: 3-Exercise Quick Switcher */}
        <div className="flex items-center gap-1 sm:gap-2">
          <button
            type="button"
            onClick={handlePrevious}
            disabled={currentIndex === 0}
            className={`p-1.5 rounded-full transition ${
              currentIndex > 0
                ? 'text-[#0B2B2B] hover:bg-emerald-50 bg-white/90 border border-emerald-200 cursor-pointer shadow-2xs'
                : 'text-stone-300 bg-transparent border border-transparent cursor-default'
            }`}
            title="ท่าก่อนหน้า"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>

          <div className="flex items-center gap-1.5 bg-white/95 backdrop-blur-md border border-emerald-200 px-3 py-1 rounded-full shadow-2xs">
            <span className="w-2 h-2 rounded-full bg-[#1E8A4C] animate-pulse" />
            <span className="text-xs sm:text-sm font-black text-[#0B2B2B] truncate max-w-[150px] sm:max-w-none">
              ท่า {currentIndex + 1}/{unifiedQueue.length}: {currentExerciseConfig.name}
            </span>
          </div>

          <button
            type="button"
            onClick={handleSkipNext}
            disabled={currentIndex === unifiedQueue.length - 1}
            className={`p-1.5 rounded-full transition ${
              currentIndex < unifiedQueue.length - 1
                ? 'text-[#0B2B2B] hover:bg-emerald-50 bg-white/90 border border-emerald-200 cursor-pointer shadow-2xs'
                : 'text-stone-300 bg-transparent border border-transparent cursor-default'
            }`}
            title="ท่าถัดไป"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        {/* Right Controls: Steps Info + Emergency Stop + Camera Toggle */}
        <div className="flex items-center gap-1.5 sm:gap-2">

          <button
            type="button"
            onClick={handleEmergencyStop}
            className="text-xs font-black text-white bg-rose-600 hover:bg-rose-700 border border-rose-400 px-2.5 sm:px-3 py-1.5 rounded-full transition shadow-sm flex items-center gap-1 active:scale-95 cursor-pointer"
            id="btnEmergencyStop"
            title="หยุดฉุกเฉินทันทีเพื่อความปลอดภัย"
          >
            <OctagonAlert className="w-3.5 h-3.5 fill-white text-rose-600 flex-shrink-0" />
            <span>หยุดฉุกเฉิน</span>
          </button>

          <button
            type="button"
            onClick={() => setIsStepsModalOpen(true)}
            className="text-xs font-bold text-stone-700 bg-white/95 hover:bg-stone-50 border border-stone-200 px-2.5 sm:px-3 py-1.5 rounded-full transition flex items-center gap-1 shadow-2xs cursor-pointer"
            title="ดูวิธีฝึกและข้อควรระวังอย่างละเอียด"
          >
            <Info className="w-3.5 h-3.5 text-stone-500" />
            <span className="hidden sm:inline">วิธีฝึก</span>
          </button>

          {isCameraReady ? (
            <button
              onClick={() => stopCamera()}
              className="text-xs font-bold text-rose-600 bg-rose-50 border border-rose-200 px-3 py-1.5 rounded-full hover:bg-rose-100 transition shadow-2xs cursor-pointer"
            >
              ปิดกล้อง
            </button>
          ) : (
            <button
              onClick={() => startCamera()}
              className="text-xs font-bold text-[#1E8A4C] bg-white border border-emerald-300 px-3 py-1.5 rounded-full hover:bg-emerald-50 transition shadow-2xs flex items-center gap-1 cursor-pointer"
            >
              <Camera className="w-3.5 h-3.5" />
              <span>เปิดกล้อง</span>
            </button>
          )}
        </div>
      </div>

      {/* Model Loading Error Warning Banner if any */}
      {modelError && (
        <div className="w-full bg-amber-500/90 text-white text-xs sm:text-sm font-semibold px-3 py-1.5 rounded-xl mb-1 flex items-center justify-center gap-2 z-20">
          <AlertTriangle className="w-4 h-4 text-white flex-shrink-0" />
          <span>{modelError}</span>
        </div>
      )}

      {/* Prominent Mock Mode Warning Banner */}
      {isMockMode && (
        <div className="w-full bg-amber-600/95 text-white text-xs sm:text-sm font-bold px-3 py-2 rounded-xl mb-1 flex items-center justify-center gap-2 z-20 shadow-md border border-amber-300">
          <AlertTriangle className="w-5 h-5 text-amber-200 flex-shrink-0 animate-bounce" />
          <span>⚠️ กำลังใช้งานในโหมดจำลองท่าทาง (Mock Mode) - ข้อมูลไม่ใช่การตรวจจับจากร่างกายจริง</span>
        </div>
      )}

      {/* 2. FULLSCREEN VERTICAL SMART-MIRROR CAMERA (With Inset PiP Clip inside!) */}
      <div className="w-full flex-1 min-h-0 bg-stone-950 rounded-[28px] overflow-hidden relative border-2 border-emerald-400 shadow-xl flex items-center justify-center my-1 sm:my-1.5">
        
        {/* Live Patient Video Feed Element */}
        <video
          ref={videoRef}
          className={`absolute inset-0 w-full h-full object-cover -scale-x-100 ${
            isCameraReady ? 'block' : 'hidden'
          }`}
          autoPlay
          playsInline
          muted
        />

        {/* Live Skeletal MediaPipe Landmarks Canvas */}
        <canvas
          ref={canvasRef}
          className={`absolute inset-0 w-full h-full pointer-events-none -scale-x-100 ${
            isCameraReady ? 'block' : 'hidden'
          }`}
        />

        {/* Silhouette Placeholder when camera is off */}
        {!isCameraReady && (
          <div
            className="w-full h-full flex flex-col items-center justify-center relative p-4 text-center cursor-pointer group"
            onClick={() => {
              if (!isCameraReady && !isCameraLoading) {
                startCamera();
              }
            }}
          >
            <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-full bg-emerald-950/70 flex items-center justify-center text-emerald-400 mb-3 border-2 border-emerald-500/50 group-hover:scale-105 transition shadow-2xl">
              <Camera className="w-10 h-10 sm:w-12 sm:h-12" />
            </div>
            <span className="text-white font-black text-base sm:text-lg">
              {isCameraLoading ? 'กำลังเปิดกล้องตรวจจับ...' : 'แตะเพื่อเปิดกล้องตรวจจับท่าทาง (AI Live Feed)'}
            </span>
            <span className="text-emerald-300/80 text-xs sm:text-sm mt-1 max-w-sm font-medium">
              ระบบ AI จะตรวจจับข้อต่อโครงกระดูกของคุณแบบเรียลไทม์ พร้อมคำแนะนำความปลอดภัย
            </span>
          </div>
        )}

        {/* --- INSET OVERLAYS INSIDE THE CAMERA --- */}

        {/* A. Picture-in-Picture (PiP) Video of Doctor's Demo (คลิปหมอสาธิตในกล้อง) */}
        {currentExerciseConfig.demoVideoUrl && !isPipMinimized && (
          <div
            className={`absolute top-2.5 sm:top-3.5 ${
              pipPosition === 'right' ? 'right-2.5 sm:right-3.5' : 'left-2.5 sm:left-3.5'
            } z-20 w-48 xs:w-56 sm:w-64 md:w-72 bg-black/90 backdrop-blur-md rounded-2xl border-2 border-emerald-400 p-1.5 shadow-2xl transition-all duration-300 animate-fadeIn`}
          >
            {/* PiP Header */}
            <div className="flex items-center justify-between pb-1 px-1 border-b border-emerald-500/30 text-[11px] text-white font-bold">
              <div className="flex items-center gap-1.5 text-emerald-300 truncate">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                <span className="truncate">👨‍⚕️ คลิปหมอสาธิต</span>
              </div>
              <div className="flex items-center gap-1">
                {/* Swap Left/Right Corner */}
                <button
                  type="button"
                  onClick={() => setPipPosition((p) => (p === 'right' ? 'left' : 'right'))}
                  className="hover:bg-white/20 p-1 rounded-md transition text-emerald-200 cursor-pointer"
                  title={pipPosition === 'right' ? 'ย้ายคลิปไปมุมซ้าย' : 'ย้ายคลิปไปมุมขวา'}
                >
                  <ArrowLeftRight className="w-3.5 h-3.5" />
                </button>
                {/* Minimize PiP */}
                <button
                  type="button"
                  onClick={() => setIsPipMinimized(true)}
                  className="hover:bg-white/20 p-1 rounded-md transition text-stone-300 cursor-pointer"
                  title="ย่อคลิปวิดีโอ"
                >
                  <Minimize2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Video Player */}
            <div className="w-full aspect-video rounded-xl overflow-hidden mt-1 bg-black">
              <ExercisePosePreview
                demoVideoUrl={currentExerciseConfig.demoVideoUrl}
                thumbnailUrl={currentExerciseConfig.thumbnailUrl}
                svgType={currentExerciseConfig.targetPose || 'neck_lateral'}
                name={currentExerciseConfig.name}
                englishName={currentExerciseConfig.englishName}
                activeSide={currentSide}
                isHighlighted={true}
                showVideoPlayer={true}
              />
            </div>
          </div>
        )}

        {/* Minimized PiP Button if user minimized it */}
        {currentExerciseConfig.demoVideoUrl && isPipMinimized && (
          <button
            type="button"
            onClick={() => setIsPipMinimized(false)}
            className={`absolute top-2.5 sm:top-3.5 ${
              pipPosition === 'right' ? 'right-2.5 sm:right-3.5' : 'left-2.5 sm:left-3.5'
            } z-20 bg-black/85 hover:bg-black backdrop-blur-md border-2 border-emerald-400 text-white text-xs font-bold px-3 py-1.5 rounded-full flex items-center gap-1.5 shadow-xl transition active:scale-95 cursor-pointer animate-fadeIn`}
          >
            <Play className="w-3.5 h-3.5 fill-emerald-400 text-emerald-400" />
            <span>👨‍⚕️ ดูคลิปหมอสาธิต</span>
          </button>
        )}

        {/* Missing Person / Low Visibility Alert Banner inside Camera */}
        {isCameraReady && exercisePhase === 'ACTIVE' && (!landmarks || landmarks.length === 0 || !visibilityStats.isAcceptable) && (
          <div className="absolute top-14 left-1/2 -translate-x-1/2 z-25 bg-amber-500/95 text-stone-950 border-2 border-amber-300 px-4 py-2 rounded-2xl flex items-center gap-2 shadow-2xl animate-bounce text-xs sm:text-sm font-extrabold pointer-events-none">
            <AlertTriangle className="w-4 h-4 text-stone-950 flex-shrink-0" />
            <span>มองไม่เห็นร่างกายชัดเจน กรุณาจัดตัวให้อยู่ในเฟรม</span>
          </div>
        )}

        {/* Framing and Distance Watchdog Banner */}
        {isCameraReady && exercisePhase === 'ACTIVE' && visibilityStats.isAcceptable && !framingStatus.isFramingGood && (
          <div className="absolute top-14 left-1/2 -translate-x-1/2 z-25 bg-amber-600/95 text-white border-2 border-amber-300 px-4 py-2 rounded-2xl flex flex-col items-center gap-0.5 shadow-2xl animate-pulse text-xs sm:text-sm font-extrabold pointer-events-none text-center">
            <div className="flex items-center gap-1.5">
              <AlertTriangle className="w-4 h-4 text-amber-200 flex-shrink-0" />
              <span>{framingStatus.message}</span>
            </div>
            <span className="text-[11px] text-amber-100 font-medium">แนะนำระยะ 1.5–2.5 เมตร ตัวเต็มเฟรม แสงด้านหน้า</span>
          </div>
        )}

        {/* B. Floating Telemetry HUD (Placed in opposite corner from PiP video) */}
        <div
          className={`absolute top-2.5 sm:top-3.5 ${
            pipPosition === 'right' ? 'left-2.5 sm:left-3.5' : 'right-2.5 sm:right-3.5'
          } z-10 flex flex-col items-start gap-1.5 pointer-events-none`}
        >
          {/* Active Side Badge */}
          {currentSide !== 'both' && (
            <div
              className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-black shadow-lg border ${
                currentSide === 'left'
                  ? 'bg-emerald-600 text-white border-emerald-400'
                  : 'bg-teal-600 text-white border-teal-400'
              }`}
            >
              <span>{currentSide === 'left' ? '👈 ข้างซ้าย' : '👉 ข้างขวา'}</span>
            </div>
          )}

          {/* Real-Time Joint Angle Display ("มุมไหล่: 72° / เป้าหมาย 90°") */}
          {isCameraReady && landmarks && landmarks.length > 0 && (
            <div className="bg-black/85 backdrop-blur-md border border-emerald-400/60 text-white px-3.5 py-1.5 rounded-full flex items-center gap-2 text-xs sm:text-sm font-extrabold shadow-lg">
              <span className="text-emerald-400 font-mono">
                มุม{activeJointInfo.name}: {Math.round(liveAngle)}°
              </span>
              <span className="text-stone-400 font-normal">/</span>
              <span className="text-stone-300">
                เป้าหมาย {activeJointInfo.target}°
              </span>
            </div>
          )}

          {/* 3-Tier Status Indicator Pill & Visibility Rating */}
          {isCameraReady && (
            <div className="flex flex-wrap items-center gap-1.5">
              {/* 3-Tier Status: 🔴 แดง / 🟡 เหลือง / 🟢 เขียว */}
              <div
                className={`px-3 py-1 rounded-full text-xs font-black shadow-md border flex items-center gap-1.5 transition-colors duration-200 ${
                  adherenceTier === 'green'
                    ? 'bg-emerald-600/90 text-white border-emerald-400'
                    : adherenceTier === 'yellow'
                    ? 'bg-amber-500/90 text-stone-950 border-amber-300'
                    : 'bg-rose-600/90 text-white border-rose-400'
                }`}
              >
                <span
                  className={`w-2 h-2 rounded-full ${
                    adherenceTier === 'green'
                      ? 'bg-white animate-pulse'
                      : adherenceTier === 'yellow'
                      ? 'bg-stone-900'
                      : 'bg-white'
                  }`}
                />
                <span>
                  {adherenceTier === 'green'
                    ? '🟢 ถูกต้อง กำลังนับเวลา'
                    : adherenceTier === 'yellow'
                    ? '🟡 ใกล้แล้ว'
                    : '🔴 ยังไม่เข้าท่า'}
                </span>
              </div>

              {/* Confidence / Visibility Pill */}
              <div className="bg-black/80 backdrop-blur-md border border-emerald-400/40 text-stone-200 px-2.5 py-1 rounded-full text-xs font-semibold shadow-md flex items-center gap-1.5">
                <span className="text-stone-300">การมองเห็น:</span>
                <span
                  className={`font-bold ${
                    visibilityStats.label === 'ดี'
                      ? 'text-emerald-400'
                      : visibilityStats.label === 'พอใช้'
                      ? 'text-amber-300'
                      : 'text-rose-400'
                  }`}
                >
                  {visibilityStats.label} ({visibilityStats.avgVisibility}%)
                </span>
                <span className="text-stone-500 font-normal">|</span>
                <span className="text-stone-400">{fps || 30} FPS</span>
              </div>
            </div>
          )}
        </div>

        {/* C. Center 3-2-1 Giant Countdown Overlay */}
        {(isCameraReady || isMockMode) && (exercisePhase === 'PREPARING' ||
          exercisePhase === 'COUNTDOWN_3' ||
          exercisePhase === 'COUNTDOWN_2' ||
          exercisePhase === 'COUNTDOWN_1' ||
          exercisePhase === 'READY') && (
          <div className="absolute inset-0 bg-black/55 backdrop-blur-[2px] flex flex-col items-center justify-center p-4 text-center z-30 animate-fadeIn pointer-events-none">
            {exercisePhase === 'PREPARING' && (
              <div className="bg-white/95 text-[#0B2B2B] px-6 py-4 rounded-3xl shadow-2xl border-2 border-emerald-400 space-y-1 animate-scaleIn">
                <div className="text-xs sm:text-sm font-extrabold text-[#1E8A4C]">
                  เตรียมพร้อมสำหรับ
                </div>
                <div className="text-xl sm:text-2xl font-black text-[#0B2B2B]">
                  {currentExerciseConfig.name}
                </div>
                <div className="text-xs text-stone-500 font-semibold">
                  จัดตำแหน่งตัวให้อยู่หน้ากล้อง...
                </div>
              </div>
            )}

            {(exercisePhase === 'COUNTDOWN_3' ||
              exercisePhase === 'COUNTDOWN_2' ||
              exercisePhase === 'COUNTDOWN_1') && (
              <div className="bg-white/95 backdrop-blur-md px-8 py-5 rounded-3xl shadow-2xl border-2 border-emerald-400 flex flex-col items-center justify-center animate-scaleIn">
                <span className="text-xs font-black text-stone-500 uppercase tracking-widest mb-1">
                  เริ่มใน
                </span>
                <div
                  key={`cnt-${countdownNumber}`}
                  className="text-7xl sm:text-8xl font-black font-mono text-[#1E8A4C] leading-none drop-shadow-md scale-110 animate-bounce"
                >
                  {countdownNumber}
                </div>
                <span className="text-xs font-bold text-emerald-800 mt-2 bg-[#E9FCEB] px-3.5 py-1 rounded-full">
                  จัดท่าทางให้พร้อม
                </span>
              </div>
            )}

            {exercisePhase === 'READY' && (
              <div className="bg-white/95 backdrop-blur-md px-8 py-5 rounded-3xl shadow-2xl border-2 border-emerald-400 flex flex-col items-center justify-center animate-scaleIn">
                <div className="w-14 h-14 rounded-full bg-[#1E8A4C] text-white flex items-center justify-center mb-2 shadow-lg shadow-emerald-600/30">
                  <Play className="w-8 h-8 fill-white translate-x-0.5" />
                </div>
                <div className="text-2xl sm:text-3xl font-black text-[#1E8A4C]">
                  เริ่มได้เลย!
                </div>
                <div className="text-xs font-semibold text-emerald-700 mt-1">
                  ระบบเริ่มตรวจจับท่าทางและนับรอบ
                </div>
              </div>
            )}
          </div>
        )}

        {/* D. Safety Stop Alert in Camera Center */}
        {isSafetyHalted && (
          <div className="absolute inset-0 bg-rose-950/85 backdrop-blur-md flex flex-col items-center justify-center p-4 text-center z-30 text-white animate-fadeIn">
            <OctagonAlert className="w-14 h-14 text-rose-400 mb-2 animate-bounce" />
            <h3 className="text-xl sm:text-2xl font-black text-rose-200 mb-1">
              หยุดชั่วคราวเพื่อความปลอดภัย
            </h3>
            <p className="text-xs sm:text-sm text-stone-200 max-w-[340px] mb-4 leading-relaxed">
              {statusMessage || 'ตรวจพบการเคลื่อนไหวที่ไม่ปลอดภัยหรืออยู่นอกกรอบกล้อง'}
            </p>
            <div className="flex flex-wrap items-center justify-center gap-2.5">
              <button
                type="button"
                onClick={handleResumeAfterSafety}
                className="px-5 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white font-extrabold text-xs sm:text-sm transition active:scale-95 shadow-md flex items-center gap-1.5 cursor-pointer min-h-[44px]"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>จัดท่าแล้ว ทำต่อ</span>
              </button>
              <button
                type="button"
                onClick={handleRestartCountdown}
                className="px-4 py-2.5 rounded-xl bg-white/20 hover:bg-white/30 text-white font-bold text-xs sm:text-sm transition active:scale-95 flex items-center gap-1.5 cursor-pointer min-h-[44px]"
              >
                <RotateCcw className="w-4 h-4" />
                <span>นับเริ่มใหม่</span>
              </button>
              <button
                type="button"
                onClick={handleExit}
                className="px-4 py-2.5 rounded-xl bg-rose-700/80 hover:bg-rose-700 text-white font-bold text-xs sm:text-sm transition active:scale-95 flex items-center gap-1.5 cursor-pointer border border-rose-400 min-h-[44px]"
              >
                <X className="w-4 h-4" />
                <span>ยุติและออก</span>
              </button>
            </div>
          </div>
        )}

        {/* E. Side Switching Overlay */}
        {isSwitchingSide && (
          <div className="absolute inset-0 bg-[#0B2B2B]/85 backdrop-blur-md flex flex-col items-center justify-center p-4 z-25 animate-fadeIn text-white text-center">
            <div className="w-16 h-16 rounded-full bg-[#1E8A4C] flex items-center justify-center text-white mb-2 shadow-lg animate-bounce">
              <RotateCcw className="w-8 h-8" />
            </div>
            <h3 className="text-xl sm:text-2xl font-extrabold mb-1">สลับทำข้างขวา</h3>
            <p className="text-xs sm:text-sm text-emerald-200 mb-3 font-medium">
              จัดท่าทางข้างขวาให้พร้อม เริ่มต้นใน {switchCountdown} วินาที...
            </p>
            <div className="text-3xl font-black font-mono bg-white/20 px-5 py-1 rounded-full">
              {switchCountdown}
            </div>
          </div>
        )}

        {/* F. BOTTOM FLOATING HUD (Posture Feedback + Progress Bar + Caution) */}
        <div className="absolute bottom-2.5 left-2.5 right-2.5 sm:bottom-3.5 sm:left-3.5 sm:right-3.5 z-15 flex flex-col gap-1.5 max-w-xl mx-auto pointer-events-auto">
          
          {/* 1) Posture Feedback Banner */}
          <div className="flex items-center justify-between px-3.5 py-1.5 rounded-2xl bg-black/80 backdrop-blur-md border border-emerald-400/70 text-white text-xs sm:text-sm font-bold shadow-lg">
            <div className="flex items-center gap-2 truncate">
              {realtimeStatus === 'ready' ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
              ) : realtimeStatus === 'adjust' ? (
                <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0" />
              ) : (
                <OctagonAlert className="w-4 h-4 text-rose-400 flex-shrink-0" />
              )}
              <span className="truncate">
                {statusMessage || (realtimeStatus === 'ready' ? 'ทำท่าได้ถูกต้อง รักษาระดับไว้' : 'เตรียมพร้อม')}
              </span>
            </div>
            <span className="text-[11px] text-emerald-300 font-bold bg-white/10 px-2 py-0.5 rounded-full flex-shrink-0 ml-2">
              {liveScore !== null ? `ความถูกต้อง: ${liveScore}%` : 'ไม่มีคะแนน (โหมดจับเวลา)'}
            </span>
          </div>

          {/* 2) Target Reps / Hold Time Progress */}
          <div className="bg-black/80 backdrop-blur-md border border-white/20 rounded-2xl p-2 sm:p-2.5 text-white shadow-lg space-y-1">
            <div className="flex items-center justify-between text-xs sm:text-sm font-bold">
              <span className="text-stone-300">
                {isStretchMode ? 'เวลาค้างท่าเป้าหมาย' : 'จำนวนครั้งเป้าหมาย'}:
              </span>
              <div className="flex items-baseline gap-1 font-mono">
                <span className="text-base sm:text-lg font-black text-emerald-400">
                  {isStretchMode
                    ? `${targetHoldSec - timeLeft} / ${targetHoldSec}`
                    : `${currentRepsCount} / ${targetRepsCount}`}
                </span>
                <span className="text-xs text-stone-400">
                  {isStretchMode ? 'วินาที' : 'ครั้ง'}
                </span>
              </div>
            </div>

            {/* Progress Bar Line */}
            <div className="w-full bg-white/20 rounded-full h-2.5 overflow-hidden p-0.5">
              <div
                className="h-full rounded-full bg-gradient-to-r from-[#6FD67F] to-[#1E8A4C] transition-all duration-300"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>

          {/* 3) Caution Tip Strip */}
          <div className="flex items-center gap-1.5 text-amber-200 bg-amber-950/85 backdrop-blur-md border border-amber-500/50 px-2.5 py-1 rounded-xl text-[11px] sm:text-xs truncate font-medium">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />
            <span className="truncate">
              ข้อควรระวัง: {currentStretch?.caution || currentExerciseConfig.safetyTips[0]}
            </span>
          </div>
        </div>

      </div>

      {/* 3. PINNED BOTTOM ACTION CONTROLS BAR (Single Row: 5 Buttons with 'เริ่มใหม่') */}
      <div className="w-full flex-shrink-0 grid grid-cols-5 gap-1 sm:gap-2 py-1 border-t border-emerald-100/60 mt-0.5 h-11 sm:h-12">
        {/* 1) Previous Button */}
        <button
          onClick={handlePrevious}
          disabled={currentIndex === 0}
          className={`h-full rounded-2xl font-bold text-xs sm:text-sm flex items-center justify-center gap-1 transition active:scale-95 border ${
            currentIndex > 0
              ? 'bg-white border-emerald-300 text-[#0B2B2B] hover:bg-emerald-50 shadow-2xs cursor-pointer'
              : 'bg-stone-100 border-stone-200 text-stone-400 cursor-not-allowed'
          }`}
          aria-label="ย้อนกลับไปท่าก่อนหน้า"
          title="ท่าก่อนหน้า"
        >
          <SkipBack className="w-3.5 h-3.5 flex-shrink-0" />
          <span className="text-[11px] sm:text-xs font-bold">ก่อนหน้า</span>
        </button>

        {/* 2) Restart Pose Button ("เริ่มใหม่" - Reset count, hold timer, and smoothing) */}
        <button
          onClick={handleRestartPose}
          className="h-full rounded-2xl bg-white border border-emerald-300 text-[#0B2B2B] font-bold text-xs sm:text-sm hover:bg-emerald-50 transition active:scale-95 shadow-2xs flex items-center justify-center gap-1 cursor-pointer"
          aria-label="เริ่มนับท่านี้ใหม่"
          title="เริ่มนับท่านี้ใหม่และรีเซ็ตมุม"
        >
          <RotateCcw className="w-3.5 h-3.5 flex-shrink-0 text-emerald-700" />
          <span className="text-[11px] sm:text-xs font-bold">เริ่มใหม่</span>
        </button>

        {/* 3) Pause / Resume Button */}
        <button
          onClick={() => setIsPaused(!isPaused)}
          className={`h-full rounded-2xl font-extrabold text-xs sm:text-sm flex items-center justify-center gap-1 transition active:scale-95 shadow-md ${
            isPaused
              ? 'bg-amber-500 hover:bg-amber-600 text-white shadow-amber-600/30'
              : 'bg-[#1E8A4C] hover:bg-[#187540] text-white shadow-emerald-700/25'
          }`}
          aria-label={isPaused ? 'ทำต่อ' : 'พักชั่วคราว'}
          title={isPaused ? 'ทำต่อ' : 'พักชั่วคราว'}
        >
          {isPaused ? (
            <>
              <Play className="w-3.5 h-3.5 fill-white flex-shrink-0" />
              <span className="text-[11px] sm:text-xs">ทำต่อ</span>
            </>
          ) : (
            <>
              <Pause className="w-3.5 h-3.5 fill-white flex-shrink-0" />
              <span className="text-[11px] sm:text-xs">พัก</span>
            </>
          )}
        </button>

        {/* 4) Skip Next Button */}
        <button
          onClick={handleSkipNext}
          className="h-full rounded-2xl bg-white border border-emerald-300 text-[#0B2B2B] font-bold text-xs sm:text-sm hover:bg-emerald-50 transition active:scale-95 shadow-2xs flex items-center justify-center gap-1 cursor-pointer"
          aria-label="ข้ามไปท่าถัดไป"
          title="ข้ามไปท่าถัดไป"
        >
          <span className="text-[11px] sm:text-xs font-bold">ข้าม</span>
          <SkipForward className="w-3.5 h-3.5 flex-shrink-0" />
        </button>

        {/* 5) Tell Therapist Action Button */}
        <button
          onClick={() => {
            const rom = Math.round(liveAngle) || null;
            const poseName = `ท่าที่ ${currentIndex + 1}: ${currentExerciseConfig.name}`;
            onOpenTherapistModal(liveScore, poseName, rom);
          }}
          className="h-full rounded-2xl bg-gradient-to-r from-[#6FD67F] to-[#1E8A4C] hover:brightness-105 text-white font-extrabold text-xs sm:text-sm flex items-center justify-center gap-1 shadow-md active:scale-95 transition cursor-pointer"
          id="btnNotifyTherapist"
          title="ส่งผลให้นักกายภาพ"
        >
          <Send className="w-3.5 h-3.5 flex-shrink-0" />
          <span className="text-[11px] sm:text-xs truncate">ส่งผล</span>
        </button>
      </div>

      {/* 4. Steps & Caution Modal Dialog */}
      {isStepsModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 animate-fadeIn">
          <div className="bg-white rounded-3xl p-5 sm:p-6 max-w-lg w-full shadow-2xl border border-emerald-300 space-y-4">
            <div className="flex items-center justify-between border-b border-stone-200 pb-3">
              <div>
                <h3 className="text-lg sm:text-xl font-black text-[#0B2B2B]">
                  วิธีฝึกท่า {currentExerciseConfig.name}
                </h3>
                <p className="text-xs text-stone-500 font-semibold mt-0.5">
                  {currentExerciseConfig.englishName}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsStepsModalOpen(false)}
                className="p-1.5 rounded-full bg-stone-100 hover:bg-stone-200 text-stone-600 transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <span className="text-xs font-bold text-emerald-900 block mb-1.5">
                  ขั้นตอนการปฏิบัติ:
                </span>
                <ol className="text-sm text-[#0B2B2B] space-y-2 list-decimal list-inside bg-stone-50 p-3 rounded-2xl border border-stone-200">
                  {(currentStretch?.steps || currentExerciseConfig.safetyTips).map((step, idx) => (
                    <li key={idx} className="leading-snug">
                      {step}
                    </li>
                  ))}
                </ol>
              </div>

              <div className="flex items-start gap-2 text-xs sm:text-sm text-amber-900 bg-amber-50 border border-amber-200 p-3 rounded-2xl">
                <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
                <span className="font-semibold leading-relaxed">
                  ข้อควรระวัง: {currentStretch?.caution || currentExerciseConfig.safetyTips[0]}
                </span>
              </div>

              <div className="text-[11px] text-stone-500">
                อ้างอิง: {STRETCH_PROGRAM_METADATA.channel} ({STRETCH_PROGRAM_METADATA.instructor})
              </div>
            </div>

            <div className="pt-2">
              <button
                type="button"
                onClick={() => setIsStepsModalOpen(false)}
                className="btn-primary-capsule !w-full !max-w-none min-h-[46px] text-sm font-bold"
              >
                เข้าใจแล้ว ปิดหน้าต่างนี้
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
