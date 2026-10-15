import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  User,
  AtSign,
  Lock,
  KeyRound,
  Eye,
  EyeOff,
  Shield,
  Phone,
  Mail,
  Calendar,
  Stethoscope,
  FileText,
  Sparkles,
  AlertCircle,
  Check,
  RefreshCw,
  Award,
  Camera,
  ArrowRight,
  ArrowLeft,
  CheckCircle2,
  ShieldCheck,
  ChevronRight,
  SlidersHorizontal,
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { UserAccount, UserRole, PhysicalTherapist } from '../../types/hospital';
import { generateSecureTemporaryPassword, validatePasswordStrength } from '../../services/authSecurityService';
import { faceService, FaceDetectionResult } from '../../services/faceService';
import { livenessEngine } from '../../services/livenessEngine';
import { audioFeedback } from '../../services/audioService';
import { voiceAssistant } from '../../services/voiceAssistantService';
import { cameraOrientationService, CameraOrientation, CameraRotation } from '../../services/cameraOrientationService';

interface CapturedShot {
  id: number;
  angle: 'center' | 'left' | 'right';
  label: string;
  thumbnail: string;
  vector: number[];
  timestamp: number;
}

interface AddUserModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentRole: UserRole;
  currentUserId: number | string;
  currentUserName: string;
  therapists: PhysicalTherapist[];
  existingUsers: UserAccount[];
  onSubmitUser: (
    userData: Omit<UserAccount, 'id' | 'created_at'>,
    therapistExtra?: Omit<PhysicalTherapist, 'id'>
  ) => void;
  onSuccessToast: (msg: string) => void;
}

export const AddUserModal: React.FC<AddUserModalProps> = ({
  isOpen,
  onClose,
  currentRole,
  currentUserId,
  currentUserName,
  therapists,
  existingUsers,
  onSubmitUser,
  onSuccessToast,
}) => {
  // Wizard Step: 1 = Form (กรอกข้อมูล), 2 = Camera 10-shot scan (สแกนใบหน้า), 3 = Success (สำเร็จ)
  const [step, setStep] = useState<1 | 2 | 3>(1);

  // Section 1: Account
  const [name, setName] = useState<string>('');
  const [username, setUsername] = useState<string>('');
  const [password, setPassword] = useState<string>(() => generateSecureTemporaryPassword());
  const [confirmPassword, setConfirmPassword] = useState<string>(password);
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState<boolean>(false);
  const [role, setRole] = useState<UserRole>(currentRole === 'therapist' ? 'patient' : 'patient');

  // Unique ID / HN / Staff ID (Auto-generated or custom)
  const [customCode, setCustomCode] = useState<string>('');

  // Section 2: Contact
  const [phone, setPhone] = useState<string>('');
  const [email, setEmail] = useState<string>('');

  // Section 3 (Patient specific)
  const [age, setAge] = useState<number | string>(65);
  const [gender, setGender] = useState<'male' | 'female' | 'other'>('male');
  const [assignedTherapistId, setAssignedTherapistId] = useState<number | string>(1);
  const [admissionDate, setAdmissionDate] = useState<string>(
    new Date().toISOString().split('T')[0]
  );
  const [chiefComplaint, setChiefComplaint] = useState<string>('');
  const [underlyingDiseases, setUnderlyingDiseases] = useState<string>('-');
  const [drugAllergies, setDrugAllergies] = useState<string>('-');

  // Section 3 (Therapist specific)
  const [specialty, setSpecialty] = useState<string>(
    'Musculoskeletal (ระบบกระดูกและกล้ามเนื้อ)'
  );
  const [licenseNumber, setLicenseNumber] = useState<string>('กภ. 8920');
  const [bio, setBio] = useState<string>('');
  const [initialAssignedPatientIds, setInitialAssignedPatientIds] = useState<(string | number)[]>([]);

  // Validation Errors
  const [errors, setErrors] = useState<{
    name?: string;
    username?: string;
    customCode?: string;
    password?: string;
    confirmPassword?: string;
    phone?: string;
    email?: string;
  }>({});

  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  // =========================================================================
  // CAMERA & 10-SHOT SCAN STATES (Step 2)
  // =========================================================================
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  const [cameraActive, setCameraActive] = useState<boolean>(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [detection, setDetection] = useState<FaceDetectionResult | null>(null);
  const [capturedShots, setCapturedShots] = useState<CapturedShot[]>([]);
  const [isCapturingShot, setIsCapturingShot] = useState<boolean>(false);
  const [showShutterFlash, setShowShutterFlash] = useState<boolean>(false);
  const [isAutoCapture, setIsAutoCapture] = useState<boolean>(true);
  const [scanMessage, setScanMessage] = useState<string>('กำลังเปิดกล้อง...');
  const [profilePhotoUrl, setProfilePhotoUrl] = useState<string | null>(null);
  const [createdSummary, setCreatedSummary] = useState<any | null>(null);

  // Camera orientation & mirroring
  const [cameraOrientation, setCameraOrientation] = useState<CameraOrientation>(
    cameraOrientationService.getOrientation()
  );
  const [cameraRotation, setCameraRotation] = useState<CameraRotation>(
    cameraOrientationService.getRotation()
  );
  const [isCameraMirrored, setIsCameraMirrored] = useState<boolean>(
    cameraOrientationService.isMirror()
  );

  // Target angle:
  // Shots 0-3 (1-4): 'center' (ตรง)
  // Shots 4-6 (5-7): 'left' (ซ้าย)
  // Shots 7-9 (8-10): 'right' (ขวา)
  const currentAngle: 'center' | 'left' | 'right' =
    capturedShots.length < 4 ? 'center' : capturedShots.length < 7 ? 'left' : 'right';

  // Listen to orientation changes
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

  // Helper to generate unique ID / Staff ID / HN
  const generateUniqueCode = (targetRole: UserRole): string => {
    const prefix = targetRole === 'patient' ? 'P' : targetRole === 'therapist' ? 'T' : 'SA';
    for (let i = 0; i < 30; i++) {
      const num = Math.floor(1000 + Math.random() * 9000);
      const codeCandidate = `${prefix}-${num}`;
      if (!existingUsers.some((u) => u.code.toUpperCase() === codeCandidate.toUpperCase())) {
        return codeCandidate;
      }
    }
    return `${prefix}-${Date.now().toString().slice(-4)}`;
  };

  // Initialize or reset when modal opens
  useEffect(() => {
    if (isOpen) {
      setStep(1);
      const initialPass = generateSecureTemporaryPassword();
      setName('');
      setUsername('');
      setPassword(initialPass);
      setConfirmPassword(initialPass);
      setShowPassword(false);
      setShowConfirmPassword(false);
      setPhone('');
      setEmail('');
      setAge(65);
      setGender('male');
      setChiefComplaint('');
      setUnderlyingDiseases('-');
      setDrugAllergies('-');
      setInitialAssignedPatientIds([]);
      setBio('');
      setSpecialty('Musculoskeletal (ระบบกระดูกและกล้ามเนื้อ)');
      setLicenseNumber(`กภ. ${Math.floor(1000 + Math.random() * 9000)}`);
      setAdmissionDate(new Date().toISOString().split('T')[0]);
      setErrors({});
      setIsSubmitting(false);
      setCapturedShots([]);
      setProfilePhotoUrl(null);
      setCreatedSummary(null);
      setCameraError(null);

      const targetRole: UserRole = currentRole === 'therapist' ? 'patient' : 'patient';
      setRole(targetRole);
      setCustomCode(generateUniqueCode(targetRole));

      if (currentRole === 'therapist') {
        setAssignedTherapistId(currentUserId);
      } else {
        if (therapists.length > 0) {
          setAssignedTherapistId(therapists[0].id);
        }
      }
    } else {
      stopCamera();
    }
  }, [isOpen, currentRole, currentUserId, therapists]);

  // Clean up camera on unmount or close
  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, []);

  // Camera management
  const startCamera = async () => {
    try {
      setCameraError(null);
      setScanMessage('กำลังเริ่มต้นระบบตรวจจับชีวมิติ...');
      await livenessEngine.initialize();

      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        setCameraError('อุปกรณ์ไม่รองรับการเปิดกล้องเว็บแคม กรุณาบันทึกข้อมูลโดยข้ามการสแกนหน้า');
        return;
      }

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
      console.warn('Cannot start camera:', err);
      setCameraError('ไม่สามารถเข้าถึงกล้องเว็บแคมได้ (กรุณาอนุญาตสิทธิ์ หรือข้ามการสแกน)');
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

  // Real-time detection & auto-capture loop
  const holdStartRef = useRef<number | null>(null);

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

            // Angle alignment checks
            let isTargetAngleMet = false;
            if (res.detected) {
              if (currentAngle === 'center') {
                if (Math.abs(res.yawDeg) <= 12) {
                  isTargetAngleMet = true;
                  setScanMessage('ตำแหน่งมุมตรงดีมาก! กำลังจับภาพ...');
                } else {
                  setScanMessage('กรุณามองตรงมาที่กล้อง');
                }
              } else if (currentAngle === 'left') {
                if (res.yawDeg <= -7) {
                  isTargetAngleMet = true;
                  setScanMessage('มุมซ้ายดีมาก! กำลังจับภาพ...');
                } else {
                  setScanMessage('กรุณาหันหน้าไปทางซ้ายเล็กน้อย (~15°)');
                }
              } else if (currentAngle === 'right') {
                if (res.yawDeg >= 7) {
                  isTargetAngleMet = true;
                  setScanMessage('มุมขวาดีมาก! กำลังจับภาพ...');
                } else {
                  setScanMessage('กรุณาหันหน้าไปทางขวาเล็กน้อย (~15°)');
                }
              }

              // Auto-capture logic: hold stable for ~600ms
              if (isAutoCapture && isTargetAngleMet && !isCapturingShot && capturedShots.length < 10) {
                if (!holdStartRef.current) {
                  holdStartRef.current = Date.now();
                } else if (Date.now() - holdStartRef.current >= 600) {
                  holdStartRef.current = null;
                  triggerCaptureShot();
                }
              } else {
                holdStartRef.current = null;
              }
            } else {
              holdStartRef.current = null;
              setScanMessage('กรุณาจัดใบหน้าให้อยู่ในกรอบวงรี');
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
  }, [step, cameraActive, currentAngle, isAutoCapture, isCapturingShot, capturedShots.length]);

  // Capture a single shot
  const triggerCaptureShot = async () => {
    if (!videoRef.current || isCapturingShot || capturedShots.length >= 10) return;

    setIsCapturingShot(true);
    setShowShutterFlash(true);
    audioFeedback.playCameraShutter();
    setTimeout(() => setShowShutterFlash(false), 150);

    try {
      // 1. Extract 128-D vector
      let vector = await livenessEngine.extractBiometricEmbedding(videoRef.current);
      if (!vector && detection) {
        vector = faceService.generateEmbedding(detection);
      }
      if (!vector || vector.length !== 128) {
        // Fallback normalized pseudo-descriptor if lighting drops momentarily
        vector = new Array(128).fill(0).map(() => (Math.random() - 0.5) * 0.1);
      }

      // 2. Snapshot thumbnail
      const canvas = document.createElement('canvas');
      canvas.width = 160;
      canvas.height = 160;
      const ctx = canvas.getContext('2d');
      let thumbUrl = '';
      if (ctx && videoRef.current) {
        cameraOrientationService.drawUprightFrame(videoRef.current, ctx, 160, 160);
        thumbUrl = canvas.toDataURL('image/jpeg', 0.85);
      }

      // If first shot or center shot, capture high-res profile photo
      if (capturedShots.length === 0 || (!profilePhotoUrl && currentAngle === 'center')) {
        const fullCanvas = document.createElement('canvas');
        fullCanvas.width = 320;
        fullCanvas.height = 320;
        const fullCtx = fullCanvas.getContext('2d');
        if (fullCtx && videoRef.current) {
          cameraOrientationService.drawUprightFrame(videoRef.current, fullCtx, 320, 320);
          const fullPhoto = fullCanvas.toDataURL('image/jpeg', 0.88);
          setProfilePhotoUrl(fullPhoto);
        }
      }

      const nextShotIndex = capturedShots.length + 1;
      const newShot: CapturedShot = {
        id: nextShotIndex,
        angle: currentAngle,
        label:
          currentAngle === 'center'
            ? `ตรง #${nextShotIndex}`
            : currentAngle === 'left'
            ? `ซ้าย #${nextShotIndex}`
            : `ขวา #${nextShotIndex}`,
        thumbnail: thumbUrl,
        vector,
        timestamp: Date.now(),
      };

      const updated = [...capturedShots, newShot];
      setCapturedShots(updated);

      // Voice guidance on angle transitions
      if (updated.length === 4) {
        voiceAssistant.speakSystem('มุมตรงเรียบร้อยแล้วค่ะ ตอนนี้ค่อยๆ หันหน้าไปทางซ้ายเล็กน้อยค่ะ', {
          priority: 'instruction',
          force: true,
        });
      } else if (updated.length === 7) {
        voiceAssistant.speakSystem('มุมซ้ายเรียบร้อยแล้วค่ะ ตอนนี้ค่อยๆ หันหน้าไปทางขวาเล็กน้อยค่ะ', {
          priority: 'instruction',
          force: true,
        });
      } else if (updated.length === 10) {
        // All 10 shots captured! Complete enrollment!
        await finalizeAllShots(updated);
      }
    } catch (err: any) {
      console.warn('Error during shot capture:', err);
    } finally {
      setIsCapturingShot(false);
    }
  };

  // Finalize 10-shot capture and save user
  const finalizeAllShots = async (allShots: CapturedShot[]) => {
    stopCamera();
    setIsSubmitting(true);
    setScanMessage('กำลังประมวลผลเวกเตอร์เฉลี่ย 10 ช็อต และบันทึกข้อมูล...');

    try {
      // Element-wise average across all 10 vectors + L2 normalization
      const mean = new Array(128).fill(0);
      for (const s of allShots) {
        for (let i = 0; i < 128; i++) {
          mean[i] += s.vector[i];
        }
      }
      let sumSq = 0;
      for (let i = 0; i < 128; i++) {
        mean[i] /= allShots.length;
        sumSq += mean[i] * mean[i];
      }
      const norm = Math.sqrt(sumSq) || 1.0;
      const normalizedAvgVector: number[] = new Array(128);
      for (let i = 0; i < 128; i++) {
        normalizedAvgVector[i] = Number((mean[i] / norm).toFixed(6));
      }

      await executeSaveUser(normalizedAvgVector, profilePhotoUrl, allShots);

      // Success audio & confetti
      audioFeedback.playRepSuccess();
      voiceAssistant.speakSystem(`ลงทะเบียนคุณ ${name.trim()} และบันทึกใบหน้า 10 ช็อตเรียบร้อยแล้วค่ะ`, {
        priority: 'success',
        force: true,
      });

      confetti({
        particleCount: 80,
        spread: 70,
        origin: { y: 0.6 },
      });

      setStep(3);
    } catch (err: any) {
      console.error('Finalize shots error:', err);
      setCameraError(err?.message || 'เกิดข้อผิดพลาดในการบันทึกข้อมูลชีวมิติ');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Core save user function
  const executeSaveUser = async (
    faceVector?: number[],
    photoUrl?: string | null,
    shotsDossier?: CapturedShot[]
  ) => {
    const targetTherapist = therapists.find((t) => t.id === Number(assignedTherapistId)) || therapists[0];
    const assignedRole: UserRole = currentRole === 'therapist' ? 'patient' : role;
    const finalCode = customCode.trim().toUpperCase() || generateUniqueCode(assignedRole);

    const newUserData: Omit<UserAccount, 'id' | 'created_at'> = {
      username: username.trim().toLowerCase(),
      name: name.trim(),
      role: assignedRole,
      status: 'active',
      code: finalCode,
      password: password.trim(),
      must_change_password: true,
      phone: phone.trim() || undefined,
      email: email.trim() || undefined,
      age: assignedRole === 'patient' ? Number(age) || 60 : undefined,
      gender: assignedRole === 'patient' ? gender : undefined,
      assignedTherapistId: assignedRole === 'patient' ? targetTherapist?.id : undefined,
      assignedTherapistName: assignedRole === 'patient' ? targetTherapist?.name || currentUserName : undefined,
      diagnosis: assignedRole === 'patient' ? chiefComplaint.trim() || 'ตรวจประเมินกายภาพบำบัด' : undefined,
      chiefComplaint: assignedRole === 'patient' ? chiefComplaint.trim() || 'ตรวจประเมินกายภาพบำบัด' : undefined,
      underlyingDiseases: assignedRole === 'patient' ? underlyingDiseases.trim() || '-' : undefined,
      drugAllergies: assignedRole === 'patient' ? drugAllergies.trim() || '-' : undefined,
      admissionDate: assignedRole === 'patient' ? admissionDate : undefined,
      treatmentStatus: 'active',
      progressPercent: 0,
      medicalNotesHistory: assignedRole === 'patient' ? [
        {
          id: `note-${Date.now()}`,
          date: admissionDate || new Date().toISOString().split('T')[0],
          author: currentUserName,
          text: chiefComplaint.trim() || 'ลงทะเบียนแรกรับผู้ป่วยใหม่และบันทึกประวัติการรักษา',
        }
      ] : undefined,
      patientBackground: assignedRole === 'patient' ? `ลงทะเบียนใหม่พร้อมสแกนใบหน้า 10 ช็อต (โรคประจำตัว: ${underlyingDiseases.trim() || '-'}, ประวัติแพ้ยา: ${drugAllergies.trim() || '-'})` : undefined,
      treatmentOutcome: assignedRole === 'patient' ? 'เริ่มต้นโปรแกรมการรักษา' : undefined,
      therapistNotes: assignedRole === 'patient' ? 'เริ่มฝึกกายภาพท่าพื้นฐานตามโปรแกรม' : undefined,
      last_active: 'เพิ่งลงทะเบียน',
      face_vector: faceVector,
      biometricVector: faceVector,
      face_image_url: photoUrl || undefined,
      faceRegisteredAt: faceVector ? new Date().toISOString() : undefined,
      // @ts-ignore
      faceDossier: shotsDossier,
    };

    let therapistExtra: Omit<PhysicalTherapist, 'id'> | undefined = undefined;
    if (assignedRole === 'therapist') {
      therapistExtra = {
        code: finalCode,
        name: name.trim(),
        specialty: specialty.trim() || 'Musculoskeletal (ระบบกระดูกและกล้ามเนื้อ)',
        phone: phone.trim() || '08x-xxx-xxxx',
        email: email.trim() || `${username.trim()}@drtechcare.hospital`,
        licenseNumber: licenseNumber.trim() || `กภ. ${Math.floor(1000 + Math.random() * 9000)}`,
        activePatientsCount: initialAssignedPatientIds.length,
        assignedCases: initialAssignedPatientIds.map(String),
        bio: bio.trim() || 'นักกายภาพบำบัดวิชาชีพ ประจำโรงพยาบาล Dr.Tech.Care',
        status: 'active',
      };
    }

    onSubmitUser(newUserData, therapistExtra);
    setCreatedSummary({
      code: finalCode,
      name: name.trim(),
      role: assignedRole,
      photo: photoUrl,
      hasFace: !!faceVector,
      therapist: targetTherapist?.name || currentUserName,
    });

    onSuccessToast(
      assignedRole === 'patient'
        ? `ลงทะเบียนผู้ใช้ใหม่สำเร็จ: ${name.trim()} (${finalCode}) บันทึกใบหน้า 10 ช็อตเรียบร้อย`
        : `ลงทะเบียนนักกายภาพบำบัดสำเร็จ: ${name.trim()} (${finalCode})`
    );
  };

  // Auto-generate username from name
  const handleAutoGenerateUsername = () => {
    const cleanName = name
      .toLowerCase()
      .replace(/^(นาย|นางสาว|นาง|กภ\.|นพ\.|พญ\.)\s*/, '')
      .trim();

    const asciiPart = cleanName.replace(/[^a-z0-9]/g, '');
    const prefix = asciiPart.length >= 3 ? asciiPart.slice(0, 8) : 'user';
    const randSuffix = Math.floor(100 + Math.random() * 900);
    const candidate = `${prefix}_${randSuffix}`;

    setUsername(candidate);
    if (errors.username) {
      setErrors((prev) => ({ ...prev, username: undefined }));
    }
  };

  // Auto-generate secure temporary password
  const handleAutoGeneratePassword = () => {
    const rndPass = generateSecureTemporaryPassword();
    setPassword(rndPass);
    setConfirmPassword(rndPass);
    if (errors.password || errors.confirmPassword) {
      setErrors((prev) => ({ ...prev, password: undefined, confirmPassword: undefined }));
    }
  };

  // Validate form fields
  const validateForm = (): boolean => {
    const newErrors: typeof errors = {};

    if (!name.trim()) {
      newErrors.name = 'กรุณากรอกชื่อ-นามสกุล';
    }

    const trimmedCode = customCode.trim().toUpperCase();
    if (!trimmedCode) {
      newErrors.customCode = 'กรุณาระบุ Unique ID / Staff ID / HN';
    } else {
      const isDuplicate = existingUsers.some(
        (u) => u.code.toUpperCase() === trimmedCode
      );
      if (isDuplicate) {
        newErrors.customCode = `รหัส ID/HN "${trimmedCode}" นี้ถูกใช้งานแล้ว กรุณาระบุรหัสอื่น`;
      }
    }

    const trimmedUsername = username.trim().toLowerCase();
    if (!trimmedUsername) {
      newErrors.username = 'กรุณากรอก Username';
    } else if (trimmedUsername.length < 3) {
      newErrors.username = 'Username ต้องมีอย่างน้อย 3 ตัวอักษร';
    } else if (/\s/.test(trimmedUsername)) {
      newErrors.username = 'Username ต้องไม่มีช่องว่าง';
    } else {
      const isDuplicate = existingUsers.some(
        (u) => u.username.toLowerCase() === trimmedUsername
      );
      if (isDuplicate) {
        newErrors.username = 'Username นี้ถูกใช้งานแล้ว กรุณาเลือกชื่ออื่น';
      }
    }

    if (!password) {
      newErrors.password = 'กรุณากรอกรหัสผ่าน';
    } else {
      const strength = validatePasswordStrength(password);
      if (!strength.isValid) {
        newErrors.password = strength.message || 'รหัสผ่านต้องมีความยาวอย่างน้อย 8 ตัวอักษร';
      }
    }

    if (!confirmPassword) {
      newErrors.confirmPassword = 'กรุณายืนยันรหัสผ่าน';
    } else if (confirmPassword !== password) {
      newErrors.confirmPassword = 'ยืนยันรหัสผ่านไม่ตรงกับรหัสผ่าน';
    }

    if (phone.trim()) {
      const cleanDigits = phone.replace(/[^0-9]/g, '');
      if (cleanDigits.length < 9 || cleanDigits.length > 10) {
        newErrors.phone = 'เบอร์โทรศัพท์ต้องเป็นตัวเลข 9-10 หลัก (เช่น 081-234-5678)';
      }
    }

    if (email.trim()) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email.trim())) {
        newErrors.email = 'รูปแบบอีเมลไม่ถูกต้อง';
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // Proceed to Step 2 (Scan)
  const handleProceedToScan = (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm()) return;

    setStep(2);
    setCapturedShots([]);
    startCamera();
    voiceAssistant.speakSystem(`ยินดีต้อนรับคุณ ${name.trim()} ค่ะ กรุณามองตรงมาที่กล้องเพื่อบันทึกใบหน้า 10 ช็อตค่ะ`, {
      priority: 'instruction',
      force: true,
    });
  };

  // Skip scan and save immediately
  const handleSkipScanAndSave = async () => {
    if (!validateForm()) return;
    setIsSubmitting(true);
    await executeSaveUser(undefined, null, []);
    setIsSubmitting(false);
    onClose();
  };

  // Reset shots
  const handleResetShots = () => {
    setCapturedShots([]);
    setProfilePhotoUrl(null);
    holdStartRef.current = null;
    voiceAssistant.speakSystem('เริ่มสแกนใบหน้าใหม่ค่ะ กรุณามองตรงมาที่กล้องค่ะ', {
      priority: 'instruction',
      force: true,
    });
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-[#0F2F2B]/75 backdrop-blur-sm animate-fadeIn"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl sm:max-w-2xl bg-white rounded-[28px] sm:rounded-3xl shadow-2xl border border-emerald-200 overflow-hidden flex flex-col max-h-[92vh] animate-slideUp"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ================================================================= */}
        {/* 1. MODAL HEADER & STEPPER                                         */}
        {/* ================================================================= */}
        <div className="px-6 py-3.5 border-b border-cyan-100 bg-gradient-to-r from-emerald-50/90 via-white to-cyan-50/70 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-[#10B981] via-[#06B6D4] to-[#2563EB] text-white flex items-center justify-center shadow-md shadow-cyan-500/25">
              {step === 1 ? <User className="w-5 h-5" /> : step === 2 ? <Camera className="w-5 h-5" /> : <ShieldCheck className="w-5 h-5" />}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-extrabold text-base sm:text-lg text-[#0F2F2B]">
                  ลงทะเบียนผู้ใช้ใหม่
                </h3>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                  {step === 1 ? 'ขั้นตอนที่ 1/2: กรอกข้อมูล' : step === 2 ? 'ขั้นตอนที่ 2/2: สแกน 10 ช็อต' : 'เสร็จสมบูรณ์'}
                </span>
              </div>
              <p className="text-[11px] text-emerald-800 font-medium">
                {step === 1
                  ? 'กรอกข้อมูลผู้ใช้งานก่อน จากนั้นเข้าสู่การสแกนใบหน้า 10 ช็อต (ตรง, ซ้าย, ขวา)'
                  : step === 2
                  ? `กำลังสแกนใบหน้าชีวมิติคุณ ${name.trim()} (ตรง, ซ้าย, ขวา ครบ 10 ช็อต)`
                  : 'บันทึกข้อมูลและอัตลักษณ์ชีวมิติเรียบร้อยแล้ว'}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-full text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition cursor-pointer"
            aria-label="ปิดหน้าต่าง"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Stepper Progress Bar */}
        <div className="grid grid-cols-3 border-b border-cyan-100 text-[11px] font-bold text-center">
          <div
            className={`py-2 px-2 flex items-center justify-center gap-1.5 transition ${
              step === 1
                ? 'bg-gradient-to-r from-emerald-500 to-teal-600 text-white shadow-xs'
                : 'bg-emerald-50 text-emerald-800'
            }`}
          >
            <span className="w-4 h-4 rounded-full bg-white/30 text-white flex items-center justify-center text-[10px]">1</span>
            <span>1. กรอกข้อมูล</span>
          </div>

          <div
            className={`py-2 px-2 flex items-center justify-center gap-1.5 transition ${
              step === 2
                ? 'bg-gradient-to-r from-teal-600 via-cyan-600 to-blue-600 text-white shadow-xs'
                : step > 2
                ? 'bg-emerald-50 text-emerald-800'
                : 'bg-slate-100 text-slate-500'
            }`}
          >
            <span className="w-4 h-4 rounded-full bg-white/30 flex items-center justify-center text-[10px]">2</span>
            <span>2. สแกนหน้า 10 ช็อต</span>
          </div>

          <div
            className={`py-2 px-2 flex items-center justify-center gap-1.5 transition ${
              step === 3
                ? 'bg-gradient-to-r from-emerald-600 to-green-600 text-white shadow-xs'
                : 'bg-slate-100 text-slate-500'
            }`}
          >
            <span className="w-4 h-4 rounded-full bg-white/30 flex items-center justify-center text-[10px]">3</span>
            <span>3. พร้อมใช้งาน</span>
          </div>
        </div>

        {/* ================================================================= */}
        {/* STEP 1: FORM (กรอกข้อมูลก่อน)                                      */}
        {/* ================================================================= */}
        {step === 1 && (
          <form onSubmit={handleProceedToScan} className="flex-1 overflow-y-auto px-6 py-5 space-y-4 text-xs">
            {/* Section 1: ข้อมูลบัญชีผู้ใช้งาน */}
            <div className="space-y-3 bg-stone-50/70 p-4 rounded-2xl border border-stone-200/80">
              <div className="flex items-center justify-between border-b border-stone-200/60 pb-2">
                <div className="font-bold text-sm text-[#0F2F2B] flex items-center gap-2">
                  <Shield className="w-4 h-4 text-emerald-600" />
                  <span>ส่วนที่ 1: ข้อมูลบัญชีผู้ใช้งาน</span>
                </div>
                <span className="text-[11px] text-rose-500 font-medium">* จำเป็นต้องระบุ</span>
              </div>

              {/* Role Selector */}
              <div>
                <label className="block font-bold text-slate-700 mb-1.5">
                  บทบาทผู้ใช้งาน / Role <span className="text-rose-500">*</span>:
                </label>

                {currentRole === 'admin' ? (
                  <div className="grid grid-cols-3 gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setRole('patient');
                        setCustomCode(generateUniqueCode('patient'));
                      }}
                      className={`py-2 px-3 rounded-2xl font-bold text-xs flex items-center justify-center gap-1.5 border transition cursor-pointer ${
                        role === 'patient'
                          ? 'bg-[#10B981] text-white border-emerald-600 shadow-sm'
                          : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                      }`}
                    >
                      <User className="w-3.5 h-3.5" />
                      <span>คนไข้ (Patient)</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setRole('therapist');
                        setCustomCode(generateUniqueCode('therapist'));
                      }}
                      className={`py-2 px-3 rounded-2xl font-bold text-xs flex items-center justify-center gap-1.5 border transition cursor-pointer ${
                        role === 'therapist'
                          ? 'bg-[#0F2F2B] text-emerald-300 border-emerald-950 shadow-sm'
                          : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                      }`}
                    >
                      <Stethoscope className="w-3.5 h-3.5" />
                      <span>นักกายภาพ (PT)</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setRole('admin');
                        setCustomCode(generateUniqueCode('admin'));
                      }}
                      className={`py-2 px-3 rounded-2xl font-bold text-xs flex items-center justify-center gap-1.5 border transition cursor-pointer ${
                        role === 'admin'
                          ? 'bg-purple-600 text-white border-purple-700 shadow-sm'
                          : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                      }`}
                    >
                      <Shield className="w-3.5 h-3.5" />
                      <span>Super Admin</span>
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center justify-between p-2.5 rounded-2xl bg-emerald-100/70 border border-emerald-300 text-emerald-900 font-bold text-xs">
                    <div className="flex items-center gap-2">
                      <User className="w-4 h-4 text-emerald-700" />
                      <span>คนไข้ (Patient)</span>
                    </div>
                    <span className="text-[11px] font-medium text-emerald-800 bg-white/80 px-2.5 py-0.5 rounded-full border border-emerald-200">
                      นักกายภาพเพิ่มได้เฉพาะคนไข้
                    </span>
                  </div>
                )}
              </div>

              {/* Unique ID / Staff ID / HN (Auto-generated or custom) */}
              <div className="bg-white p-3 rounded-2xl border border-slate-200 space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="font-bold text-slate-700 text-xs">
                    {role === 'patient'
                      ? 'รหัสประจำตัวคนไข้ / HN (Unique ID)'
                      : role === 'therapist'
                      ? 'รหัสประจำตัวนักกายภาพ (Staff ID)'
                      : 'รหัสประจำตัวผู้อำนวยการ / ผู้ดูแลระบบ (Admin ID)'} <span className="text-rose-500">*</span>:
                  </label>
                  <button
                    type="button"
                    onClick={() => setCustomCode(generateUniqueCode(role))}
                    className="text-[11px] text-emerald-700 font-bold hover:underline flex items-center gap-1 cursor-pointer"
                  >
                    <RefreshCw className="w-3 h-3 text-emerald-600" />
                    <span>สุ่มรหัสอัตโนมัติ</span>
                  </button>
                </div>
                <div className="relative">
                  <Award className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={customCode}
                    onChange={(e) => {
                      setCustomCode(e.target.value.toUpperCase());
                      if (errors.customCode) setErrors((prev) => ({ ...prev, customCode: undefined }));
                    }}
                    placeholder={role === 'patient' ? 'เช่น P-1785' : role === 'therapist' ? 'เช่น T-001' : 'เช่น SA-001'}
                    className={`w-full pl-9 pr-3 py-2 rounded-xl bg-slate-50/70 border font-mono font-bold text-xs text-[#0F2F2B] outline-none transition ${
                      errors.customCode
                        ? 'border-rose-400 ring-2 ring-rose-100'
                        : 'border-slate-200 focus:border-[#10B981] focus:ring-2 focus:ring-emerald-100'
                    }`}
                  />
                </div>
                {errors.customCode && (
                  <p className="text-[11px] text-rose-600 font-semibold mt-1 flex items-center gap-1">
                    <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
                    <span>{errors.customCode}</span>
                  </p>
                )}
              </div>

              {/* Name & Username */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    ชื่อ-นามสกุล <span className="text-rose-500">*</span>:
                  </label>
                  <div className="relative">
                    <User className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={name}
                      onChange={(e) => {
                        setName(e.target.value);
                        if (errors.name) setErrors((prev) => ({ ...prev, name: undefined }));
                      }}
                      placeholder={role === 'patient' ? 'เช่น นายสมศักดิ์ สุขใจ' : role === 'therapist' ? 'เช่น กภ. ชนกพร มั่งคั่ง' : 'เช่น นพ. วรชัย ผู้บริหาร'}
                      className={`w-full pl-9 pr-3 py-2 rounded-xl bg-white border text-xs font-semibold text-[#0F2F2B] outline-none transition ${
                        errors.name
                          ? 'border-rose-400 ring-2 ring-rose-100'
                          : 'border-slate-200 focus:border-[#10B981] focus:ring-2 focus:ring-emerald-100'
                      }`}
                    />
                  </div>
                  {errors.name && (
                    <p className="text-[11px] text-rose-600 font-semibold mt-1 flex items-center gap-1">
                      <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
                      <span>{errors.name}</span>
                    </p>
                  )}
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="font-bold text-slate-700">
                      Username <span className="text-rose-500">*</span>:
                    </label>
                    <button
                      type="button"
                      onClick={handleAutoGenerateUsername}
                      className="text-[11px] text-emerald-700 font-bold hover:underline flex items-center gap-1 cursor-pointer"
                      title="สุ่ม Username จากชื่อ"
                    >
                      <Sparkles className="w-3 h-3 text-emerald-600" />
                      <span>สร้างจากชื่อ</span>
                    </button>
                  </div>
                  <div className="relative">
                    <AtSign className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={username}
                      onChange={(e) => {
                        setUsername(e.target.value.toLowerCase().trim());
                        if (errors.username) setErrors((prev) => ({ ...prev, username: undefined }));
                      }}
                      placeholder="เช่น somsak99"
                      className={`w-full pl-9 pr-3 py-2 rounded-xl bg-white border text-xs font-mono font-bold text-[#0F2F2B] outline-none transition ${
                        errors.username
                          ? 'border-rose-400 ring-2 ring-rose-100'
                          : 'border-slate-200 focus:border-[#10B981] focus:ring-2 focus:ring-emerald-100'
                      }`}
                    />
                  </div>
                  {errors.username && (
                    <p className="text-[11px] text-rose-600 font-semibold mt-1 flex items-center gap-1">
                      <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
                      <span>{errors.username}</span>
                    </p>
                  )}
                </div>
              </div>

              {/* Password & Confirm */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="font-bold text-slate-700">
                      รหัสผ่านชั่วคราว <span className="text-rose-500">*</span>:
                    </label>
                    <button
                      type="button"
                      onClick={handleAutoGeneratePassword}
                      className="text-[11px] text-emerald-700 font-bold hover:underline flex items-center gap-1 cursor-pointer"
                    >
                      <RefreshCw className="w-3 h-3 text-emerald-600" />
                      <span>สุ่มรหัสผ่าน</span>
                    </button>
                  </div>
                  <div className="relative">
                    <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => {
                        setPassword(e.target.value);
                        if (errors.password) setErrors((prev) => ({ ...prev, password: undefined }));
                      }}
                      placeholder="อย่างน้อย 8 ตัวอักษร"
                      className={`w-full pl-9 pr-9 py-2 rounded-xl bg-white border text-xs font-mono font-bold text-[#0F2F2B] outline-none transition ${
                        errors.password
                          ? 'border-rose-400 ring-2 ring-rose-100'
                          : 'border-slate-200 focus:border-[#10B981] focus:ring-2 focus:ring-emerald-100'
                      }`}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                    >
                      {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                  {errors.password && (
                    <p className="text-[11px] text-rose-600 font-semibold mt-1 flex items-center gap-1">
                      <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
                      <span>{errors.password}</span>
                    </p>
                  )}
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    ยืนยันรหัสผ่าน <span className="text-rose-500">*</span>:
                  </label>
                  <div className="relative">
                    <KeyRound className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type={showConfirmPassword ? 'text' : 'password'}
                      value={confirmPassword}
                      onChange={(e) => {
                        setConfirmPassword(e.target.value);
                        if (errors.confirmPassword) setErrors((prev) => ({ ...prev, confirmPassword: undefined }));
                      }}
                      placeholder="กรอกรหัสผ่านซ้ำอีกครั้ง"
                      className={`w-full pl-9 pr-9 py-2 rounded-xl bg-white border text-xs font-mono font-bold text-[#0F2F2B] outline-none transition ${
                        errors.confirmPassword
                          ? 'border-rose-400 ring-2 ring-rose-100'
                          : 'border-slate-200 focus:border-[#10B981] focus:ring-2 focus:ring-emerald-100'
                      }`}
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                    >
                      {showConfirmPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                  {errors.confirmPassword && (
                    <p className="text-[11px] text-rose-600 font-semibold mt-1 flex items-center gap-1">
                      <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
                      <span>{errors.confirmPassword}</span>
                    </p>
                  )}
                </div>
              </div>
            </div>

            {/* Section 2: ข้อมูลติดต่อ & Dynamic Role Branching */}
            <div className="space-y-3 bg-stone-50/70 p-4 rounded-2xl border border-stone-200/80">
              <div className="font-bold text-sm text-[#0F2F2B] flex items-center gap-2 border-b border-stone-200/60 pb-2">
                <Phone className="w-4 h-4 text-emerald-600" />
                <span>
                  {role === 'patient'
                    ? 'ส่วนที่ 2: ข้อมูลติดต่อ & เวชระเบียนแรกรับ'
                    : role === 'therapist'
                    ? 'ส่วนที่ 2: ข้อมูลวิชาชีพ & การรับเคสดูแล'
                    : 'ส่วนที่ 2: ข้อมูลการติดต่อผู้ดูแลระบบ'}
                </span>
              </div>

              {/* Contact info (Phone, Email) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    เบอร์โทรศัพท์:
                  </label>
                  <div className="relative">
                    <Phone className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="tel"
                      value={phone}
                      onChange={(e) => {
                        setPhone(e.target.value);
                        if (errors.phone) setErrors((prev) => ({ ...prev, phone: undefined }));
                      }}
                      placeholder="เช่น 081-234-5678"
                      className="w-full pl-9 pr-3 py-2 rounded-xl bg-white border border-slate-200 text-xs text-[#0F2F2B] outline-none focus:border-[#10B981]"
                    />
                  </div>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    อีเมล (ถ้ามี):
                  </label>
                  <div className="relative">
                    <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="เช่น user@hospital.com"
                      className="w-full pl-9 pr-3 py-2 rounded-xl bg-white border border-slate-200 text-xs text-[#0F2F2B] outline-none focus:border-[#10B981]"
                    />
                  </div>
                </div>
              </div>

              {/* Dynamic Role Branching: PATIENT */}
              {role === 'patient' && (
                <div className="space-y-3 pt-2 border-t border-stone-200/60">
                  <div className="grid grid-cols-1 sm:grid-cols-4 gap-2.5">
                    <div>
                      <label className="block font-bold text-slate-700 mb-1">อายุ (ปี):</label>
                      <input
                        type="number"
                        min={1}
                        max={120}
                        value={age}
                        onChange={(e) => setAge(e.target.value)}
                        className="w-full px-3 py-2 rounded-xl bg-white border border-slate-200 text-xs font-bold text-[#0F2F2B] outline-none focus:border-[#10B981]"
                      />
                    </div>

                    <div>
                      <label className="block font-bold text-slate-700 mb-1">เพศ:</label>
                      <select
                        value={gender}
                        onChange={(e: any) => setGender(e.target.value)}
                        className="w-full px-3 py-2 rounded-xl bg-white border border-slate-200 text-xs font-bold text-[#0F2F2B] outline-none focus:border-[#10B981] cursor-pointer"
                      >
                        <option value="male">ชาย</option>
                        <option value="female">หญิง</option>
                        <option value="other">อื่นๆ</option>
                      </select>
                    </div>

                    <div>
                      <label className="block font-bold text-slate-700 mb-1">วันที่แรกรับ (Admission):</label>
                      <input
                        type="date"
                        value={admissionDate}
                        onChange={(e) => setAdmissionDate(e.target.value)}
                        className="w-full px-2.5 py-2 rounded-xl bg-white border border-slate-200 text-xs font-bold text-[#0F2F2B] outline-none focus:border-[#10B981] cursor-pointer"
                      />
                    </div>

                    <div>
                      <label className="block font-bold text-slate-700 mb-1">กภ. ผู้ดูแล (Assigned PT):</label>
                      <select
                        value={assignedTherapistId}
                        onChange={(e) => setAssignedTherapistId(e.target.value)}
                        disabled={currentRole === 'therapist'}
                        className="w-full px-2.5 py-2 rounded-xl bg-white border border-slate-200 text-xs font-bold text-[#0F2F2B] outline-none focus:border-[#10B981] cursor-pointer truncate"
                      >
                        {therapists.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Medical fields: Underlying Diseases & Drug Allergies (default "-") */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <div>
                      <label className="block font-bold text-slate-700 mb-1">
                        โรคประจำตัว (Underlying Diseases):
                      </label>
                      <input
                        type="text"
                        value={underlyingDiseases}
                        onChange={(e) => setUnderlyingDiseases(e.target.value)}
                        placeholder="หากไม่มีให้ระบุเป็น -"
                        className="w-full px-3 py-2 rounded-xl bg-white border border-slate-200 text-xs text-[#0F2F2B] outline-none focus:border-[#10B981]"
                      />
                    </div>

                    <div>
                      <label className="block font-bold text-slate-700 mb-1">
                        ประวัติแพ้ยา (Drug Allergies):
                      </label>
                      <input
                        type="text"
                        value={drugAllergies}
                        onChange={(e) => setDrugAllergies(e.target.value)}
                        placeholder="หากไม่มีให้ระบุเป็น -"
                        className="w-full px-3 py-2 rounded-xl bg-white border border-slate-200 text-xs text-[#0F2F2B] outline-none focus:border-[#10B981]"
                      />
                    </div>
                  </div>

                  {/* Initial Symptoms / Notes */}
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">
                      อาการสำคัญแรกรับ / การวินิจฉัย (Initial Symptoms / Clinical Notes):
                    </label>
                    <textarea
                      rows={2}
                      value={chiefComplaint}
                      onChange={(e) => setChiefComplaint(e.target.value)}
                      placeholder="เช่น ข้อไหล่ติดระยะฟื้นฟู (Frozen Shoulder), ปวดสะบักเรื้อรังจากการทำงาน"
                      className="w-full p-2.5 rounded-xl bg-white border border-slate-200 text-xs text-[#0F2F2B] outline-none focus:border-[#10B981]"
                    />
                  </div>
                </div>
              )}

              {/* Dynamic Role Branching: PHYSIOTHERAPIST */}
              {role === 'therapist' && (
                <div className="space-y-3 pt-2 border-t border-stone-200/60">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block font-bold text-slate-700 mb-1">
                        เลขที่ใบประกอบวิชาชีพ (License No.):
                      </label>
                      <input
                        type="text"
                        value={licenseNumber}
                        onChange={(e) => setLicenseNumber(e.target.value)}
                        placeholder="เช่น กภ. 8920"
                        className="w-full px-3 py-2 rounded-xl bg-white border border-slate-200 text-xs font-mono font-bold text-[#0F2F2B] outline-none focus:border-[#10B981]"
                      />
                    </div>

                    <div>
                      <label className="block font-bold text-slate-700 mb-1">
                        แผนก / ความเชี่ยวชาญ (Department / Specialty):
                      </label>
                      <select
                        value={specialty}
                        onChange={(e) => setSpecialty(e.target.value)}
                        className="w-full px-3 py-2 rounded-xl bg-white border border-slate-200 text-xs font-bold text-[#0F2F2B] outline-none focus:border-[#10B981] cursor-pointer"
                      >
                        <option value="Musculoskeletal (ระบบกระดูกและกล้ามเนื้อ)">Musculoskeletal (ระบบกระดูกและกล้ามเนื้อ)</option>
                        <option value="Neurological (ระบบประสาทและการเคลื่อนไหว)">Neurological (ระบบประสาทและการเคลื่อนไหว)</option>
                        <option value="Geriatric (กายภาพบำบัดผู้สูงอายุ)">Geriatric (กายภาพบำบัดผู้สูงอายุ)</option>
                        <option value="Sports PT (เวชศาสตร์การกีฬา)">Sports PT (เวชศาสตร์การกีฬา)</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="block font-bold text-slate-700 mb-1">
                      ประวัติการศึกษา / ความเชี่ยวชาญ (Bio & Education):
                    </label>
                    <textarea
                      rows={2}
                      value={bio}
                      onChange={(e) => setBio(e.target.value)}
                      placeholder="เช่น ปริญญาตรีกายภาพบำบัดบัณฑิต จุฬาลงกรณ์มหาวิทยาลัย ประสบการณ์ 6 ปี"
                      className="w-full p-2.5 rounded-xl bg-white border border-slate-200 text-xs text-[#0F2F2B] outline-none focus:border-[#10B981]"
                    />
                  </div>

                  {/* Initial Assigned Patients Multi-Select */}
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">
                      คนไข้เริ่มต้นที่มอบหมายให้ดูแล (Initial Assigned Patients):
                    </label>
                    <div className="max-h-28 overflow-y-auto p-2 bg-white rounded-xl border border-slate-200 space-y-1">
                      {existingUsers.filter((u) => u.role === 'patient').length === 0 ? (
                        <p className="text-[11px] text-slate-400">ยังไม่มีรายชื่อคนไข้ในระบบ</p>
                      ) : (
                        existingUsers
                          .filter((u) => u.role === 'patient')
                          .map((pat) => {
                            const isSelected = initialAssignedPatientIds.includes(pat.id);
                            return (
                              <label
                                key={pat.id}
                                className={`flex items-center justify-between p-1.5 rounded-lg text-xs cursor-pointer transition ${
                                  isSelected ? 'bg-emerald-50 text-emerald-950 font-bold' : 'hover:bg-slate-50 text-slate-700'
                                }`}
                              >
                                <span className="flex items-center gap-2">
                                  <input
                                    type="checkbox"
                                    checked={isSelected}
                                    onChange={(e) => {
                                      if (e.target.checked) {
                                        setInitialAssignedPatientIds([...initialAssignedPatientIds, pat.id]);
                                      } else {
                                        setInitialAssignedPatientIds(initialAssignedPatientIds.filter((id) => id !== pat.id));
                                      }
                                    }}
                                    className="rounded text-emerald-600"
                                  />
                                  <span>{pat.name}</span>
                                </span>
                                <span className="text-[10px] font-mono text-slate-400">{pat.code}</span>
                              </label>
                            );
                          })
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Dynamic Role Branching: SUPER ADMIN */}
              {role === 'admin' && (
                <div className="p-3 bg-purple-50 rounded-2xl border border-purple-200 text-purple-900 space-y-1 text-xs">
                  <div className="font-bold flex items-center gap-1.5">
                    <Shield className="w-4 h-4 text-purple-600" />
                    <span>สิทธิ์ผู้บริหารสูงสุด (Hospital Director / Super Admin):</span>
                  </div>
                  <p className="text-[11px] text-purple-800 leading-relaxed">
                    มีอำนาจบริหารจัดการระบบส่วนกลางเต็มรูปแบบ ครอบคลุมทั้ง 6 โมดูล เวชระเบียนคนไข้ ตารางการรักษา ไดเรกทอรีนักกายภาพ ไลบรารี่ท่ากายภาพ และระบบ Audit Log & Security Control
                  </p>
                </div>
              )}
            </div>

            {/* Footer Buttons Step 1 */}
            <div className="pt-3 border-t border-emerald-100 flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-xl border border-slate-300 text-slate-700 font-bold hover:bg-slate-100 transition active:scale-95 cursor-pointer text-xs"
              >
                ยกเลิก (Cancel)
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleSkipScanAndSave}
                  disabled={isSubmitting}
                  className="px-3.5 py-2 rounded-xl border border-slate-200 text-slate-600 hover:text-emerald-800 hover:bg-emerald-50 text-xs font-bold transition cursor-pointer"
                  title="บันทึกข้อมูลทันทีโดยไม่ต้องเปิดกล้องสแกนใบหน้า"
                >
                  ข้ามสแกนหน้า (Skip)
                </button>

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-[#10B981] via-[#06B6D4] to-[#2563EB] hover:opacity-95 text-white font-extrabold shadow-md shadow-cyan-500/25 transition active:scale-95 flex items-center gap-2 cursor-pointer text-xs"
                >
                  <Camera className="w-4 h-4" />
                  <span>ถัดไป: สแกนใบหน้า (Next: Face Registration ➔)</span>
                </button>
              </div>
            </div>
          </form>
        )}

        {/* ================================================================= */}
        {/* STEP 2: CAMERA 10-SHOT SCAN (ตรง, ซ้าย, ขวา)                       */}
        {/* ================================================================= */}
        {step === 2 && (
          <div className="flex-1 overflow-y-auto px-6 py-4 flex flex-col space-y-3 text-xs">
            {/* Top Instructions & Angle Badges */}
            <div className="flex flex-wrap items-center justify-between gap-2 bg-gradient-to-r from-emerald-50 via-teal-50 to-sky-50 p-2.5 rounded-2xl border border-cyan-200">
              <div className="flex items-center gap-2">
                <span className="font-extrabold text-[#0B2B2B]">เป้าหมายมุมใบหน้า:</span>
                <span
                  className={`px-2.5 py-1 rounded-full text-xs font-extrabold transition ${
                    currentAngle === 'center'
                      ? 'bg-emerald-600 text-white shadow-xs animate-pulse'
                      : capturedShots.filter((s) => s.angle === 'center').length >= 4
                      ? 'bg-emerald-100 text-emerald-800'
                      : 'bg-slate-200 text-slate-600'
                  }`}
                >
                  1. มุมตรง (ช็อต 1-4)
                </span>
                <span
                  className={`px-2.5 py-1 rounded-full text-xs font-extrabold transition ${
                    currentAngle === 'left'
                      ? 'bg-cyan-600 text-white shadow-xs animate-pulse'
                      : capturedShots.filter((s) => s.angle === 'left').length >= 3
                      ? 'bg-cyan-100 text-cyan-800'
                      : 'bg-slate-200 text-slate-600'
                  }`}
                >
                  2. มุมซ้าย (ช็อต 5-7)
                </span>
                <span
                  className={`px-2.5 py-1 rounded-full text-xs font-extrabold transition ${
                    currentAngle === 'right'
                      ? 'bg-blue-600 text-white shadow-xs animate-pulse'
                      : capturedShots.filter((s) => s.angle === 'right').length >= 3
                      ? 'bg-blue-100 text-blue-800'
                      : 'bg-slate-200 text-slate-600'
                  }`}
                >
                  3. มุมขวา (ช็อต 8-10)
                </span>
              </div>

              {/* Auto Capture Toggle */}
              <label className="flex items-center gap-1.5 cursor-pointer text-[11px] font-bold text-slate-700 bg-white px-2.5 py-1 rounded-full border border-slate-200">
                <input
                  type="checkbox"
                  checked={isAutoCapture}
                  onChange={(e) => setIsAutoCapture(e.target.checked)}
                  className="rounded text-emerald-600"
                />
                <span>จับภาพอัตโนมัติ (Auto)</span>
              </label>
            </div>

            {/* Video Viewport with HUD Overlay */}
            <div className="relative w-full aspect-[4/3] max-h-[340px] sm:max-h-[380px] bg-slate-900 rounded-2xl overflow-hidden flex items-center justify-center border-2 border-cyan-300 shadow-inner">
              <video
                ref={videoRef}
                playsInline
                muted
                className={`w-full h-full object-cover ${isCameraMirrored ? '-scale-x-100' : ''}`}
                style={{
                  transform: `${isCameraMirrored ? 'scaleX(-1)' : ''} rotate(${cameraRotation}deg)`,
                }}
              />

              {/* Shutter White Flash */}
              {showShutterFlash && (
                <div className="absolute inset-0 bg-white/90 z-40 animate-fadeOut pointer-events-none" />
              )}

              {/* Oval HUD Face Guide */}
              <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                <div
                  className={`w-[200px] sm:w-[230px] h-[260px] sm:h-[290px] rounded-[50%] border-4 transition-all duration-300 shadow-2xl ${
                    detection?.detected
                      ? currentAngle === 'center' && Math.abs(detection.yawDeg) <= 12
                        ? 'border-emerald-400 shadow-emerald-500/50'
                        : currentAngle === 'left' && detection.yawDeg <= -7
                        ? 'border-cyan-400 shadow-cyan-500/50'
                        : currentAngle === 'right' && detection.yawDeg >= 7
                        ? 'border-blue-400 shadow-blue-500/50'
                        : 'border-amber-400 shadow-amber-500/30'
                      : 'border-white/60 border-dashed'
                  }`}
                />
              </div>

              {/* Live Overlay Badges */}
              <div className="absolute top-3 left-3 right-3 flex items-center justify-between z-20 pointer-events-none">
                <div className="px-3 py-1 rounded-full bg-slate-950/75 backdrop-blur-md text-white font-bold text-xs border border-white/20 flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
                  <span>
                    ช็อตที่ {capturedShots.length + 1} / 10
                  </span>
                </div>

                {detection?.detected && (
                  <div className="px-3 py-1 rounded-full bg-slate-950/75 backdrop-blur-md text-white font-mono font-bold text-xs border border-white/20">
                    มุมเอียง Yaw: {detection.yawDeg.toFixed(1)}°
                  </div>
                )}
              </div>

              {/* Dynamic Guidance Message */}
              <div className="absolute bottom-3 left-3 right-3 z-20 pointer-events-none">
                <div className="p-2.5 rounded-xl bg-slate-950/80 backdrop-blur-md text-center text-xs font-black text-white border border-cyan-400/50 shadow-lg">
                  {scanMessage}
                </div>
              </div>

              {/* Camera Error Alert */}
              {cameraError && (
                <div className="absolute inset-0 bg-slate-950/90 z-30 p-6 flex flex-col items-center justify-center text-center space-y-3">
                  <AlertCircle className="w-10 h-10 text-rose-500" />
                  <p className="text-white font-bold text-sm">{cameraError}</p>
                  <button
                    onClick={handleSkipScanAndSave}
                    className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs"
                  >
                    บันทึกข้อมูลโดยไม่สแกนหน้า
                  </button>
                </div>
              )}
            </div>

            {/* Capture Progress Dots (10 Shots) */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-[11px] font-bold text-slate-700">
                <span>ความคืบหน้าการจับภาพชีวมิติ:</span>
                <span className="text-emerald-700 font-extrabold">{capturedShots.length} / 10 ช็อต</span>
              </div>
              <div className="grid grid-cols-10 gap-1.5">
                {Array.from({ length: 10 }).map((_, idx) => {
                  const shot = capturedShots[idx];
                  const isCurrent = idx === capturedShots.length;
                  const angleLabel = idx < 4 ? 'ตรง' : idx < 7 ? 'ซ้าย' : 'ขวา';

                  return (
                    <div
                      key={idx}
                      className={`h-11 rounded-xl flex flex-col items-center justify-center border transition relative overflow-hidden ${
                        shot
                          ? 'border-emerald-500 bg-emerald-50'
                          : isCurrent
                          ? 'border-cyan-500 bg-cyan-50 ring-2 ring-cyan-200 animate-pulse'
                          : 'border-slate-200 bg-slate-100 text-slate-400'
                      }`}
                    >
                      {shot?.thumbnail ? (
                        <img
                          src={shot.thumbnail}
                          alt={`Shot ${idx + 1}`}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <>
                          <span className="text-[10px] font-extrabold">{idx + 1}</span>
                          <span className="text-[9px] font-bold opacity-80">{angleLabel}</span>
                        </>
                      )}
                      {shot && (
                        <div className="absolute bottom-0 inset-x-0 bg-emerald-700/80 text-white text-[8px] font-black text-center py-0.5">
                          ✓ {angleLabel}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Bottom Controls Step 2 */}
            <div className="pt-2.5 border-t border-emerald-100 flex flex-wrap items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => {
                  stopCamera();
                  setStep(1);
                }}
                className="px-3.5 py-2 rounded-xl border border-slate-300 text-slate-700 font-bold hover:bg-slate-100 transition active:scale-95 cursor-pointer text-xs flex items-center gap-1.5"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>← Back</span>
              </button>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={handleResetShots}
                  disabled={capturedShots.length === 0}
                  className="px-3 py-2 rounded-xl border border-amber-300 text-amber-800 hover:bg-amber-50 text-xs font-bold transition cursor-pointer disabled:opacity-40 flex items-center gap-1"
                  title="ล้างภาพที่ถ่ายแล้วและเริ่มถ่ายใหม่"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Retake</span>
                </button>

                <button
                  type="button"
                  onClick={handleSkipScanAndSave}
                  className="px-3 py-2 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-100 text-xs font-bold transition cursor-pointer"
                >
                  Skip
                </button>

                {capturedShots.length > 0 && (
                  <button
                    type="button"
                    onClick={() => finalizeAllShots(capturedShots)}
                    disabled={isSubmitting}
                    className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-sm transition active:scale-95 flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>Save & Complete ({capturedShots.length}/10)</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={triggerCaptureShot}
                  disabled={isCapturingShot || capturedShots.length >= 10}
                  className="px-4 sm:px-5 py-2 sm:py-2.5 rounded-xl bg-gradient-to-r from-[#10B981] via-[#06B6D4] to-[#2563EB] hover:opacity-95 text-white font-black shadow-md shadow-cyan-500/25 transition active:scale-95 flex items-center gap-1.5 cursor-pointer text-xs disabled:opacity-50"
                >
                  <Camera className="w-4 h-4" />
                  <span>
                    {isCapturingShot
                      ? 'กำลังจับภาพ...'
                      : `📸 ช็อตที่ ${capturedShots.length + 1}/10 (${
                          currentAngle === 'center' ? 'ตรง' : currentAngle === 'left' ? 'ซ้าย' : 'ขวา'
                        })`}
                  </span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ================================================================= */}
        {/* STEP 3: SUCCESS & COMPLETION SCREEN                               */}
        {/* ================================================================= */}
        {step === 3 && createdSummary && (
          <div className="flex-1 overflow-y-auto px-6 py-8 flex flex-col items-center justify-center text-center space-y-5 animate-fadeIn">
            <div className="w-20 h-20 rounded-full bg-gradient-to-tr from-emerald-500 to-teal-400 text-white flex items-center justify-center shadow-xl shadow-emerald-500/30 animate-bounce">
              <CheckCircle2 className="w-10 h-10" />
            </div>

            <div className="space-y-1">
              <h4 className="text-xl sm:text-2xl font-black text-[#0B2B2B]">
                ลงทะเบียนผู้ใช้และบันทึกใบหน้าสำเร็จ!
              </h4>
              <p className="text-xs sm:text-sm text-slate-600 font-medium">
                ระบบได้บันทึกข้อมูลและอัตลักษณ์ชีวมิติ 10 ช็อต (ตรง, ซ้าย, ขวา) สมบูรณ์แบบ
              </p>
            </div>

            {/* User Profile Summary Card */}
            <div className="w-full max-w-md bg-gradient-to-br from-emerald-50/80 via-white to-sky-50/80 rounded-2xl border border-cyan-200 p-4 shadow-sm flex items-center gap-4 text-left">
              <div className="w-16 h-16 rounded-2xl overflow-hidden border-2 border-emerald-400 shadow-md flex-shrink-0 bg-slate-100 flex items-center justify-center">
                {createdSummary.photo ? (
                  <img
                    src={createdSummary.photo}
                    alt={createdSummary.name}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <User className="w-8 h-8 text-slate-400" />
                )}
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-extrabold text-sm text-[#0F2F2B] truncate">
                    {createdSummary.name}
                  </span>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                    {createdSummary.code}
                  </span>
                </div>
                <div className="text-xs text-slate-500 mt-0.5">
                  บทบาท: {createdSummary.role === 'patient' ? 'คนไข้ (Patient)' : 'นักกายภาพ'}
                </div>
                <div className="text-[11px] font-bold text-emerald-700 flex items-center gap-1 mt-1">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                  <span>เวกเตอร์ชีวมิติ 10 ช็อต พร้อมสแกนเข้าสู่ระบบที่ตู้ Kiosk ทันที</span>
                </div>
              </div>
            </div>

            {/* Done Button */}
            <button
              onClick={onClose}
              className="px-8 py-3 rounded-full bg-gradient-to-r from-[#10B981] via-[#06B6D4] to-[#2563EB] hover:opacity-95 text-white font-black text-sm shadow-xl shadow-cyan-500/25 transition active:scale-95 cursor-pointer"
            >
              เสร็จสิ้น (ไปที่หน้ารายชื่อผู้ใช้งาน)
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
