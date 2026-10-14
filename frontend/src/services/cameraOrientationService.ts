/**
 * StrongCare - Camera Orientation & Rotation Service
 * 
 * Manages physical webcam orientation, flip, and rotation across:
 * - Kiosk terminals with inverted / upside-down webcams (NUBWO / USB cams)
 * - CSS transform for live <video> elements
 * - Pixel-level canvas rotation for MediaPipe & Face-api.js AI detectors
 * - High-resolution captures for profile_face.jpg and login snapshots
 */

export type CameraOrientation = 'rotate180_mirror' | 'rotate180' | 'mirror' | 'normal';

const STORAGE_KEY = 'strongcare_camera_orientation';
const ORIENTATION_ORDER: CameraOrientation[] = [
  'rotate180_mirror',
  'rotate180',
  'mirror',
  'normal',
];

export class CameraOrientationService {
  private static instance: CameraOrientationService;
  private currentOrientation: CameraOrientation = 'rotate180_mirror';
  private offscreenProcessingCanvas: HTMLCanvasElement | null = null;

  private constructor() {
    this.hydrate();
  }

  public static getInstance(): CameraOrientationService {
    if (!CameraOrientationService.instance) {
      CameraOrientationService.instance = new CameraOrientationService();
    }
    return CameraOrientationService.instance;
  }

  private hydrate(): void {
    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        const saved = localStorage.getItem(STORAGE_KEY) as CameraOrientation;
        if (saved && ORIENTATION_ORDER.includes(saved)) {
          this.currentOrientation = saved;
        } else {
          // Default to rotate180_mirror for kiosk terminal with inverted webcam
          this.currentOrientation = 'rotate180_mirror';
          localStorage.setItem(STORAGE_KEY, 'rotate180_mirror');
        }
      } catch {
        this.currentOrientation = 'rotate180_mirror';
      }
    }
  }

  public getOrientation(): CameraOrientation {
    return this.currentOrientation;
  }

  public setOrientation(orientation: CameraOrientation): void {
    this.currentOrientation = orientation;
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem(STORAGE_KEY, orientation);
        window.dispatchEvent(
          new CustomEvent('strongcare:camera_orientation_changed', {
            detail: { orientation },
          })
        );
      } catch {}
    }
    console.log(`[CAMERA] Orientation updated to: ${orientation}`);
  }

  public toggleNextOrientation(): CameraOrientation {
    const currentIndex = ORIENTATION_ORDER.indexOf(this.currentOrientation);
    const nextIndex = (currentIndex + 1) % ORIENTATION_ORDER.length;
    const nextOrientation = ORIENTATION_ORDER[nextIndex];
    this.setOrientation(nextOrientation);
    return nextOrientation;
  }

  public getOrientationLabelTh(orientation: CameraOrientation = this.currentOrientation): string {
    switch (orientation) {
      case 'rotate180_mirror':
        return 'กลับหัว 180° + กระจกเงา (Kiosk แนะนำ)';
      case 'rotate180':
        return 'กลับหัว 180° (ปกติ)';
      case 'mirror':
        return 'กระจกเงา (ปกติ)';
      case 'normal':
        return 'มุมมองกล้องเดิม (ไม่ปรับ)';
    }
  }

  /**
   * CSS transform property for <video> and UI elements
   */
  public getCssTransform(): string {
    switch (this.currentOrientation) {
      case 'rotate180_mirror':
        // rotate(180deg) scaleX(-1) is mathematically equivalent to scaleY(-1)
        return 'rotate(180deg) scaleX(-1)';
      case 'rotate180':
        return 'rotate(180deg)';
      case 'mirror':
        return 'scaleX(-1)';
      case 'normal':
      default:
        return 'none';
    }
  }

  /**
   * Draw upright video frame into a canvas 2D context using mathematical transformations
   */
  public drawUprightFrame(
    video: HTMLVideoElement,
    ctx: CanvasRenderingContext2D,
    targetW: number,
    targetH: number
  ): void {
    if (!video || video.readyState < 2) return;

    ctx.save();
    ctx.translate(targetW / 2, targetH / 2);

    switch (this.currentOrientation) {
      case 'rotate180_mirror':
        // Rotates 180 degrees and mirrors horizontally (scaleY(-1))
        ctx.rotate(Math.PI);
        ctx.scale(-1, 1);
        break;
      case 'rotate180':
        // Pure 180-degree rotation (turns inverted camera right-side up)
        ctx.rotate(Math.PI);
        break;
      case 'mirror':
        // Horizontal mirror
        ctx.scale(-1, 1);
        break;
      case 'normal':
      default:
        // No transformation
        break;
    }

    ctx.drawImage(video, -targetW / 2, -targetH / 2, targetW, targetH);
    ctx.restore();
  }

  /**
   * Returns a cached or newly populated offscreen canvas with the upright frame
   * for passing directly into MediaPipe FaceLandmarker and Face-api.js
   */
  public getUprightCanvas(
    video: HTMLVideoElement,
    maxWidth: number = 640,
    maxHeight: number = 480
  ): HTMLCanvasElement | null {
    if (!video || video.readyState < 2) return null;

    if (!this.offscreenProcessingCanvas && typeof document !== 'undefined') {
      this.offscreenProcessingCanvas = document.createElement('canvas');
    }

    if (!this.offscreenProcessingCanvas) return null;

    const vw = video.videoWidth || 640;
    const vh = video.videoHeight || 480;

    let targetW = vw;
    let targetH = vh;
    if (targetW > maxWidth || targetH > maxHeight) {
      const ratio = Math.min(maxWidth / targetW, maxHeight / targetH);
      targetW = Math.round(targetW * ratio);
      targetH = Math.round(targetH * ratio);
    }

    if (
      this.offscreenProcessingCanvas.width !== targetW ||
      this.offscreenProcessingCanvas.height !== targetH
    ) {
      this.offscreenProcessingCanvas.width = targetW;
      this.offscreenProcessingCanvas.height = targetH;
    }

    const ctx = this.offscreenProcessingCanvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;

    ctx.clearRect(0, 0, targetW, targetH);
    this.drawUprightFrame(video, ctx, targetW, targetH);

    return this.offscreenProcessingCanvas;
  }
}

export const cameraOrientationService = CameraOrientationService.getInstance();
