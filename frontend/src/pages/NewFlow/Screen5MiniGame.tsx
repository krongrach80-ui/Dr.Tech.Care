import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  ArrowLeft,
  Settings,
  Volume2,
  VolumeX,
  RotateCcw,
  SkipForward,
  LogOut,
  Camera,
  Trophy,
  Sparkles,
  Send,
  Home,
  CheckCircle2,
  XCircle,
  Clock,
  Touchpad,
  Calendar,
  Pause,
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { Patient } from '../../types/patient';
import {
  MiniGameQuestion,
  getRandomMiniGameQuestions,
} from '../../data/miniGameQuestions';
import {
  getSavedMiniGameSettings,
  MiniGameSettings,
} from '../../services/miniGameSettingsService';
import { audioFeedback } from '../../services/audioService';
import { useCamera } from '../../hooks/useCamera';
import { usePose } from '../../hooks/usePose';
import { MiniGameCard } from '../../components/MiniGame/MiniGameCard';
import { MiniGameCameraView } from '../../components/MiniGame/MiniGameCameraView';
import { supabaseService } from '../../services/supabaseService';

interface Screen5MiniGameProps {
  patient: Patient | null;
  onBack: () => void;
  onOpenTherapistModal: (score: number, poseName: string, romAngle: number | null) => void;
  onOpenSettings: () => void;
  questionCount?: number;
  onComplete?: () => void;
}

export const Screen5MiniGame: React.FC<Screen5MiniGameProps> = ({
  patient,
  onBack,
  onOpenTherapistModal,
  onOpenSettings,
  questionCount,
  onComplete,
}) => {
  // Settings
  const [settings, setSettings] = useState<MiniGameSettings>(getSavedMiniGameSettings);
  const [isSoundMuted, setIsSoundMuted] = useState<boolean>(!settings.soundEnabled);

  // Effective question count from doctor's prescription (Requirement 3.2 & 5)
  const effectiveCount = useMemo(() => {
    if (typeof questionCount === 'number' && questionCount >= 5 && questionCount <= 50) {
      return questionCount;
    }
    return settings.questionCount || 20;
  }, [questionCount, settings.questionCount]);

  // Listen for settings changes
  useEffect(() => {
    const handleSettingsUpdate = (e: Event) => {
      const customEvent = e as CustomEvent<MiniGameSettings>;
      if (customEvent.detail) {
        setSettings(customEvent.detail);
        setIsSoundMuted(!customEvent.detail.soundEnabled);
      }
    };
    window.addEventListener('minigame:settings_updated', handleSettingsUpdate);
    return () => window.removeEventListener('minigame:settings_updated', handleSettingsUpdate);
  }, []);

  // Sync audio mute with settings
  useEffect(() => {
    audioFeedback.setMuted(isSoundMuted);
  }, [isSoundMuted]);

  // Game state initialized with exact effective count
  const [questions, setQuestions] = useState<MiniGameQuestion[]>(() =>
    getRandomMiniGameQuestions(effectiveCount)
  );
  const [currentIndex, setCurrentIndex] = useState<number>(0);
  const [score, setScore] = useState<number>(0);
  const [answersHistory, setAnswersHistory] = useState<
    { questionId: number; isCorrect: boolean; userAnswer: 'yes' | 'no'; timeTakenSec: number }[]
  >([]);
  const [answerState, setAnswerState] = useState<'idle' | 'correct' | 'incorrect'>('idle');
  const [userAnswer, setUserAnswer] = useState<'yes' | 'no' | null>(null);
  const [isRoundFinished, setIsRoundFinished] = useState<boolean>(false);
  const [gameStartTime, setGameStartTime] = useState<number>(() => Date.now());
  const [resetCountdown, setResetCountdown] = useState<number>(8);
  const [isResetPaused, setIsResetPaused] = useState<boolean>(false);

  // Next appointment date calculation (+7 days from current date)
  const nextAppointmentDateStr = useMemo(() => {
    const nextDate = new Date();
    nextDate.setDate(nextDate.getDate() + 7);
    const thaiDays = ['วันอาทิตย์', 'วันจันทร์', 'วันอังคาร', 'วันพุธ', 'วันพฤหัสบดี', 'วันศุกร์', 'วันเสาร์'];
    const thaiMonths = [
      'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
      'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'
    ];
    const dName = thaiDays[nextDate.getDay()];
    const d = nextDate.getDate();
    const m = thaiMonths[nextDate.getMonth()];
    const y = nextDate.getFullYear() + 543;
    return `${dName}ที่ ${d} ${m} พ.ศ. ${y} เวลา 09:30 น.`;
  }, []);

  // Post-Session 8-second auto-reset back to standby logo screen
  useEffect(() => {
    if (!isRoundFinished) {
      setResetCountdown(8);
      setIsResetPaused(false);
      return;
    }

    if (isResetPaused) return;

    if (resetCountdown <= 0) {
      onBack();
      return;
    }

    const timer = setTimeout(() => {
      setResetCountdown((prev) => prev - 1);
    }, 1000);

    return () => clearTimeout(timer);
  }, [isRoundFinished, isResetPaused, resetCountdown, onBack]);

  // Gestures holding state
  const [holdSide, setHoldSide] = useState<'yes' | 'no' | null>(null);
  const [holdProgress, setHoldProgress] = useState<number>(0);
  const holdStartTimeRef = useRef<number | null>(null);
  const lastTickProgressRef = useRef<number>(0);
  const isTransitioningRef = useRef<boolean>(false);
  const questionStartTimeRef = useRef<number>(Date.now());

  // Camera and Pose
  const {
    videoRef,
    isCameraReady,
    isCameraLoading,
    cameraError,
    startCamera,
    stopCamera,
    toggleCamera,
  } = useCamera();

  // Pose landmarker hook
  const { landmarks } = usePose(videoRef, isCameraReady, 'shoulder_raise');

  // Automatically start camera on mount if in camera mode
  useEffect(() => {
    if (settings.inputMode === 'camera') {
      startCamera();
    }
    return () => {
      stopCamera();
    };
  }, [settings.inputMode, startCamera, stopCamera]);

  // Current active question
  const currentQuestion = questions[currentIndex] || questions[0];

  // Restart Round
  const handleRestart = useCallback(() => {
    const newQuestions = getRandomMiniGameQuestions(settings.questionCount);
    setQuestions(newQuestions);
    setCurrentIndex(0);
    setScore(0);
    setAnswersHistory([]);
    setAnswerState('idle');
    setUserAnswer(null);
    setHoldSide(null);
    setHoldProgress(0);
    setIsRoundFinished(false);
    setGameStartTime(Date.now());
    isTransitioningRef.current = false;
    questionStartTimeRef.current = Date.now();
  }, [settings.questionCount]);

  // Re-roll questions if questionCount changed in settings
  useEffect(() => {
    if (questions.length !== settings.questionCount) {
      handleRestart();
    }
  }, [settings.questionCount, questions.length, handleRestart]);

  // Persist minigame result to Supabase when round finishes
  useEffect(() => {
    if (isRoundFinished && patient?.id) {
      supabaseService.saveMinigameResult({
        patient_id: String(patient.id),
        score: score,
        total_questions: questions.length,
        correct_count: score,
      }).catch((err) => {
        console.warn('Auto-save minigame result to Supabase failed:', err);
      });
    }
  }, [isRoundFinished, patient?.id, score, questions.length]);

  // Trigger answer evaluation
  const handleAnswer = useCallback(
    (answer: 'yes' | 'no') => {
      if (isTransitioningRef.current || answerState !== 'idle' || isRoundFinished) return;
      isTransitioningRef.current = true;

      const isCorrect = answer === currentQuestion.correctAnswer;
      const timeTakenSec = Math.round((Date.now() - questionStartTimeRef.current) / 100) / 10;

      setUserAnswer(answer);
      setAnswerState(isCorrect ? 'correct' : 'incorrect');

      if (isCorrect) {
        setScore((prev) => prev + 1);
        audioFeedback.playQuizCorrect();
      } else {
        audioFeedback.playQuizIncorrect();
      }

      setAnswersHistory((prev) => [
        ...prev,
        {
          questionId: currentQuestion.id,
          isCorrect,
          userAnswer: answer,
          timeTakenSec,
        },
      ]);

      // Delay ~1.2s before advancing to next question or ending round
      setTimeout(() => {
        if (currentIndex < questions.length - 1) {
          setCurrentIndex((prev) => prev + 1);
          setAnswerState('idle');
          setUserAnswer(null);
          setHoldSide(null);
          setHoldProgress(0);
          holdStartTimeRef.current = null;
          lastTickProgressRef.current = 0;
          isTransitioningRef.current = false;
          questionStartTimeRef.current = Date.now();
        } else {
          // Game Completed!
          setIsRoundFinished(true);
          onComplete?.();
          audioFeedback.playWorkoutComplete();
          // Launch Confetti Celebration
          try {
            confetti({
              particleCount: 80,
              spread: 70,
              origin: { y: 0.6 },
              colors: ['#4AE387', '#10B981', '#6FD67F', '#FCD34D'],
            });
          } catch {
            // ignore
          }
        }
      }, 1250);
    },
    [answerState, currentIndex, currentQuestion, isRoundFinished, questions.length]
  );

  // Skip question handler
  const handleSkip = useCallback(() => {
    if (isTransitioningRef.current || isRoundFinished) return;
    if (currentIndex < questions.length - 1) {
      setCurrentIndex((prev) => prev + 1);
      setAnswerState('idle');
      setUserAnswer(null);
      setHoldSide(null);
      setHoldProgress(0);
      holdStartTimeRef.current = null;
      lastTickProgressRef.current = 0;
      questionStartTimeRef.current = Date.now();
    } else {
      setIsRoundFinished(true);
    }
  }, [currentIndex, isRoundFinished, questions.length]);

  // Pose Gesture Detection State Logic
  const [isLeftRaised, setIsLeftRaised] = useState<boolean>(false);
  const [isRightRaised, setIsRightRaised] = useState<boolean>(false);
  const [bothRaised, setBothRaised] = useState<boolean>(false);
  const [isHandsInFrame, setIsHandsInFrame] = useState<boolean>(true);

  useEffect(() => {
    // If not in camera mode or camera not ready or already transitioning: skip gesture checking
    if (
      settings.inputMode !== 'camera' ||
      !isCameraReady ||
      !landmarks ||
      landmarks.length < 17 ||
      isTransitioningRef.current ||
      isRoundFinished
    ) {
      setIsLeftRaised(false);
      setIsRightRaised(false);
      setBothRaised(false);
      return;
    }

    const leftShoulder = landmarks[11];
    const rightShoulder = landmarks[12];
    const leftWrist = landmarks[15];
    const rightWrist = landmarks[16];

    // Check visibility threshold
    const minVis = 0.45;
    const isLeftVisible =
      leftShoulder &&
      leftWrist &&
      (leftShoulder.visibility ?? 1) >= minVis &&
      (leftWrist.visibility ?? 1) >= minVis;

    const isRightVisible =
      rightShoulder &&
      rightWrist &&
      (rightShoulder.visibility ?? 1) >= minVis &&
      (rightWrist.visibility ?? 1) >= minVis;

    setIsHandsInFrame(Boolean(isLeftVisible || isRightVisible));

    // Raised threshold: wrist is above shoulder (smaller Y coordinate in image space)
    // Shoulder offset threshold: 0.07 of image height
    const raiseDelta = 0.07;
    const leftUp = Boolean(isLeftVisible && leftWrist.y < leftShoulder.y - raiseDelta);
    const rightUp = Boolean(isRightVisible && rightWrist.y < rightShoulder.y - raiseDelta);

    setIsLeftRaised(leftUp);
    setIsRightRaised(rightUp);

    if (leftUp && rightUp) {
      // Both hands raised: wait and do not count
      setBothRaised(true);
      setHoldSide(null);
      setHoldProgress(0);
      holdStartTimeRef.current = null;
      lastTickProgressRef.current = 0;
      return;
    }

    setBothRaised(false);

    const detectedSide: 'yes' | 'no' | null = rightUp ? 'yes' : leftUp ? 'no' : null;

    if (detectedSide) {
      const now = performance.now();
      if (holdSide !== detectedSide) {
        // Just started holding this side
        setHoldSide(detectedSide);
        holdStartTimeRef.current = now;
        setHoldProgress(0);
        lastTickProgressRef.current = 0;
      } else if (holdStartTimeRef.current !== null) {
        // Holding continuously
        const elapsed = (now - holdStartTimeRef.current) / 1000;
        const requiredHold = settings.holdDurationSec || 0.7;
        const currentProg = Math.min(1, elapsed / requiredHold);
        setHoldProgress(currentProg);

        // Tick sound at 40% and 80%
        if (currentProg >= 0.4 && lastTickProgressRef.current < 0.4) {
          audioFeedback.playHoldTick();
          lastTickProgressRef.current = 0.4;
        } else if (currentProg >= 0.8 && lastTickProgressRef.current < 0.8) {
          audioFeedback.playHoldTick();
          lastTickProgressRef.current = 0.8;
        }

        // Confirmed hold reached 100%!
        if (currentProg >= 1.0) {
          handleAnswer(detectedSide);
          setHoldProgress(0);
          setHoldSide(null);
          holdStartTimeRef.current = null;
        }
      }
    } else {
      // No hands raised: smoothly reset
      setHoldSide(null);
      setHoldProgress(0);
      holdStartTimeRef.current = null;
      lastTickProgressRef.current = 0;
    }
  }, [
    landmarks,
    isCameraReady,
    settings.inputMode,
    settings.holdDurationSec,
    holdSide,
    handleAnswer,
    isRoundFinished,
  ]);

  // Toggle Camera
  const handleToggleCamera = useCallback(() => {
    if (isCameraReady) {
      stopCamera();
    } else {
      startCamera();
    }
  }, [isCameraReady, startCamera, stopCamera]);

  // Toggle Mute
  const handleToggleSound = () => {
    const nextMuted = !isSoundMuted;
    setIsSoundMuted(nextMuted);
    audioFeedback.setMuted(nextMuted);
  };

  // Summary Screen Calculations
  const totalQuestions = questions.length;
  const accuracyPct = Math.round((score / totalQuestions) * 100);
  const totalDurationSec = Math.round((Date.now() - gameStartTime) / 1000);

  // Performance Rating & Feedback
  let ratingTitle = 'ยอดเยี่ยมมาก!';
  let ratingMsg = 'สมองและกล้ามเนื้อทำงานประสานกันได้ดีเยี่ยม ร่างกายตอบสนองอย่างแม่นยำ';
  let starsCount = 3;
  if (accuracyPct < 50) {
    ratingTitle = 'เริ่มต้นได้ดีครับ!';
    ratingMsg = 'ได้ฝึกการเคลื่อนไหวและการตอบสนอง ลองเล่นอีกครั้งเพื่อเพิ่มความคุ้นเคยนะครับ';
    starsCount = 1;
  } else if (accuracyPct < 80) {
    ratingTitle = 'เก่งมากครับ!';
    ratingMsg = 'ทำได้ดีตามเกณฑ์มาตรฐาน กายภาพและฝึกสมองอย่างสม่ำเสมอจะช่วยให้ดียิ่งขึ้น';
    starsCount = 2;
  }

  return (
    <div className="w-full flex-1 flex flex-col items-center justify-start py-3 px-3 sm:px-6 relative select-none animate-fadeIn pb-12">
      
      {/* =========================================================================
          Top Bar: Navigation, Score, Progress & Controls
          ========================================================================= */}
      <div className="w-full max-w-4xl flex items-center justify-between gap-2 mb-4 pt-1">
        
        {/* Back Button */}
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 px-3.5 py-2 rounded-full bg-white/90 hover:bg-emerald-50 text-[#1E8A4C] border border-emerald-200 shadow-sm font-bold text-xs sm:text-sm transition active:scale-95"
          aria-label="กลับสู่เมนูหลัก"
        >
          <ArrowLeft className="w-4 h-4 stroke-[2.5]" />
          <span>กลับเมนู</span>
        </button>

        {/* Central Curved Emerald Score & Progress Pill */}
        <div className="flex items-center gap-2 sm:gap-4 bg-white/95 px-4 sm:px-6 py-2 rounded-full border-2 border-emerald-300 shadow-md">
          <div className="flex items-center gap-1.5">
            <Trophy className="w-4 h-4 sm:w-5 sm:h-5 text-amber-500 fill-amber-400" />
            <span className="text-xs sm:text-sm font-bold text-slate-600">คะแนน:</span>
            <span className="text-base sm:text-lg font-black text-[#1E8A4C]">
              {score}
            </span>
          </div>

          <div className="w-px h-4 bg-emerald-200" />

          {/* Progress Indicator */}
          <div className="flex items-center gap-2">
            <span className="text-xs sm:text-sm font-extrabold text-emerald-950">
              ข้อ {currentIndex + 1} / {totalQuestions}
            </span>
            <div className="w-16 sm:w-24 h-2 rounded-full bg-emerald-100 overflow-hidden hidden sm:block">
              <div
                className="h-full bg-gradient-to-r from-[#10B981] via-[#06B6D4] to-[#2563EB] rounded-full transition-all duration-300"
                style={{
                  width: `${Math.round(((currentIndex + 1) / totalQuestions) * 100)}%`,
                }}
              />
            </div>
          </div>
        </div>

        {/* Top Right Buttons: Sound & Settings */}
        <div className="flex items-center gap-1.5 sm:gap-2">
          {/* Sound Toggle */}
          <button
            onClick={handleToggleSound}
            className="p-2 sm:p-2.5 rounded-full bg-white/90 hover:bg-emerald-50 text-emerald-800 border border-emerald-200 shadow-sm transition active:scale-95"
            title={isSoundMuted ? 'เปิดเสียง' : 'ปิดเสียง'}
            aria-label="เปิดปิดเสียง"
          >
            {isSoundMuted ? (
              <VolumeX className="w-4 h-4 text-rose-500" />
            ) : (
              <Volume2 className="w-4 h-4 text-emerald-700" />
            )}
          </button>

          {/* Settings Button */}
          <button
            onClick={onOpenSettings}
            className="p-2 sm:p-2.5 rounded-full bg-white/90 hover:bg-emerald-50 text-[#1E8A4C] border border-emerald-200 shadow-sm transition active:scale-95"
            title="ตั้งค่ามินิเกม"
            aria-label="ตั้งค่ามินิเกม"
          >
            <Settings className="w-4 h-4" />
          </button>
        </div>

      </div>

      {/* =========================================================================
          Game View vs Summary View
          ========================================================================= */}
      {!isRoundFinished ? (
        <div className="w-full flex flex-col items-center gap-4 max-w-4xl">
          
          {/* Active Mode Tag */}
          <div className="flex items-center gap-2">
            <span
              className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold shadow-xs ${
                isCameraReady && settings.inputMode === 'camera'
                  ? 'bg-emerald-100 text-emerald-900 border border-emerald-300'
                  : 'bg-amber-100 text-amber-900 border border-amber-300'
              }`}
            >
              {isCameraReady && settings.inputMode === 'camera' ? (
                <>
                  <Camera className="w-3.5 h-3.5 text-emerald-700" />
                  <span>โหมดตรวจจับการยกมือด้วยกล้อง AI</span>
                </>
              ) : (
                <>
                  <Touchpad className="w-3.5 h-3.5 text-amber-700" />
                  <span>โหมดสัมผัส (แตะปุ่มเพื่อตอบ)</span>
                </>
              )}
            </span>
          </div>

          {/* 1. Upper-Center: 3-column Question Card */}
          <MiniGameCard
            question={currentQuestion}
            holdSide={holdSide}
            holdProgress={holdProgress}
            answerState={answerState}
            userAnswer={userAnswer}
            isTouchMode={!isCameraReady || settings.inputMode === 'touch'}
            onSelectAnswer={handleAnswer}
          />

          {/* 2. Lower-Center: Camera Feed / Silhouette Fallback */}
          <MiniGameCameraView
            videoRef={videoRef}
            isCameraReady={isCameraReady}
            isCameraLoading={isCameraLoading}
            cameraError={cameraError}
            landmarks={landmarks}
            isLeftRaised={isLeftRaised}
            isRightRaised={isRightRaised}
            bothRaised={bothRaised}
            isHandsInFrame={isHandsInFrame}
            holdSide={holdSide}
            holdProgress={holdProgress}
            onToggleCamera={handleToggleCamera}
            onSwitchCamera={toggleCamera}
          />

          {/* 3. Bottom Section: Rules & Control Action Bar */}
          <div className="w-full max-w-3xl flex flex-col sm:flex-row items-center justify-between gap-3 p-4 rounded-3xl bg-white/90 border border-emerald-200/90 shadow-md">
            
            {/* Rules Text Box */}
            <div className="flex items-start gap-2.5 text-xs sm:text-sm text-[#1E8A4C] leading-tight">
              <span className="font-extrabold text-sm sm:text-base whitespace-nowrap">
                *กติกา*
              </span>
              <div className="flex flex-wrap sm:flex-col gap-x-3 gap-y-0.5 text-xs font-semibold text-emerald-900">
                <span>• หาก &quot;ใช่&quot; ให้ยกมือขวา</span>
                <span>• หาก &quot;ไม่&quot; ให้ยกมือซ้าย</span>
              </div>
            </div>

            {/* Quick Action Buttons */}
            <div className="flex items-center gap-2">
              {/* Skip Question */}
              <button
                type="button"
                onClick={handleSkip}
                className="px-3.5 py-2 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold flex items-center gap-1.5 transition active:scale-95"
                title="ข้ามไปข้อถัดไป"
              >
                <SkipForward className="w-3.5 h-3.5" />
                <span>ข้ามข้อ</span>
              </button>

              {/* Exit Game */}
              <button
                type="button"
                onClick={onBack}
                className="px-3.5 py-2 rounded-full bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-xs font-bold flex items-center gap-1.5 transition active:scale-95"
                title="ออกจากเกมและกลับเมนู"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>ออก</span>
              </button>
            </div>

          </div>

        </div>
      ) : (
        /* =========================================================================
            Summary Screen: End of Round Score & Actions
            ========================================================================= */
        <div className="w-full max-w-2xl bg-white rounded-3xl p-6 sm:p-8 shadow-2xl border-2 border-emerald-300 flex flex-col items-center text-center animate-fadeIn my-auto">
          
          {/* Header Trophy Icon */}
          <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-full bg-gradient-to-tr from-[#10B981] via-[#06B6D4] to-[#2563EB] flex items-center justify-center text-white shadow-lg shadow-cyan-500/25 mb-4 ring-8 ring-cyan-100 animate-bounce">
            <Trophy className="w-10 h-10 sm:w-12 sm:h-12 fill-white" />
          </div>

          <h2 className="text-2xl sm:text-3xl font-black text-[#0B2B2B]">
            วันนี้คุณทำได้ดีมาก!
          </h2>

          <p className="text-sm sm:text-base font-semibold text-emerald-800 mt-1 max-w-md">
            {ratingMsg}
          </p>

          {/* Next Appointment Date Badge (Master Prompt Requirement) */}
          <div className="w-full max-w-md p-3.5 rounded-2xl bg-gradient-to-r from-emerald-50 via-teal-50 to-emerald-50 border-2 border-emerald-300 text-emerald-950 font-black text-xs sm:text-sm flex flex-col items-center justify-center gap-1 my-2 shadow-sm">
            <div className="flex items-center gap-1.5 text-emerald-800 font-extrabold text-xs">
              <Calendar className="w-4 h-4 text-emerald-600" />
              <span>นัดหมายครั้งต่อไป:</span>
            </div>
            <span className="text-sm sm:text-base font-black text-[#0B2B2B]">
              {nextAppointmentDateStr}
            </span>
          </div>

          {/* Auto-Reset Countdown Alert Bar */}
          <div className="w-full max-w-md bg-stone-50 border border-slate-200 rounded-2xl p-2.5 sm:p-3 flex items-center justify-between gap-2 text-xs font-bold text-slate-700 my-1">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-emerald-600 animate-spin" />
              <span className="text-[11px] sm:text-xs">
                {isResetPaused
                  ? 'หยุดเวลารีเซ็ตชั่วคราว'
                  : `ตู้จะรีเซ็ตกลับหน้าแรกอัตโนมัติใน: ${resetCountdown} วินาที`}
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setIsResetPaused((p) => !p)}
                className="px-2.5 py-1 rounded-lg bg-white border border-slate-300 hover:bg-slate-100 text-slate-600 text-[11px] cursor-pointer"
              >
                {isResetPaused ? 'เล่นต่อ' : 'หยุดเวลา'}
              </button>
              <button
                type="button"
                onClick={onBack}
                className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold cursor-pointer"
              >
                รีเซ็ตทันที
              </button>
            </div>
          </div>

          {/* Stars Rating */}
          <div className="flex items-center gap-2 my-4">
            {[1, 2, 3].map((star) => (
              <span
                key={star}
                className={`text-2xl sm:text-3xl transition ${
                  star <= starsCount ? 'opacity-100 scale-110 drop-shadow-sm' : 'opacity-25 grayscale'
                }`}
              >
                ⭐
              </span>
            ))}
          </div>

          {/* Score Badge */}
          <div className="w-full max-w-sm rounded-2xl bg-[#EBF7EE] border border-emerald-200 p-4 my-2 flex items-center justify-around shadow-inner">
            <div className="flex flex-col items-center">
              <span className="text-xs font-bold text-slate-600">คะแนนรวม</span>
              <span className="text-2xl sm:text-3xl font-black text-[#1E8A4C]">
                {score} / {totalQuestions}
              </span>
            </div>

            <div className="w-px h-10 bg-emerald-300/80" />

            <div className="flex flex-col items-center">
              <span className="text-xs font-bold text-slate-600">ความแม่นยำ</span>
              <span className="text-2xl sm:text-3xl font-black text-[#1E8A4C]">
                {accuracyPct}%
              </span>
            </div>

            <div className="w-px h-10 bg-emerald-300/80" />

            <div className="flex flex-col items-center">
              <span className="text-xs font-bold text-slate-600">เวลาที่ใช้</span>
              <span className="text-base sm:text-lg font-black text-slate-700 flex items-center gap-1 mt-1">
                <Clock className="w-4 h-4 text-emerald-600" />
                {totalDurationSec} วิ
              </span>
            </div>
          </div>

          {/* Answer Breakdown Highlights */}
          <div className="w-full max-w-md my-4 flex items-center justify-center gap-4 text-xs sm:text-sm font-bold">
            <div className="flex items-center gap-1.5 text-emerald-700 bg-emerald-50 px-3 py-1.5 rounded-full border border-emerald-200">
              <CheckCircle2 className="w-4 h-4" />
              <span>ตอบถูก {score} ข้อ</span>
            </div>
            <div className="flex items-center gap-1.5 text-rose-700 bg-rose-50 px-3 py-1.5 rounded-full border border-rose-200">
              <XCircle className="w-4 h-4" />
              <span>ตอบผิด {totalQuestions - score} ข้อ</span>
            </div>
          </div>

          {/* Control Action Buttons */}
          <div className="w-full max-w-sm space-y-3 mt-4">
            
            {/* Play Again */}
            <button
              onClick={handleRestart}
              className="btn-primary-capsule !w-full !m-0 flex items-center justify-center gap-2"
            >
              <RotateCcw className="w-5 h-5 fill-white" />
              <span>เล่นอีกครั้ง</span>
            </button>

            {/* Send Result to Physical Therapist */}
            <button
              onClick={() => {
                onOpenTherapistModal(
                  accuracyPct,
                  `มินิเกมตอบคำถาม (คะแนน ${score}/${totalQuestions})`,
                  null
                );
              }}
              className="btn-secondary-capsule !w-full !m-0 flex items-center justify-center gap-2"
            >
              <Send className="w-5 h-5 text-[#1E8A4C]" />
              <span>ส่งผลให้นักกายภาพ</span>
            </button>

            {/* Back to Home / Patient Menu */}
            <button
              onClick={onBack}
              className="w-full py-3 rounded-full text-slate-600 hover:text-emerald-800 hover:bg-emerald-50 font-bold text-sm transition flex items-center justify-center gap-1.5"
            >
              <Home className="w-4 h-4" />
              <span>กลับหน้าเมนูคนไข้</span>
            </button>

          </div>

        </div>
      )}

    </div>
  );
};
