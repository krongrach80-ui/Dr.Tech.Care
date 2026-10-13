/**
 * Dr.Tech.Care - Real MediaPipe FaceLandmarker + ResNet-34 128-D Biometric Embedding Engine
 * Strict Anti-Spoofing 3-Step Liveness (Front -> Left -> Right) with Anti-Replay Nonce
 * STRICT PDPA: Only 128-D Mathematical Vector is extracted. NEVER STORES RAW IMAGES.
 */

import { FilesetResolver, FaceLandmarker, FaceLandmarkerResult } from '@mediapipe/tasks-vision';
import {
  LivenessChallenge,
  LivenessNonce,
  LivenessFrameData,
  QualityGateState,
  BiometricVectorRecord,
  BiometricVerificationResult,
} from '../types/biometrics';
import { asset } from '../utils/asset';

let faceapiInstance: any = null;
async function getFaceApi(): Promise<any> {
  if (typeof window === 'undefined') return null;
  if (!faceapiInstance) {
    faceapiInstance = await import('@vladmandic/face-api');
  }
  return faceapiInstance;
}

export class LivenessEngine {
  private static instance: LivenessEngine;
  private faceLandmarker: FaceLandmarker | null = null;
  private isFaceApiLoaded: boolean = false;
  private isInitializing: boolean = false;
  private offscreenCanvas: HTMLCanvasElement | null = null;

  // Active Session Nonce (Protects against video replay attack)
  private activeNonce: LivenessNonce | null = null;

  private constructor() {
    if (typeof document !== 'undefined') {
      this.offscreenCanvas = document.createElement('canvas');
      this.offscreenCanvas.width = 160;
      this.offscreenCanvas.height = 160;
    }
  }

  public static getInstance(): LivenessEngine {
    if (!LivenessEngine.instance) {
      LivenessEngine.instance = new LivenessEngine();
    }
    return LivenessEngine.instance;
  }

  /**
   * 1. Initialize MediaPipe FaceLandmarker and face-api ResNet-34
   */
  public async initialize(): Promise<boolean> {
    if (this.faceLandmarker && this.isFaceApiLoaded) return true;
    if (this.isInitializing) return false;
    this.isInitializing = true;

    try {
      // 1.1 Load MediaPipe Vision WASM and FaceLandmarker
      if (!this.faceLandmarker) {
        let vision: any = null;
        try {
          vision = await FilesetResolver.forVisionTasks(asset('models/pose/wasm'));
        } catch {
          vision = await FilesetResolver.forVisionTasks('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm');
        }

        const modelPaths = [
          asset('models/face_landmarker.task'),
          'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
        ];

        for (const path of modelPaths) {
          try {
            this.faceLandmarker = await FaceLandmarker.createFromOptions(vision, {
              baseOptions: { modelAssetPath: path, delegate: 'GPU' },
              runningMode: 'VIDEO',
              numFaces: 2, // Allow detecting 2 to reject multiple people
              minFaceDetectionConfidence: 0.45,
              minFacePresenceConfidence: 0.45,
              minTrackingConfidence: 0.45,
              outputFaceBlendshapes: true,
              outputFacialTransformationMatrixes: true,
            });
            break;
          } catch {
            try {
              this.faceLandmarker = await FaceLandmarker.createFromOptions(vision, {
                baseOptions: { modelAssetPath: path, delegate: 'CPU' },
                runningMode: 'VIDEO',
                numFaces: 2,
                minFaceDetectionConfidence: 0.45,
                minFacePresenceConfidence: 0.45,
                minTrackingConfidence: 0.45,
                outputFaceBlendshapes: true,
                outputFacialTransformationMatrixes: true,
              });
              break;
            } catch {}
          }
        }
      }

      // 1.2 Load ResNet-34 Face Recognition Net (@vladmandic/face-api)
      if (!this.isFaceApiLoaded) {
        const faceapi = await getFaceApi();
        if (faceapi && faceapi.nets) {
          try {
            const modelUrl = asset('models/face_recognition');
            await faceapi.nets.faceRecognitionNet.loadFromUri(modelUrl);
            this.isFaceApiLoaded = true;
          } catch (modelErr) {
            console.warn('⚠️ face-api model load fallback to remote:', modelErr);
            try {
              await faceapi.nets.faceRecognitionNet.loadFromUri('https://cdn.jsdelivr.net/npm/@vladmandic/face-api/model');
              this.isFaceApiLoaded = true;
            } catch {}
          }
        }
      }

      this.isInitializing = false;
      return Boolean(this.faceLandmarker && this.isFaceApiLoaded);
    } catch (err) {
      console.error('❌ LivenessEngine initialization failed:', err);
      this.isInitializing = false;
      return false;
    }
  }

  /**
   * 2. Generate a secure anti-replay Nonce for this verification session
   */
  public createSessionNonce(): LivenessNonce {
    const nonce = typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : `nonce-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

    const session: LivenessNonce = {
      challengeId: `ch-${Date.now()}`,
      nonce,
      timestamp: Date.now(),
      expiresAt: Date.now() + 45000, // 45 seconds validity
      sequence: ['front', 'turn_left', 'turn_right'],
    };

    this.activeNonce = session;
    return session;
  }

  public getActiveNonce(): LivenessNonce | null {
    if (this.activeNonce && Date.now() > this.activeNonce.expiresAt) {
      this.activeNonce = null;
    }
    return this.activeNonce;
  }

  /**
   * 3. Process video frame through MediaPipe FaceLandmarker
   */
  public processVideoFrame(
    video: HTMLVideoElement,
    timestamp: number,
    currentLuminance: number = 120
  ): LivenessFrameData | null {
    if (!this.faceLandmarker || video.readyState < 2) return null;

    let res: FaceLandmarkerResult;
    try {
      res = this.faceLandmarker.detectForVideo(video, timestamp);
    } catch {
      return null;
    }

    const faceCount = res.faceLandmarks ? res.faceLandmarks.length : 0;

    // Quality gate validation
    const qualityGate: QualityGateState = {
      passed: false,
      luminance: currentLuminance,
      isTooDark: currentLuminance < 40,
      isTooBright: currentLuminance > 242,
      faceCount,
      isCentered: false,
      sizeRatio: 0,
      isSizeValid: false,
      errorMessageTh: null,
    };

    if (qualityGate.isTooDark) {
      qualityGate.errorMessageTh = 'แสงสว่างน้อยเกินไป กรุณาเพิ่มแสงไฟหน้ากล้อง';
      return { yawDeg: 0, pitchDeg: 0, rollDeg: 0, ear: 0, qualityGate };
    }

    if (faceCount === 0) {
      qualityGate.errorMessageTh = 'กรุณานั่งมองตรงเข้าหากล้องในกรอบวงรี';
      return { yawDeg: 0, pitchDeg: 0, rollDeg: 0, ear: 0, qualityGate };
    }

    if (faceCount > 1) {
      qualityGate.errorMessageTh = 'ตรวจพบมากกว่า 1 ใบหน้า กรุณาอยู่หน้ากล้องเพียงลำพัง';
      return { yawDeg: 0, pitchDeg: 0, rollDeg: 0, ear: 0, qualityGate };
    }

    const landmarks = res.faceLandmarks[0];
    if (!landmarks || landmarks.length < 468) return null;

    // Analytical landmarks
    const noseTip = landmarks[1];
    const leftCheek = landmarks[234];
    const rightCheek = landmarks[454];
    const chin = landmarks[152];
    const forehead = landmarks[10];

    // Compute bounding box
    let minX = 1, maxX = 0, minY = 1, maxY = 0;
    for (const pt of landmarks) {
      if (pt.x < minX) minX = pt.x;
      if (pt.x > maxX) maxX = pt.x;
      if (pt.y < minY) minY = pt.y;
      if (pt.y > maxY) maxY = pt.y;
    }

    const faceWidth = maxX - minX;
    const faceCenterX = (minX + maxX) / 2;
    const faceCenterY = (minY + maxY) / 2;

    qualityGate.sizeRatio = faceWidth;
    qualityGate.isSizeValid = faceWidth >= 0.16 && faceWidth <= 0.65;
    qualityGate.isCentered = faceCenterX >= 0.28 && faceCenterX <= 0.72 && faceCenterY >= 0.18 && faceCenterY <= 0.78;

    if (!qualityGate.isCentered) {
      qualityGate.errorMessageTh = 'กรุณาขยับใบหน้าให้อยู่กึ่งกลางกรอบวงรี';
    } else if (!qualityGate.isSizeValid) {
      qualityGate.errorMessageTh = faceWidth < 0.16
        ? 'กรุณาขยับเข้าใกล้กล้องอีกเล็กน้อย'
        : 'กรุณาถอยห่างจากกล้องอีกเล็กน้อย';
    } else {
      qualityGate.passed = true;
    }

    // Analytical Euler Yaw & Pitch Calculation
    // Using 3D depth disparity between left and right facial margins
    let yawDeg = 0;
    let pitchDeg = 0;
    let rollDeg = 0;

    // Try 4x4 facial transformation matrix if available
    if (res.facialTransformationMatrixes && res.facialTransformationMatrixes[0]) {
      const mat = res.facialTransformationMatrixes[0].data;
      // mat is 4x4 float array
      // Yaw = asin(-m[0][2]), Pitch = atan2(m[1][2], m[2][2])
      yawDeg = Math.asin(Math.max(-1, Math.min(1, -mat[2]))) * (180 / Math.PI);
      pitchDeg = Math.atan2(mat[6], mat[10]) * (180 / Math.PI);
      rollDeg = Math.atan2(mat[1], mat[0]) * (180 / Math.PI);
    } else {
      // Analytical 3D vector geometry fallback
      const dx = rightCheek.x - leftCheek.x;
      const dz = (rightCheek.z || 0) - (leftCheek.z || 0);
      yawDeg = Math.atan2(dz, Math.max(0.01, dx)) * (180 / Math.PI);

      const dy = chin.y - forehead.y;
      const dzy = (chin.z || 0) - (forehead.z || 0);
      pitchDeg = Math.atan2(dzy, Math.max(0.01, dy)) * (180 / Math.PI);
    }

    // Blendshape / landmark EAR (Eye Aspect Ratio)
    // Left eye: 33, 160, 158, 133, 153, 144
    // Right eye: 362, 385, 387, 263, 373, 380
    const leftEyeHeight = Math.abs(landmarks[159].y - landmarks[145].y);
    const leftEyeWidth = Math.abs(landmarks[133].x - landmarks[33].x);
    const rightEyeHeight = Math.abs(landmarks[386].y - landmarks[374].y);
    const rightEyeWidth = Math.abs(landmarks[263].x - landmarks[362].x);

    const ear = (
      (leftEyeHeight / Math.max(0.01, leftEyeWidth)) +
      (rightEyeHeight / Math.max(0.01, rightEyeWidth))
    ) / 2;

    return {
      yawDeg,
      pitchDeg,
      rollDeg,
      ear,
      qualityGate,
    };
  }

  /**
   * 4. Check if current frame satisfies active Liveness challenge
   * In mirrored Kiosk video:
   * - 'front': |Yaw| <= 10 deg
   * - 'turn_left': Patient turns head to their left -> on screen Yaw > +16 deg
   * - 'turn_right': Patient turns head to their right -> on screen Yaw < -16 deg
   */
  public evaluateChallenge(
    challenge: LivenessChallenge,
    frame: LivenessFrameData
  ): { satisfied: boolean; progressPercent: number; hintTh: string } {
    if (!frame.qualityGate.passed && challenge === 'front') {
      return {
        satisfied: false,
        progressPercent: 0,
        hintTh: frame.qualityGate.errorMessageTh || 'จัดใบหน้าให้อยู่ในกรอบวงรี',
      };
    }

    const yaw = frame.yawDeg;

    switch (challenge) {
      case 'front': {
        const isFacingFront = Math.abs(yaw) <= 12;
        const progress = Math.max(0, Math.min(100, Math.round((1 - Math.abs(yaw) / 14) * 100)));
        return {
          satisfied: isFacingFront,
          progressPercent: isFacingFront ? 100 : progress,
          hintTh: isFacingFront ? 'มองตรงเข้าหากล้อง ค้างไว้สักครู่' : 'กรุณามองตรงเข้าหากล้อง',
        };
      }
      case 'turn_left': {
        // Patient turns head to their left (yaw >= 16 deg)
        const targetDeg = 16;
        const satisfied = yaw >= targetDeg;
        const progress = Math.max(0, Math.min(100, Math.round((Math.max(0, yaw) / targetDeg) * 100)));
        return {
          satisfied,
          progressPercent: progress,
          hintTh: satisfied
            ? '✓ หันซ้ายถูกต้อง ค้างไว้ 1 วินาที'
            : `ค่อยๆ หันศีรษะไปทางซ้าย (${Math.round(Math.max(0, yaw))}° / ${targetDeg}°)`,
        };
      }
      case 'turn_right': {
        // Patient turns head to their right (yaw <= -16 deg)
        const targetDeg = -16;
        const satisfied = yaw <= targetDeg;
        const progress = Math.max(0, Math.min(100, Math.round((Math.min(0, yaw) / targetDeg) * 100)));
        return {
          satisfied,
          progressPercent: progress,
          hintTh: satisfied
            ? '✓ หันขวาถูกต้อง ค้างไว้ 1 วินาที'
            : `ค่อยๆ หันศีรษะไปทางขวา (${Math.round(Math.abs(Math.min(0, yaw)))}° / 16°)`,
        };
      }
    }
  }

  /**
   * 5. Extract REAL 128-D Biometric Embedding from video stream
   * STRICT PDPA:
   * - Crops face directly to offscreen canvas memory
   * - Computes 128 float vector with ResNet-34
   * - Discards pixels immediately
   * - NEVER writes photo or base64 to disk/storage
   */
  public async extractBiometricEmbedding(
    video: HTMLVideoElement
  ): Promise<number[] | null> {
    const faceapi = await getFaceApi();
    if (!faceapi || !faceapi.nets?.faceRecognitionNet?.isLoaded) {
      console.warn('⚠️ faceRecognitionNet not loaded, attempting initialize...');
      await this.initialize();
    }

    if (!this.offscreenCanvas || video.readyState < 2) return null;

    try {
      const canvas = this.offscreenCanvas;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) return null;

      // Crop face centered square
      const vw = video.videoWidth || 640;
      const vh = video.videoHeight || 480;
      const size = Math.min(vw, vh);
      const sx = (vw - size) / 2;
      const sy = (vh - size) / 2;

      ctx.drawImage(video, sx, sy, size, size, 0, 0, 160, 160);

      // Compute 128-D descriptor with face-api
      const descriptor = await faceapi.computeFaceDescriptor(canvas);
      if (!descriptor || descriptor.length !== 128) {
        return null;
      }

      // L2 Normalize descriptor
      let sumSq = 0;
      for (let i = 0; i < descriptor.length; i++) {
        sumSq += descriptor[i] * descriptor[i];
      }
      const norm = Math.sqrt(sumSq) || 1;
      const normalizedVector: number[] = new Array(128);
      for (let i = 0; i < 128; i++) {
        normalizedVector[i] = Number((descriptor[i] / norm).toFixed(6));
      }

      // Clean offscreen pixels
      ctx.clearRect(0, 0, 160, 160);

      return normalizedVector;
    } catch (err) {
      console.error('❌ Failed to compute biometric embedding:', err);
      return null;
    }
  }

  /**
   * 6. Compare two 128-D vectors using Cosine Similarity
   */
  public calculateCosineSimilarity(vA: number[], vB: number[]): number {
    if (vA.length !== 128 || vB.length !== 128) return 0;
    let dot = 0;
    let normA = 0;
    let normB = 0;
    for (let i = 0; i < 128; i++) {
      dot += vA[i] * vB[i];
      normA += vA[i] * vA[i];
      normB += vB[i] * vB[i];
    }
    const denom = Math.sqrt(normA) * Math.sqrt(normB);
    return denom > 0 ? dot / denom : 0;
  }

  /**
   * 7. Match an extracted 128-D vector against registered patient records
   */
  public matchPatient(
    extracted128: number[],
    registeredProfiles: BiometricVectorRecord[],
    threshold: number = 0.82
  ): { matched: BiometricVectorRecord | null; score: number } {
    let bestMatch: BiometricVectorRecord | null = null;
    let highestScore = 0;

    for (const profile of registeredProfiles) {
      const score = this.calculateCosineSimilarity(extracted128, profile.embedding128);
      if (score > highestScore) {
        highestScore = score;
        bestMatch = profile;
      }
    }

    if (highestScore >= threshold && bestMatch) {
      return { matched: bestMatch, score: highestScore };
    }

    return { matched: null, score: highestScore };
  }
}

export const livenessEngine = LivenessEngine.getInstance();
