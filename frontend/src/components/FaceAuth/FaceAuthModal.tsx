import React, { useEffect, useRef, useState } from 'react';
import {
  Camera,
  CheckCircle2,
  UserCheck,
  ShieldCheck,
  Smile,
  RefreshCw,
  X,
  AlertCircle,
  Sparkles,
  UserPlus,
  Eye,
  ArrowRight,
  User,
  Volume2,
} from 'lucide-react';
import { faceService, FaceDetectionResult, LIVENESS_DISCLAIMER_TH } from '../../services/faceService';
import { api } from '../../services/api';
import { usePatientStore } from '../../store/patientStore';
import { audioFeedback } from '../../services/audioService';
import { voiceAssistant } from '../../services/voiceAssistantService';
import confetti from 'canvas-confetti';
import { cameraOrientationService } from '../../services/cameraOrientationService';

interface FaceAuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialMode?: 'login' | 'enroll';
  onLoginSuccess?: (patient: any) => void;
}

export const FaceAuthModal: React.FC<FaceAuthModalProps> = ({
  isOpen,
  onClose,
  initialMode = 'login',
  onLoginSuccess,
}) => {
  const [mode, setMode] = useState<'login' | 'enroll'>(initialMode);
  const { selectPatient, fetchPatients, patients } = usePatientStore();

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  // States
  const [cameraActive, setCameraActive] = useState<boolean>(false);
  const [detection, setDetection] = useState<FaceDetectionResult | null>(null);
  const [livenessStatus, setLivenessStatus] = useState<string>('กำลังเตรียมระบบ...');
  const [isVerifying, setIsVerifying] = useState<boolean>(false);
  const [verifyMessage, setVerifyMessage] = useState<string>('');
  const [verifySuccess, setVerifySuccess] = useState<boolean>(false);

  // Auto-capture countdown (3s when face is green/aligned)
  const [countdown, setCountdown] = useState<number | null>(null);
  const [showShutterFlash, setShowShutterFlash] = useState<boolean>(false);
  const detectionRef = useRef<FaceDetectionResult | null>(null);
  const countdownIntervalRef = useRef<any>(null);
  const lastAttemptTimeRef = useRef<number>(0);

  // Enrollment Steps: 1: Center, 2: Left, 3: Right, 4: Blink/Details, 5: Done
  const [enrollStep, setEnrollStep] = useState<number>(1);
  const [capturedEmbeddings, setCapturedEmbeddings] = useState<{
    center?: { embedding: number[]; qualityScore: number };
    left?: { embedding: number[]; qualityScore: number };
    right?: { embedding: number[]; qualityScore: number };
  }>({});
  const [enrollName, setEnrollName] = useState<string>('');
  const [enrollAge, setEnrollAge] = useState<number>(65);
  const [enrollGender, setEnrollGender] = useState<'male' | 'female'>('male');
  const [isSavingEnroll, setIsSavingEnroll] = useState<boolean>(false);
  const [hasBiometricConsent, setHasBiometricConsent] = useState<boolean>(false);
  const [consentTimestamp, setConsentTimestamp] = useState<string | null>(null);
  const [capturedPhoto, setCapturedPhoto] = useState<string | null>(null);
  const [matchedPhoto, setMatchedPhoto] = useState<string | null>(null);

  // Start Camera with resilient fallbacks
  const startCamera = async () => {
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        if (typeof window !== 'undefined' && !window.isSecureContext && window.location.hostname !== 'localhost' && !/^127(?:\.\d+){3}$/.test(window.location.hostname)) {
          setVerifyMessage(`เบราว์เซอร์บล็อกการเข้าถึงกล้องเนื่องจากไม่ได้ใช้ HTTPS (Insecure Context): กรุณาเข้าใช้งานผ่าน HTTPS (https://${window.location.host}) เพื่อความปลอดภัย`);
          return;
        }
        setVerifyMessage('ไม่พบอุปกรณ์กล้องหรือเบราว์เซอร์ไม่รองรับการเปิดกล้อง');
        return;
      }

      let stream: MediaStream | null = null;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' },
          audio: false,
        });
      } catch (err1) {
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            video: { width: { ideal: 640 }, height: { ideal: 480 } },
            audio: false,
          });
        } catch (err2) {
          stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        }
      }

      if (!stream) {
        setVerifyMessage('ไม่สามารถเชื่อมต่อสัญญาณกล้องได้');
        return;
      }

      streamRef.current = stream;
      setCameraActive(true);

      const attach = () => {
        const v = videoRef.current;
        if (v && streamRef.current) {
          v.srcObject = streamRef.current;
          v.muted = true;
          v.playsInline = true;
          v.play().catch(() => {});
        }
      };

      attach();
      setTimeout(attach, 100);
      setTimeout(attach, 300);
    } catch (err) {
      console.warn('Camera access error:', err);
      setVerifyMessage('ไม่สามารถเปิดกล้องได้ กรุณาตรวจสอบการอนุญาตใช้งานกล้อง');
    }
  };

  // Ensure stream is bound to video element whenever active
  useEffect(() => {
    if (cameraActive && streamRef.current && videoRef.current) {
      if (videoRef.current.srcObject !== streamRef.current) {
        videoRef.current.srcObject = streamRef.current;
      }
      videoRef.current.muted = true;
      videoRef.current.playsInline = true;
      if (videoRef.current.paused) {
        videoRef.current.play().catch(() => {});
      }
    }
  });

  // Stop Camera
  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    if (countdownIntervalRef.current) {
      clearInterval(countdownIntervalRef.current);
      countdownIntervalRef.current = null;
    }
    setCountdown(null);
    setCameraActive(false);
  };

  useEffect(() => {
    if (isOpen) {
      setMode(initialMode);
      setVerifyMessage('');
      setVerifySuccess(false);
      setCountdown(null);
      setEnrollStep(1);
      setCapturedEmbeddings({});
      setCapturedPhoto(null);
      setMatchedPhoto(null);
      faceService.resetLiveness();
      faceService.initialize();
      startCamera();

      if (initialMode === 'login') {
        voiceAssistant.speakSystem('กรุณามองกล้องและกระพริบตาเพื่อเข้าสู่ระบบครับ', { key: 'face_login_open', cooldown: 3000 });
      } else {
        voiceAssistant.speakSystem('กรุณามองตรงมาที่กล้องครับ', { key: 'face_enroll_step1', cooldown: 3000 });
      }
    } else {
      stopCamera();
    }

    return () => {
      stopCamera();
    };
  }, [isOpen, initialMode]);

  // Real-time Face Tracking Loop (Throttled to ~22 fps for performance)
  useEffect(() => {
    if (!cameraActive) return;

    let isProcessing = false;
    let lastProcessTime = 0;

    const processLoop = (now: number) => {
      if (videoRef.current && videoRef.current.readyState >= 2 && !isProcessing && (now - lastProcessTime >= 45)) {
        lastProcessTime = now;
        isProcessing = true;
        const res = faceService.detectFace(videoRef.current, now);
        detectionRef.current = res;
        setDetection(res);

        const liveness = faceService.getLivenessState();

        if (mode === 'enroll') {
          if (enrollStep === 1) {
            if (!res || !res.detected) setLivenessStatus('กรุณาขยับหน้าให้อยู่ในกรอบวงรี');
            else if (!res.qualityGate.faceCentered) setLivenessStatus('กรุณาจัดหน้าให้อยู่กึ่งกลาง');
            else if (!res.qualityGate.isSharp) setLivenessStatus('ภาพเบลอ กรุณาถืออุปกรณ์นิ่งๆ');
            else if (!res.qualityGate.isWellLit) setLivenessStatus('แสงสว่างไม่พอดี กรุณาปรับแสง');
            else if (Math.abs(res.yawDeg) > 10) setLivenessStatus('กรุณามองตรงมาที่กล้อง');
            else setLivenessStatus(`มุมตรงถูกต้อง พร้อมบันทึก (คุณภาพ ${res.qualityScore}%)`);
          } else if (enrollStep === 2) {
            if (!res || !res.detected) setLivenessStatus('กรุณาหันหน้าเข้าหากล้อง');
            else if (res.yawDeg > -14) setLivenessStatus('กรุณาหันหน้าไปทางซ้ายเล็กน้อย (~15°)');
            else setLivenessStatus(`ตรวจพบการหันซ้าย พร้อมบันทึก (คุณภาพ ${res.qualityScore}%)`);
          } else if (enrollStep === 3) {
            if (!res || !res.detected) setLivenessStatus('กรุณาหันหน้าเข้าหากล้อง');
            else if (res.yawDeg < 14) setLivenessStatus('กรุณาหันหน้าไปทางขวาเล็กน้อย (~15°)');
            else setLivenessStatus(`ตรวจพบการหันขวา พร้อมบันทึก (คุณภาพ ${res.qualityScore}%)`);
          } else {
            if (liveness.blinkDetected) {
              setLivenessStatus('ยืนยันบุคคลจริง (กระพริบตา) เรียบร้อย');
            } else {
              setLivenessStatus(liveness.currentPrompt);
            }
          }
        } else {
          // Login Mode: Pre-scan quality checks
          if (!res || !res.detected) {
            setLivenessStatus('กรุณาจัดใบหน้าให้อยู่ในกรอบวงรี');
          } else if (!res.qualityGate.faceCentered) {
            setLivenessStatus('จัดใบหน้าให้อยู่กึ่งกลางกรอบวงรี');
          } else if (!res.qualityGate.sizeRatioValid) {
            if (res.box.width < 0.20) setLivenessStatus('ขยับเข้าใกล้กล้องอีกเล็กน้อย');
            else setLivenessStatus('ถอยห่างจากกล้องอีกเล็กน้อย');
          } else if (!res.qualityGate.isAngleValid) {
            setLivenessStatus('ใบหน้าเอียงเกินไป กรุณามองตรงมาที่กล้อง');
          } else if (!res.qualityGate.isWellLit) {
            const lightMsg = res.qualityGate.failures.find((f) => f.includes('แสง')) || 'แสงสว่างไม่พอดี กรุณาปรับแสง';
            setLivenessStatus(lightMsg);
          } else if (!res.qualityGate.isSharp) {
            setLivenessStatus('ภาพเบลอหรือไม่ชัด กรุณาถืออุปกรณ์นิ่งๆ');
          } else if (!liveness.allChallengesPassed && !liveness.isRealHuman) {
            setLivenessStatus(liveness.currentPrompt);
          } else {
            setLivenessStatus(`ยืนยันบุคคลจริงเรียบร้อย (คุณภาพ ${res.qualityScore}%) พร้อมเข้าสู่ระบบ`);
          }
        }
        isProcessing = false;
      }

      animationFrameRef.current = requestAnimationFrame(processLoop);
    };

    animationFrameRef.current = requestAnimationFrame(processLoop);

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [cameraActive, mode, enrollStep]);

  // Determine alignment strictly based on current step and real quality criteria
  const livenessState = faceService.getLivenessState();
  const isAligned = Boolean(
    detection?.detected && (
      mode === 'login'
        ? detection.qualityGate.passed && (livenessState.allChallengesPassed || livenessState.isRealHuman)
        : enrollStep === 1
        ? detection.qualityGate.passed && Math.abs(detection.yawDeg) <= 10
        : enrollStep === 2
        ? detection.qualityGate.sizeRatioValid && detection.yawDeg <= -14
        : enrollStep === 3
        ? detection.qualityGate.sizeRatioValid && detection.yawDeg >= 14
        : false
    )
  );

  // 5 UX Stages for Face Login Mode
  const loginStage: 'detecting' | 'liveness' | 'verifying' | 'success' | 'failed' = React.useMemo(() => {
    if (verifySuccess) return 'success';
    if (isVerifying) return 'verifying';
    if (verifyMessage && !verifySuccess && (verifyMessage.includes('ไม่พบ') || verifyMessage.includes('ผิดพลาด') || verifyMessage.includes('ไม่สำเร็จ'))) {
      return 'failed';
    }
    if (!detection || !detection.detected || !detection.qualityGate.passed) {
      return 'detecting';
    }
    if (!livenessState.isRealHuman && !livenessState.allChallengesPassed) {
      return 'liveness';
    }
    return 'liveness';
  }, [verifySuccess, isVerifying, verifyMessage, detection, livenessState]);

  // One-Click / Auto Face Login using Multi-frame Averaged Deep Embedding
  const handleFaceLogin = async () => {
    const curDetection = detectionRef.current || detection;
    if (!curDetection || !curDetection.detected) {
      setVerifyMessage('กรุณาหันหน้าเข้าหากล้องให้ชัดเจน');
      return;
    }

    if (!curDetection.qualityGate.passed) {
      setVerifyMessage(curDetection.qualityGate.failures[0] || 'กรุณาจัดตำแหน่งใบหน้าให้อยู่ตรงกลางกรอบวงรี');
      return;
    }

    const live = faceService.getLivenessState();
    if (!live.isRealHuman && !live.allChallengesPassed) {
      setVerifyMessage(live.currentPrompt || 'กรุณากระพริบตาหรือหันศีรษะเพื่อยืนยันบุคคลจริง (Liveness Check)');
      return;
    }

    if (countdownIntervalRef.current) {
      clearInterval(countdownIntervalRef.current);
      countdownIntervalRef.current = null;
    }
    setCountdown(null);
    setIsVerifying(true);
    setVerifyMessage('กำลังเปรียบเทียบข้อมูลใบหน้าด้วยโมเดลชีวมิติระดับลึก (ResNet-34)...');

    try {
      // Collect multi-frame averaged deep embedding
      const averaged = videoRef.current
        ? await faceService.generateAveragedEmbedding(videoRef.current, 5)
        : { embedding: faceService.generateEmbedding(curDetection), qualityScore: curDetection.qualityScore };

      const res = await api.verifyFace(averaged.embedding);

      if (res.status === 'success' && res.match && res.patient) {
        setVerifySuccess(true);
        const fullPatient = (patients || []).find(
          (pt) =>
            (pt.patient_code && res.patient.patient_code && pt.patient_code.toLowerCase() === res.patient.patient_code.toLowerCase()) ||
            String(pt.id) === String(res.patient.id)
        );
        const resolvedPatient = {
          ...res.patient,
          ...(fullPatient || {}),
          photo: res.patient.photo || fullPatient?.photo || res.matchedPhoto,
          avatar_url: res.patient.photo || fullPatient?.photo || res.matchedPhoto,
        };
        if (resolvedPatient.photo) {
          setMatchedPhoto(resolvedPatient.photo);
        }
        setVerifyMessage(res.message);
        audioFeedback.playRepSuccess();
        confetti({ particleCount: 80, spread: 60, origin: { y: 0.6 } });

        const pName = resolvedPatient.name ? resolvedPatient.name.split(' ')[0] : 'ท่าน';
        voiceAssistant.speakSystem(`สวัสดีครับคุณ${pName} ยินดีต้อนรับกลับมาครับ`, {
          priority: 'success',
          force: true,
          chime: true,
        });

        selectPatient(resolvedPatient);

        setTimeout(() => {
          if (onLoginSuccess) onLoginSuccess(resolvedPatient);
          onClose();
        }, 1500);
      } else {
        setVerifySuccess(false);
        setVerifyMessage(res.message || '❌ ไม่พบใบหน้าที่ลงทะเบียนในระบบ (ความคล้ายคลึงไม่ถึงเกณฑ์ 90%)');
        audioFeedback.playSafetyAlert();
        voiceAssistant.speakSystem('ไม่พบใบหน้าที่ลงทะเบียนในระบบครับ กรุณาสมัครสมาชิกก่อน หรือใช้รหัส PIN ครับ', {
          priority: 'warning',
          force: true,
        });
      }
    } catch (err) {
      console.warn('Verify error:', err);
      setVerifyMessage('เกิดข้อผิดพลาดในการเชื่อมต่อเซิร์ฟเวอร์ กรุณาลองใหม่อีกครั้ง');
    } finally {
      setIsVerifying(false);
      lastAttemptTimeRef.current = Date.now();
    }
  };

  // Step-by-Step Face Capture for Enrollment with Multi-Frame Averaging
  const captureCurrentAngle = async (angleTag: 'center' | 'left' | 'right') => {
    const curDetection = detectionRef.current || detection;
    if (!curDetection || !curDetection.detected) {
      setVerifyMessage('กรุณาจัดตำแหน่งใบหน้าให้อยู่ในกรอบ');
      return;
    }

    // Verify true angle range and quality gate before capture
    if (angleTag === 'center') {
      if (!curDetection.qualityGate.passed) {
        setVerifyMessage(curDetection.qualityGate.failures[0] || 'กรุณาจัดตำแหน่งใบหน้าให้ตรงตามคำแนะนำ');
        return;
      }
      if (Math.abs(curDetection.yawDeg) > 10) {
        setVerifyMessage('กรุณามองตรงมาที่กล้องก่อนบันทึกมุมตรง');
        return;
      }
    } else if (angleTag === 'left') {
      if (curDetection.yawDeg > -14) {
        setVerifyMessage('กรุณาหันหน้าไปทางซ้ายให้ถึงองศาที่กำหนด (ประมาณ 15 องศา)');
        return;
      }
    } else if (angleTag === 'right') {
      if (curDetection.yawDeg < 14) {
        setVerifyMessage('กรุณาหันหน้าไปทางขวาให้ถึงองศาที่กำหนด (ประมาณ 15 องศา)');
        return;
      }
    }

    if (countdownIntervalRef.current) {
      clearInterval(countdownIntervalRef.current);
      countdownIntervalRef.current = null;
    }
    setCountdown(null);
    setShowShutterFlash(true);
    audioFeedback.playCameraShutter();
    setTimeout(() => setShowShutterFlash(false), 280);

    setVerifyMessage('กำลังประมวลผลเวกเตอร์ใบหน้า...');

    try {
      const averaged = videoRef.current
        ? await faceService.generateAveragedEmbedding(videoRef.current, 5)
        : { embedding: faceService.generateEmbedding(curDetection), qualityScore: curDetection.qualityScore };

      setCapturedEmbeddings((prev) => ({ ...prev, [angleTag]: averaged }));
      lastAttemptTimeRef.current = Date.now();

      if (angleTag === 'center') {
        // บันทึกภาพ Snapshot คมชัดจากกล้องเป็นภาพอ้างอิงของสมาชิก
        if (videoRef.current && videoRef.current.videoWidth > 0) {
          try {
            const vw = videoRef.current.videoWidth;
            const vh = videoRef.current.videoHeight;
            const canvas = document.createElement('canvas');
            canvas.width = 240;
            canvas.height = 240;
            const ctx = canvas.getContext('2d');
            if (ctx) {
              const size = Math.min(vw, vh);
              const sx = (vw - size) / 2;
              const sy = (vh - size) / 2;
              // Mirror-flip เพื่อให้ตรงกับมุมมองกระจกเงา
              ctx.translate(240, 0);
              ctx.scale(-1, 1);
              ctx.drawImage(videoRef.current, sx, sy, size, size, 0, 0, 240, 240);
              const photoUrl = canvas.toDataURL('image/jpeg', 0.82);
              setCapturedPhoto(photoUrl);
            }
          } catch (e) {
            console.warn('Failed to capture photo frame:', e);
          }
        }
        setEnrollStep(2);
        setVerifyMessage(`บันทึกมุมตรงและถ่ายภาพสำเร็จ (คุณภาพ ${averaged.qualityScore}%) กรุณาหันหน้าไปทางซ้ายเล็กน้อย`);
        voiceAssistant.speakSystem('ดีมากครับ ตอนนี้ค่อยๆ หันใบหน้าไปทางซ้ายเล็กน้อยครับ', { priority: 'instruction', force: true });
      } else if (angleTag === 'left') {
        setEnrollStep(3);
        setVerifyMessage(`บันทึกมุมซ้ายสำเร็จ (คุณภาพ ${averaged.qualityScore}%) กรุณาหันหน้าไปทางขวาเล็กน้อย`);
        voiceAssistant.speakSystem('ดีมากครับ ตอนนี้หันใบหน้าไปทางขวาเล็กน้อยครับ', { priority: 'instruction', force: true });
      } else if (angleTag === 'right') {
        setEnrollStep(4);
        setVerifyMessage(`บันทึกมุมขวาสำเร็จ (คุณภาพ ${averaged.qualityScore}%) กรุณากระพริบตาเพื่อยืนยันบุคคลจริง`);
        voiceAssistant.speakSystem('บันทึกมุมใบหน้าครบแล้วครับ กรอกชื่อและอายุเพื่อเสร็จสิ้นครับ', { priority: 'instruction', force: true });
      }
    } catch (err: any) {
      setVerifyMessage(err?.message || 'ไม่สามารถสกัดเวกเตอร์ชีวมิติได้ กรุณาลองใหม่');
    }
  };

  // Auto-countdown 3 seconds when condition is met
  useEffect(() => {
    const canAutoCapture =
      isAligned &&
      !isVerifying &&
      !verifySuccess &&
      (mode === 'login' || (mode === 'enroll' && enrollStep <= 3));

    if (!canAutoCapture) {
      if (countdownIntervalRef.current) {
        clearInterval(countdownIntervalRef.current);
        countdownIntervalRef.current = null;
      }
      setCountdown(null);
      return;
    }

    const timeSinceLast = Date.now() - lastAttemptTimeRef.current;
    const initialDelay = timeSinceLast < 2200 ? 2200 - timeSinceLast : 0;

    let isMounted = true;
    let currentSec = 3;

    const timeoutId = setTimeout(() => {
      if (!isMounted) return;
      setCountdown(3);
      audioFeedback.playHoldTick();

      if (mode === 'login') {
        voiceAssistant.speakSystem('อยู่นิ่งๆ สามวินาทีนะครับ', { key: 'face_aligned_hold', cooldown: 5000 });
      }

      countdownIntervalRef.current = setInterval(() => {
        if (!isMounted) return;
        currentSec -= 1;
        if (currentSec > 0) {
          setCountdown(currentSec);
          audioFeedback.playHoldTick();
        } else {
          if (countdownIntervalRef.current) {
            clearInterval(countdownIntervalRef.current);
            countdownIntervalRef.current = null;
          }
          setCountdown(null);
          setShowShutterFlash(true);
          audioFeedback.playCameraShutter();
          setTimeout(() => setShowShutterFlash(false), 280);

          if (mode === 'login') {
            handleFaceLogin();
          } else if (mode === 'enroll') {
            if (enrollStep === 1) captureCurrentAngle('center');
            else if (enrollStep === 2) captureCurrentAngle('left');
            else if (enrollStep === 3) captureCurrentAngle('right');
          }
        }
      }, 1000);
    }, initialDelay);

    return () => {
      isMounted = false;
      clearTimeout(timeoutId);
      if (countdownIntervalRef.current) {
        clearInterval(countdownIntervalRef.current);
        countdownIntervalRef.current = null;
      }
    };
  }, [isAligned, isVerifying, verifySuccess, mode, enrollStep]);

  // Complete Enrollment: Requires verified center angle and real quality score
  const handleEnrollSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!enrollName.trim()) {
      setVerifyMessage('กรุณาระบุชื่อ-นามสกุลของผู้ป่วย');
      return;
    }
    if (!hasBiometricConsent) {
      setVerifyMessage('กรุณาติ๊กยอมรับการเก็บและประมวลผลข้อมูลชีวมิติ (PDPA Consent) ก่อนลงทะเบียน');
      return;
    }

    if (!capturedEmbeddings.center) {
      setVerifyMessage('จำเป็นต้องบันทึกภาพใบหน้ามุมตรงก่อนลงทะเบียน');
      return;
    }

    setIsSavingEnroll(true);
    setVerifyMessage('กำลังตรวจสอบและบันทึกข้อมูลใบหน้าลงทะเบียน...');
    voiceAssistant.speakSystem('กำลังบันทึกข้อมูลใบหน้าครับ', { priority: 'instruction', force: true });

    const embeddingsList: any[] = [];
    if (capturedEmbeddings.center) {
      embeddingsList.push({
        angle_tag: 'center',
        embedding: capturedEmbeddings.center.embedding,
        quality_score: capturedEmbeddings.center.qualityScore,
      });
    }
    if (capturedEmbeddings.left) {
      embeddingsList.push({
        angle_tag: 'left',
        embedding: capturedEmbeddings.left.embedding,
        quality_score: capturedEmbeddings.left.qualityScore,
      });
    }
    if (capturedEmbeddings.right) {
      embeddingsList.push({
        angle_tag: 'right',
        embedding: capturedEmbeddings.right.embedding,
        quality_score: capturedEmbeddings.right.qualityScore,
      });
    }

    try {
      const res = await api.enrollFace({
        name: enrollName.trim(),
        age: enrollAge,
        gender: enrollGender,
        photo: capturedPhoto || undefined,
        notes: `ลงทะเบียนด้วยระบบใบหน้าอัจฉริยะ (Face Enrollment) • ยินยอม PDPA: ${consentTimestamp || new Date().toISOString()}`,
        embeddings: embeddingsList,
      });

      if (res.status === 'success' && res.patient) {
        audioFeedback.playWorkoutComplete();
        confetti({ particleCount: 100, spread: 70, origin: { y: 0.5 } });

        await fetchPatients();
        selectPatient(res.patient);

        setVerifySuccess(true);
        const codeMsg = res.patient.patient_code ? ` (รหัส: ${res.patient.patient_code} | PIN: 1234)` : '';
        setVerifyMessage(`สมัครสมาชิกสำเร็จ! ยินดีต้อนรับคุณ ${res.patient.name}${codeMsg}`);
        const pName = res.patient.name ? res.patient.name.split(' ')[0] : 'ท่าน';
        voiceAssistant.speakSystem(`สมัครสมาชิกเรียบร้อยแล้วครับ ยินดีต้อนรับคุณ${pName}ครับ`, {
          priority: 'success',
          force: true,
          chime: true,
        });

        setTimeout(() => {
          if (onLoginSuccess) onLoginSuccess(res.patient);
          onClose();
        }, 1800);
      } else {
        setVerifyMessage(res.message || 'บันทึกข้อมูลไม่สำเร็จ');
      }
    } catch (err: any) {
      setVerifyMessage(err?.message || 'เกิดข้อผิดพลาดในการเชื่อมต่อเซิร์ฟเวอร์');
    } finally {
      setIsSavingEnroll(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-md p-3 sm:p-4 animate-in fade-in duration-200">
      <div className="bg-white border border-emerald-100 rounded-3xl max-w-xl w-full max-h-[90dvh] flex flex-col shadow-2xl overflow-hidden relative">
        {/* Top Header */}
        <div className="px-4 sm:px-6 py-3.5 sm:py-4 border-b border-emerald-100 flex items-center justify-between bg-emerald-50/40 flex-shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-emerald-600 flex items-center justify-center text-white shadow-md shadow-emerald-600/20 flex-shrink-0">
              <Camera className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h3 className="font-bold text-slate-900 text-sm sm:text-base truncate flex items-center gap-2">
                <span>{mode === 'login' ? 'เข้าสู่ระบบด้วยใบหน้า (Face Login)' : 'สมัครสมาชิกด้วยใบหน้า (Face Enrollment)'}</span>
                <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300 flex-shrink-0 shadow-2xs">
                  v2.0 (Photo AI • เกณฑ์ 90%)
                </span>
              </h3>
              <p className="text-[11px] text-slate-500 font-medium truncate">ออกแบบเพื่อผู้สูงอายุ • เทคโนโลยี AI ไบโอเมตริกซ์</p>
            </div>
          </div>

          <button
            onClick={onClose}
            aria-label="Close"
            className="w-10 h-10 min-w-[44px] min-h-[44px] rounded-full bg-white border border-emerald-200 text-slate-400 hover:text-slate-700 flex items-center justify-center transition active:scale-95 flex-shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-4 sm:p-6 space-y-4 sm:space-y-5 overflow-y-auto flex-1">
          {/* Camera Viewfinder with Oval Face Guide */}
          <div className="relative w-full aspect-[4/3] rounded-2xl overflow-hidden bg-slate-950 border-2 border-emerald-100 shadow-inner flex items-center justify-center group">
            <video
              ref={videoRef}
              playsInline
              muted
              className="w-full h-full object-cover transition-transform duration-300"
              style={{ transform: cameraOrientationService.getCssTransform() }}
            />

            {/* Camera Shutter Flash Effect */}
            {showShutterFlash && (
              <div className="absolute inset-0 bg-white/90 z-30 pointer-events-none transition-opacity duration-300" />
            )}

            {/* Glowing Oval Guide for Face Positioning */}
            <div
              className={`absolute inset-0 pointer-events-none flex items-center justify-center transition-all duration-300 ${
                isAligned ? 'scale-100' : 'scale-95'
              }`}
            >
              <div
                className={`w-44 h-60 sm:w-52 sm:h-72 rounded-[50%] transition-all duration-300 relative flex items-center justify-center ${
                  verifySuccess
                    ? 'border-4 border-emerald-400 shadow-[0_0_35px_rgba(52,211,153,0.9)] bg-emerald-500/10'
                    : countdown !== null
                    ? 'border-4 border-emerald-400 shadow-[0_0_35px_rgba(52,211,153,0.9)] animate-pulse'
                    : isAligned
                    ? 'border-4 border-dashed border-emerald-400 shadow-[0_0_20px_rgba(52,211,153,0.5)]'
                    : 'border-4 border-dashed border-white/50'
                }`}
              >
                {/* Large Center Countdown Badge */}
                {countdown !== null && !verifySuccess && (
                  <div className="flex flex-col items-center justify-center animate-in zoom-in-75 duration-200 pointer-events-none">
                    <div className="relative w-20 h-20 rounded-full bg-emerald-600/95 border-2 border-emerald-300 text-white flex items-center justify-center shadow-2xl shadow-emerald-950/60 backdrop-blur-md">
                      {/* Circular Progress Ring */}
                      <svg className="absolute inset-0 w-full h-full -rotate-90">
                        <circle
                          cx="40"
                          cy="40"
                          r="35"
                          stroke="currentColor"
                          strokeWidth="3.5"
                          fill="transparent"
                          className="text-white/20"
                        />
                        <circle
                          cx="40"
                          cy="40"
                          r="35"
                          stroke="currentColor"
                          strokeWidth="4"
                          fill="transparent"
                          strokeDasharray={220}
                          strokeDashoffset={220 - (220 * (4 - countdown)) / 3}
                          className="text-emerald-300 transition-all duration-1000 ease-linear"
                        />
                      </svg>
                      <span className="text-4xl font-black tracking-tight text-white drop-shadow-md">
                        {countdown}
                      </span>
                    </div>
                    <div className="mt-2.5 px-3 py-1 rounded-full bg-black/80 text-emerald-200 text-xs font-bold backdrop-blur-md shadow-lg border border-emerald-500/30 flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                      อยู่นิ่งๆ... กำลังถ่าย
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Top Liveness / Alignment Status Banner */}
            <div className="absolute top-3 inset-x-3 flex items-center justify-between pointer-events-none">
              <div
                className={`px-3 py-1.5 rounded-full text-xs font-semibold backdrop-blur-md flex items-center gap-1.5 shadow-md ${
                  isAligned
                    ? 'bg-emerald-600/90 text-white'
                    : 'bg-black/70 text-amber-300 border border-amber-400/40'
                }`}
              >
                {countdown !== null ? (
                  <>
                    <span className="w-2 h-2 rounded-full bg-white animate-ping" />
                    <span>พร้อมถ่ายอัตโนมัติ ({countdown} วินาที)</span>
                  </>
                ) : isAligned ? (
                  <>
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>{livenessStatus}</span>
                  </>
                ) : (
                  <>
                    <Eye className="w-3.5 h-3.5" />
                    <span>{livenessStatus}</span>
                  </>
                )}
              </div>

              <div className="px-2.5 py-1 rounded-full text-[10px] font-mono bg-black/60 backdrop-blur-md text-emerald-300 border border-emerald-500/30">
                Edge AI โมเดลประมวลผลบนเครื่อง
              </div>
            </div>

            {/* Success Overlay */}
            {verifySuccess && (
              <div className="absolute inset-0 bg-emerald-950/85 backdrop-blur-sm flex flex-col items-center justify-center text-center p-6 animate-in zoom-in-95 duration-200">
                {matchedPhoto || capturedPhoto ? (
                  <div className="relative w-24 h-24 rounded-full overflow-hidden border-4 border-emerald-400 shadow-xl mb-3">
                    <img src={(matchedPhoto || capturedPhoto)!} alt="ใบหน้าที่บันทึกไว้" className="w-full h-full object-cover" />
                    <div className="absolute inset-0 bg-emerald-600/20 flex items-center justify-center">
                      <CheckCircle2 className="w-8 h-8 text-white drop-shadow-md" />
                    </div>
                  </div>
                ) : (
                  <div className="w-16 h-16 rounded-full bg-emerald-500 text-white flex items-center justify-center shadow-lg shadow-emerald-500/50 mb-3">
                    <CheckCircle2 className="w-10 h-10" />
                  </div>
                )}
                <h4 className="text-xl font-extrabold text-white mb-1">ยืนยันตัวตนสำเร็จ</h4>
                <p className="text-sm text-emerald-200 font-medium">{verifyMessage}</p>
              </div>
            )}
          </div>

          {/* 5 UX Stages for Face Login */}
          {mode === 'login' && (
            <div className="grid grid-cols-5 gap-1 text-center text-[10px] sm:text-xs font-bold py-1">
              <div
                className={`py-1.5 px-1 rounded-xl border transition ${
                  loginStage === 'detecting'
                    ? 'bg-amber-100 text-amber-900 border-amber-300 shadow-2xs font-extrabold'
                    : 'bg-stone-50 text-stone-400 border-stone-200'
                }`}
              >
                1. ตรวจจับใบหน้า
              </div>
              <div
                className={`py-1.5 px-1 rounded-xl border transition ${
                  loginStage === 'liveness'
                    ? 'bg-teal-100 text-teal-900 border-teal-300 shadow-2xs font-extrabold'
                    : 'bg-stone-50 text-stone-400 border-stone-200'
                }`}
              >
                2. ตรวจความมีชีวิต
              </div>
              <div
                className={`py-1.5 px-1 rounded-xl border transition ${
                  loginStage === 'verifying'
                    ? 'bg-indigo-100 text-indigo-900 border-indigo-300 shadow-2xs font-extrabold'
                    : 'bg-stone-50 text-stone-400 border-stone-200'
                }`}
              >
                3. ยืนยันตัวตน
              </div>
              <div
                className={`py-1.5 px-1 rounded-xl border transition ${
                  loginStage === 'success'
                    ? 'bg-emerald-100 text-emerald-900 border-emerald-300 shadow-2xs font-extrabold'
                    : 'bg-stone-50 text-stone-400 border-stone-200'
                }`}
              >
                4. สำเร็จ
              </div>
              <div
                className={`py-1.5 px-1 rounded-xl border transition ${
                  loginStage === 'failed'
                    ? 'bg-rose-100 text-rose-900 border-rose-300 shadow-2xs font-extrabold'
                    : 'bg-stone-50 text-stone-400 border-stone-200'
                }`}
              >
                5. ไม่สำเร็จ
              </div>
            </div>
          )}

          {/* Feedback Message Bar */}
          {verifyMessage && !verifySuccess && (
            <div
              className={`p-3 rounded-2xl text-xs font-semibold flex items-center justify-between gap-2 border transition ${
                verifyMessage.includes('สำเร็จ')
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                  : loginStage === 'failed'
                  ? 'bg-rose-50 border-rose-300 text-rose-900'
                  : 'bg-amber-50 border-amber-200 text-amber-900'
              }`}
            >
              <div className="flex items-center gap-2">
                <AlertCircle className={`w-4 h-4 flex-shrink-0 ${loginStage === 'failed' ? 'text-rose-600' : 'text-amber-600'}`} />
                <span>{verifyMessage}</span>
              </div>
              {loginStage === 'failed' && (
                <button
                  type="button"
                  onClick={onClose}
                  className="px-3 py-1 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs transition flex-shrink-0 cursor-pointer shadow-2xs"
                >
                  ใช้ PIN สำรอง
                </button>
              )}
            </div>
          )}

          {/* MODE 1: FACE LOGIN */}
          {mode === 'login' && !verifySuccess && (
            <div className="space-y-4">
              <div className="text-center">
                <p className="text-sm font-semibold text-slate-800">
                  {countdown !== null
                    ? `อยู่นิ่งๆ ระบบกำลังถ่ายภาพใน ${countdown} วินาที...`
                    : 'จัดใบหน้าให้อยู่ในกรอบสีเขียว ระบบจะถ่ายภาพอัตโนมัติใน 3 วินาที'}
                </p>
                <p className="text-xs text-slate-500 mt-0.5">ระบบจะเปรียบเทียบ Face Embedding โดยไม่เก็บภาพถ่ายส่วนตัว</p>
              </div>

              <button
                disabled={isVerifying}
                onClick={() => {
                  if (countdownIntervalRef.current) {
                    clearInterval(countdownIntervalRef.current);
                    countdownIntervalRef.current = null;
                  }
                  setCountdown(null);
                  handleFaceLogin();
                }}
                className="w-full py-4 rounded-2xl bg-gradient-to-r from-emerald-500 via-emerald-600 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white font-extrabold text-base flex items-center justify-center gap-2.5 shadow-xl shadow-emerald-500/25 transition transform active:scale-98 disabled:opacity-50 relative overflow-hidden"
              >
                {countdown !== null && (
                  <div
                    className="absolute inset-0 bg-white/20 transition-all duration-1000 ease-linear pointer-events-none"
                    style={{ width: `${((4 - countdown) / 3) * 100}%` }}
                  />
                )}

                {isVerifying ? (
                  <>
                    <RefreshCw className="w-5 h-5 animate-spin" /> กำลังตรวจสอบใบหน้า...
                  </>
                ) : countdown !== null ? (
                  <>
                    <Camera className="w-5 h-5 animate-bounce" />
                    <span>กำลังถ่ายอัตโนมัติใน {countdown} วิ... (หรือกดทันที)</span>
                  </>
                ) : (
                  <>
                    <Camera className="w-5 h-5" /> สแกนใบหน้าเข้าใช้งาน (Face Login)
                  </>
                )}
              </button>

              <div className="flex flex-col sm:flex-row items-center justify-center gap-2 sm:gap-4 pt-2 text-xs font-semibold">
                <button
                  onClick={() => {
                    setMode('enroll');
                    setEnrollStep(1);
                    setVerifyMessage('');
                  }}
                  className="text-emerald-700 hover:text-emerald-800 underline underline-offset-4 cursor-pointer"
                >
                  ยังไม่มีข้อมูลใบหน้าในระบบ? สมัครสมาชิกใหม่
                </button>
                <span className="hidden sm:inline text-slate-300">|</span>
                <button
                  onClick={onClose}
                  className="text-slate-600 hover:text-slate-900 font-bold underline underline-offset-4 cursor-pointer"
                >
                  เข้าสู่ระบบด้วยรหัส PIN สำรอง
                </button>
              </div>
            </div>
          )}

          {/* MODE 2: FACE ENROLLMENT (Step-by-Step for Elderly) */}
          {mode === 'enroll' && !verifySuccess && (
            <div className="space-y-4">
              {/* Step Indicators */}
              <div className="grid grid-cols-4 gap-2 text-center text-xs font-mono">
                {[
                  { step: 1, label: '1. มองตรง' },
                  { step: 2, label: '2. หันซ้าย' },
                  { step: 3, label: '3. หันขวา' },
                  { step: 4, label: '4. ข้อมูล' },
                ].map((s) => (
                  <div
                    key={s.step}
                    className={`py-1.5 px-1 rounded-xl border text-[11px] font-bold transition ${
                      enrollStep === s.step
                        ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm'
                        : enrollStep > s.step
                        ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                        : 'bg-emerald-50/50 text-slate-400 border-emerald-100'
                    }`}
                  >
                    {s.label}
                  </div>
                ))}
              </div>

              {/* Step 1: Center Angle */}
              {enrollStep === 1 && (
                <div className="space-y-3 text-center">
                  <p className="text-sm font-semibold text-slate-800">ขั้นที่ 1: มองตรงเข้าหากล้อง</p>
                  <button
                    onClick={() => {
                      if (countdownIntervalRef.current) {
                        clearInterval(countdownIntervalRef.current);
                        countdownIntervalRef.current = null;
                      }
                      setCountdown(null);
                      captureCurrentAngle('center');
                    }}
                    disabled={!isAligned}
                    className="w-full py-3.5 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm flex items-center justify-center gap-2 shadow-md shadow-emerald-600/20 disabled:opacity-40 relative overflow-hidden"
                  >
                    {countdown !== null && enrollStep === 1 && (
                      <div
                        className="absolute inset-0 bg-white/20 transition-all duration-1000 ease-linear pointer-events-none"
                        style={{ width: `${((4 - countdown) / 3) * 100}%` }}
                      />
                    )}
                    <Camera className="w-4 h-4" />
                    {countdown !== null && enrollStep === 1
                      ? `กำลังถ่ายมุมตรงใน ${countdown} วิ... (หรือกดทันที)`
                      : 'บันทึกมุมตรง (Capture Center)'}
                  </button>
                </div>
              )}

              {/* Step 2: Left Angle */}
              {enrollStep === 2 && (
                <div className="space-y-3 text-center">
                  <p className="text-sm font-semibold text-slate-800">ขั้นที่ 2: เอียงหน้าไปทางซ้ายเล็กน้อย</p>
                  <button
                    onClick={() => {
                      if (countdownIntervalRef.current) {
                        clearInterval(countdownIntervalRef.current);
                        countdownIntervalRef.current = null;
                      }
                      setCountdown(null);
                      captureCurrentAngle('left');
                    }}
                    className="w-full py-3.5 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm flex items-center justify-center gap-2 shadow-md shadow-emerald-600/20 relative overflow-hidden"
                  >
                    {countdown !== null && enrollStep === 2 && (
                      <div
                        className="absolute inset-0 bg-white/20 transition-all duration-1000 ease-linear pointer-events-none"
                        style={{ width: `${((4 - countdown) / 3) * 100}%` }}
                      />
                    )}
                    <Camera className="w-4 h-4" />
                    {countdown !== null && enrollStep === 2
                      ? `กำลังถ่ายมุมซ้ายใน ${countdown} วิ... (หรือกดทันที)`
                      : 'บันทึกมุมซ้าย (Capture Left)'}
                  </button>
                </div>
              )}

              {/* Step 3: Right Angle */}
              {enrollStep === 3 && (
                <div className="space-y-3 text-center">
                  <p className="text-sm font-semibold text-slate-800">ขั้นที่ 3: เอียงหน้าไปทางขวาเล็กน้อย</p>
                  <button
                    onClick={() => {
                      if (countdownIntervalRef.current) {
                        clearInterval(countdownIntervalRef.current);
                        countdownIntervalRef.current = null;
                      }
                      setCountdown(null);
                      captureCurrentAngle('right');
                    }}
                    className="w-full py-3.5 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm flex items-center justify-center gap-2 shadow-md shadow-emerald-600/20 relative overflow-hidden"
                  >
                    {countdown !== null && enrollStep === 3 && (
                      <div
                        className="absolute inset-0 bg-white/20 transition-all duration-1000 ease-linear pointer-events-none"
                        style={{ width: `${((4 - countdown) / 3) * 100}%` }}
                      />
                    )}
                    <Camera className="w-4 h-4" />
                    {countdown !== null && enrollStep === 3
                      ? `กำลังถ่ายมุมขวาใน ${countdown} วิ... (หรือกดทันที)`
                      : 'บันทึกมุมขวา (Capture Right)'}
                  </button>
                </div>
              )}

              {/* Step 4: Simple Elderly Form (Name + Age Only!) */}
              {enrollStep === 4 && (
                <form onSubmit={handleEnrollSubmit} className="space-y-3 pt-1">
                  {/* Photo Preview Badge */}
                  <div className="flex items-center gap-3 bg-emerald-50/70 p-3 rounded-2xl border border-emerald-200 shadow-2xs">
                    {capturedPhoto ? (
                      <div className="relative w-14 h-14 rounded-2xl overflow-hidden border-2 border-emerald-500 shadow-sm flex-shrink-0">
                        <img src={capturedPhoto} alt="ภาพถ่ายใบหน้า" className="w-full h-full object-cover" />
                        <div className="absolute bottom-0 inset-x-0 bg-emerald-700/85 text-[8px] text-white text-center py-0.5 font-bold">
                          ภาพอ้างอิง
                        </div>
                      </div>
                    ) : (
                      <div className="w-14 h-14 rounded-2xl bg-emerald-100 flex items-center justify-center text-emerald-600 flex-shrink-0">
                        <User className="w-7 h-7" />
                      </div>
                    )}
                    <div className="min-w-0">
                      <div className="text-xs font-bold text-emerald-950 flex items-center gap-1.5">
                        <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                        <span>บันทึกภาพถ่ายและมุมใบหน้าสำเร็จ</span>
                      </div>
                      <p className="text-[11px] text-emerald-700 mt-0.5 leading-snug">
                        ภาพนี้จะถูกใช้เป็นภาพประจำตัว และสกัดเป็นเวกเตอร์ไบโอเมตริกซ์ความปลอดภัยสูง
                      </p>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      ชื่อ-นามสกุล ของผู้รับการบำบัด
                    </label>
                    <input
                      type="text"
                      required
                      autoFocus
                      value={enrollName}
                      onChange={(e) => setEnrollName(e.target.value)}
                      placeholder="เช่น คุณตาบุญมี มีสุข"
                      className="w-full px-3.5 py-2.5 rounded-xl bg-white border border-emerald-200 text-slate-900 text-sm focus:outline-none focus:border-emerald-500 font-medium"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">อายุ (ปี)</label>
                      <input
                        type="number"
                        min="5"
                        max="110"
                        value={enrollAge}
                        onChange={(e) => setEnrollAge(Number(e.target.value))}
                        className="w-full px-3.5 py-2.5 rounded-xl bg-white border border-emerald-200 text-slate-900 text-sm focus:outline-none focus:border-emerald-500 font-medium"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">เพศ</label>
                      <select
                        value={enrollGender}
                        onChange={(e) => setEnrollGender(e.target.value as 'male' | 'female')}
                        className="w-full px-3.5 py-2.5 rounded-xl bg-white border border-emerald-200 text-slate-900 text-sm focus:outline-none focus:border-emerald-500 font-medium"
                      >
                        <option value="male">ชาย</option>
                        <option value="female">หญิง</option>
                      </select>
                    </div>
                  </div>

                  {/* Biometric Data Consent Checkbox (PDPA Compliance) */}
                  <div className="bg-emerald-50/70 border border-emerald-200 rounded-xl p-3 space-y-1.5">
                    <label className="flex items-start gap-2.5 cursor-pointer">
                      <input
                        type="checkbox"
                        required
                        checked={hasBiometricConsent}
                        onChange={(e) => {
                          setHasBiometricConsent(e.target.checked);
                          setConsentTimestamp(e.target.checked ? new Date().toISOString() : null);
                        }}
                        className="mt-0.5 w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500 border-emerald-300 cursor-pointer"
                        id="biometricConsentCheckbox"
                      />
                      <span className="text-xs text-slate-800 leading-snug font-medium select-none">
                        ข้าพเจ้ายินยอมให้ประมวลผลและจัดเก็บข้อมูลลักษณะใบหน้า (Biometric Data) เพื่อใช้สำหรับยืนยันตัวตนในการฝึกกายภาพบำบัดตาม พ.ร.บ. คุ้มครองข้อมูลส่วนบุคคล (PDPA)
                      </span>
                    </label>
                    {consentTimestamp && (
                      <div className="text-[10px] text-emerald-700 font-mono pl-6">
                        บันทึกความยินยอม: {new Date(consentTimestamp).toLocaleTimeString('th-TH')} น.
                      </div>
                    )}
                  </div>

                  <button
                    type="submit"
                    disabled={isSavingEnroll || !hasBiometricConsent}
                    className="w-full mt-2 py-3.5 rounded-2xl bg-gradient-to-r from-emerald-500 via-emerald-600 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white font-extrabold text-sm flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/25 transition disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                  >
                    {isSavingEnroll ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" /> กำลังบันทึกข้อมูล...
                      </>
                    ) : (
                      <>
                        <UserCheck className="w-4 h-4" /> เสร็จสิ้นและเริ่มใช้งาน
                      </>
                    )}
                  </button>
                </form>
              )}

              <div className="text-center pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setMode('login');
                    setVerifyMessage('');
                  }}
                  className="text-xs text-slate-500 hover:text-slate-800"
                >
                  มีข้อมูลใบหน้าอยู่แล้ว? กลับไปหน้าสแกนเข้าใช้งาน
                </button>
              </div>
            </div>
          )}

          {/* Liveness & Privacy Disclaimer */}
          <div className="mt-3 p-2.5 rounded-xl bg-slate-50 border border-slate-200 text-[11px] text-slate-500 text-center leading-relaxed">
            {LIVENESS_DISCLAIMER_TH}
          </div>
        </div>
      </div>
    </div>
  );
};
