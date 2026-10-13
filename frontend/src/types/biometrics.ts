/**
 * Dr.Tech.Care - Strict Biometric & Liveness Type Definitions
 * Designed for Medical Kiosk Systems (PDPA Compliant, 128-D Biometric Embedding, No Raw Images)
 */

export type CameraErrorCode =
  | 'NOT_FOUND'           // DevicesNotFoundError, NotFoundError, Requested device not found
  | 'PERMISSION_DENIED'   // NotAllowedError, PermissionDeniedError
  | 'IN_USE'              // NotReadableError, TrackStartError
  | 'INSECURE_CONTEXT'    // Blocked by browser because not HTTPS/localhost
  | 'OVERCONSTRAINED'     // OverconstrainedError
  | 'UNKNOWN';

export interface CameraDeviceInfo {
  deviceId: string;
  label: string;
  groupId: string;
}

export interface CameraState {
  isActive: boolean;
  isLoading: boolean;
  errorCode: CameraErrorCode | null;
  errorMessageTh: string | null;
  availableDevices: CameraDeviceInfo[];
  activeDeviceId: string | null;
  luminance: number; // 0 - 255 (Average lighting level)
}

export type LivenessChallenge = 'front' | 'turn_left' | 'turn_right';

export interface LivenessNonce {
  challengeId: string;
  nonce: string;
  timestamp: number;
  expiresAt: number;
  sequence: LivenessChallenge[];
}

export interface QualityGateState {
  passed: boolean;
  luminance: number;       // 0-255
  isTooDark: boolean;      // < 45
  isTooBright: boolean;    // > 240
  faceCount: number;       // Exactly 1 required
  isCentered: boolean;     // Face inside oval target
  sizeRatio: number;       // Face bounding box ratio to frame (0.18 - 0.55)
  isSizeValid: boolean;
  errorMessageTh: string | null;
}

export interface LivenessFrameData {
  yawDeg: number;          // Horizontal head rotation in degrees (-90 to +90)
  pitchDeg: number;        // Vertical tilt in degrees (-90 to +90)
  rollDeg: number;         // Lateral tilt in degrees (-90 to +90)
  ear: number;             // Eye Aspect Ratio
  qualityGate: QualityGateState;
}

export interface LivenessProgressState {
  currentChallenge: LivenessChallenge;
  completedChallenges: Record<LivenessChallenge, boolean>;
  holdProgressPercent: number; // 0 - 100 for current active challenge
  isCompleted: boolean;
  statusMessageTh: string;
}

export interface BiometricVectorRecord {
  patientId: number;
  patientCode: string;
  patientName: string;
  embedding128: number[]; // 128-D Float array normalized (L2)
  enrolledAt: string;
  modelVersion: string;
}

export interface BiometricVerificationResult {
  success: boolean;
  matchedPatient: {
    id: number;
    patient_code: string;
    name: string;
    age: number;
    gender: 'male' | 'female' | 'other';
  } | null;
  similarityScore: number; // Cosine similarity (0.0 - 1.0)
  challengeNonce: string;
  timestamp: string;
  errorMessageTh?: string;
}

export interface PDPAConsentRecord {
  hasConsented: boolean;
  consentedAt: string | null;
  biometricPurposeAcknowledged: boolean;
  noImageStoredAcknowledged: boolean;
  pinFallbackAcknowledged: boolean;
}
