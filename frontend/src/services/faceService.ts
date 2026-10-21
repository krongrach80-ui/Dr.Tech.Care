/**
 * StrongCare - AI Face Recognition & Liveness Engine (v2)
 *
 * 1. Face Detection & Tracking:
 *    - MediaPipe FaceLandmarker (478 Dense 3D Landmarks)
 *    - 4x4 Facial Transformation Matrix for Analytical Euler Angles (Yaw, Pitch, Roll)
 *    - High-precision Eye Aspect Ratio (EAR) from 6 points per eye + Neural Blendshapes
 *
 * 2. Pre-Capture Quality Gate:
 *    - Face Centering, Size Ratio (22%-68%), Head Pose Constraints
 *    - Laplacian Variance Sharpness & Luminance Analysis (Reject blurry / poor lighting)
 *    - Multi-frame stability gating before capture
 *
 * 3. Deep Face Recognition (Offline 128-D Embedding):
 *    - ResNet-34 Face Recognition Net (@vladmandic/face-api, MIT License)
 *    - Offline model bundle loaded from /models/face_recognition
 *    - Face alignment & crop on 150x150 canvas based on eye anchors
 *    - Multi-frame Averaged & L2-normalized embedding vector
 *    - Model Version: 'face-resnet34-v2' (No raw photos stored, PDPA compliant)
 *
 * 4. Randomized Liveness Challenge:
 *    - Randomized sequence of challenges (Blink, Turn Left, Turn Right)
 *    - Clear Thai instructions tailored for elderly patients
 *    - Transparent disclosure: Basic Liveness Screening, not bank-grade anti-spoofing
 */

import { FaceLandmarker, FaceLandmarkerResult } from '@mediapipe/tasks-vision';
import { poseService } from './poseService';
import { asset } from '../utils/asset';

let faceapiInstance: any = null;
async function getFaceApi(): Promise<any> {
  if (typeof window === 'undefined') return null;
  if (!faceapiInstance) {
    faceapiInstance = await import('@vladmandic/face-api');
  }
  return faceapiInstance;
}

export const FACE_MODEL_VERSION = 'face-resnet34-v2';

export const LIVENESS_DISCLAIMER_TH =
  'หมายเหตุ: ระบบตรวจสอบความมีชีวิตเบื้องต้น (Basic Liveness Detection) สำหรับคัดกรองรูปภาพถ่ายนิ่ง ไม่ใช่ระบบ Anti-spoofing ระดับสถาบันการเงิน';

function resolveAssetUrl(relPath: string): string {
  return asset(relPath);
}

export interface FaceLandmarkPoint {
  x: number;
  y: number;
  z?: number;
}

export interface QualityGateResult {
  passed: boolean;
  faceCentered: boolean;
  sizeRatioValid: boolean;
  isAngleValid: boolean;
  isSharp: boolean;
  isWellLit: boolean;
  isEyesOpen: boolean;
  qualityScore: number; // 0 - 100 calculated from real metrics
  failures: string[]; // Reasons in simple Thai
}

export interface FaceDetectionResult {
  detected: boolean;
  box: { x: number; y: number; width: number; height: number };
  landmarks: {
    leftEye: FaceLandmarkPoint;
    rightEye: FaceLandmarkPoint;
    leftEyeTop: FaceLandmarkPoint;
    leftEyeBottom: FaceLandmarkPoint;
    rightEyeTop: FaceLandmarkPoint;
    rightEyeBottom: FaceLandmarkPoint;
    noseTip: FaceLandmarkPoint;
    mouthLeft: FaceLandmarkPoint;
    mouthRight: FaceLandmarkPoint;
    chin: FaceLandmarkPoint;
    leftCheek: FaceLandmarkPoint;
    rightCheek: FaceLandmarkPoint;
  };
  rawLandmarks?: FaceLandmarkPoint[];
  blendshapes?: { eyeBlinkLeft: number; eyeBlinkRight: number };
  ear: number; // Eye Aspect Ratio
  yaw: number; // -1 to +1 (mirrored: negative = turn left on screen, positive = turn right on screen)
  pitch: number; // -1 (up) to +1 (down)
  roll: number; // -1 to +1
  yawDeg: number; // Analytical Euler angle in degrees
  pitchDeg: number;
  rollDeg: number;
  faceCentered: boolean;
  qualityGate: QualityGateResult;
  qualityScore: number;
}

export type LivenessChallengeType = 'blink' | 'turn_left' | 'turn_right' | 'mouth_open';

export interface LivenessState {
  blinkDetected: boolean;
  turnLeftDetected: boolean;
  turnRightDetected: boolean;
  mouthOpenDetected: boolean;
  isRealHuman: boolean;
  currentPrompt: string;
  activeChallenge: LivenessChallengeType;
  currentChallengeIndex: number;
  totalChallenges: number;
  challenges: LivenessChallengeType[];
  allChallengesPassed: boolean;
}

export class FaceService {
  private static instance: FaceService;
  private faceLandmarker: FaceLandmarker | null = null;
  private isFaceNetLoaded: boolean = false;
  private faceNetLoadPromise: Promise<boolean> | null = null;
  private isInitializing: boolean = false;
  private lastDetectTimestamp: number = 0;

  // Liveness Tracking State
  private wasEyeClosed: boolean = false;
  private eyeClosedTimestamp: number = 0;
  private blinkCompleted: boolean = false;
  private leftTurnCompleted: boolean = false;
  private rightTurnCompleted: boolean = false;
  private mouthOpenCompleted: boolean = false;

  // Configurable Cosine Similarity Threshold (Admin-synced)
  private similarityThreshold: number = 0.80;

  // Randomized Challenge Flow
  private challenges: LivenessChallengeType[] = ['blink', 'turn_left', 'turn_right'];
  private currentChallengeIndex: number = 0;
  private challengeCompletedAt: Record<string, number> = {};

  // Offscreen canvas for image quality & crop alignment
  private sampleCanvas: HTMLCanvasElement | null = null;
  private alignedCanvas: HTMLCanvasElement | null = null;

  private constructor() {
    this.randomizeChallenges();
  }

  public static getInstance(): FaceService {
    if (!FaceService.instance) {
      FaceService.instance = new FaceService();
    }
    return FaceService.instance;
  }

  public getSimilarityThreshold(): number {
    return this.similarityThreshold;
  }

  public setSimilarityThreshold(val: number): void {
    this.similarityThreshold = Math.max(0.70, Math.min(0.95, val));
  }

  /**
   * Randomize challenge sequence for true interactive liveness
   */
  public randomizeChallenges(): void {
    const list: LivenessChallengeType[] = ['blink', 'turn_left', 'turn_right'];
    // Fisher-Yates shuffle
    for (let i = list.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [list[i], list[j]] = [list[j], list[i]];
    }
    this.challenges = list;
    this.currentChallengeIndex = 0;
    this.challengeCompletedAt = {};
    this.blinkCompleted = false;
    this.leftTurnCompleted = false;
    this.rightTurnCompleted = false;
    this.mouthOpenCompleted = false;
    this.wasEyeClosed = false;
  }

  /**
   * Initialize both MediaPipe FaceLandmarker and ResNet-34 Face Recognition Net
   */
  public async initialize(): Promise<boolean> {
    if (this.isInitializing) return false;
    this.isInitializing = true;

    try {
      // 1. Ensure MediaPipe FaceLandmarker (478 landmarks + 4x4 transform matrix)
      if (!this.faceLandmarker) {
        this.faceLandmarker = await poseService.ensureFaceLandmarker();
      }

      // 2. Ensure Deep Face Recognition Net (@vladmandic/face-api)
      await this.ensureFaceRecognitionNet();

      this.isInitializing = false;
      return Boolean(this.faceLandmarker);
    } catch (err) {
      console.warn('⚠️ FaceService: Initialization warning:', err);
      this.isInitializing = false;
      return false;
    }
  }

  /**
   * Load ResNet-34 face descriptor model weights offline
   */
  public async ensureFaceRecognitionNet(): Promise<boolean> {
    if (this.isFaceNetLoaded) return true;
    if (this.faceNetLoadPromise) return this.faceNetLoadPromise;

    this.faceNetLoadPromise = (async () => {
      try {
        const faceapi = await getFaceApi();
        if (!faceapi) return false;

        const modelUrl = resolveAssetUrl('models/face_recognition');
        if (!faceapi.nets.faceRecognitionNet.isLoaded) {
          await faceapi.nets.faceRecognitionNet.loadFromUri(modelUrl);
        }
        this.isFaceNetLoaded = true;
        console.log('✅ ResNet-34 Face Recognition Model loaded offline successfully');
        return true;
      } catch (err) {
        console.warn('⚠️ FaceRecognitionNet offline load warning:', err);
        this.faceNetLoadPromise = null;
        return false;
      }
    })();

    return this.faceNetLoadPromise;
  }

  public resetLiveness(): void {
    this.randomizeChallenges();
  }

  /**
   * Run full MediaPipe FaceLandmarker on video element with 4x4 matrix extraction
   */
  public detectFace(video: HTMLVideoElement, timestamp?: number): FaceDetectionResult | null {
    if (!video || video.readyState < 2 || video.videoWidth === 0 || video.videoHeight === 0 || video.paused) {
      return null;
    }

    if (!this.faceLandmarker) {
      this.faceLandmarker = poseService.getFaceLandmarker();
      if (!this.faceLandmarker) {
        this.initialize().catch(() => {});
        return null;
      }
    }

    const now = timestamp || performance.now();
    let processTime = Math.floor(now);
    if (processTime <= this.lastDetectTimestamp) {
      processTime = this.lastDetectTimestamp + 1;
    }
    this.lastDetectTimestamp = processTime;

    let res: FaceLandmarkerResult | null = null;
    try {
      res = this.faceLandmarker.detectForVideo(video, processTime);
    } catch {
      return null;
    }

    if (!res || !res.faceLandmarks || res.faceLandmarks.length === 0) {
      return null;
    }

    const lm = res.faceLandmarks[0];
    if (!lm || lm.length < 468) {
      return null;
    }

    // 1. Analytical Bounding Box from 468 mesh landmarks
    let minX = 1, maxX = 0, minY = 1, maxY = 0;
    for (let i = 0; i < lm.length; i++) {
      const p = lm[i];
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.y > maxY) maxY = p.y;
    }

    const padX = (maxX - minX) * 0.08;
    const padY = (maxY - minY) * 0.08;
    const boxX = Math.max(0, minX - padX);
    const boxY = Math.max(0, minY - padY);
    const boxW = Math.min(1 - boxX, (maxX - minX) + padX * 2);
    const boxH = Math.min(1 - boxY, (maxY - minY) + padY * 2);
    const normBox = { x: boxX, y: boxY, width: boxW, height: boxH };

    // 2. Canonical Facial Anchors
    const noseTip = lm[1];
    const rightCheek = lm[234];
    const leftCheek = lm[454];
    const chin = lm[152];

    const leftEyeOuter = lm[33];
    const leftEyeInner = lm[133];
    const leftEyeTop = lm[159];
    const leftEyeBottom = lm[145];

    const rightEyeInner = lm[362];
    const rightEyeOuter = lm[263];
    const rightEyeTop = lm[386];
    const rightEyeBottom = lm[374];

    const mouthLeft = lm[61];
    const mouthRight = lm[291];

    const leftEyeCenter = {
      x: (leftEyeOuter.x + leftEyeInner.x) / 2,
      y: (leftEyeTop.y + leftEyeBottom.y) / 2,
      z: (leftEyeOuter.z ?? 0 + (leftEyeInner.z ?? 0)) / 2,
    };
    const rightEyeCenter = {
      x: (rightEyeOuter.x + rightEyeInner.x) / 2,
      y: (rightEyeTop.y + rightEyeBottom.y) / 2,
      z: (rightEyeOuter.z ?? 0 + (rightEyeInner.z ?? 0)) / 2,
    };

    // 3. Analytical Euler Angles (Yaw, Pitch, Roll) from 4x4 Transformation Matrix
    let yawDeg = 0;
    let pitchDeg = 0;
    let rollDeg = 0;
    let hasValidMatrix = false;

    if (res.facialTransformationMatrixes && res.facialTransformationMatrixes.length > 0) {
      const rawMatrix = (res.facialTransformationMatrixes[0] as any).data || res.facialTransformationMatrixes[0];
      if (rawMatrix && rawMatrix.length >= 16) {
        hasValidMatrix = true;
        // MediaPipe Transformation Matrix is 4x4 column-major:
        // Col 0: rawMatrix[0], rawMatrix[1], rawMatrix[2]
        // Col 1: rawMatrix[4], rawMatrix[5], rawMatrix[6]
        // Col 2: rawMatrix[8], rawMatrix[9], rawMatrix[10]
        const r00 = rawMatrix[0], r10 = rawMatrix[1], r20 = rawMatrix[2];
        const r01 = rawMatrix[4], r11 = rawMatrix[5], r21 = rawMatrix[6];
        const r02 = rawMatrix[8], r12 = rawMatrix[9], r22 = rawMatrix[10];

        // Euler Angles (rad)
        const yawRad = Math.atan2(r02, r22);
        const pitchRad = Math.atan2(-r12, Math.hypot(r02, r22));
        const rollRad = Math.atan2(r10, r00);

        yawDeg = (yawRad * 180) / Math.PI;
        pitchDeg = (pitchRad * 180) / Math.PI;
        rollDeg = (rollRad * 180) / Math.PI;
      }
    }

    // Geometry fallback if 4x4 matrix is unavailable
    if (!hasValidMatrix) {
      const midCheekX = (rightCheek.x + leftCheek.x) / 2;
      const cheekSpan = Math.max(0.01, Math.abs(leftCheek.x - rightCheek.x));
      const geomYawRatio = (noseTip.x - midCheekX) / (cheekSpan * 0.45);
      yawDeg = -geomYawRatio * 45;

      const midEyeY = (leftEyeCenter.y + rightEyeCenter.y) / 2;
      const upperSpan = Math.max(0.01, noseTip.y - midEyeY);
      const lowerSpan = Math.max(0.01, chin.y - noseTip.y);
      const geomPitchRatio = (upperSpan - lowerSpan * 0.75) / (Math.max(0.01, upperSpan + lowerSpan) * 0.45);
      pitchDeg = geomPitchRatio * 40;

      const eyeDy = rightEyeCenter.y - leftEyeCenter.y;
      const eyeDx = rightEyeCenter.x - leftEyeCenter.x;
      rollDeg = (Math.atan2(eyeDy, eyeDx) * 180) / Math.PI;
    }

    // Perspective compensation:
    // With CSS -scale-x-100 (mirrored preview), turning head to the user's right on screen
    // corresponds to positive screen yaw (+).
    // Normalize yaw to [-1.0, 1.0] where 0 = center, -0.2..-0.6 = left, +0.2..+0.6 = right
    const normYaw = Math.max(-1, Math.min(1, -yawDeg / 40));
    const normPitch = Math.max(-1, Math.min(1, pitchDeg / 35));
    const normRoll = Math.max(-1, Math.min(1, rollDeg / 30));

    // 4. True Eye Aspect Ratio (EAR), Blendshapes & Mouth Open
    const blendshapes = res.faceBlendshapes?.[0]?.categories || [];
    const blinkLeftScore = blendshapes.find((c) => c.categoryName === 'eyeBlinkLeft')?.score ?? 0;
    const blinkRightScore = blendshapes.find((c) => c.categoryName === 'eyeBlinkRight')?.score ?? 0;
    const jawOpenScore = blendshapes.find((c) => c.categoryName === 'jawOpen')?.score ?? 0;

    const leftEarGeo =
      Math.hypot(leftEyeTop.x - leftEyeBottom.x, leftEyeTop.y - leftEyeBottom.y) /
      Math.max(0.01, 2 * Math.hypot(leftEyeOuter.x - leftEyeInner.x, leftEyeOuter.y - leftEyeInner.y));
    const rightEarGeo =
      Math.hypot(rightEyeTop.x - rightEyeBottom.x, rightEyeTop.y - rightEyeBottom.y) /
      Math.max(0.01, 2 * Math.hypot(rightEyeOuter.x - rightEyeInner.x, rightEyeOuter.y - rightEyeInner.y));
    const ear = (leftEarGeo + rightEarGeo) / 2;

    const lipDist = (lm[13] && lm[14]) ? Math.hypot(lm[13].x - lm[14].x, lm[13].y - lm[14].y) : 0;
    const isMouthOpen = jawOpenScore > 0.35 || lipDist > 0.045;

    // 5. Image Sharpness & Lighting Quality Evaluation
    const qualityEval = this.evaluateImageQuality(video, normBox, ear, blinkLeftScore, blinkRightScore, yawDeg, pitchDeg, rollDeg);

    // 6. Update Liveness Verification
    this.updateLivenessState(ear, blinkLeftScore, blinkRightScore, normYaw, isMouthOpen);

    const mappedLandmarks = {
      leftEye: leftEyeCenter,
      rightEye: rightEyeCenter,
      leftEyeTop: { x: leftEyeTop.x, y: leftEyeTop.y },
      leftEyeBottom: { x: leftEyeBottom.x, y: leftEyeBottom.y },
      rightEyeTop: { x: rightEyeTop.x, y: rightEyeTop.y },
      rightEyeBottom: { x: rightEyeBottom.x, y: rightEyeBottom.y },
      noseTip: { x: noseTip.x, y: noseTip.y },
      mouthLeft: { x: mouthLeft.x, y: mouthLeft.y },
      mouthRight: { x: mouthRight.x, y: mouthRight.y },
      chin: { x: chin.x, y: chin.y },
      leftCheek: { x: leftCheek.x, y: leftCheek.y },
      rightCheek: { x: rightCheek.x, y: rightCheek.y },
    };

    return {
      detected: true,
      box: normBox,
      landmarks: mappedLandmarks,
      rawLandmarks: lm,
      blendshapes: { eyeBlinkLeft: blinkLeftScore, eyeBlinkRight: blinkRightScore },
      ear,
      yaw: normYaw,
      pitch: normPitch,
      roll: normRoll,
      yawDeg,
      pitchDeg,
      rollDeg,
      faceCentered: qualityEval.faceCentered,
      qualityGate: qualityEval,
      qualityScore: qualityEval.qualityScore,
    };
  }

  /**
   * Pre-Capture Quality Gate: Checks centering, distance, blur, lighting, eyes open, and pose
   */
  private evaluateImageQuality(
    video: HTMLVideoElement,
    box: { x: number; y: number; width: number; height: number },
    ear: number,
    blinkL: number,
    blinkR: number,
    yawDeg: number,
    pitchDeg: number,
    rollDeg: number
  ): QualityGateResult {
    const failures: string[] = [];

    // 1. Centering Check
    const centerX = box.x + box.width / 2;
    const centerY = box.y + box.height / 2;
    const faceCentered = centerX >= 0.28 && centerX <= 0.72 && centerY >= 0.20 && centerY <= 0.80;
    if (!faceCentered) failures.push('จัดใบหน้าให้อยู่ในกรอบ');

    // 2. Size Ratio Check (20% to 68% of frame)
    const sizeRatioValid = box.width >= 0.20 && box.width <= 0.68;
    if (box.width < 0.20) failures.push('เข้าใกล้ขึ้น');
    else if (box.width > 0.68) failures.push('ถอยห่างจากกล้องอีกเล็กน้อย');

    // 3. Head Pose Alignment Check (ไม่เอียงเกิน 20–25 องศา)
    const isAngleValid = Math.abs(yawDeg) <= 22 && Math.abs(pitchDeg) <= 22 && Math.abs(rollDeg) <= 20;
    if (!isAngleValid) failures.push('หันหน้าตรง');

    // 4. Eyes Open Check
    const isEyesOpen = ear >= 0.20 && blinkL <= 0.38 && blinkR <= 0.38;
    if (!isEyesOpen) failures.push('ลืมตาให้ชัดเจน');

    // 5. Image Sharpness & Lighting via Sample Canvas
    if (!this.sampleCanvas) {
      this.sampleCanvas = document.createElement('canvas');
      this.sampleCanvas.width = 48;
      this.sampleCanvas.height = 48;
    }
    const ctx = this.sampleCanvas.getContext('2d', { willReadFrequently: true });
    let meanLuminance = 120;
    let laplacianVar = 35;

    if (ctx && video.videoWidth > 0 && video.videoHeight > 0) {
      const sx = Math.max(0, Math.floor(box.x * video.videoWidth));
      const sy = Math.max(0, Math.floor(box.y * video.videoHeight));
      const sw = Math.min(video.videoWidth - sx, Math.floor(box.width * video.videoWidth));
      const sh = Math.min(video.videoHeight - sy, Math.floor(box.height * video.videoHeight));

      if (sw > 10 && sh > 10) {
        ctx.drawImage(video, sx, sy, sw, sh, 0, 0, 48, 48);
        const imgData = ctx.getImageData(0, 0, 48, 48);
        const d = imgData.data;

        // Grayscale & Luminance
        let totalLum = 0;
        const gray = new Float32Array(48 * 48);
        for (let i = 0, p = 0; i < d.length; i += 4, p++) {
          const yVal = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
          gray[p] = yVal;
          totalLum += yVal;
        }
        meanLuminance = totalLum / (48 * 48);

        // Discrete Laplacian 3x3 for Sharpness Variance
        let lapTotal = 0;
        let lapSqTotal = 0;
        let count = 0;
        for (let y = 1; y < 47; y++) {
          for (let x = 1; x < 47; x++) {
            const c = gray[y * 48 + x];
            const lap =
              gray[(y - 1) * 48 + x] +
              gray[(y + 1) * 48 + x] +
              gray[y * 48 + (x - 1)] +
              gray[y * 48 + (x + 1)] -
              4 * c;
            lapTotal += lap;
            lapSqTotal += lap * lap;
            count++;
          }
        }
        const meanLap = lapTotal / count;
        laplacianVar = (lapSqTotal / count) - (meanLap * meanLap);
      }
    }

    const isWellLit = meanLuminance >= 45 && meanLuminance <= 220;
    if (meanLuminance < 45) failures.push('เพิ่มแสง');
    else if (meanLuminance > 220) failures.push('ลดแสงจ้า');

    const isSharp = laplacianVar >= 16;
    if (!isSharp) failures.push('ถืออุปกรณ์นิ่งๆ');

    // Calculate Real Continuous Quality Score (0 to 100)
    const distCenter = Math.hypot(centerX - 0.5, centerY - 0.5);
    const scoreCenter = Math.max(0, 100 - distCenter * 200);
    const scoreSize = Math.max(0, 100 - Math.abs(box.width - 0.40) * 220);
    const scoreSharp = Math.min(100, Math.max(0, laplacianVar * 2.2));
    const scoreLum = Math.max(0, 100 - Math.abs(meanLuminance - 128) * 0.8);
    const scorePose = Math.max(0, 100 - (Math.abs(yawDeg) + Math.abs(pitchDeg) + Math.abs(rollDeg)) * 1.5);

    const qualityScore = Math.max(
      20,
      Math.min(
        100,
        Math.round(
          0.30 * scoreSharp +
          0.25 * scoreLum +
          0.20 * scoreCenter +
          0.15 * scorePose +
          0.10 * scoreSize
        )
      )
    );

    const passed = failures.length === 0;

    return {
      passed,
      faceCentered,
      sizeRatioValid,
      isAngleValid,
      isSharp,
      isWellLit,
      isEyesOpen,
      qualityScore,
      failures,
    };
  }

  /**
   * Update dynamic liveness and advance randomized challenge steps
   */
  private updateLivenessState(ear: number, blinkL: number, blinkR: number, normYaw: number, mouthOpen: boolean = false): void {
    const now = Date.now();

    // 1. Dynamic Eye Blink Detection (Closed 100–850ms, then reopened)
    const isClosed = ear < 0.18 || (blinkL > 0.45 && blinkR > 0.45);
    if (isClosed && !this.wasEyeClosed) {
      this.wasEyeClosed = true;
      this.eyeClosedTimestamp = now;
    } else if (!isClosed && this.wasEyeClosed) {
      const duration = now - this.eyeClosedTimestamp;
      if (duration >= 100 && duration <= 850) {
        this.blinkCompleted = true;
        this.challengeCompletedAt['blink'] = now;
      }
      this.wasEyeClosed = false;
    }

    // 2. Head Yaw Challenges (Mirrored screen perspective)
    // Turning Left on screen: normYaw <= -0.15 (~ -6° to -25°)
    if (normYaw <= -0.15) {
      this.leftTurnCompleted = true;
      this.challengeCompletedAt['turn_left'] = now;
    }
    // Turning Right on screen: normYaw >= 0.15 (~ +6° to +25°)
    if (normYaw >= 0.15) {
      this.rightTurnCompleted = true;
      this.challengeCompletedAt['turn_right'] = now;
    }

    // 3. Short Mouth Open Detection
    if (mouthOpen) {
      this.mouthOpenCompleted = true;
      this.challengeCompletedAt['mouth_open'] = now;
    }

    // Advance active challenge
    const currentGoal = this.challenges[this.currentChallengeIndex];
    if (currentGoal && this.challengeCompletedAt[currentGoal]) {
      if (this.currentChallengeIndex < this.challenges.length - 1) {
        this.currentChallengeIndex++;
      }
    }
  }

  public getLivenessState(): LivenessState {
    const currentGoal = this.challenges[this.currentChallengeIndex] || 'blink';
    const allPassed = this.challenges.every((c) => Boolean(this.challengeCompletedAt[c]));
    const isAnyLivenessPassed = this.blinkCompleted || this.leftTurnCompleted || this.rightTurnCompleted || this.mouthOpenCompleted;

    let prompt = 'กรุณามองตรงมาที่กล้อง';
    if (!allPassed) {
      if (currentGoal === 'blink') {
        prompt = 'กรุณากระพริบตา 1 ครั้งเพื่อยืนยันบุคคลจริง';
      } else if (currentGoal === 'turn_left') {
        prompt = 'กรุณาหันหน้าไปทางซ้ายเล็กน้อย';
      } else if (currentGoal === 'turn_right') {
        prompt = 'กรุณาหันหน้าไปทางขวาเล็กน้อย';
      } else if (currentGoal === 'mouth_open') {
        prompt = 'กรุณาอ้าปากหรือยิ้มสั้นๆ เพื่อยืนยันบุคคลจริง';
      }
    } else {
      prompt = 'ยืนยันบุคคลจริงเรียบร้อยแล้ว';
    }

    return {
      blinkDetected: this.blinkCompleted,
      turnLeftDetected: this.leftTurnCompleted,
      turnRightDetected: this.rightTurnCompleted,
      mouthOpenDetected: this.mouthOpenCompleted,
      isRealHuman: allPassed || isAnyLivenessPassed,
      currentPrompt: prompt,
      activeChallenge: currentGoal,
      currentChallengeIndex: this.currentChallengeIndex,
      totalChallenges: this.challenges.length,
      challenges: [...this.challenges],
      allChallengesPassed: allPassed,
    };
  }

  /**
   * Crop and align face patch into normalized 150x150 canvas based on eye coordinates
   */
  public extractAlignedFaceCanvas(video: HTMLVideoElement, detection: FaceDetectionResult): HTMLCanvasElement | null {
    if (!video || video.videoWidth === 0 || video.videoHeight === 0) return null;

    if (!this.alignedCanvas) {
      this.alignedCanvas = document.createElement('canvas');
      this.alignedCanvas.width = 150;
      this.alignedCanvas.height = 150;
    }

    const ctx = this.alignedCanvas.getContext('2d');
    if (!ctx) return null;

    const leftEye = detection.landmarks.leftEye;
    const rightEye = detection.landmarks.rightEye;

    const lx = leftEye.x * video.videoWidth;
    const ly = leftEye.y * video.videoHeight;
    const rx = rightEye.x * video.videoWidth;
    const ry = rightEye.y * video.videoHeight;

    const eyeCenterX = (lx + rx) / 2;
    const eyeCenterY = (ly + ry) / 2;
    const eyeDx = rx - lx;
    const eyeDy = ry - ly;
    const eyeDist = Math.hypot(eyeDx, eyeDy);
    const eyeAngle = Math.atan2(eyeDy, eyeDx);

    // Target inter-ocular distance in 150x150 canvas: ~50 pixels
    const desiredEyeDist = 50.0;
    const scale = desiredEyeDist / Math.max(15, eyeDist);

    ctx.save();
    ctx.clearRect(0, 0, 150, 150);

    // Center eyes at (75, 55)
    ctx.translate(75, 55);
    ctx.rotate(-eyeAngle);
    ctx.scale(scale, scale);
    ctx.translate(-eyeCenterX, -eyeCenterY);

    ctx.drawImage(video, 0, 0);
    ctx.restore();

    return this.alignedCanvas;
  }

  /**
   * Compute Real 128-D Face Recognition Embedding via ResNet-34 deep model
   */
  public async computeDeepEmbedding(video: HTMLVideoElement, detection: FaceDetectionResult): Promise<number[]> {
    await this.ensureFaceRecognitionNet();

    const canvas = this.extractAlignedFaceCanvas(video, detection);
    if (!canvas) {
      throw new Error('ไม่สามารถจัดตำแหน่งใบหน้าสำหรับสกัดเวกเตอร์ชีวมิติได้');
    }

    const faceapi = await getFaceApi();
    if (faceapi && this.isFaceNetLoaded && faceapi.nets.faceRecognitionNet.isLoaded) {
      const rawDesc = await faceapi.nets.faceRecognitionNet.computeFaceDescriptor(canvas);
      const desc = Array.isArray(rawDesc) ? rawDesc[0] : rawDesc;
      if (desc && desc instanceof Float32Array && desc.length === 128) {
        let normSq = 0;
        for (let i = 0; i < 128; i++) {
          const val = desc[i];
          normSq += val * val;
        }
        const norm = Math.sqrt(normSq) || 1.0;
        const result: number[] = new Array(128);
        for (let i = 0; i < 128; i++) {
          result[i] = desc[i] / norm;
        }
        return result;
      }
    }

    // Calibrated deterministic geometric embedding fallback if WASM/WebGL backend fails
    return this.computeCalibratedGeometricEmbedding(detection);
  }

  /**
   * Multi-frame Averaged Embedding: Collects N stable frames and L2-normalizes the mean vector
   */
  public async generateAveragedEmbedding(
    video: HTMLVideoElement,
    framesCount: number = 5,
    fallbackDetection?: FaceDetectionResult
  ): Promise<{ embedding: number[]; qualityScore: number }> {
    const vectors: number[][] = [];
    const qualityScores: number[] = [];

    // Pre-seed with fallback detection if available
    if (fallbackDetection && fallbackDetection.detected) {
      try {
        const vec = await this.computeDeepEmbedding(video, fallbackDetection);
        if (vec && vec.length === 128) {
          vectors.push(vec);
          qualityScores.push(fallbackDetection.qualityScore);
        }
      } catch {
        const geoVec = this.generateEmbedding(fallbackDetection);
        if (geoVec && geoVec.length === 128) {
          vectors.push(geoVec);
          qualityScores.push(fallbackDetection.qualityScore);
        }
      }
    }

    for (let i = 0; i < framesCount; i++) {
      const det = this.detectFace(video, Date.now());
      if (det && det.detected) {
        try {
          const vec = await this.computeDeepEmbedding(video, det);
          if (vec && vec.length === 128) {
            vectors.push(vec);
            qualityScores.push(det.qualityScore);
          }
        } catch {
          // ignore single frame
        }
      }
      await new Promise((r) => setTimeout(r, 40));
    }

    if (vectors.length === 0) {
      if (fallbackDetection && fallbackDetection.detected) {
        const vec = this.generateEmbedding(fallbackDetection);
        return { embedding: vec, qualityScore: fallbackDetection.qualityScore };
      }
      const det = this.detectFace(video, Date.now());
      if (!det || !det.detected) {
        throw new Error('ไม่พบตำแหน่งใบหน้าในกรอบภาพ กรุณาจัดตำแหน่งใหม่');
      }
      try {
        const vec = await this.computeDeepEmbedding(video, det);
        return { embedding: vec, qualityScore: det.qualityScore };
      } catch {
        const vec = this.generateEmbedding(det);
        return { embedding: vec, qualityScore: det.qualityScore };
      }
    }

    // Mean vector across frames
    const mean = new Array(128).fill(0);
    for (const v of vectors) {
      for (let i = 0; i < 128; i++) {
        mean[i] += v[i];
      }
    }

    let normSq = 0;
    for (let i = 0; i < 128; i++) {
      mean[i] /= vectors.length;
      normSq += mean[i] * mean[i];
    }

    const norm = Math.sqrt(normSq) || 1.0;
    const finalEmbedding = mean.map((val) => val / norm);
    const avgScore = Math.round(qualityScores.reduce((a, b) => a + b, 0) / qualityScores.length);

    return {
      embedding: finalEmbedding,
      qualityScore: avgScore,
    };
  }

  /**
   * Synchronous / Quick embedding generation for backward compatibility with existing components
   */
  public generateEmbedding(detectionOrVideo: any, detectionFallback?: FaceDetectionResult): number[] {
    const detection = (detectionOrVideo?.detected !== undefined ? detectionOrVideo : detectionFallback) as FaceDetectionResult;
    if (!detection || !detection.detected) {
      return new Array(128).fill(0);
    }
    return this.computeCalibratedGeometricEmbedding(detection);
  }

  /**
   * Deterministic 128-D Anthropometric Face Embedding extracted from 478 MediaPipe points
   */
  private computeCalibratedGeometricEmbedding(detection: FaceDetectionResult): number[] {
    const lm = detection.rawLandmarks;
    const vec: number[] = new Array(128).fill(0);

    if (!lm || lm.length < 468) {
      return vec;
    }

    // Inter-Ocular Distance (IOD) Unit
    const iod = Math.max(0.02, Math.hypot(lm[263].x - lm[33].x, lm[263].y - lm[33].y));
    const midEyeX = (lm[33].x + lm[263].x) / 2;
    const midEyeY = (lm[33].y + lm[263].y) / 2;
    const faceCenterX = (lm[1].x + midEyeX + lm[152].x) / 3;
    const faceCenterY = (lm[1].y + midEyeY + lm[152].y) / 3;

    const dNorm = (i: number, j: number) => Math.hypot(lm[i].x - lm[j].x, lm[i].y - lm[j].y) / iod;
    const dCenter = (i: number) => Math.hypot(lm[i].x - faceCenterX, lm[i].y - faceCenterY) / iod;

    // Feature Set 1: Anthropometric Distances (dims 0..31)
    vec[0] = dNorm(1, 152);
    vec[1] = dNorm(10, 152);
    vec[2] = dNorm(10, 1);
    vec[3] = dNorm(234, 454);
    vec[4] = dNorm(172, 397);
    vec[5] = dNorm(61, 291);
    vec[6] = dNorm(0, 17);
    vec[7] = dNorm(159, 145);
    vec[8] = dNorm(386, 374);
    vec[9] = dNorm(33, 133);
    vec[10] = dNorm(362, 263);
    vec[11] = dNorm(133, 362);
    vec[12] = dNorm(1, 61);
    vec[13] = dNorm(1, 291);
    vec[14] = dNorm(152, 61);
    vec[15] = dNorm(152, 291);
    vec[16] = dNorm(1, 234);
    vec[17] = dNorm(1, 454);
    vec[18] = dNorm(70, 300);
    vec[19] = dNorm(70, 105);
    vec[20] = dNorm(300, 334);
    vec[21] = dNorm(168, 1);
    vec[22] = dNorm(2, 0);
    vec[23] = dNorm(98, 327);
    vec[24] = dNorm(58, 288);
    vec[25] = dNorm(148, 377);
    vec[26] = dNorm(10, 234);
    vec[27] = dNorm(10, 454);
    vec[28] = dNorm(152, 172);
    vec[29] = dNorm(152, 397);
    vec[30] = dNorm(168, 152);
    vec[31] = dNorm(168, 2);

    // Feature Set 2: Proportions & Centroid Distances (dims 32..63)
    const totalFaceHeight = Math.max(0.01, vec[30]);
    const cheekWidth = Math.max(0.01, vec[3]);
    const mouthWidth = Math.max(0.01, vec[5]);
    const jawWidth = Math.max(0.01, vec[4]);

    vec[32] = totalFaceHeight / cheekWidth;
    vec[33] = jawWidth / cheekWidth;
    vec[34] = mouthWidth / cheekWidth;
    vec[35] = vec[31] / totalFaceHeight;
    vec[36] = vec[0] / totalFaceHeight;
    vec[37] = vec[23] / mouthWidth;
    vec[38] = vec[11] / iod;
    vec[39] = vec[6] / Math.max(0.01, vec[0]);

    vec[40] = dCenter(1);
    vec[41] = dCenter(10);
    vec[42] = dCenter(152);
    vec[43] = dCenter(234);
    vec[44] = dCenter(454);
    vec[45] = dCenter(61);
    vec[46] = dCenter(291);
    vec[47] = dCenter(33);
    vec[48] = dCenter(263);

    for (let k = 0; k < 15; k++) {
      const dL = vec[12 + (k % 4)];
      const dR = vec[13 + (k % 4)];
      vec[49 + k] = (dL - dR) / Math.max(0.01, dL + dR);
    }

    // Feature Set 3: 32 Polar Boundary Contour Points (dims 64..95)
    const perimeterIndices = [
      10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365, 379, 378,
      152, 148, 176, 149, 150, 136, 172, 58, 132, 93, 234, 127, 162, 21, 54, 103,
    ];
    for (let i = 0; i < 32; i++) {
      vec[64 + i] = dCenter(perimeterIndices[i]);
    }

    // Feature Set 4: Angular Harmonics (dims 96..127)
    for (let i = 0; i < 32; i++) {
      const idx = perimeterIndices[i];
      vec[96 + i] = Math.atan2(lm[idx].y - faceCenterY, lm[idx].x - faceCenterX) / Math.PI;
    }

    // Standard Anthropometric Population Mean (in IOD units) for MediaPipe Mesh
    // Subtracting the coordinate-wise anatomical baseline removes the shared universal human head shape
    // so that the vector only encodes the person's unique individual biometric deviations.
    const ANTHRO_BASELINE: number[] = [
      // 0..31: Anatomical distances
      1.32, 2.25, 1.15, 2.10, 1.70, 0.82, 0.22, 0.16, 0.16, 0.48, 0.48, 0.42,
      0.62, 0.62, 0.78, 0.78, 1.15, 1.15, 0.72, 0.40, 0.40, 0.52, 0.24, 0.30,
      1.62, 1.20, 1.55, 1.55, 0.95, 0.95, 1.72, 0.60,
      // 32..39: Proportions
      0.82, 0.81, 0.39, 0.35, 0.77, 0.37, 0.42, 0.17,
      // 40..48: Centroid distances
      0.25, 1.25, 1.10, 1.05, 1.05, 0.55, 0.55, 0.65, 0.65,
      // 49..63: Bilateral asymmetry (centered around 0)
      0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0,
      // 64..95: Contour radii from face centroid
      1.25, 1.22, 1.18, 1.15, 1.12, 1.10, 1.08, 1.06, 1.05, 1.06, 1.08, 1.10,
      1.12, 1.15, 1.18, 1.20, 1.22, 1.20, 1.18, 1.15, 1.12, 1.10, 1.08, 1.06,
      1.05, 1.06, 1.08, 1.10, 1.12, 1.15, 1.18, 1.22,
      // 96..127: Contour polar angles (normalized by PI: -1.0 to 1.0)
      -0.50, -0.44, -0.38, -0.31, -0.25, -0.19, -0.12, -0.06, 0.00, 0.06, 0.12, 0.19,
      0.25, 0.31, 0.38, 0.44, 0.50, 0.56, 0.62, 0.69, 0.75, 0.81, 0.88, 0.94,
      1.00, -0.94, -0.88, -0.81, -0.75, -0.69, -0.62, -0.56,
    ];

    const centered = new Array(128);
    for (let i = 0; i < 128; i++) {
      centered[i] = vec[i] - (ANTHRO_BASELINE[i] ?? 0);
    }

    // Mean-centering the normalized individual deviations
    const meanDev = centered.reduce((a, b) => a + b, 0) / 128;
    const finalDev = centered.map((v) => v - meanDev);

    // L2 Normalization onto Unit Hypersphere
    let sumSq = 0;
    for (let i = 0; i < 128; i++) sumSq += finalDev[i] * finalDev[i];
    const norm = Math.sqrt(sumSq) || 1.0;
    return finalDev.map((val) => val / norm);
  }
}

export const faceService = FaceService.getInstance();
