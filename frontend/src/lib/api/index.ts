import { apiClient, setAuthToken, getAuthToken, ApiError } from './client';
import type {
  User,
  CreateUserWizardInput,
  Exercise,
  Appointment,
  SessionLog,
  MedicalNote,
  TemporaryCoverage,
  AuditLog,
  BannedIp,
} from '../../types/schema';

export { ApiError, getAuthToken, setAuthToken };

export const api = {
  // ---------------------------------------------------------------------------
  // AUTHENTICATION
  // ---------------------------------------------------------------------------
  auth: {
    login: async (credentials: { username: string; password: string; device_type?: string }) => {
      const data = await apiClient<{
        status: string;
        token: string;
        user: User;
        must_change_password: boolean;
      }>('/auth/login', {
        method: 'POST',
        body: JSON.stringify(credentials),
      });
      setAuthToken(data.token);
      return data;
    },

    logout: async () => {
      try {
        await apiClient('/auth/logout', { method: 'POST' });
      } finally {
        setAuthToken(null);
      }
    },

    me: async () => {
      return apiClient<{ status: string; user: User }>('/auth/me');
    },

    changePassword: async (passwords: { old_password: string; new_password: string }) => {
      return apiClient<{ status: string; message: string }>('/auth/change-password', {
        method: 'POST',
        body: JSON.stringify(passwords),
      });
    },

    forceLogout: async (targetUserId: string) => {
      return apiClient<{ status: string; message: string; revoked_count: number }>('/auth/force-logout', {
        method: 'POST',
        body: JSON.stringify({ target_user_id: targetUserId }),
      });
    },
  },

  // ---------------------------------------------------------------------------
  // M1: USER MANAGEMENT
  // ---------------------------------------------------------------------------
  users: {
    list: async (params?: { role?: string; search?: string }) => {
      const query = new URLSearchParams();
      if (params?.role && params.role !== 'all') query.append('role', params.role);
      if (params?.search) query.append('search', params.search);
      const qs = query.toString();
      return apiClient<{ status: string; users: User[] }>(`/users${qs ? `?${qs}` : ''}`);
    },

    create: async (payload: CreateUserWizardInput) => {
      return apiClient<{ status: string; user: User }>('/users', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
    },

    update: async (userId: string, data: Partial<User>) => {
      return apiClient<{ status: string; user: User }>(`/users/${userId}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      });
    },

    resetPassword: async (userId: string, newPassword?: string) => {
      return apiClient<{ status: string; temporary_password: string }>(`/users/${userId}/reset-password`, {
        method: 'POST',
        body: JSON.stringify({ password: newPassword }),
      });
    },

    resetBiometrics: async (userId: string) => {
      return apiClient<{ status: string; message: string }>(`/users/${userId}/reset-biometrics`, {
        method: 'POST',
      });
    },

    saveBiometrics: async (userId: string, frames: string[], averageEmbedding: number[]) => {
      return apiClient<{ status: string; message: string }>(`/users/${userId}/biometrics`, {
        method: 'POST',
        body: JSON.stringify({ frames, embedding: averageEmbedding }),
      });
    },
  },

  // ---------------------------------------------------------------------------
  // M2: ALL PATIENT RECORDS
  // ---------------------------------------------------------------------------
  patients: {
    list: async (search?: string) => {
      const qs = search ? `?search=${encodeURIComponent(search)}` : '';
      return apiClient<{ status: string; patients: User[] }>(`/patients${qs}`);
    },

    getById: async (patientId: string) => {
      return apiClient<{ status: string; patient: User }>(`/patients/${patientId}`);
    },

    updatePersonal: async (patientId: string, data: {
      full_name?: string;
      age?: number;
      gender?: string;
      phone?: string;
      assigned_pt_id?: string | null;
      initial_symptoms?: string;
      underlying_diseases?: string;
      drug_allergies?: string;
    }) => {
      return apiClient<{ status: string; patient: User }>(`/patients/${patientId}/personal`, {
        method: 'PUT',
        body: JSON.stringify(data),
      });
    },

    getNotes: async (patientId: string) => {
      return apiClient<{ status: string; notes: MedicalNote[] }>(`/patients/${patientId}/notes`);
    },

    appendNote: async (patientId: string, content: string, referencedNoteId?: number) => {
      return apiClient<{ status: string; note: MedicalNote }>(`/patients/${patientId}/notes`, {
        method: 'POST',
        body: JSON.stringify({ note_content: content, referenced_note_id: referencedNoteId }),
      });
    },

    getAnalytics: async (patientId: string, range: '1week' | '1month' | 'all') => {
      return apiClient<{
        status: string;
        logs: SessionLog[];
        accuracy_percent: number;
        total_correct: number;
        total_incorrect: number;
        frequency_calendar: Record<string, 'completed' | 'missed' | 'none'>;
      }>(`/patients/${patientId}/analytics?range=${range}`);
    },
  },

  // ---------------------------------------------------------------------------
  // M3: THERAPY SCHEDULE & ROUTINE PLANNER
  // ---------------------------------------------------------------------------
  schedule: {
    getAppointments: async (params?: { month?: string; patient_id?: string; pt_id?: string }) => {
      const query = new URLSearchParams();
      if (params?.month) query.append('month', params.month);
      if (params?.patient_id) query.append('patient_id', params.patient_id);
      if (params?.pt_id) query.append('pt_id', params.pt_id);
      const qs = query.toString();
      return apiClient<{ status: string; appointments: Appointment[] }>(`/appointments${qs ? `?${qs}` : ''}`);
    },

    assignRoutine: async (data: {
      patient_id: string;
      appointment_date: string;
      items: Array<{
        exercise_id: string;
        order_index: number;
        reps: number;
        sets: number;
        rest_seconds: number;
        custom_instructions?: string;
      }>;
    }) => {
      return apiClient<{ status: string; appointment: Appointment }>('/appointments/routine', {
        method: 'POST',
        body: JSON.stringify(data),
      });
    },

    moveAppointmentDate: async (appointmentId: number, newDate: string) => {
      return apiClient<{ status: string; appointment: Appointment }>(`/appointments/${appointmentId}/move`, {
        method: 'POST',
        body: JSON.stringify({ appointment_date: newDate }),
      });
    },
  },

  // ---------------------------------------------------------------------------
  // M4: PT DIRECTORY & PT WORKSPACE
  // ---------------------------------------------------------------------------
  pt: {
    list: async () => {
      return apiClient<{ status: string; therapists: User[] }>('/therapists');
    },

    updateProfile: async (ptId: string, data: {
      phone?: string;
      email?: string;
      bio?: string;
      avatar?: string;
    }) => {
      return apiClient<{ status: string; therapist: User }>(`/therapists/${ptId}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      });
    },

    transferCase: async (patientId: string, newPtId: string) => {
      return apiClient<{ status: string; message: string }>('/patients/transfer-case', {
        method: 'POST',
        body: JSON.stringify({ patient_id: patientId, new_pt_id: newPtId }),
      });
    },

    createCoverage: async (data: {
      patient_id: string;
      cover_pt_id: string;
      start_date: string;
      end_date: string;
      reason?: string;
    }) => {
      return apiClient<{ status: string; coverage: TemporaryCoverage }>('/temporary-coverages', {
        method: 'POST',
        body: JSON.stringify(data),
      });
    },

    revokeCoverage: async (coverageId: number) => {
      return apiClient<{ status: string; message: string }>(`/temporary-coverages/${coverageId}/revoke`, {
        method: 'POST',
      });
    },

    listCoverages: async (ptId?: string) => {
      const qs = ptId ? `?pt_id=${encodeURIComponent(ptId)}` : '';
      return apiClient<{ status: string; coverages: TemporaryCoverage[] }>(`/temporary-coverages${qs}`);
    },
  },

  // ---------------------------------------------------------------------------
  // M5: EXERCISES & PRESET PACKAGES
  // ---------------------------------------------------------------------------
  exercises: {
    list: async (category?: string) => {
      const qs = category && category !== 'all' ? `?category=${encodeURIComponent(category)}` : '';
      return apiClient<{ status: string; exercises: Exercise[] }>(`/exercises${qs}`);
    },

    create: async (data: Partial<Exercise> & { items?: any[] }) => {
      return apiClient<{ status: string; exercise: Exercise }>('/exercises', {
        method: 'POST',
        body: JSON.stringify(data),
      });
    },

    update: async (id: string, data: Partial<Exercise>) => {
      return apiClient<{ status: string; exercise: Exercise }>(`/exercises/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      });
    },

    delete: async (id: string) => {
      return apiClient<{ status: string; message: string }>(`/exercises/${id}`, {
        method: 'DELETE',
      });
    },
  },

  // ---------------------------------------------------------------------------
  // PATIENT KIOSK
  // ---------------------------------------------------------------------------
  kiosk: {
    faceLogin: async (embedding: number[]) => {
      return apiClient<{
        status: string;
        match: boolean;
        token?: string;
        patient?: User;
        message?: string;
      }>('/kiosk/face-login', {
        method: 'POST',
        body: JSON.stringify({ embedding }),
      });
    },

    getTodayRoutine: async (patientId: string) => {
      return apiClient<{
        status: string;
        has_routine: boolean;
        appointment?: Appointment;
        items: any[];
        next_appointment_date?: string;
      }>(`/kiosk/routine?patient_id=${patientId}`);
    },

    logSession: async (logData: {
      appointment_id?: number | null;
      patient_id: string;
      exercise_id: string;
      routine_item_id?: number | null;
      started_at: string;
      ended_at: string;
      correct_reps: number;
      incorrect_reps: number;
      accuracy_percent: number;
      score: number;
      duration_seconds: number;
      status: 'completed' | 'partial';
    }) => {
      return apiClient<{ status: string; log_id: number }>('/kiosk/session-logs', {
        method: 'POST',
        body: JSON.stringify(logData),
      });
    },
  },

  // ---------------------------------------------------------------------------
  // M6: AUDIT & SECURITY CONTROL
  // ---------------------------------------------------------------------------
  audit: {
    list: async (params?: { limit?: number; offset?: number; action?: string; security?: string }) => {
      const query = new URLSearchParams();
      if (params?.limit) query.append('limit', String(params.limit));
      if (params?.offset) query.append('offset', String(params.offset));
      if (params?.action) query.append('action', params.action);
      if (params?.security) query.append('security', params.security);
      const qs = query.toString();
      return apiClient<{ status: string; logs: AuditLog[]; total: number }>(`/audit${qs ? `?${qs}` : ''}`);
    },

    getBannedIps: async () => {
      return apiClient<{ status: string; banned_ips: BannedIp[] }>('/audit/banned-ips');
    },

    banIp: async (ip: string, reason: string) => {
      return apiClient<{ status: string; message: string }>('/audit/ban-ip', {
        method: 'POST',
        body: JSON.stringify({ ip_address: ip, reason }),
      });
    },

    unbanIp: async (ip: string) => {
      return apiClient<{ status: string; message: string }>('/audit/unban-ip', {
        method: 'POST',
        body: JSON.stringify({ ip_address: ip }),
      });
    },
  },
};
