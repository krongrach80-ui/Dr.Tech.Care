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

export interface PatientMedicalRecords {
  diagnosis: string;
  chief_complaint?: string;
  medical_history?: string;
  treatment_plan?: string;
  progress_notes?: string;
  responsible_therapist?: string;
  assigned_exercises: Array<{
    id: string;
    name: string;
    target_angle: number;
    hold_seconds: number;
    reps: number;
  }>;
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
  similarity: number;
  similarityPercent: string;
  has_image: boolean;
}

export interface MatchEvaluation {
  matched: PatientFaceBinding | null;
  bestScore: number;
  bestScorePercent: number;
  comparisons: FaceMatchComparisonResult[];
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
   * Get isolated directory path for a patient
   */
  public getPatientDirPath(patientId: string | number): string {
    const code = this.normalizePatientId(patientId);
    return `/public/uploads/patients/${code}/`;
  }

  /**
   * 1. Create dedicated isolated directory for a patient
   */
  public createPatientDirectory(patientId: string | number): string {
    const code = this.normalizePatientId(patientId);
    const dirPath = `/public/uploads/patients/${code}/`;
    const loginHistoryDirPath = `/public/uploads/patients/${code}/login_history/`;

    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        localStorage.setItem(`fs:${dirPath}`, 'DIR');
        localStorage.setItem(`fs:${loginHistoryDirPath}`, 'DIR');
      } catch {}
    }

    // Required Debug Logging
    console.log(`[STORAGE] Created directory: ${dirPath}`);
    return dirPath;
  }

  /**
   * 2. Capture live camera frame as high-quality JPG Data URL
   */
  public captureFrameAsJpg(video: HTMLVideoElement | null, quality: number = 0.88): string | null {
    if (!video || video.readyState < 2) return null;
    try {
      const canvas = document.createElement('canvas');
      const vw = video.videoWidth || 640;
      const vh = video.videoHeight || 480;
      canvas.width = vw;
      canvas.height = vh;
      const ctx = canvas.getContext('2d');
      if (!ctx) return null;

      ctx.drawImage(video, 0, 0, vw, vh);
      return canvas.toDataURL('image/jpeg', quality);
    } catch (err) {
      console.error('❌ Failed to capture camera frame:', err);
      return null;
    }
  }

  /**
   * 3. Save profile face image and patient_record.json for a specific patient
   */
  public savePatientRecord(
    patientId: string | number,
    partialRecord: PartialPatientRecord,
    profileFaceDataUrl?: string | null
  ): CompletePatientRecord {
    const code = this.normalizePatientId(patientId);
    this.createPatientDirectory(code);

    const dirPath = this.getPatientDirPath(code);
    const profileFacePath = `${dirPath}profile_face.jpg`;
    const recordJsonPath = `${dirPath}patient_record.json`;

    // Retrieve existing or create new complete dossier
    const existing = this.getPatientRecord(code);

    const firstName = partialRecord.patient_profile?.first_name || existing?.patient_profile.first_name || 'ผู้รับบริการ';
    const lastName = partialRecord.patient_profile?.last_name || existing?.patient_profile.last_name || '';
    const fullName = partialRecord.patient_profile?.full_name || `${firstName} ${lastName}`.trim();

    const registeredFaceUrl = profileFaceDataUrl || existing?.biometric_data.registered_face_url || profileFacePath;

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

    // Save distinctly to isolated persistent storage
    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        if (profileFaceDataUrl) {
          localStorage.setItem(`fs:${profileFacePath}`, profileFaceDataUrl);
          localStorage.setItem(`face_image_${code}`, profileFaceDataUrl);
          localStorage.setItem(`face_image_${fullRecord.patient_profile.id}`, profileFaceDataUrl);
        }
        localStorage.setItem(`fs:${recordJsonPath}`, JSON.stringify(fullRecord));
        localStorage.setItem(`patient_record_${code}`, JSON.stringify(fullRecord));
      } catch (err) {
        console.warn('⚠️ LocalStorage quota warning when saving patient record:', err);
      }
    }

    // Required Debug Logging
    console.log(`[STORAGE] Saved profile face image and patient_record.json for ${code} successfully.`);

    return fullRecord;
  }

  /**
   * 4. Save login snapshot image taken during verification into login_history/
   */
  public saveLoginSnapshot(
    patientId: string | number,
    snapshotJpg: string | null,
    similarityScore: number
  ): PatientLoginSnapshot | null {
    if (!snapshotJpg) return null;
    const code = this.normalizePatientId(patientId);
    const timestamp = Date.now();
    const fileName = `login_${timestamp}_${Math.round(similarityScore * 100)}.jpg`;
    const snapshotPath = `/public/uploads/patients/${code}/login_history/${fileName}`;

    const snapshotItem: PatientLoginSnapshot = {
      timestamp,
      date_str: new Date(timestamp).toLocaleString('th-TH'),
      similarity_score: similarityScore,
      similarity_percent: `${Math.round(similarityScore * 100)}%`,
      snapshot_image_url: snapshotPath,
    };

    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        localStorage.setItem(`fs:${snapshotPath}`, snapshotJpg);
      } catch {}
    }

    // Update patient dossier's login_history
    const record = this.getPatientRecord(code);
    if (record) {
      record.login_history.unshift(snapshotItem);
      // Keep up to 20 recent snapshots
      if (record.login_history.length > 20) {
        record.login_history = record.login_history.slice(0, 20);
      }
      this.savePatientRecord(code, record);
    }

    // Required Debug Logging
    console.log(`[STORAGE] Saved login snapshot: ${snapshotPath}`);
    return snapshotItem;
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
  public getPatientRecord(patientId: string | number): CompletePatientRecord | null {
    const code = this.normalizePatientId(patientId);

    // Check memory first
    if (this.memoryRecords.has(code)) {
      return this.memoryRecords.get(code)!;
    }

    // Check persistent storage
    if (typeof window !== 'undefined' && window.localStorage) {
      const raw =
        localStorage.getItem(`fs:/public/uploads/patients/${code}/patient_record.json`) ||
        localStorage.getItem(`patient_record_${code}`);
      if (raw) {
        try {
          const parsed = JSON.parse(raw);
          this.memoryRecords.set(code, parsed);
          return parsed;
        } catch {}
      }
    }

    return null;
  }

  /**
   * 7. Retrieve patient's reference profile face image
   */
  public getProfileFaceImage(patientId: string | number): string | null {
    const code = this.normalizePatientId(patientId);

    if (typeof window !== 'undefined' && window.localStorage) {
      const fsKey = `fs:/public/uploads/patients/${code}/profile_face.jpg`;
      const direct = localStorage.getItem(fsKey);
      if (direct) return direct;

      const altKey = `face_image_${code}`;
      const alt = localStorage.getItem(altKey);
      if (alt) return alt;
    }

    const record = this.getPatientRecord(code);
    if (record?.biometric_data.registered_face_url) {
      return record.biometric_data.registered_face_url;
    }

    return null;
  }

  /**
   * Compatibility wrapper for existing getPatientFaceImage calls
   */
  public getPatientFaceImage(patientCodeOrId: string | number): string | null {
    return this.getProfileFaceImage(patientCodeOrId);
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
    imageDataUrl: string | null
  ): { face_image_url: string; imageFileName: string } {
    const code = this.normalizePatientId(patientCode || patientId);
    const dirPath = this.getPatientDirPath(code);
    const profileFacePath = `${dirPath}profile_face.jpg`;

    const record = this.savePatientRecord(
      code,
      {
        patient_profile: {
          patient_id: code,
          id: patientId,
          first_name: `ผู้รับบริการ`,
          last_name: `(${code})`,
          full_name: `ผู้รับบริการ (${code})`,
          age: 65,
          gender: 'male',
          created_at: new Date().toISOString().split('T')[0],
          status: 'pending_info',
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

    return {
      face_image_url: imageDataUrl || record.biometric_data.registered_face_url || profileFacePath,
      imageFileName: 'profile_face.jpg',
    };
  }

  /**
   * 10. Robust parsing of 128-D numeric arrays
   */
  public parseVector(raw: any): number[] | null {
    if (!raw) return null;
    if (Array.isArray(raw)) {
      const flat = raw.length === 1 && Array.isArray(raw[0]) ? raw[0] : raw;
      const nums = flat.map(Number);
      if (nums.length === 128 && nums.every((n) => !isNaN(n))) {
        return nums;
      }
    }
    if (typeof raw === 'string') {
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          const flat = parsed.length === 1 && Array.isArray(parsed[0]) ? parsed[0] : parsed;
          const nums = flat.map(Number);
          if (nums.length === 128 && nums.every((n) => !isNaN(n))) {
            return nums;
          }
        }
      } catch {}
    }
    return null;
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
   * 12. Match live scanned face against all registered patient records
   */
  public matchLiveFaceAgainstDatabase(
    liveVector: number[],
    candidates: PatientFaceBinding[],
    threshold: number = 0.80
  ): MatchEvaluation {
    if (!liveVector || liveVector.length !== 128 || !candidates.length) {
      console.warn('⚠️ [FACE MATCH]: Invalid live vector or empty candidate database');
      return {
        matched: null,
        bestScore: 0,
        bestScorePercent: 0,
        comparisons: [],
      };
    }

    const comparisons: FaceMatchComparisonResult[] = [];
    let bestMatch: PatientFaceBinding | null = null;
    let highestScore = -1;

    for (const cand of candidates) {
      const sim = this.computeCosineSimilarity(liveVector, cand.vector);
      const simPercent = Math.max(0, Math.round(sim * 100));

      comparisons.push({
        patient_id: cand.patientId,
        patient_code: cand.patientCode,
        name: cand.name,
        similarity: Number(sim.toFixed(4)),
        similarityPercent: `${simPercent}%`,
        has_image: Boolean(cand.face_image_url),
      });

      if (sim > highestScore) {
        highestScore = sim;
        bestMatch = cand;
      }
    }

    // Sort comparisons by similarity descending
    comparisons.sort((a, b) => b.similarity - a.similarity);

    // Required Debug Logging
    console.log('🔍 [FACE MATCH COMPARISON LIST]:', comparisons);

    const bestScorePercent = Math.max(0, Math.round(highestScore * 100));

    if (highestScore >= threshold && bestMatch) {
      console.log('🎯 [FACE MATCH SUCCESS]:', {
        matched_patient_id: bestMatch.patientId,
        matched_hn: bestMatch.patientCode,
        matched_name: bestMatch.name,
        similarity: `${bestScorePercent}%`,
        threshold: `${Math.round(threshold * 100)}%`,
      });
      return {
        matched: bestMatch,
        bestScore: highestScore,
        bestScorePercent,
        comparisons,
      };
    }

    console.warn('❌ [FACE MATCH FAILED - NO PATIENT REACHED THRESHOLD]:', {
      highest_similarity: `${bestScorePercent}%`,
      required_threshold: `${Math.round(threshold * 100)}%`,
      candidate_count: candidates.length,
    });

    return {
      matched: null,
      bestScore: Math.max(0, highestScore),
      bestScorePercent,
      comparisons,
    };
  }

  /**
   * Hydrate existing patient records from localStorage
   */
  private hydrateFromStorage(): void {
    if (typeof window === 'undefined' || !window.localStorage) return;
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && (key.startsWith('patient_record_') || key.endsWith('patient_record.json'))) {
          const raw = localStorage.getItem(key);
          if (raw) {
            try {
              const record: CompletePatientRecord = JSON.parse(raw);
              if (record?.patient_profile?.patient_id) {
                this.memoryRecords.set(record.patient_profile.patient_id, record);
              }
            } catch {}
          }
        }
      }
    } catch {}
  }
}

export const patientFaceStorageService = PatientFaceStorageService.getInstance();
