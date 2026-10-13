/**
 * StrongCare - Patient Face Vector & Image Storage Service
 * 
 * Strict Per-Patient Face Vector and Image Storage & Matching Engine:
 * 1. Live camera frame capture (High Quality JPG)
 * 2. Per-patient isolated storage for 128-d vectors and image data
 * 3. Robust Cosine Similarity matching engine with detailed diagnostic logging
 */

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

  private constructor() {}

  public static getInstance(): PatientFaceStorageService {
    if (!PatientFaceStorageService.instance) {
      PatientFaceStorageService.instance = new PatientFaceStorageService();
    }
    return PatientFaceStorageService.instance;
  }

  /**
   * 1. Capture live camera frame as high-quality JPG Data URL
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

      // Draw un-mirrored frame for saving
      ctx.drawImage(video, 0, 0, vw, vh);
      return canvas.toDataURL('image/jpeg', quality);
    } catch (err) {
      console.error('❌ Failed to capture camera frame:', err);
      return null;
    }
  }

  /**
   * 2. Save patient face image and vector to isolated persistent storage
   */
  public savePatientFaceData(
    patientId: string | number,
    patientCode: string,
    vector: number[],
    imageDataUrl: string | null
  ): { face_image_url: string; imageFileName: string } {
    const timestamp = Date.now();
    const imageFileName = `face_${patientCode}_${timestamp}.jpg`;
    let faceImageUrl = imageDataUrl || '';

    if (typeof window !== 'undefined' && window.localStorage && imageDataUrl) {
      try {
        // Uniquely isolated keys per patient code
        localStorage.setItem(`face_image_${patientCode}`, imageDataUrl);
        localStorage.setItem(`face_image_${patientId}`, imageDataUrl);
        localStorage.setItem(imageFileName, imageDataUrl);
      } catch (err) {
        console.warn('⚠️ LocalStorage storage quota reached for full JPG, saving compact reference:', err);
      }
    }

    // Console Logs & Debugging Requirement:
    // Log patient_id, saved face_image_url, and vector length upon successful registration
    console.log('✅ [FACE REGISTRATION SUCCESS]:', {
      patient_id: patientId,
      patient_code: patientCode,
      saved_face_image_url: imageFileName,
      has_image_data: Boolean(imageDataUrl),
      vector_length: vector ? vector.length : 0,
    });

    return {
      face_image_url: faceImageUrl || imageFileName,
      imageFileName,
    };
  }

  /**
   * 3. Get saved face image URL for a specific patient
   */
  public getPatientFaceImage(patientCodeOrId: string | number): string | null {
    if (typeof window === 'undefined' || !window.localStorage) return null;
    const str = String(patientCodeOrId);
    // 1. Direct filename or key
    const direct = localStorage.getItem(str);
    if (direct) return direct;
    // 2. Standard isolated key: face_image_P-xxxx or face_image_12
    const key = `face_image_${str}`;
    const val = localStorage.getItem(key);
    if (val) return val;
    return null;
  }

  /**
   * 4. Parse vector ensuring correct 128-D numeric array
   */
  public parseVector(raw: any): number[] | null {
    if (!raw) return null;
    if (Array.isArray(raw)) {
      // If 2D array: e.g. [[...128 numbers...]]
      const flat = (raw.length === 1 && Array.isArray(raw[0])) ? raw[0] : raw;
      const nums = flat.map(Number);
      if (nums.length === 128 && nums.every((n) => !isNaN(n))) {
        return nums;
      }
    }
    if (typeof raw === 'string') {
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          const flat = (parsed.length === 1 && Array.isArray(parsed[0])) ? parsed[0] : parsed;
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
   * 5. Compute mathematical Cosine Similarity between two 128-D vectors
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
   * 6. Match live scanned face against all registered patient records
   * Threshold default: 0.80 (80%)
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

    // Console Logs & Debugging Requirement:
    // Log the list of compared patients and their resulting similarity percentage scores during login
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
}

export const patientFaceStorageService = PatientFaceStorageService.getInstance();
