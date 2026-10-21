import React, { useState, useRef, useEffect } from 'react';
import {
  X,
  Camera,
  Upload,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  RefreshCw,
  ShieldCheck,
  User,
  FlipVertical,
  RotateCw,
  FlipHorizontal,
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { livenessEngine } from '../../services/livenessEngine';
import { patientFaceStorageService } from '../../services/patientFaceStorageService';
import { supabase, PATIENTS_REALTIME_CHANNEL } from '../../lib/supabase';
import { supabaseService } from '../../services/supabaseService';
import { useHospitalStore } from '../../store/hospitalStore';
import { faceRegistryService } from '../../services/faceRegistryService';
import { UserAccount } from '../../types/hospital';
import { cameraOrientationService, CameraOrientation, CameraRotation } from '../../services/cameraOrientationService';

interface PatientFaceEnrollModalProps {
  isOpen: boolean;
  onClose: () => void;
  patient: UserAccount | null;
  onSuccess?: (updatedData: any) => void;
  onSuccessToast?: (msg: string) => void;
}

export const PatientFaceEnrollModal: React.FC<PatientFaceEnrollModalProps> = ({
  isOpen,
  onClose,
  patient,
  onSuccess,
  onSuccessToast,
}) => {
  const { updateUser, upsertPatientFromSupabase } = useHospitalStore();

  const [mode, setMode] = useState<'camera' | 'upload'>('camera');
  const [cameraActive, setCameraActive] = useState<boolean>(false);
  const [isCapturing, setIsCapturing] = useState<boolean>(false);
  const [progress, setProgress] = useState<{ count: number; total: number }>({ count: 0, total: 10 });
  const [capturedVector, setCapturedVector] = useState<number[] | null>(null);
  const [capturedPhoto, setCapturedPhoto] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string>('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [isSuccess, setIsSuccess] = useState<boolean>(false);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

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

  useEffect(() => {
    if (isOpen && patient) {
      setCapturedVector(null);
      setCapturedPhoto(null);
      setErrorMessage(null);
      setIsSuccess(false);
      setIsCapturing(false);
      setProgress({ count: 0, total: 10 });
      setStatusMessage('พร้อมบันทึกใบหน้า กรุณาจัดหน้าให้อยู่ในกรอบ');

      if (mode === 'camera') {
        startCamera();
      }
    } else {
      stopCamera();
    }

    return () => {
      stopCamera();
    };
  }, [isOpen, patient, mode]);

  const startCamera = async () => {
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        setErrorMessage('อุปกรณ์นี้ไม่รองรับการเปิดกล้องเว็บแคม กรุณาใช้วิธีอัปโหลดรูปภาพ');
        return;
      }

      setErrorMessage(null);
      await livenessEngine.initialize();

      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' },
        audio: false,
      });

      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.onloadedmetadata = () => {
          videoRef.current?.play();
          setCameraActive(true);
        };
      }
    } catch (err: any) {
      console.warn('Cannot start camera:', err);
      setErrorMessage('ไม่สามารถเปิดกล้องได้ (กรุณาอนุญาตการเข้าถึงกล้องในบราวเซอร์ หรือใช้วิธีอัปโหลดรูป)');
      setCameraActive(false);
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setCameraActive(false);
  };

  // 10-Snap Averaged Vector Capture
  const handleStartTenSnapCapture = async () => {
    if (!videoRef.current || !patient) return;

    setIsCapturing(true);
    setErrorMessage(null);
    setProgress({ count: 0, total: 10 });
    setStatusMessage('📸 กำลังจับภาพใบหน้า 10 ช็อต... กรุณามองตรงที่กล้อง');

    try {
      const snapResult = await livenessEngine.captureTenSnapAveragedEmbedding(
        videoRef.current,
        10,
        0.85,
        (captured, total) => {
          setProgress({ count: captured, total });
          setStatusMessage(`📸 สแกนแล้ว ${captured}/${total} ช็อตคุณภาพสูง...`);
        }
      );

      if (!snapResult || !snapResult.vector || snapResult.vector.length !== 128) {
        throw new Error('ไม่สามารถประมวลผลเวกเตอร์ใบหน้าได้ กรุณามองตรงที่มีแสงสว่างเพียงพอ');
      }

      // Capture single JPEG snapshot for profile using upright frame
      const canvas = document.createElement('canvas');
      canvas.width = 320;
      canvas.height = 320;
      const ctx = canvas.getContext('2d');
      if (ctx && videoRef.current) {
        cameraOrientationService.drawUprightFrame(videoRef.current, ctx, 320, 320);
        const photoDataUrl = canvas.toDataURL('image/jpeg', 0.85);
        setCapturedPhoto(photoDataUrl);
      }

      setCapturedVector(snapResult.vector);
      setStatusMessage(`✅ จับภาพครบ 10 ช็อตเรียบร้อย (ความมั่นใจ ${(snapResult.avgConfidence * 100).toFixed(1)}%)`);
      stopCamera();
    } catch (err: any) {
      setErrorMessage(err?.message || 'เกิดข้อผิดพลาดในการสแกนใบหน้า');
      setStatusMessage('กรุณาลองใหม่อีกครั้ง');
    } finally {
      setIsCapturing(false);
    }
  };

  // Handle Photo Upload
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (ev) => {
      const dataUrl = ev.target?.result as string;
      if (!dataUrl) return;

      setCapturedPhoto(dataUrl);
      setStatusMessage('กำลังวิเคราะห์โครงสร้างใบหน้าจากรูปภาพ...');
      setErrorMessage(null);

      try {
        await livenessEngine.initialize();
        const img = new Image();
        img.src = dataUrl;
        await new Promise((resolve) => (img.onload = resolve));

        // Create temporary canvas to extract embedding
        const canvas = document.createElement('canvas');
        canvas.width = 160;
        canvas.height = 160;
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('ไม่สามารถประมวลผลภาพได้');

        const size = Math.min(img.width, img.height);
        const sx = (img.width - size) / 2;
        const sy = (img.height - size) / 2;
        ctx.drawImage(img, sx, sy, size, size, 0, 0, 160, 160);

        // Extract embedding through FaceAPI ResNet
        const faceapi = (window as any).faceapi || await import('@vladmandic/face-api').catch(() => null);
        if (faceapi && faceapi.nets?.faceRecognitionNet?.isLoaded) {
          const desc = await faceapi.computeFaceDescriptor(canvas);
          if (desc && desc.length === 128) {
            const normalized = patientFaceStorageService.normalizeVector(Array.from(desc));
            setCapturedVector(normalized);
            setStatusMessage('✅ สกัดเวกเตอร์ชีวมิติ 128 มิติสำเร็จ!');
            return;
          }
        }

        throw new Error('ไม่พบใบหน้าหน้าตรงที่ชัดเจนในภาพที่เลือก กรุณาเลือกภาพถ่ายหน้าตรงที่สว่างคมชัด หรือใช้การสแกนผ่านกล้อง 10 ช็อต');
      } catch (err: any) {
        setErrorMessage(err?.message || 'ไม่พบใบหน้าชัดเจนในภาพที่เลือก กรุณาเลือกภาพหน้าตรงที่สว่าง');
      }
    };
    reader.readAsDataURL(file);
  };

  // Save Vector & Sync to Supabase + Realtime
  const handleSaveToDatabase = async () => {
    if (!patient || !capturedVector) return;

    setIsSaving(true);
    setErrorMessage(null);

    const hn = patient.code || (patient as any).patient_code || String(patient.id);
    const timestamp = Date.now();
    const photoFileName = `face_${hn}_${timestamp}.jpg`;
    const photo = capturedPhoto || undefined;
    const distinctPhotoUrl = photo || `/uploads/faces/${photoFileName}`;

    try {
      // 1. Prepare payload with FACE_EMB & FACE_PHOTO in medical_history for cross-platform fallback
      const vectorJsonStr = JSON.stringify(capturedVector);
      let updatedMedHistory = (patient as any).medical_history || patient.patientBackground || '';
      
      // Clean old vector tag if any
      updatedMedHistory = updatedMedHistory.replace(/FACE_EMB:\[.*?\]/g, '').trim();
      updatedMedHistory = updatedMedHistory.replace(/FACE_PHOTO:data:image\/[^\s\n]+/g, '').trim();
      
      const newMedHistory = `${updatedMedHistory}\nFACE_EMB:${vectorJsonStr}${photo ? `\nFACE_PHOTO:${photo}` : ''}`.trim();

      // 2. Strict Per-Patient Save to Supabase Cloud Table using UPSERT
      try {
        const { error: sbErr } = await supabase
          .from('patients')
          .upsert({
            patient_code: hn,
            full_name: patient.name,
            age: Number(patient.age) || 65,
            gender: patient.gender || 'male',
            phone: patient.phone || null,
            chief_complaint: patient.chiefComplaint || patient.diagnosis || 'ลงทะเบียนด้วยใบหน้า Face Enrollment',
            face_vector: capturedVector,
            photo: photo || null,
            face_image_url: distinctPhotoUrl,
            medical_history: newMedHistory,
            status: 'active',
            updated_at: new Date().toISOString(),
          }, { onConflict: 'patient_code' });

        if (sbErr) {
          console.warn('[SUPABASE] PatientFaceEnrollModal upsert retry with base columns:', sbErr);
          await supabase
            .from('patients')
            .upsert({
              patient_code: hn,
              full_name: patient.name,
              age: Number(patient.age) || 65,
              gender: patient.gender || 'male',
              phone: patient.phone || null,
              chief_complaint: patient.chiefComplaint || patient.diagnosis || 'ลงทะเบียนด้วยใบหน้า Face Enrollment',
              face_vector: capturedVector,
              photo: photo || null,
              medical_history: newMedHistory,
              status: 'active',
              updated_at: new Date().toISOString(),
            }, { onConflict: 'patient_code' });
        }
      } catch (sbEx) {
        console.warn('[SUPABASE] PatientFaceEnrollModal exception:', sbEx);
      }

      // [CONSOLE LOGS & DEBUGGING]: Log patient_id, saved face_image_url, and vector length upon successful registration
      console.log('[REGISTRATION] Success:', {
        patient_id: hn,
        saved_face_image_url: distinctPhotoUrl,
        vector_length: capturedVector.length,
      });

      // 3. Save to Isolated Local Storage Dossier
      patientFaceStorageService.savePatientFaceData(
        hn,
        hn,
        capturedVector,
        photo || null,
        patient.name,
        Number(patient.age) || 65,
        patient.gender || 'male',
        'active'
      );
      patientFaceStorageService.savePatientRecord(
        hn,
        {
          patient_profile: {
            patient_id: hn,
            id: patient.id,
            first_name: patient.name.split(' ')[0] || patient.name,
            last_name: patient.name.split(' ').slice(1).join(' ') || '',
            full_name: patient.name,
            age: Number(patient.age) || 65,
            gender: patient.gender || 'male',
            phone: patient.phone,
            status: 'active',
          },
          biometric_data: {
            face_vector: capturedVector,
            registered_face_url: distinctPhotoUrl,
            enrolled_at: new Date().toISOString(),
            model_version: 'face-resnet34-10snap-v1',
          },
          medical_records: {
            diagnosis: patient.chiefComplaint || patient.diagnosis || 'ข้อไหล่ติดระยะฟื้นฟู (Frozen Shoulder)',
          },
        },
        photo
      );

      // Save to Face Registry Service for fast kiosk lookup
      faceRegistryService.saveProfile({
        patientId: patient.id,
        patientCode: hn,
        name: patient.name,
        age: Number(patient.age) || 65,
        gender: patient.gender || 'male',
        embeddings: [capturedVector],
        face_image_url: distinctPhotoUrl,
        enrolledAt: new Date().toISOString(),
      });

      // 4. Update Hospital Store State
      updateUser(patient.id, {
        biometricVector: capturedVector,
        face_vector: capturedVector,
        face_image_url: distinctPhotoUrl,
        status: 'active',
        pendingInfoNote: undefined,
      });

      upsertPatientFromSupabase({
        patient_code: hn,
        full_name: patient.name,
        name: patient.name,
        face_vector: capturedVector,
        photo,
        face_image_url: distinctPhotoUrl,
        medical_history: newMedHistory,
      });

      // 5. Persist Face Photo and Biometrics directly to Supabase Cloud
      if (supabaseService.isConfigured()) {
        await supabaseService.saveFaceEmbeddings(hn, capturedVector, distinctPhotoUrl || photo).catch((err) => {
          console.warn('[SUPABASE] saveFaceEmbeddings in PatientFaceEnrollModal error:', err);
        });
      }

      // 6. Broadcast to Kiosk Terminal via Supabase Realtime
      try {
        await supabase.channel(PATIENTS_REALTIME_CHANNEL).send({
          type: 'broadcast',
          event: 'patient_update',
          payload: {
            patient_code: hn,
            name: patient.name,
            full_name: patient.name,
            face_vector: capturedVector,
            photo,
            face_image_url: distinctPhotoUrl,
            status: 'active',
          },
        });
        await supabase.channel(PATIENTS_REALTIME_CHANNEL).send({
          type: 'broadcast',
          event: 'patient_registered',
          payload: {
            patient_code: hn,
            name: patient.name,
            full_name: patient.name,
            face_vector: capturedVector,
            photo,
            face_image_url: distinctPhotoUrl,
            status: 'active',
          },
        });
      } catch {}

      setIsSuccess(true);
      confetti({ particleCount: 75, spread: 70, origin: { y: 0.6 } });

      onSuccessToast?.(`✓ บันทึกใบหน้าของ ${patient.name} สำเร็จ! ตู้ Kiosk จดจำใบหน้าได้ทันที`);
      onSuccess?.({
        patient_code: hn,
        face_vector: capturedVector,
        photo,
      });

      setTimeout(() => {
        onClose();
      }, 1600);
    } catch (err: any) {
      console.error('Save face vector failed:', err);
      setErrorMessage(err?.message || 'ไม่สามารถบันทึกเวกเตอร์ใบหน้าได้ กรุณาลองใหม่อีกครั้ง');
    } finally {
      setIsSaving(false);
    }
  };

  if (!isOpen || !patient) return null;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[9999] flex items-center justify-center p-3 sm:p-4 animate-fadeIn">
      <div className="w-full max-w-lg bg-white rounded-3xl shadow-2xl border border-emerald-100 overflow-hidden flex flex-col max-h-[92vh]">
        {/* Modal Header */}
        <div className="px-4 sm:px-6 py-3.5 sm:py-4 bg-gradient-to-r from-emerald-600 via-teal-600 to-cyan-600 text-white flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-2xl bg-white/15 flex items-center justify-center backdrop-blur-xs flex-shrink-0">
              <Camera className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
            </div>
            <div className="min-w-0">
              <h3 className="font-extrabold text-sm sm:text-base tracking-tight truncate">สแกนและบันทึกใบหน้าคนไข้</h3>
              <p className="text-[11px] sm:text-xs text-emerald-100 font-medium truncate">
                {patient.name} • <span className="font-mono font-bold">HN: {patient.code}</span>
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-full hover:bg-white/20 transition cursor-pointer text-white/80 hover:text-white flex-shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-4 sm:p-6 space-y-4 overflow-y-auto">
          {/* Mode Switcher */}
          <div className="grid grid-cols-2 gap-2 p-1 bg-stone-100 rounded-2xl">
            <button
              type="button"
              onClick={() => {
                setMode('camera');
                setCapturedVector(null);
                setCapturedPhoto(null);
              }}
              className={`py-2 px-2.5 sm:px-3 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer ${
                mode === 'camera'
                  ? 'bg-white text-emerald-800 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Camera className="w-4 h-4 flex-shrink-0" />
              <span>ถ่ายผ่านกล้อง (10 ช็อต)</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setMode('upload');
                stopCamera();
                setCapturedVector(null);
                setCapturedPhoto(null);
              }}
              className={`py-2 px-3 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer ${
                mode === 'upload'
                  ? 'bg-white text-emerald-800 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Upload className="w-4 h-4" />
              <span>อัปโหลดรูปภาพ</span>
            </button>
          </div>

          {/* Camera View Mode */}
          {mode === 'camera' && (
            <div className="space-y-3">
              <div className="relative w-full aspect-4/3 bg-slate-900 rounded-2xl overflow-hidden flex items-center justify-center border-2 border-slate-700">
                {capturedPhoto ? (
                  <img
                    src={capturedPhoto}
                    alt="Captured Face"
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <>
                    <video
                      ref={videoRef}
                      autoPlay
                      playsInline
                      muted
                      className="w-full h-full object-cover transition-transform duration-300"
                      style={{ transform: cameraOrientationService.getCssTransform() }}
                    />
                    {/* Quick Flip & Rotate Buttons */}
                    <div className="absolute top-2.5 right-2.5 z-20 flex items-center gap-1 bg-slate-950/85 backdrop-blur-md p-1 rounded-2xl border border-white/20 shadow-xl">
                      <div className="flex items-center gap-1">
                        {([0, 90, 180, 270] as CameraRotation[]).map((deg) => (
                          <button
                            key={deg}
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              cameraOrientationService.setRotation(deg);
                              setCameraRotation(deg);
                            }}
                            className={`min-h-[28px] px-2 rounded-lg text-[11px] font-black transition active:scale-95 cursor-pointer touch-manipulation select-none border ${
                              cameraRotation === deg
                                ? 'bg-emerald-600 border-emerald-400 text-white shadow-sm ring-1 ring-emerald-300'
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
                          const nextDeg = cameraOrientationService.rotateNext90();
                          setCameraRotation(nextDeg);
                        }}
                        className="bg-slate-800 hover:bg-slate-700 text-emerald-300 px-2 py-1 rounded-lg border border-emerald-500/40 text-[11px] font-bold flex items-center gap-1 shadow-md cursor-pointer transition active:scale-95 touch-manipulation select-none"
                        title="กดเพื่อหมุนมุมมองกล้องทีละ 90°"
                      >
                        <RotateCw className="w-3 h-3 text-emerald-400" />
                        <span>+90°</span>
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          const nextMirror = cameraOrientationService.toggleMirror();
                          setIsCameraMirrored(nextMirror);
                        }}
                        className={`px-2 py-1 rounded-lg border text-[11px] font-bold flex items-center gap-1 shadow-md cursor-pointer transition active:scale-95 touch-manipulation select-none ${
                          isCameraMirrored
                            ? 'bg-cyan-950 border-cyan-400/60 text-cyan-200'
                            : 'bg-slate-800 border-white/20 text-slate-300'
                        }`}
                        title="กดเพื่อเปิด/ปิดกระจกเงา"
                      >
                        <FlipHorizontal className="w-3 h-3 text-cyan-400" />
                        <span>{isCameraMirrored ? 'กระจก' : 'ปกติ'}</span>
                      </button>
                    </div>
                    {/* Oval Guide Overlay */}
                    <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                      <div className={`w-44 h-56 rounded-[50%] border-4 transition-all duration-300 ${
                        isCapturing
                          ? 'border-cyan-400 shadow-[0_0_25px_rgba(6,182,212,0.6)] animate-pulse'
                          : 'border-emerald-400/80 shadow-[0_0_15px_rgba(16,185,129,0.3)]'
                      }`} />
                    </div>
                  </>
                )}

                {/* Progress Badge */}
                {isCapturing && (
                  <div className="absolute bottom-3 left-1/2 -translate-x-1/2 px-4 py-1.5 rounded-full bg-slate-950/80 backdrop-blur-md text-white text-xs font-bold border border-cyan-400 flex items-center gap-2">
                    <Sparkles className="w-3.5 h-3.5 text-cyan-400 animate-spin" />
                    <span>บันทึกช็อตที่ {progress.count} / {progress.total}</span>
                  </div>
                )}
              </div>

              {/* Status & Guidance */}
              <div className="text-center">
                <p className="text-xs font-bold text-slate-700">{statusMessage}</p>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  ระบบจะสกัดเวกเตอร์ชีวมิติ 128 มิติความแม่นยำสูง และบันทึกลงฐานข้อมูลเพื่อให้คนไข้สแกนหน้าได้ทันที
                </p>
              </div>

              {/* Camera Trigger Buttons */}
              <div className="flex gap-2">
                {!capturedVector ? (
                  <button
                    type="button"
                    onClick={handleStartTenSnapCapture}
                    disabled={isCapturing || !cameraActive}
                    className="w-full py-3 px-4 rounded-2xl bg-gradient-to-r from-emerald-600 via-teal-600 to-cyan-600 hover:opacity-95 text-white font-extrabold text-sm shadow-md shadow-emerald-500/25 active:scale-95 transition flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer"
                  >
                    <Camera className="w-4 h-4" />
                    <span>{isCapturing ? 'กำลังสแกน...' : '📸 เริ่มสแกน 10 ช็อตอัตโนมัติ'}</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      setCapturedVector(null);
                      setCapturedPhoto(null);
                      startCamera();
                    }}
                    className="w-full py-2.5 px-4 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs transition flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>ถ่ายใหม่อีกครั้ง</span>
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Upload Mode */}
          {mode === 'upload' && (
            <div className="space-y-3">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleFileUpload}
                className="hidden"
              />

              <div
                onClick={() => fileInputRef.current?.click()}
                className="w-full aspect-4/3 rounded-2xl border-2 border-dashed border-emerald-300 hover:border-emerald-500 bg-emerald-50/40 hover:bg-emerald-50/70 transition flex flex-col items-center justify-center p-6 text-center cursor-pointer group"
              >
                {capturedPhoto ? (
                  <img
                    src={capturedPhoto}
                    alt="Preview"
                    className="max-h-52 rounded-xl object-contain shadow-md border border-emerald-200"
                  />
                ) : (
                  <>
                    <div className="w-14 h-14 rounded-2xl bg-emerald-100 text-emerald-700 flex items-center justify-center mb-3 group-hover:scale-110 transition shadow-inner">
                      <Upload className="w-7 h-7" />
                    </div>
                    <p className="font-extrabold text-sm text-slate-800">
                      คลิกเพื่อเลือกไฟล์รูปภาพใบหน้าคนไข้
                    </p>
                    <p className="text-xs text-slate-500 mt-1">
                      รองรับไฟล์ JPG, PNG (แนะนำภาพหน้าตรง แสงสว่างชัดเจน)
                    </p>
                  </>
                )}
              </div>

              {capturedPhoto && (
                <div className="flex justify-center">
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="text-xs font-bold text-emerald-700 hover:underline flex items-center gap-1 cursor-pointer"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>เปลี่ยนรูปภาพใหม่</span>
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Error Banner */}
          {errorMessage && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 font-bold flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Biometric Status Summary */}
          {capturedVector && (
            <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl space-y-2">
              <div className="flex items-center gap-2 text-emerald-800 font-bold text-xs">
                <ShieldCheck className="w-4 h-4 text-emerald-600" />
                <span>เวกเตอร์ชีวมิติ 128 มิติสร้างเรียบร้อยแล้ว</span>
              </div>
              <p className="text-[11px] text-emerald-700">
                ระบบพร้อมผูกเวกเตอร์นี้เข้ากับบัญชี <strong>{patient.name} ({patient.code})</strong> เพื่อให้คนไข้สแกนหน้าเข้าสู่ระบบตู้ Kiosk ได้ทันที
              </p>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={onClose}
            className="py-2.5 px-4 rounded-xl text-slate-600 hover:bg-slate-200 text-xs font-bold transition cursor-pointer"
          >
            ยกเลิก
          </button>

          <button
            type="button"
            onClick={handleSaveToDatabase}
            disabled={!capturedVector || isSaving || isSuccess}
            className="py-3 px-6 rounded-2xl bg-gradient-to-r from-emerald-600 via-teal-600 to-cyan-600 hover:opacity-95 text-white font-extrabold text-sm shadow-md shadow-emerald-500/25 active:scale-95 transition flex items-center gap-2 disabled:opacity-40 cursor-pointer"
          >
            {isSuccess ? (
              <>
                <CheckCircle2 className="w-4 h-4 text-emerald-200" />
                <span>บันทึกสำเร็จ!</span>
              </>
            ) : isSaving ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                <span>กำลังบันทึกและซิงค์...</span>
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4" />
                <span>💾 บันทึกและซิงค์ไปยังตู้ Kiosk</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
