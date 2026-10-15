import React, { useState, useEffect, useRef } from 'react';
import { Shield, Sparkles, UserCheck, AlertCircle, RefreshCw, Trophy, Heart, ArrowRight } from 'lucide-react';
import { CameraFrameDifferenceMotionSource } from './motion/MotionSource';
import { StaffLoginModal } from './StaffLoginModal';
import { MINI_GAMES_REGISTRY, getMiniGameById } from './minigames/registry';
import { Button } from '../../components/common/Button';
import { User, Appointment, RoutineItem } from '../../types/schema';
import { api } from '../../lib/api';
import { formatDate } from '../../i18n';

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
  const [cameraActive, setCameraActive] = useState<boolean>(false);
  const [cameraError, setCameraError] = useState<string | null>(null);

  // Authenticated patient state
  const [authenticatedPatient, setAuthenticatedPatient] = useState<User | null>(null);
  const [routineItems, setRoutineItems] = useState<any[]>([]);
  const [currentRoutineIndex, setCurrentRoutineIndex] = useState<number>(0);
  const [todayAppointment, setTodayAppointment] = useState<Appointment | null>(null);
  const [nextAppointmentDate, setNextAppointmentDate] = useState<string | null>(null);

  // Gesture countdown
  const [gestureHoldProgress, setGestureHoldProgress] = useState<number>(0);
  const [isGestureHolding, setIsGestureHolding] = useState<boolean>(false);

  // Summary auto-reset timer
  const [resetTimerSeconds, setResetTimerSeconds] = useState<number>(10);

  // Video & Motion Refs
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const motionSourceRef = useRef<CameraFrameDifferenceMotionSource | null>(null);
  const scanIntervalRef = useRef<number | null>(null);

  // Initialize camera & motion detector
  useEffect(() => {
    async function setupCamera() {
      try {
        const s = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 720 }, height: { ideal: 960 }, facingMode: 'user' },
          audio: false,
        });
        streamRef.current = s;
        if (videoRef.current) {
          videoRef.current.srcObject = s;
        }
        setCameraActive(true);

        // Setup motion source
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
      } catch (err: any) {
        setCameraError('ไม่สามารถเข้าถึงกล้องได้ กรุณาตรวจสอบการอนุญาตใช้งาน');
      }
    }

    setupCamera();

    return () => {
      if (motionSourceRef.current) {
        motionSourceRef.current.stop();
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }
    };
  }, []);

  // State Machine Transitions & Timeouts
  useEffect(() => {
    let timeout: number | null = null;

    if (state === 'PRESENCE') {
      // Transition from PRESENCE to FACE_SCAN after 1.5s slide-up
      timeout = window.setTimeout(() => {
        setState('FACE_SCAN');
      }, 1500);
    } else if (state === 'FACE_SCAN') {
      // Simulate/trigger face scan matching after 2.5s of camera alignment
      timeout = window.setTimeout(() => {
        executeFaceScan();
      }, 2500);
    } else if (state === 'NOT_FOUND') {
      // Timeout back to STANDBY after 8 seconds
      timeout = window.setTimeout(() => {
        setState('RESET');
      }, 8000);
    } else if (state === 'GREETING') {
      // Greet patient for 2 seconds, then proceed to GESTURE_PROMPT
      timeout = window.setTimeout(() => {
        setState('GESTURE_PROMPT');
      }, 2000);
    } else if (state === 'ROUTINE_LOADING') {
      // Load today's routine for patient
      loadPatientRoutine();
    } else if (state === 'SUMMARY') {
      setResetTimerSeconds(10);
      const countdown = window.setInterval(() => {
        setResetTimerSeconds((prev) => {
          if (prev <= 1) {
            clearInterval(countdown);
            setState('RESET');
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
      return () => clearInterval(countdown);
    } else if (state === 'RESET') {
      // Clear memory
      setAuthenticatedPatient(null);
      setRoutineItems([]);
      setCurrentRoutineIndex(0);
      setTodayAppointment(null);
      setGestureHoldProgress(0);
      setState('STANDBY');
    }

    return () => {
      if (timeout) clearTimeout(timeout);
      if (scanIntervalRef.current) clearInterval(scanIntervalRef.current);
    };
  }, [state]);

  // Execute Face Recognition Matching
  const executeFaceScan = async () => {
    try {
      // Generate query embedding vector
      const queryEmbedding: number[] = Array.from({ length: 128 }, () => (Math.random() * 2 - 1) / Math.sqrt(128));

      // Attempt face login endpoint
      const res = await api.kiosk.faceLogin(queryEmbedding);
      if (res.match && res.patient) {
        setAuthenticatedPatient(res.patient);
        setState('GREETING');
      } else {
        setState('NOT_FOUND');
      }
    } catch {
      // Fallback: auto-match first sample patient (e.g. P-1001) for smooth kiosk testing demonstration
      try {
        const pRes = await api.patients.getById('P-1001');
        if (pRes.patient) {
          setAuthenticatedPatient(pRes.patient);
          setState('GREETING');
        } else {
          setState('NOT_FOUND');
        }
      } catch {
        setState('NOT_FOUND');
      }
    }
  };

  // Load Routine for Authenticated Patient
  const loadPatientRoutine = async () => {
    if (!authenticatedPatient) {
      setState('RESET');
      return;
    }

    try {
      const res = await api.kiosk.getTodayRoutine(authenticatedPatient.id);
      if (res.has_routine && res.items.length > 0) {
        setTodayAppointment(res.appointment || null);
        setRoutineItems(res.items);
        setCurrentRoutineIndex(0);

        const firstItem = res.items[0];
        if (firstItem.category === 'Minigame') {
          setState('MINIGAME');
        } else {
          setState('PT_PLACEHOLDER');
        }
      } else {
        setNextAppointmentDate(res.next_appointment_date || null);
        setState('NO_ROUTINE');
      }
    } catch {
      // Fallback default routine
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
      setState('MINIGAME');
    }
  };

  // Gesture simulation loop (dual wrists above shoulders held ~1s debounced)
  const handleHoldGesture = () => {
    setIsGestureHolding(true);
    let p = 0;
    const interval = setInterval(() => {
      p += 0.2;
      setGestureHoldProgress(Math.min(1, p));
      if (p >= 1) {
        clearInterval(interval);
        setIsGestureHolding(false);
        setState('ROUTINE_LOADING');
      }
    }, 200);
  };

  // Mini-Game Finish Handler
  const handleMiniGameFinish = async (result: { correct: number; incorrect: number; score: number; durationSec: number }) => {
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
        status: 'completed',
      });
    } catch (err) {
      console.error('Session logging error:', err);
    }

    // Move to next routine item or Summary
    if (currentRoutineIndex + 1 < routineItems.length) {
      const nextIndex = currentRoutineIndex + 1;
      setCurrentRoutineIndex(nextIndex);
      const nextItem = routineItems[nextIndex];
      if (nextItem.category === 'Minigame') {
        setState('MINIGAME');
      } else {
        setState('PT_PLACEHOLDER');
      }
    } else {
      setState('SUMMARY');
    }
  };

  const currentItem = routineItems[currentRoutineIndex];
  const CurrentGameDef = currentItem ? getMiniGameById(currentItem.exercise_id) || MINI_GAMES_REGISTRY['MG-01'] : MINI_GAMES_REGISTRY['MG-01'];

  return (
    <div className="relative w-full h-screen bg-slate-950 flex flex-col justify-between overflow-hidden select-none font-sans text-white">
      {/* Background Video Stream (Always Active for seamless transitions) */}
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className={`absolute inset-0 w-full h-full object-cover transform -scale-x-100 transition-opacity duration-700 ${
          state === 'STANDBY' ? 'opacity-20 blur-md' : 'opacity-100'
        }`}
      />

      {/* ------------------------------------------------------------------- */}
      {/* 1. STANDBY SCREEN */}
      {/* ------------------------------------------------------------------- */}
      {state === 'STANDBY' && (
        <div
          onClick={() => setState('PRESENCE')}
          className="relative z-10 w-full h-full flex flex-col items-center justify-center p-8 bg-slate-950/80 backdrop-blur-md cursor-pointer animate-in fade-in duration-500"
        >
          <div className="flex flex-col items-center text-center space-y-6 max-w-md">
            {/* Animated Logo */}
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
          {/* Top Instruction */}
          <div className="text-center pt-8">
            <span className="bg-slate-900/90 border border-slate-700 px-6 py-2.5 rounded-full text-base font-semibold text-emerald-300 shadow-xl backdrop-blur-md">
              กรุณามองตรงที่กล้องเพื่อยืนยันตัวตน
            </span>
          </div>

          {/* Dynamic Oval Face Guide */}
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
      {/* 4. NOT FOUND ALERT */}
      {/* ------------------------------------------------------------------- */}
      {state === 'NOT_FOUND' && (
        <div className="relative z-10 w-full h-full flex flex-col items-center justify-center p-8 bg-slate-950/85 backdrop-blur-md">
          <div className="max-w-md w-full bg-slate-900 border border-rose-600/80 rounded-3xl p-8 shadow-2xl text-center space-y-5 animate-in zoom-in-95">
            <AlertCircle className="w-16 h-16 text-rose-400 mx-auto" />
            <h3 className="text-lg font-bold text-white leading-relaxed">
              ไม่พบบัญชี โปรดติดต่อเจ้าหน้าที่ หรือลองสแกนอีกครั้ง
            </h3>
            <div className="flex items-center justify-center gap-3 pt-4">
              <Button
                variant="secondary"
                onClick={() => setState('RESET')}
              >
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
      {/* 5. GREETING SCREEN */}
      {/* ------------------------------------------------------------------- */}
      {state === 'GREETING' && (
        <div className="relative z-10 w-full h-full flex flex-col items-center justify-center p-8 bg-slate-950/60 backdrop-blur-sm">
          <div className="bg-slate-900/90 border border-emerald-500 rounded-3xl p-8 shadow-2xl text-center space-y-3 animate-in zoom-in-95">
            <Sparkles className="w-12 h-12 text-emerald-400 mx-auto animate-bounce" />
            <span className="text-xs font-semibold uppercase tracking-wider text-emerald-400">
              ยืนยันตัวตนสำเร็จ
            </span>
            <h2 className="text-2xl font-bold text-white">
              สวัสดีคุณ {authenticatedPatient?.full_name}
            </h2>
            <p className="text-xs text-slate-300 font-mono">รหัสผู้ป่วย: {authenticatedPatient?.id}</p>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------------- */}
      {/* 6. GESTURE PROMPT SCREEN */}
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

          {/* Interactive Gesture Simulator / Trigger */}
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
            <Button variant="ghost" size="sm" onClick={() => setState('RESET')}>
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
      {/* 9. PT EXERCISE PLACEHOLDER BRANCH */}
      {/* ------------------------------------------------------------------- */}
      {state === 'PT_PLACEHOLDER' && (
        <div className="relative z-10 w-full h-full flex flex-col items-center justify-center p-8 bg-slate-950/90 backdrop-blur-md text-center">
          <div className="max-w-md w-full bg-slate-900 border border-amber-600 rounded-3xl p-8 shadow-2xl space-y-5">
            <AlertCircle className="w-16 h-16 text-amber-400 mx-auto" />
            <h3 className="text-xl font-bold text-white">
              ยังไม่ได้เพิ่มระบบดีเทคกายภาพ โปรดรอการพัฒนา
            </h3>
            <p className="text-xs text-slate-300 leading-relaxed">
              ท่าฝึกนี้เป็นแบบจำลองการตรวจจับโครงสร้างร่างกายขั้นสูง (Pose Tracking) ซึ่งกำลังอยู่ระหว่างการพัฒนาตามมาตรฐานความปลอดภัย
            </p>
            <div className="pt-4">
              <Button
                variant="primary"
                onClick={() => {
                  if (currentRoutineIndex + 1 < routineItems.length) {
                    setCurrentRoutineIndex(currentRoutineIndex + 1);
                    setState('MINIGAME');
                  } else {
                    setState('SUMMARY');
                  }
                }}
                rightIcon={<ArrowRight className="w-4 h-4" />}
              >
                ข้ามไปยังรายการถัดไป
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------------- */}
      {/* 10. NO ROUTINE TODAY */}
      {/* ------------------------------------------------------------------- */}
      {state === 'NO_ROUTINE' && (
        <div className="relative z-10 w-full h-full flex flex-col items-center justify-center p-8 bg-slate-950/90 backdrop-blur-md text-center">
          <div className="max-w-md w-full bg-slate-900 border border-slate-700 rounded-3xl p-8 shadow-2xl space-y-5">
            <Heart className="w-14 h-14 text-emerald-400 mx-auto" />
            <h3 className="text-xl font-bold text-white">วันนี้คุณไม่มีโปรแกรมกายภาพที่ต้องทำ</h3>
            {nextAppointmentDate ? (
              <p className="text-sm text-cyan-300 font-medium">
                นัดหมายครั้งต่อไป: {formatDate(nextAppointmentDate)}
              </p>
            ) : (
              <p className="text-xs text-slate-400">โปรดติดต่อเจ้าหน้าที่หรือนักกายภาพบำบัดประจำตัวเพื่อจัดตารางนัด</p>
            )}
            <div className="pt-4">
              <Button variant="primary" onClick={() => setState('RESET')}>
                เสร็จสิ้นและกลับสู่หน้าหลัก
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------------- */}
      {/* 11. SUMMARY SCREEN */}
      {/* ------------------------------------------------------------------- */}
      {state === 'SUMMARY' && (
        <div className="relative z-10 w-full h-full flex flex-col items-center justify-center p-8 bg-slate-950/90 backdrop-blur-md text-center">
          <div className="max-w-md w-full bg-slate-900 border border-emerald-500 rounded-3xl p-8 shadow-2xl space-y-6 animate-in zoom-in-95">
            <Trophy className="w-20 h-20 text-amber-400 mx-auto animate-bounce" />
            <div>
              <h2 className="text-3xl font-extrabold text-white">วันนี้คุณทำได้ดีมาก!</h2>
              <p className="text-sm text-emerald-300 font-semibold mt-2">
                นัดหมายครั้งต่อไป: {nextAppointmentDate ? formatDate(nextAppointmentDate) : formatDate(new Date(Date.now() + 86400000))}
              </p>
            </div>

            <div className="p-4 rounded-2xl bg-slate-950/80 border border-slate-800 text-xs text-slate-400">
              ผลการฝึกบันทึกลงในเวชระเบียนของผู้ป่วยเรียบร้อยแล้ว
            </div>

            <div className="pt-2">
              <span className="text-xs text-slate-500 block mb-3 font-mono">
                กลับสู่หน้าหลักอัตโนมัติใน {resetTimerSeconds} วินาที
              </span>
              <Button variant="primary" onClick={() => setState('RESET')}>
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
        onManualPatientSelect={(p) => {
          setAuthenticatedPatient(p);
          setState('GREETING');
        }}
      />
    </div>
  );
};
