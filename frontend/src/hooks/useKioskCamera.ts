/**
 * Dr.Tech.Care - High-Resilience Kiosk Camera Hook
 * Solves "Requested device not found" and handles all WebRTC camera errors on Windows Desktop / Kiosk 9:16
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { CameraState, CameraDeviceInfo, CameraErrorCode } from '../types/biometrics';

export function useKioskCamera() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const luminanceCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const luminanceIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [state, setState] = useState<CameraState>({
    isActive: false,
    isLoading: false,
    errorCode: null,
    errorMessageTh: null,
    availableDevices: [],
    activeDeviceId: null,
    luminance: 120,
  });

  // Query connected camera devices
  const refreshDevices = useCallback(async (): Promise<CameraDeviceInfo[]> => {
    if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) {
      return [];
    }
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoDevices = devices
        .filter((d) => d.kind === 'videoinput')
        .map((d, index) => ({
          deviceId: d.deviceId,
          label: d.label || `กล้องตัวที่ ${index + 1}`,
          groupId: d.groupId,
        }));
      setState((prev) => ({ ...prev, availableDevices: videoDevices }));
      return videoDevices;
    } catch {
      return [];
    }
  }, []);

  // Stop camera tracks cleanly
  const stopCamera = useCallback(() => {
    if (luminanceIntervalRef.current) {
      clearInterval(luminanceIntervalRef.current);
      luminanceIntervalRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => {
        try {
          track.stop();
        } catch {}
      });
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setState((prev) => ({
      ...prev,
      isActive: false,
      isLoading: false,
    }));
  }, []);

  // Measure lighting luminance
  const startLuminanceMonitor = useCallback(() => {
    if (luminanceIntervalRef.current) clearInterval(luminanceIntervalRef.current);
    if (!luminanceCanvasRef.current && typeof document !== 'undefined') {
      const c = document.createElement('canvas');
      c.width = 32;
      c.height = 32;
      luminanceCanvasRef.current = c;
    }

    luminanceIntervalRef.current = setInterval(() => {
      const video = videoRef.current;
      const canvas = luminanceCanvasRef.current;
      if (!video || !canvas || video.readyState < 2) return;

      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) return;

      try {
        ctx.drawImage(video, 0, 0, 32, 32);
        const imgData = ctx.getImageData(0, 0, 32, 32);
        const data = imgData.data;
        let sum = 0;
        const totalPixels = 32 * 32;
        for (let i = 0; i < data.length; i += 4) {
          // Standard ITU-R BT.601 perceptual luminance formula
          sum += 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
        }
        const avgLum = Math.round(sum / totalPixels);
        setState((prev) => (prev.luminance === avgLum ? prev : { ...prev, luminance: avgLum }));
      } catch {}
    }, 600);
  }, []);

  // Start camera with multi-tier fallback (crucial for Windows USB / Kiosk hardware)
  const startCamera = useCallback(
    async (preferredDeviceId?: string) => {
      stopCamera();
      setState((prev) => ({
        ...prev,
        isLoading: true,
        errorCode: null,
        errorMessageTh: null,
      }));

      // Security check
      if (typeof window !== 'undefined' && !window.isSecureContext) {
        const isLocal =
          window.location.hostname === 'localhost' ||
          /^127(?:\.\d+){3}$/.test(window.location.hostname);
        if (!isLocal) {
          setState((prev) => ({
            ...prev,
            isLoading: false,
            errorCode: 'INSECURE_CONTEXT',
            errorMessageTh:
              'เบราว์เซอร์บล็อกกล้องเนื่องจากไม่ได้ใช้ HTTPS: กรุณาใช้งานผ่าน https:// หรือ localhost',
          }));
          return;
        }
      }

      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        setState((prev) => ({
          ...prev,
          isLoading: false,
          errorCode: 'NOT_FOUND',
          errorMessageTh: 'อุปกรณ์หรือเบราว์เซอร์นี้ไม่รองรับ WebRTC MediaDevices',
        }));
        return;
      }

      let stream: MediaStream | null = null;
      let usedDeviceId: string | null = null;

      // Tier 1: Try specific device ID or ideal 1280x720 with facingMode: 'user'
      try {
        const constraints: MediaStreamConstraints = preferredDeviceId
          ? {
              video: { deviceId: { exact: preferredDeviceId }, width: { ideal: 1280 }, height: { ideal: 720 } },
              audio: false,
            }
          : {
              video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
              audio: false,
            };
        stream = await navigator.mediaDevices.getUserMedia(constraints);
      } catch (err1) {
        // Tier 2: Try 640x480 with facingMode
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
            audio: false,
          });
        } catch (err2) {
          // Tier 3: Try 640x480 WITHOUT facingMode (ESSENTIAL for Windows USB webcams / Kiosks)
          try {
            stream = await navigator.mediaDevices.getUserMedia({
              video: { width: { ideal: 640 }, height: { ideal: 480 } },
              audio: false,
            });
          } catch (err3) {
            // Tier 4: Minimal video true
            try {
              stream = await navigator.mediaDevices.getUserMedia({
                video: true,
                audio: false,
              });
            } catch (errFinal: any) {
              // Diagnose error and provide clear Thai resolution message
              let code: CameraErrorCode = 'UNKNOWN';
              let msg = 'ไม่สามารถเปิดกล้องเว็บแคมได้';

              const errName = errFinal?.name || '';
              if (
                errName === 'NotFoundError' ||
                errName === 'DevicesNotFoundError' ||
                errFinal?.message?.includes('device not found')
              ) {
                code = 'NOT_FOUND';
                msg =
                  'ไม่พบอุปกรณ์กล้องเว็บแคม: กรุณาตรวจสอบสายเสียบ USB หรือเปิดใช้งานกล้องในระบบ Windows';
              } else if (
                errName === 'NotAllowedError' ||
                errName === 'PermissionDeniedError'
              ) {
                code = 'PERMISSION_DENIED';
                msg =
                  'เบราว์เซอร์ยังไม่ได้รับอนุญาตให้ใช้กล้อง: กรุณาคลิกไอคอนแม่กุญแจ/กล้องที่แถบ URL แล้วเลือก "อนุญาต (Allow)"';
              } else if (
                errName === 'NotReadableError' ||
                errName === 'TrackStartError'
              ) {
                code = 'IN_USE';
                msg =
                  'กล้องกำลังถูกใช้งานโดยแอปอื่น (เช่น Zoom, Discord, Windows Camera) กรุณาปิดโปรแกรมอื่นแล้วลองใหม่';
              } else if (errName === 'OverconstrainedError') {
                code = 'OVERCONSTRAINED';
                msg = 'ฮาร์ดแวร์กล้องไม่รองรับความละเอียดที่ร้องขอ';
              }

              setState((prev) => ({
                ...prev,
                isLoading: false,
                isActive: false,
                errorCode: code,
                errorMessageTh: msg,
              }));
              return;
            }
          }
        }
      }

      if (!stream) {
        setState((prev) => ({
          ...prev,
          isLoading: false,
          isActive: false,
          errorCode: 'NOT_FOUND',
          errorMessageTh: 'ไม่สามารถรับสัญญาณภาพจากกล้องเว็บแคมได้',
        }));
        return;
      }

      streamRef.current = stream;
      const videoTrack = stream.getVideoTracks()[0];
      if (videoTrack) {
        usedDeviceId = videoTrack.getSettings().deviceId || null;
      }

      const video = videoRef.current;
      if (video) {
        video.srcObject = stream;
        video.muted = true;
        video.playsInline = true;
        video.setAttribute('playsinline', 'true');
        video.setAttribute('muted', 'true');
        video.setAttribute('autoplay', 'true');
        try {
          await video.play();
        } catch {}
      }

      setState((prev) => ({
        ...prev,
        isActive: true,
        isLoading: false,
        errorCode: null,
        errorMessageTh: null,
        activeDeviceId: usedDeviceId,
      }));

      startLuminanceMonitor();
      refreshDevices();
    },
    [stopCamera, startLuminanceMonitor, refreshDevices]
  );

  useEffect(() => {
    refreshDevices();
    return () => {
      stopCamera();
    };
  }, [refreshDevices, stopCamera]);

  return {
    videoRef,
    streamRef,
    cameraState: state,
    startCamera,
    stopCamera,
    refreshDevices,
  };
}
