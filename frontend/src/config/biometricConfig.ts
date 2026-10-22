/**
 * Dr.Tech.Care - การตั้งค่าระบบตรวจจับและจดจำใบหน้าชีวมิติ (Biometric Face Recognition Config)
 * รองรับการใช้งานตู้ Kiosk ทางการแพทย์ (PDPA Compliant, Dual-Metric, Multi-frame Sampling)
 * 
 * ทุกค่าในไฟล์นี้สามารถปรับจูนได้ที่นี่ที่เดียว และมีผลกับระบบการสแกนใบหน้าทั้ง Kiosk และ Portal
 */

export const BIOMETRIC_CONFIG = {
  // =========================================================================
  // 1. เกณฑ์ความคล้ายคลึงของใบหน้า 3 ระดับ (Cosine Similarity & Distance)
  // =========================================================================

  /**
   * ระดับที่ 1: ผ่านเกณฑ์และเข้าสู่ระบบอัตโนมัติ (Pass / Auto-Login)
   * ตั้งแต่ 88% ขึ้นไป (Cosine Similarity >= 0.88, Euclidean Distance <= ~0.49)
   * ผู้ใช้เข้าสู่ระบบได้ทันทีโดยไม่ต้องกรอกข้อมูลเพิ่มเติม
   */
  THRESHOLD_PASS: 0.88,
  THRESHOLD_PASS_PERCENT: 88,
  DISTANCE_PASS: 0.49,

  /**
   * ระดับที่ 2: เกือบตรง ต้องการการยืนยันตัวตนเพิ่มเติม (Near-Match)
   * อยู่ระหว่าง 75% - 87% (Cosine Similarity 0.75 - 0.87, Euclidean Distance 0.49 - 0.71)
   * ระบบจะแสดงหน้าต่าง "ยืนยันตัวตนเพิ่มเติม" พร้อมปุ่มกดรหัส PIN 6 หลัก เป็นทางเลือกหลัก
   * ไม่ทำให้ผู้ใช้เข้าใจผิดว่าไม่มีบัญชีในระบบ
   */
  THRESHOLD_NEAR: 0.75,
  THRESHOLD_NEAR_PERCENT: 75,
  DISTANCE_NEAR: 0.71,

  /**
   * ระดับที่ 3: ใบหน้าไม่ตรงกับฐานข้อมูล (No-Match)
   * ต่ำกว่า 75% (Cosine Similarity < 0.75, Euclidean Distance > 0.71)
   */
  THRESHOLD_FAIL: 0.75,
  THRESHOLD_FAIL_PERCENT: 75,

  // =========================================================================
  // 2. การเก็บผลหลายเฟรมต่อเนื่อง (Multi-frame Sampling Buffer)
  // =========================================================================

  /**
   * จำนวนเฟรมที่ต้องเก็บสะสมเพื่อคำนวณเวกเตอร์เฉลี่ย/มัธยฐาน (Median/Averaged Vector)
   * แนะนำ: 5 - 8 เฟรม ในระยะเวลาประมาณ 1.2 - 1.8 วินาที
   */
  SAMPLE_FRAMES_COUNT: 6,

  /**
   * ช่วงเวลาหน่วงระหว่างการเก็บแต่ละเฟรม (มิลลิวินาที)
   * 200ms x 6 เฟรม = ~1.2 วินาที พอดีกับช่วงที่ผู้ใช้มองตรง
   */
  SAMPLE_INTERVAL_MS: 200,

  /**
   * ค่าความเชื่อมั่นขั้นต่ำของ MediaPipe FaceLandmarker / Quality Gate ของแต่ละเฟรม
   */
  FRAME_MIN_CONFIDENCE: 0.45,

  // =========================================================================
  // 3. ป้องกัน Popup เด้งรัว (Debounce, Cooldown & State Machine)
  // =========================================================================

  /**
   * ระยะเวลาที่ต้องตรวจพบว่าใบหน้าไม่ตรงต่อเนื่อง (มิลลิวินาที) ก่อนแสดง Popup แจ้งเตือน
   * ป้องกันการเด้งเพราะแสงวูบหรือสะดุดเพียงเฟรมเดียว
   */
  NO_MATCH_CONSECUTIVE_MS: 3000,

  /**
   * จำนวนเฟรมไม่ตรงติดต่อกันขั้นต่ำ ก่อนอนุญาตให้แสดง Popup No-Match
   */
  MIN_FAIL_FRAMES: 5,

  /**
   * ระยะเวลา Cooldown (มิลลิวินาที) หลังผู้ใช้กดปิด Modal หรือทำรายการใดๆ
   * ในช่วงเวลานี้ระบบจะไม่เริ่มสแกนใหม่โดยอัตโนมัติ เพื่อให้ผู้ใช้อ่านข้อมูลหรือพักหายใจ
   * (ผู้ใช้สามารถกดปุ่ม "ลองสแกนอีกครั้ง" เพื่อข้าม Cooldown ได้ทันที)
   */
  COOLDOWN_MS: 8000,

  /**
   * จำนวนครั้งที่อนุญาตให้สแกนล้มเหลวติดต่อกัน ก่อนแนะนำให้ใช้รหัส PIN หรือติดต่อเจ้าหน้าที่
   */
  MAX_ATTEMPTS: 3,

  // =========================================================================
  // 4. การแสดงผล UX & โหมดดีบัก (Privacy & Transparency)
  // =========================================================================

  /**
   * ซ่อนตัวเลขเปอร์เซ็นต์ชีวมิติในโหมดผู้ป่วยทั่วไป
   * หากต้องการดูเปอร์เซ็นต์ ต้องเปิด ?dev=1 หรืออยู่ในโหมดเจ้าหน้าที่ (Staff Debug Mode)
   */
  HIDE_SCORE_IN_PRODUCTION: true,
} as const;

/**
 * สูตรการแปลงระหว่าง Cosine Similarity และ Euclidean Distance
 * สำหรับเวกเตอร์ 128 มิติที่ผ่าน L2-normalization (|A| = 1, |B| = 1):
 * 
 * Distance = sqrt(2 * (1 - CosineSimilarity))
 * CosineSimilarity = 1 - (Distance^2 / 2)
 * SimilarityPercent = round(CosineSimilarity * 100)
 */
export function cosineToDistance(cosSim: number): number {
  const clamped = Math.max(-1, Math.min(1, cosSim));
  return Math.sqrt(Math.max(0, 2 * (1 - clamped)));
}

export function distanceToCosine(distance: number): number {
  return 1 - (distance * distance) / 2;
}

export function cosineToPercent(cosSim: number): number {
  return Math.max(0, Math.min(100, Math.round(cosSim * 100)));
}

/**
 * ฟังก์ชันประเมินระดับผลการสแกนใบหน้า (3 ระดับ)
 */
export type BiometricMatchLevel = 'pass' | 'near-match' | 'no-match';

export function evaluateBiometricMatchLevel(similarityScore: number): BiometricMatchLevel {
  if (similarityScore >= BIOMETRIC_CONFIG.THRESHOLD_PASS) {
    return 'pass';
  }
  if (similarityScore >= BIOMETRIC_CONFIG.THRESHOLD_NEAR) {
    return 'near-match';
  }
  return 'no-match';
}
