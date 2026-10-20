import React, { useState, useRef, useEffect } from 'react';
import {
  X,
  User,
  Camera,
  CheckCircle2,
  AlertCircle,
  ShieldCheck,
  ArrowRight,
  ArrowLeft,
  Sparkles,
  Phone,
  Stethoscope,
  KeyRound,
  FileText,
  RefreshCw,
  Eye,
  Check,
} from 'lucide-react';
import { faceService, FaceDetectionResult } from '../../services/faceService';
import { api } from '../../services/api';
import { usePatientStore } from '../../store/patientStore';
import { useHospitalStore } from '../../store/hospitalStore';
import { audioFeedback } from '../../services/audioService';
import { voiceAssistant } from '../../services/voiceAssistantService';
import confetti from 'canvas-confetti';
import { patientFaceStorageService, isPlaceholderPatientName } from '../../services/patientFaceStorageService';
import { faceRegistryService } from '../../services/faceRegistryService';

interface ReceptionOnboardingModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccessNavigateToKiosk?: (patient: any) => void;
}

export const ReceptionOnboardingModal: React.FC<ReceptionOnboardingModalProps> = ({
  isOpen,
  onClose,
  onSuccessNavigateToKiosk,
}) => {
  const { therapists, addUser, users } = useHospitalStore();
  const { fetchPatients, selectPatient } = usePatientStore();

  // Wizard Steps: 1 = Form, 2 = Face Scan, 3 = Complete
  const [step, setStep] = useState<1 | 2 | 3>(1);

  // Form Fields (Step 1)
  const defaultNextCode = `P-${String(users.filter((u) => u.role === 'patient').length + 1).padStart(4, '0')}`;
  const [patientCode, setPatientCode] = useState<string>(defaultNextCode);
  const [fullName, setFullName] = useState<string>('');
  const [age, setAge] = useState<number>(68);
  const [gender, setGender] = useState<'male' | 'female' | 'other'>('male');
  const [phone, setPhone] = useState<string>('');
  const [selectedTherapistId, setSelectedTherapistId] = useState<number | string>(therapists[0]?.id || 1);
  const [diagnosis, setDiagnosis] = useState<string>('ข้อไหล่ติดระยะฟื้นฟู (Frozen Shoulder)');
  const [pin, setPin] = useState<string>('1234');
  const [hasPdpaConsent, setHasPdpaConsent] = useState<boolean>(true);
  const [formError, setFormError] = useState<string | null>(null);

  // Camera & Face Scan States (Step 2)
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const [cameraActive, setCameraActive] = useState<boolean>(false);
  const [detection, setDetection] = useState<FaceDetectionResult | null>(null);
  const [scanStage, setScanStage] = useState<'center' | 'left' | 'right'>('center');
  const [capturedEmbeddings, setCapturedEmbeddings] = useState<{
    center?: { embedding: number[]; qualityScore: number };
    left?: { embedding: number[]; qualityScore: number };
    right?: { embedding: number[]; qualityScore: number };
  }>({});
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [scanMessage, setScanMessage] = useState<string>('กรุณาจัดใบหน้าให้อยู่ในกรอบวงรี');
  const [countdown, setCountdown] = useState<number | null>(null);
  const [showShutterFlash, setShowShutterFlash] = useState<boolean>(false);
  const [createdPatientData, setCreatedPatientData] = useState<any>(null);
  const [capturedPhoto, setCapturedPhoto] = useState<string | null>(null);

  // Session initialization guard: prevents background re-renders or users array updates from resetting wizard back to Step 1
  const isInitializedRef = useRef<boolean>(false);

  // Reset form when modal opens
  useEffect(() => {
    if (!isOpen) {
      isInitializedRef.current = false;
      stopCamera();
      return;
    }

    if (isInitializedRef.current) {
      return;
    }
    isInitializedRef.current = true;

    setStep(1);
    const nextNum = users.filter((u) => u.role === 'patient').length + 1;
    setPatientCode(`P-${String(nextNum).padStart(4, '0')}`);
    setFullName('');
    setPhone('');
    setCapturedEmbeddings({});
    setCapturedPhoto(null);
    setScanStage('center');
    setFormError(null);
  }, [isOpen, users]);

  // Camera management
  const startCamera = async () => {
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        setScanMessage('อุปกรณ์ไม่รองรับการเปิดกล้อง');
        return;
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' },
        audio: false,
      });
      streamRef.current = stream;
      setCameraActive(true);

      const attach = () => {
        if (videoRef.current && streamRef.current) {
          videoRef.current.srcObject = streamRef.current;
          videoRef.current.muted = true;
          videoRef.current.playsInline = true;
          videoRef.current.play().catch(() => {});
        }
      };
      attach();
      setTimeout(attach, 150);
    } catch (err: any) {
      console.warn('Camera start error:', err);
      setScanMessage('ไม่สามารถเข้าถึงกล้องได้ กรุณาตรวจสอบสิทธิ์การใช้งาน');
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

  // Detection loop when on Step 2
  useEffect(() => {
    if (step !== 2 || !cameraActive) return;

    let active = true;
    const loop = async () => {
      if (!active) return;
      if (videoRef.current && videoRef.current.readyState >= 2) {
        try {
          const res = faceService.detectFace(videoRef.current, Date.now());
          if (active && res) {
            setDetection(res);
            if (res.detected) {
              if (res.qualityGate && !res.qualityGate.passed) {
                setScanMessage(res.qualityGate.failures[0] || 'กรุณาปรับตำแหน่งใบหน้า');
              } else if (scanStage === 'center') {
                if (Math.abs(res.yawDeg) <= 10) {
                  setScanMessage('ตำแหน่งมุมตรงสมบูรณ์แบบ อยู่นิ่งๆ สักครู่');
                } else {
                  setScanMessage('กรุณามองตรงมาที่กล้อง');
                }
              } else if (scanStage === 'left') {
                if (res.yawDeg <= -12) {
                  setScanMessage('มุมซ้ายดีมาก อยู่นิ่งๆ สักครู่');
                } else {
                  setScanMessage('กรุณาหันหน้าไปทางซ้ายเล็กน้อย (15°)');
                }
              } else if (scanStage === 'right') {
                if (res.yawDeg >= 12) {
                  setScanMessage('มุมขวาดีมาก อยู่นิ่งๆ สักครู่');
                } else {
                  setScanMessage('กรุณาหันหน้าไปทางขวาเล็กน้อย (15°)');
                }
              }
            } else {
              setScanMessage('กรุณาขยับใบหน้าให้อยู่ในกรอบวงรี');
            }
          }
        } catch {
          // ignore transient detection frame errors
        }
      }
      if (active) {
        animationFrameRef.current = requestAnimationFrame(loop);
      }
    };

    animationFrameRef.current = requestAnimationFrame(loop);

    return () => {
      active = false;
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [step, cameraActive, scanStage]);

  // Proceed from Step 1 (Form) to Step 2 (Scan)
  const handleProceedToScan = (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName.trim() || isPlaceholderPatientName(fullName.trim())) {
      setFormError('กรุณากรอกชื่อ-นามสกุลจริงของคนไข้ (ไม่อนุญาตให้ใช้ชื่อทั่วไป เช่น ผู้ป่วยใหม่)');
      return;
    }
    if (!hasPdpaConsent) {
      setFormError('กรุณาให้ความยินยอมการจัดเก็บข้อมูลชีวมิติ (PDPA) ก่อนดำเนินการ');
      return;
    }
    setFormError(null);
    setStep(2);
    startCamera();
    voiceAssistant.speakSystem(`ยินดีต้อนรับคุณ ${fullName} ครับ กรุณามองตรงมาที่กล้องเพื่อบันทึกใบหน้า`, {
      priority: 'instruction',
      force: true,
    });
  };

  // Capture current angle
  const handleCaptureAngle = async (angle: 'center' | 'left' | 'right') => {
    if (!detection || !detection.detected || isProcessing) return;
    setIsProcessing(true);
    setShowShutterFlash(true);
    audioFeedback.playCameraShutter();
    setTimeout(() => setShowShutterFlash(false), 250);

    try {
      const averaged = videoRef.current
        ? await faceService.generateAveragedEmbedding(videoRef.current, 5)
        : { embedding: faceService.generateEmbedding(detection), qualityScore: detection.qualityScore };

      const updated = { ...capturedEmbeddings, [angle]: averaged };
      setCapturedEmbeddings(updated);

      if (angle === 'center') {
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
              ctx.translate(240, 0);
              ctx.scale(-1, 1);
              ctx.drawImage(videoRef.current, sx, sy, size, size, 0, 0, 240, 240);
              const photoUrl = canvas.toDataURL('image/jpeg', 0.82);
              setCapturedPhoto(photoUrl);
            }
          } catch (e) {
            console.warn('Failed to capture frame in Reception modal:', e);
          }
        }
        setScanStage('left');
        setScanMessage('บันทึกมุมตรงสำเร็จ! กรุณาหันหน้าไปทางซ้ายเล็กน้อย');
        voiceAssistant.speakSystem('บันทึกมุมตรงเรียบร้อยครับ ตอนนี้ค่อยๆ หันหน้าไปทางซ้ายเล็กน้อยครับ', {
          priority: 'instruction',
          force: true,
        });
      } else if (angle === 'left') {
        setScanStage('right');
        setScanMessage('บันทึกมุมซ้ายสำเร็จ! กรุณาหันหน้าไปทางขวาเล็กน้อย');
        voiceAssistant.speakSystem('บันทึกมุมซ้ายเรียบร้อยครับ ตอนนี้หันหน้าไปทางขวาเล็กน้อยครับ', {
          priority: 'instruction',
          force: true,
        });
      } else if (angle === 'right') {
        // Complete enrollment!
        await finalizeEnrollment(updated);
      }
    } catch (err: any) {
      setScanMessage(err?.message || 'เกิดข้อผิดพลาดในการบันทึกเวกเตอร์ใบหน้า');
    } finally {
      setIsProcessing(false);
    }
  };

  // Finalize Enrollment: save to Backend & Hospital Store
  const finalizeEnrollment = async (embeddings: typeof capturedEmbeddings) => {
    setIsProcessing(true);
    setScanMessage('กำลังบันทึกข้อมูลคนไข้และเวกเตอร์ชีวมิติ...');

    const chosenTherapist = therapists.find((t) => t.id === selectedTherapistId);
    const assignedTherapistName = chosenTherapist ? chosenTherapist.name : 'กภ. ธนากร วงศ์สวัสดิ์';

    const embeddingsList: any[] = [];
    if (embeddings.center) {
      embeddingsList.push({
        angle_tag: 'center',
        embedding: embeddings.center.embedding,
        quality_score: embeddings.center.qualityScore,
      });
    }
    if (embeddings.left) {
      embeddingsList.push({
        angle_tag: 'left',
        embedding: embeddings.left.embedding,
        quality_score: embeddings.left.qualityScore,
      });
    }
    if (embeddings.right) {
      embeddingsList.push({
        angle_tag: 'right',
        embedding: embeddings.right.embedding,
        quality_score: embeddings.right.qualityScore,
      });
    }

    try {
      // 1. Save to Backend / Face Enroll
      const backendPayload = {
        name: fullName.trim(),
        patient_code: patientCode,
        age,
        gender,
        pin: pin.trim() || '1234',
        photo: capturedPhoto || undefined,
        notes: `วินิจฉัย: ${diagnosis} | กภ. ผู้รับผิดชอบ: ${assignedTherapistName} | โทร: ${phone}`,
        embeddings: embeddingsList,
      };

      const res = await api.enrollFace(backendPayload);

      // 2. Add to Hospital Store
      const newAccount = addUser({
        username: `patient_${patientCode.toLowerCase().replace(/[^a-z0-9]/g, '')}`,
        name: fullName.trim(),
        role: 'patient',
        status: 'active',
        code: patientCode,
        assignedTherapistName,
        assignedTherapistId: selectedTherapistId,
        phone,
        age,
        gender,
        diagnosis,
        face_image_url: capturedPhoto || undefined,
        face_vector: embeddingsList?.[0] || undefined,
        biometricVector: embeddingsList?.[0] || undefined,
      });

      // 3. Save to isolated patientFaceStorageService and faceRegistryService
      try {
        patientFaceStorageService.savePatientRecord(patientCode, {
          patient_profile: {
            patient_id: patientCode,
            id: newAccount.id,
            full_name: fullName.trim(),
            first_name: fullName.trim().split(' ')[0] || fullName.trim(),
            last_name: fullName.trim().split(' ').slice(1).join(' ') || '',
            age,
            gender,
            phone,
            status: 'active',
            created_at: new Date().toISOString().split('T')[0],
          },
          biometric_data: {
            face_vector: embeddingsList?.[0]?.embedding || [],
            registered_face_url: capturedPhoto || '',
            enrolled_at: new Date().toISOString(),
            model_version: 'face-resnet34-v2',
          },
          medical_records: {
            diagnosis,
            chief_complaint: diagnosis,
          },
        }, capturedPhoto || undefined);
      } catch (fsErr) {
        console.warn('Reception savePatientRecord warning:', fsErr);
      }

      try {
        faceRegistryService.saveProfile({
          patientId: newAccount.id,
          patientCode: patientCode,
          name: fullName.trim(),
          age,
          gender,
          face_image_url: capturedPhoto || undefined,
          embeddings: embeddingsList.map((e) => e.embedding).filter(Boolean),
          enrolledAt: new Date().toISOString(),
        });
      } catch (regErr) {
        console.warn('Reception saveProfile warning:', regErr);
      }

      // 4. Refresh patient list in patientStore
      await fetchPatients();

      const createdObj = {
        id: res?.patient?.id || newAccount.id,
        name: fullName.trim(),
        patient_code: patientCode,
        age,
        gender,
        photo: capturedPhoto || undefined,
        avatar_url: capturedPhoto || undefined,
        notes: diagnosis,
        assignedTherapistName,
      };
      setCreatedPatientData(createdObj);

      stopCamera();
      setStep(3);
      audioFeedback.playRepSuccess();
      voiceAssistant.speakSystem(`ลงทะเบียนคนไข้และบันทึกใบหน้าของคุณ ${fullName} สำเร็จเรียบร้อยครับ สามารถใช้งานตู้ได้ทันที`, {
        priority: 'success',
        force: true,
      });

      try {
        confetti({
          particleCount: 65,
          spread: 70,
          origin: { y: 0.6 },
        });
      } catch {
        // confetti fallback
      }
    } catch (err: any) {
      setScanMessage(`เกิดข้อผิดพลาด: ${err?.message || 'ไม่สามารถบันทึกข้อมูลได้'}`);
    } finally {
      setIsProcessing(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-[#0B2B2B]/70 backdrop-blur-md animate-fadeIn"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="w-full max-w-2xl bg-white rounded-[32px] p-6 sm:p-8 shadow-2xl border border-emerald-200/90 space-y-6 max-h-[92dvh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between pb-3 border-b border-emerald-100">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-700 text-white flex items-center justify-center shadow-md shadow-emerald-700/20">
              <Stethoscope className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base sm:text-lg font-bold text-[#0B2B2B] leading-tight">
                ต้อนรับและลงทะเบียนคนไข้ใหม่
              </h3>
              <p className="text-xs text-emerald-800 font-medium">
                กรอกข้อมูลผู้ป่วยก่อน แล้วจึงสแกนบันทึกใบหน้าชีวมิติเพื่อใช้เข้าสู่ระบบตู้ Dr.Tech.Care
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-full hover:bg-slate-100 text-slate-500 transition active:scale-95"
            aria-label="ปิดหน้าต่าง"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Step Progress Pills */}
        <div className="flex items-center justify-between gap-2 px-2 py-2 rounded-2xl bg-emerald-50/70 border border-emerald-100 text-xs">
          <div
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full font-bold transition ${
              step === 1 ? 'bg-[#10B981] text-white shadow-sm' : 'text-emerald-900 bg-white'
            }`}
          >
            <span className="w-5 h-5 rounded-full bg-white/20 flex items-center justify-center text-[11px]">1</span>
            <span>กรอกข้อมูลคนไข้</span>
          </div>

          <div className="w-6 h-0.5 bg-emerald-200" />

          <div
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full font-bold transition ${
              step === 2 ? 'bg-[#10B981] text-white shadow-sm' : 'text-emerald-900 bg-white'
            }`}
          >
            <span className="w-5 h-5 rounded-full bg-white/20 flex items-center justify-center text-[11px]">2</span>
            <span>สแกนใบหน้าชีวมิติ</span>
          </div>

          <div className="w-6 h-0.5 bg-emerald-200" />

          <div
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full font-bold transition ${
              step === 3 ? 'bg-[#10B981] text-white shadow-sm' : 'text-emerald-900 bg-white'
            }`}
          >
            <span className="w-5 h-5 rounded-full bg-white/20 flex items-center justify-center text-[11px]">3</span>
            <span>พร้อมใช้งานตู้</span>
          </div>
        </div>

        {/* ==================================================================== */}
        {/* STEP 1: PATIENT INFORMATION FORM                                      */}
        {/* ==================================================================== */}
        {step === 1 && (
          <form onSubmit={handleProceedToScan} className="space-y-4 animate-fadeIn">
            {formError && (
              <div className="flex items-center gap-2 p-3 rounded-2xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <span>{formError}</span>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              {/* Patient Code */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  รหัสคนไข้ (HN / Patient Code):
                </label>
                <input
                  type="text"
                  value={patientCode}
                  onChange={(e) => setPatientCode(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-2xl border border-emerald-200 font-mono text-sm font-bold text-[#0B2B2B] bg-slate-50 focus:bg-white focus:border-emerald-500 outline-none"
                  placeholder="เช่น P-0036"
                  required
                />
              </div>

              {/* Full Name */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  ชื่อ-นามสกุล คนไข้: <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-2xl border border-emerald-200 text-sm font-semibold text-[#0B2B2B] focus:border-emerald-500 outline-none"
                  placeholder="เช่น นายสุรชัย เจริญผล"
                  required
                />
              </div>

              {/* Age */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">อายุ (ปี):</label>
                <input
                  type="number"
                  value={age}
                  min={1}
                  max={120}
                  onChange={(e) => setAge(Number(e.target.value))}
                  className="w-full px-3.5 py-2.5 rounded-2xl border border-emerald-200 text-sm font-semibold text-[#0B2B2B] focus:border-emerald-500 outline-none"
                  required
                />
              </div>

              {/* Gender */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">เพศ:</label>
                <select
                  value={gender}
                  onChange={(e) => setGender(e.target.value as any)}
                  className="w-full px-3.5 py-2.5 rounded-2xl border border-emerald-200 text-sm font-semibold text-[#0B2B2B] bg-white focus:border-emerald-500 outline-none cursor-pointer"
                >
                  <option value="male">ชาย (Male)</option>
                  <option value="female">หญิง (Female)</option>
                  <option value="other">อื่นๆ (Other)</option>
                </select>
              </div>

              {/* Phone */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  เบอร์โทรศัพท์ติดต่อ:
                </label>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-2xl border border-emerald-200 text-sm font-semibold text-[#0B2B2B] focus:border-emerald-500 outline-none"
                  placeholder="เช่น 081-234-5678"
                />
              </div>

              {/* Assigned Physical Therapist */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  นักกายภาพผู้รับผิดชอบ: <span className="text-rose-500">*</span>
                </label>
                <select
                  value={selectedTherapistId}
                  onChange={(e) => setSelectedTherapistId(Number(e.target.value))}
                  className="w-full px-3.5 py-2.5 rounded-2xl border border-emerald-200 text-sm font-semibold text-[#0B2B2B] bg-white focus:border-emerald-500 outline-none cursor-pointer"
                >
                  {therapists.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name} ({t.code} - {t.specialty.split('(')[0].trim()})
                    </option>
                  ))}
                </select>
              </div>

              {/* Diagnosis / Notes */}
              <div className="sm:col-span-2">
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  การวินิจฉัยเบื้องต้น / แผนการรักษา (Clinical Diagnosis):
                </label>
                <input
                  type="text"
                  value={diagnosis}
                  onChange={(e) => setDiagnosis(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-2xl border border-emerald-200 text-sm font-semibold text-[#0B2B2B] focus:border-emerald-500 outline-none"
                  placeholder="เช่น ข้อเข่าเสื่อมระยะที่ 2, ไหล่ติด, โรคหลอดเลือดสมอง"
                />
              </div>

              {/* Backup PIN */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  รหัส PIN สำรองสำหรับตู้ (4 หลัก):
                </label>
                <input
                  type="password"
                  maxLength={6}
                  value={pin}
                  onChange={(e) => setPin(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-2xl border border-emerald-200 font-mono text-sm font-bold text-[#0B2B2B] focus:border-emerald-500 outline-none"
                  placeholder="ค่าเริ่มต้น 1234"
                />
              </div>

              {/* PDPA Consent Checkbox */}
              <div className="sm:col-span-2 p-3.5 rounded-2xl bg-emerald-50/70 border border-emerald-200/80">
                <label className="flex items-start gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={hasPdpaConsent}
                    onChange={(e) => setHasPdpaConsent(e.target.checked)}
                    className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500 mt-0.5 cursor-pointer"
                  />
                  <div className="text-xs text-slate-700 leading-snug">
                    <span className="font-bold text-emerald-900">
                      ความยินยอมจัดเก็บข้อมูลชีวมิติ (PDPA Biometric Consent):
                    </span>{' '}
                    ยินยอมให้นำข้อมูลใบหน้าไปประมวลผลเป็นเวกเตอร์คณิตศาสตร์ 128 มิติ เพื่อใช้ในการยืนยันตัวตนเข้าใช้งานตู้ Dr.Tech.Care
                    โดยระบบไม่บันทึกภาพถ่ายใบหน้าจริงลงในฐานข้อมูล
                  </div>
                </label>
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center justify-end gap-3 pt-3">
              <button
                type="button"
                onClick={onClose}
                className="px-5 py-2.5 rounded-full border border-slate-300 text-slate-700 text-sm font-bold hover:bg-slate-50 transition"
              >
                ยกเลิก
              </button>
              <button
                type="submit"
                className="px-6 py-2.5 rounded-full bg-gradient-to-r from-[#10B981] via-[#06B6D4] to-[#2563EB] text-white text-sm font-bold shadow-lg shadow-cyan-500/25 hover:opacity-95 transition flex items-center gap-2 active:scale-95"
              >
                <span>ขั้นตอนถัดไป: สแกนใบหน้าคนไข้</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </form>
        )}

        {/* ==================================================================== */}
        {/* STEP 2: REAL-TIME BIOMETRIC FACE SCANNER                              */}
        {/* ==================================================================== */}
        {step === 2 && (
          <div className="space-y-4 animate-fadeIn">
            {/* Guide header */}
            <div className="flex items-center justify-between p-3.5 rounded-2xl bg-emerald-50 border border-emerald-200">
              <div>
                <div className="text-xs text-emerald-800 font-bold">
                  กำลังลงทะเบียนใบหน้าให้: <span className="text-sm text-emerald-950 font-extrabold">{fullName}</span> ({patientCode})
                </div>
                <div className="text-xs text-slate-600 mt-0.5">
                  นักกายภาพผู้รับผิดชอบ:{' '}
                  {therapists.find((t) => t.id === selectedTherapistId)?.name || 'กภ. ธนากร'}
                </div>
              </div>

              {/* Angle steps tracker */}
              <div className="flex items-center gap-1.5 text-xs font-bold">
                <span
                  className={`px-2.5 py-1 rounded-full ${
                    capturedEmbeddings.center
                      ? 'bg-emerald-600 text-white'
                      : scanStage === 'center'
                      ? 'bg-amber-400 text-slate-900 animate-pulse'
                      : 'bg-slate-200 text-slate-600'
                  }`}
                >
                  1. มองตรง
                </span>
                <span
                  className={`px-2.5 py-1 rounded-full ${
                    capturedEmbeddings.left
                      ? 'bg-emerald-600 text-white'
                      : scanStage === 'left'
                      ? 'bg-amber-400 text-slate-900 animate-pulse'
                      : 'bg-slate-200 text-slate-600'
                  }`}
                >
                  2. หันซ้าย
                </span>
                <span
                  className={`px-2.5 py-1 rounded-full ${
                    capturedEmbeddings.right
                      ? 'bg-emerald-600 text-white'
                      : scanStage === 'right'
                      ? 'bg-amber-400 text-slate-900 animate-pulse'
                      : 'bg-slate-200 text-slate-600'
                  }`}
                >
                  3. หันขวา
                </span>
              </div>
            </div>

            {/* Video Viewport Container */}
            <div className="relative w-full h-[320px] sm:h-[360px] bg-black rounded-3xl overflow-hidden border-2 border-emerald-400/60 shadow-inner flex items-center justify-center">
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="w-full h-full object-cover transform scale-x-[-1]"
              />

              {/* Shutter flash */}
              {showShutterFlash && (
                <div className="absolute inset-0 bg-white z-40 animate-fadeOut pointer-events-none" />
              )}

              {/* Target Face Oval Frame */}
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div
                  className={`w-48 h-64 sm:w-56 sm:h-72 rounded-[50%] border-4 transition-all duration-300 ${
                    detection?.detected && detection.qualityGate.passed
                      ? 'border-emerald-400 shadow-[0_0_25px_rgba(16,185,129,0.5)]'
                      : 'border-amber-400/80 shadow-[0_0_15px_rgba(245,158,11,0.3)]'
                  }`}
                />
              </div>

              {/* Feedback overlay badge */}
              <div className="absolute bottom-3 inset-x-3 flex justify-between items-center pointer-events-none">
                <div className="px-3 py-1.5 rounded-full bg-black/75 backdrop-blur-md text-white text-xs font-semibold flex items-center gap-2">
                  <span
                    className={`w-2.5 h-2.5 rounded-full ${
                      detection?.detected ? 'bg-emerald-400 animate-pulse' : 'bg-rose-400'
                    }`}
                  />
                  <span>{scanMessage}</span>
                </div>

                {detection?.qualityScore && (
                  <div className="px-3 py-1.5 rounded-full bg-black/75 backdrop-blur-md text-emerald-300 font-mono text-xs font-bold">
                    คุณภาพ: {detection.qualityScore}% | Yaw: {Math.round(detection.yawDeg || 0)}°
                  </div>
                )}
              </div>
            </div>

            {/* Scan Controls */}
            <div className="flex items-center justify-between pt-2">
              <button
                type="button"
                onClick={() => {
                  stopCamera();
                  setStep(1);
                }}
                className="px-4 py-2 rounded-full border border-slate-300 text-slate-700 text-xs font-bold hover:bg-slate-50 transition flex items-center gap-1.5"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>ย้อนกลับไปแก้ไขข้อมูล</span>
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={!detection?.detected || isProcessing}
                  onClick={() => handleCaptureAngle(scanStage)}
                  className="px-6 py-2.5 rounded-full bg-gradient-to-r from-[#10B981] via-[#06B6D4] to-[#2563EB] text-white text-xs sm:text-sm font-bold shadow-lg shadow-cyan-500/25 hover:opacity-95 transition disabled:opacity-50 flex items-center gap-2 active:scale-95"
                >
                  <Camera className="w-4 h-4" />
                  <span>
                    {isProcessing
                      ? 'กำลังบันทึกเวกเตอร์...'
                      : scanStage === 'center'
                      ? 'บันทึกภาพมุมตรง'
                      : scanStage === 'left'
                      ? 'บันทึกภาพมุมซ้าย'
                      : 'บันทึกภาพมุมขวา & จบขั้นตอน'}
                  </span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ==================================================================== */}
        {/* STEP 3: SUCCESS & READY FOR KIOSK                                     */}
        {/* ==================================================================== */}
        {step === 3 && createdPatientData && (
          <div className="space-y-6 text-center py-4 animate-fadeIn">
            <div className="w-20 h-20 rounded-full bg-emerald-100 text-emerald-700 mx-auto flex items-center justify-center shadow-lg shadow-emerald-600/15">
              <CheckCircle2 className="w-12 h-12" />
            </div>

            <div className="space-y-1">
              <h4 className="text-xl font-extrabold text-[#0B2B2B]">
                ลงทะเบียนและบันทึกใบหน้าสำเร็จเรียบร้อย!
              </h4>
              <p className="text-xs sm:text-sm text-slate-600">
                ข้อมูลคนไข้และเวกเตอร์ชีวมิติถูกจัดเก็บในระบบอย่างปลอดภัยตามมาตรฐาน PDPA
              </p>
            </div>

            {/* Patient Badge Card */}
            <div className="max-w-md mx-auto p-4 rounded-3xl bg-emerald-50/80 border border-emerald-200 text-left space-y-2">
              <div className="flex items-center gap-3.5 border-b border-emerald-200/60 pb-3">
                {createdPatientData.photo || capturedPhoto ? (
                  <img
                    src={createdPatientData.photo || capturedPhoto}
                    alt={createdPatientData.name}
                    className="w-14 h-14 rounded-2xl object-cover border-2 border-emerald-500 shadow-sm flex-shrink-0"
                  />
                ) : (
                  <div className="w-14 h-14 rounded-2xl bg-emerald-600 text-white flex items-center justify-center font-bold text-xl shadow-sm flex-shrink-0">
                    {createdPatientData.name?.charAt(0) || 'ผ'}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-sm text-emerald-950 truncate">{createdPatientData.name}</div>
                  <div className="inline-block font-mono text-[11px] font-bold px-2 py-0.5 rounded-full bg-white text-emerald-800 border border-emerald-300 mt-0.5">
                    {createdPatientData.patient_code}
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs text-slate-700 pt-1">
                <div>
                  <span className="text-slate-500">อายุ/เพศ:</span> {createdPatientData.age} ปี (
                  {createdPatientData.gender === 'male' ? 'ชาย' : 'หญิง'})
                </div>
                <div>
                  <span className="text-slate-500">PIN สำรอง:</span>{' '}
                  <span className="font-mono font-bold">{pin || '1234'}</span>
                </div>
                <div className="col-span-2">
                  <span className="text-slate-500">นักกายภาพผู้รับผิดชอบ:</span>{' '}
                  <span className="font-bold text-emerald-900">{createdPatientData.assignedTherapistName}</span>
                </div>
                <div className="col-span-2">
                  <span className="text-slate-500">การวินิจฉัย:</span> {createdPatientData.notes}
                </div>
              </div>
            </div>

            {/* Quick Actions */}
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
              {onSuccessNavigateToKiosk && (
                <button
                  type="button"
                  onClick={() => {
                    selectPatient(createdPatientData);
                    onSuccessNavigateToKiosk(createdPatientData);
                    onClose();
                  }}
                  className="w-full sm:w-auto px-6 py-3 rounded-full bg-gradient-to-r from-[#10B981] via-[#06B6D4] to-[#2563EB] text-white text-sm font-bold shadow-lg shadow-cyan-500/25 hover:opacity-95 transition flex items-center justify-center gap-2 active:scale-95"
                >
                  <Sparkles className="w-4 h-4" />
                  <span>ทดสอบเข้าสู่ระบบตู้ทันที (Test Kiosk Face Login)</span>
                </button>
              )}

              <button
                type="button"
                onClick={onClose}
                className="w-full sm:w-auto px-5 py-3 rounded-full border border-slate-300 text-slate-700 text-sm font-bold hover:bg-slate-50 transition"
              >
                ปิดหน้าต่าง / กลับไปยังระบบ
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
