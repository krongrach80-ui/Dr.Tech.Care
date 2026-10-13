import {
  FilesetResolver,
  PoseLandmarker,
  PoseLandmarkerResult,
  HandLandmarker,
  HandLandmarkerResult,
  FaceLandmarker,
  FaceLandmarkerResult,
} from '@mediapipe/tasks-vision';
import { PoseLandmarks, HolisticDetectionResult } from '../types/pose';
import { LandmarkSmoother } from '../algorithms/smoothing';
import { asset } from '../utils/asset';

function resolveAssetUrl(relPath: string): string {
  return asset(relPath);
}

export class PoseService {
  private static instance: PoseService;
  private landmarker: PoseLandmarker | null = null;
  private handLandmarker: HandLandmarker | null = null;
  private faceLandmarker: FaceLandmarker | null = null;

  private initPromise: Promise<boolean> | null = null;
  private handInitPromise: Promise<HandLandmarker | null> | null = null;
  private faceInitPromise: Promise<FaceLandmarker | null> | null = null;
  private visionInstance: any = null;

  private errorMessage: string | null = null;
  private smoother = new LandmarkSmoother(0.5);
  private isMockMode: boolean = false;
  private mockTime: number = 0;

  private lastHandResult: PoseLandmarks[] | null = null;
  private lastFaceResult: PoseLandmarks | null = null;
  private frameCount: number = 0;

  private lastPoseTimestamp: number = 0;
  private lastHandTimestamp: number = 0;
  private lastFaceTimestamp: number = 0;

  public static getInstance(): PoseService {
    if (!PoseService.instance) {
      PoseService.instance = new PoseService();
    }
    return PoseService.instance;
  }

  private isExplicitDemoMode(): boolean {
    return (
      typeof window !== 'undefined' &&
      (new URLSearchParams(window.location.search).get('demo') === '1' ||
       window.location.search.includes('mock=1'))
    );
  }

  private async getVision(): Promise<any> {
    if (this.visionInstance) return this.visionInstance;
    try {
      const localWasm = resolveAssetUrl('models/pose/wasm');
      this.visionInstance = await FilesetResolver.forVisionTasks(localWasm);
    } catch (eLocal) {
      console.warn('⚠️ Local WASM failed, falling back to CDN 0.10.35:', eLocal);
      this.visionInstance = await FilesetResolver.forVisionTasks('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm');
    }
    return this.visionInstance;
  }

  private async initModel<T>(
    vision: any,
    createFn: (v: any, opts: any) => Promise<T>,
    localPath: string,
    cdnPath: string,
    extraOptions: Record<string, any> = {}
  ): Promise<T> {
    const paths = [resolveAssetUrl(localPath), cdnPath];
    const delegates: ('GPU' | 'CPU')[] = ['GPU', 'CPU'];

    for (const modelPath of paths) {
      for (const delegate of delegates) {
        try {
          const model = await createFn(vision, {
            baseOptions: { modelAssetPath: modelPath, delegate },
            runningMode: 'VIDEO',
            ...extraOptions,
          });
          return model;
        } catch (err) {
          // Try next delegate or path
        }
      }
    }
    throw new Error(`Failed to load model from both ${localPath} and CDN`);
  }

  public initialize(): Promise<boolean> {
    if (this.landmarker) return Promise.resolve(true);
    if (this.initPromise) return this.initPromise;

    this.initPromise = (async () => {
      try {
        const vision = await this.getVision();

        // 1. Initialize Pose Landmarker (Body & Joint Biomechanics)
        try {
          this.landmarker = await this.initModel(
            vision,
            (v, opts) => PoseLandmarker.createFromOptions(v, opts),
            'models/pose/pose_landmarker_full.task',
            'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/1/pose_landmarker_full.task',
            {
              numPoses: 1,
              minPoseDetectionConfidence: 0.65,
              minPosePresenceConfidence: 0.65,
              minTrackingConfidence: 0.65,
            }
          );
          console.log('✅ MediaPipe PoseLandmarker (Full Model - 0.65 Confidence) initialized successfully');
        } catch (err) {
          console.warn('⚠️ PoseLandmarker initialization failed:', err);
        }

        if (!this.landmarker) {
          this.initPromise = null; // Reset so user/component can retry
          if (this.isExplicitDemoMode()) {
            this.isMockMode = true;
            console.info('ℹ️ เข้าสู่โหมดจำลองท่าทาง (Mock Mode) เนื่องจากระบุ ?demo=1 หรือ mock=1');
          } else {
            this.isMockMode = false;
            this.errorMessage = 'ไม่สามารถดาวน์โหลดโมเดลตรวจจับท่าทาง (MediaPipe) ได้ กรุณาตรวจสอบการเชื่อมต่ออินเทอร์เน็ต';
            console.warn('⚠️ ' + this.errorMessage);
          }
        } else {
          this.isMockMode = false;
          this.errorMessage = null;
        }
        return true;
      } catch (err) {
        console.warn('⚠️ MediaPipe Vision initialization error:', err);
        this.initPromise = null; // Reset so retry is possible
        if (this.isExplicitDemoMode()) {
          this.isMockMode = true;
        } else {
          this.isMockMode = false;
          this.errorMessage = 'ไม่สามารถดาวน์โหลดโมเดลตรวจจับท่าทาง (MediaPipe) ได้ กรุณาตรวจสอบการเชื่อมต่ออินเทอร์เน็ต';
        }
        return true;
      }
    })();

    return this.initPromise;
  }

  /**
   * On-demand loader for Hand Landmarker (Loaded only when needed)
   */
  public async ensureHandLandmarker(): Promise<HandLandmarker | null> {
    if (this.handLandmarker) return this.handLandmarker;
    if (this.handInitPromise) return this.handInitPromise;

    this.handInitPromise = (async () => {
      try {
        const vision = await this.getVision();
        this.handLandmarker = await this.initModel(
          vision,
          (v, opts) => HandLandmarker.createFromOptions(v, opts),
          'models/hand_landmarker.task',
          'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',
          {
            numHands: 2,
            minHandDetectionConfidence: 0.35,
            minHandPresenceConfidence: 0.35,
            minTrackingConfidence: 0.35,
          }
        );
        console.log('✅ MediaPipe HandLandmarker loaded on-demand');
        return this.handLandmarker;
      } catch (handErr) {
        console.warn('⚠️ HandLandmarker load warning:', handErr);
        this.handInitPromise = null; // Allow retry
        return null;
      }
    })();

    return this.handInitPromise;
  }

  /**
   * On-demand loader for Face Landmarker (Loaded only when needed)
   */
  public async ensureFaceLandmarker(): Promise<FaceLandmarker | null> {
    if (this.faceLandmarker) return this.faceLandmarker;
    if (this.faceInitPromise) return this.faceInitPromise;

    this.faceInitPromise = (async () => {
      try {
        const vision = await this.getVision();
        this.faceLandmarker = await this.initModel(
          vision,
          (v, opts) => FaceLandmarker.createFromOptions(v, opts),
          'models/face_landmarker.task',
          'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
          {
            numFaces: 1,
            minFaceDetectionConfidence: 0.35,
            minFacePresenceConfidence: 0.35,
            minTrackingConfidence: 0.35,
            outputFaceBlendshapes: true,
            outputFacialTransformationMatrixes: true,
          }
        );
        console.log('✅ MediaPipe FaceLandmarker loaded on-demand');
        return this.faceLandmarker;
      } catch (faceErr) {
        console.warn('⚠️ FaceLandmarker load warning:', faceErr);
        this.faceInitPromise = null; // Allow retry
        return null;
      }
    })();

    return this.faceInitPromise;
  }

  public closeHandLandmarker(): void {
    if (this.handLandmarker) {
      try {
        this.handLandmarker.close();
      } catch (err) {
        console.warn('⚠️ Error closing HandLandmarker:', err);
      }
      this.handLandmarker = null;
      this.handInitPromise = null;
      console.log('🧹 HandLandmarker instance destroyed and memory freed');
    }
  }

  public closeFaceLandmarker(): void {
    if (this.faceLandmarker) {
      try {
        this.faceLandmarker.close();
      } catch (err) {
        console.warn('⚠️ Error closing FaceLandmarker:', err);
      }
      this.faceLandmarker = null;
      this.faceInitPromise = null;
      console.log('🧹 FaceLandmarker instance destroyed and memory freed');
    }
  }

  public getFaceLandmarker(): FaceLandmarker | null {
    return this.faceLandmarker;
  }

  public getPoseLandmarker(): PoseLandmarker | null {
    return this.landmarker;
  }

  public isReady(): boolean {
    return this.landmarker !== null || this.isMockMode;
  }

  public setMockMode(enabled: boolean): void {
    if (enabled && !this.isExplicitDemoMode()) {
      console.warn('⚠️ ไม่อนุญาตให้เปิด Mock Mode เว้นแต่จะมี ?demo=1 ใน URL หรือผู้ใช้เลือกทดสอบ');
      return;
    }
    this.isMockMode = enabled;
  }

  public getIsMockMode(): boolean {
    return this.isMockMode;
  }

  public getErrorMessage(): string | null {
    return this.errorMessage;
  }

  /**
   * Complete Holistic AI Detection:
   * Optimized for Mobile: Runs Pose (33-pts) every frame,
   * while Hand and Face detection are loaded and run only when explicitly enabled.
   */
  public detectHolistic(
    video: HTMLVideoElement,
    timestamp: number,
    options?: { enableHands?: boolean; enableFace?: boolean }
  ): HolisticDetectionResult | null {
    if (this.isMockMode) {
      return {
        poseLandmarks: this.generateSyntheticPose(),
        handLandmarks: null,
        faceLandmarks: null,
      };
    }

    if (!this.landmarker || !video || video.readyState < 2 || video.videoWidth === 0 || video.videoHeight === 0 || video.paused) {
      return null;
    }

    this.frameCount++;

    // 1. Pose detection (Runs every frame for real-time exercise state machine & repetition tracking)
    let poseLandmarks: PoseLandmarks | null = null;
    let worldLandmarks: PoseLandmarks | null = null;
    try {
      let poseTime = timestamp;
      if (poseTime <= this.lastPoseTimestamp) {
        poseTime = this.lastPoseTimestamp + 1;
      }
      this.lastPoseTimestamp = poseTime;

      const result: PoseLandmarkerResult = this.landmarker.detectForVideo(video, poseTime);
      if (result && result.landmarks && result.landmarks.length > 0) {
        const rawLandmarks = result.landmarks[0] as PoseLandmarks;
        poseLandmarks = this.smoother.smooth(rawLandmarks, poseTime);
        if (result.worldLandmarks && result.worldLandmarks.length > 0) {
          worldLandmarks = result.worldLandmarks[0] as PoseLandmarks;
        }
      } else {
        this.smoother.reset();
      }
    } catch (e) {
      this.smoother.reset();
    }

    // 2. Hand detection (โหลดและรันเฉพาะเมื่อเปิด options?.enableHands ป้องกันเฟรมเรตตกบนมือถือ)
    let handLandmarks: PoseLandmarks[] | null = null;
    if (options?.enableHands) {
      if (!this.handLandmarker) {
        this.ensureHandLandmarker().catch(() => {});
      } else {
        try {
          let handTime = timestamp;
          if (handTime <= this.lastHandTimestamp) {
            handTime = this.lastHandTimestamp + 1;
          }
          this.lastHandTimestamp = handTime;

          const handRes: HandLandmarkerResult = this.handLandmarker.detectForVideo(video, handTime);
          if (handRes && handRes.landmarks && handRes.landmarks.length > 0) {
            handLandmarks = handRes.landmarks as PoseLandmarks[];
            this.lastHandResult = handLandmarks;
          } else {
            this.lastHandResult = null;
          }
        } catch (e) {
          // ignore
        }
      }
    }

    // 3. Face detection (โหลดและรันเฉพาะเมื่อเปิด options?.enableFace ป้องกันเฟรมเรตตกบนมือถือ)
    let faceLandmarks: PoseLandmarks | null = null;
    if (options?.enableFace) {
      if (!this.faceLandmarker) {
        this.ensureFaceLandmarker().catch(() => {});
      } else if (this.frameCount % 4 === 0 || !this.lastFaceResult) {
        try {
          let faceTime = timestamp;
          if (faceTime <= this.lastFaceTimestamp) {
            faceTime = this.lastFaceTimestamp + 1;
          }
          this.lastFaceTimestamp = faceTime;

          const faceRes: FaceLandmarkerResult = this.faceLandmarker.detectForVideo(video, faceTime);
          if (faceRes && faceRes.faceLandmarks && faceRes.faceLandmarks.length > 0) {
            faceLandmarks = faceRes.faceLandmarks[0] as PoseLandmarks;
            this.lastFaceResult = faceLandmarks;
          } else {
            this.lastFaceResult = null;
          }
        } catch (e) {
          // ignore
        }
      }
    }

    return {
      poseLandmarks,
      worldLandmarks,
      handLandmarks,
      faceLandmarks,
    };
  }

  public detectVideo(video: HTMLVideoElement, timestamp: number): PoseLandmarks | null {
    const res = this.detectHolistic(video, timestamp);
    return res ? res.poseLandmarks : null;
  }

  /**
   * Generates continuous synthetic biomechanics motion for headless/mock mode
   */
  public generateSyntheticPose(exerciseSlug: string = 'shoulder_raise'): PoseLandmarks {
    this.mockTime += 0.05;
    const phase = (Math.sin(this.mockTime) + 1) / 2; // 0.0 to 1.0

    const nose = { x: 0.5, y: 0.18, visibility: 0.99 };
    const leftEye = { x: 0.47, y: 0.15, visibility: 0.99 };
    const rightEye = { x: 0.53, y: 0.15, visibility: 0.99 };
    const leftEar = { x: 0.43, y: 0.16, visibility: 0.99 };
    const rightEar = { x: 0.57, y: 0.16, visibility: 0.99 };

    const leftShoulder = { x: 0.42, y: 0.35, visibility: 0.99 };
    const rightShoulder = { x: 0.58, y: 0.35, visibility: 0.99 };

    let leftElbow = { x: 0.38, y: 0.52, visibility: 0.98 };
    let leftWrist = { x: 0.37, y: 0.68, visibility: 0.98 };

    let rightElbow = { x: 0.62, y: 0.52, visibility: 0.98 };
    let rightWrist = { x: 0.63, y: 0.68, visibility: 0.98 };

    let leftHip = { x: 0.45, y: 0.65, visibility: 0.99 };
    let rightHip = { x: 0.55, y: 0.65, visibility: 0.99 };
    let leftKnee = { x: 0.45, y: 0.82, visibility: 0.99 };
    let rightKnee = { x: 0.55, y: 0.82, visibility: 0.99 };
    let leftAnkle = { x: 0.45, y: 0.96, visibility: 0.99 };
    let rightAnkle = { x: 0.55, y: 0.96, visibility: 0.99 };

    if (exerciseSlug === 'shoulder_raise') {
      const armAngle = 0.4 + phase * 1.2;
      const armLen = 0.16;
      rightElbow = {
        x: rightShoulder.x + Math.cos(armAngle) * armLen,
        y: rightShoulder.y + Math.sin(armAngle) * armLen,
        visibility: 0.99,
      };
      rightWrist = {
        x: rightElbow.x + Math.cos(armAngle) * armLen,
        y: rightElbow.y + Math.sin(armAngle) * armLen,
        visibility: 0.99,
      };
    } else if (exerciseSlug === 'bicep_curl') {
      rightElbow = { x: 0.60, y: 0.50, visibility: 0.99 };
      const curlAngle = 1.4 - phase * 1.5;
      rightWrist = {
        x: rightElbow.x + Math.cos(curlAngle) * 0.15,
        y: rightElbow.y + Math.sin(curlAngle) * 0.15,
        visibility: 0.99,
      };
    } else if (exerciseSlug === 'knee_squat') {
      const squatDip = phase * 0.1;
      leftHip.y += squatDip;
      rightHip.y += squatDip;
      leftKnee.x -= squatDip * 0.4;
      rightKnee.x += squatDip * 0.4;
    }

    const landmarks: PoseLandmarks = new Array(33).fill(null).map((_, idx) => ({
      x: 0.5,
      y: 0.5,
      z: 0,
      visibility: 0.5,
    }));

    landmarks[0] = nose;
    landmarks[2] = leftEye;
    landmarks[5] = rightEye;
    landmarks[7] = leftEar;
    landmarks[8] = rightEar;
    landmarks[11] = leftShoulder;
    landmarks[12] = rightShoulder;
    landmarks[13] = leftElbow;
    landmarks[14] = rightElbow;
    landmarks[15] = leftWrist;
    landmarks[16] = rightWrist;
    landmarks[23] = leftHip;
    landmarks[24] = rightHip;
    landmarks[25] = leftKnee;
    landmarks[26] = rightKnee;
    landmarks[27] = leftAnkle;
    landmarks[28] = rightAnkle;

    landmarks[17] = { x: leftWrist.x - 0.02, y: leftWrist.y + 0.04, visibility: 0.9 };
    landmarks[19] = { x: leftWrist.x, y: leftWrist.y + 0.05, visibility: 0.9 };
    landmarks[21] = { x: leftWrist.x + 0.02, y: leftWrist.y + 0.03, visibility: 0.9 };

    landmarks[18] = { x: rightWrist.x + 0.02, y: rightWrist.y + 0.04, visibility: 0.9 };
    landmarks[20] = { x: rightWrist.x, y: rightWrist.y + 0.05, visibility: 0.9 };
    landmarks[22] = { x: rightWrist.x - 0.02, y: rightWrist.y + 0.03, visibility: 0.9 };

    return landmarks;
  }
}

export const poseService = PoseService.getInstance();
