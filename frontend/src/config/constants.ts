/**
 * DR.TECH.CARE — Central System Constants (Single Source of Truth)
 * Spec: Consolidated Master Prompt v3
 */

export const APP_NAME = 'Dr.Tech.Care';
export const APP_TAGLINE = 'ระบบฟื้นฟูกายภาพบำบัดอัจฉริยะ';
export const TIMEZONE = 'Asia/Bangkok';
export const EMBEDDING_DIM = 128;

// Feature Flags (client defaults, synced with Supabase system_settings / Edge Functions)
export const FEATURE_PT_POSE_EXERCISES: boolean =
  import.meta.env.VITE_FEATURE_PT_POSE_EXERCISES === 'true'; // default false

export const KIOSK_LIVENESS_MODE: 'passive' | 'active' =
  (import.meta.env.VITE_KIOSK_LIVENESS_MODE as 'passive' | 'active') || 'passive';

export const KIOSK_PIN_FALLBACK: boolean =
  import.meta.env.VITE_KIOSK_PIN_FALLBACK === 'true'; // default false

export const KIOSK_SHOW_ABOUT: boolean =
  import.meta.env.VITE_KIOSK_SHOW_ABOUT !== 'false'; // default true

export const PLACEHOLDER_SECONDS: number =
  Math.min(5, Math.max(3, Number(import.meta.env.VITE_PLACEHOLDER_SECONDS) || 4));

// Face Recognition Thresholds
export const FACE_THRESHOLD: number =
  Number(import.meta.env.VITE_FACE_THRESHOLD) || 0.82;

export const FACE_MARGIN: number =
  Number(import.meta.env.VITE_FACE_MARGIN) || 0.08;

// Kiosk State Machine Timeouts (ms)
export const KIOSK_PRESENCE_NO_FACE_TIMEOUT_MS = 15000;
export const KIOSK_NOT_FOUND_TIMEOUT_MS = 15000;
export const KIOSK_NOT_FOUND_MAX_FAILURES = 3;
export const KIOSK_GREETING_DURATION_MS = 1500;
export const KIOSK_GESTURE_TIMEOUT_MS = 30000;
export const KIOSK_SUMMARY_DURATION_MS = 10000;
export const KIOSK_MINIGAME_INACTIVITY_MS = 60000;
export const KIOSK_STAFF_MODE_IDLE_TIMEOUT_MS = 300000; // 5 min
export const KIOSK_TOKEN_DEFAULT_TTL_MINUTES = 15;
