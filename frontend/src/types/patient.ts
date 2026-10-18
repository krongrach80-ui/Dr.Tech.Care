export interface Patient {
  id: number | string;
  patient_code: string;
  code?: string;
  name: string;
  age: number;
  gender: 'male' | 'female' | 'other';
  status?: 'active' | 'suspended' | 'pending_info';
  photo?: string;
  avatar_url?: string;
  face_image_url?: string;
  face_vector?: number[] | string;
  notes?: string;
  phone?: string;
  chief_complaint?: string;
  medical_history?: string;
  treatment_outcome?: string;
  therapist_notes?: string;
  therapist_name?: string;
  responsible_therapist_id?: number | string;
  created_at?: string;
  updated_at?: string;
}
