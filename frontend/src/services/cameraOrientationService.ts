/**
 * StrongCare - Camera Orientation & Rotation Service
 * 
 * Manages physical webcam orientation, flip, and rotation across:
 * - Kiosk terminals with inverted / upside-down webcams (NUBWO / USB cams)
 * - CSS transform for live <video> elements
 * - Pixel-level canvas rotation for MediaPipe & Face-api.js AI detectors
 * - High-resolution captures for profile_face.jpg and login snapshots
 */

export type CameraOrientation = 'mirror' | 'normal' | 'flip_y' | 'rotate180' | 'rotate180_mirror';

const STORAGE_KEY = 'strongcare_camera_orientation_v3';
const OLD_KEYS = ['strongcare_camera_orientation', 'strongcare_camera_orientation_v2'];
const ORIENTATION_ORDER: CameraOrientation[] = [
  'mirror',
  'normal',
  'flip_y',
  'rotate180',
];

export class CameraOrientationService {
  private static instance: CameraOrientationService;
  private currentOrientation: CameraOrientation = 'mirror';
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
        // Clear previous faulty storage keys that had rotate180_mirror set by default
        for (const oldKey of OLD_KEYS) {
          localStorage.removeItem(oldKey);
        }

        const saved = localStorage.getItem(STORAGE_KEY) as CameraOrientation;
        if (saved && (saved === 'mirror' || saved === 'normal' || saved === 'flip_y' || saved === 'rotate180')) {
          this.currentOrientation = saved;
        } else {
          // Default to standard upright mirror view (like any standard webcam/front camera)
          this.currentOrientation = 'mirror';
          localStorage.setItem(STORAGE_KEY, 'mirror');
        }
      } catch {
        this.currentOrientation = 'mirror';
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
      case 'mirror':
        return 'กระจกเงา (ค่าเริ่มต้นปกติ)';
      case 'normal':
        return 'มุมมองกล้องเดิม (ไม่กลับด้าน)';
      case 'flip_y':
      case 'rotate180_mirror':
        return 'กลับบน-ล่าง (แก้กล้องกลับหัว)';
      case 'rotate180':
        return 'หมุน 180°';
      default:
        return 'กระจกเงา';
    }
  }

  /**
   * CSS transform property for <video> and UI elements
   * Standard front-facing webcam uses scaleX(-1) so user sees natural mirror reflection
   * and is completely right-side up (head at top, chin at bottom).
   */
  public getCssTransform(orientation: CameraOrientation = this.currentOrientation): string {
    switch (orientation) {
      case 'mirror':
        // Upright mirror: X is flipped horizontally, Y is NOT modified (up is up!)
        return 'scaleX(-1)';
      case 'normal':
        // Completely raw camera feed
        return 'none';
      case 'flip_y':
      case 'rotate180_mirror':
        // Inverts Y vertically if camera is mounted upside down
        return 'scaleY(-1)';
      case 'rotate180':
        // Rotates 180 degrees
        return 'rotate(180deg)';
      default:
        return 'scaleX(-1)';
    }
  }

  /**
   * Draw upright video frame into a canvas 2D context using mathematical transformations
   */
  public drawUprightFrame(
    video: HTMLVideoElement,
    ctx: CanvasRenderingContext2D,
    targetW: number,
    targetH: number,
    orientation: CameraOrientation = this.currentOrientation
  ): void {
    if (!video || video.readyState < 2) return;

    ctx.save();
    ctx.translate(targetW / 2, targetH / 2);

    switch (orientation) {
      case 'mirror':
        // Horizontal mirror (X reversed, Y is standard upright)
        ctx.scale(-1, 1);
        break;
      case 'flip_y':
      case 'rotate180_mirror':
        // Vertical flip (Y reversed to correct upside-down camera)
        ctx.scale(1, -1);
        break;
      case 'rotate180':
        // Pure 180-degree rotation
        ctx.rotate(Math.PI);
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
   * Returns an offscreen canvas with the upright frame ONLY when rotation/flip is required.
   * For standard 'mirror' and 'normal', it returns null so MediaPipe and Face-api.js
   * process the HTMLVideoElement directly with full GPU/hardware acceleration.
   */
  public getUprightCanvas(
    video: HTMLVideoElement,
    maxWidth: number = 640,
    maxHeight: number = 480
  ): HTMLCanvasElement | null {
    if (!video || video.readyState < 2) return null;

    // Standard mirror and normal are physically upright, no CPU canvas copy needed!
    if (this.currentOrientation === 'mirror' || this.currentOrientation === 'normal') {
      return null;
    }

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
    this.drawUprightFrame(video, ctx, targetW, targetH, this.currentOrientation);

    return this.offscreenProcessingCanvas;
  }
}

export const cameraOrientationService = CameraOrientationService.getInstance();
