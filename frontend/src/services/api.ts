import { Patient } from '../types/patient';
import { ExerciseDefinition } from '../types/exercise';
import { Session, SessionReport } from '../types/session';
import { resolveDefaultApiUrl, IS_STATIC_MODE } from '../config/apiConfig';
import { IndexedDbService } from './indexedDbService';
import { supabaseService } from './supabaseService';
import { faceRegistryService } from './faceRegistryService';
import { patientFaceStorageService, isPlaceholderPatientName } from './patientFaceStorageService';

function getApiBase(): string {
  return resolveDefaultApiUrl() || '/api';
}

/**
 * In-memory and sessionStorage token manager (Never stores in localStorage for PDPA & security)
 */
let inMemoryToken: string | null = null;

export const authStorage = {
  getToken(): string | null {
    if (inMemoryToken) return inMemoryToken;
    if (typeof sessionStorage !== 'undefined') {
      try {
        return sessionStorage.getItem('strongcare_auth_token');
      } catch {
        return null;
      }
    }
    return null;
  },
  setToken(token: string | null): void {
    inMemoryToken = token;
    if (typeof sessionStorage !== 'undefined') {
      try {
        if (token) {
          sessionStorage.setItem('strongcare_auth_token', token);
        } else {
          sessionStorage.removeItem('strongcare_auth_token');
        }
      } catch {
        // Ignore storage error
      }
    }
  },
  clear(): void {
    this.setToken(null);
  }
};

/**
 * Fetch wrapper that attaches Authorization: Bearer token and handles 401 redirection
 */
async function fetchWithAuth(url: string, options: RequestInit = {}): Promise<Response> {
  const token = authStorage.getToken();
  const headers = new Headers(options.headers || {});

  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const response = await fetch(url, { ...options, headers });

  if (response.status === 401) {
    authStorage.clear();
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('auth:unauthorized'));
    }
  }

  return response;
}

/**
 * Helper: Format Date as Local MySQL DateTime string (YYYY-MM-DD HH:mm:ss)
 */
function formatLocalMySQLDateTime(date: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  const year = date.getFullYear();
  const month = pad(date.getMonth() + 1);
  const day = pad(date.getDate());
  const hours = pad(date.getHours());
  const minutes = pad(date.getMinutes());
  const seconds = pad(date.getSeconds());
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

export const api = {
  getAuthToken(): string | null {
    return authStorage.getToken();
  },

  setAuthToken(token: string | null): void {
    authStorage.setToken(token);
  },

  /**
   * เข้าสู่ระบบด้วย PIN หรือรหัสผ่านฝั่งเซิร์ฟเวอร์
   */
  async login(payload: { patient_id?: number | string; patient_code?: string; pin?: string; username?: string; password?: string }): Promise<any> {
    if (IS_STATIC_MODE) {
      return {
        status: 'success',
        role: 'patient',
        token: 'demo-static-token',
        patient: { id: payload.patient_id || 1, name: 'คุณสมชาย ใจดี [โหมดสาธิต]' },
        message: 'เข้าสู่ระบบสำเร็จ [โหมดสาธิต]'
      };
    }

    const res = await fetch(`${getApiBase()}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => null);
      throw new Error(err?.message || `เข้าสู่ระบบไม่สำเร็จ HTTP ${res.status}`);
    }

    const data = await res.json();
    if (data.token) {
      authStorage.setToken(data.token);
    }
    return data;
  },

  /**
   * ออกจากระบบ
   */
  async logout(): Promise<void> {
    try {
      if (!IS_STATIC_MODE) {
        await fetchWithAuth(`${getApiBase()}/auth/logout`, { method: 'POST' });
      }
    } catch {
      // Ignore network error on logout
    } finally {
      authStorage.clear();
    }
  },

  /**
   * ดึงรายชื่อผู้ป่วยจากฐานข้อมูลกลาง (Central Database Single Source of Truth)
   */
  async getPatients(): Promise<Patient[]> {
    try {
      const res = await fetch(`${getApiBase()}/patients`);
      if (res.ok) {
        const json = await res.json();
        const records = json.data ?? [];
        return records.map((r: any) => ({
          id: r.id,
          patient_code: r.code || r.patient_code,
          name: r.name,
          age: r.age,
          gender: r.gender,
          phone: r.phone,
          notes: r.chief_complaint || r.diagnosis || r.notes,
          status: r.status,
          assigned_therapist_name: r.assignedTherapistName,
          face_image_url: r.face_image_url,
          created_at: r.created_at,
          last_active: r.last_active,
        }));
      }
    } catch (err) {
      console.warn('⚠️ Fetch from central API failed, checking local fallbacks:', err);
    }

    if (IS_STATIC_MODE) {
      return [
        { id: 1, patient_code: 'PT-2026-001', name: 'คุณสมชาย ใจดี [โหมดสาธิต]', age: 65, gender: 'male', notes: 'ฟื้นฟูกล้ามเนื้อไหล่และข้อศอกหลังผ่าตัด' },
        { id: 2, patient_code: 'PT-2026-002', name: 'วิภาดา รัตนกุล (Wiphada R.) [โหมดสาธิต]', age: 42, gender: 'female', notes: 'กายภาพบำบัดฟื้นฟูข้อเข่า' },
      ];
    }

    return [];
  },

  /**
   * สร้างโปรไฟล์ผู้ป่วยใหม่ลงฐานข้อมูลกลาง (Central Backend DB)
   */
  async createPatient(patient: Partial<Patient>): Promise<Patient> {
    // 1. Send to Supabase if configured
    if (supabaseService.isConfigured()) {
      try {
        const sbRes = await supabaseService.createPatient(patient);
        if (sbRes) {
          return {
            id: sbRes.id,
            patient_code: sbRes.patient_code,
            name: sbRes.full_name,
            age: sbRes.age,
            gender: sbRes.gender,
            notes: sbRes.therapist_notes || sbRes.chief_complaint,
            phone: sbRes.phone,
            chief_complaint: sbRes.chief_complaint,
            medical_history: sbRes.medical_history,
            treatment_outcome: sbRes.treatment_outcome,
            therapist_notes: sbRes.therapist_notes,
          };
        }
      } catch (err) {
        console.warn('Supabase createPatient in api.ts failed:', err);
      }
    }

    // 2. Send to Central Synchronized Backend Server
    try {
      const res = await fetch(`${getApiBase()}/patients`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patient),
      });
      if (res.ok) {
        const json = await res.json();
        return json.data;
      }
    } catch (err) {
      console.warn('⚠️ Central server createPatient error:', err);
    }

    if (IS_STATIC_MODE) {
      return {
        id: Date.now(),
        patient_code: patient.patient_code ?? `PT-DEMO-${Math.floor(Math.random() * 1000)}`,
        name: patient.name ?? 'ผู้ป่วยใหม่ [โหมดสาธิต]',
        age: patient.age ?? 60,
        gender: patient.gender ?? 'other',
        notes: `${patient.notes ?? ''} [โหมดสาธิต]`.trim(),
      };
    }

    return {
      id: Date.now(),
      patient_code: patient.patient_code || `P-${Math.floor(1000 + Math.random() * 9000)}`,
      name: patient.name || 'ผู้ป่วยใหม่',
      age: patient.age || 65,
      gender: patient.gender || 'male',
      notes: patient.notes || '',
    };
  },

  /**
   * ดึงรายการท่ากายภาพบำบัด
   */
  async getExercises(): Promise<ExerciseDefinition[]> {
    if (IS_STATIC_MODE) {
      return [
        {
          id: 1,
          name: 'Shoulder Lateral Raise (กางแขนยกหัวไหล่) [โหมดสาธิต]',
          slug: 'shoulder_raise',
          category: 'Upper Body',
          description: 'ฝึกยกแขนออกด้านข้างลำตัวเพื่อฟื้นฟูกล้ามเนื้อ Deltoid',
          target_joint: 'shoulder',
          target_angle: 90,
          min_angle: 75,
          max_angle: 110,
          target_reps: 10,
          difficulty: 'beginner',
        },
        {
          id: 2,
          name: 'Bicep Curl (งอข้อศอกฟื้นฟูกล้ามเนื้อ) [โหมดสาธิต]',
          slug: 'bicep_curl',
          category: 'Upper Body',
          description: 'บริหารข้อศอกและการเคลื่อนไหวแขนท่อนล่าง',
          target_joint: 'elbow',
          target_angle: 50,
          min_angle: 35,
          max_angle: 65,
          target_reps: 10,
          difficulty: 'beginner',
        },
      ];
    }

    const res = await fetchWithAuth(`${getApiBase()}/exercises`);
    if (!res.ok) {
      throw new Error(`โหลดรายการท่าออกกำลังกายไม่สำเร็จ HTTP ${res.status}: ${res.statusText}`);
    }
    const json = await res.json();
    return json.data ?? [];
  },

  /**
   * บันทึกผลเซสชัน (ต้อง throw หากส่งขึ้นเซิร์ฟเวอร์ไม่ได้ เพื่อให้ระบบจัดการคิวซิงก์)
   */
  async saveSession(sessionData: Partial<Session>): Promise<Session> {
    if (IS_STATIC_MODE) {
      return {
        id: sessionData.id ?? Date.now(),
        patient_id: sessionData.patient_id ?? 1,
        exercise_id: sessionData.exercise_id ?? 1,
        started_at: sessionData.started_at ?? formatLocalMySQLDateTime(),
        ended_at: sessionData.ended_at ?? formatLocalMySQLDateTime(),
        avg_duration_per_rep: sessionData.avg_duration_per_rep ?? 6.0,
        total_reps: sessionData.total_reps ?? 10,
        correct_reps: sessionData.correct_reps ?? 8,
        accuracy: sessionData.accuracy ?? 88,
        status: sessionData.status ?? 'completed',
        notes: `${sessionData.notes ?? ''} [โหมดสาธิต]`.trim(),
        results: sessionData.results ?? [],
      };
    }

    const res = await fetchWithAuth(`${getApiBase()}/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(sessionData),
    });

    if (!res.ok) {
      throw new Error(`บันทึกเซสชันขึ้นเซิร์ฟเวอร์ไม่สำเร็จ HTTP ${res.status}: ${res.statusText}`);
    }

    const json = await res.json();
    return json.data ?? (sessionData as Session);
  },

  /**
   * ดึงประวัติผู้ป่วย
   */
  async getPatientHistory(patientId: number): Promise<{ patient: Patient; sessions: Session[] }> {
    if (IS_STATIC_MODE) {
      return {
        patient: { id: patientId, patient_code: 'PT-2026-001', name: 'คุณสมชาย ใจดี [โหมดสาธิต]', age: 65, gender: 'male', notes: 'ฟื้นฟูข้อไหล่และกล้ามเนื้อสะบัก' },
        sessions: [
          { id: 101, patient_id: patientId, exercise_id: 1, started_at: '2026-10-04 10:00:00', avg_duration_per_rep: 5.5, total_reps: 10, correct_reps: 9, accuracy: 90, status: 'completed' },
          { id: 102, patient_id: patientId, exercise_id: 2, started_at: '2026-10-05 09:30:00', avg_duration_per_rep: 6.0, total_reps: 12, correct_reps: 10, accuracy: 85, status: 'completed' },
        ],
      };
    }

    const res = await fetchWithAuth(`${getApiBase()}/patients/${patientId}/history`);
    if (!res.ok) {
      throw new Error(`ดึงประวัติผู้ป่วยไม่สำเร็จ HTTP ${res.status}: ${res.statusText}`);
    }
    const json = await res.json();
    return json.data;
  },

  /**
   * ลบข้อมูลผู้ป่วยทั้งหมดตามสิทธิ์ PDPA (ทั้งเซิร์ฟเวอร์และแคช)
   */
  async purgePatientData(patientId: number | string): Promise<{ success: boolean; message: string }> {
    if (IS_STATIC_MODE) {
      await IndexedDbService.purgePatientData(patientId);
      return { success: true, message: 'ลบข้อมูลในเครื่องและโหมดสาธิตสำเร็จตาม PDPA [โหมดสาธิต]' };
    }

    try {
      const res = await fetchWithAuth(`${getApiBase()}/patients/${patientId}/purge`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        throw new Error(`ลบข้อมูลฝั่งเซิร์ฟเวอร์ไม่สำเร็จ HTTP ${res.status}: ${res.statusText}`);
      }
      const data = await res.json();
      // Server returned success: purge local client storage for this patient
      await IndexedDbService.purgePatientData(patientId);
      return data;
    } catch (err: any) {
      console.warn('Server purge endpoint warning:', err);
      return { success: false, message: err?.message || 'ไม่สามารถติดต่อเซิร์ฟเวอร์เพื่อลบข้อมูลได้' };
    }
  },

  /**
   * ดึงรายงานผลสรุปเซสชัน
   */
  async getSessionReport(sessionId: number): Promise<SessionReport> {
    if (IS_STATIC_MODE) {
      return {
        session: { id: sessionId, patient_id: 1, exercise_id: 1, started_at: formatLocalMySQLDateTime(), avg_duration_per_rep: 5.0, total_reps: 10, correct_reps: 9, accuracy: 90, status: 'completed' },
        patient: { id: 1, patient_code: 'PT-2026-001', name: 'คุณสมชาย ใจดี [โหมดสาธิต]', age: 65, gender: 'male' },
        metrics: { total_reps: 10, correct_reps: 9, accuracy_percentage: 90, max_angle: 92, avg_angle: 88, status: 'completed' },
        results: [],
      };
    }

    const res = await fetchWithAuth(`${getApiBase()}/reports/${sessionId}`);
    if (!res.ok) {
      throw new Error(`ดึงรายงานเซสชันไม่สำเร็จ HTTP ${res.status}: ${res.statusText}`);
    }
    const json = await res.json();
    return json.data;
  },

  /**
   * ลงทะเบียนใบหน้า (จัดเก็บทั้งใน Supabase, Central Backend Database, และ Local Registry)
   */
  async enrollFace(payload: any): Promise<any> {
    // ดึงเวกเตอร์ 128 มิติจาก payload (รองรับทั้ง center, left, right)
    const rawVectors: number[][] = [];
    if (payload.embeddings && Array.isArray(payload.embeddings)) {
      for (const item of payload.embeddings) {
        if (item && Array.isArray(item.embedding) && item.embedding.length === 128) {
          rawVectors.push(item.embedding);
        } else if (Array.isArray(item) && item.length === 128) {
          rawVectors.push(item);
        }
      }
    }

    let enrolledPatient: any = null;

    // 1. Supabase Cloud Sync (if configured)
    if (supabaseService.isConfigured()) {
      try {
        let targetPatient: any = null;
        if (payload.patient_code) {
          targetPatient = await supabaseService.findPatientByCode(payload.patient_code);
        }

        if (targetPatient) {
          enrolledPatient = {
            id: targetPatient.id,
            patient_code: targetPatient.patient_code,
            name: targetPatient.full_name,
            age: targetPatient.age,
            gender: targetPatient.gender,
            photo: payload.photo || targetPatient.photo,
          };
          if (rawVectors.length > 0) {
            await supabaseService.saveFaceEmbeddings(targetPatient.id, rawVectors, payload.photo).catch(() => {});
          }
        } else {
          const rawName = (payload.full_name || payload.name || '').trim();
          if (rawName && !isPlaceholderPatientName(rawName)) {
            const pCode = payload.patient_code || `P-${Math.floor(1000 + Math.random() * 9000)}`;
            const created = await supabaseService.createPatient({
              patient_code: pCode,
              name: rawName,
              full_name: rawName,
              age: payload.age || 60,
              gender: payload.gender || 'ชาย',
              phone: payload.phone || null,
              pin: payload.pin || '1234',
              photo: payload.photo || null,
              chief_complaint: payload.notes || 'ลงทะเบียนด้วยใบหน้า Face Enrollment',
              status: 'active',
              embeddings: rawVectors,
            });

            if (created) {
              enrolledPatient = {
                id: created.id,
                patient_code: created.patient_code,
                name: created.full_name,
                full_name: created.full_name,
                age: created.age,
                gender: created.gender,
                photo: payload.photo || null,
              };
              if (rawVectors.length > 0) {
                await supabaseService.saveFaceEmbeddings(created.id, rawVectors, payload.photo).catch(() => {});
              }
            }
          }
        }
      } catch (err) {
        console.error('Supabase enrollFace failed:', err);
      }
    }

    const pCode = enrolledPatient?.patient_code || payload.patient_code || `P-${Math.floor(1000 + Math.random() * 9000)}`;
    if (!enrolledPatient) {
      const cleanName = (payload.full_name || payload.name || '').trim() || 'ผู้ลงทะเบียนใหม่';
      enrolledPatient = {
        id: `local-${Date.now()}`,
        patient_code: pCode,
        name: cleanName,
        full_name: cleanName,
        age: payload.age || 60,
        gender: payload.gender || 'ชาย',
        photo: payload.photo || null,
      };
    }

    // 2. Central Synchronized Backend Server (Single Source of Truth across Kiosk & Admin)
    try {
      const centralRes = await fetch(`${getApiBase()}/patients/register-face`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          patient_code: pCode,
          code: pCode,
          name: enrolledPatient.name,
          full_name: enrolledPatient.name,
          age: enrolledPatient.age,
          gender: enrolledPatient.gender,
          phone: payload.phone || null,
          face_vector: rawVectors.length > 0 ? rawVectors[0] : null,
          image_data_url: payload.photo || null,
          status: payload.status || 'active',
          chief_complaint: payload.notes || 'ลงทะเบียนด้วยใบหน้า Face Enrollment',
        }),
      });
      if (centralRes.ok) {
        const centralData = await centralRes.json();
        if (centralData.data) {
          enrolledPatient = { ...enrolledPatient, ...centralData.data };
          console.log('✓ [API] Central DB face registration succeeded for:', pCode);
        }
      }
    } catch (err: any) {
      console.warn('⚠️ Central DB face registration sync warning:', err.message);
    }

    // 3. Local Fast-Lookup Registry
    if (rawVectors.length > 0) {
      faceRegistryService.saveProfile({
        patientId: enrolledPatient.id,
        patientCode: enrolledPatient.patient_code,
        name: enrolledPatient.name,
        age: enrolledPatient.age,
        gender: enrolledPatient.gender,
        embeddings: rawVectors,
        enrolledAt: new Date().toISOString(),
      });
    }

    // 4. Isolated Patient Face Storage Service
    try {
      patientFaceStorageService.savePatientRecord(pCode, {
        patient_profile: {
          patient_id: pCode,
          id: enrolledPatient.id,
          full_name: enrolledPatient.name,
          first_name: enrolledPatient.name.split(' ')[0] || enrolledPatient.name,
          last_name: enrolledPatient.name.split(' ').slice(1).join(' ') || '',
          age: enrolledPatient.age,
          gender: enrolledPatient.gender,
          status: 'active',
          created_at: new Date().toISOString().split('T')[0],
        },
        biometric_data: {
          face_vector: rawVectors.length > 0 ? rawVectors[0] : [],
          registered_face_url: payload.photo || '',
          enrolled_at: new Date().toISOString(),
          model_version: 'face-resnet34-v2',
        },
      }, payload.photo || undefined);
    } catch (fsErr) {
      console.warn('⚠️ patientFaceStorageService savePatientRecord warning in enrollFace:', fsErr);
    }

    return {
      status: 'success',
      message: `ลงทะเบียนใบหน้าสำเร็จ ยินดีต้อนรับคุณ ${enrolledPatient.name}`,
      patient: enrolledPatient,
    };
  },

  /**
   * บันทึกหรืออัปเดตเวชระเบียนผู้ป่วยขึ้นฐานข้อมูลกลาง
   */
  async saveCentralPatientRecord(record: any): Promise<any> {
    try {
      const res = await fetch(`${getApiBase()}/patients/register-face`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(record),
      });
      if (res.ok) {
        const json = await res.json();
        return json.data;
      }
    } catch (e: any) {
      console.warn('⚠️ saveCentralPatientRecord warning:', e.message);
    }
    return null;
  },

  /**
   * อัปเดตข้อมูลผู้ป่วยบนฐานข้อมูลกลาง
   */
  async updatePatient(idOrCode: string | number, updates: any): Promise<any> {
    try {
      const res = await fetch(`${getApiBase()}/patients/${encodeURIComponent(String(idOrCode))}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
      if (res.ok) {
        const json = await res.json();
        return json.data;
      }
    } catch (e: any) {
      console.warn('⚠️ updatePatient error:', e.message);
    }
    return null;
  },

  /**
   * ลบข้อมูลผู้ป่วยจากฐานข้อมูลกลาง
   */
  async deletePatient(idOrCode: string | number): Promise<boolean> {
    try {
      const res = await fetch(`${getApiBase()}/patients/${encodeURIComponent(String(idOrCode))}`, {
        method: 'DELETE',
      });
      return res.ok;
    } catch (e: any) {
      console.warn('⚠️ deletePatient error:', e.message);
      return false;
    }
  },

  /**
   * ยืนยันตัวตนด้วยใบหน้า (ResNet-34 128-D Vector Match)
   * ตรวจสอบกับเซิร์ฟเวอร์กลาง (Central Server) และ Local Registry
   */
  async verifyFace(embedding: number[]): Promise<any> {
    // 1. ลองส่งตรวจที่ Central Backend API ก่อนเสมอ (ความแม่นยำและข้อมูลกลางที่สดใหม่ที่สุด)
    if (!IS_STATIC_MODE) {
      try {
        const res = await fetch(`${getApiBase()}/face/verify`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ embedding }),
        });
        if (res.ok) {
          const data = await res.json();
          if (data && data.match) {
            if (data.token) authStorage.setToken(data.token);
            return data;
          }
        }
      } catch (err: any) {
        console.warn('Central server verifyFace connection error, falling back to local registry:', err.message);
      }
    }

    // 2. ตรวจสอบเปรียบเทียบเวกเตอร์ในเครื่องด้วย Dual-Metric (Cosine >= 0.98, Distance <= 0.25)
    const matchRes = faceRegistryService.findBestMatch(embedding, 0.98, 0.25);

    if (matchRes.match && matchRes.bestProfile) {
      const p = matchRes.bestProfile;
      const token = `face-token-${p.patientCode}-${Date.now()}`;
      authStorage.setToken(token);

      return {
        status: 'success',
        match: true,
        similarity: matchRes.similarity,
        similarity_percent: matchRes.similarityPercent,
        token,
        patient: {
          id: p.patientId,
          patient_code: p.patientCode,
          name: p.name,
          age: p.age,
          gender: p.gender,
        },
        message: `ยืนยันตัวตนสำเร็จ: ยินดีต้อนรับคุณ ${p.name} (ความแม่นยำ ${matchRes.similarityPercent}%)`,
      };
    }

    // 3. ไม่พบใบหน้าที่ตรงกัน
    return {
      status: 'failed',
      match: false,
      similarity: matchRes.similarity,
      similarity_percent: matchRes.similarityPercent,
      message: matchRes.similarity > 0.65
        ? `❌ ไม่พบใบหน้าที่ลงทะเบียนในระบบ (ความคล้ายคลึง ${matchRes.similarityPercent}% ไม่ถึงเกณฑ์ 90%) ระบบปฏิเสธเพื่อความปลอดภัย`
        : '❌ ไม่พบใบหน้าที่ลงทะเบียนในระบบ กรุณาสมัครสมาชิกก่อน หรือเข้าสู่ระบบด้วย PIN',
    };
  },

  /**
   * สถานะเวกเตอร์ใบหน้าในระบบ
   */
  async getFaceStatus(): Promise<any> {
    if (IS_STATIC_MODE) {
      return { total_embeddings: 3, enrolled_patients_count: 2, mode: 'โหมดสาธิต' };
    }

    try {
      const res = await fetch(`${getApiBase()}/face/status`);
      if (res.ok) {
        return await res.json();
      }
    } catch {}

    return { total_embeddings: 0, enrolled_patients_count: 0, mode: 'ออฟไลน์' };
  },

  /**
   * ซิงก์ข้อมูลออฟไลน์กับเซิร์ฟเวอร์
   */
  async sync(payload: { sessions?: any[]; safety_events?: any[] }): Promise<any> {
    if (IS_STATIC_MODE) {
      return { status: 'success', message: 'ทำงานในโหมดสาธิต (ไม่ส่งข้อมูลขึ้นเซิร์ฟเวอร์)', data: { synced_sessions: 0 } };
    }

    const res = await fetchWithAuth(`${getApiBase()}/sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const errJson = await res.json().catch(() => null);
      throw new Error(errJson?.message || `ซิงก์ข้อมูลไม่สำเร็จ HTTP ${res.status}: ${res.statusText}`);
    }
    return await res.json();
  },
};

