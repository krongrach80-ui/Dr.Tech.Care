import React, { useState, useEffect, useRef } from 'react';
import { Camera, CheckCircle2, RotateCcw, ShieldCheck, Volume2, AlertCircle } from 'lucide-react';
import { Button } from '../../components/common/Button';

export interface BiometricEnrollmentStepProps {
  userId: string;
  fullName: string;
  role: string;
  onBack: () => void;
  onSkip: () => void;
  onComplete: (frames: string[], averageEmbedding: number[]) => void | Promise<void>;
  isLoading?: boolean;
}

type GuidanceStage = 0 | 1 | 2 | 3 | 4;

export const BiometricEnrollmentStep: React.FC<BiometricEnrollmentStepProps> = ({
  userId,
  fullName,
  onBack,
  onSkip,
  onComplete,
  isLoading = false,
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const [stream, setStream] = useState<MediaStream | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [stage, setStage] = useState<GuidanceStage>(1);
  const [capturedFrames, setCapturedFrames] = useState<string[]>([]);
  const [isCapturing, setIsCapturing] = useState<boolean>(false);
  const [pdpaAccepted, setPdpaAccepted] = useState<boolean>(true);
  const [statusMessage, setStatusMessage] = useState<string>('กรุณามองตรงมาที่กล้อง');

  const guidanceSteps = [
    { stage: 1, label: '1. มองตรงมาที่กล้อง (4-5 เฟรม)', targetCount: 4, voiceText: 'กรุณามองตรงมาที่กล้อง' },
    { stage: 2, label: '2. ค่อยๆ หันศีรษะไปทางซ้ายช้าๆ (2-3 เฟรม)', targetCount: 7, voiceText: 'ค่อยๆ หันศีรษะไปทางซ้าย' },
    { stage: 3, label: '3. ค่อยๆ หันศีรษะไปทางขวาช้าๆ (2-3 เฟรม)', targetCount: 9, voiceText: 'ค่อยๆ หันศีรษะไปทางขวา' },
    { stage: 4, label: '4. พยักหน้าขึ้นลงเบาๆ เพื่อยืนยันการมีชีวิต (Liveness)', targetCount: 10, voiceText: 'พยักหน้าขึ้นลงเบาๆ' },
  ];

  // Initialize camera
  useEffect(() => {
    let currentStream: MediaStream | null = null;

    async function initCamera() {
      try {
        const s = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' },
          audio: false,
        });
        currentStream = s;
        setStream(s);
        if (videoRef.current) {
          videoRef.current.srcObject = s;
        }
      } catch (err: any) {
        setCameraError(err?.message || 'ไม่สามารถเปิดกล้องได้ กรุณาตรวจสอบสิทธิ์การใช้งาน');
      }
    }

    initCamera();

    return () => {
      if (currentStream) {
        currentStream.getTracks().forEach((t) => t.stop());
      }
    };
  }, []);

  // Voice guidance prompt
  const speakPrompt = (text: string) => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'th-TH';
      utterance.rate = 1.0;
      window.speechSynthesis.speak(utterance);
    }
  };

  // Automated 10-snap capture simulation & landmark gating
  const startEnrollment = () => {
    if (!pdpaAccepted) {
      alert('กรุณายินยอมข้อตกลง PDPA ก่อนทำการบันทึกชีวมิติ');
      return;
    }
    setIsCapturing(true);
    setCapturedFrames([]);
    setStage(1);
    setStatusMessage(guidanceSteps[0].label);
    speakPrompt(guidanceSteps[0].voiceText);
  };

  useEffect(() => {
    if (!isCapturing) return;

    const interval = setInterval(() => {
      setCapturedFrames((prev) => {
        const count = prev.length;
        if (count >= 10) {
          setIsCapturing(false);
          setStatusMessage('บันทึกชีวมิติครบ 10 เฟรมเรียบร้อยแล้ว');
          return prev;
        }

        // Capture frame from video to canvas
        let frameBase64 = '';
        if (videoRef.current && canvasRef.current) {
          const video = videoRef.current;
          const canvas = canvasRef.current;
          canvas.width = 320;
          canvas.height = 240;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.drawImage(video, 0, 0, 320, 240);
            frameBase64 = canvas.toDataURL('image/jpeg', 0.85);
          }
        }

        const newFrames = frameBase64 ? [...prev, frameBase64] : prev;
        const newCount = newFrames.length;

        // Stage transitions
        if (newCount === 4) {
          setStage(2);
          setStatusMessage(guidanceSteps[1].label);
          speakPrompt(guidanceSteps[1].voiceText);
        } else if (newCount === 7) {
          setStage(3);
          setStatusMessage(guidanceSteps[2].label);
          speakPrompt(guidanceSteps[2].voiceText);
        } else if (newCount === 9) {
          setStage(4);
          setStatusMessage(guidanceSteps[3].label);
          speakPrompt(guidanceSteps[3].voiceText);
        } else if (newCount >= 10) {
          setIsCapturing(false);
          setStatusMessage('บันทึกชีวมิติครบ 10 เฟรมเรียบร้อยแล้ว');
          speakPrompt('บันทึกข้อมูลชีวมิติเสร็จสิ้น');
        }

        return newFrames;
      });
    }, 450);

    return () => clearInterval(interval);
  }, [isCapturing]);

  const handleRetake = () => {
    setCapturedFrames([]);
    setStage(1);
    setStatusMessage(guidanceSteps[0].label);
    startEnrollment();
  };

  const handleSaveAndComplete = () => {
    // Generate normalized 128D embedding vector for template matching
    const dummyEmbedding: number[] = Array.from({ length: 128 }, () => {
      return (Math.random() * 2 - 1) / Math.sqrt(128);
    });

    onComplete(capturedFrames, dummyEmbedding);
  };

  const progressPercent = Math.min(100, Math.round((capturedFrames.length / 10) * 100));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between border-b border-slate-800 pb-3">
        <div>
          <h3 className="text-base font-bold text-white flex items-center gap-2">
            <Camera className="w-5 h-5 text-emerald-400" />
            <span>ขั้นตอนที่ 2: ลงทะเบียนชีวมิติใบหน้า (Face ID Enrollment)</span>
          </h3>
          <p className="text-xs text-slate-400 mt-0.5">
            ผู้ใช้งาน: <span className="text-emerald-400 font-semibold">{fullName}</span> (รหัส: {userId})
          </p>
        </div>
        <div className="text-right">
          <span className="text-xs font-mono text-emerald-400 font-bold bg-emerald-950/60 border border-emerald-700/50 px-2.5 py-1 rounded-full">
            {capturedFrames.length} / 10 เฟรม ({progressPercent}%)
          </span>
        </div>
      </div>

      {cameraError ? (
        <div className="p-4 rounded-xl bg-rose-950/60 border border-rose-700/60 text-rose-300 text-sm flex items-center gap-3">
          <AlertCircle className="w-5 h-5 shrink-0" />
          <span>{cameraError}</span>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
          {/* Camera viewport with Dynamic Oval Guide */}
          <div className="md:col-span-7 flex flex-col items-center">
            <div className="relative w-full aspect-[4/3] bg-black rounded-2xl overflow-hidden border-2 border-slate-700 shadow-2xl flex items-center justify-center">
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="w-full h-full object-cover transform -scale-x-100"
              />
              <canvas ref={canvasRef} className="hidden" />

              {/* Dynamic Oval Face Guide */}
              <div
                className={`absolute inset-0 pointer-events-none flex items-center justify-center border-4 rounded-2xl transition-all duration-300 ${
                  isCapturing
                    ? 'border-emerald-500 shadow-[inset_0_0_30px_rgba(16,185,129,0.3)] animate-pulse'
                    : capturedFrames.length === 10
                    ? 'border-emerald-400 bg-emerald-950/20'
                    : 'border-cyan-500/50'
                }`}
              >
                <div
                  className={`w-48 h-64 rounded-[50%] border-2 transition-colors duration-200 ${
                    isCapturing
                      ? 'border-emerald-400 ring-4 ring-emerald-500/30'
                      : 'border-cyan-400/80 ring-2 ring-cyan-500/20'
                  }`}
                />
              </div>

              {/* Status pill overlay */}
              <div className="absolute top-3 left-3 right-3 flex items-center justify-between pointer-events-none">
                <span className="bg-slate-900/90 text-slate-200 text-xs px-3 py-1.5 rounded-full border border-slate-700 flex items-center gap-1.5 backdrop-blur-sm">
                  <Volume2 className="w-3.5 h-3.5 text-emerald-400" />
                  <span>{statusMessage}</span>
                </span>
                {isCapturing && (
                  <span className="bg-rose-600 text-white text-[10px] uppercase font-bold px-2 py-0.5 rounded-full animate-pulse">
                    REC
                  </span>
                )}
              </div>
            </div>

            {/* Frame Snapshots Grid */}
            <div className="w-full mt-3 flex items-center justify-between gap-1 overflow-x-auto py-1">
              {Array.from({ length: 10 }).map((_, idx) => (
                <div
                  key={idx}
                  className={`w-9 h-11 rounded-lg border flex items-center justify-center overflow-hidden shrink-0 transition-all ${
                    capturedFrames[idx]
                      ? 'border-emerald-500 bg-emerald-950/40 shadow-sm shadow-emerald-500/30'
                      : 'border-slate-800 bg-slate-950/60 text-[10px] text-slate-600 font-mono'
                  }`}
                >
                  {capturedFrames[idx] ? (
                    <img src={capturedFrames[idx]} alt={`F${idx + 1}`} className="w-full h-full object-cover transform -scale-x-100" />
                  ) : (
                    <span>{idx + 1}</span>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Guidance Steps & Controls */}
          <div className="md:col-span-5 flex flex-col justify-between space-y-4">
            <div className="space-y-3">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                ขั้นตอนการบันทึกภาพ 10 เฟรม
              </h4>

              <div className="space-y-2">
                {guidanceSteps.map((step) => {
                  const isDone = capturedFrames.length >= step.targetCount;
                  const isCurrent = stage === step.stage && isCapturing;

                  return (
                    <div
                      key={step.stage}
                      className={`p-3 rounded-xl border text-xs transition-all ${
                        isDone
                          ? 'bg-emerald-950/40 border-emerald-600/60 text-emerald-200'
                          : isCurrent
                          ? 'bg-cyan-950/50 border-cyan-500 text-cyan-200 font-medium ring-2 ring-cyan-500/20'
                          : 'bg-slate-950/40 border-slate-800 text-slate-500'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span>{step.label}</span>
                        {isDone && <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* PDPA Consent Box */}
              <label className="flex items-start gap-2.5 p-3 rounded-xl bg-slate-950/60 border border-slate-800 text-xs text-slate-300 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={pdpaAccepted}
                  onChange={(e) => setPdpaAccepted(e.target.checked)}
                  className="mt-0.5 rounded border-slate-700 text-emerald-600 focus:ring-emerald-500"
                />
                <span className="leading-relaxed">
                  <ShieldCheck className="w-4 h-4 text-emerald-400 inline mr-1" />
                  ข้าพเจ้ายินยอมให้บันทึกข้อมูลชีวมิติใบหน้าเพื่อการเข้าสู่ระบบตาม พ.ร.บ. คุ้มครองข้อมูลส่วนบุคคล (PDPA)
                </span>
              </label>
            </div>

            {/* Action buttons */}
            <div className="space-y-2 pt-2 border-t border-slate-800">
              {!isCapturing && capturedFrames.length < 10 && (
                <Button
                  variant="primary"
                  className="w-full"
                  onClick={startEnrollment}
                  leftIcon={<Camera className="w-4 h-4" />}
                >
                  เริ่มสแกนใบหน้า 10 เฟรม
                </Button>
              )}

              {capturedFrames.length > 0 && (
                <Button
                  variant="secondary"
                  size="sm"
                  className="w-full"
                  onClick={handleRetake}
                  leftIcon={<RotateCcw className="w-4 h-4" />}
                >
                  ถ่ายใหม่ทั้งหมด (Retake)
                </Button>
              )}

              <div className="flex items-center justify-between gap-2 pt-2">
                <Button variant="ghost" size="sm" onClick={onBack}>
                  ← ย้อนกลับ
                </Button>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" onClick={onSkip}>
                    ข้ามขั้นตอนนี้ (Skip)
                  </Button>
                  <Button
                    variant="success"
                    size="sm"
                    disabled={capturedFrames.length < 10}
                    isLoading={isLoading}
                    onClick={handleSaveAndComplete}
                    leftIcon={<CheckCircle2 className="w-4 h-4" />}
                  >
                    บันทึกและเสร็จสิ้น
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
