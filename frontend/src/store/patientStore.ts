import { create } from 'zustand';
import { Patient } from '../types/patient';
import { api } from '../services/api';
import { supabaseService } from '../services/supabaseService';
import { faceRegistryService } from '../services/faceRegistryService';

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
  selectedPatient: null,
  isLoading: false,
  isFaceAuthOpen: false,
  faceAuthMode: 'login',

  fetchPatients: async () => {
    set({ isLoading: true });

    // 1. ลองดึงจาก Supabase ก่อนถ้ามีการตั้งค่า
    if (supabaseService.isConfigured()) {
      try {
        const sbPatients = await supabaseService.fetchPatients();
        if (sbPatients && sbPatients.length > 0) {
          faceRegistryService.syncFromPatients(sbPatients);
          const mapped: Patient[] = sbPatients.map((p: any) => ({
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

          const currentSelected = get().selectedPatient;
          const updatedSelected = currentSelected
            ? mapped.find((p) => p.id === currentSelected.id) || currentSelected
            : null;

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
      const currentSelected = get().selectedPatient;
      const updatedSelected = currentSelected
        ? data.find((p) => p.id === currentSelected.id) || currentSelected
        : null;
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
      const currentSelected = get().selectedPatient;
      set({
        patients: [fallbackPatient],
        selectedPatient: currentSelected || null,
        isLoading: false,
      });
    }
  },

  selectPatient: (patient) => set({ selectedPatient: patient }),

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
    const idStr = String(idOrCode).trim().toUpperCase();
    set((state) => {
      const filtered = state.patients.filter((p) => {
        const matchesId = String(p.id).trim().toUpperCase() === idStr;
        const matchesCode = p.patient_code && p.patient_code.trim().toUpperCase() === idStr;
        return !matchesId && !matchesCode;
      });
      const selectedMatches =
        state.selectedPatient &&
        (String(state.selectedPatient.id).trim().toUpperCase() === idStr ||
          (state.selectedPatient.patient_code && state.selectedPatient.patient_code.trim().toUpperCase() === idStr));
      return {
        patients: filtered,
        selectedPatient: selectedMatches ? null : state.selectedPatient,
      };
    });
  },
}));
