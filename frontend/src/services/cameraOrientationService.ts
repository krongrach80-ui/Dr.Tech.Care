/**
 * StrongCare - Camera Orientation & Rotation Service
 * 
 * Manages physical webcam orientation, flip, and rotation across:
 * - Kiosk terminals with inverted / upside-down or sideways webcams (0°, 90°, 180°, 270°)
 * - CSS transform for live <video> elements
 * - Pixel-level canvas rotation for MediaPipe & Face-api.js AI detectors
 * - High-resolution captures for profile_face.jpg and login snapshots
 */

export type CameraOrientation = 'mirror' | 'normal' | 'flip_y' | 'rotate180' | 'rotate180_mirror';
export type CameraRotation = 0 | 90 | 180 | 270;

const STORAGE_ROTATION_KEY = 'strongcare_camera_rotation_deg';
const STORAGE_MIRROR_KEY = 'strongcare_camera_mirror';

export class CameraOrientationService {
  private static instance: CameraOrientationService;
  private rotationDeg: CameraRotation = 0;
  private isMirrored: boolean = true;
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
        const savedRot = localStorage.getItem(STORAGE_ROTATION_KEY);
        if (savedRot === '0' || savedRot === '90' || savedRot === '180' || savedRot === '270') {
          this.rotationDeg = parseInt(savedRot, 10) as CameraRotation;
        } else {
          this.rotationDeg = 0;
        }

        const savedMirror = localStorage.getItem(STORAGE_MIRROR_KEY);
        if (savedMirror !== null) {
          this.isMirrored = savedMirror === 'true';
        } else {
          this.isMirrored = true;
        }
      } catch {
        this.rotationDeg = 0;
        this.isMirrored = true;
      }
    }
  }

  public getRotation(): CameraRotation {
    return this.rotationDeg;
  }

  public isMirror(): boolean {
    return this.isMirrored;
  }

  public setRotation(deg: CameraRotation): void {
    this.rotationDeg = deg;
    this.persist();
    this.notify();
    console.log(`[CAMERA] Rotation set to: ${deg}° (Mirror: ${this.isMirrored})`);
  }

  public setMirror(mirrored: boolean): void {
    this.isMirrored = mirrored;
    this.persist();
    this.notify();
    console.log(`[CAMERA] Mirror set to: ${mirrored}`);
  }

  /**
   * Rotates camera clockwise by 90 degrees at a time to complete 360 degrees:
   * 0° -> 90° -> 180° -> 270° -> 0°
   */
  public rotateNext90(): CameraRotation {
    const next = ((this.rotationDeg + 90) % 360) as CameraRotation;
    this.setRotation(next);
    return next;
  }

  /**
   * Toggles horizontal mirror reflection (true <-> false)
   */
  public toggleMirror(): boolean {
    const next = !this.isMirrored;
    this.setMirror(next);
    return next;
  }

  // Backwards compatibility methods
  public getOrientation(): CameraOrientation {
    if (this.rotationDeg === 180) return 'rotate180';
    return this.isMirrored ? 'mirror' : 'normal';
  }

  public setOrientation(orientation: CameraOrientation): void {
    if (orientation === 'rotate180') {
      this.rotationDeg = 180;
    } else if (orientation === 'flip_y' || orientation === 'rotate180_mirror') {
      this.rotationDeg = 180;
      this.isMirrored = true;
    } else if (orientation === 'normal') {
      this.rotationDeg = 0;
      this.isMirrored = false;
    } else {
      this.rotationDeg = 0;
      this.isMirrored = true;
    }
    this.persist();
    this.notify();
  }

  public toggleNextOrientation(): CameraOrientation {
    this.rotateNext90();
    return this.getOrientation();
  }

  public getOrientationLabelTh(): string {
    const mirrorTxt = this.isMirrored ? ' (กระจกเงา)' : ' (มุมมองเดิม)';
    return `หมุน ${this.rotationDeg}°${mirrorTxt}`;
  }

  private persist(): void {
    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        localStorage.setItem(STORAGE_ROTATION_KEY, String(this.rotationDeg));
        localStorage.setItem(STORAGE_MIRROR_KEY, String(this.isMirrored));
      } catch {}
    }
  }

  private notify(): void {
    if (typeof window !== 'undefined') {
      try {
        window.dispatchEvent(
          new CustomEvent('strongcare:camera_orientation_changed', {
            detail: {
              rotation: this.rotationDeg,
              isMirrored: this.isMirrored,
              orientation: this.getOrientation(),
            },
          })
        );
      } catch {}
    }
  }

  /**
   * CSS transform property for <video> and UI elements
   * Supports 0°, 90°, 180°, 270° rotation and optional horizontal mirror
   */
  public getCssTransform(
    rotation: CameraRotation = this.rotationDeg,
    mirror: boolean = this.isMirrored
  ): string {
    let transform = '';
    if (rotation !== 0) {
      transform += `rotate(${rotation}deg) `;
    }
    if (mirror) {
      transform += `scaleX(-1) `;
    }
    if (rotation === 90 || rotation === 270) {
      // Scale up so 4:3/16:9 rotated 90° fills the bounding container without letterbox bars
      transform += `scale(1.35) `;
    }
    return transform.trim() || 'none';
  }

  /**
   * Draw upright video frame into a canvas 2D context using mathematical transformations
   * Correctly handles 0°, 90°, 180°, 270° rotation and horizontal mirror
   */
  public drawUprightFrame(
    video: HTMLVideoElement,
    ctx: CanvasRenderingContext2D,
    targetW: number,
    targetH: number,
    rotation: CameraRotation = this.rotationDeg,
    mirror: boolean = this.isMirrored
  ): void {
    if (!video || video.readyState < 2) return;

    ctx.save();
    ctx.translate(targetW / 2, targetH / 2);

    const rad = (rotation * Math.PI) / 180;
    if (rad !== 0) {
      ctx.rotate(rad);
    }

    if (mirror) {
      ctx.scale(-1, 1);
    }

    const isSideways = rotation === 90 || rotation === 270;
    const drawW = isSideways ? targetH : targetW;
    const drawH = isSideways ? targetW : targetH;

    ctx.drawImage(video, -drawW / 2, -drawH / 2, drawW, drawH);
    ctx.restore();
  }

  /**
   * Returns an offscreen canvas with the upright frame ONLY when rotation is required.
   * For 0° rotation, it returns null so MediaPipe and Face-api.js process the HTMLVideoElement
   * directly with zero CPU copy overhead and native GPU acceleration.
   */
  public getUprightCanvas(
    video: HTMLVideoElement,
    maxWidth: number = 640,
    maxHeight: number = 480
  ): HTMLCanvasElement | null {
    if (!video || video.readyState < 2) return null;

    // Standard 0° is physically upright, no CPU canvas copy needed for MediaPipe!
    if (this.rotationDeg === 0) {
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

    const isSideways = this.rotationDeg === 90 || this.rotationDeg === 270;
    const canvasW = isSideways ? targetH : targetW;
    const canvasH = isSideways ? targetW : targetH;

    if (
      this.offscreenProcessingCanvas.width !== canvasW ||
      this.offscreenProcessingCanvas.height !== canvasH
    ) {
      this.offscreenProcessingCanvas.width = canvasW;
      this.offscreenProcessingCanvas.height = canvasH;
    }

    const ctx = this.offscreenProcessingCanvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;

    ctx.clearRect(0, 0, canvasW, canvasH);
    // Draw rotated frame without mirroring for AI detector
    ctx.save();
    ctx.translate(canvasW / 2, canvasH / 2);
    ctx.rotate((this.rotationDeg * Math.PI) / 180);
    ctx.drawImage(video, -targetW / 2, -targetH / 2, targetW, targetH);
    ctx.restore();

    return this.offscreenProcessingCanvas;
  }
}

export const cameraOrientationService = CameraOrientationService.getInstance();
