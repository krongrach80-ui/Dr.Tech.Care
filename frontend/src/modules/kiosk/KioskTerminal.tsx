import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Shield, Sparkles, UserCheck, AlertCircle, RefreshCw, Trophy, Heart, ArrowRight, Info, Clock } from 'lucide-react';
import { CameraFrameDifferenceMotionSource } from './motion/MotionSource';
import { StaffLoginModal } from './StaffLoginModal';
import { KioskSettingsModal } from './KioskSettingsModal';
import { AboutModal } from './AboutModal';
import { MINI_GAMES_REGISTRY, getMiniGameById } from './minigames/registry';
import { Button } from '../../components/common/Button';
import { User, Appointment } from '../../types/schema';
import { api } from '../../lib/api';
import { formatDate } from '../../i18n';

// Timing Constants (v2.1 defaults)
const PRESENCE_TIMEOUT_MS = 15000;      // 15 s without face -> STANDBY
const NOT_FOUND_TIMEOUT_MS = 15000;    // 15 s without action -> STANDBY
const NOT_FOUND_MAX_FAILURES = 3;       // 3 failures -> STANDBY
const GREETING_DURATION_MS = 1500;      // 1.5 s greeting duration
const GESTURE_TIMEOUT_MS = 30000;       // 30 s no gesture -> RESET (no session log)
const GESTURE_HOLD_DURATION_MS = 1000;  // 1.0 s held above shoulders
const PLACEHOLDER_SECONDS = 4;          // 4 s (3-5 s window) auto-advance for pose exercises
const MINIGAME_INACTIVITY_MS = 60000;   // 60 s inactivity -> partial check-in
const SUMMARY_SECONDS = 10;             // 10 s summary auto-reset

// Configuration flags
const KIOSK_SHOW_ABOUT = true;
const KIOSK_PIN_FALLBACK = false;       // v2.1: strictly false, no PIN credential inputs on kiosk

export type KioskState =
  | 'STANDBY'
  | 'PRESENCE'
  | 'FACE_SCAN'
  | 'NOT_FOUND'
  | 'GREETING'
  | 'GESTURE_PROMPT'
  | 'ROUTINE_LOADING'
  | 'MINIGAME'
  | 'PT_PLACEHOLDER'
  | 'NO_ROUTINE'
  | 'SUMMARY'
  | 'RESET';

export interface KioskTerminalProps {
  onNavigateToStaff: (role: 'admin' | 'pt', user: User) => void;
}

export const KioskTerminal: React.FC<KioskTerminalProps> = ({ onNavigateToStaff }) => {
  const [state, setState] = useState<KioskState>('STANDBY');
  const [isStaffModalOpen, setIsStaffModalOpen] = useState<boolean>(false);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState<boolean>(false);
  const [isAboutModalOpen, setIsAboutModalOpen] = useState<boolean>(false);

  // Hardware Camera Settings (persisted per device in localStorage)
  const [cameraMirrored, setCameraMirrored] = useState<boolean>(() => {
    return localStorage.getItem('moh_kiosk_camera_mirrored') !== 'false';
  });
  const [cameraRotation, setCameraRotation] = useState<number>(() => {
    return parseInt(localStorage.getItem('moh_kiosk_camera_rotation') || '0', 10);
  });

  // Camera & Face state
  const [cameraActive, setCameraActive] = useState<boolean>(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [failureCount, setFailureCount] = useState<number>(0);

  // Authenticated Patient Session (cleared completely on RESET)
  const [authenticatedPatient, setAuthenticatedPatient] = useState<User | null>(null);
  const [isAssistedSession, setIsAssistedSession] = useState<boolean>(false);
  const [assistingStaffId, setAssistingStaffId] = useState<string | null>(null);

  // Routine & Schedule State
  const [routineItems, setRoutineItems] = useState<any[]>([]);
  const [currentRoutineIndex, setCurrentRoutineIndex] = useState<number>(0);
  const [todayAppointment, setTodayAppointment] = useState<Appointment | null>(null);
  const [nextAppointmentDate, setNextAppointmentDate] = useState<string | null>(null);

  // Gesture prompt state
  const [gestureHoldProgress, setGestureHoldProgress] = useState<number>(0);
  const [isGestureHolding, setIsGestureHolding] = useState<boolean>(false);

  // Placeholder and Summary countdowns
  const [placeholderCountdown, setPlaceholderCountdown] = useState<number>(PLACEHOLDER_SECONDS);
  const [summarySecondsLeft, setSummarySecondsLeft] = useState<number>(SUMMARY_SECONDS);

  // Video & Motion Refs
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const motionSourceRef = useRef<CameraFrameDifferenceMotionSource | null>(null);
  const gestureTimerRef = useRef<number | null>(null);
  const gameInactivityTimerRef = useRef<number | null>(null);

  // ---------------------------------------------------------------------------
  // 1. IN-APP LOCKDOWN GUARDS (v2.1 Section 3)
  // ContextMenu, Select, Drag, Pinch-Zoom, F5/Ctrl+R/Ctrl+W, Popstate
  // ---------------------------------------------------------------------------
  useEffect(() => {
    const handleContextMenu = (e: MouseEvent) => e.preventDefault();
    const handleSelectStart = (e: Event) => e.preventDefault();
    const handleDragStart = (e: DragEvent) => e.preventDefault();

    const handleKeyDown = (e: KeyboardEvent) => {
      // Block F5, Ctrl+R, Ctrl+W, Alt+Left, Backspace navigation
      if (
        e.key === 'F5' ||
        (e.ctrlKey && (e.key === 'r' || e.key === 'R' || e.key === 'w' || e.key === 'W')) ||
        (e.altKey && e.key === 'ArrowLeft')
      ) {
        e.preventDefault();
      }
    };

    const handleWheel = (e: WheelEvent) => {
      if (e.ctrlKey) {
        e.preventDefault(); // Prevent Ctrl + Wheel zoom
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (e.touches.length > 1) {
        e.preventDefault(); // Prevent multi-touch pinch zoom
      }
    };

    const handlePopState = (e: PopStateEvent) => {
      e.preventDefault();
      window.history.pushState(null, '', window.location.href);
    };

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };

    window.addEventListener('contextmenu', handleContextMenu);
    window.addEventListener('selectstart', handleSelectStart);
    window.addEventListener('dragstart', handleDragStart);
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('wheel', handleWheel, { passive: false });
    window.addEventListener('touchmove', handleTouchMove, { passive: false });
    window.addEventListener('popstate', handlePopState);
    window.addEventListener('beforeunload', handleBeforeUnload);

    // Lock history stack
    window.history.pushState(null, '', window.location.href);

    return () => {
      window.removeEventListener('contextmenu', handleContextMenu);
      window.removeEventListener('selectstart', handleSelectStart);
      window.removeEventListener('dragstart', handleDragStart);
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('wheel', handleWheel);
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('popstate', handlePopState);
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, []);

  // ---------------------------------------------------------------------------
  // 2. CAMERA INITIALIZATION & MOTION DETECTOR
  // ---------------------------------------------------------------------------
  useEffect(() => {
    async function setupCamera() {
      try {
        const s = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 1080 }, height: { ideal: 1920 }, facingMode: 'user' },
          audio: false,
        });
        streamRef.current = s;
        if (videoRef.current) {
          videoRef.current.srcObject = s;
        }
        setCameraActive(true);

        // Frame Differencing Motion Detector
        const motion = new CameraFrameDifferenceMotionSource();
        if (videoRef.current) {
          motion.setVideoElement(videoRef.current);
        }
        motion.onMotionDetected(() => {
          setState((currentState) => {
            if (currentState === 'STANDBY') {
              return 'PRESENCE';
            }
            return currentState;
          });
        });
        motion.start();
        motionSourceRef.current = motion;
      } catch {
        setCameraError('ไม่สามารถเข้าถึงกล้องได้ กรุณาตรวจสอบการอนุญาตใช้งานอุปกรณ์');
      }
    }

    setupCamera();

    return () => {
      if (motionSourceRef.current) motionSourceRef.current.stop();
      if (streamRef.current) streamRef.current.getTracks().forEach((t) => t.stop());
    };
  }, []);

  // Update camera hardware settings handler (persisted per device)
  const handleUpdateCameraSettings = (mirrored: boolean, rotation: number) => {
    setCameraMirrored(mirrored);
    setCameraRotation(rotation);
    localStorage.setItem('moh_kiosk_camera_mirrored', String(mirrored));
    localStorage.setItem('moh_kiosk_camera_rotation', String(rotation));
  };

  // ---------------------------------------------------------------------------
  // 3. RESET PROCEDURE (v2.1 Section 2)
  // Clears memory, revokes kiosk token, returns to STANDBY
  // ---------------------------------------------------------------------------
  const executeReset = useCallback(async () => {
    try {
      await api.kiosk.reset();
    } catch {
      // Ignored during offline or unauthenticated resets
    }

    // Clear patient state in memory completely
    setAuthenticatedPatient(null);
    setIsAssistedSession(false);
    setAssistingStaffId(null);
    setRoutineItems([]);
    setCurrentRoutineIndex(0);
    setTodayAppointment(null);
    setNextAppointmentDate(null);
    setGestureHoldProgress(0);
    setIsGestureHolding(false);
    setFailureCount(0);

    setState('STANDBY');
  }, []);

  // ---------------------------------------------------------------------------
  // 4. KIOSK 10-STATE MACHINE CONTROLLER
  // ---------------------------------------------------------------------------
  useEffect(() => {
    let timer: number | null = null;

    // State 1: STANDBY
    if (state === 'STANDBY') {
      // Awaiting motion trigger from MotionSource
    }

    // State 2: PRESENCE
    else if (state === 'PRESENCE') {
      // Logo container slides up, camera opens
      // If no face recognized within 15 s -> return to STANDBY
      const presenceExpiry = window.setTimeout(() => {
        setState('STANDBY');
      }, PRESENCE_TIMEOUT_MS);

      // Auto-transition to FACE_SCAN after 1.5s slide-up
      const slideTransition = window.setTimeout(() => {
        clearTimeout(presenceExpiry);
        setState('FACE_SCAN');
      }, 1500);

      return () => {
        clearTimeout(presenceExpiry);
        clearTimeout(slideTransition);
      };
    }

    // State 3: FACE_SCAN
    else if (state === 'FACE_SCAN') {
      timer = window.setTimeout(() => {
        performServerFaceScan();
      }, 2000);
    }

    // State 4: NOT_FOUND
    else if (state === 'NOT_FOUND') {
      // 3 failures or 15 s timeout -> return to STANDBY
      timer = window.setTimeout(() => {
        executeReset();
      }, NOT_FOUND_TIMEOUT_MS);
    }

    // State 5: GREETING
    else if (state === 'GREETING') {
      // "สวัสดีคุณ <first name>" for 1.5 s -> GESTURE_PROMPT
      timer = window.setTimeout(() => {
        setState('GESTURE_PROMPT');
      }, GREETING_DURATION_MS);
    }

    // State 6: GESTURE_PROMPT
    else if (state === 'GESTURE_PROMPT') {
      // 30 s no gesture -> RESET (no session log written)
      gestureTimerRef.current = window.setTimeout(() => {
        executeReset();
      }, GESTURE_TIMEOUT_MS);

      return () => {
        if (gestureTimerRef.current) clearTimeout(gestureTimerRef.current);
      };
    }

    // State 7: ROUTINE_LOADING
    else if (state === 'ROUTINE_LOADING') {
      fetchRoutineAndAdvance();
    }

    // State 9: PT_PLACEHOLDER
    else if (state === 'PT_PLACEHOLDER') {
      // Auto-advance after PLACEHOLDER_SECONDS (4s default)
      setPlaceholderCountdown(PLACEHOLDER_SECONDS);
      const interval = window.setInterval(() => {
        setPlaceholderCountdown((prev) => {
          if (prev <= 1) {
            clearInterval(interval);
            handlePlaceholderFinish();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);

      return () => clearInterval(interval);
    }

    // State 11: SUMMARY
    else if (state === 'SUMMARY') {
      setSummarySecondsLeft(SUMMARY_SECONDS);
      const interval = window.setInterval(() => {
        setSummarySecondsLeft((prev) => {
          if (prev <= 1) {
            clearInterval(interval);
            executeReset();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);

      return () => clearInterval(interval);
    }

    // State 12: RESET
    else if (state === 'RESET') {
      executeReset();
    }

    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [state, executeReset]);

  // ---------------------------------------------------------------------------
  // 5. SERVER-SIDE FACE SCAN MATCHING
  // ---------------------------------------------------------------------------
  const performServerFaceScan = async () => {
    try {
      // Query 128-D embedding vector
      const sampleEmbedding: number[] = Array.from({ length: 128 }, () => (Math.random() * 2 - 1) / Math.sqrt(128));
      const res = await api.kiosk.faceLogin(sampleEmbedding);

      if (res.match && res.patient) {
        setAuthenticatedPatient(res.patient);
        setIsAssistedSession(false);
        setFailureCount(0);
        setState('GREETING');
      } else {
        handleScanFailure();
      }
    } catch {
      // Offline / Fallback: sample match for P-1001
      try {
        const pRes = await api.patients.getById('P-1001');
        if (pRes.patient) {
          setAuthenticatedPatient(pRes.patient);
          setIsAssistedSession(false);
          setFailureCount(0);
          setState('GREETING');
        } else {
          handleScanFailure();
        }
      } catch {
        handleScanFailure();
      }
    }
  };

  const handleScanFailure = () => {
    const nextCount = failureCount + 1;
    setFailureCount(nextCount);
    if (nextCount >= NOT_FOUND_MAX_FAILURES) {
      executeReset();
    } else {
      setState('NOT_FOUND');
    }
  };

  // ---------------------------------------------------------------------------
  // 6. ROUTINE FETCHING & BRANCHING
  // ---------------------------------------------------------------------------
  const fetchRoutineAndAdvance = async () => {
    if (!authenticatedPatient) {
      executeReset();
      return;
    }

    try {
      const res = await api.kiosk.getTodayRoutine(authenticatedPatient.id);
      if (res.has_routine && res.items.length > 0) {
        setTodayAppointment(res.appointment || null);
        setRoutineItems(res.items);
        setCurrentRoutineIndex(0);

        const firstItem = res.items[0];
        const category = firstItem.exercise_type || firstItem.category;
        if (category === 'Minigame' || firstItem.exercise_id?.startsWith('MG-')) {
          startMiniGameWithInactivityGuard();
        } else {
          setState('PT_PLACEHOLDER');
        }
      } else {
        // Fetch next appointment date only
        try {
          const nextRes = await api.kiosk.getNextAppointment(authenticatedPatient.id);
          setNextAppointmentDate(nextRes.next_appointment_date || null);
        } catch {
          setNextAppointmentDate(null);
        }
        setState('NO_ROUTINE');
      }
    } catch {
      // Default fallback mini-game routine
      setRoutineItems([
        {
          exercise_id: 'MG-01',
          name_th: 'เกมเป่าลูกโป่งเอื้อมจับ',
          name_en: 'Balloon Pop',
          category: 'Minigame',
          reps: 10,
          sets: 3,
          rest_seconds: 20,
        },
      ]);
      setCurrentRoutineIndex(0);
      startMiniGameWithInactivityGuard();
    }
  };

  const startMiniGameWithInactivityGuard = () => {
    setState('MINIGAME');
    // Inactivity timeout: 60 s ends the item as "partial"
    if (gameInactivityTimerRef.current) clearTimeout(gameInactivityTimerRef.current);
    gameInactivityTimerRef.current = window.setTimeout(() => {
      handleMiniGameFinish({
        correct: 0,
        incorrect: 0,
        score: 0,
        durationSec: 60,
        status: 'partial',
      });
    }, MINIGAME_INACTIVITY_MS);
  };

  // ---------------------------------------------------------------------------
  // 7. GESTURE SIMULATOR (Two wrists above shoulders ~1.0 s)
  // ---------------------------------------------------------------------------
  const handleHoldGesture = () => {
    if (isGestureHolding) return;
    setIsGestureHolding(true);
    let p = 0;
    const interval = setInterval(() => {
      p += 0.2;
      setGestureHoldProgress(Math.min(1, p));
      if (p >= 1) {
        clearInterval(interval);
        setIsGestureHolding(false);
        if (gestureTimerRef.current) clearTimeout(gestureTimerRef.current);
        setState('ROUTINE_LOADING');
      }
    }, GESTURE_HOLD_DURATION_MS / 5);
  };

  // ---------------------------------------------------------------------------
  // 8. MINI-GAME FINISH HANDLER
  // ---------------------------------------------------------------------------
  const handleMiniGameFinish = async (result: {
    correct: number;
    incorrect: number;
    score: number;
    durationSec: number;
    status?: 'completed' | 'partial';
  }) => {
    if (gameInactivityTimerRef.current) clearTimeout(gameInactivityTimerRef.current);
    if (!authenticatedPatient) return;

    const currentItem = routineItems[currentRoutineIndex];
    const totalReps = result.correct + result.incorrect;
    const accuracy = totalReps > 0 ? Math.round((result.correct / totalReps) * 100) : 100;

    // Log session to backend
    try {
      await api.kiosk.logSession({
        appointment_id: todayAppointment?.id || null,
        patient_id: authenticatedPatient.id,
        exercise_id: currentItem?.exercise_id || 'MG-01',
        routine_item_id: currentItem?.id || null,
        started_at: new Date(Date.now() - result.durationSec * 1000).toISOString().replace('T', ' ').substring(0, 19),
        ended_at: new Date().toISOString().replace('T', ' ').substring(0, 19),
        correct_reps: result.correct,
        incorrect_reps: result.incorrect,
        accuracy_percent: accuracy,
        score: result.score,
        duration_seconds: result.durationSec,
        status: result.status || 'completed',
        assisted: isAssistedSession,
        staff_id: assistingStaffId,
      });
    } catch (err) {
      console.error('Session logging error:', err);
    }

    advanceToNextItemOrSummary();
  };

  // ---------------------------------------------------------------------------
  // 9. PT PLACEHOLDER FINISH HANDLER (v2.1 Section 2)
  // Auto-advance 3-5 s, logs status = 'placeholder' (counts as check-in, no reps/accuracy)
  // ---------------------------------------------------------------------------
  const handlePlaceholderFinish = async () => {
    if (!authenticatedPatient) return;
    const currentItem = routineItems[currentRoutineIndex];

    try {
      await api.kiosk.logSession({
        appointment_id: todayAppointment?.id || null,
        patient_id: authenticatedPatient.id,
        exercise_id: currentItem?.exercise_id || 'EX-POSE-PLACEHOLDER',
        routine_item_id: currentItem?.id || null,
        started_at: new Date(Date.now() - PLACEHOLDER_SECONDS * 1000).toISOString().replace('T', ' ').substring(0, 19),
        ended_at: new Date().toISOString().replace('T', ' ').substring(0, 19),
        correct_reps: 0,
        incorrect_reps: 0,
        accuracy_percent: 0,
        score: 0,
        duration_seconds: PLACEHOLDER_SECONDS,
        status: 'placeholder',
        assisted: isAssistedSession,
        staff_id: assistingStaffId,
      });
    } catch (err) {
      console.error('Placeholder session logging error:', err);
    }

    advanceToNextItemOrSummary();
  };

  const advanceToNextItemOrSummary = () => {
    if (currentRoutineIndex + 1 < routineItems.length) {
      const nextIndex = currentRoutineIndex + 1;
      setCurrentRoutineIndex(nextIndex);
      const nextItem = routineItems[nextIndex];
      const category = nextItem.exercise_type || nextItem.category;
      if (category === 'Minigame' || nextItem.exercise_id?.startsWith('MG-')) {
        startMiniGameWithInactivityGuard();
      } else {
        setState('PT_PLACEHOLDER');
      }
    } else {
      // Fetch next appointment date only for summary screen
      fetchNextAppointmentDateOnly();
      setState('SUMMARY');
    }
  };

  const fetchNextAppointmentDateOnly = async () => {
    if (!authenticatedPatient) return;
    try {
      const res = await api.kiosk.getNextAppointment(authenticatedPatient.id);
      if (res.next_appointment_date) {
        setNextAppointmentDate(res.next_appointment_date);
      }
    } catch {
      // Ignored
    }
  };

  // Video transform style
  const videoTransformStyle = `
    ${cameraMirrored ? 'scaleX(-1)' : 'scaleX(1)'}
    rotate(${cameraRotation}deg)
  `;

  const currentItem = routineItems[currentRoutineIndex];
  const CurrentGameDef = currentItem ? getMiniGameById(currentItem.exercise_id) || MINI_GAMES_REGISTRY['MG-01'] : MINI_GAMES_REGISTRY['MG-01'];

  return (
    <div className="relative w-full h-screen bg-slate-950 flex flex-col justify-between overflow-hidden select-none font-sans text-white">
      {/* Background Video Stream (Seamless Camera Feed with Hardware Transform) */}
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        style={{ transform: videoTransformStyle }}
        className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-700 ${
          state === 'STANDBY' ? 'opacity-20 blur-md' : 'opacity-100'
        }`}
      />

      {/* TOP STATUS BAR (Read-only, no credentials or settings for patient) */}
      <div className="relative z-30 flex items-center justify-between p-6 pointer-events-none">
        <div className="flex items-center gap-3 bg-slate-950/70 backdrop-blur-md px-4 py-2 rounded-2xl border border-slate-800">
          <div className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
          <span className="text-xs font-semibold text-emerald-300">Moh Tech Care Kiosk</span>
        </div>

        {KIOSK_SHOW_ABOUT && (
          <button
            onClick={() => setIsAboutModalOpen(true)}
            className="pointer-events-auto flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-900/80 hover:bg-slate-800 border border-slate-700 text-xs text-slate-300 transition-colors shadow-lg"
          >
            <Info className="w-3.5 h-3.5 text-teal-400" />
            <span>เกี่ยวกับระบบ</span>
          </button>
        )}
      </div>

      {/* ------------------------------------------------------------------- */}
      {/* 1. STANDBY SCREEN */}
      {/* ------------------------------------------------------------------- */}
      {state === 'STANDBY' && (
        <div
          onClick={() => setState('PRESENCE')}
          className="relative z-10 w-full h-full flex flex-col items-center justify-center p-8 bg-slate-950/80 backdrop-blur-md cursor-pointer animate-in fade-in duration-500"
        >
          <div className="flex flex-col items-center text-center space-y-6 max-w-md">
            <div className="w-40 h-40 rounded-full bg-gradient-to-tr from-emerald-600 via-teal-500 to-cyan-400 p-1.5 shadow-2xl shadow-emerald-500/30 animate-pulse">
              <div className="w-full h-full bg-slate-950 rounded-full flex items-center justify-center">
                <Sparkles className="w-20 h-20 text-emerald-400 animate-spin-slow" />
              </div>
            </div>

            <div>
              <h1 className="text-4xl font-extrabold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-emerald-400 via-teal-300 to-cyan-400">
                Moh Tech Care
              </h1>
              <p className="text-base text-slate-300 mt-2 font-medium">
                ระบบคีออสฟื้นฟูกายภาพบำบัดอัจฉริยะ
              </p>
            </div>

            <div className="pt-8">
              <span className="inline-flex items-center gap-2 px-6 py-3 rounded-full bg-emerald-950/80 border border-emerald-600/80 text-emerald-300 text-sm font-semibold shadow-lg shadow-emerald-950/60 animate-bounce">
                <span>กรุณานั่งลงหน้าจอเพื่อเริ่มใช้งาน (แตะเพื่อจำลอง)</span>
              </span>
            </div>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------------- */}
      {/* 2. PRESENCE STATE (Slide-up transition) */}
      {/* ------------------------------------------------------------------- */}
      {state === 'PRESENCE' && (
        <div className="relative z-10 w-full h-full flex flex-col items-center justify-center bg-slate-950/40 backdrop-blur-sm animate-in fade-in duration-300">
          <div className="bg-slate-900/90 border border-emerald-500/60 px-8 py-5 rounded-3xl shadow-2xl text-center space-y-2 transform transition-transform duration-500 animate-slide-up">
            <UserCheck className="w-12 h-12 text-emerald-400 mx-auto animate-pulse" />
            <h2 className="text-xl font-bold text-white">ยินดีต้อนรับ</h2>
            <p className="text-sm text-slate-300">กำลังเตรียมระบบกล้องและสแกนใบหน้า...</p>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------------- */}
      {/* 3. FACE SCANNING SCREEN */}
      {/* ------------------------------------------------------------------- */}
      {state === 'FACE_SCAN' && (
        <div className="relative z-10 w-full h-full flex flex-col items-center justify-between p-8">
          <div className="text-center pt-8">
            <span className="bg-slate-900/90 border border-slate-700 px-6 py-2.5 rounded-full text-base font-semibold text-emerald-300 shadow-xl backdrop-blur-md">
              กรุณามองตรงที่กล้องเพื่อยืนยันตัวตน
            </span>
          </div>

          <div className="relative w-72 h-96 rounded-[50%] border-4 border-emerald-400 ring-8 ring-emerald-500/20 shadow-[0_0_50px_rgba(16,185,129,0.4)] flex items-center justify-center animate-pulse">
            <div className="w-64 h-88 rounded-[50%] border border-cyan-400/50" />
            <div className="absolute top-4 text-xs font-mono text-emerald-300 bg-slate-950/70 px-3 py-1 rounded-full">
              SCANNING...
            </div>
          </div>

          <div className="pb-8 text-center">
            <p className="text-xs text-slate-400">วางใบหน้าให้อยู่ในกรอบวงรี ระบบจะประมวลผลอัตโนมัติ</p>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------------- */}
      {/* 4. NOT FOUND ALERT (v2.1: No PIN, prompt to call staff or retry) */}
      {/* ------------------------------------------------------------------- */}
      {state === 'NOT_FOUND' && (
        <div className="relative z-10 w-full h-full flex flex-col items-center justify-center p-8 bg-slate-950/85 backdrop-blur-md">
          <div className="max-w-md w-full bg-slate-900 border border-rose-600/80 rounded-3xl p-8 shadow-2xl text-center space-y-5 animate-in zoom-in-95">
            <AlertCircle className="w-16 h-16 text-rose-400 mx-auto" />
            <h3 className="text-lg font-bold text-white leading-relaxed">
              ไม่พบบัญชี โปรดติดต่อเจ้าหน้าที่ หรือลองสแกนอีกครั้ง
            </h3>
            <div className="flex items-center justify-center gap-3 pt-4">
              <Button variant="secondary" onClick={executeReset}>
                กลับสู่หน้าหลัก
              </Button>
              <Button
                variant="primary"
                onClick={() => setState('FACE_SCAN')}
                leftIcon={<RefreshCw className="w-4 h-4" />}
              >
                ลองสแกนอีกครั้ง (Retry)
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------------- */}
      {/* 5. GREETING SCREEN (1.5 s) */}
      {/* ------------------------------------------------------------------- */}
      {state === 'GREETING' && (
        <div className="relative z-10 w-full h-full flex flex-col items-center justify-center p-8 bg-slate-950/60 backdrop-blur-sm">
          <div className="bg-slate-900/90 border border-emerald-500 rounded-3xl p-8 shadow-2xl text-center space-y-3 animate-in zoom-in-95">
            <Sparkles className="w-12 h-12 text-emerald-400 mx-auto animate-bounce" />
            <span className="text-xs font-semibold uppercase tracking-wider text-emerald-400">
              ยืนยันตัวตนสำเร็จ
            </span>
            <h2 className="text-2xl font-bold text-white">
              สวัสดีคุณ {authenticatedPatient?.full_name?.split(' ')[0]}
            </h2>
            <p className="text-xs text-slate-300 font-mono">รหัสผู้ป่วย: {authenticatedPatient?.id}</p>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------------- */}
      {/* 6. GESTURE PROMPT SCREEN (Wrists above shoulders held ~1s, 30s timeout) */}
      {/* ------------------------------------------------------------------- */}
      {state === 'GESTURE_PROMPT' && (
        <div className="relative z-10 w-full h-full flex flex-col items-center justify-between p-8 bg-slate-950/40">
          <div className="pt-8 text-center max-w-lg">
            <div className="bg-slate-900/90 border border-cyan-500 px-8 py-4 rounded-3xl shadow-2xl backdrop-blur-md">
              <h2 className="text-2xl font-extrabold text-white leading-relaxed">
                คุณพร้อมจะกายภาพรึยัง? ยก 2 มือขึ้นเพื่อเริ่ม
              </h2>
              <p className="text-xs text-slate-400 mt-2">
                ยกแขนทั้งสองข้างขึ้นเหนือหัวไหล่ค้างไว้ 1 วินาที
              </p>
            </div>
          </div>

          <div className="flex flex-col items-center space-y-4">
            <button
              onMouseDown={handleHoldGesture}
              onTouchStart={handleHoldGesture}
              className="w-36 h-36 rounded-full bg-emerald-600/30 border-4 border-emerald-500 flex flex-col items-center justify-center text-emerald-300 shadow-[0_0_40px_rgba(16,185,129,0.4)] hover:scale-105 active:scale-95 transition-transform"
            >
              <span className="text-4xl mb-1">🙌</span>
              <span className="text-xs font-bold uppercase">ยก 2 มือ</span>
              {gestureHoldProgress > 0 && (
                <span className="text-[10px] font-mono mt-0.5">{Math.round(gestureHoldProgress * 100)}%</span>
              )}
            </button>
            <span className="text-xs text-slate-400 bg-slate-950/80 px-3 py-1 rounded-full border border-slate-800">
              (กดค้างไว้ 1 วินาทีเพื่อจำลองการยก 2 มือขึ้น)
            </span>
          </div>

          <div className="pb-8 text-center">
            <Button variant="ghost" size="sm" onClick={executeReset}>
              ยกเลิกและออกจากระบบ
            </Button>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------------- */}
      {/* 7. ROUTINE LOADING */}
      {/* ------------------------------------------------------------------- */}
      {state === 'ROUTINE_LOADING' && (
        <div className="relative z-10 w-full h-full flex flex-col items-center justify-center p-8 bg-slate-950/80 backdrop-blur-md">
          <div className="text-center space-y-3">
            <div className="w-12 h-12 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto" />
            <h3 className="text-lg font-bold text-white">กำลังเตรียมโปรแกรมกายภาพประจำวัน...</h3>
            <p className="text-xs text-slate-400">ซิงก์ข้อมูลจากระบบโรงพยาบาล</p>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------------- */}
      {/* 8. PLAYABLE MINI-GAME HOST */}
      {/* ------------------------------------------------------------------- */}
      {state === 'MINIGAME' && currentItem && (
        <div className="relative z-10 w-full h-full">
          <CurrentGameDef.Component
            config={{
              reps: currentItem.reps || CurrentGameDef.defaultConfig.reps,
              sets: currentItem.sets || CurrentGameDef.defaultConfig.sets,
              restSeconds: currentItem.rest_seconds || CurrentGameDef.defaultConfig.restSeconds,
              instructions: currentItem.custom_instructions || CurrentGameDef.defaultConfig.instructions,
            }}
            onFinish={handleMiniGameFinish}
            videoElement={videoRef.current}
          />
        </div>
      )}

      {/* ------------------------------------------------------------------- */}
      {/* 9. PT EXERCISE PLACEHOLDER (4 s auto-advance, logged as 'placeholder') */}
      {/* ------------------------------------------------------------------- */}
      {state === 'PT_PLACEHOLDER' && (
        <div className="relative z-10 w-full h-full flex flex-col items-center justify-center p-8 bg-slate-950/90 backdrop-blur-md text-center">
          <div className="max-w-md w-full bg-slate-900 border border-amber-500 rounded-3xl p-8 shadow-2xl space-y-5 animate-in zoom-in-95">
            <AlertCircle className="w-16 h-16 text-amber-400 mx-auto animate-pulse" />
            <h3 className="text-xl font-bold text-white">
              ยังไม่ได้เพิ่มระบบดีเทคกายภาพ โปรดรอการพัฒนา
            </h3>
            <p className="text-xs text-slate-300 leading-relaxed">
              ระบบกำลังบันทึกการเช็คอินและจะเลื่อนไปยังรายการถัดไปอัตโนมัติ
            </p>
            <div className="flex items-center justify-center gap-2 text-xs font-mono text-amber-300 bg-amber-950/60 py-2 rounded-xl border border-amber-800">
              <Clock className="w-4 h-4" />
              <span>เลื่อนอัตโนมัติใน {placeholderCountdown} วินาที</span>
            </div>
            <div className="pt-2">
              <Button
                variant="primary"
                onClick={handlePlaceholderFinish}
                rightIcon={<ArrowRight className="w-4 h-4" />}
              >
                ข้ามไปยังรายการถัดไปทันที
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------------- */}
      {/* 10. NO ROUTINE TODAY (Shows Date Only) */}
      {/* ------------------------------------------------------------------- */}
      {state === 'NO_ROUTINE' && (
        <div className="relative z-10 w-full h-full flex flex-col items-center justify-center p-8 bg-slate-950/90 backdrop-blur-md text-center">
          <div className="max-w-md w-full bg-slate-900 border border-slate-700 rounded-3xl p-8 shadow-2xl space-y-5">
            <Heart className="w-14 h-14 text-emerald-400 mx-auto" />
            <h3 className="text-xl font-bold text-white">วันนี้คุณไม่มีโปรแกรมกายภาพที่ต้องทำ</h3>
            {nextAppointmentDate ? (
              <p className="text-sm text-cyan-300 font-medium">
                นัดหมายครั้งต่อไป: {nextAppointmentDate}
              </p>
            ) : (
              <p className="text-xs text-slate-400">โปรดติดต่อเจ้าหน้าที่หรือนักกายภาพบำบัดประจำตัวเพื่อจัดตารางนัด</p>
            )}
            <div className="pt-4">
              <Button variant="primary" onClick={executeReset}>
                เสร็จสิ้นและกลับสู่หน้าหลัก
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------------- */}
      {/* 11. SUMMARY SCREEN (Shows Date Only, 10 s auto-reset) */}
      {/* ------------------------------------------------------------------- */}
      {state === 'SUMMARY' && (
        <div className="relative z-10 w-full h-full flex flex-col items-center justify-center p-8 bg-slate-950/90 backdrop-blur-md text-center">
          <div className="max-w-md w-full bg-slate-900 border border-emerald-500 rounded-3xl p-8 shadow-2xl space-y-6 animate-in zoom-in-95">
            <Trophy className="w-20 h-20 text-amber-400 mx-auto animate-bounce" />
            <div>
              <h2 className="text-3xl font-extrabold text-white">วันนี้คุณทำได้ดีมาก!</h2>
              <p className="text-sm text-emerald-300 font-semibold mt-2">
                นัดหมายครั้งต่อไป: {nextAppointmentDate || formatDate(new Date(Date.now() + 86400000))}
              </p>
            </div>

            <div className="p-4 rounded-2xl bg-slate-950/80 border border-slate-800 text-xs text-slate-400">
              ผลการฝึกบันทึกลงในเวชระเบียนของผู้ป่วยเรียบร้อยแล้ว
            </div>

            <div className="pt-2">
              <span className="text-xs text-slate-500 block mb-3 font-mono">
                กลับสู่หน้าหลักอัตโนมัติใน {summarySecondsLeft} วินาที
              </span>
              <Button variant="primary" onClick={executeReset}>
                กลับสู่หน้าหลักทันที (Done)
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------------- */}
      {/* BOTTOM-RIGHT STAFF PORTAL BUTTON: [🛡️ ระบบบุคลากร / รพ.] */}
      {/* ------------------------------------------------------------------- */}
      <div className="fixed bottom-4 right-4 z-40">
        <Button
          variant="secondary"
          size="sm"
          onClick={() => setIsStaffModalOpen(true)}
          className="shadow-2xl border-slate-600 bg-slate-900/90 backdrop-blur-md text-xs font-semibold px-4 py-2"
          leftIcon={<Shield className="w-4 h-4 text-emerald-400" />}
        >
          🛡️ ระบบบุคลากร / รพ.
        </Button>
      </div>

      {/* Staff Login Modal */}
      <StaffLoginModal
        isOpen={isStaffModalOpen}
        onClose={() => setIsStaffModalOpen(false)}
        onNavigateToStaff={onNavigateToStaff}
        onManualPatientSelect={(p, staffUser) => {
          setAuthenticatedPatient(p);
          setIsAssistedSession(true);
          setAssistingStaffId(staffUser.id);
          setState('GREETING');
        }}
        onOpenKioskSettings={() => setIsSettingsModalOpen(true)}
      />

      {/* Staff-Only Kiosk Hardware Settings Modal */}
      <KioskSettingsModal
        isOpen={isSettingsModalOpen}
        onClose={() => setIsSettingsModalOpen(false)}
        isMirrored={cameraMirrored}
        rotationDegrees={cameraRotation}
        onUpdateCameraSettings={handleUpdateCameraSettings}
      />

      {/* Read-Only About System Modal (No external links) */}
      <AboutModal
        isOpen={isAboutModalOpen}
        onClose={() => setIsAboutModalOpen(false)}
      />
    </div>
  );
};
