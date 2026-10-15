/**
 * Dr.Tech.Care - Resilient Offline & Static Demo Mock API Adapter
 * 
 * Provides complete in-browser persistence and API simulation for:
 * - GitHub Pages static deployment (https://krongrach80-ui.github.io/Dr.Tech.Care/)
 * - Offline / Demo Mode (?demo=1)
 * - Automatic failover when backend server is unreachable (404/405/NetworkError)
 */

import {
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
import { ApiError } from './client';

const STORAGE_KEY = 'dr_tech_care_mock_db_v1';
const CURRENT_USER_KEY = 'dr_tech_care_current_user';

interface MockDatabase {
  users: User[];
  exercises: Exercise[];
  appointments: Appointment[];
  notes: MedicalNote[];
  coverages: TemporaryCoverage[];
  auditLogs: AuditLog[];
  bannedIps: BannedIp[];
  sessionLogs: SessionLog[];
}

const DEFAULT_USERS: User[] = [
  {
    id: 'A-001',
    username: 'admin',
    full_name: 'นพ. วรชัย อมรเวช (ผู้อำนวยการ รพ.)',
    password_hash: 'Hashed ●●●●',
    role: 'admin',
    status: 'active',
    phone: '02-555-0199',
    email: 'director@strongcare.hospital',
    must_change_password: 0,
    created_at: '2026-01-01T08:00:00Z',
  },
  {
    id: 'T-001',
    username: 'pt_somchai',
    full_name: 'กภ. สมชาย พิทักษ์ไทย',
    password_hash: 'Hashed ●●●●',
    role: 'pt',
    status: 'active',
    phone: '081-456-7890',
    email: 'pt_somchai@strongcare.hospital',
    license_number: 'กภ.12458',
    department: 'Musculoskeletal',
    bio: 'ผู้เชี่ยวชาญด้านเวชศาสตร์ฟื้นฟูกระดูกและข้อ จุฬาลงกรณ์มหาวิทยาลัย ประสบการณ์ 8 ปี',
    active_case_count: 14,
    must_change_password: 0,
    created_at: '2026-01-05T09:00:00Z',
  },
  {
    id: 'T-002',
    username: 'pt_kanok',
    full_name: 'กภ. กนกวรรณ รัตนศิลป์',
    password_hash: 'Hashed ●●●●',
    role: 'pt',
    status: 'active',
    phone: '089-765-4321',
    email: 'pt_kanok@strongcare.hospital',
    license_number: 'กภ.15890',
    department: 'Neurological',
    bio: 'ปริญญาโทกายภาพบำบัดระบบประสาท มหิดล เชี่ยวชาญการฟื้นฟูสโตรกและผู้สูงอายุ ประสบการณ์ 6 ปี',
    active_case_count: 12,
    must_change_password: 0,
    created_at: '2026-01-06T09:00:00Z',
  },
  {
    id: 'T-003',
    username: 'pt_thanakorn',
    full_name: 'กภ. ธนากร วงศ์สวัสดิ์',
    password_hash: 'Hashed ●●●●',
    role: 'pt',
    status: 'active',
    phone: '086-112-3344',
    email: 'pt_thanakorn@strongcare.hospital',
    license_number: 'กภ.18902',
    department: 'Geriatric',
    bio: 'กายภาพบำบัดผู้สูงอายุและการทรงตัว ป้องกันการหกล้ม ประสบการณ์ 5 ปี',
    active_case_count: 8,
    must_change_password: 0,
    created_at: '2026-01-07T09:00:00Z',
  },
  {
    id: 'P-1001',
    username: 'P-1001',
    full_name: 'นายสมศักดิ์ มีสุข',
    password_hash: 'Hashed ●●●●',
    role: 'patient',
    status: 'active',
    age: 68,
    gender: 'male',
    phone: '081-998-1122',
    email: 'somsak@example.com',
    assigned_pt_id: 'T-001',
    assigned_pt_name: 'กภ. สมชาย พิทักษ์ไทย',
    admission_date: '2026-02-01',
    treatment_status: 'active',
    initial_symptoms: 'ข้อไหล่ติดระยะฟื้นฟู (Frozen Shoulder) ยกแขนได้จำกัด ปวดเวลากลางคืน',
    underlying_diseases: 'ความดันโลหิตสูง',
    drug_allergies: 'ไม่มี',
    face_id_status: 'Registered',
    must_change_password: 0,
    created_at: '2026-02-01T10:00:00Z',
  },
  {
    id: 'P-1002',
    username: 'P-1002',
    full_name: 'นางมาลี รักสุข',
    password_hash: 'Hashed ●●●●',
    role: 'patient',
    status: 'active',
    age: 72,
    gender: 'female',
    phone: '084-332-9900',
    email: 'malee@example.com',
    assigned_pt_id: 'T-001',
    assigned_pt_name: 'กภ. สมชาย พิทักษ์ไทย',
    admission_date: '2026-02-05',
    treatment_status: 'active',
    initial_symptoms: 'ข้อเข่าเสื่อมระยะที่ 2 กล้ามเนื้อต้นขาอ่อนแรง ลุกยืนลำบาก',
    underlying_diseases: 'เบาหวานชนิดที่ 2, ไขมันในเลือดสูง',
    drug_allergies: 'Penicillin',
    face_id_status: 'Registered',
    must_change_password: 0,
    created_at: '2026-02-05T11:00:00Z',
  },
  {
    id: 'P-1003',
    username: 'P-1003',
    full_name: 'นายวิชัย แก้วมณี',
    password_hash: 'Hashed ●●●●',
    role: 'patient',
    status: 'active',
    age: 65,
    gender: 'male',
    phone: '089-445-5667',
    email: 'wichai@example.com',
    assigned_pt_id: 'T-002',
    assigned_pt_name: 'กภ. กนกวรรณ รัตนศิลป์',
    admission_date: '2026-02-10',
    treatment_status: 'active',
    initial_symptoms: 'ปวดหลังส่วนล่างเรื้อรัง (Chronic Low Back Pain) กล้ามเนื้อแกนกลางลำตัวล้า',
    underlying_diseases: 'ไม่มี',
    drug_allergies: 'ไม่มี',
    face_id_status: 'Registered',
    must_change_password: 0,
    created_at: '2026-02-10T14:00:00Z',
  },
  {
    id: 'P-1004',
    username: 'P-1004',
    full_name: 'นางสุดา ศรีอ่อน',
    password_hash: 'Hashed ●●●●',
    role: 'patient',
    status: 'active',
    age: 61,
    gender: 'female',
    phone: '082-771-8899',
    email: 'suda@example.com',
    assigned_pt_id: 'T-002',
    assigned_pt_name: 'กภ. กนกวรรณ รัตนศิลป์',
    admission_date: '2026-02-12',
    treatment_status: 'active',
    initial_symptoms: 'ฟื้นฟูหลังหลอดเลือดสมองตีบ (Post-Stroke Hemiparesis ซีกขวา)',
    underlying_diseases: 'ความดันโลหิตสูง, ไขมันในเลือด',
    drug_allergies: 'Sulfa',
    face_id_status: 'Registered',
    must_change_password: 0,
    created_at: '2026-02-12T15:30:00Z',
  },
];

const DEFAULT_EXERCISES: Exercise[] = [
  {
    id: 'EX-01',
    name_th: 'กางแขนยกด้านข้าง',
    name_en: 'Shoulder Abduction',
    category: 'Shoulder',
    type: 'single',
    default_reps: 10,
    default_sets: 3,
    default_rest_seconds: 30,
    instructions: 'ยืนหรือนั่งหลังตรง ยกแขนทั้งสองข้างกางออกด้านข้างลำตัวจนถึงระดับระนาบหัวไหล่ (90°)',
    benefits: 'เพิ่มช่วงการเคลื่อนไหวข้อไหล่ เสริมสร้างกล้ามเนื้อ Deltoid และ Supraspinatus',
    is_active: 1,
    created_by: 'A-001',
    created_by_name: 'แอดมินกลาง',
    created_at: '2026-01-01T00:00:00Z',
  },
  {
    id: 'EX-02',
    name_th: 'ยืดคอด้านข้าง',
    name_en: 'Neck Lateral Stretch',
    category: 'Neck',
    type: 'single',
    default_reps: 5,
    default_sets: 2,
    default_rest_seconds: 20,
    instructions: 'นั่งหลังตรง เอียงศีรษะให้หูเข้าหาหัวไหล่ช้าๆ ค้างไว้ 15-20 วินาที',
    benefits: 'คลายกล้ามเนื้อ Upper Trapezius และ Scalene ลดอาการตึงคอบ่า',
    is_active: 1,
    created_by: 'A-001',
    created_by_name: 'แอดมินกลาง',
    created_at: '2026-01-01T00:00:00Z',
  },
  {
    id: 'EX-03',
    name_th: 'งอและเหยียดข้อศอก',
    name_en: 'Biceps Curl & Extension',
    category: 'Arm',
    type: 'single',
    default_reps: 12,
    default_sets: 3,
    default_rest_seconds: 30,
    instructions: 'งอข้อศอกขึ้นเข้าหาหัวไหล่จนสุด แล้วค่อยๆ เหยียดลงช้าๆ',
    benefits: 'ฟื้นฟูกำลังกล้ามเนื้อ Biceps และ Brachialis',
    is_active: 1,
    created_by: 'A-001',
    created_by_name: 'แอดมินกลาง',
    created_at: '2026-01-01T00:00:00Z',
  },
  {
    id: 'EX-04',
    name_th: 'เตะขาเหยียดเข่าตรง',
    name_en: 'Seated Knee Extension',
    category: 'Leg',
    type: 'single',
    default_reps: 10,
    default_sets: 3,
    default_rest_seconds: 30,
    instructions: 'นั่งเก้าอี้หลังพิงพนัก เตะขาเหยียดตรงไปข้างหน้าจนเข่าตรง ค้างไว้ 3 วินาที',
    benefits: 'เสริมสร้างกล้ามเนื้อต้นขาด้านหน้า (Quadriceps) บรรเทาอาการข้อเข่าเสื่อม',
    is_active: 1,
    created_by: 'A-001',
    created_by_name: 'แอดมินกลาง',
    created_at: '2026-01-01T00:00:00Z',
  },
  {
    id: 'EX-05',
    name_th: 'หมุนลำตัวส่วนบน',
    name_en: 'Thoracic Trunk Rotation',
    category: 'Back',
    type: 'single',
    default_reps: 8,
    default_sets: 3,
    default_rest_seconds: 30,
    instructions: 'กอดอก นั่งหลังตรง หมุนลำตัวส่วนบนไปทางซ้ายและขวาช้าๆ',
    benefits: 'เพิ่มความยืดหยุ่นกระดูกสันหลังส่วนอกและกล้ามเนื้อลำตัว',
    is_active: 1,
    created_by: 'A-001',
    created_by_name: 'แอดมินกลาง',
    created_at: '2026-01-01T00:00:00Z',
  },
  {
    id: 'MG-01',
    name_th: 'มินิเกมตอบคำถาม ใช่/ไม่ ด้วยมือ',
    name_en: 'Cognitive Hand Gesture Quiz',
    category: 'Minigame',
    type: 'single',
    default_reps: 10,
    default_sets: 1,
    default_rest_seconds: 0,
    instructions: 'ยกมือขวาเพื่อตอบ "ใช่" หรือยกมือซ้ายเพื่อตอบ "ไม่" ค้างไว้ 0.8 วินาที',
    benefits: 'ฝึกการประสานงานของสมองและกล้ามเนื้อแขน (Hand-Eye-Brain Coordination)',
    is_active: 1,
    created_by: 'A-001',
    created_by_name: 'แอดมินกลาง',
    created_at: '2026-01-01T00:00:00Z',
  },
  {
    id: 'PS-01',
    name_th: 'ชุดกายภาพฟื้นฟูข้อไหล่และแขนพื้นฐาน',
    name_en: 'Shoulder & Upper Limb Routine',
    category: 'Shoulder',
    type: 'preset',
    default_reps: 10,
    default_sets: 3,
    default_rest_seconds: 30,
    instructions: 'โปรแกรมฝึกแบบองค์รวมสำหรับผู้ป่วยข้อไหล่ติด ประกอบด้วย 3 ท่าต่อเนื่อง',
    benefits: 'ครอบคลุมทั้งการยืดกล้ามเนื้อและเสริมสร้างกำลังข้อไหล่',
    is_active: 1,
    created_by: 'A-001',
    created_by_name: 'แอดมินกลาง',
    created_at: '2026-01-01T00:00:00Z',
    preset_items: [
      { preset_id: 'PS-01', exercise_id: 'EX-01', order_index: 0, reps: 10, sets: 3, rest_seconds: 30, exercise_name_th: 'กางแขนยกด้านข้าง' },
      { preset_id: 'PS-01', exercise_id: 'EX-02', order_index: 1, reps: 5, sets: 2, rest_seconds: 20, exercise_name_th: 'ยืดคอด้านข้าง' },
      { preset_id: 'PS-01', exercise_id: 'EX-03', order_index: 2, reps: 10, sets: 3, rest_seconds: 30, exercise_name_th: 'งอและเหยียดข้อศอก' },
    ],
  },
];

const DEFAULT_APPOINTMENTS: Appointment[] = [
  {
    id: 1,
    patient_id: 'P-1001',
    patient_name: 'นายสมศักดิ์ มีสุข',
    pt_id: 'T-001',
    pt_name: 'กภ. สมชาย พิทักษ์ไทย',
    appointment_date: new Date().toISOString().slice(0, 10),
    status: 'scheduled',
    notes: 'เน้นกางแขนยกด้านข้าง และยืดคอบ่าระวังไหล่ยกชดเชย',
    created_by: 'T-001',
    created_at: '2026-10-01T08:00:00Z',
    routine_items: [
      {
        id: 101,
        appointment_id: 1,
        exercise_id: 'EX-01',
        order_index: 0,
        reps: 10,
        sets: 3,
        rest_seconds: 30,
        custom_instructions: 'กางแขน 90 องศา ค้าง 3 วินาที ระวังไหล่ห่อ',
        status: 'pending',
        exercise_name_th: 'กางแขนยกด้านข้าง',
      },
      {
        id: 102,
        appointment_id: 1,
        exercise_id: 'EX-02',
        order_index: 1,
        reps: 5,
        sets: 2,
        rest_seconds: 20,
        custom_instructions: 'เอียงคอช้าๆ ไม่ต้องเกร็งบ่า',
        status: 'pending',
        exercise_name_th: 'ยืดคอด้านข้าง',
      },
    ],
  },
];

const DEFAULT_NOTES: MedicalNote[] = [
  {
    id: 1,
    patient_id: 'P-1001',
    author_id: 'T-001',
    author_role: 'pt',
    author_name: 'กภ. สมชาย พิทักษ์ไทย',
    header_stamp: '[12/10/2026 10:15 - Logged by PT: กภ. สมชาย พิทักษ์ไทย]',
    note_content: 'คนไข้ทำท่ากางแขนได้ดีขึ้น ROM แตะ 85 องศาโดยไม่มีอาการปวดแปลบ แนะนำให้ฝึกต่อเนื่องตามรูทีนวันเว้นวัน',
    created_at: '2026-10-12T10:15:00Z',
  },
];

const DEFAULT_AUDIT_LOGS: AuditLog[] = [
  {
    id: 1,
    user_id: 'A-001',
    user_name: 'นพ. วรชัย อมรเวช',
    user_role: 'admin',
    ip_address: '127.0.0.1',
    device_type: 'Desktop',
    action: 'SYSTEM_STARTUP',
    details: 'Dr.Tech.Care Central Service Initialized',
    security_status: 'Normal',
    created_at: new Date().toISOString(),
  },
  {
    id: 2,
    user_id: 'T-001',
    user_name: 'กภ. สมชาย พิทักษ์ไทย',
    user_role: 'pt',
    ip_address: '192.168.1.105',
    device_type: 'Desktop',
    action: 'PATIENT_RECORD_VIEW',
    details: 'Viewed medical record for P-1001',
    security_status: 'Normal',
    created_at: new Date(Date.now() - 3600000).toISOString(),
  },
];

function getDb(): MockDatabase {
  if (typeof window === 'undefined') {
    return {
      users: DEFAULT_USERS,
      exercises: DEFAULT_EXERCISES,
      appointments: DEFAULT_APPOINTMENTS,
      notes: DEFAULT_NOTES,
      coverages: [],
      auditLogs: DEFAULT_AUDIT_LOGS,
      bannedIps: [],
      sessionLogs: [],
    };
  }

  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      const initial: MockDatabase = {
        users: [...DEFAULT_USERS],
        exercises: [...DEFAULT_EXERCISES],
        appointments: [...DEFAULT_APPOINTMENTS],
        notes: [...DEFAULT_NOTES],
        coverages: [],
        auditLogs: [...DEFAULT_AUDIT_LOGS],
        bannedIps: [],
        sessionLogs: [],
      };
      saveDb(initial);
      return initial;
    }
    return JSON.parse(raw);
  } catch {
    return {
      users: DEFAULT_USERS,
      exercises: DEFAULT_EXERCISES,
      appointments: DEFAULT_APPOINTMENTS,
      notes: DEFAULT_NOTES,
      coverages: [],
      auditLogs: DEFAULT_AUDIT_LOGS,
      bannedIps: [],
      sessionLogs: [],
    };
  }
}

function saveDb(db: MockDatabase): void {
  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
    } catch (e) {
      console.warn('Mock DB storage quota error:', e);
    }
  }
}

export function getMockCurrentUser(): User | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(CURRENT_USER_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return null;
}

export function setMockCurrentUser(user: User | null): void {
  if (typeof window === 'undefined') return;
  if (user) {
    localStorage.setItem(CURRENT_USER_KEY, JSON.stringify(user));
  } else {
    localStorage.removeItem(CURRENT_USER_KEY);
  }
}

export function isStaticOrOffline(): boolean {
  if (typeof window === 'undefined') return true;
  const isGithubPages = window.location.hostname.endsWith('github.io');
  const isLocalFile = window.location.protocol === 'file:';
  const hasDemoParam = window.location.search.includes('demo=1');
  const hasStaticEnv = import.meta.env.VITE_STATIC_DEMO === 'true' && !import.meta.env.VITE_API_URL;
  return isGithubPages || isLocalFile || hasDemoParam || hasStaticEnv;
}

/**
 * Main Mock Request Dispatcher
 */
export async function handleMockRequest<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const method = (options.method || 'GET').toUpperCase();
  const urlParts = endpoint.split('?');
  const path = urlParts[0].replace(/^\/api/, '').replace(/^\//, '');
  const searchParams = new URLSearchParams(urlParts[1] || '');
  let body: any = {};
  if (options.body && typeof options.body === 'string') {
    try {
      body = JSON.parse(options.body);
    } catch {
      body = {};
    }
  }

  const db = getDb();

  // ---------------------------------------------------------------------------
  // AUTHENTICATION
  // ---------------------------------------------------------------------------
  if (path === 'auth/login' && method === 'POST') {
    const { username, password } = body;
    const cleanUser = (username || '').trim().toLowerCase();
    const cleanPass = (password || '').trim();

    // 1. Admin login check
    if (cleanUser === 'admin' || cleanUser === 'adm-01') {
      if (['admin1234', '1234', 'admin', 'admin@2026!'].includes(cleanPass)) {
        const user = db.users.find((u) => u.role === 'admin') || DEFAULT_USERS[0];
        setMockCurrentUser(user);
        return {
          status: 'success',
          token: 'mock-jwt-admin-' + Date.now(),
          user,
          must_change_password: false,
        } as unknown as T;
      }
    }

    // 2. PT Somchai
    if (cleanUser === 'pt_somchai' || cleanUser === 'somchai') {
      if (['pt123456', '1234', 'pt'].includes(cleanPass)) {
        const user = db.users.find((u) => u.username === 'pt_somchai') || DEFAULT_USERS[1];
        setMockCurrentUser(user);
        return {
          status: 'success',
          token: 'mock-jwt-pt1-' + Date.now(),
          user,
          must_change_password: false,
        } as unknown as T;
      }
    }

    // 3. PT Kanok
    if (cleanUser === 'pt_kanok' || cleanUser === 'kanok') {
      if (['pt123456', '1234', 'pt'].includes(cleanPass)) {
        const user = db.users.find((u) => u.username === 'pt_kanok') || DEFAULT_USERS[2];
        setMockCurrentUser(user);
        return {
          status: 'success',
          token: 'mock-jwt-pt2-' + Date.now(),
          user,
          must_change_password: false,
        } as unknown as T;
      }
    }

    // 4. PT Thanakorn
    if (cleanUser === 'pt_thanakorn' || cleanUser === 'thanakorn') {
      if (['pt123456', '1234', 'pt'].includes(cleanPass)) {
        const user = db.users.find((u) => u.username === 'pt_thanakorn') || DEFAULT_USERS[3];
        setMockCurrentUser(user);
        return {
          status: 'success',
          token: 'mock-jwt-pt3-' + Date.now(),
          user,
          must_change_password: false,
        } as unknown as T;
      }
    }

    // 5. Patient lookup
    const patientUser = db.users.find(
      (u) => u.role === 'patient' && (u.username.toLowerCase() === cleanUser || u.id.toLowerCase() === cleanUser)
    );
    if (patientUser) {
      if (cleanPass === '1234' || cleanPass === 'password') {
        setMockCurrentUser(patientUser);
        return {
          status: 'success',
          token: 'mock-jwt-patient-' + Date.now(),
          user: patientUser,
          must_change_password: false,
        } as unknown as T;
      }
    }

    throw new ApiError('ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง (ลองใช้ admin / admin1234 หรือ pt_somchai / pt123456)', 401);
  }

  if (path === 'auth/logout' && method === 'POST') {
    setMockCurrentUser(null);
    return { status: 'success', message: 'ออกจากระบบสำเร็จ' } as unknown as T;
  }

  if (path === 'auth/me' && method === 'GET') {
    const current = getMockCurrentUser();
    if (!current) {
      throw new ApiError('Unauthenticated', 401);
    }
    return { status: 'success', user: current } as unknown as T;
  }

  if (path === 'auth/change-password' && method === 'POST') {
    return { status: 'success', message: 'เปลี่ยนรหัสผ่านสำเร็จ' } as unknown as T;
  }

  if (path === 'auth/force-logout' && method === 'POST') {
    return { status: 'success', message: 'บังคับออกจากระบบเรียบร้อย', revoked_count: 1 } as unknown as T;
  }

  // ---------------------------------------------------------------------------
  // USERS
  // ---------------------------------------------------------------------------
  if (path === 'users' && method === 'GET') {
    const role = searchParams.get('role');
    const search = (searchParams.get('search') || '').toLowerCase();
    let list = db.users;
    if (role && role !== 'all') {
      list = list.filter((u) => u.role === role);
    }
    if (search) {
      list = list.filter(
        (u) =>
          u.full_name.toLowerCase().includes(search) ||
          u.username.toLowerCase().includes(search) ||
          u.id.toLowerCase().includes(search)
      );
    }
    return { status: 'success', users: list } as unknown as T;
  }

  if (path === 'users' && method === 'POST') {
    const input = body as CreateUserWizardInput;
    const newUser: User = {
      id: input.id || `U-${Date.now().toString().slice(-4)}`,
      username: input.username,
      full_name: input.full_name,
      password_hash: 'Hashed ●●●●',
      role: input.role,
      phone: input.phone || '-',
      email: input.email || '-',
      status: 'active',
      must_change_password: 0,
      created_at: new Date().toISOString(),
      ...(input.role === 'patient'
        ? {
            age: input.age,
            gender: input.gender,
            assigned_pt_id: input.assigned_pt_id,
            admission_date: input.admission_date || new Date().toISOString().slice(0, 10),
            treatment_status: 'active',
            initial_symptoms: input.initial_symptoms,
            underlying_diseases: input.underlying_diseases || '-',
            drug_allergies: input.drug_allergies || '-',
            face_id_status: 'Registered',
          }
        : {}),
      ...(input.role === 'pt'
        ? {
            license_number: input.license_number,
            department: input.department,
            bio: input.bio,
            active_case_count: 0,
          }
        : {}),
    };

    db.users.push(newUser);
    saveDb(db);
    return { status: 'success', user: newUser } as unknown as T;
  }

  if (path.startsWith('users/') && path.endsWith('/reset-password') && method === 'POST') {
    const tempPass = 'StrongCare@' + Math.floor(1000 + Math.random() * 9000);
    return { status: 'success', temporary_password: tempPass } as unknown as T;
  }

  if (path.startsWith('users/') && path.endsWith('/reset-biometrics') && method === 'POST') {
    const userId = path.split('/')[1];
    const u = db.users.find((user) => user.id === userId);
    if (u) {
      u.face_id_status = 'Pending';
      saveDb(db);
    }
    return { status: 'success', message: 'รีเซ็ตข้อมูลชีวมิติสำเร็จ' } as unknown as T;
  }

  if (path.startsWith('users/') && path.endsWith('/biometrics') && method === 'POST') {
    const userId = path.split('/')[1];
    const u = db.users.find((user) => user.id === userId);
    if (u) {
      u.face_id_status = 'Registered';
      saveDb(db);
    }
    return { status: 'success', message: 'บันทึกข้อมูลชีวมิติสำเร็จ' } as unknown as T;
  }

  if (path.startsWith('users/') && method === 'PUT') {
    const userId = path.split('/')[1];
    const idx = db.users.findIndex((u) => u.id === userId);
    if (idx !== -1) {
      db.users[idx] = { ...db.users[idx], ...body, updated_at: new Date().toISOString() };
      saveDb(db);
      return { status: 'success', user: db.users[idx] } as unknown as T;
    }
    throw new ApiError('ไม่พบผู้ใช้ในระบบ', 404);
  }

  if (path.startsWith('users/') && method === 'DELETE') {
    const userId = path.split('/')[1];
    db.users = db.users.filter((u) => u.id !== userId);
    saveDb(db);
    return { status: 'success', message: 'ลบผู้ใช้สำเร็จ' } as unknown as T;
  }

  // ---------------------------------------------------------------------------
  // PATIENTS
  // ---------------------------------------------------------------------------
  if (path === 'patients' && method === 'GET') {
    const search = (searchParams.get('search') || '').toLowerCase();
    let patients = db.users.filter((u) => u.role === 'patient');
    if (search) {
      patients = patients.filter(
        (p) =>
          p.full_name.toLowerCase().includes(search) ||
          p.id.toLowerCase().includes(search) ||
          p.phone.includes(search)
      );
    }
    return { status: 'success', patients } as unknown as T;
  }

  if (path.startsWith('patients/') && path.endsWith('/personal') && method === 'PUT') {
    const patientId = path.split('/')[1];
    const idx = db.users.findIndex((u) => u.id === patientId);
    if (idx !== -1) {
      db.users[idx] = { ...db.users[idx], ...body, updated_at: new Date().toISOString() };
      saveDb(db);
      return { status: 'success', patient: db.users[idx] } as unknown as T;
    }
    throw new ApiError('ไม่พบคนไข้ในระบบ', 404);
  }

  if (path.startsWith('patients/') && path.endsWith('/notes') && method === 'GET') {
    const patientId = path.split('/')[1];
    const notes = db.notes.filter((n) => n.patient_id === patientId);
    return { status: 'success', notes } as unknown as T;
  }

  if (path.startsWith('patients/') && path.endsWith('/notes') && method === 'POST') {
    const patientId = path.split('/')[1];
    const currentUser = getMockCurrentUser() || DEFAULT_USERS[1];
    const now = new Date();
    const dateFormatted = `${now.getDate().toString().padStart(2, '0')}/${(now.getMonth() + 1).toString().padStart(2, '0')}/${now.getFullYear()} ${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
    const newNote: MedicalNote = {
      id: Date.now(),
      patient_id: patientId,
      author_id: currentUser.id,
      author_role: currentUser.role as 'admin' | 'pt',
      author_name: currentUser.full_name,
      header_stamp: `[${dateFormatted} - Logged by ${currentUser.role === 'admin' ? 'Admin' : 'PT'}: ${currentUser.full_name}]`,
      note_content: body.note_content,
      referenced_note_id: body.referenced_note_id,
      created_at: now.toISOString(),
    };
    db.notes.unshift(newNote);
    saveDb(db);
    return { status: 'success', note: newNote } as unknown as T;
  }

  if (path.startsWith('patients/') && path.includes('/analytics') && method === 'GET') {
    return {
      status: 'success',
      logs: db.sessionLogs.slice(0, 10),
      accuracy_percent: 88,
      total_correct: 42,
      total_incorrect: 6,
      frequency_calendar: {
        [new Date().toISOString().slice(0, 10)]: 'completed',
      },
    } as unknown as T;
  }

  if (path.startsWith('patients/') && method === 'GET') {
    const patientId = path.split('/')[1];
    const patient = db.users.find((u) => u.id === patientId && u.role === 'patient');
    if (patient) {
      return { status: 'success', patient } as unknown as T;
    }
    throw new ApiError('ไม่พบคนไข้ในระบบ', 404);
  }

  if (path === 'patients/transfer-case' && method === 'POST') {
    const { patient_id, new_pt_id } = body;
    const p = db.users.find((u) => u.id === patient_id);
    const pt = db.users.find((u) => u.id === new_pt_id);
    if (p && pt) {
      p.assigned_pt_id = pt.id;
      p.assigned_pt_name = pt.full_name;
      saveDb(db);
    }
    return { status: 'success', message: 'โอนย้ายเคสคนไข้สำเร็จ' } as unknown as T;
  }

  // ---------------------------------------------------------------------------
  // APPOINTMENTS & ROUTINE
  // ---------------------------------------------------------------------------
  if (path === 'appointments' && method === 'GET') {
    const patientId = searchParams.get('patient_id');
    const ptId = searchParams.get('pt_id');
    let apps = db.appointments;
    if (patientId) apps = apps.filter((a) => a.patient_id === patientId);
    if (ptId) apps = apps.filter((a) => a.pt_id === ptId);
    return { status: 'success', appointments: apps } as unknown as T;
  }

  if (path === 'appointments/routine' && method === 'POST') {
    const { patient_id, appointment_date, items } = body;
    const p = db.users.find((u) => u.id === patient_id);
    const newApp: Appointment = {
      id: Date.now(),
      patient_id,
      patient_name: p?.full_name || 'คนไข้',
      pt_id: p?.assigned_pt_id || 'T-001',
      pt_name: p?.assigned_pt_name || 'กภ. สมชาย พิทักษ์ไทย',
      appointment_date,
      status: 'scheduled',
      created_by: 'T-001',
      created_at: new Date().toISOString(),
      routine_items: (items || []).map((it: any, idx: number) => ({
        id: Date.now() + idx,
        appointment_id: Date.now(),
        exercise_id: it.exercise_id,
        order_index: it.order_index ?? idx,
        reps: it.reps ?? 10,
        sets: it.sets ?? 3,
        rest_seconds: it.rest_seconds ?? 30,
        custom_instructions: it.custom_instructions,
        status: 'pending',
      })),
    };
    db.appointments.push(newApp);
    saveDb(db);
    return { status: 'success', appointment: newApp } as unknown as T;
  }

  if (path.startsWith('appointments/') && path.endsWith('/move') && method === 'POST') {
    const appId = parseInt(path.split('/')[1], 10);
    const app = db.appointments.find((a) => a.id === appId);
    if (app) {
      app.appointment_date = body.appointment_date;
      saveDb(db);
      return { status: 'success', appointment: app } as unknown as T;
    }
    throw new ApiError('ไม่พบนัดหมาย', 404);
  }

  // ---------------------------------------------------------------------------
  // THERAPISTS & COVERAGE
  // ---------------------------------------------------------------------------
  if (path === 'therapists' && method === 'GET') {
    const therapists = db.users.filter((u) => u.role === 'pt');
    return { status: 'success', therapists } as unknown as T;
  }

  if (path.startsWith('therapists/') && method === 'PUT') {
    const ptId = path.split('/')[1];
    const idx = db.users.findIndex((u) => u.id === ptId);
    if (idx !== -1) {
      db.users[idx] = { ...db.users[idx], ...body, updated_at: new Date().toISOString() };
      saveDb(db);
      return { status: 'success', therapist: db.users[idx] } as unknown as T;
    }
    throw new ApiError('ไม่พบนักกายภาพ', 404);
  }

  if (path === 'temporary-coverages' && method === 'GET') {
    return { status: 'success', coverages: db.coverages } as unknown as T;
  }

  if (path === 'temporary-coverages' && method === 'POST') {
    const newCov: TemporaryCoverage = {
      id: Date.now(),
      patient_id: body.patient_id,
      patient_name: db.users.find((u) => u.id === body.patient_id)?.full_name || 'คนไข้',
      owner_pt_id: body.owner_pt_id || 'T-001',
      owner_pt_name: db.users.find((u) => u.id === body.owner_pt_id)?.full_name || 'กภ. สมชาย พิทักษ์ไทย',
      cover_pt_id: body.cover_pt_id,
      cover_pt_name: db.users.find((u) => u.id === body.cover_pt_id)?.full_name || 'นักกายภาพรักษาการ',
      start_date: body.start_date,
      end_date: body.end_date,
      reason: body.reason,
      status: 'active',
      created_by: 'T-001',
      created_at: new Date().toISOString(),
    };
    db.coverages.push(newCov);
    saveDb(db);
    return { status: 'success', coverage: newCov } as unknown as T;
  }

  if (path.startsWith('temporary-coverages/') && path.endsWith('/revoke') && method === 'POST') {
    const covId = parseInt(path.split('/')[1], 10);
    const cov = db.coverages.find((c) => c.id === covId);
    if (cov) {
      cov.status = 'revoked';
      cov.revoked_at = new Date().toISOString();
      saveDb(db);
    }
    return { status: 'success', message: 'ยกเลิกการดูแลแทนสำเร็จ' } as unknown as T;
  }

  // ---------------------------------------------------------------------------
  // EXERCISES
  // ---------------------------------------------------------------------------
  if (path === 'exercises' && method === 'GET') {
    const category = searchParams.get('category');
    let exList = db.exercises;
    if (category && category !== 'all') {
      exList = exList.filter((e) => e.category.toLowerCase() === category.toLowerCase());
    }
    return { status: 'success', exercises: exList } as unknown as T;
  }

  if (path === 'exercises' && method === 'POST') {
    const newEx: Exercise = {
      id: body.id || `EX-${Date.now().toString().slice(-4)}`,
      name_th: body.name_th || 'ท่ากายภาพใหม่',
      name_en: body.name_en || 'New Exercise',
      category: body.category || 'Shoulder',
      type: body.type || 'single',
      default_reps: body.default_reps ?? 10,
      default_sets: body.default_sets ?? 3,
      default_rest_seconds: body.default_rest_seconds ?? 30,
      instructions: body.instructions,
      benefits: body.benefits,
      is_active: 1,
      created_by: 'A-001',
      created_by_name: 'ผู้อำนวยการ รพ.',
      created_at: new Date().toISOString(),
      preset_items: body.preset_items,
    };
    db.exercises.push(newEx);
    saveDb(db);
    return { status: 'success', exercise: newEx } as unknown as T;
  }

  if (path.startsWith('exercises/') && method === 'PUT') {
    const exId = path.split('/')[1];
    const idx = db.exercises.findIndex((e) => e.id === exId);
    if (idx !== -1) {
      db.exercises[idx] = { ...db.exercises[idx], ...body, updated_at: new Date().toISOString() };
      saveDb(db);
      return { status: 'success', exercise: db.exercises[idx] } as unknown as T;
    }
    throw new ApiError('ไม่พบท่ากายภาพ', 404);
  }

  if (path.startsWith('exercises/') && method === 'DELETE') {
    const exId = path.split('/')[1];
    db.exercises = db.exercises.filter((e) => e.id !== exId);
    saveDb(db);
    return { status: 'success', message: 'ลบท่ากายภาพสำเร็จ' } as unknown as T;
  }

  // ---------------------------------------------------------------------------
  // KIOSK
  // ---------------------------------------------------------------------------
  if (path === 'kiosk/face-login' && method === 'POST') {
    const patient = db.users.find((u) => u.role === 'patient') || DEFAULT_USERS[4];
    return {
      status: 'success',
      match: true,
      token: 'mock-kiosk-face-token-' + Date.now(),
      patient,
    } as unknown as T;
  }

  if (path === 'kiosk/routine' && method === 'GET') {
    const patientId = searchParams.get('patient_id') || 'P-1001';
    const app = db.appointments.find((a) => a.patient_id === patientId);
    return {
      status: 'success',
      has_routine: !!app,
      appointment: app,
      items: app?.routine_items || [],
      next_appointment_date: 'พรุ่งนี้ 10:00 น.',
    } as unknown as T;
  }

  if (path === 'kiosk/next-appointment' && method === 'GET') {
    return {
      status: 'success',
      next_appointment_date: new Date(Date.now() + 86400000 * 2).toISOString().slice(0, 10),
    } as unknown as T;
  }

  if (path === 'kiosk/reset' && method === 'POST') {
    return { status: 'success', message: 'รีเซ็ตสถานะตู้คีออสเรียบร้อย' } as unknown as T;
  }

  if (path === 'kiosk/session-logs' && method === 'POST') {
    const logId = Date.now();
    db.sessionLogs.unshift({
      id: logId,
      ...body,
      created_at: new Date().toISOString(),
    });
    saveDb(db);
    return { status: 'success', log_id: logId } as unknown as T;
  }

  // ---------------------------------------------------------------------------
  // AUDIT LOGS & SECURITY
  // ---------------------------------------------------------------------------
  if (path === 'audit' && method === 'GET') {
    return {
      status: 'success',
      logs: db.auditLogs,
      total: db.auditLogs.length,
    } as unknown as T;
  }

  if (path === 'audit/banned-ips' && method === 'GET') {
    return {
      status: 'success',
      banned_ips: db.bannedIps,
    } as unknown as T;
  }

  if (path === 'audit/ban-ip' && method === 'POST') {
    const newBan: BannedIp = {
      id: Date.now(),
      ip_address: body.ip_address,
      reason: body.reason || 'Manual Administrator Lockdown',
      banned_by: 'A-001',
      banned_by_name: 'ผู้อำนวยการ รพ.',
      banned_at: new Date().toISOString(),
      is_active: 1,
    };
    db.bannedIps.push(newBan);
    saveDb(db);
    return { status: 'success', message: 'แบน IP Address เรียบร้อย' } as unknown as T;
  }

  if (path === 'audit/unban-ip' && method === 'POST') {
    db.bannedIps = db.bannedIps.filter((b) => b.ip_address !== body.ip_address);
    saveDb(db);
    return { status: 'success', message: 'ปลดแบน IP Address เรียบร้อย' } as unknown as T;
  }

  // Fallback generic response
  return { status: 'success', message: 'Mock response OK' } as unknown as T;
}
