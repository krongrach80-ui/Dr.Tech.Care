/**
 * StrongCare - Strict Patient-Centric Data & File Storage Architecture
 * 
 * Implements isolated, individual patient directory and file storage:
 * - Base Directory: /public/uploads/patients/{patient_id}/
 * - a) profile_face.jpg: Reference face image captured during registration
 * - b) login_history/: Subfolder storing snapshots taken during each login verification
 * - c) patient_record.json: Primary DB entity encapsulating all profile, clinical, 
 *      biometric, rehab score, and medical metadata
 * 
 * Strict Single Source of Truth - No global collision variables.
 */

import { FaceRegistryService } from './faceRegistryService';
import { resolveDefaultApiUrl } from '../config/apiConfig';
import { cameraOrientationService } from './cameraOrientationService';
import { supabaseService } from './supabaseService';
import { BIOMETRIC_CONFIG, BiometricMatchLevel, evaluateBiometricMatchLevel } from '../config/biometricConfig';

export interface PatientProfileData {
  patient_id: string; // e.g. P-6022, P-0012
  id: number | string;
  first_name: string;
  last_name: string;
  full_name: string;
  age: number;
  gender: 'male' | 'female' | 'other';
  contact?: string;
  phone?: string;
  email?: string;
  created_at: string;
  last_active?: string;
  status: 'active' | 'pending_info' | 'suspended';
}

export interface PatientBiometricData {
  face_vector: number[]; // 128-d embedding array
  registered_face_url: string; // e.g. /uploads/patients/{patient_id}/profile_face.jpg
  enrolled_at: string;
  model_version: string;
}

export interface PatientRehabScoreItem {
  id: string | number;
  timestamp: string;
  exercise_id: string;
  exercise_name: string;
  mode: 'physio' | 'minigame';
  score: number;
  max_angle: number;
  target_angle: number;
  reps: number;
  accuracy: number;
  duration_seconds: number;
}

export interface PatientDailyChecklist {
  date: string; // YYYY-MM-DD
  completed_exercises: string[];
  total_reps: number;
  is_completed: boolean;
  last_checked_at: string;
}

export interface PatientAssignedExercise {
  id: string;
  name: string;
  target_angle: number;
  hold_seconds: number;
  reps: number;
  sets?: number;
  exerciseSlug?: string;
  exerciseName?: string;
  difficulty?: 'beginner' | 'intermediate' | 'advanced';
}

export interface PatientScheduleData {
  schedule_days: string[];
  time_slot?: string;
  start_time?: string;
  end_time?: string;
  start_date?: string;
  end_date?: string;
  room_station?: string;
  include_minigame?: boolean;
  status?: 'active' | 'completed' | 'paused';
}

export interface PatientMedicalRecords {
  diagnosis: string;
  chief_complaint?: string;
  medical_history?: string;
  treatment_plan?: string;
  progress_notes?: string;
  responsible_therapist?: string;
  assigned_exercises: PatientAssignedExercise[];
  schedule?: PatientScheduleData;
  include_minigame?: boolean;
}

export interface PatientLoginSnapshot {
  timestamp: number;
  date_str: string;
  similarity_score: number;
  similarity_percent: string;
  snapshot_image_url: string; // e.g. /uploads/patients/{patient_id}/login_history/login_{timestamp}.jpg
}

export interface CompletePatientRecord {
  patient_profile: PatientProfileData;
  biometric_data: PatientBiometricData;
  game_rehab: {
    daily_checklists: PatientDailyChecklist[];
    rehab_scores: PatientRehabScoreItem[];
  };
  medical_records: PatientMedicalRecords;
  login_history: PatientLoginSnapshot[];
}

export interface PartialPatientRecord {
  patient_profile?: Partial<PatientProfileData>;
  biometric_data?: Partial<PatientBiometricData>;
  game_rehab?: {
    daily_checklists?: PatientDailyChecklist[];
    rehab_scores?: PatientRehabScoreItem[];
  };
  medical_records?: Partial<PatientMedicalRecords>;
  login_history?: PatientLoginSnapshot[];
}

export interface PatientFaceBinding {
  patientId: string | number;
  patientCode: string;
  name: string;
  vector: number[];
  face_image_url?: string;
  age?: number;
  gender?: string;
  diagnosis?: string;
  status?: string;
  assigned_exercises?: any[];
  rehab_scores?: PatientRehabScoreItem[];
}

export interface FaceMatchComparisonResult {
  patient_id: string | number;
  patient_code: string;
  name: string;
  distance: number;
  similarity: number;
  similarityPercent: string;
  has_image: boolean;
}

export interface MatchEvaluation {
  matched: PatientFaceBinding | null;
  bestScore: number;
  bestScorePercent: number;
  bestDistance: number;
  comparisons: FaceMatchComparisonResult[];
  matchLevel?: BiometricMatchLevel;
  nearMatchCandidate?: PatientFaceBinding | null;
}

/**
 * Check if a patient name or status indicates a placeholder / temporary draft account
 * (e.g. "ผู้ป่วยใหม่", "ผู้รับบริการใหม่", "ผู้ลงทะเบียนใหม่", "รอลงข้อมูล", "pending_info")
 * Such accounts must never be matched for face login.
 */
export function isPlaceholderPatientName(name?: string, status?: string): boolean {
  if (!name || typeof name !== 'string') return true;
  const trimmed = name.trim();
  if (!trimmed) return true;

  const lower = trimmed.toLowerCase();
  if (
    lower.includes('ผู้ป่วยใหม่') ||
    lower.includes('ผู้รับบริการใหม่') ||
    lower.includes('ผู้ลงทะเบียนใหม่') ||
    lower.includes('รอลงข้อมูล') ||
    lower.includes('pending_info') ||
    lower.includes('[pending_info]') ||
    lower.includes('โหมดสาธิต') ||
    lower.includes('[โหมดสาธิต]')
  ) {
    return true;
  }

  // Generic titles without actual patient identity: "ผู้รับบริการ", "ผู้ป่วย (P-xxxx)", "ผู้รับบริการ (P-xxxx)"
  if (/^ผู้รับบริการ(\s*\(P-\d+\))?$/i.test(trimmed) || /^ผู้ป่วย(\s*\(P-\d+\))?$/i.test(trimmed)) {
    return true;
  }

  if (status === 'pending_info') {
    return true;
  }

  return false;
}

class PatientFaceStorageService {
  private static instance: PatientFaceStorageService;
  private memoryRecords: Map<string, CompletePatientRecord> = new Map();

  private constructor() {
    this.hydrateFromStorage();
  }

  public static getInstance(): PatientFaceStorageService {
    if (!PatientFaceStorageService.instance) {
      PatientFaceStorageService.instance = new PatientFaceStorageService();
    }
    return PatientFaceStorageService.instance;
  }

  /**
   * Normalize patient ID / HN to consistent upper-case key (e.g. 'P-6022')
   */
  public normalizePatientId(idOrCode: string | number): string {
    const s = String(idOrCode || '').trim();
    if (!s) return 'P-0000';
    if (!s.toUpperCase().startsWith('P-') && !isNaN(Number(s))) {
      return `P-${s.padStart(4, '0')}`;
    }
    return s.toUpperCase();
  }

  /**
   * Helper: Build sanitized, individual folder name for patient: {patientCode}_{cleanName}
   * e.g. P-6022_สมชาย_ใจดี
   */
  public getPatientFolderName(patientId: string | number, patientName?: string): string {
    const code = this.normalizePatientId(patientId);
    let name = patientName;
    if (!name) {
      // SAFE LOOKUP: Read directly from memory or localStorage without calling getPatientRecord
      // to strictly prevent infinite mutual recursion
      const existing = this.memoryRecords.get(code);
      name = existing?.patient_profile?.full_name || existing?.patient_profile?.first_name;

      if (!name && typeof window !== 'undefined' && window.localStorage) {
        try {
          const raw =
            localStorage.getItem(`patient_record_${code}`) ||
            localStorage.getItem(`fs:/public/uploads/patients/${code}/patient_record.json`);
          if (raw) {
            const parsed = JSON.parse(raw);
            name = parsed?.patient_profile?.full_name || parsed?.patient_profile?.first_name;
          }
        } catch {}
      }
    }
    if (name && typeof name === 'string') {
      const clean = name
        .replace(/\[PENDING_INFO\]/g, '')
        .replace(/[\\/:*?"<>|]/g, '_')
        .replace(/\s+/g, '_')
        .replace(/^_+|_+$/g, '')
        .trim();
      if (clean && !clean.includes('ผู้รับบริการใหม่') && clean !== 'ผู้รับบริการ' && !clean.includes('รอลงข้อมูล')) {
        return `${code}_${clean}`;
      }
    }
    return code;
  }

  /**
   * Get isolated directory path for a patient
   */
  public getPatientDirPath(patientId: string | number, patientName?: string): string {
    const folderName = this.getPatientFolderName(patientId, patientName);
    return `/public/uploads/patients/${folderName}/`;
  }

  /**
   * 1. Create dedicated isolated directory for a patient (named folder and alias)
   */
  public createPatientDirectory(patientId: string | number, patientName?: string): string {
    const code = this.normalizePatientId(patientId);
    const folderName = this.getPatientFolderName(code, patientName);
    const dirPath = `/public/uploads/patients/${folderName}/`;
    const loginHistoryDirPath = `/public/uploads/patients/${folderName}/login_history/`;

    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        localStorage.setItem(`fs:${dirPath}`, 'DIR');
        localStorage.setItem(`fs:${loginHistoryDirPath}`, 'DIR');
        if (folderName !== code) {
          localStorage.setItem(`fs:/public/uploads/patients/${code}/`, 'DIR');
          localStorage.setItem(`fs:/public/uploads/patients/${code}/login_history/`, 'DIR');
        }
      } catch {}
    }

    // Required Debug Logging
    console.log(`[STORAGE] Created patient directory: ${dirPath} (code: ${code})`);
    return dirPath;
  }

  /**
   * 2. Capture and automatically compress/resize live camera frame
   * [AUTOMATIC IMAGE COMPRESSION]: Max dimensions 800x800px, JPEG quality 80% (0.80).
   * Ensures crisp human viewing on profile modal while keeping file sizes small (~100-150 KB).
   */
  public captureFrameAsJpg(
    video: HTMLVideoElement | null,
    quality: number = 0.80,
    maxWidth: number = 800,
    maxHeight: number = 800
  ): string | null {
    if (!video || video.readyState < 2) return null;
    try {
      const origW = video.videoWidth || 640;
      const origH = video.videoHeight || 480;

      // Maintain aspect ratio while bounding within maxWidth x maxHeight
      let targetW = origW;
      let targetH = origH;
      if (targetW > maxWidth || targetH > maxHeight) {
        const ratio = Math.min(maxWidth / targetW, maxHeight / targetH);
        targetW = Math.round(targetW * ratio);
        targetH = Math.round(targetH * ratio);
      }

      const canvas = document.createElement('canvas');
      canvas.width = targetW;
      canvas.height = targetH;
      const ctx = canvas.getContext('2d');
      if (!ctx) return null;

      // High-quality bicubic downscaling with camera upright orientation
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      cameraOrientationService.drawUprightFrame(video, ctx, targetW, targetH);

      const compressedJpg = canvas.toDataURL('image/jpeg', quality);
      const approxKb = Math.round((compressedJpg.length * 0.75) / 1024);
      console.log(
        `[STORAGE] Compressed image: ${targetW}x${targetH}px, quality ${Math.round(quality * 100)}% (~${approxKb} KB)`
      );
      return compressedJpg;
    } catch (err) {
      console.error('❌ Failed to capture & compress camera frame:', err);
      return null;
    }
  }

  /**
   * Helper to ensure an existing image Data URL is compressed within 800x800px & 80% JPEG quality
   */
  public compressDataUrl(
    dataUrl: string,
    quality: number = 0.80,
    maxWidth: number = 800,
    maxHeight: number = 800
  ): string {
    if (!dataUrl || !dataUrl.startsWith('data:image')) return dataUrl;
    try {
      const img = new Image();
      img.src = dataUrl;
      if (img.width && img.height && (img.width > maxWidth || img.height > maxHeight)) {
        let targetW = img.width;
        let targetH = img.height;
        const ratio = Math.min(maxWidth / targetW, maxHeight / targetH);
        targetW = Math.round(targetW * ratio);
        targetH = Math.round(targetH * ratio);

        const canvas = document.createElement('canvas');
        canvas.width = targetW;
        canvas.height = targetH;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = 'high';
          ctx.drawImage(img, 0, 0, targetW, targetH);
          return canvas.toDataURL('image/jpeg', quality);
        }
      }
    } catch {}
    return dataUrl;
  }

  /**
   * 3. Save profile face image and patient_record.json for a specific patient
   */
  public savePatientRecord(
    patientId: string | number,
    partialRecord: PartialPatientRecord,
    profileFaceDataUrl?: string | null,
    syncToSupabase: boolean = true
  ): CompletePatientRecord {
    const code = this.normalizePatientId(patientId);

    // Retrieve existing or create new complete dossier
    const existing = this.getPatientRecord(code);

    const firstName = partialRecord.patient_profile?.first_name || existing?.patient_profile.first_name || 'ผู้รับบริการ';
    const lastName = partialRecord.patient_profile?.last_name || existing?.patient_profile.last_name || '';
    const fullName = partialRecord.patient_profile?.full_name || `${firstName} ${lastName}`.trim();

    // Create named folder e.g. P-6022_สมชาย_ใจดี
    const folderName = this.getPatientFolderName(code, fullName);
    this.createPatientDirectory(code, fullName);

    const namedDirPath = `/public/uploads/patients/${folderName}/`;
    const aliasDirPath = `/public/uploads/patients/${code}/`;

    const existingPhoto = this.getProfileFaceImage(code, fullName);
    const resolvedPhoto = profileFaceDataUrl || existing?.biometric_data.registered_face_url || existingPhoto;
    const registeredFaceUrl = resolvedPhoto || `${namedDirPath}profile_face.jpg`;

    const fullRecord: CompletePatientRecord = {
      patient_profile: {
        patient_id: code,
        id: partialRecord.patient_profile?.id || existing?.patient_profile.id || code,
        first_name: firstName,
        last_name: lastName,
        full_name: fullName,
        age: partialRecord.patient_profile?.age || existing?.patient_profile.age || 65,
        gender: partialRecord.patient_profile?.gender || existing?.patient_profile.gender || 'male',
        contact: partialRecord.patient_profile?.contact || existing?.patient_profile.contact || partialRecord.patient_profile?.phone,
        phone: partialRecord.patient_profile?.phone || existing?.patient_profile.phone,
        email: partialRecord.patient_profile?.email || existing?.patient_profile.email,
        created_at: partialRecord.patient_profile?.created_at || existing?.patient_profile.created_at || new Date().toISOString().split('T')[0],
        last_active: partialRecord.patient_profile?.last_active || existing?.patient_profile.last_active || 'เพิ่งลงทะเบียน',
        status: partialRecord.patient_profile?.status || existing?.patient_profile.status || 'active',
      },
      biometric_data: {
        face_vector: partialRecord.biometric_data?.face_vector || existing?.biometric_data.face_vector || [],
        registered_face_url: registeredFaceUrl,
        enrolled_at: partialRecord.biometric_data?.enrolled_at || existing?.biometric_data.enrolled_at || new Date().toISOString(),
        model_version: partialRecord.biometric_data?.model_version || existing?.biometric_data.model_version || 'face-resnet34-v2',
      },
      game_rehab: {
        daily_checklists: partialRecord.game_rehab?.daily_checklists || existing?.game_rehab.daily_checklists || [],
        rehab_scores: partialRecord.game_rehab?.rehab_scores || existing?.game_rehab.rehab_scores || [],
      },
      medical_records: {
        diagnosis: partialRecord.medical_records?.diagnosis || existing?.medical_records.diagnosis || 'ข้อไหล่ติดระยะฟื้นฟู (Frozen Shoulder)',
        chief_complaint: partialRecord.medical_records?.chief_complaint || existing?.medical_records.chief_complaint,
        medical_history: partialRecord.medical_records?.medical_history || existing?.medical_records.medical_history,
        treatment_plan: partialRecord.medical_records?.treatment_plan || existing?.medical_records.treatment_plan,
        progress_notes: partialRecord.medical_records?.progress_notes || existing?.medical_records.progress_notes,
        responsible_therapist: partialRecord.medical_records?.responsible_therapist || existing?.medical_records.responsible_therapist || 'กภ. ธนากร วงศ์สวัสดิ์',
        assigned_exercises: partialRecord.medical_records?.assigned_exercises || existing?.medical_records.assigned_exercises || [
          { id: 'shoulder_raise', name: 'กางแขนด้านข้าง (Shoulder Abduction)', target_angle: 90, hold_seconds: 3, reps: 10 },
          { id: 'overhead_reach', name: 'ยกแขนขึ้นเหนือศีรษะ (Overhead Reach)', target_angle: 120, hold_seconds: 3, reps: 10 },
          { id: 'elbow_flexion', name: 'งอและเหยียดข้อศอก (Elbow Flexion)', target_angle: 140, hold_seconds: 2, reps: 12 },
        ],
      },
      login_history: partialRecord.login_history || existing?.login_history || [],
    };

    // Store in-memory
    this.memoryRecords.set(code, fullRecord);
    if (folderName !== code) {
      this.memoryRecords.set(folderName, fullRecord);
    }

    // Save distinctly to isolated persistent storage in both named folder & code alias
    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        const serialized = JSON.stringify(fullRecord);
        localStorage.setItem(`fs:${namedDirPath}patient_record.json`, serialized);
        localStorage.setItem(`fs:${aliasDirPath}patient_record.json`, serialized);
        localStorage.setItem(`patient_record_${code}`, serialized);
        localStorage.setItem(`patient_record_${folderName}`, serialized);

        if (resolvedPhoto) {
          localStorage.setItem(`fs:${namedDirPath}profile_face.jpg`, resolvedPhoto);
          localStorage.setItem(`fs:${aliasDirPath}profile_face.jpg`, resolvedPhoto);
          localStorage.setItem(`face_image_${code}`, resolvedPhoto);
          localStorage.setItem(`face_image_${folderName}`, resolvedPhoto);
          localStorage.setItem(`face_image_${fullRecord.patient_profile.id}`, resolvedPhoto);
        }
      } catch (err) {
        console.warn('⚠️ LocalStorage quota warning when saving patient record:', err);
      }
    }

    // Synchronize directly to Supabase Cloud ONLY if syncToSupabase is true AND patient is not deleted
    const deletedSet = typeof window !== 'undefined' ? (() => {
      try {
        const raw = localStorage.getItem('strongcare_deleted_users');
        return raw ? new Set(JSON.parse(raw)) : new Set();
      } catch { return new Set(); }
    })() : new Set();

    const isBlacklisted = deletedSet.has(code.toUpperCase()) || deletedSet.has(String(patientId).toUpperCase());
    if (isBlacklisted) {
      console.log(`[STORAGE] Skipping Supabase sync for blacklisted deleted patient: ${code}`);
      return fullRecord;
    }

    if (syncToSupabase && supabaseService.isConfigured() && (resolvedPhoto || fullRecord.biometric_data?.face_vector)) {
      const vec = fullRecord.biometric_data?.face_vector || [];
      supabaseService.saveFaceEmbeddings(
        code,
        vec,
        resolvedPhoto || undefined
      ).catch((e: any) => console.warn('[SUPABASE] saveFaceEmbeddings background error:', e));
    }

    // Synchronize to Central Backend API (Multi-Device Single Source of Truth)
    if (typeof window !== 'undefined') {
      try {
        const baseUrl = resolveDefaultApiUrl();
        if (baseUrl) {
          fetch(`${baseUrl}/patients/register-face`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              patient_code: code,
              code: code,
              id: fullRecord.patient_profile.id,
              name: fullRecord.patient_profile.full_name,
              first_name: fullRecord.patient_profile.first_name,
              last_name: fullRecord.patient_profile.last_name,
              age: fullRecord.patient_profile.age,
              gender: fullRecord.patient_profile.gender,
              phone: fullRecord.patient_profile.phone || fullRecord.patient_profile.contact,
              status: fullRecord.patient_profile.status,
              diagnosis: fullRecord.medical_records?.diagnosis,
              chief_complaint: fullRecord.medical_records?.chief_complaint,
              medical_history: fullRecord.medical_records?.medical_history,
              assigned_exercises: fullRecord.medical_records?.assigned_exercises,
              face_vector: fullRecord.biometric_data?.face_vector,
              image_data_url: resolvedPhoto || null,
            }),
          }).catch(() => {});
        }
      } catch {}
    }

    // Required Debug Logging
    console.log(`[STORAGE] Saved profile face image and patient_record.json for ${folderName} (HN: ${code}) successfully.`);

    return fullRecord;
  }

  /**
   * 4. Save login snapshot image taken during verification into login_history/
   * Saves into patient-specific named folder: /public/uploads/patients/{folderName}/login_history/
   * [LOGIN SNAPSHOT CLEANUP POLICY]:
   * Retain ONLY latest 10 login snapshots per patient.
   * Auto-purge older snapshot files upon saving a new one.
   * NEVER delete or compress the main reference profile_face.jpg or face_vector!
   */
  public saveLoginSnapshot(
    patientId: string | number,
    snapshotJpg: string | null,
    similarityScore: number,
    patientName?: string
  ): PatientLoginSnapshot | null {
    if (!snapshotJpg) return null;
    const code = this.normalizePatientId(patientId);
    const resolvedName = patientName || this.getPatientRecord(code)?.patient_profile?.full_name || '';
    const folderName = this.getPatientFolderName(code, resolvedName);
    const timestamp = Date.now();
    const simPercent = Math.round(similarityScore * 100);
    const fileName = `login_${timestamp}_${simPercent}.jpg`;
    const snapshotPath = `/public/uploads/patients/${folderName}/login_history/${fileName}`;
    const aliasSnapshotPath = `/public/uploads/patients/${code}/login_history/${fileName}`;

    // Ensure snapshot is compressed to max 800x800 & 80% JPEG quality
    const compressedSnapshot = this.compressDataUrl(snapshotJpg, 0.80, 800, 800);

    const snapshotItem: PatientLoginSnapshot = {
      timestamp,
      date_str: new Date(timestamp).toLocaleString('th-TH'),
      similarity_score: similarityScore,
      similarity_percent: `${simPercent}%`,
      snapshot_image_url: snapshotPath,
    };

    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        localStorage.setItem(`fs:${snapshotPath}`, compressedSnapshot);
        if (snapshotPath !== aliasSnapshotPath) {
          localStorage.setItem(`fs:${aliasSnapshotPath}`, compressedSnapshot);
        }
      } catch (err) {
        console.warn('⚠️ LocalStorage quota warning when saving login snapshot:', err);
      }
    }

    // Synchronize snapshot to backend server to write on disk in folderName/login_history/
    if (typeof window !== 'undefined') {
      try {
        const baseUrl = resolveDefaultApiUrl();
        if (baseUrl) {
          fetch(`${baseUrl}/patients/login-snapshot`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              patient_code: code,
              code: code,
              name: resolvedName,
              similarity: similarityScore,
              similarity_score: similarityScore,
              snapshot_image: compressedSnapshot,
            }),
          }).catch(() => {});
        }
      } catch {}
    }

    // Update patient dossier's login_history and apply RETENTION POLICY (Latest 10)
    const record = this.getPatientRecord(code);
    if (record) {
      if (!record.login_history) {
        record.login_history = [];
      }
      record.login_history.unshift(snapshotItem);

      // [AUTO-PURGE]: Retain ONLY latest 10 login snapshots per patient
      const MAX_SNAPSHOTS = 10;
      if (record.login_history.length > MAX_SNAPSHOTS) {
        const snapshotsToPurge = record.login_history.slice(MAX_SNAPSHOTS);
        record.login_history = record.login_history.slice(0, MAX_SNAPSHOTS);

        // Delete older snapshot files from storage
        snapshotsToPurge.forEach((oldSnap) => {
          if (oldSnap.snapshot_image_url) {
            // Strict security check: NEVER delete profile_face.jpg or anything outside login_history
            if (
              oldSnap.snapshot_image_url.includes('/login_history/') &&
              !oldSnap.snapshot_image_url.includes('profile_face.jpg')
            ) {
              try {
                if (typeof window !== 'undefined' && window.localStorage) {
                  localStorage.removeItem(`fs:${oldSnap.snapshot_image_url}`);
                  const aliasOld = oldSnap.snapshot_image_url.replace(folderName, code);
                  localStorage.removeItem(`fs:${aliasOld}`);
                }
                console.log(
                  `[STORAGE] Purged older login snapshot: ${oldSnap.snapshot_image_url} (retaining latest ${MAX_SNAPSHOTS})`
                );
              } catch (e) {}
            }
          }
        });
      }

      this.savePatientRecord(code, record);
    }

    // Required Debug Logging
    console.log(`[STORAGE] Saved login snapshot in folder ${folderName}: ${snapshotPath}`);
    return snapshotItem;
  }

  /**
   * Manually or periodically purge older login snapshots beyond retainCount
   */
  public purgeOldLoginSnapshots(patientId: string | number, retainCount: number = 10): number {
    const code = this.normalizePatientId(patientId);
    const record = this.getPatientRecord(code);
    if (!record || !record.login_history || record.login_history.length <= retainCount) {
      return 0;
    }

    const toPurge = record.login_history.slice(retainCount);
    record.login_history = record.login_history.slice(0, retainCount);
    let count = 0;

    toPurge.forEach((oldSnap) => {
      if (
        oldSnap.snapshot_image_url &&
        oldSnap.snapshot_image_url.includes('/login_history/') &&
        !oldSnap.snapshot_image_url.includes('profile_face.jpg')
      ) {
        try {
          if (typeof window !== 'undefined' && window.localStorage) {
            localStorage.removeItem(`fs:${oldSnap.snapshot_image_url}`);
          }
          count++;
          console.log(
            `[STORAGE] Purged older login snapshot: ${oldSnap.snapshot_image_url} (retaining latest ${retainCount})`
          );
        } catch (e) {}
      }
    });

    this.savePatientRecord(code, record);
    return count;
  }

  /**
   * 5. Record rehab score directly into patient_record.json
   */
  public recordRehabScore(
    patientId: string | number,
    scoreItem: PatientRehabScoreItem
  ): void {
    const code = this.normalizePatientId(patientId);
    const record = this.getPatientRecord(code);
    if (!record) return;

    record.game_rehab.rehab_scores.unshift(scoreItem);

    // Update daily checklist
    const today = new Date().toISOString().split('T')[0];
    let daily = record.game_rehab.daily_checklists.find((c) => c.date === today);
    if (!daily) {
      daily = {
        date: today,
        completed_exercises: [scoreItem.exercise_id],
        total_reps: scoreItem.reps,
        is_completed: false,
        last_checked_at: new Date().toISOString(),
      };
      record.game_rehab.daily_checklists.unshift(daily);
    } else {
      if (!daily.completed_exercises.includes(scoreItem.exercise_id)) {
        daily.completed_exercises.push(scoreItem.exercise_id);
      }
      daily.total_reps += scoreItem.reps;
      daily.last_checked_at = new Date().toISOString();
    }

    const assignedCount = record.medical_records.assigned_exercises.length || 3;
    if (daily.completed_exercises.length >= assignedCount) {
      daily.is_completed = true;
    }

    this.savePatientRecord(code, record);
    console.log(`[STORAGE] Recorded rehab score for ${code}: ${scoreItem.exercise_name} (${scoreItem.score} pts)`);
  }

  /**
   * 6. Retrieve a specific patient's complete dossier by patient_id
   */
  public getPatientRecord(patientId: string | number, patientName?: string): CompletePatientRecord | null {
    const code = this.normalizePatientId(patientId);

    // Check memory first
    if (this.memoryRecords.has(code)) {
      return this.memoryRecords.get(code)!;
    }

    const folderName = this.getPatientFolderName(code, patientName);
    if (this.memoryRecords.has(folderName)) {
      return this.memoryRecords.get(folderName)!;
    }

    // Check persistent storage in both named directory and code key
    if (typeof window !== 'undefined' && window.localStorage) {
      const candidates = [
        `fs:/public/uploads/patients/${folderName}/patient_record.json`,
        `fs:/public/uploads/patients/${code}/patient_record.json`,
        `patient_record_${code}`,
        `patient_record_${folderName}`,
      ];

      for (const k of candidates) {
        const raw = localStorage.getItem(k);
        if (raw) {
          try {
            const parsed = JSON.parse(raw);
            this.memoryRecords.set(code, parsed);
            if (folderName !== code) {
              this.memoryRecords.set(folderName, parsed);
            }
            return parsed;
          } catch {}
        }
      }
    }

    return null;
  }

  /**
   * 7. Retrieve patient's reference profile face image from named folder or storage
   */
  public getProfileFaceImage(patientId: string | number, patientName?: string): string | null {
    const code = this.normalizePatientId(patientId);
    const folderName = this.getPatientFolderName(code, patientName);

    if (typeof window !== 'undefined' && window.localStorage) {
      const candidates = [
        `fs:/public/uploads/patients/${folderName}/profile_face.jpg`,
        `fs:/public/uploads/patients/${code}/profile_face.jpg`,
        `face_image_${code}`,
        `face_image_${folderName}`,
      ];

      for (const k of candidates) {
        const val = localStorage.getItem(k);
        if (val) return val;
      }
    }

    const record = this.getPatientRecord(code, patientName);
    if (record?.biometric_data.registered_face_url) {
      return record.biometric_data.registered_face_url;
    }

    return null;
  }

  /**
   * Compatibility wrapper for existing getPatientFaceImage calls
   */
  public getPatientFaceImage(patientCodeOrId: string | number, patientName?: string): string | null {
    return this.getProfileFaceImage(patientCodeOrId, patientName);
  }

  /**
   * 8. Retrieve all isolated patient records
   */
  public getAllPatientRecords(): CompletePatientRecord[] {
    return Array.from(this.memoryRecords.values());
  }

  /**
   * 9. Compatibility wrapper for savePatientFaceData
   */
  public savePatientFaceData(
    patientId: string | number,
    patientCode: string,
    vector: number[],
    imageDataUrl: string | null,
    patientName?: string,
    age?: number,
    gender?: string,
    status: 'active' | 'suspended' | 'pending_info' = 'active'
  ): { face_image_url: string; imageFileName: string } {
    const code = this.normalizePatientId(patientCode || patientId);
    const timestamp = Date.now();
    const imageFileName = `face_${code}_${timestamp}.jpg`;
    const profileFacePath = `/uploads/faces/${imageFileName}`;

    const existing = this.getPatientRecord(code);
    const resolvedName = (patientName && !isPlaceholderPatientName(patientName))
      ? patientName.trim()
      : (existing?.patient_profile?.full_name && !isPlaceholderPatientName(existing.patient_profile.full_name))
        ? existing.patient_profile.full_name
        : `ผู้รับบริการ (${code})`;

    const record = this.savePatientRecord(
      code,
      {
        patient_profile: {
          patient_id: code,
          id: patientId,
          first_name: resolvedName.split(' ')[0] || resolvedName,
          last_name: resolvedName.split(' ').slice(1).join(' ') || '',
          full_name: resolvedName,
          age: age || existing?.patient_profile?.age || 65,
          gender: (gender as any) || existing?.patient_profile?.gender || 'male',
          created_at: new Date().toISOString().split('T')[0],
          status: status,
        },
        biometric_data: {
          face_vector: vector,
          registered_face_url: imageDataUrl || profileFacePath,
          enrolled_at: new Date().toISOString(),
          model_version: 'face-resnet34-v2',
        },
      },
      imageDataUrl
    );

    const savedImgUrl = imageDataUrl || record.biometric_data.registered_face_url || profileFacePath;

    // [CONSOLE LOGS & DEBUGGING]: Log patient_id, saved face_image_url, and vector length upon successful registration
    console.log('[REGISTRATION] Success:', {
      patient_id: code,
      saved_face_image_url: savedImgUrl,
      vector_length: vector.length,
    });

    return {
      face_image_url: savedImgUrl,
      imageFileName,
    };
  }

  /**
   * 10. Robust parsing of 128-D numeric arrays
   */
  public parseVector(raw: any): number[] | null {
    if (!raw) return null;
    let data = raw;
    if (typeof data === 'string') {
      try {
        data = JSON.parse(data);
      } catch {}
    }
    if (data && typeof data === 'object' && !Array.isArray(data)) {
      if (Array.isArray(data.face_vector)) data = data.face_vector;
      else if (Array.isArray(data.vector)) data = data.vector;
      else if (Array.isArray(data.embedding)) data = data.embedding;
      else if (Array.isArray(data.embeddings?.[0])) data = data.embeddings[0];
      else if (Array.isArray(data.embeddings)) data = data.embeddings;
    }
    if (Array.isArray(data)) {
      const flat = data.length === 1 && Array.isArray(data[0]) ? data[0] : data;
      const nums = flat.map(Number);
      if (nums.length === 128 && nums.every((n) => !isNaN(n) && isFinite(n))) {
        return this.normalizeVector(nums);
      }
    }
    return null;
  }

  /**
   * L2 Normalization of a 128-D vector
   */
  public normalizeVector(v: number[]): number[] {
    if (!v || v.length !== 128) return v;
    let sumSq = 0;
    for (let i = 0; i < 128; i++) sumSq += v[i] * v[i];
    const norm = Math.sqrt(sumSq) || 1.0;
    return v.map((val) => val / norm);
  }

  /**
   * Compute Euclidean Distance between two 128-D normalized vectors
   */
  public computeEuclideanDistance(vA: number[], vB: number[]): number {
    if (!vA || !vB || vA.length !== 128 || vB.length !== 128) return 2.0;
    let sumSq = 0;
    for (let i = 0; i < 128; i++) {
      const diff = vA[i] - vB[i];
      sumSq += diff * diff;
    }
    return Math.sqrt(sumSq);
  }

  /**
   * 11. Compute mathematical Cosine Similarity between two 128-D vectors
   */
  public computeCosineSimilarity(vA: number[], vB: number[]): number {
    if (!vA || !vB || vA.length !== 128 || vB.length !== 128) return 0;
    let dot = 0;
    let normA = 0;
    let normB = 0;
    for (let i = 0; i < 128; i++) {
      const a = vA[i];
      const b = vB[i];
      dot += a * b;
      normA += a * a;
      normB += b * b;
    }
    const denom = Math.sqrt(normA) * Math.sqrt(normB);
    return denom > 0 ? dot / denom : 0;
  }

  /**
   * รวมเวกเตอร์ 128 มิติจากหลายเฟรม (Multi-frame Sampling) เพื่อลดความผันผวนจากแสง/มุม
   * คำนวณค่ามัธยฐาน (Median) หรือเฉลี่ย (Average) ในแต่ละมิติ แล้วทำการ L2 Normalization
   */
  public aggregateVectors(vectors: number[][], useMedian: boolean = true): number[] {
    if (!vectors || !vectors.length) return [];
    const validVectors = vectors.filter((v) => v && v.length === 128);
    if (!validVectors.length) return [];
    if (validVectors.length === 1) return this.normalizeVector(validVectors[0]);

    const dim = 128;
    const aggregated: number[] = new Array(dim).fill(0);

    for (let d = 0; d < dim; d++) {
      const vals: number[] = [];
      for (let f = 0; f < validVectors.length; f++) {
        vals.push(validVectors[f][d]);
      }

      if (useMedian) {
        vals.sort((a, b) => a - b);
        const mid = Math.floor(vals.length / 2);
        aggregated[d] = vals.length % 2 !== 0 ? vals[mid] : (vals[mid - 1] + vals[mid]) / 2;
      } else {
        const sum = vals.reduce((acc, v) => acc + v, 0);
        aggregated[d] = sum / vals.length;
      }
    }

    return this.normalizeVector(aggregated);
  }

  /**
   * 12. Match live scanned face against all registered patient records (3-Tier Biometric Matching)
   * - Pass (>= 88% / 0.88): เข้าระบบอัตโนมัติ
   * - Near-Match (75% - 87%): ยืนยันตัวตนเพิ่มเติมด้วย PIN 6 หลัก หรือ HN
   * - No-Match (< 75%): ไม่พบข้อมูลใบหน้านี้
   */
  public matchLiveFaceAgainstDatabase(
    liveVector: number[],
    candidates: PatientFaceBinding[],
    similarityThreshold: number = BIOMETRIC_CONFIG.THRESHOLD_PASS
  ): MatchEvaluation {
    if (!liveVector || liveVector.length !== 128 || !candidates.length) {
      console.warn('⚠️ [FACE MATCH]: Invalid live vector or empty candidate database');
      return {
        matched: null,
        bestScore: 0,
        bestScorePercent: 0,
        bestDistance: 2.0,
        comparisons: [],
        matchLevel: 'no-match',
      };
    }

    const normLive = this.normalizeVector(liveVector);
    const comparisons: FaceMatchComparisonResult[] = [];
    let bestMatch: PatientFaceBinding | null = null;
    let lowestDistance = 999.0;
    let highestSimilarity = -1;

    // Strictly evaluate ONLY genuine registered patient accounts (exclude any placeholder accounts like 'ผู้ป่วยใหม่')
    const eligibleCandidates = candidates.filter(
      (cand) => !isPlaceholderPatientName(cand.name, cand.status)
    );

    for (const cand of eligibleCandidates) {
      const normCand = this.normalizeVector(cand.vector);
      const dist = this.computeEuclideanDistance(normLive, normCand);
      const cosSim = this.computeCosineSimilarity(normLive, normCand);
      const simPercent = Math.max(0, Math.min(100, Math.round(cosSim * 100)));

      comparisons.push({
        patient_id: cand.patientId,
        patient_code: cand.patientCode,
        name: cand.name,
        distance: Number(dist.toFixed(4)),
        similarity: Number(cosSim.toFixed(4)),
        similarityPercent: `${simPercent}%`,
        has_image: Boolean(cand.face_image_url),
      });

      if (cosSim > highestSimilarity) {
        highestSimilarity = cosSim;
        lowestDistance = dist;
        bestMatch = cand;
      }
    }

    // Sort comparisons by highest similarity first
    comparisons.sort((a, b) => b.similarity - a.similarity);

    // [CONSOLE LOGS & DEBUGGING]: Log the list of compared patients and resulting similarity percentage scores
    console.log('[BIOMETRIC LOGIN] Candidate Comparisons Table (3-Tier):');
    console.table(
      comparisons.map((c) => ({
        HN: c.patient_code,
        Name: c.name,
        Distance: c.distance,
        CosineSimilarity: c.similarity,
        SimilarityPercent: c.similarityPercent,
      }))
    );

    const highestPercent = Math.max(0, Math.min(100, Math.round(highestSimilarity * 100)));
    const matchLevel = evaluateBiometricMatchLevel(highestSimilarity);

    // กรณีที่ 1: ผ่านเกณฑ์ Auto-Login (>= 88%)
    if (matchLevel === 'pass' && bestMatch) {
      console.log('🎯 [FACE MATCH SUCCESS - AUTO LOGIN]:', {
        matched_patient_id: bestMatch.patientId,
        matched_hn: bestMatch.patientCode,
        matched_name: bestMatch.name,
        distance: Number(lowestDistance.toFixed(4)),
        similarity: `${highestPercent}%`,
        threshold: `${Math.round(similarityThreshold * 100)}%`,
        tier: 'PASS (>= 88%)',
      });

      return {
        matched: bestMatch,
        bestScore: highestSimilarity,
        bestScorePercent: highestPercent,
        bestDistance: Number(lowestDistance.toFixed(4)),
        comparisons,
        matchLevel: 'pass',
      };
    }

    // กรณีที่ 2: เกือบตรง (75% - 87%) ยืนยันตัวตนเพิ่มเติม
    if (matchLevel === 'near-match' && bestMatch) {
      console.log('🟡 [FACE MATCH NEAR-MATCH - REQUIRE SECONDARY AUTH]:', {
        candidate_hn: bestMatch.patientCode,
        candidate_name: bestMatch.name,
        distance: Number(lowestDistance.toFixed(4)),
        similarity: `${highestPercent}%`,
        tier: 'NEAR-MATCH (75-87%)',
      });

      return {
        matched: null,
        nearMatchCandidate: bestMatch,
        bestScore: highestSimilarity,
        bestScorePercent: highestPercent,
        bestDistance: Number(lowestDistance.toFixed(4)),
        comparisons,
        matchLevel: 'near-match',
      };
    }

    // กรณีที่ 3: ไม่ตรง (< 75%)
    console.warn('❌ [FACE MATCH NO-MATCH (< 75%)]:', {
      lowest_distance: Number(lowestDistance.toFixed(4)),
      highest_similarity: `${highestPercent}%`,
      required_threshold: `${Math.round(similarityThreshold * 100)}%`,
      candidate_count: candidates.length,
      tier: 'NO-MATCH (< 75%)',
    });

    return {
      matched: null,
      nearMatchCandidate: null,
      bestScore: Math.max(0, highestSimilarity),
      bestScorePercent: highestPercent,
      bestDistance: Number(lowestDistance.toFixed(4)),
      comparisons,
      matchLevel: 'no-match',
    };
  }

  /**
   * Synchronize Treatment Plan & Schedule configuration into patient_record.json
   */
  public syncTreatmentPlan(plan: any): CompletePatientRecord | null {
    if (!plan) return null;
    const patientCode = plan.patientCode || plan.patientId;
    if (!patientCode) return null;
    const code = this.normalizePatientId(patientCode);

    const convertedExercises: PatientAssignedExercise[] = (plan.assignedExercises || []).map((ex: any, idx: number) => ({
      id: ex.exerciseSlug || ex.id || String(idx + 1),
      name: ex.exerciseName || ex.name || 'ท่ากายภาพบำบัด',
      target_angle: ex.targetAngle || 90,
      hold_seconds: ex.holdSeconds || 3,
      reps: ex.reps || ex.repsPerSet || 10,
      sets: ex.sets || 3,
      exerciseSlug: ex.exerciseSlug || ex.slug || ex.id,
      exerciseName: ex.exerciseName || ex.name,
      difficulty: ex.difficulty || 'beginner',
    }));

    const minigameEnabled = Boolean(plan.includeMinigame ?? plan.include_minigame);

    const scheduleData: PatientScheduleData = {
      schedule_days: plan.scheduleDays || ['จันทร์', 'พุธ', 'ศุกร์'],
      time_slot: plan.timeSlot || '09:30 - 10:30',
      start_time: plan.startTime || '09:30',
      end_time: plan.endTime || '10:30',
      start_date: plan.startDate || '2026-10-01',
      end_date: plan.endDate || '2026-10-31',
      room_station: plan.roomStation || 'ตู้ Kiosk 1',
      include_minigame: minigameEnabled,
      status: plan.status || 'active',
    };

    const saved = this.savePatientRecord(code, {
      patient_profile: {
        patient_id: code,
        full_name: plan.patientName || undefined,
      },
      medical_records: {
        diagnosis: plan.diagnosis || 'ข้อไหล่ติดระยะฟื้นฟู (Frozen Shoulder)',
        treatment_plan: plan.clinicalNotes || 'ปฏิบัติตามแผนฟื้นฟูกายภาพประจำวัน',
        responsible_therapist: plan.therapistName || 'กภ. ธนากร วงศ์สวัสดิ์',
        assigned_exercises: convertedExercises,
        schedule: scheduleData,
        include_minigame: minigameEnabled,
      },
    });

    console.log(`[STORAGE] Synchronized treatment plan & schedule for ${code}:`, {
      exercisesCount: convertedExercises.length,
      days: scheduleData.schedule_days,
      include_minigame: minigameEnabled,
    });

    return saved;
  }

  /**
   * Evaluate if a patient has a scheduled physical therapy session today
   */
  public evaluateTodaySchedule(planOrRecord: any, referenceDate?: Date): {
    isScheduledToday: boolean;
    isRestDay: boolean;
    isOutsideCourse: boolean;
    reason: 'scheduled' | 'rest_day' | 'outside_course' | 'no_plan';
    message: string;
    todayDayNameTh: string;
    todayDayShortTh: string;
    formattedDateTh: string;
    timeSlot: string;
    roomStation: string;
    therapistName: string;
    includeMinigame: boolean;
    assignedExercises: PatientAssignedExercise[];
  } {
    const d = referenceDate || new Date();
    const THAI_DAYS_FULL = [
      'วันอาทิตย์', 'วันจันทร์', 'วันอังคาร', 'วันพุธ', 'วันพฤหัสบดี', 'วันศุกร์', 'วันเสาร์'
    ];
    const THAI_DAYS_SHORT = ['อา.', 'จ.', 'อ.', 'พ.', 'พฤ.', 'ศ.', 'ส.'];
    const THAI_MONTHS_FULL = [
      'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
      'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'
    ];

    const dayIndex = d.getDay();
    const todayDayNameTh = THAI_DAYS_FULL[dayIndex];
    const todayDayShortTh = THAI_DAYS_SHORT[dayIndex];
    const dayOfMonth = d.getDate();
    const monthIndex = d.getMonth();
    const beYear = d.getFullYear() + 543;
    const formattedDateTh = `${todayDayNameTh}ที่ ${dayOfMonth} ${THAI_MONTHS_FULL[monthIndex]} พ.ศ. ${beYear} (${String(dayOfMonth).padStart(2, '0')}/${String(monthIndex + 1).padStart(2, '0')}/${beYear})`;

    if (!planOrRecord) {
      return {
        isScheduledToday: false,
        isRestDay: true,
        isOutsideCourse: false,
        reason: 'no_plan',
        message: 'วันนี้เป็นวันพักผ่อนของคุณ หรือไม่มีรายการฝึกกายภาพสำหรับวันนี้',
        todayDayNameTh,
        todayDayShortTh,
        formattedDateTh,
        timeSlot: '09:30 - 10:30',
        roomStation: 'ตู้ Kiosk 1',
        therapistName: 'กภ. ธนากร วงศ์สวัสดิ์',
        includeMinigame: false,
        assignedExercises: [],
      };
    }

    const scheduleDays: string[] =
      planOrRecord.scheduleDays ||
      planOrRecord.schedule?.schedule_days ||
      planOrRecord.medical_records?.schedule?.schedule_days ||
      ['จันทร์', 'พุธ', 'ศุกร์'];

    const startDate: string | undefined =
      planOrRecord.startDate ||
      planOrRecord.schedule?.start_date ||
      planOrRecord.medical_records?.schedule?.start_date;

    const endDate: string | undefined =
      planOrRecord.endDate ||
      planOrRecord.schedule?.end_date ||
      planOrRecord.medical_records?.schedule?.end_date;

    const timeSlot: string =
      planOrRecord.timeSlot ||
      planOrRecord.schedule?.time_slot ||
      planOrRecord.medical_records?.schedule?.time_slot ||
      '09:30 - 10:30 น.';

    const roomStation: string =
      planOrRecord.roomStation ||
      planOrRecord.schedule?.room_station ||
      planOrRecord.medical_records?.schedule?.room_station ||
      'ตู้ Kiosk 1';

    const therapistName: string =
      planOrRecord.therapistName ||
      planOrRecord.medical_records?.responsible_therapist ||
      'กภ. ธนากร วงศ์สวัสดิ์';

    const includeMinigame: boolean = Boolean(
      planOrRecord.includeMinigame ??
      planOrRecord.include_minigame ??
      planOrRecord.schedule?.include_minigame ??
      planOrRecord.medical_records?.schedule?.include_minigame ??
      planOrRecord.medical_records?.include_minigame
    );

    const rawExercises: any[] =
      planOrRecord.assignedExercises ||
      planOrRecord.medical_records?.assigned_exercises ||
      [];

    const assignedExercises: PatientAssignedExercise[] = rawExercises.map((ex, idx) => ({
      id: ex.exerciseSlug || ex.id || String(idx + 1),
      name: ex.exerciseName || ex.name || 'ท่ากายภาพบำบัด',
      target_angle: ex.targetAngle || ex.target_angle || 90,
      hold_seconds: ex.holdSeconds || ex.hold_seconds || 3,
      reps: ex.reps || ex.targetReps || 10,
      sets: ex.sets || 3,
      exerciseSlug: ex.exerciseSlug || ex.slug || ex.id,
      exerciseName: ex.exerciseName || ex.name,
      difficulty: ex.difficulty || 'beginner',
    }));

    // 1. Check Date Range
    const ymd = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    let isOutsideCourse = false;
    if (startDate && ymd < startDate) isOutsideCourse = true;
    if (endDate && ymd > endDate) isOutsideCourse = true;

    if (isOutsideCourse) {
      return {
        isScheduledToday: false,
        isRestDay: true,
        isOutsideCourse: true,
        reason: 'outside_course',
        message: 'วันนี้อยู่นอกช่วงวันที่กำหนดคอร์สการรักษา',
        todayDayNameTh,
        todayDayShortTh,
        formattedDateTh,
        timeSlot,
        roomStation,
        therapistName,
        includeMinigame,
        assignedExercises,
      };
    }

    // 2. Check Day-of-Week Matching
    const dayKey = todayDayNameTh.replace('วัน', ''); // e.g. "พุธ"
    const isDayMatched = scheduleDays.some((sd) => {
      const clean = sd.trim();
      return (
        clean.includes(dayKey) ||
        clean.includes(todayDayShortTh) ||
        todayDayNameTh.includes(clean)
      );
    });

    if (!isDayMatched) {
      return {
        isScheduledToday: false,
        isRestDay: true,
        isOutsideCourse: false,
        reason: 'rest_day',
        message: 'วันนี้เป็นวันพักผ่อนของคุณ หรือไม่มีรายการฝึกกายภาพสำหรับวันนี้',
        todayDayNameTh,
        todayDayShortTh,
        formattedDateTh,
        timeSlot,
        roomStation,
        therapistName,
        includeMinigame,
        assignedExercises,
      };
    }

    return {
      isScheduledToday: true,
      isRestDay: false,
      isOutsideCourse: false,
      reason: 'scheduled',
      message: 'วันนี้มีรายการฝึกกายภาพบำบัดตามตารางนัดหมาย',
      todayDayNameTh,
      todayDayShortTh,
      formattedDateTh,
      timeSlot,
      roomStation,
      therapistName,
      includeMinigame,
      assignedExercises,
    };
  }

  /**
   * Delete isolated directory & all records for a patient permanently
   * [FIX DELETE USER PERSISTENCE]:
   * - Physically delete directory: /public/uploads/patients/{patient_id}/
   * - Delete profile_face.jpg, login_history/*, patient_record.json
   * - Clean localStorage fs: keys, legacy keys, memory records, and biometric registry
   */
  public deletePatientDirectoryAndData(patientIdOrCode: string | number): boolean {
    const code = this.normalizePatientId(patientIdOrCode);
    const existing = this.getPatientRecord(code);
    const folderName = this.getPatientFolderName(code, existing?.patient_profile?.full_name);
    const dirPrefix = `/public/uploads/patients/${code}/`;
    const namedDirPrefix = `/public/uploads/patients/${folderName}/`;
    
    // 1. Remove from in-memory cache
    this.memoryRecords.delete(code);
    this.memoryRecords.delete(folderName);
    if (this.memoryRecords.has(String(patientIdOrCode))) {
      this.memoryRecords.delete(String(patientIdOrCode));
    }

    // 2. Remove all localStorage files and folders associated with this patient
    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        const keysToRemove: string[] = [];
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (!key) continue;
          if (
            key.startsWith(`fs:${dirPrefix}`) ||
            key === `fs:${dirPrefix}` ||
            key.startsWith(`fs:${namedDirPrefix}`) ||
            key === `fs:${namedDirPrefix}` ||
            key === `fs:/public/uploads/patients/${code}` ||
            key === `fs:/public/uploads/patients/${folderName}` ||
            key === `patient_record_${code}` ||
            key === `patient_record_${folderName}` ||
            key === `patient_record_${patientIdOrCode}` ||
            key === `face_image_${code}` ||
            key === `face_image_${folderName}` ||
            key === `face_image_${patientIdOrCode}`
          ) {
            keysToRemove.push(key);
          }
        }
        keysToRemove.forEach((k) => localStorage.removeItem(k));
      } catch (e) {
        console.warn('Error purging patient directory keys:', e);
      }
    }

    // 3. Purge from Biometric Face Registry
    try {
      FaceRegistryService.getInstance().removeProfile(code);
      FaceRegistryService.getInstance().removeProfile(patientIdOrCode);
    } catch {}

    console.log(`[STORAGE] Physically deleted patient directory ${dirPrefix} and purged all records.`);
    return true;
  }

  /**
   * Alias for backwards compatibility
   */
  public purgePatientFaceData(patientIdOrCode: string | number): boolean {
    return this.deletePatientDirectoryAndData(patientIdOrCode);
  }

  /**
   * Hydrate existing patient records from localStorage (excluding deleted users)
   */
  private hydrateFromStorage(): void {
    if (typeof window === 'undefined' || !window.localStorage) return;
    try {
      let deletedCodes: string[] = [];
      try {
        const rawDel = localStorage.getItem('strongcare_deleted_users');
        if (rawDel) {
          deletedCodes = JSON.parse(rawDel);
        }
      } catch {}

      const deletedSet = new Set(deletedCodes.map((c) => String(c).toUpperCase()));

      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && (key.startsWith('patient_record_') || key.endsWith('patient_record.json'))) {
          const raw = localStorage.getItem(key);
          if (raw) {
            try {
              const record: CompletePatientRecord = JSON.parse(raw);
              const pId = record?.patient_profile?.patient_id;
              const pName = record?.patient_profile?.full_name || record?.patient_profile?.first_name;
              const pStatus = record?.patient_profile?.status;

              // Skip and purge placeholder/draft accounts lingering in storage
              if (isPlaceholderPatientName(pName, pStatus)) {
                localStorage.removeItem(key);
                continue;
              }

              if (pId) {
                const norm = this.normalizePatientId(pId);
                if (deletedSet.has(norm) || deletedSet.has(String(pId).toUpperCase()) || (record.patient_profile.id && deletedSet.has(String(record.patient_profile.id)))) {
                  // Skip and purge deleted records lingering in storage
                  localStorage.removeItem(key);
                  continue;
                }
                this.memoryRecords.set(norm, record);
              }
            } catch {}
          }
        }
      }
    } catch {}
  }

  /**
   * Purge all placeholder/draft records (such as 'ผู้ป่วยใหม่') across localStorage and memory
   */
  public purgeAllPlaceholderRecords(): number {
    if (typeof window === 'undefined' || !window.localStorage) return 0;
    let purgedCount = 0;
    try {
      const keysToRemove: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && (k.startsWith('patient_record_') || k.endsWith('patient_record.json'))) {
          try {
            const raw = localStorage.getItem(k);
            if (raw) {
              const record: CompletePatientRecord = JSON.parse(raw);
              const name = record?.patient_profile?.full_name || record?.patient_profile?.first_name;
              const status = record?.patient_profile?.status;
              if (isPlaceholderPatientName(name, status)) {
                keysToRemove.push(k);
                const pId = record?.patient_profile?.patient_id;
                if (pId) {
                  this.memoryRecords.delete(this.normalizePatientId(pId));
                  this.memoryRecords.delete(String(pId).toUpperCase());
                }
              }
            }
          } catch {}
        }
      }
      keysToRemove.forEach((k) => {
        localStorage.removeItem(k);
        purgedCount++;
      });

      // Also clean strongcare_enrolled_faces from FaceRegistry
      const rawFaces = localStorage.getItem('strongcare_enrolled_faces');
      if (rawFaces) {
        try {
          const list = JSON.parse(rawFaces);
          if (Array.isArray(list)) {
            const cleaned = list.filter((p: any) => !isPlaceholderPatientName(p.name));
            if (cleaned.length !== list.length) {
              localStorage.setItem('strongcare_enrolled_faces', JSON.stringify(cleaned));
              purgedCount += (list.length - cleaned.length);
            }
          }
        } catch {}
      }

      // Also clean strongcare_hospital_users
      const rawUsers = localStorage.getItem('strongcare_hospital_users');
      if (rawUsers) {
        try {
          const uList = JSON.parse(rawUsers);
          if (Array.isArray(uList)) {
            const cleaned = uList.filter((u: any) => u.role !== 'patient' || !isPlaceholderPatientName(u.name, u.status));
            if (cleaned.length !== uList.length) {
              localStorage.setItem('strongcare_hospital_users', JSON.stringify(cleaned));
              purgedCount += (uList.length - cleaned.length);
            }
          }
        } catch {}
      }

      if (purgedCount > 0) {
        console.log(`[STORAGE] Purged ${purgedCount} legacy placeholder records (e.g. ผู้ป่วยใหม่)`);
      }
    } catch {}
    return purgedCount;
  }
}

export const patientFaceStorageService = PatientFaceStorageService.getInstance();
