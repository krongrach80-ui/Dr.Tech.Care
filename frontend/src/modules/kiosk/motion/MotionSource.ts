/**
 * Moh Tech Care - Pluggable MotionSource Interface
 * Supports low-res camera frame differencing and can be swapped with a hardware PIR sensor.
 */

export interface MotionSource {
  start(): Promise<void>;
  stop(): void;
  onMotionDetected(callback: () => void): void;
}

export class CameraFrameDifferenceMotionSource implements MotionSource {
  private video: HTMLVideoElement | null = null;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D | null;
  private prevFrameData: Uint8ClampedArray | null = null;
  private animationId: number | null = null;
  private listener: (() => void) | null = null;
  private isActive: boolean = false;
  private threshold: number = 24; // Pixel difference threshold
  private motionPixelCountThreshold: number = 320; // Number of changed pixels to trigger

  constructor() {
    this.canvas = document.createElement('canvas');
    this.canvas.width = 64;
    this.canvas.height = 48;
    this.ctx = this.canvas.getContext('2d', { willReadFrequently: true });
  }

  public setVideoElement(video: HTMLVideoElement) {
    this.video = video;
  }

  public async start(): Promise<void> {
    this.isActive = true;
    this.checkMotionLoop();
  }

  public stop(): void {
    this.isActive = false;
    if (this.animationId !== null) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }
    this.prevFrameData = null;
  }

  public onMotionDetected(callback: () => void): void {
    this.listener = callback;
  }

  private checkMotionLoop = () => {
    if (!this.isActive) return;

    if (this.video && this.video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && this.ctx) {
      this.ctx.drawImage(this.video, 0, 0, 64, 48);
      const currentFrame = this.ctx.getImageData(0, 0, 64, 48);
      const currentData = currentFrame.data;

      if (this.prevFrameData) {
        let changedPixels = 0;
        const len = currentData.length;

        for (let i = 0; i < len; i += 4) {
          const rDiff = Math.abs(currentData[i] - this.prevFrameData[i]);
          const gDiff = Math.abs(currentData[i + 1] - this.prevFrameData[i + 1]);
          const bDiff = Math.abs(currentData[i + 2] - this.prevFrameData[i + 2]);

          if (rDiff + gDiff + bDiff > this.threshold * 3) {
            changedPixels++;
          }
        }

        if (changedPixels > this.motionPixelCountThreshold) {
          if (this.listener) {
            this.listener();
          }
        }
      }

      this.prevFrameData = new Uint8ClampedArray(currentData);
    }

    this.animationId = requestAnimationFrame(this.checkMotionLoop);
  };
}
