import { create } from 'zustand';
import { Patient } from '../types/patient';
import { api } from '../services/api';
import { supabaseService } from '../services/supabaseService';
import { faceRegistryService } from '../services/faceRegistryService';
import { patientFaceStorageService } from '../services/patientFaceStorageService';

const STORAGE_KEY_ACTIVE_PATIENT = 'drtechcare_active_patient';
const STORAGE_KEY_DELETED_USERS = 'strongcare_deleted_users';

const getDeletedSet = (): Set<string> => {
  if (typeof window === 'undefined') return new Set();
  try {
    const raw = localStorage.getItem(STORAGE_KEY_DELETED_USERS);
    if (raw) {
      const arr = JSON.parse(raw);
      if (Array.isArray(arr)) {
        return new Set(arr.map((item) => String(item).trim().toUpperCase()));
      }
    }
  } catch {}
  return new Set();
};

const getStoredActivePatient = (): Patient | null => {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY_ACTIVE_PATIENT);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && (parsed.name || parsed.patient_code || parsed.id)) {
        const deletedSet = getDeletedSet();
        const idUpper = parsed.id ? String(parsed.id).trim().toUpperCase() : '';
        const codeUpper = parsed.patient_code ? String(parsed.patient_code).trim().toUpperCase() : '';
        if ((idUpper && deletedSet.has(idUpper)) || (codeUpper && deletedSet.has(codeUpper))) {
          localStorage.removeItem(STORAGE_KEY_ACTIVE_PATIENT);
          return null;
        }
        return parsed;
      }
    }
  } catch (e) {
    console.warn('Failed to load active patient from localStorage:', e);
  }
  return null;
};

interface PatientState {
  patients: Patient[];
  selectedPatient: Patient | null;
  isLoading: boolean;
  isFaceAuthOpen: boolean;
  faceAuthMode: 'login' | 'enroll';
  fetchPatients: () => Promise<void>;
  selectPatient: (patient: Patient) => void;
  addPatient: (patient: Partial<Patient>) => Promise<Patient>;
  deletePatient: (idOrCode: string | number) => void;
  openFaceAuth: (mode?: 'login' | 'enroll') => void;
  closeFaceAuth: () => void;
}

export const usePatientStore = create<PatientState>((set, get) => ({
  patients: [],
  selectedPatient: getStoredActivePatient(),
  isLoading: false,
  isFaceAuthOpen: false,
  faceAuthMode: 'login',

  fetchPatients: async () => {
    set({ isLoading: true });
    const deletedSet = getDeletedSet();

    // 1. ลองดึงจาก Supabase ก่อนถ้ามีการตั้งค่า
    if (supabaseService.isConfigured()) {
      try {
        const sbPatients = await supabaseService.fetchPatients();
        if (Array.isArray(sbPatients)) {
          // คัดกรองผู้ป่วยที่ถูกลบไปแล้วออก และตามลบใน Supabase ถ้ายังมีหลงเหลือ
          const validPatients: any[] = [];
          for (const p of sbPatients) {
            const pIdUpper = p.id ? String(p.id).trim().toUpperCase() : '';
            const pCodeUpper = p.patient_code ? String(p.patient_code).trim().toUpperCase() : '';
            const pHnUpper = p.hn ? String(p.hn).trim().toUpperCase() : '';

            if (
              (pIdUpper && deletedSet.has(pIdUpper)) ||
              (pCodeUpper && deletedSet.has(pCodeUpper)) ||
              (pHnUpper && deletedSet.has(pHnUpper))
            ) {
              console.log(`[PATIENT-STORE] Purging blacklisted patient from Supabase: ${p.patient_code || p.id}`);
              supabaseService.deletePatient(p.patient_code || p.id).catch(() => {});
              continue;
            }
            validPatients.push(p);
          }

          faceRegistryService.syncFromPatients(validPatients);
          const mapped: Patient[] = validPatients.map((p: any) => ({
            id: p.id,
            patient_code: p.patient_code,
            name: p.full_name,
            age: p.age,
            gender: p.gender,
            photo: p.photo || p.avatar_url,
            avatar_url: p.avatar_url || p.photo,
            notes: p.therapist_notes || p.chief_complaint,
            phone: p.phone,
            chief_complaint: p.chief_complaint,
            medical_history: p.medical_history,
            treatment_outcome: p.treatment_outcome,
            therapist_notes: p.therapist_notes,
            therapist_name: p.profiles?.full_name || 'กภ. ประจำเคส',
            responsible_therapist_id: p.responsible_therapist_id,
            created_at: p.created_at,
          }));

          const currentSelected = get().selectedPatient || getStoredActivePatient();
          let updatedSelected: Patient | null = null;
          if (currentSelected && mapped.length > 0) {
            const found = mapped.find(
              (p) =>
                (currentSelected.id && String(p.id).toLowerCase() === String(currentSelected.id).toLowerCase()) ||
                (currentSelected.patient_code && p.patient_code && p.patient_code.toLowerCase() === currentSelected.patient_code.toLowerCase()) ||
                (currentSelected.name && p.name && p.name.trim() === currentSelected.name.trim())
            );
            if (found) {
              updatedSelected = { ...currentSelected, ...found };
            }
          }

          if (typeof window !== 'undefined') {
            try {
              if (updatedSelected) {
                localStorage.setItem(STORAGE_KEY_ACTIVE_PATIENT, JSON.stringify(updatedSelected));
              } else {
                localStorage.removeItem(STORAGE_KEY_ACTIVE_PATIENT);
              }
            } catch {}
          }

          set({
            patients: mapped,
            selectedPatient: updatedSelected,
            isLoading: false,
          });
          return;
        }
      } catch (err) {
        console.warn('Supabase fetchPatients failed, falling back to API/offline:', err);
      }
    }

    // 2. Fallback ไปยัง API / Offline Store
    try {
      const data = await api.getPatients();
      const currentSelected = get().selectedPatient || getStoredActivePatient();
      let updatedSelected: Patient | null = currentSelected;
      if (currentSelected) {
        const found = data.find(
          (p) =>
            (currentSelected.id && String(p.id).toLowerCase() === String(currentSelected.id).toLowerCase()) ||
            (currentSelected.patient_code && p.patient_code && p.patient_code.toLowerCase() === currentSelected.patient_code.toLowerCase()) ||
            (currentSelected.name && p.name && p.name.trim() === currentSelected.name.trim())
        );
        if (found) {
          updatedSelected = { ...currentSelected, ...found };
        }
      }

      if (updatedSelected && typeof window !== 'undefined') {
        try {
          localStorage.setItem(STORAGE_KEY_ACTIVE_PATIENT, JSON.stringify(updatedSelected));
        } catch {}
      }

      set({
        patients: data,
        selectedPatient: updatedSelected,
        isLoading: false,
      });
    } catch (e) {
      console.warn('fetchPatients error, using fallback:', e);
      const fallbackPatient: Patient = {
        id: 12,
        patient_code: 'P-0012',
        name: 'นายสมชาย ใจดี',
        age: 68,
        gender: 'male',
        notes: 'ปวดและขยับข้อไหล่ติดขัด ยกแขนได้ไม่สุด 3 สัปดาห์',
      };
      const currentSelected = get().selectedPatient || getStoredActivePatient();
      set({
        patients: [fallbackPatient],
        selectedPatient: currentSelected || null,
        isLoading: false,
      });
    }
  },

  selectPatient: (patient) => {
    if (typeof window !== 'undefined') {
      try {
        if (patient) {
          localStorage.setItem(STORAGE_KEY_ACTIVE_PATIENT, JSON.stringify(patient));
        } else {
          localStorage.removeItem(STORAGE_KEY_ACTIVE_PATIENT);
        }
      } catch (e) {
        console.warn('Failed to persist active patient to localStorage:', e);
      }
    }
    set({ selectedPatient: patient });
  },

  openFaceAuth: (mode = 'login') => set({ isFaceAuthOpen: true, faceAuthMode: mode }),
  closeFaceAuth: () => set({ isFaceAuthOpen: false }),

  addPatient: async (patientData) => {
    set({ isLoading: true });
    try {
      let createdPatient: Patient;

      if (supabaseService.isConfigured()) {
        const sbCreated = await supabaseService.createPatient(patientData);
        if (sbCreated) {
          createdPatient = {
            id: sbCreated.id,
            patient_code: sbCreated.patient_code,
            name: sbCreated.full_name,
            age: sbCreated.age,
            gender: sbCreated.gender,
            notes: sbCreated.therapist_notes,
            phone: sbCreated.phone,
            chief_complaint: sbCreated.chief_complaint,
            medical_history: sbCreated.medical_history,
            treatment_outcome: sbCreated.treatment_outcome,
            therapist_notes: sbCreated.therapist_notes,
          };
        } else {
          createdPatient = await api.createPatient(patientData);
        }
      } else {
        createdPatient = await api.createPatient(patientData);
      }

      set((state) => ({
        patients: [createdPatient, ...state.patients],
        selectedPatient: createdPatient,
        isLoading: false,
      }));
      return createdPatient;
    } catch (e) {
      set({ isLoading: false });
      throw e;
    }
  },

  deletePatient: (idOrCode) => {
    const idStr = String(idOrCode).trim();
    if (!idStr) return;
    const upperStr = idStr.toUpperCase();

    // 1. บันทึกเข้า Deleted Blacklist เพื่อป้องกันข้อมูลฟื้นคืนชีพ
    if (typeof window !== 'undefined') {
      try {
        const raw = localStorage.getItem(STORAGE_KEY_DELETED_USERS);
        const list: string[] = raw ? JSON.parse(raw) : [];
        if (!list.includes(upperStr)) {
          list.push(upperStr);
          localStorage.setItem(STORAGE_KEY_DELETED_USERS, JSON.stringify(list));
        }
      } catch {}
    }

    // 2. เรียก Supabase delete ให้หมดจด
    try {
      supabaseService.deletePatient(idStr).catch((e) => console.warn('[PATIENT-STORE] Supabase deletePatient error:', e));
    } catch {}

    // 3. ลบข้อมูลโฟลเดอร์รูปและ Face biometrics
    try {
      patientFaceStorageService.deletePatientDirectoryAndData(idStr);
    } catch {}

    // 4. ลบออกจากหน่วยความจำ Zustand
    set((state) => {
      const filtered = state.patients.filter((p) => {
        const matchesId = String(p.id).trim().toUpperCase() === upperStr;
        const matchesCode = p.patient_code && p.patient_code.trim().toUpperCase() === upperStr;
        return !matchesId && !matchesCode;
      });
      const selectedMatches =
        state.selectedPatient &&
        (String(state.selectedPatient.id).trim().toUpperCase() === upperStr ||
          (state.selectedPatient.patient_code && state.selectedPatient.patient_code.trim().toUpperCase() === upperStr));
      if (selectedMatches && typeof window !== 'undefined') {
        try {
          localStorage.removeItem(STORAGE_KEY_ACTIVE_PATIENT);
        } catch {}
      }
      return {
        patients: filtered,
        selectedPatient: selectedMatches ? null : state.selectedPatient,
      };
    });
  },
}));
