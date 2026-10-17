import { useState, useEffect, useRef, useCallback } from 'react';

export function useCamera() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [isCameraReady, setIsCameraReady] = useState<boolean>(false);
  const [isCameraLoading, setIsCameraLoading] = useState<boolean>(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [isFrontCamera, setIsFrontCamera] = useState<boolean>(true);

  const startCamera = useCallback(async () => {
    setCameraError(null);
    setIsCameraLoading(true);

    try {
      // Release any existing camera tracks first to avoid NotReadableError
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      }

      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        if (typeof window !== 'undefined' && !window.isSecureContext) {
          const isLocal = window.location.hostname === 'localhost' || /^127(?:\.\d+){3}$/.test(window.location.hostname);
          if (!isLocal) {
            throw new Error(
              `เบราว์เซอร์บล็อกการเข้าถึงกล้องเนื่องจากไม่ได้ใช้ HTTPS (Insecure Context): สำหรับการทดสอบบนมือถือผ่าน LAN/Wi-Fi กรุณาใช้ URL ที่ขึ้นต้นด้วย "https://" (เช่น https://${window.location.host}) หรือเปิดผ่าน localhost`
            );
          }
        }
        throw new Error('อุปกรณ์หรือเบราว์เซอร์นี้ไม่รองรับการเข้าถึงกล้องเว็บแคม (WebRTC MediaDevices)');
      }

      let mediaStream: MediaStream | null = null;
      try {
        // Tier 1: Preferred resolution with facingMode preference
        mediaStream = await navigator.mediaDevices.getUserMedia({
          video: {
            width: { ideal: 1280 },
            height: { ideal: 720 },
            facingMode: isFrontCamera ? 'user' : 'environment',
          },
          audio: false,
        });
      } catch (err1) {
        console.warn('Tier 1 constraint failed, trying standard 640x480:', err1);
        try {
          // Tier 2: Standard definition with facingMode
          mediaStream = await navigator.mediaDevices.getUserMedia({
            video: {
              width: { ideal: 640 },
              height: { ideal: 480 },
              facingMode: isFrontCamera ? 'user' : 'environment',
            },
            audio: false,
          });
        } catch (err2) {
          console.warn('Tier 2 constraint failed, trying without facingMode (Desktop/USB webcam):', err2);
          try {
            // Tier 3: Without facingMode (essential for Windows desktop USB webcams & virtual cams)
            mediaStream = await navigator.mediaDevices.getUserMedia({
              video: {
                width: { ideal: 640 },
                height: { ideal: 480 },
              },
              audio: false,
            });
          } catch (err3) {
            console.warn('Tier 3 constraint failed, falling back to minimal video:true:', err3);
            // Tier 4: Basic video fallback
            mediaStream = await navigator.mediaDevices.getUserMedia({
              video: true,
              audio: false,
            });
          }
        }
      }

      if (!mediaStream) {
        throw new Error('ไม่สามารถรับสัญญาณภาพจากกล้องเว็บแคมได้');
      }

      streamRef.current = mediaStream;

      const video = videoRef.current;
      if (video) {
        video.srcObject = mediaStream;
        video.muted = true;
        video.playsInline = true;
        video.setAttribute('playsinline', 'true');
        video.setAttribute('muted', 'true');
        video.setAttribute('autoplay', 'true');
        try {
          await video.play();
        } catch (playErr) {
          console.warn('Video play warning:', playErr);
        }
      }

      setIsCameraReady(true);
      setIsCameraLoading(false);
    } catch (err: unknown) {
      console.warn('Camera access unavailable:', err);

      // On Windows/Chrome, fast screen switches can briefly hold the camera track; retry once after 350ms
      if (err instanceof Error && (err.name === 'NotReadableError' || err.name === 'TrackStartError')) {
        try {
          await new Promise((res) => setTimeout(res, 350));
          const retryStream = await navigator.mediaDevices.getUserMedia({
            video: { width: { ideal: 640 }, height: { ideal: 480 } },
            audio: false,
          });
          streamRef.current = retryStream;
          if (videoRef.current) {
            videoRef.current.srcObject = retryStream;
            videoRef.current.muted = true;
            videoRef.current.playsInline = true;
            await videoRef.current.play().catch(() => {});
          }
          setIsCameraReady(true);
          setIsCameraLoading(false);
          setCameraError(null);
          return;
        } catch {
          // If retry also failed, continue to standard error handler
        }
      }

      let msg = 'ไม่สามารถเปิดกล้องเว็บแคมได้';
      if (err instanceof Error) {
        if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
          msg = 'เบราว์เซอร์ยังไม่ได้รับอนุญาตให้ใช้กล้อง: กรุณาคลิกไอคอนการตั้งค่า/รูปกล้องที่ช่อง URL ด้านบน แล้วเลือก "อนุญาต (Allow)"';
        } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
          msg = 'ไม่พบอุปกรณ์กล้องเว็บแคมที่เชื่อมต่อกับคอมพิวเตอร์';
        } else if (err.name === 'NotReadableError' || err.name === 'TrackStartError') {
          msg = 'กล้องกำลังถูกใช้งานโดยโปรแกรมอื่น (เช่น Discord, Roblox, Zoom, OBS หรือ Windows Camera) กรุณาปิดโปรแกรมอื่นแล้วลองใหม่';
        } else {
          msg = `${err.name}: ${err.message}`;
        }
      }
      setCameraError(msg);
      setIsCameraReady(false);
      setIsCameraLoading(false);
    }
  }, [isFrontCamera]);

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setIsCameraReady(false);
    setIsCameraLoading(false);
  }, []);

  const toggleCamera = () => {
    setIsFrontCamera((prev) => !prev);
  };

  // Continuously sync stream to video element whenever videoRef or streamRef is available
  useEffect(() => {
    const video = videoRef.current;
    const stream = streamRef.current;
    if (isCameraReady && video && stream) {
      if (video.srcObject !== stream) {
        video.srcObject = stream;
      }
      video.muted = true;
      video.playsInline = true;
      if (video.paused) {
        video.play().catch((e) => console.warn('Video play sync warning:', e));
      }
    }
  });

  // Only cleanup on unmount
  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, [stopCamera]);

  return {
    videoRef,
    isCameraReady,
    isCameraLoading,
    cameraError,
    startCamera,
    stopCamera,
    toggleCamera,
    isFrontCamera,
  };
}
