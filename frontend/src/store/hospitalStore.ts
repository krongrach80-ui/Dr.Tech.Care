import { create } from 'zustand';
import {
  UserAccount,
  UserRole,
  UserStatus,
  PhysicalTherapist,
  HospitalExercise,
  ExerciseModpack,
  TreatmentPlan,
  ActivityLog,
  PatientSymptomReport,
  AiSystemSettings,
  TemporaryCaseDelegation,
} from '../types/hospital';
import { faceService } from '../services/faceService';
import { supabaseService } from '../services/supabaseService';
import { supabase, PATIENTS_REALTIME_CHANNEL } from '../lib/supabase';
import { faceRegistryService } from '../services/faceRegistryService';
import { patientSyncService } from '../services/patientSyncService';
import { patientFaceStorageService, isPlaceholderPatientName } from '../services/patientFaceStorageService';
import { api } from '../services/api';
import { usePatientStore } from './patientStore';
import initialExercisesData from '../data/exercises.json';
import initialModpacksData from '../data/modpacks.json';
import initialPatientsData from '../data/patients.json';
import {
  verifyStaffPassword,
  hashPassword,
  STANDARD_PASSWORD_HASHES,
  generateSecureTemporaryPassword,
  validatePasswordStrength,
} from '../services/authSecurityService';
import {
  canDeleteAppointment,
  dateKey,
  isSamePatient,
  formatThaiDate,
} from '../utils/scheduleRules';

const DEFAULT_PASSWORD_HASH = STANDARD_PASSWORD_HASHES['1234'];

const INITIAL_THERAPISTS: PhysicalTherapist[] = [
  {
    id: 1,
    code: 'T-003',
    name: 'กภ. ธนากร วงศ์สวัสดิ์',
    specialty: 'กายภาพบำบัดระบบกล้ามเนื้อและกระดูก (Orthopedic PT)',
    phone: '081-456-7890',
    email: 'thanakorn.w@strongcare.hospital',
    activePatientsCount: 14,
    assignedCases: [
      'นายสมชาย ใจดี (P-0012)',
      'นางมาลี รักสุข (P-0013)',
      'นายวิชัย แก้วมณี (P-0021)',
      'นายสุรศักดิ์ พิพัฒน์ (P-0028)',
    ],
    bio: 'วุฒิบัตรกายภาพบำบัดระบบกล้ามเนื้อและกระดูก จุฬาลงกรณ์มหาวิทยาลัย ประสบการณ์คลินิก 8 ปี เชี่ยวชาญการรักษาข้อไหล่ติดและกระดูกสันหลัง',
    status: 'active',
    licenseNumber: 'กภ.12458',
  },
  {
    id: 2,
    code: 'T-007',
    name: 'กภ. พิมพ์ชนก สุขเกษม',
    specialty: 'กายภาพบำบัดระบบประสาทและผู้สูงอายุ (Neurological & Geriatric PT)',
    phone: '089-765-4321',
    email: 'pimchanok.s@strongcare.hospital',
    activePatientsCount: 18,
    assignedCases: [
      'นางสุดา ศรีอ่อน (P-0008)',
      'นายประเสริฐ มั่นคง (P-0034)',
      'นางกัญญา บุญมา (P-0035)',
    ],
    bio: 'ปริญญาโทกายภาพบำบัดระบบประสาท มหาวิทยาลัยมหิดล เชี่ยวชาญการฟื้นฟูผู้ป่วยหลอดเลือดสมองและผู้สูงอายุหลังผ่าตัด ประสบการณ์ 6 ปี',
    status: 'active',
    licenseNumber: 'กภ.15890',
  },
  {
    id: 3,
    code: 'T-012',
    name: 'กภ. วรัญญู รัตนเวช',
    specialty: 'ฟื้นฟูสมรรถภาพหัวใจและปอด (Cardiopulmonary PT)',
    phone: '086-112-3344',
    email: 'waranyoo.r@strongcare.hospital',
    activePatientsCount: 9,
    assignedCases: [
      'นายสมบูรณ์ ชัยเวช (P-0040)',
      'นางอรพินท์ ภักดี (P-0042)',
    ],
    bio: 'กายภาพบำบัดฟื้นฟูสมรรถภาพหัวใจและปอด มหาวิทยาลัยเชียงใหม่ ประสบการณ์ 5 ปี ดูแลผู้ป่วยฟื้นฟูสมรรถภาพการหายใจ',
    status: 'active',
    licenseNumber: 'กภ.18902',
  },
  {
    id: 4,
    code: 'T-6512',
    name: 'pjj',
    specialty: 'หมอpj',
    phone: '0632531669',
    email: 'pjj@drtechcare.hospital',
    activePatientsCount: 0,
    assignedCases: [],
    bio: 'กายภาพบำบัดฟื้นฟูเฉพาะทาง',
    status: 'active',
    licenseNumber: 'ภก. 5110',
  },
];

const INITIAL_DELEGATIONS: TemporaryCaseDelegation[] = [
  {
    id: 'del-1',
    patientId: 34,
    patientName: 'นายประเสริฐ มั่นคง',
    patientCode: 'P-0034',
    originalTherapistId: 2, // pt_pimchanok (T-007)
    originalTherapistName: 'กภ. พิมพ์ชนก สุขเกษม',
    coveringTherapistId: 1, // pt_thanakorn (T-003)
    coveringTherapistName: 'กภ. ธนากร วงศ์สวัสดิ์',
    startDate: '2026-10-10',
    endDate: '2026-10-25',
    reason: 'ไปสัมมนาวิชาการกายภาพบำบัดระบบประสาทต่างจังหวัด',
    status: 'active',
    createdAt: '2026-10-09',
  },
];

const getStoredDelegations = (): TemporaryCaseDelegation[] => {
  try {
    const raw = localStorage.getItem('strongcare_temporary_delegations');
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch {}
  return INITIAL_DELEGATIONS;
};

const persistDelegations = (delegations: TemporaryCaseDelegation[]) => {
  try {
    localStorage.setItem('strongcare_temporary_delegations', JSON.stringify(delegations));
  } catch {}
};

const INITIAL_USERS: UserAccount[] = [
  {
    id: 1,
    username: 'admin',
    name: 'นพ. วรชัย อมรเวช (ผู้อำนวยการ รพ.)',
    role: 'admin',
    status: 'active',
    code: 'ADM-01',
    password: DEFAULT_PASSWORD_HASH,
    must_change_password: false,
    phone: '02-555-0199',
    email: 'director@strongcare.hospital',
    created_at: '2026-01-10',
    last_active: 'วันนี้ 14:30',
  },
  {
    id: 2,
    username: 'pt_thanakorn',
    name: 'กภ. ธนากร วงศ์สวัสดิ์',
    role: 'therapist',
    status: 'active',
    code: 'T-003',
    password: DEFAULT_PASSWORD_HASH,
    must_change_password: false,
    phone: '081-456-7890',
    email: 'thanakorn.w@strongcare.hospital',
    created_at: '2026-01-15',
    last_active: 'วันนี้ 15:45',
  },
  {
    id: 3,
    username: 'pt_pimchanok',
    name: 'กภ. พิมพ์ชนก สุขเกษม',
    role: 'therapist',
    status: 'active',
    code: 'T-007',
    password: DEFAULT_PASSWORD_HASH,
    must_change_password: false,
    phone: '089-765-4321',
    email: 'pimchanok.s@strongcare.hospital',
    created_at: '2026-01-20',
    last_active: 'วันนี้ 16:10',
  },
  {
    id: 4,
    username: 'pjj',
    name: 'pjj',
    role: 'therapist',
    status: 'active',
    code: 'T-6512',
    password: DEFAULT_PASSWORD_HASH,
    must_change_password: false,
    phone: '0632531669',
    email: 'pjj@drtechcare.hospital',
    created_at: '2026-02-15',
    last_active: 'พร้อมให้บริการ',
  },
  {
    id: 5,
    username: 'pt_waranyoo',
    name: 'กภ. วรัญญู รัตนเวช',
    role: 'therapist',
    status: 'active',
    code: 'T-012',
    password: DEFAULT_PASSWORD_HASH,
    must_change_password: false,
    phone: '086-112-3344',
    email: 'waranyoo.r@strongcare.hospital',
    created_at: '2026-02-01',
    last_active: 'พร้อมให้บริการ',
  },
  {
    id: 12,
    username: 'somchai',
    name: 'นายสมชาย ใจดี',
    role: 'patient',
    status: 'active',
    code: 'P-0012',
    password: DEFAULT_PASSWORD_HASH,
    assignedTherapistName: 'กภ. ธนากร วงศ์สวัสดิ์',
    assignedTherapistId: 1,
    phone: '081-998-1122',
    email: 'somchai.j@gmail.com',
    age: 68,
    gender: 'male',
    diagnosis: 'ข้อไหล่ติดระยะฟื้นฟู (Frozen Shoulder - Subacute Phase)',
    chiefComplaint: 'ปวดไหล่ขวาเรื้อรัง ยกแขนไม่สุด ปวดแปลบตอนเอื้อมหยิบของสูงมา 1 เดือน ขยับสะบักติดขัด',
    patientBackground: 'ความดันโลหิตสูงเล็กน้อย (ควบคุมได้ดีด้วยยา), ไม่มีประวัติผ่าตัดใหญ่, เดินออกกำลังกายเช้าสม่ำเสมอ',
    treatmentOutcome: 'ROM กางแขนข้างลำตัวเพิ่มจาก 65° เป็น 88°, ความปวดลดลงจาก 6/10 เหลือ 2/10, ทำกายภาพสม่ำเสมอ 94%',
    therapistNotes: 'คนไข้ให้ความร่วมมือดีมาก กล้ามเนื้อไหล่คลายตัวขึ้น แนะนำให้รักษาระดับการยืดแขนอย่างนุ่มนวล หลีกเลี่ยงการยกของหนักเกิน 3 กก.',
    face_image_url: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=400&auto=format&fit=crop&q=80',
    created_at: '2026-02-01',
    last_active: 'วันนี้ 10:15',
  },
  {
    id: 13,
    username: 'malee',
    name: 'นางมาลี รักสุข',
    role: 'patient',
    status: 'active',
    code: 'P-0013',
    password: DEFAULT_PASSWORD_HASH,
    assignedTherapistName: 'กภ. ธนากร วงศ์สวัสดิ์',
    assignedTherapistId: 1,
    phone: '084-332-9900',
    email: 'malee.r@gmail.com',
    age: 72,
    gender: 'female',
    diagnosis: 'ข้อเข่าเสื่อมระยะที่ 2 และกล้ามเนื้อต้นขาอ่อนแรง (Knee OA Grade 2)',
    chiefComplaint: 'ปวดตึงข้อเข่าทั้งสองข้างเวลายืนนานและเดินขึ้นบันได มีเสียงกรอบแกรบในข้อเข่า',
    patientBackground: 'มีภาวะกระดูกบางระยะเริ่มต้น ทานแคลเซียมเสริมประจำ ไม่มีโรคหัวใจ',
    treatmentOutcome: 'สามารถลุกยืนจากเก้าอี้ได้มั่นคงขึ้น อาการเสียวข้อเข่าลดลง กำลังกล้ามเนื้อ Quadriceps เพิ่มขึ้น 1 ระดับ',
    therapistNotes: 'ฝึกย่อเข่าแบบมีเก้าอี้พยุงอย่างระมัดระวัง เข่าต้องไม่เลยปลายเท้า เน้นเพิ่มความแข็งแรงกล้ามเนื้อรอบข้อเข่า',
    face_image_url: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=400&auto=format&fit=crop&q=80',
    created_at: '2026-02-05',
    last_active: 'เมื่อวานนี้',
  },
  {
    id: 21,
    username: 'wichai',
    name: 'นายวิชัย แก้วมณี',
    role: 'patient',
    status: 'active',
    code: 'P-0021',
    password: DEFAULT_PASSWORD_HASH,
    assignedTherapistName: 'กภ. ธนากร วงศ์สวัสดิ์',
    assignedTherapistId: 1,
    phone: '089-445-5667',
    age: 65,
    gender: 'male',
    diagnosis: 'ปวดหลังส่วนล่างเรื้อรัง (Chronic Low Back Pain)',
    chiefComplaint: 'ปวดเมื่อยเอวและสะโพกเวลานั่งทำงานหรือขับรถนาน นั่งเกิน 30 นาทีแล้วลุกยาก',
    patientBackground: 'ทำงานออฟฟิศเดิม ไม่มีประวัติหมอนรองกระดูกทับเส้นประสาท',
    treatmentOutcome: 'ความยืดหยุ่นกล้ามเนื้อลำตัวและสะโพกดีขึ้น 15%, ลดการปวดตึงช่วงเช้า',
    therapistNotes: 'เน้นท่ายืดสะโพกบนเก้าอี้และบิดลำตัวคลายหลัง หลีกเลี่ยงการก้มยกของหนักโดยงอหลัง',
    created_at: '2026-02-12',
    last_active: '3 วันที่แล้ว',
  },
  {
    id: 8,
    username: 'suda',
    name: 'นางสุดา ศรีอ่อน',
    role: 'patient',
    status: 'suspended',
    code: 'P-0008',
    password: DEFAULT_PASSWORD_HASH,
    assignedTherapistName: 'กภ. พิมพ์ชนก สุขเกษม',
    assignedTherapistId: 2,
    phone: '087-654-3210',
    age: 75,
    gender: 'female',
    diagnosis: 'ฟื้นฟูหลังผ่าตัดเปลี่ยนข้อสะโพกเทียม (Post THA)',
    chiefComplaint: 'กังวลเรื่องการก้าวเดินและทรงตัวหลังผ่าตัดข้อสะโพก กล้ามเนื้อสะโพกข้างซ้ายยังเกร็งตึง',
    patientBackground: 'ผ่าตัดเปลี่ยนข้อสะโพกข้างซ้ายมา 2 เดือน แผลผ่าตัดติดเรียบร้อย',
    treatmentOutcome: 'ทรงตัวบนขาข้างซ้ายได้มั่นคงขึ้น เดินโดยใช้ไม้เท้าช่วยพยุงได้ระยะทาง 50 เมตรต่อเนื่อง',
    therapistNotes: 'ห้ามงอข้อสะโพกเกิน 90 องศาเด็ดขาด ฝึกเดินทรงตัวพร้อมผู้ดูแลประกบใกล้ชิด',
    created_at: '2026-01-18',
    last_active: '1 สัปดาห์ที่แล้ว',
  },
  {
    id: 34,
    username: 'prasert',
    name: 'นายประเสริฐ มั่นคง',
    role: 'patient',
    status: 'active',
    code: 'P-0034',
    password: DEFAULT_PASSWORD_HASH,
    assignedTherapistName: 'กภ. พิมพ์ชนก สุขเกษม',
    assignedTherapistId: 2,
    phone: '082-111-2233',
    age: 70,
    gender: 'male',
    diagnosis: 'โรคหลอดเลือดสมองระยะฟื้นตัว กล้ามเนื้อซีกขวาอ่อนแรง (Post Stroke Hemiparesis)',
    chiefComplaint: 'แขนและขาข้างขวายกได้ช้า กล้ามเนื้อเกร็งเล็กน้อยตอนเช้า ต้องการฝึกเดินและหยิบจับสิ่งของ',
    patientBackground: 'หลอดเลือดสมองตีบมา 6 เดือน ได้รับยาละลายลิ่มเลือดสม่ำเสมอ ความดันปกติ',
    treatmentOutcome: 'สามารถยกเข่าขวาสลับซ้ายได้มั่นคงขึ้น การสวิงแขนขวาขณะเดินเป็นธรรมชาติขึ้น',
    therapistNotes: 'เน้นท่ากางแขนและยกเข่าสลับข้างแบบมีราวจับ ฝึกต่อเนื่องวันละ 15 นาที',
    created_at: '2026-02-20',
    last_active: 'วันนี้ 09:30',
  },
  {
    id: 35,
    username: 'kanya',
    name: 'นางกัญญา บุญมา',
    role: 'patient',
    status: 'active',
    code: 'P-0035',
    password: DEFAULT_PASSWORD_HASH,
    assignedTherapistName: 'กภ. พิมพ์ชนก สุขเกษม',
    assignedTherapistId: 2,
    phone: '085-889-9001',
    age: 63,
    gender: 'female',
    diagnosis: 'กลุ่มอาการปวดกล้ามเนื้อคอบ่าเรื้อรัง (Myofascial Pain Syndrome)',
    chiefComplaint: 'ปวดตึงกล้ามเนื้อต้นคอร้าวขึ้นศีรษะ กล้ามเนื้อ Trapezius เกร็งแข็ง',
    patientBackground: 'มีภาวะนอนหลับไม่สนิทจากการเกร็งกล้ามเนื้อคอ',
    treatmentOutcome: 'อาการปวดศีรษะลดลง สามารถเอียงคอซ้าย-ขวาได้มุมกว้างขึ้น 20°',
    therapistNotes: 'ฝึกท่ายืดคอด้านข้างและยืดอกเปิดไหล่ ประคบอุ่นบริเวณบ่าก่อนยืดกล้ามเนื้อ',
    created_at: '2026-02-22',
    last_active: 'วันนี้ 11:20',
  },
];

const INITIAL_EXERCISES: HospitalExercise[] = [
  {
    id: 1,
    name: 'กางแขนยกด้านข้าง',
    englishName: 'Shoulder Abduction / Raise',
    category: 'ฟื้นฟูข้อไหล่และแขน',
    targetJoint: 'ข้อไหล่ (Shoulder)',
    targetAngle: 90,
    holdSeconds: 3,
    repsPerSet: 10,
    sets: 3,
    difficulty: 'medium',
    description: 'ยืนหรือนั่งหลังตรง ยกแขนทั้งสองข้างกางออกด้านข้างลำตัวจนถึงระดับระนาบหัวไหล่',
    cautions: 'ระวังอย่ายกไหล่เกร็งชิดใบหู (Shoulder Hike) และลำตัวต้องไม่เอียงชดเชย',
    contraindications: 'ผู้ป่วยที่มีภาวะข้อไหล่หลุดเฉียบพลันหรือเอ็นหัวไหล่ฉีกขาดรุนแรง',
    svgType: 'shoulder_raise',
  },
  {
    id: 2,
    name: 'ยืดคอด้านข้าง',
    englishName: 'Neck Lateral Stretch',
    category: 'ฟื้นฟูข้อไหล่และแขน',
    targetJoint: 'กระดูกคอ (Cervical Spine)',
    targetAngle: 30,
    holdSeconds: 20,
    repsPerSet: 5,
    sets: 2,
    difficulty: 'easy',
    description: 'นั่งหลังตรง เอียงศีรษะให้หูเข้าหาหัวไหล่ช้าๆ ใช้มือช่วยประคองเบาๆ',
    cautions: 'ห้ามออกแรงดึงกระชาก และไม่ต้องเกร็งยกหัวไหล่ขึ้นมารับศีรษะ',
    contraindications: 'ผู้ป่วยที่มีกระดูกคอเสื่อมรุนแรงและมีอาการชาลงแขนเฉียบพลัน',
    svgType: 'neck_lateral',
  },
  {
    id: 3,
    name: 'ยืดคอก้มไปข้างหน้า',
    englishName: 'Neck Flexion Stretch',
    category: 'ฟื้นฟูข้อไหล่และแขน',
    targetJoint: 'กระดูกคอ (Cervical Spine)',
    targetAngle: 35,
    holdSeconds: 20,
    repsPerSet: 5,
    sets: 2,
    difficulty: 'easy',
    description: 'นั่งหลังตรง ประสานมือวางท้ายทอย ก้มศีรษะให้คางชิดหน้าอกเบาๆ',
    cautions: 'หลังต้องตรง ไม่งอหลังส่วนบนตามลงไป หายใจเข้าออกสม่ำเสมอ',
    contraindications: 'ภาวะหมอนรองกระดูกคอปลิ้นเฉียบพลัน',
    svgType: 'neck_flexion',
  },
  {
    id: 4,
    name: 'ยืดหัวไหล่ข้ามลำตัว',
    englishName: 'Cross-Body Shoulder Stretch',
    category: 'ฟื้นฟูข้อไหล่และแขน',
    targetJoint: 'ข้อไหล่ด้านหลัง (Posterior Capsule)',
    targetAngle: 75,
    holdSeconds: 20,
    repsPerSet: 8,
    sets: 3,
    difficulty: 'easy',
    description: 'ยกแขนพาดข้ามหน้าอก ใช้แขนอีกข้างกดประคองข้อศอกเข้าหาตัว',
    cautions: 'รักษาแนวกระดูกสันหลังให้ตรง ไม่บิดหมุนลำตัวตามแขน',
    contraindications: 'การอักเสบเฉียบพลันของเอ็นสะบัก',
    svgType: 'shoulder_cross',
  },
  {
    id: 5,
    name: 'ยืดต้นแขนด้านหลัง',
    englishName: 'Overhead Triceps Stretch',
    category: 'ฟื้นฟูข้อไหล่และแขน',
    targetJoint: 'ข้อไหล่และกล้ามเนื้อ Triceps',
    targetAngle: 120,
    holdSeconds: 20,
    repsPerSet: 8,
    sets: 3,
    difficulty: 'medium',
    description: 'ยกแขนงอศอกไปด้านหลังศีรษะ ใช้มืออีกข้างกดประคองข้อศอกลงเบาๆ',
    cautions: 'ไม่เงยคอหรือแอ่นหลังจนเกินไป หากมีอาการปวดไหล่ให้ผ่อนมุมลง',
    contraindications: 'ผู้ป่วยหลังผ่าตัดเย็บซ่อมข้อไหล่ไม่เกิน 6 สัปดาห์',
    svgType: 'triceps_overhead',
  },
  {
    id: 6,
    name: 'ยืดอกเปิดหัวไหล่',
    englishName: 'Chest Opener Stretch',
    category: 'ฟื้นฟูข้อสะโพกและหลัง',
    targetJoint: 'กล้ามเนื้อหน้าอก (Pectoralis)',
    targetAngle: 110,
    holdSeconds: 15,
    repsPerSet: 10,
    sets: 2,
    difficulty: 'easy',
    description: 'ประสานมือด้านหลังลำตัว ยืดอกขึ้น ดึงสะบักสองข้างเข้าหากันเบาๆ',
    cautions: 'ระวังอย่าแอ่นหลังส่วนล่าง ให้เกร็งหน้าท้องประคองกระดูกสันหลัง',
    contraindications: 'ข้อไหล่ไม่มั่นคงทางด้านหน้า (Anterior Instability)',
    svgType: 'chest_open',
  },
  {
    id: 7,
    name: 'ยืดลำตัวด้านข้าง',
    englishName: 'Side Bend Stretch',
    category: 'ฟื้นฟูข้อสะโพกและหลัง',
    targetJoint: 'กระดูกสันหลังและเอว (Lateral Spine)',
    targetAngle: 25,
    holdSeconds: 20,
    repsPerSet: 8,
    sets: 2,
    difficulty: 'easy',
    description: 'ยกแขนข้างหนึ่งขึ้นเหนือศีรษะ เอนลำตัวไปด้านตรงข้ามช้าๆ',
    cautions: 'ไม่ก้มตัวไปข้างหน้า ลำตัวต้องอยู่ในระนาบเดิมตลอดเวลา',
    contraindications: 'หมอนรองกระดูกทับเส้นประสาทระยะอักเสบเฉียบพลัน',
    svgType: 'side_bend',
  },
  {
    id: 8,
    name: 'บิดลำตัวคลายหลัง',
    englishName: 'Seated Torso Twist',
    category: 'ฟื้นฟูข้อสะโพกและหลัง',
    targetJoint: 'กระดูกสันหลังส่วนอกและเอว (Thoracolumbar Spine)',
    targetAngle: 30,
    holdSeconds: 15,
    repsPerSet: 10,
    sets: 3,
    difficulty: 'medium',
    description: 'นั่งเก้าอี้หลังตรง บิดลำตัวไปด้านข้าง ใช้มือจับพนักพิงช่วยประคอง',
    cautions: 'สะโพกทั้งสองข้างต้องแนบติดเบาะเก้าอี้ ไม่ยกก้นขึ้นขณะบิดตัว',
    contraindications: 'กระดูกสันหลังคดระดับรุนแรง หรือหลังผ่าตัดกระดูกสันหลังเชื่อมข้อ',
    svgType: 'torso_twist',
  },
  {
    id: 9,
    name: 'ยืดต้นขาด้านหน้า',
    englishName: 'Standing Quadriceps Stretch',
    category: 'ฟื้นฟูข้อเข่าและขา',
    targetJoint: 'ข้อเข่าและข้อสะโพก (Quadriceps)',
    targetAngle: 110,
    holdSeconds: 20,
    repsPerSet: 10,
    sets: 3,
    difficulty: 'medium',
    description: 'ยืนจับเก้าอี้พยุง งอเข่าไปด้านหลัง ใช้มือจับข้อเท้าดึงเข้าหาสะโพก',
    cautions: 'เข่าทั้งสองข้างชิดกัน ไม่กางเข่าออกด้านข้าง และลำตัวต้องตั้งตรง',
    contraindications: 'เอ็นไขว้หน้าเข่าฉีกขาดระยะเฉียบพลัน',
    svgType: 'quadriceps',
  },
  {
    id: 10,
    name: 'ยืดต้นขาด้านหลัง',
    englishName: 'Seated Hamstrings Stretch',
    category: 'ฟื้นฟูข้อเข่าและขา',
    targetJoint: 'ข้อสะโพกและต้นขาด้านหลัง (Hamstrings)',
    targetAngle: 45,
    holdSeconds: 20,
    repsPerSet: 8,
    sets: 3,
    difficulty: 'easy',
    description: 'นั่งริมเก้าอี้ เหยียดขาข้างหนึ่งตรง โน้มลำตัวจากข้อสะโพกไปข้างหน้า',
    cautions: 'รักษาหลังให้ตรง ไม่งอหลังก้มตัว และปลายเท้ากระดกขึ้นเล็กน้อย',
    contraindications: 'อาการปวดร้าวลงขาจากเส้นประสาทไซอาติกเฉียบพลัน (Severe Sciatica)',
    svgType: 'hamstrings',
  },
  {
    id: 11,
    name: 'ยืดกล้ามเนื้อน่อง',
    englishName: 'Wall Calf Stretch',
    category: 'ฟื้นฟูข้อเท้าและขา',
    targetJoint: 'ข้อเท้าและกล้ามเนื้อน่อง (Gastrocnemius)',
    targetAngle: 30,
    holdSeconds: 20,
    repsPerSet: 10,
    sets: 3,
    difficulty: 'easy',
    description: 'ยืนดันผนัง ก้าวขาข้างหนึ่งไปด้านหลัง ส้นเท้าแนบพื้น ขาหลังเหยียดตรง',
    cautions: 'ส้นเท้าหลังต้องติดพื้นตลอดเวลา ปลายเท้าชี้ตรงไปข้างหน้า',
    contraindications: 'เอ็นร้อยหวายอักเสบเฉียบพลัน (Acute Achilles Tendinitis)',
    svgType: 'calf',
  },
  {
    id: 12,
    name: 'ยืดสะโพกบนเก้าอี้',
    englishName: 'Seated Piriformis Stretch',
    category: 'ฟื้นฟูข้อสะโพกและหลัง',
    targetJoint: 'ข้อสะโพกด้านหลัง (Piriformis)',
    targetAngle: 35,
    holdSeconds: 20,
    repsPerSet: 8,
    sets: 3,
    difficulty: 'medium',
    description: 'นั่งเก้าอี้ ยกข้อเท้าข้างหนึ่งพาดบนเข่าอีกข้าง แล้วโน้มตัวไปข้างหน้าช้าๆ',
    cautions: 'รักษาแนวกระดูกสันหลังให้ตรง ไม่กดเข่าแรงจนเกิดอาการปวดแปลบ',
    contraindications: 'ผู้ป่วยเปลี่ยนข้อสะโพกเทียม (Total Hip Replacement) ที่มีข้อจำกัดการงอสะโพก',
    svgType: 'piriformis_seated',
  },
  {
    id: 13,
    name: 'ย่อเข่าเก้าอี้พยุง',
    englishName: 'Supported Chair Squat',
    category: 'ฟื้นฟูข้อเข่าและขา',
    targetJoint: 'ข้อเข่าและกล้ามเนื้อขา (Knee Extension)',
    targetAngle: 90,
    holdSeconds: 3,
    repsPerSet: 12,
    sets: 3,
    difficulty: 'hard',
    description: 'ยืนจับพนักพิงเก้าอี้ ย่อเข่าลงคล้ายกำลังจะนั่งเก้าอี้ แล้วดันตัวขึ้น',
    cautions: 'หัวเข่าต้องไม่เลยปลายเท้า ระวังเข่าบิดเข้าด้านใน',
    contraindications: 'ข้อเข่าเสื่อมระยะรุนแรงมีอาการบวมและอักเสบเฉียบพลัน',
    svgType: 'knee_squat',
  },
];

const INITIAL_TREATMENT_PLANS: TreatmentPlan[] = [
  {
    id: 1,
    patientId: 12,
    patientName: 'นายสมชาย ใจดี',
    patientCode: 'P-0012',
    therapistId: 1,
    therapistName: 'กภ. ธนากร วงศ์สวัสดิ์',
    diagnosis: 'ข้อไหล่ติดระยะฟื้นฟู (Frozen Shoulder)',
    targetJoint: 'ข้อไหล่และกล้ามเนื้อสะบัก (Shoulder & Scapula)',
    assignedExercises: [
      { exerciseSlug: 'shoulder_raise', exerciseName: 'กางแขนยกด้านข้าง', sets: 3, reps: 10, holdSeconds: 3, difficulty: 'beginner' },
      { exerciseSlug: 'stretch_shoulder_cross', exerciseName: 'ยืดไหล่ข้ามอก', sets: 3, reps: 5, holdSeconds: 20, difficulty: 'beginner' },
      { exerciseSlug: 'stretch_chest_open', exerciseName: 'ยืดอกเปิดไหล่', sets: 2, reps: 5, holdSeconds: 15, difficulty: 'beginner' },
    ],
    clinicalNotes: 'เน้นเพิ่มองศาการยกแขนด้านข้าง หลีกเลี่ยงการยกแขนกระตุกเร็ว สังเกตอาการปวดไม่ให้เกินระดับ 3/10',
    createdAt: '2026-10-01',
    status: 'active',
    scheduleDays: ['จันทร์', 'พุธ', 'ศุกร์'],
    timeSlot: '09:30 - 10:30',
    startTime: '09:30',
    endTime: '10:30',
    startDate: '2026-10-01',
    endDate: '2026-10-31',
    roomStation: 'ตู้ Kiosk 1',
  },
  {
    id: 2,
    patientId: 13,
    patientName: 'นางมาลี รักสุข',
    patientCode: 'P-0013',
    therapistId: 1,
    therapistName: 'กภ. ธนากร วงศ์สวัสดิ์',
    diagnosis: 'ข้อเข่าเสื่อมระยะที่ 2 (Knee OA)',
    targetJoint: 'ข้อเข่าและกล้ามเนื้อ Quadriceps (Knee)',
    assignedExercises: [
      { exerciseSlug: 'knee_squat', exerciseName: 'ย่อเข่าเก้าอี้', sets: 3, reps: 8, holdSeconds: 2, difficulty: 'beginner' },
      { exerciseSlug: 'stretch_quadriceps', exerciseName: 'ยืดต้นขาด้านหน้า', sets: 2, reps: 5, holdSeconds: 20, difficulty: 'beginner' },
      { exerciseSlug: 'stretch_hamstrings', exerciseName: 'ยืดต้นขาด้านหลัง', sets: 2, reps: 5, holdSeconds: 20, difficulty: 'beginner' },
    ],
    clinicalNotes: 'ฝึกย่อเข่าระดับปลอดภัย เข่าต้องไม่เลยปลายเท้า ระวังเข่าบิดเข้าด้านใน',
    createdAt: '2026-10-02',
    status: 'active',
    scheduleDays: ['อังคาร', 'พฤหัสบดี'],
    timeSlot: '10:30 - 11:30',
    startTime: '10:30',
    endTime: '11:30',
    startDate: '2026-10-01',
    endDate: '2026-10-31',
    roomStation: 'ตู้ Kiosk 2',
  },
  {
    id: 3,
    patientId: 21,
    patientName: 'นายวิชัย แก้วมณี',
    patientCode: 'P-0021',
    therapistId: 1,
    therapistName: 'กภ. ธนากร วงศ์สวัสดิ์',
    diagnosis: 'ปวดหลังส่วนล่างเรื้อรัง (Chronic Low Back Pain)',
    targetJoint: 'กระดูกสันหลังส่วนเอวและสะโพก (Lumbar & Hips)',
    assignedExercises: [
      { exerciseSlug: 'stretch_side_bend', exerciseName: 'เอียงตัวยืดสีข้าง', sets: 3, reps: 6, holdSeconds: 12, difficulty: 'beginner' },
      { exerciseSlug: 'stretch_torso_twist', exerciseName: 'บิดลำตัวคลายหลัง', sets: 3, reps: 6, holdSeconds: 10, difficulty: 'beginner' },
      { exerciseSlug: 'stretch_piriformis_seated', exerciseName: 'ยืดสะโพกบนเก้าอี้', sets: 2, reps: 5, holdSeconds: 15, difficulty: 'beginner' },
    ],
    clinicalNotes: 'นั่งตัวตรงขณะฝึก หลีกเลี่ยงการก้มตัวยกของหนัก แนะนำยืดเหยียดระหว่างวันทำงาน',
    createdAt: '2026-10-05',
    status: 'active',
    scheduleDays: ['จันทร์', 'พฤหัสบดี', 'เสาร์'],
    timeSlot: '13:00 - 14:00',
    startTime: '13:00',
    endTime: '14:00',
    startDate: '2026-10-05',
    endDate: '2026-11-05',
    roomStation: 'ตู้ Kiosk 1',
  },
];

const getStoredTreatmentPlans = (): TreatmentPlan[] => {
  try {
    const raw = localStorage.getItem('strongcare_hospital_treatment_plans');
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        const cleaned = parsed.filter(
          (p: TreatmentPlan) => p.patientCode !== 'P-3059'
        );
        // Clean localStorage if it contained obsolete mock P-3059
        if (cleaned.length !== parsed.length) {
          localStorage.setItem('strongcare_hospital_treatment_plans', JSON.stringify(cleaned));
        }
        if (cleaned.length === 0) return INITIAL_TREATMENT_PLANS;
        return cleaned.map((p: TreatmentPlan, idx: number) => {
          const fallback = INITIAL_TREATMENT_PLANS[idx % INITIAL_TREATMENT_PLANS.length];
          return {
            ...fallback,
            ...p,
            scheduleDays: p.scheduleDays && p.scheduleDays.length > 0 ? p.scheduleDays : fallback.scheduleDays,
            selectedDates: p.selectedDates || (Array.isArray(p.scheduledDates) ? p.scheduledDates.map((d: any) => typeof d === 'string' ? d : d.date) : undefined),
            scheduledDates: p.scheduledDates || p.selectedDates,
            timeSlot: p.timeSlot || fallback.timeSlot,
            startTime: p.startTime || fallback.startTime,
            endTime: p.endTime || fallback.endTime,
            startDate: p.startDate || fallback.startDate,
            endDate: p.endDate || fallback.endDate,
            roomStation: p.roomStation || fallback.roomStation,
          };
        });
      }
    }
  } catch (e) {}
  return INITIAL_TREATMENT_PLANS;
};

const getDeletedUserCodes = (): Set<string> => {
  try {
    const raw = localStorage.getItem('strongcare_deleted_users');
    if (raw) {
      const arr: string[] = JSON.parse(raw);
      return new Set(arr.map((c) => String(c).trim().toUpperCase()));
    }
  } catch {}
  return new Set();
};

const addDeletedUserToBlacklist = (...identifiers: (string | number | undefined)[]) => {
  try {
    const deletedSet = getDeletedUserCodes();
    identifiers.forEach((id) => {
      if (id !== undefined && id !== null && String(id).trim() !== '') {
        deletedSet.add(String(id).trim().toUpperCase());
      }
    });
    localStorage.setItem('strongcare_deleted_users', JSON.stringify(Array.from(deletedSet)));
  } catch {}
};

const removePatientFromPatientsJson = (id: string | number, code?: string) => {
  try {
    const raw = localStorage.getItem('strongcare_patients_json');
    let patients = raw ? JSON.parse(raw) : (initialPatientsData as any[]);
    if (Array.isArray(patients)) {
      patients = patients.filter((p: any) => {
        const matchId = String(p.id) === String(id);
        const matchCode = code && String(p.code).toUpperCase() === String(code).toUpperCase();
        return !matchId && !matchCode;
      });
      localStorage.setItem('strongcare_patients_json', JSON.stringify(patients));
    }
  } catch {}
};

const getStoredUsers = (): UserAccount[] => {
  const deletedSet = getDeletedUserCodes();
  let baseUsers: UserAccount[] = INITIAL_USERS;
  try {
    const raw = localStorage.getItem('strongcare_hospital_users');
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        baseUsers = parsed;
        // Ensure any core staff from INITIAL_USERS (including pj) are always included
        for (const initU of INITIAL_USERS) {
          if (initU.role !== 'patient' && !baseUsers.some((u) => u.username.toLowerCase() === initU.username.toLowerCase() || u.code === initU.code)) {
            baseUsers.push(initU);
          }
        }
      }
    }
  } catch (e) {}

  return baseUsers
    .filter((u: UserAccount) => {
      const idStr = String(u.id).trim().toUpperCase();
      const codeStr = String(u.code || '').trim().toUpperCase();
      const userStr = String(u.username || '').trim().toUpperCase();
      return !deletedSet.has(idStr) && !deletedSet.has(codeStr) && !deletedSet.has(userStr);
    })
    .map((u: UserAccount) => {
      if (!u.face_image_url && typeof window !== 'undefined' && window.localStorage) {
        const saved = localStorage.getItem(`face_image_${u.code}`) || localStorage.getItem(`face_image_${u.id}`);
        if (saved) u.face_image_url = saved;
      }
      if (u.code === 'P-0012' && !u.face_image_url) {
        u.face_image_url = 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=400&auto=format&fit=crop&q=80';
      } else if (u.code === 'P-0013' && !u.face_image_url) {
        u.face_image_url = 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=400&auto=format&fit=crop&q=80';
      }
      // Auto-heal placeholder patient name from patient_record.json or face registry
      if (u.role === 'patient' && isPlaceholderPatientName(u.name, u.status) && u.code) {
        try {
          const dossier = patientFaceStorageService.getPatientRecord(u.code);
          const dName = dossier?.patient_profile?.full_name || (dossier?.patient_profile?.first_name ? `${dossier.patient_profile.first_name} ${dossier.patient_profile.last_name || ''}`.trim() : '');
          if (dName && !isPlaceholderPatientName(dName)) {
            u.name = dName;
          } else {
            const profile = faceRegistryService.getAllProfiles().find(
              (p) => (p.patientCode && p.patientCode.toUpperCase() === u.code.toUpperCase()) || String(p.patientId) === String(u.id)
            );
            if (profile?.name && !isPlaceholderPatientName(profile.name)) {
              u.name = profile.name;
            }
          }
        } catch {}
      }
      return u;
    })
    .filter((u: UserAccount) => {
      // Exclude placeholder/draft patient accounts like 'ผู้ป่วยใหม่' without real identity from active list
      if (u.role === 'patient' && isPlaceholderPatientName(u.name, u.status)) {
        return false;
      }
      return true;
    });
};

const persistUsers = (users: UserAccount[]) => {
  try {
    localStorage.setItem('strongcare_hospital_users', JSON.stringify(users));
  } catch {}
};

const getStoredExercises = (): HospitalExercise[] => {
  try {
    const raw = localStorage.getItem('strongcare_hospital_exercises');
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    }
  } catch {}
  return initialExercisesData as HospitalExercise[];
};

const persistExercises = (exercises: HospitalExercise[]) => {
  try {
    localStorage.setItem('strongcare_hospital_exercises', JSON.stringify(exercises));
  } catch {}
};

const getStoredModpacks = (): ExerciseModpack[] => {
  try {
    const raw = localStorage.getItem('strongcare_hospital_modpacks');
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    }
  } catch {}
  return initialModpacksData as ExerciseModpack[];
};

const persistModpacks = (modpacks: ExerciseModpack[]) => {
  try {
    localStorage.setItem('strongcare_hospital_modpacks', JSON.stringify(modpacks));
  } catch {}
};

const INITIAL_LOGS: ActivityLog[] = [
  {
    id: 1,
    timestamp: '2026-10-06 14:30:15',
    userId: 1,
    userName: 'นพ. วรชัย อมรเวช',
    role: 'admin',
    action: 'เข้าสู่ระบบ (Login)',
    category: 'AUTH',
    details: 'เข้าสู่ระบบผู้ดูแลระบบจากสถานีตู้ส่วนกลาง (IP: 192.168.1.108)',
    device: 'Windows 11 / Chrome 124 (Admin Workstation 01)',
    ipAddress: '192.168.1.108',
  },
  {
    id: 2,
    timestamp: '2026-10-06 14:15:20',
    userId: 2,
    userName: 'กภ. ธนากร วงศ์สวัสดิ์',
    role: 'therapist',
    action: 'ปรับแผนการรักษา (Update Prescription)',
    category: 'TREATMENT',
    details: 'ปรับเพิ่มจำนวนครั้งท่า shoulder_raise ของนายสมชาย ใจดี (P-0012) จาก 8 เป็น 10 ครั้ง',
    device: 'macOS Sonoma / Safari 17.4 (Therapist iPad Pro)',
    ipAddress: '192.168.1.115',
  },
  {
    id: 3,
    timestamp: '2026-10-06 11:20:44',
    userId: 1,
    userName: 'นพ. วรชัย อมรเวช',
    role: 'admin',
    action: 'กำหนดนักกายภาพบำบัดผู้รับผิดชอบ',
    category: 'PATIENT',
    details: 'มอบหมายคนไข้ นายประเสริฐ มั่นคง (P-0034) ให้ กภ. พิมพ์ชนก สุขเกษม ดูแล',
    device: 'Windows 11 / Chrome 124 (Admin Workstation 01)',
    ipAddress: '192.168.1.108',
  },
  {
    id: 4,
    timestamp: '2026-10-06 10:15:02',
    userId: 12,
    userName: 'นายสมชาย ใจดี',
    role: 'patient',
    action: 'สแกนใบหน้าเข้าใช้งานตู้ (Biometric Kiosk Login)',
    category: 'AUTH',
    details: 'ยืนยันตัวตนด้วยใบหน้าสำเร็จ (Cosine: 0.86, Liveness: Blink + Yaw Right)',
    device: 'Android 14 / Dr.Tech.Care Kiosk Station A',
    ipAddress: '192.168.1.120',
  },
  {
    id: 5,
    timestamp: '2026-10-06 09:40:11',
    userId: 2,
    userName: 'กภ. ธนากร วงศ์สวัสดิ์',
    role: 'therapist',
    action: 'ลงทะเบียนคนไข้ใหม่ & สแกนใบหน้า (Reception Onboarding)',
    category: 'PATIENT',
    details: 'ลงทะเบียนคนไข้ใหม่ กัญญา บุญมา (P-0035) พร้อมบันทึกเวกเตอร์ชีวมิติ 128 มิติ',
    device: 'Windows 10 / Firefox 125 (Reception Counter 01)',
    ipAddress: '192.168.1.105',
  },
];

const INITIAL_SYMPTOM_REPORTS: PatientSymptomReport[] = [
  {
    id: 1,
    patientId: 12,
    patientName: 'นายสมชาย ใจดี',
    therapistId: 1,
    reportedAt: '2026-10-06 10:45',
    symptomType: 'pain',
    severity: 2,
    affectedArea: 'หัวไหล่ขวาด้านหน้า',
    description: 'รู้สึกตึงแปลบเล็กน้อยเวลายกแขนเกิน 90 องศา แต่ผ่อนลงแล้วหายใน 1 นาที',
    status: 'reviewed',
    therapistReply: 'รับทราบครับ ให้รักษามุมยกแขนไว้ที่ 80-85 องศาตามระดับสบายก่อน ยังไม่ต้องฝืนยกสูงครับ',
  },
  {
    id: 2,
    patientId: 13,
    patientName: 'นางมาลี รักสุข',
    therapistId: 1,
    reportedAt: '2026-10-05 16:20',
    symptomType: 'fatigue',
    severity: 1,
    affectedArea: 'กล้ามเนื้อต้นขาทั้งสองข้าง',
    description: 'เมื่อยกล้ามเนื้อขาหลังทำท่าย่อเข่าครบ 3 เซต',
    status: 'reviewed',
    therapistReply: 'เป็นอาการปกติของการกระตุ้นกล้ามเนื้อ Quadriceps ครับ แนะนำให้ยืดกล้ามเนื้อและพักผ่อนให้เพียงพอ',
  },
];

interface HospitalState {
  currentRole: UserRole;
  currentUserId: number | string;
  users: UserAccount[];
  therapists: PhysicalTherapist[];
  exercises: HospitalExercise[];
  treatmentPlans: TreatmentPlan[];
  cancelledAppointmentKeys: string[];
  activityLogs: ActivityLog[];
  bannedDevices: string[];
  bannedIps: string[];
  symptomReports: PatientSymptomReport[];
  aiSettings: AiSystemSettings;
  isSupabaseConnected: boolean;
  isCentralBackendConnected: boolean;
  isLoadingFromDb: boolean;

  // Database Sync
  initializeFromSupabase: () => Promise<void>;
  fetchPatientsFromCentralApi: () => Promise<void>;

  // Role & Authentication
  setCurrentRole: (role: UserRole) => void;
  setCurrentUserId: (id: number | string) => void;
  loginStaff: (username: string, password: string) => Promise<{ success: boolean; user?: UserAccount; error?: string }>;
  logoutStaff: () => void;

  // User Management
  addUser: (user: Omit<UserAccount, 'id' | 'created_at'>) => UserAccount;
  upsertPatientFromSupabase: (patientData: any) => void;
  completePendingPatientInfo: (
    id: number | string,
    patientData: {
      name: string;
      code?: string;
      age?: number;
      gender?: 'male' | 'female' | 'other';
      phone?: string;
      diagnosis?: string;
      chiefComplaint?: string;
      patientBackground?: string;
      assignedTherapistName?: string;
      assignedTherapistId?: number | string;
    }
  ) => UserAccount | null;
  updateUser: (id: number | string, data: Partial<UserAccount>) => void;
  deleteUser: (id: number | string) => void;
  toggleUserStatus: (id: number | string) => void;
  resetUserPassword: (id: number | string, newPin?: string) => string;
  changePasswordWithVerification: (id: number | string, newPass: string) => Promise<boolean>;
  changeUserRole: (id: number | string, newRole: UserRole) => void;
  assignTherapist: (patientId: number | string, therapistId: number | string, therapistName: string) => void;

  // Physical Therapist Management
  addTherapist: (therapist: Omit<PhysicalTherapist, 'id'>) => void;
  updateTherapist: (id: number | string, data: Partial<PhysicalTherapist>) => void;
  deleteTherapist: (id: number | string) => void;

  // Exercise Library Management
  addExercise: (exercise: Omit<HospitalExercise, 'id'>) => HospitalExercise;
  updateExercise: (id: number | string, data: Partial<HospitalExercise>) => void;
  deleteExercise: (id: number | string) => void;

  // Exercise Modpacks Management
  modpacks: ExerciseModpack[];
  addModpack: (modpack: Omit<ExerciseModpack, 'id' | 'createdAt'>) => ExerciseModpack;
  updateModpack: (id: string | number, data: Partial<ExerciseModpack>) => void;
  deleteModpack: (id: string | number) => void;

  // Treatment Plans
  saveTreatmentPlan: (plan: Omit<TreatmentPlan, 'id' | 'createdAt'> & { id?: number | string }) => void;
  deleteTreatmentPlan: (id: number | string) => void;
  deleteAppointmentForPatient: (params: {
    patientId?: string | number;
    patient?: any;
    dateStr: string;
    appointmentId?: string | number;
    planId?: string | number;
  }) => { success: boolean; error?: string };

  // Symptoms & Logs & Security (Kick/Ban)
  reportSymptom: (report: Omit<PatientSymptomReport, 'id' | 'reportedAt' | 'status'>) => void;
  reviewSymptom: (id: number | string, reply: string) => void;
  addActivityLog: (action: string, category: ActivityLog['category'], details: string, device?: string, ipAddress?: string) => void;
  kickSession: (logId: number | string) => void;
  banDevice: (device: string) => void;
  unbanDevice: (device: string) => void;
  banIp: (ip: string) => void;
  unbanIp: (ip: string) => void;

  // Temporary Case Delegation Management
  delegations: TemporaryCaseDelegation[];
  addDelegation: (delegation: Omit<TemporaryCaseDelegation, 'id' | 'createdAt' | 'status'>) => TemporaryCaseDelegation;
  revokeDelegation: (id: string | number) => void;
  isPatientCoveredByTherapist: (patientId: string | number, therapistId: string | number, date?: string) => boolean;
  getCoveringDelegationForPatient: (patientId: string | number) => TemporaryCaseDelegation | undefined;

  // AI Configuration
  updateAiSettings: (settings: Partial<AiSystemSettings>) => void;
}

export const useHospitalStore = create<HospitalState>((set, get) => ({
  currentRole: 'admin',
  currentUserId: 1,
  users: getStoredUsers(),
  therapists: INITIAL_THERAPISTS,
  exercises: getStoredExercises(),
  modpacks: getStoredModpacks(),
  treatmentPlans: getStoredTreatmentPlans(),
  cancelledAppointmentKeys: (() => {
    try {
      const saved = localStorage.getItem('strongcare_cancelled_appointments');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  })(),
  delegations: getStoredDelegations(),
  activityLogs: INITIAL_LOGS,
  bannedDevices: ['Linux / Curl Automation Client', 'Unknown Android Emulator #99'],
  bannedIps: ['198.51.100.44', '203.0.113.19'],
  symptomReports: INITIAL_SYMPTOM_REPORTS,
  isSupabaseConnected: supabaseService.isConfigured(),
  isCentralBackendConnected: false,
  isLoadingFromDb: false,
  aiSettings: {
    similarityThreshold: 0.80,
    marginThreshold: 0.08,
    minVisibilityThreshold: 0.55,
    poseConfidenceThreshold: 0.65,
    toleranceDeg: 10,
    maxTrunkLeanDeg: 22,
    maxVelocityDegPerSec: 220,
    modelVersion: 'face-resnet34-v2',
    enableVoiceGuidance: true,
    enableAutoSync: true,
    strictLivenessChallenge: true,
  },

  fetchPatientsFromCentralApi: async () => {
    try {
      const centralPatients = await api.getPatients();
      if (centralPatients && centralPatients.length > 0) {
        const staffUsers = get().users.filter((u) => u.role !== 'patient');
        const deletedSet = getDeletedUserCodes();

        const patientUsers: UserAccount[] = centralPatients
          .filter((p) => {
            const idStr = String(p.id).trim().toUpperCase();
            const codeStr = String(p.patient_code || '').trim().toUpperCase();
            return !deletedSet.has(idStr) && !deletedSet.has(codeStr);
          })
          .map((p) => ({
            id: p.id,
            code: p.patient_code,
            username: `user_${(p.patient_code || '').toLowerCase().replace(/[^a-z0-9]/g, '')}`,
            name: p.name,
            role: 'patient',
            status: (p.status as any) || 'active',
            age: p.age,
            gender: p.gender,
            phone: p.phone,
            diagnosis: p.notes,
            chiefComplaint: p.notes,
            assignedTherapistName: (p as any).assigned_therapist_name || 'กภ. ธนากร วงศ์สวัสดิ์',
            assignedTherapistId: 1,
            face_image_url: (p as any).face_image_url,
            created_at: (p as any).created_at || new Date().toISOString().split('T')[0],
            last_active: (p as any).last_active || 'พร้อมรับบริการ',
          }));

        const mergedUsers = [...staffUsers, ...patientUsers];
        set({ users: mergedUsers, isCentralBackendConnected: true, isLoadingFromDb: false });
        persistUsers(mergedUsers);
        console.info(`✓ HospitalStore loaded ${patientUsers.length} patients from Central Synchronized Database.`);
      }
    } catch (err: any) {
      console.warn('HospitalStore fetchPatientsFromCentralApi warning:', err.message);
    }
  },

  initializeFromSupabase: async () => {
    const isColdStart = get().users.length === 0;
    if (isColdStart) {
      set({ isLoadingFromDb: true });
    }

    // 1. Fetch from Central Node.js Server (Single Source of Truth across devices if available)
    await get().fetchPatientsFromCentralApi();

    // 2. Fetch from Supabase Cloud if configured
    if (supabaseService.isConfigured()) {
      try {
        const [profiles, therapists, exercises, logs, settings, bannedDevices, bannedIps, patients, remotePlans, remoteModpacks] = await Promise.all([
          supabaseService.fetchProfiles(),
          supabaseService.fetchTherapists(),
          supabaseService.fetchExercises(),
          supabaseService.fetchActivityLogs(),
          supabaseService.fetchSystemSettings(),
          supabaseService.fetchBannedDevices(),
          supabaseService.fetchBannedIps(),
          supabaseService.fetchPatients(),
          supabaseService.fetchTreatmentPlans(),
          supabaseService.fetchModpacks(),
        ]);

        const staffUsers: UserAccount[] = (profiles && profiles.length > 0)
          ? profiles.filter((p) => p.role !== 'patient').map((p) => {
              if (!p.password || p.password === DEFAULT_PASSWORD_HASH || p.password.length < 8) {
                return { ...p, must_change_password: true };
              }
              return p;
            })
          : get().users.filter((u) => u.role !== 'patient');

        // Always ensure all core staff from INITIAL_USERS (admin, thanakorn, pimchanok, pjj, pt_waranyoo) are present
        for (const initU of INITIAL_USERS) {
          if (initU.role !== 'patient') {
            const exists = staffUsers.some(
              (u) =>
                (u.code && initU.code && u.code.trim().toUpperCase() === initU.code.trim().toUpperCase()) ||
                u.username.toLowerCase() === initU.username.toLowerCase()
            );
            if (!exists) {
              staffUsers.push(initU);
            }
          }
        }

        // Synchronize any therapist in therapists list that is missing from staffUsers (e.g. 'pj', 'waranyoo')
        const existingStaffCodes = new Set(staffUsers.map((u) => String(u.code || '').trim().toUpperCase()));
        const existingStaffUsernames = new Set(staffUsers.map((u) => String(u.username || '').trim().toLowerCase()));
        const existingStaffNames = new Set(staffUsers.map((u) => String(u.name || '').trim().toLowerCase()));

        if (therapists && therapists.length > 0) {
          for (const t of therapists) {
            const tNameClean = (t.name || '').trim().toLowerCase();
            const tCodeUpper = String(t.code || '').trim().toUpperCase();
            const isPj = tNameClean === 'pjj' || tNameClean === 'pj' || tCodeUpper === 'T-6512' || (t.email && t.email.toLowerCase().includes('pjj'));
            const isWaranyoo = tCodeUpper === 'T-012' || tNameClean.includes('วรัญญู');

            const suggestedUsername = isPj
              ? 'pjj'
              : isWaranyoo
              ? 'pt_waranyoo'
              : (t.email && !t.email.includes('drtechcare.com') && !t.email.includes('example.com')
                  ? t.email.split('@')[0].toLowerCase()
                  : (t.name.toLowerCase().replace(/^(กภ\.|นาย|นางสาว|ดร\.)\s*/, '').trim().replace(/\s+/g, '_') || t.code.toLowerCase().replace(/[^a-z0-9]/g, '')));

            const alreadyExists =
              existingStaffCodes.has(tCodeUpper) ||
              existingStaffUsernames.has(suggestedUsername.toLowerCase()) ||
              existingStaffNames.has(tNameClean);

            if (!alreadyExists) {
              const newStaffUser: UserAccount = {
                id: typeof t.id === 'number' ? t.id : Math.floor(1000 + Math.random() * 9000),
                username: suggestedUsername,
                name: t.name,
                role: 'therapist' as UserRole,
                status: t.status === 'on_leave' ? 'suspended' : 'active',
                code: t.code,
                phone: t.phone || '',
                email: t.email || `${suggestedUsername}@drtechcare.hospital`,
                password: DEFAULT_PASSWORD_HASH,
                must_change_password: false,
                created_at: '2026-01-20',
                last_active: 'พร้อมให้บริการ',
              };

              existingStaffCodes.add(tCodeUpper);
              existingStaffUsernames.add(suggestedUsername.toLowerCase());
              existingStaffNames.add(tNameClean);
              staffUsers.push(newStaffUser);

              // Auto-persist to Supabase profiles so it is permanently stored
              supabaseService.createProfile(newStaffUser).catch((e) => {
                console.warn('Sync therapist profile to Supabase warning:', e);
              });
            }
          }
        }

        const deletedSet = getDeletedUserCodes();

        const patientUsers: UserAccount[] = Array.isArray(patients)
          ? patients
              .filter((p: any) => {
                const idStr = String(p.id).trim().toUpperCase();
                const codeStr = String(p.patient_code || '').trim().toUpperCase();
                return !deletedSet.has(idStr) && !deletedSet.has(codeStr);
              })
              .map((p: any) => {
                const isPending =
                  p.status === 'pending_info' ||
                  isPlaceholderPatientName(p.full_name, p.status) ||
                  (p.chief_complaint && p.chief_complaint.includes('[PENDING_INFO]')) ||
                  (p.therapist_notes && p.therapist_notes.includes('[PENDING_INFO]'));

                let rawGender = p.gender || 'male';
                let normGender: 'male' | 'female' = 'male';
                if (rawGender === 'หญิง' || rawGender === 'female') normGender = 'female';

                // Clean display complaint without [PENDING_INFO] tag
                const cleanComplaint = (p.chief_complaint || '')
                  .replace(/\[PENDING_INFO\]/g, '')
                  .trim() || (isPending ? 'รอตรวจประเมินกายภาพบำบัด' : 'ตรวจประเมินกายภาพบำบัด');

                let resolvedName = (p.full_name || p.name || '').trim();
                const codeStr = String(p.patient_code || '').trim();
                if (!resolvedName || isPlaceholderPatientName(resolvedName, p.status)) {
                  try {
                    if (codeStr) {
                      const dossier = patientFaceStorageService.getPatientRecord(codeStr);
                      const dName = dossier?.patient_profile?.full_name || (dossier?.patient_profile?.first_name ? `${dossier.patient_profile.first_name} ${dossier.patient_profile.last_name || ''}`.trim() : '');
                      if (dName && !isPlaceholderPatientName(dName)) {
                        resolvedName = dName;
                      } else {
                        const profile = faceRegistryService.getAllProfiles().find(
                          (prof) => (prof.patientCode && prof.patientCode.toUpperCase() === codeStr.toUpperCase()) || String(prof.patientId) === String(p.id)
                        );
                        if (profile?.name && !isPlaceholderPatientName(profile.name)) {
                          resolvedName = profile.name;
                        } else {
                          const existingLocal = get().users.find((u) => u.code && u.code.toUpperCase() === codeStr.toUpperCase());
                          if (existingLocal?.name && !isPlaceholderPatientName(existingLocal.name, existingLocal.status)) {
                            resolvedName = existingLocal.name;
                          }
                        }
                      }
                    }
                  } catch {}
                }
                if (!resolvedName) resolvedName = `ผู้รับบริการ (${p.patient_code})`;

                // Auto-heal Supabase patients table if we found a genuine name but the database has a placeholder
                if (codeStr && resolvedName && !isPlaceholderPatientName(resolvedName) && isPlaceholderPatientName(p.full_name, p.status)) {
                  Promise.resolve(
                    supabase.from('patients').update({ full_name: resolvedName }).eq('patient_code', codeStr)
                  ).catch(() => {});
                }

                return {
                  id: p.id,
                  code: p.patient_code,
                  patient_code: p.patient_code,
                  username: `user_${(p.patient_code || '').toLowerCase().replace(/[^a-z0-9]/g, '')}`,
                  name: resolvedName,
                  role: 'patient' as UserRole,
                  status: isPending ? 'pending_info' : (p.status === 'suspended' ? 'suspended' : 'active'),
                  pendingInfoNote: isPending ? 'บัญชีนี้สแกนหน้าแล้ว รอลงข้อมูลส่วนตัว' : undefined,
                  age: Number(p.age) || 65,
                  gender: normGender,
                  phone: p.phone || '',
                  password: p.pin || p.password || DEFAULT_PASSWORD_HASH,
                  pin: p.pin || '1234',
                  diagnosis: cleanComplaint,
                  chiefComplaint: cleanComplaint,
                  patientBackground: (p.medical_history || '')
                    .replace(/\[PENDING_INFO\]/g, '')
                    .replace(/FACE_EMB:\[.*?\]/gs, '')
                    .replace(/FACE_PHOTO:[^\s\n]+/g, '')
                    .replace(/รอลงข้อมูลส่วนตัว/g, '')
                    .trim(),
                  treatmentOutcome: p.treatment_outcome || '',
                  therapistNotes: (p.therapist_notes || '')
                    .replace(/\[PENDING_INFO\]/g, '')
                    .replace(/บัญชีนี้สแกนหน้าแล้ว รอลงข้อมูลส่วนตัว/g, '')
                    .trim(),
                  assignedTherapistName: p.profiles?.full_name || 'กภ. ธนากร วงศ์สวัสดิ์',
                  assignedTherapistId: p.responsible_therapist_id || 1,
                  face_image_url: p.photo || p.avatar_url,
                  biometricVector: p.face_vector,
                  face_vector: p.face_vector,
                  created_at: p.created_at ? p.created_at.split('T')[0] : new Date().toISOString().split('T')[0],
                  last_active: isPending ? 'รอลงข้อมูลส่วนตัว' : 'พร้อมรับบริการ',
                };
              })
          : [];

        // Hydrate patientFaceStorageService and faceRegistryService so that any kiosk or client has all patient face photos and records in memory
        if (patientUsers && patientUsers.length > 0) {
          for (const pu of patientUsers) {
            if (pu.face_image_url || (pu as any).biometricVector) {
              patientFaceStorageService.savePatientRecord(pu.code, {
                patient_profile: {
                  id: pu.id,
                  patient_id: pu.code,
                  full_name: pu.name,
                  age: pu.age,
                  gender: pu.gender,
                  status: (pu.status === 'suspended' || pu.status === 'pending_info') ? pu.status : 'active',
                },
                biometric_data: {
                  face_vector: (pu as any).biometricVector || (pu as any).face_vector || [],
                  registered_face_url: pu.face_image_url || '',
                  enrolled_at: pu.created_at || new Date().toISOString(),
                },
              }, pu.face_image_url);
            }
          }
        } else if (Array.isArray(patients) && patients.length === 0) {
          // If all patients were deleted from Supabase, purge local storage & memory face dossiers
          patientFaceStorageService.purgeAllPlaceholderRecords();
          faceRegistryService.syncFromPatients([]);
        }

        const mergedUsers = [...staffUsers, ...patientUsers];
        const currentUsers = get().users;
        const isUsersChanged =
          isColdStart ||
          currentUsers.length !== mergedUsers.length ||
          mergedUsers.some((u) => {
            const cur = currentUsers.find((c) => String(c.id) === String(u.id) || c.code === u.code);
            if (!cur) return true;
            return (
              cur.name !== u.name ||
              cur.status !== u.status ||
              cur.phone !== u.phone ||
              cur.diagnosis !== u.diagnosis ||
              cur.chiefComplaint !== u.chiefComplaint ||
              cur.face_image_url !== u.face_image_url
            );
          });

        if (isUsersChanged) {
          set({ users: mergedUsers, isSupabaseConnected: true });
          persistUsers(mergedUsers);
          console.info(`✓ HospitalStore updated: loaded ${patientUsers.length} patients and ${staffUsers.length} staff from Supabase`);
        } else {
          set({ isSupabaseConnected: true });
        }

        // Treatment Plans Cloud Sync
        if (remotePlans && remotePlans.length > 0) {
          set({ treatmentPlans: remotePlans });
          try {
            localStorage.setItem('strongcare_hospital_treatment_plans', JSON.stringify(remotePlans));
          } catch {}
        } else {
          // If Supabase system_settings doesn't have plans yet, sync our existing treatment plans to Supabase!
          const currentPlans = get().treatmentPlans;
          if (currentPlans && currentPlans.length > 0) {
            supabaseService.saveTreatmentPlans(currentPlans).catch(() => {});
          }
        }

        // Modpacks Cloud Sync
        if (remoteModpacks && remoteModpacks.length > 0) {
          set({ modpacks: remoteModpacks });
          persistModpacks(remoteModpacks);
        } else {
          // If Supabase system_settings doesn't have modpacks yet, sync our existing modpacks to Supabase!
          const currentModpacks = get().modpacks;
          if (currentModpacks && currentModpacks.length > 0) {
            supabaseService.saveModpacks(currentModpacks).catch(() => {});
          }
        }

        const combinedTherapists = [...(therapists || []), ...INITIAL_THERAPISTS];
        const seenTherapistCodes = new Set<string>();
        const dedupedTherapists: PhysicalTherapist[] = [];
        for (const t of combinedTherapists) {
          const codeUpper = String(t.code || '').trim().toUpperCase();
          if (codeUpper && !seenTherapistCodes.has(codeUpper)) {
            seenTherapistCodes.add(codeUpper);
            dedupedTherapists.push(t);
          }
        }
        set({ therapists: dedupedTherapists });
        if (exercises && exercises.length > 0 && get().exercises.length !== exercises.length) {
          set({ exercises });
        }
        if (logs && logs.length > 0 && get().activityLogs.length !== logs.length) {
          set({ activityLogs: logs });
        }
        if (settings) {
          set({ aiSettings: { ...get().aiSettings, ...settings } });
        }
        if (bannedDevices && bannedDevices.length > 0 && get().bannedDevices.length !== bannedDevices.length) {
          set({ bannedDevices });
        }
        if (bannedIps && bannedIps.length > 0 && get().bannedIps.length !== bannedIps.length) {
          set({ bannedIps });
        }
        const remoteDelegations = await supabaseService.fetchTemporaryCoverages();
        if (remoteDelegations && remoteDelegations.length > 0) {
          set({ delegations: remoteDelegations });
          persistDelegations(remoteDelegations);
        }
      } catch (err) {
        console.error('[SUPABASE] initializeFromSupabase error:', err);
      }
    } else {
      set({ isSupabaseConnected: false });
    }

    if (isColdStart) {
      set({ isLoadingFromDb: false });
    }
  },

  setCurrentRole: (role) => set({ currentRole: role }),
  setCurrentUserId: (id) => set({ currentUserId: id }),

  loginStaff: async (username, password) => {
    const cleanUsername = username.trim().toLowerCase();
    const cleanPassword = password.trim();

    if (!cleanUsername) {
      return { success: false, error: 'กรุณากรอก Username' };
    }
    if (!cleanPassword) {
      return { success: false, error: 'กรุณากรอก Password' };
    }

    // 1. Search for staff account (admin or therapist) matching username, name, code, or email
    let user = get().users.find((u) =>
      (u.role === 'admin' || u.role === 'therapist') &&
      (u.username.toLowerCase() === cleanUsername ||
       u.name.toLowerCase() === cleanUsername ||
       (u.code && u.code.toLowerCase() === cleanUsername) ||
       (u.email && u.email.toLowerCase() === cleanUsername))
    );

    // 2. If not found in staff users, check if therapist exists in therapists list and auto-link/create!
    if (!user) {
      const matchedTherapist = get().therapists.find((t) =>
        t.name.toLowerCase() === cleanUsername ||
        t.code.toLowerCase() === cleanUsername ||
        (t.email && t.email.toLowerCase().startsWith(cleanUsername))
      );

      if (matchedTherapist) {
        const staffAccount: UserAccount = {
          id: typeof matchedTherapist.id === 'number' ? matchedTherapist.id : Math.floor(1000 + Math.random() * 9000),
          username: cleanUsername,
          name: matchedTherapist.name,
          role: 'therapist',
          status: matchedTherapist.status === 'on_leave' ? 'suspended' : 'active',
          code: matchedTherapist.code,
          phone: matchedTherapist.phone || '',
          email: matchedTherapist.email || `${cleanUsername}@drtechcare.hospital`,
          password: DEFAULT_PASSWORD_HASH,
          must_change_password: false,
          created_at: new Date().toISOString().split('T')[0],
          last_active: 'เพิ่งเข้าสู่ระบบ',
        };
        const updatedUsers = [staffAccount, ...get().users];
        set({ users: updatedUsers });
        persistUsers(updatedUsers);
        if (supabaseService.isConfigured()) {
          supabaseService.createProfile(staffAccount).catch(() => {});
        }
        user = staffAccount;
      }
    }

    // 3. Fallback: check general users (e.g. if patient tries to log in)
    if (!user) {
      user = get().users.find((u) => u.username.toLowerCase() === cleanUsername);
    }

    // Generic error to prevent user enumeration attack
    if (!user) {
      return { success: false, error: 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง กรุณาตรวจสอบอีกครั้ง' };
    }

    if (user.role !== 'admin' && user.role !== 'therapist') {
      return {
        success: false,
        error: 'บัญชีนี้เป็นบัญชีคนไข้ (Patient) กรุณาเข้าสู่ระบบผ่านหน้าจอเริ่มต้นของตู้คนไข้',
      };
    }

    if (user.status === 'suspended') {
      return { success: false, error: 'บัญชีนี้ถูกระงับการใช้งานชั่วคราว กรุณาติดต่อผู้ดูแลระบบ' };
    }

    // Cryptographic verification against stored SHA-256 hash or fallback seeds
    const isMatch = await verifyStaffPassword(cleanPassword, user.password || '');

    // Generic error to prevent user enumeration attack
    if (!isMatch) {
      return { success: false, error: 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง กรุณาตรวจสอบอีกครั้ง' };
    }

    // Policy: Demo passes (1234, admin, admin1234) can enter directly
    const isDemoPassword = cleanPassword === '1234' || cleanPassword === 'admin' || cleanPassword === 'admin1234';
    const isWeakPassword = !isDemoPassword && cleanPassword.length < 8;
    const shouldChangePassword = Boolean(!isDemoPassword && (user.must_change_password || isWeakPassword));

    if (shouldChangePassword) {
      if (!user.must_change_password) {
        set((state) => ({
          users: state.users.map((u) =>
            u.id === user.id ? { ...u, must_change_password: true } : u
          ),
        }));
      }

      // Return sanitized user object with must_change_password: true
      return {
        success: true,
        user: { ...user, password: '', temp_password: undefined, must_change_password: true },
      };
    }

    set({
      currentRole: user.role,
      currentUserId: user.id,
    });

    get().addActivityLog(
      'เข้าสู่ระบบบุคลากรสำเร็จ',
      'AUTH',
      `${user.name} เข้าสู่ระบบสำเร็จด้วยสิทธิ์ ${user.role === 'admin' ? 'ผู้อำนวยการ รพ. / แอดมินใหญ่' : 'นักกายภาพบำบัด'}`,
      'Staff Workstation / Kiosk Admin Portal',
      '192.168.1.10'
    );

    // Call Supabase auth in background if configured
    if (supabaseService.isConfigured()) {
      supabaseService.signInStaff(username, password).catch((e) => {
        console.warn('Background Supabase auth sync:', e);
      });
    }

    return {
      success: true,
      user: { ...user, password: '', temp_password: undefined, must_change_password: false },
    };
  },

  logoutStaff: () => {
    const cur = get().users.find((u) => u.id === get().currentUserId);
    if (cur) {
      get().addActivityLog(
        'ออกจากระบบบุคลากร',
        'AUTH',
        `${cur.name} ออกจากระบบเรียบร้อยแล้ว`,
        'Staff Workstation',
        '192.168.1.10'
      );
    }
    if (supabaseService.isConfigured()) {
      supabaseService.signOutStaff();
    }
  },

  addUser: (userData) => {
    const newId = Math.max(0, ...get().users.map((u) => typeof u.id === 'number' ? u.id : 0)) + 1;
    const now = new Date().toISOString().split('T')[0];
    const newUser: UserAccount = {
      ...userData,
      id: newId,
      created_at: now,
      last_active: 'เพิ่งลงทะเบียน',
    };
    const updatedUsers = [newUser, ...get().users];
    set({ users: updatedUsers });
    persistUsers(updatedUsers);

    if (newUser.status === 'pending_info') {
      patientSyncService.broadcastEnrolledPending(newUser);
      get().addActivityLog(
        'สแกนหน้าคนไข้ใหม่ (รอข้อมูล)',
        'PATIENT',
        `คนไข้สแกนหน้า ณ ตู้ Kiosk รหัส ${newUser.code} สถานะ: ${newUser.pendingInfoNote || 'บัญชีนี้สแกนหน้าแล้ว รอลงข้อมูลส่วนตัว'}`
      );
    } else {
      get().addActivityLog(
        'เพิ่มผู้ใช้งานใหม่',
        'AUTH',
        `เพิ่ม ${newUser.name} (${newUser.code}) บทบาท: ${newUser.role}`
      );
    }

    if (supabaseService.isConfigured()) {
      if (newUser.role === 'patient') {
        supabaseService.createPatient({
          patient_code: newUser.code,
          name: newUser.name,
          age: newUser.age,
          gender: newUser.gender,
          phone: newUser.phone,
          pin: (newUser as any).password || '1234',
          chief_complaint: newUser.chiefComplaint || newUser.diagnosis || '',
          medical_history: newUser.patientBackground || '',
          treatment_outcome: newUser.treatmentOutcome || '',
          therapist_notes: newUser.therapistNotes || '',
          responsible_therapist_id: newUser.assignedTherapistId || null,
          status: newUser.status || 'active',
          face_vector: (newUser as any).biometricVector || (newUser as any).face_vector,
          face_image_url: newUser.face_image_url,
        }).then((created) => {
          if (created?.id) {
            set((state) => ({
              users: state.users.map((u) => (u.id === newId ? { ...u, id: created.id } : u)),
            }));
          }
        }).catch((e) => console.warn('Supabase createPatient in addUser error:', e));
      } else if (newUser.role === 'therapist') {
        // 1. Create Profile in Supabase profiles table for Staff Login & User Management
        supabaseService.createProfile(newUser).then((created) => {
          if (created?.id) {
            set((state) => ({
              users: state.users.map((u) => (u.id === newId ? { ...u, id: created.id } : u)),
            }));
          }
        }).catch((e) => console.warn('Supabase createProfile in addUser (therapist) error:', e));

        // 2. Create Therapist in Supabase therapists table
        supabaseService.createTherapist({
          code: newUser.code,
          name: newUser.name,
          phone: newUser.phone,
          email: newUser.email,
          status: newUser.status,
        }).catch((e) => console.warn('Supabase createTherapist in addUser error:', e));

        // 3. Ensure therapist exists in state.therapists
        const currentTherapists = get().therapists;
        if (!currentTherapists.some((t) => t.code === newUser.code || t.name.toLowerCase() === newUser.name.toLowerCase())) {
          set((state) => ({
            therapists: [
              ...state.therapists,
              {
                id: newId,
                code: newUser.code,
                name: newUser.name,
                specialty: 'กายภาพบำบัดระบบกระดูกและกล้ามเนื้อ (Orthopedics)',
                phone: newUser.phone || '',
                email: newUser.email || '',
                licenseNumber: `กภ. ${Math.floor(1000 + Math.random() * 9000)}`,
                activePatientsCount: 0,
                assignedCases: [],
                bio: 'นักกายภาพบำบัดวิชาชีพ โรงพยาบาล Dr.Tech.Care',
                status: newUser.status === 'suspended' ? 'suspended' : 'active',
              },
            ],
          }));
        }
      } else {
        supabaseService.createProfile(newUser).then((created) => {
          if (created?.id) {
            set((state) => ({
              users: state.users.map((u) => (u.id === newId ? { ...u, id: created.id } : u)),
            }));
          }
        }).catch((e) => console.warn('Supabase createProfile error:', e));
      }
    }

    // Central Backend Database Sync (Multi-Device Single Source of Truth)
    if (newUser.role === 'patient') {
      api.saveCentralPatientRecord({
        patient_code: newUser.code,
        code: newUser.code,
        id: newUser.id,
        name: newUser.name,
        age: newUser.age,
        gender: newUser.gender,
        phone: newUser.phone,
        status: newUser.status,
        pendingInfoNote: newUser.pendingInfoNote,
        diagnosis: newUser.diagnosis || newUser.chiefComplaint,
        chief_complaint: newUser.chiefComplaint || newUser.diagnosis,
        face_vector: (newUser as any).biometricVector || (newUser as any).face_vector,
        image_data_url: newUser.face_image_url,
      }).catch((e) => console.warn('Central DB sync addUser warning:', e));
    }

    return newUser;
  },

  completePendingPatientInfo: (id, patientData) => {
    const target = String(id || patientData.code || '').trim().toUpperCase();
    const existing = get().users.find((u) =>
      String(u.id) === target ||
      (u.code && String(u.code).trim().toUpperCase() === target) ||
      (patientData.code && u.code && String(u.code).trim().toUpperCase() === String(patientData.code).trim().toUpperCase())
    );
    if (!existing) return null;

    const finalName = (patientData.name || existing.name).trim();
    const targetCode = (existing.code || patientData.code || '').trim();
    const targetIdStr = String(existing.id);

    const updatedUser: UserAccount = {
      ...existing,
      ...patientData,
      name: finalName,
      status: 'active',
      pendingInfoNote: undefined,
      last_active: 'ลงทะเบียนข้อมูลครบถ้วนแล้ว',
    };

    const updatedUsers = get().users.map((u) => {
      const isMatch =
        String(u.id) === targetIdStr ||
        String(u.id) === target ||
        (u.code && targetCode && String(u.code).trim().toUpperCase() === targetCode.toUpperCase());
      return isMatch ? updatedUser : u;
    });
    set({ users: updatedUsers });
    persistUsers(updatedUsers);

    // อัปเดตโปรไฟล์ใบหน้าใน Face Registry ให้ตรงกับชื่อและข้อมูลจริง
    try {
      const allProfiles = faceRegistryService.getAllProfiles();
      const profile = allProfiles.find((p) =>
        String(p.patientId) === targetIdStr ||
        (p.patientCode && targetCode && p.patientCode.toUpperCase() === targetCode.toUpperCase())
      );
      if (profile) {
        profile.name = updatedUser.name;
        if (updatedUser.age) profile.age = updatedUser.age;
        if (updatedUser.gender) profile.gender = updatedUser.gender;
        if (updatedUser.face_image_url) profile.face_image_url = updatedUser.face_image_url;
        faceRegistryService.saveProfile(profile);
      }
    } catch {}

    // อัปเดต dossier ใน patientFaceStorageService ให้ตรงกับชื่อจริง
    if (targetCode) {
      try {
        patientFaceStorageService.savePatientRecord(targetCode, {
          patient_profile: {
            patient_id: targetCode,
            id: updatedUser.id,
            full_name: updatedUser.name,
            first_name: updatedUser.name.split(' ')[0] || updatedUser.name,
            last_name: updatedUser.name.split(' ').slice(1).join(' ') || '',
            age: updatedUser.age,
            gender: updatedUser.gender,
            phone: updatedUser.phone,
            status: 'active',
          },
        }, updatedUser.face_image_url);
      } catch {}
    }

    // ส่งสัญญาณ Broadcast ทันที เพื่อให้หน้าจอ Kiosk และหน้าอื่นๆ รับทราบและเปลี่ยนสถานะทันที
    patientSyncService.broadcastInfoCompleted(updatedUser);

    // Central Backend Database Sync
    api.updatePatient(updatedUser.code || id, {
      name: updatedUser.name,
      age: updatedUser.age,
      gender: updatedUser.gender,
      phone: updatedUser.phone,
      status: 'active',
      diagnosis: updatedUser.diagnosis,
      chief_complaint: updatedUser.chiefComplaint,
    }).catch((e) => console.warn('Central DB sync completePendingPatientInfo warning:', e));

    get().addActivityLog(
      'ลงทะเบียนคนไข้สำเร็จ',
      'PATIENT',
      `บันทึกข้อมูลคนไข้ ${updatedUser.name} (${updatedUser.code}) เรียบร้อยแล้ว พร้อมใช้งานตู้ Kiosk`
    );

    if (supabaseService.isConfigured()) {
      // 1. Direct clean update to Supabase public.patients table (valid columns only)
      if (targetCode) {
        Promise.resolve(
          supabase
            .from('patients')
            .update({
              full_name: updatedUser.name,
              age: updatedUser.age,
              gender: updatedUser.gender === 'female' || (updatedUser.gender as any) === 'หญิง' ? 'หญิง' : 'ชาย',
              phone: updatedUser.phone ? String(updatedUser.phone).trim() : null,
              chief_complaint: (updatedUser.chiefComplaint || updatedUser.diagnosis || '').replace(/\[PENDING_INFO\]/g, '').trim(),
              therapist_notes: 'ลงทะเบียนข้อมูลครบถ้วน',
              status: 'active',
            })
            .eq('patient_code', targetCode)
        )
          .then(({ error }: any) => {
            if (error) console.warn('[SUPABASE] Direct patients update warning in completePendingPatientInfo:', error);
            else console.info('[SUPABASE] Direct patients update success in completePendingPatientInfo for:', targetCode);
          })
          .catch(() => {});
      }

      // 2. Full service update preserving vectors in medical_history
      supabaseService.updatePatient(updatedUser.code || id, {
        name: updatedUser.name,
        full_name: updatedUser.name,
        age: updatedUser.age,
        gender: updatedUser.gender,
        phone: updatedUser.phone,
        chief_complaint: updatedUser.chiefComplaint || updatedUser.diagnosis || '',
        responsible_therapist_id: updatedUser.assignedTherapistId || null,
        status: 'active',
        face_image_url: updatedUser.face_image_url,
        photo: updatedUser.face_image_url,
        face_vector: (updatedUser as any).biometricVector || (updatedUser as any).face_vector,
        patientBackground: updatedUser.patientBackground,
      }).then(() => {
        try {
          const payload = {
            patient_code: updatedUser.code,
            full_name: updatedUser.name,
            name: updatedUser.name,
            age: updatedUser.age,
            gender: updatedUser.gender,
            phone: updatedUser.phone,
            status: 'active',
            isCompleted: true,
          };
          supabase.channel(PATIENTS_REALTIME_CHANNEL).send({
            type: 'broadcast',
            event: 'patient_completed',
            payload,
          }).catch(() => {});
          supabase.channel(PATIENTS_REALTIME_CHANNEL).send({
            type: 'broadcast',
            event: 'patient_registered',
            payload,
          }).catch(() => {});
        } catch {}
      }).catch((e) => console.error('[SUPABASE] updatePatient error in completePendingPatientInfo:', e));
    }

    return updatedUser;
  },

  upsertPatientFromSupabase: (p: any) => {
    if (!p) return;
    const patientCode = p.patient_code || p.code;
    if (!patientCode) return;

    const isPending =
      p.status === 'pending_info' ||
      (p.chief_complaint && p.chief_complaint.includes('[PENDING_INFO]')) ||
      (p.therapist_notes && p.therapist_notes.includes('[PENDING_INFO]')) ||
      (p.full_name && p.full_name.includes('รอลงข้อมูล')) ||
      (p.full_name && p.full_name.startsWith('ผู้รับบริการใหม่'));

    let rawGender = p.gender || 'male';
    let normGender: 'male' | 'female' = 'male';
    if (rawGender === 'หญิง' || rawGender === 'female') normGender = 'female';

    const cleanComplaint = (p.chief_complaint || p.notes || '')
      .replace(/\[PENDING_INFO\]/g, '')
      .trim() || (isPending ? 'รอตรวจประเมินกายภาพบำบัด' : 'ตรวจประเมินกายภาพบำบัด');

    let photo = p.photo || p.avatar_url || p.face_image_url;
    let vector = p.face_vector || p.embeddings;
    if (typeof p.medical_history === 'string') {
      if (!photo && p.medical_history.includes('FACE_PHOTO:')) {
        const match = p.medical_history.match(/FACE_PHOTO:([^\s\n]+)/);
        if (match) photo = match[1];
      }
      if (!vector && p.medical_history.includes('FACE_EMB:')) {
        const match = p.medical_history.match(/FACE_EMB:(\[.*?\])/);
        if (match) {
          try { vector = JSON.parse(match[1]); } catch {}
        }
      }
    }

    let resolvedName = (p.full_name || p.name || '').trim();
    if (!resolvedName || isPlaceholderPatientName(resolvedName, p.status)) {
      try {
        const dossier = patientFaceStorageService.getPatientRecord(patientCode);
        const dName = dossier?.patient_profile?.full_name || (dossier?.patient_profile?.first_name ? `${dossier.patient_profile.first_name} ${dossier.patient_profile.last_name || ''}`.trim() : '');
        if (dName && !isPlaceholderPatientName(dName)) {
          resolvedName = dName;
        } else {
          const profile = faceRegistryService.getAllProfiles().find(
            (prof) => (prof.patientCode && prof.patientCode.toUpperCase() === patientCode.toUpperCase()) || String(prof.patientId) === String(p.id)
          );
          if (profile?.name && !isPlaceholderPatientName(profile.name)) {
            resolvedName = profile.name;
          } else {
            const existingLocal = get().users.find((u) => u.code && u.code.toUpperCase() === patientCode.toUpperCase());
            if (existingLocal?.name && !isPlaceholderPatientName(existingLocal.name, existingLocal.status)) {
              resolvedName = existingLocal.name;
            }
          }
        }
      } catch {}
    }
    if (!resolvedName) resolvedName = `ผู้รับบริการ (${patientCode})`;

    // Auto-heal Supabase patients table if we found a genuine name but the database has a placeholder
    if (patientCode && resolvedName && !isPlaceholderPatientName(resolvedName) && isPlaceholderPatientName(p.full_name, p.status)) {
      Promise.resolve(
        supabase.from('patients').update({ full_name: resolvedName }).eq('patient_code', patientCode)
      ).catch(() => {});
    }

    const patientUser: UserAccount = {
      id: p.id || patientCode,
      code: patientCode,
      username: `user_${patientCode.toLowerCase().replace(/[^a-z0-9]/g, '')}`,
      name: resolvedName,
      role: 'patient',
      status: isPending ? 'pending_info' : (p.status === 'suspended' ? 'suspended' : 'active'),
      pendingInfoNote: isPending ? 'บัญชีนี้สแกนหน้าแล้ว รอลงข้อมูลส่วนตัว' : undefined,
      age: Number(p.age) || 65,
      gender: normGender,
      phone: p.phone || '',
      diagnosis: cleanComplaint,
      chiefComplaint: cleanComplaint,
      patientBackground: (p.medical_history || '')
        .replace(/\[PENDING_INFO\]/g, '')
        .replace(/FACE_EMB:\[.*?\]/gs, '')
        .replace(/FACE_PHOTO:[^\s\n]+/g, '')
        .replace(/รอลงข้อมูลส่วนตัว/g, '')
        .trim(),
      treatmentOutcome: p.treatment_outcome || '',
      therapistNotes: (p.therapist_notes || '')
        .replace(/\[PENDING_INFO\]/g, '')
        .replace(/บัญชีนี้สแกนหน้าแล้ว รอลงข้อมูลส่วนตัว/g, '')
        .trim(),
      assignedTherapistName: p.profiles?.full_name || p.assigned_therapist_name || 'กภ. ธนากร วงศ์สวัสดิ์',
      assignedTherapistId: p.responsible_therapist_id || p.assigned_therapist_id || 1,
      face_image_url: photo,
      biometricVector: vector,
      face_vector: vector,
      created_at: p.created_at ? p.created_at.split('T')[0] : new Date().toISOString().split('T')[0],
      last_active: isPending ? 'รอลงข้อมูลส่วนตัว' : 'พร้อมรับบริการ',
    };

    if (photo || vector) {
      patientFaceStorageService.savePatientRecord(patientCode, {
        patient_profile: {
          id: patientUser.id,
          patient_id: patientCode,
          full_name: patientUser.name,
          age: patientUser.age,
          gender: patientUser.gender,
          status: (patientUser.status === 'suspended' || patientUser.status === 'pending_info') ? patientUser.status : 'active',
        },
        biometric_data: {
          face_vector: vector || [],
          registered_face_url: photo || '',
          enrolled_at: patientUser.created_at || new Date().toISOString(),
        },
      }, photo);
    }

    const currentUsers = get().users;
    const existsIndex = currentUsers.findIndex(
      (u) => u.code === patientUser.code || (p.id && String(u.id) === String(p.id))
    );

    let updatedUsers: UserAccount[];
    if (existsIndex >= 0) {
      updatedUsers = [...currentUsers];
      updatedUsers[existsIndex] = { ...updatedUsers[existsIndex], ...patientUser };
    } else {
      updatedUsers = [patientUser, ...currentUsers];
    }

    set({ users: updatedUsers, isSupabaseConnected: true });
    persistUsers(updatedUsers);
    console.info(`[REALTIME STORE] Upserted patient ${patientUser.name} (${patientUser.code})`);
  },

  updateUser: (id, data) => {
    const target = String(id || data.code || '').trim().toUpperCase();
    const existing = get().users.find((u) =>
      String(u.id) === target ||
      (u.code && String(u.code).trim().toUpperCase() === target) ||
      (data.code && u.code && String(u.code).trim().toUpperCase() === String(data.code).trim().toUpperCase())
    );

    const targetCode = (existing?.code || data.code || '').trim();
    const targetIdStr = existing ? String(existing.id) : target;

    const updatedUsers = get().users.map((u) => {
      const isMatch =
        String(u.id) === targetIdStr ||
        String(u.id) === target ||
        (u.code && targetCode && String(u.code).trim().toUpperCase() === targetCode.toUpperCase());
      return isMatch ? { ...u, ...data } : u;
    });
    set({ users: updatedUsers });
    persistUsers(updatedUsers);

    const updatedUser = updatedUsers.find((u) =>
      String(u.id) === targetIdStr ||
      (u.code && targetCode && String(u.code).trim().toUpperCase() === targetCode.toUpperCase())
    );

    // Sync faceRegistryService and patientFaceStorageService with the updated real name
    if (updatedUser && updatedUser.role === 'patient') {
      const code = (updatedUser.code || targetCode || '').trim();
      if (code) {
        try {
          patientFaceStorageService.savePatientRecord(code, {
            patient_profile: {
              patient_id: code,
              id: updatedUser.id,
              full_name: updatedUser.name,
              first_name: updatedUser.name.split(' ')[0] || updatedUser.name,
              last_name: updatedUser.name.split(' ').slice(1).join(' ') || '',
              age: updatedUser.age,
              gender: updatedUser.gender,
              phone: updatedUser.phone,
              status: (updatedUser.status === 'suspended' || updatedUser.status === 'pending_info') ? updatedUser.status : 'active',
            },
          }, updatedUser.face_image_url);
        } catch (storageErr) {
          console.warn('[STORE] patientFaceStorageService sync warning in updateUser:', storageErr);
        }

        try {
          const allProfiles = faceRegistryService.getAllProfiles();
          const existingProf = allProfiles.find(
            (p) => (p.patientCode && p.patientCode.toUpperCase() === code.toUpperCase()) || String(p.patientId) === String(updatedUser.id)
          );
          faceRegistryService.saveProfile({
            patientId: updatedUser.id,
            patientCode: code,
            name: updatedUser.name,
            age: updatedUser.age || 65,
            gender: updatedUser.gender || 'male',
            face_image_url: updatedUser.face_image_url || existingProf?.face_image_url,
            embeddings: existingProf?.embeddings || ((updatedUser as any).biometricVector ? [(updatedUser as any).biometricVector] : []),
            enrolledAt: existingProf?.enrolledAt || new Date().toISOString(),
          });
        } catch (regErr) {
          console.warn('[STORE] faceRegistryService sync warning in updateUser:', regErr);
        }
      }
    }

    if (updatedUser && data.status === 'active' && updatedUser.role === 'patient') {
      patientSyncService.broadcastInfoCompleted(updatedUser);
    }

    // Central Backend Database Sync
    if (updatedUser?.code || id) {
      api.updatePatient(updatedUser?.code || id, data).catch((e) => console.warn('Central DB updateUser warning:', e));
    }

    get().addActivityLog('แก้ไขข้อมูลผู้ใช้งาน', 'AUTH', `อัปเดตข้อมูลผู้ใช้งาน ID: ${id}`);

    if (supabaseService.isConfigured()) {
      if (updatedUser && updatedUser.role === 'patient') {
        // Direct clean update to Supabase public.patients
        if (targetCode) {
          Promise.resolve(
            supabase
              .from('patients')
              .update({
                full_name: updatedUser.name,
                age: updatedUser.age,
                gender: updatedUser.gender === 'female' || (updatedUser.gender as any) === 'หญิง' ? 'หญิง' : 'ชาย',
                phone: updatedUser.phone ? String(updatedUser.phone).trim() : null,
                chief_complaint: (updatedUser.chiefComplaint || '').replace(/\[PENDING_INFO\]/g, '').trim(),
                therapist_notes: (updatedUser.therapistNotes || '').replace(/\[PENDING_INFO\]/g, '').trim(),
                status: updatedUser.status === 'suspended' ? 'suspended' : 'active',
              })
              .eq('patient_code', targetCode)
          )
            .then(({ error }: any) => {
              if (error) console.warn('[SUPABASE] Direct patients update warning in updateUser:', error);
            })
            .catch(() => {});
        }

        supabaseService.updatePatient(updatedUser.code || id, {
          name: updatedUser.name,
          full_name: updatedUser.name,
          age: updatedUser.age,
          gender: updatedUser.gender,
          phone: updatedUser.phone,
          chief_complaint: (updatedUser.chiefComplaint || '').replace(/\[PENDING_INFO\]/g, '').trim(),
          therapist_notes: (updatedUser.therapistNotes || '').replace(/\[PENDING_INFO\]/g, '').trim(),
          status: updatedUser.status === 'suspended' ? 'suspended' : 'active',
          responsible_therapist_id: updatedUser.assignedTherapistId,
          face_image_url: updatedUser.face_image_url || data.face_image_url || (data as any).photo,
          photo: updatedUser.face_image_url || data.face_image_url || (data as any).photo,
          face_vector: (updatedUser as any).biometricVector || (updatedUser as any).face_vector || (data as any).biometricVector || (data as any).face_vector,
          patientBackground: updatedUser.patientBackground || data.patientBackground,
        }).catch((e) => console.warn('Supabase updatePatient in updateUser error:', e));

        try {
          const payload = {
            patient_code: updatedUser.code,
            full_name: updatedUser.name,
            name: updatedUser.name,
            age: updatedUser.age,
            gender: updatedUser.gender,
            phone: updatedUser.phone,
            status: updatedUser.status || 'active',
            isCompleted: true,
          };
          supabase.channel(PATIENTS_REALTIME_CHANNEL).send({
            type: 'broadcast',
            event: 'patient_completed',
            payload,
          }).catch(() => {});
          supabase.channel(PATIENTS_REALTIME_CHANNEL).send({
            type: 'broadcast',
            event: 'patient_update',
            payload,
          }).catch(() => {});
        } catch {}
      } else {
        supabaseService.updateProfile(id, data).catch((e) => console.warn('Supabase updateProfile error:', e));
      }
    }
  },

  deleteUser: (id) => {
    const target = String(id).trim().toUpperCase();
    const user = get().users.find((u) =>
      String(u.id) === target ||
      (u.code && String(u.code).trim().toUpperCase() === target)
    );
    const targetCode = (user?.code || '').trim().toUpperCase();
    const targetIdStr = user ? String(user.id) : target;

    const updatedUsers = get().users.filter((u) => {
      const isMatch =
        String(u.id) === targetIdStr ||
        String(u.id) === target ||
        (u.code && targetCode && String(u.code).trim().toUpperCase() === targetCode);
      return !isMatch;
    });
    set({ users: updatedUsers });
    persistUsers(updatedUsers);

    // Central Backend Database Sync
    if (user?.code || id) {
      api.deletePatient(user?.code || id).catch((e) => console.warn('Central DB deletePatient warning:', e));
    }

    // Add to persistent blacklist so it NEVER restores on page reload
    if (user) {
      addDeletedUserToBlacklist(user.id, user.code, user.username);
    } else {
      addDeletedUserToBlacklist(id);
    }

    // Permanently purge patient physical folder public/uploads/patients/{code}/ and all records
    if (user?.code) {
      patientFaceStorageService.deletePatientDirectoryAndData(user.code);
      usePatientStore.getState().deletePatient(user.code);
    }
    patientFaceStorageService.deletePatientDirectoryAndData(id);
    usePatientStore.getState().deletePatient(id);

    // Remove any associated treatment plans
    const remainingPlans = get().treatmentPlans.filter(
      (p) => p.patientId !== id && (!user?.code || p.patientCode !== user.code)
    );
    set({ treatmentPlans: remainingPlans });
    try {
      localStorage.setItem('strongcare_hospital_treatment_plans', JSON.stringify(remainingPlans));
    } catch {}
    if (supabaseService.isConfigured()) {
      supabaseService.saveTreatmentPlans(remainingPlans).catch(() => {});
    }

    // Remove from mock patients.json persistent storage
    removePatientFromPatientsJson(id, user?.code);

    get().addActivityLog('ลบผู้ใช้งาน', 'AUTH', `ลบผู้ใช้งาน ${user?.name || id} และลบโฟลเดอร์เวชระเบียนถาวร`);
    console.log(`[DELETE USER] Permanently deleted user ${user?.name || id} (${user?.code || id}), purged directory /public/uploads/patients/${user?.code || id}/ and updated patients.json`);

    if (supabaseService.isConfigured()) {
      supabaseService.deleteProfile(id).catch((e) => console.warn('Supabase deleteProfile error:', e));
      supabaseService.deletePatient(user?.code || id).catch((e) => console.error('Supabase deletePatient error:', e));
    }
  },

  toggleUserStatus: (id) => {
    let nextStatus: UserStatus = 'active';
    set((state) => ({
      users: state.users.map((u) => {
        if (u.id === id) {
          nextStatus = u.status === 'active' ? 'suspended' : 'active';
          return { ...u, status: nextStatus };
        }
        return u;
      }),
    }));
    const user = get().users.find((u) => u.id === id);
    get().addActivityLog(
      user?.status === 'active' ? 'ระงับบัญชีผู้ใช้งาน' : 'ปลดระงับบัญชีผู้ใช้งาน',
      'AUTH',
      `เปลี่ยนสถานะบัญชี ${user?.name}`
    );

    if (supabaseService.isConfigured()) {
      supabaseService.updateProfile(id, { status: nextStatus }).catch((e) => console.warn('Supabase status error:', e));
    }
  },

  resetUserPassword: (id, newPin) => {
    const finalPassword = newPin && newPin !== '1234' ? newPin : generateSecureTemporaryPassword();
    const user = get().users.find((u) => u.id === id);
    hashPassword(finalPassword).then((hashedPin) => {
      set((state) => ({
        users: state.users.map((u) =>
          u.id === id
            ? { ...u, password: hashedPin, must_change_password: true, temp_password: finalPassword }
            : u
        ),
      }));
      if (supabaseService.isConfigured()) {
        supabaseService
          .updateProfile(id, { password: hashedPin })
          .catch((e) => console.warn('Supabase password error:', e));
      }
    });
    get().addActivityLog(
      'รีเซ็ตรหัสผ่าน/PIN',
      'AUTH',
      `รีเซ็ตรหัสผ่านของผู้ใช้งาน ${user?.name || id} เป็นรหัสผ่านชั่วคราวและเข้ารหัสแบบ SHA-256 (บังคับเปลี่ยนเมื่อเข้าสู่ระบบครั้งแรก)`
    );
    return finalPassword;
  },

  changePasswordWithVerification: async (id, newPass) => {
    const validation = validatePasswordStrength(newPass);
    if (!validation.isValid) {
      throw new Error(validation.message || 'รหัสผ่านต้องมีความยาวอย่างน้อย 8 ตัวอักษร');
    }
    const hashed = await hashPassword(newPass);
    set((state) => ({
      users: state.users.map((u) =>
        u.id === id
          ? { ...u, password: hashed, must_change_password: false, temp_password: undefined }
          : u
      ),
    }));
    if (supabaseService.isConfigured()) {
      await supabaseService.updateProfile(id, { password: hashed }).catch((e) => console.warn('Supabase password error:', e));
    }
    const user = get().users.find((u) => u.id === id);
    get().addActivityLog('เปลี่ยนรหัสผ่าน', 'AUTH', `เปลี่ยนรหัสผ่านของผู้ใช้งาน ${user?.name || id} สำเร็จ`);
    return true;
  },

  changeUserRole: (id, newRole) => {
    set((state) => ({
      users: state.users.map((u) => (u.id === id ? { ...u, role: newRole } : u)),
    }));
    const user = get().users.find((u) => u.id === id);
    get().addActivityLog('เปลี่ยนสิทธิ์ผู้ใช้งาน', 'AUTH', `เปลี่ยนสิทธิ์ ${user?.name} เป็น ${newRole}`);

    if (supabaseService.isConfigured()) {
      supabaseService.updateProfile(id, { role: newRole }).catch((e) => console.warn('Supabase role error:', e));
    }
  },

  assignTherapist: (patientId, therapistId, therapistName) => {
    set((state) => ({
      users: state.users.map((u) =>
        u.id === patientId
          ? { ...u, assignedTherapistId: therapistId, assignedTherapistName: therapistName }
          : u
      ),
    }));
    const patient = get().users.find((u) => u.id === patientId);
    get().addActivityLog(
      'มอบหมายนักกายภาพบำบัด',
      'PATIENT',
      `มอบหมายคนไข้ ${patient?.name} ให้ ${therapistName} ดูแล`
    );

    if (supabaseService.isConfigured()) {
      supabaseService.updatePatient(patientId, { responsible_therapist_id: therapistId }).catch((e) => console.warn('Supabase assign error:', e));
    }
  },

  addTherapist: (therapistData) => {
    const newId = Math.max(0, ...get().therapists.map((t) => typeof t.id === 'number' ? t.id : 0)) + 1;
    const newTherapist: PhysicalTherapist = { ...therapistData, id: newId };
    
    // Deduplicate in state: if therapist with same code exists, update instead of adding duplicate card!
    set((state) => {
      const idx = state.therapists.findIndex((t) => t.code === therapistData.code);
      if (idx >= 0) {
        const copy = [...state.therapists];
        copy[idx] = { ...copy[idx], ...therapistData };
        return { therapists: copy };
      }
      return { therapists: [...state.therapists, newTherapist] };
    });
    get().addActivityLog('เพิ่มนักกายภาพบำบัด', 'THERAPIST', `เพิ่ม ${newTherapist.name}`);

    // ALSO ensure there is a UserAccount in users so it displays in Tab 1 (User Management) & can log in!
    const tNameClean = therapistData.name.trim().toLowerCase();
    const isPj = tNameClean === 'pjj' || tNameClean === 'pj' || therapistData.code === 'T-6512';
    const usernameClean = isPj
      ? 'pjj'
      : (therapistData.email && !therapistData.email.includes('example.com')
          ? therapistData.email.split('@')[0].toLowerCase()
          : (therapistData.name.toLowerCase().replace(/^(กภ\.|นาย|นางสาว|ดร\.)\s*/, '').replace(/\s+/g, '_') || therapistData.code.toLowerCase()));

    const existingUser = get().users.find((u) =>
      u.code === therapistData.code ||
      (u.role === 'therapist' && u.name.toLowerCase() === therapistData.name.toLowerCase()) ||
      u.username.toLowerCase() === usernameClean
    );

    if (!existingUser) {
      const staffUser: UserAccount = {
        id: newId,
        username: usernameClean,
        name: therapistData.name,
        role: 'therapist',
        status: therapistData.status === 'on_leave' ? 'suspended' : 'active',
        code: therapistData.code,
        phone: therapistData.phone,
        email: therapistData.email || `${usernameClean}@drtechcare.hospital`,
        password: DEFAULT_PASSWORD_HASH,
        must_change_password: false,
        created_at: new Date().toISOString().split('T')[0],
        last_active: 'เพิ่งลงทะเบียน',
      };
      const updatedUsers = [staffUser, ...get().users];
      set({ users: updatedUsers });
      persistUsers(updatedUsers);
      if (supabaseService.isConfigured()) {
        supabaseService.createProfile(staffUser).catch((e) => console.warn('Supabase createProfile in addTherapist error:', e));
      }
    }

    if (supabaseService.isConfigured()) {
      supabaseService.createTherapist(therapistData).then((created) => {
        if (created?.id) {
          set((state) => ({
            therapists: state.therapists.map((t) => (t.id === newId ? { ...t, id: created.id } : t)),
          }));
        }
      }).catch((e) => console.warn('Supabase createTherapist in addTherapist error:', e));
    }
  },

  updateTherapist: (id, data) => {
    set((state) => {
      const updatedTherapists = state.therapists.map((t) => (t.id === id ? { ...t, ...data } : t));
      const target = updatedTherapists.find((t) => t.id === id);
      let updatedUsers = state.users;
      if (target) {
        updatedUsers = state.users.map((u) => {
          const match =
            String(u.id) === String(id) ||
            (u.code && target.code && u.code.trim().toUpperCase() === target.code.trim().toUpperCase()) ||
            u.name.trim().toLowerCase() === (target.name || '').trim().toLowerCase();
          if (match) {
            return {
              ...u,
              name: data.name ?? u.name,
              phone: data.phone ?? u.phone,
              email: data.email ?? u.email,
              status: data.status === 'suspended' ? 'suspended' : 'active',
            };
          }
          return u;
        });
        persistUsers(updatedUsers);
      }
      return {
        therapists: updatedTherapists,
        users: updatedUsers,
      };
    });
    get().addActivityLog('แก้ไขข้อมูลนักกายภาพบำบัด', 'THERAPIST', `อัปเดตข้อมูลนักกายภาพ ID: ${id}`);

    if (supabaseService.isConfigured()) {
      supabaseService.updateTherapist(id, data).catch((e) => console.warn('Supabase updateTherapist error:', e));
    }
  },

  deleteTherapist: (id) => {
    set((state) => {
      const target = state.therapists.find((t) => t.id === id);
      const filteredTherapists = state.therapists.filter((t) => t.id !== id);
      let filteredUsers = state.users;
      if (target) {
        filteredUsers = state.users.filter((u) => {
          const match =
            String(u.id) === String(id) ||
            (u.code && target.code && u.code.trim().toUpperCase() === target.code.trim().toUpperCase());
          return !match;
        });
        persistUsers(filteredUsers);
      }
      return {
        therapists: filteredTherapists,
        users: filteredUsers,
      };
    });
    get().addActivityLog('ลบข้อมูลนักกายภาพบำบัด', 'THERAPIST', `ลบนักกายภาพ ID: ${id}`);
  },

  addExercise: (exerciseData) => {
    const newId = Math.max(0, ...get().exercises.map((e) => typeof e.id === 'number' ? e.id : 0)) + 1;
    const newExercise: HospitalExercise = { ...exerciseData, id: newId };
    const updated = [newExercise, ...get().exercises];
    set({ exercises: updated });
    persistExercises(updated);
    get().addActivityLog('เพิ่มท่าทางกายภาพบำบัด', 'TREATMENT', `เพิ่มท่าใหม่: ${newExercise.name} (${newExercise.englishName})`);

    if (supabaseService.isConfigured()) {
      supabaseService.createExercise(exerciseData).then((created) => {
        if (created?.id) {
          const synced = get().exercises.map((e) => (e.id === newId ? { ...e, id: created.id } : e));
          set({ exercises: synced });
          persistExercises(synced);
        }
      }).catch((e) => console.warn('Supabase createExercise error:', e));
    }

    return newExercise;
  },

  updateExercise: (id, data) => {
    const updated = get().exercises.map((e) => (e.id === id ? { ...e, ...data } : e));
    set({ exercises: updated });
    persistExercises(updated);
    const exercise = get().exercises.find((e) => e.id === id);
    get().addActivityLog('แก้ไขท่าทางกายภาพบำบัด', 'TREATMENT', `แก้ไขข้อมูลท่า: ${exercise?.name || id}`);

    if (supabaseService.isConfigured()) {
      supabaseService.updateExercise(id, data).catch((e) => console.warn('Supabase updateExercise error:', e));
    }
  },

  deleteExercise: (id) => {
    const exercise = get().exercises.find((e) => e.id === id);
    const updated = get().exercises.filter((e) => e.id !== id);
    set({ exercises: updated });
    persistExercises(updated);
    get().addActivityLog('ลบท่าทางกายภาพบำบัด', 'TREATMENT', `ลบท่า: ${exercise?.name || id}`);

    if (supabaseService.isConfigured()) {
      supabaseService.deleteExercise(id).catch((e) => console.warn('Supabase deleteExercise error:', e));
    }
  },

  addModpack: (modpackData) => {
    const newId = `modpack-${Date.now()}`;
    const newModpack: ExerciseModpack = {
      ...modpackData,
      id: newId,
      createdAt: new Date().toISOString().split('T')[0],
    };
    const updated = [newModpack, ...get().modpacks];
    set({ modpacks: updated });
    persistModpacks(updated);
    if (supabaseService.isConfigured()) {
      supabaseService.saveModpacks(updated).catch((e) => console.warn('Supabase saveModpacks error:', e));
    }
    get().addActivityLog('สร้างชุดท่าฝึกกายภาพ (Modpack)', 'TREATMENT', `สร้างชุดท่าใหม่: ${newModpack.name} (${newModpack.exercises.length} ท่า)`);
    return newModpack;
  },

  updateModpack: (id, data) => {
    const updated = get().modpacks.map((m) =>
      m.id === id ? { ...m, ...data, updatedAt: new Date().toISOString().split('T')[0] } : m
    );
    set({ modpacks: updated });
    persistModpacks(updated);
    if (supabaseService.isConfigured()) {
      supabaseService.saveModpacks(updated).catch((e) => console.warn('Supabase saveModpacks error:', e));
    }
    const mp = get().modpacks.find((m) => m.id === id);
    get().addActivityLog('แก้ไขชุดท่าฝึกกายภาพ', 'TREATMENT', `อัปเดตชุดท่า: ${mp?.name || id}`);
  },

  deleteModpack: (id) => {
    const mp = get().modpacks.find((m) => m.id === id);
    const updated = get().modpacks.filter((m) => m.id !== id);
    set({ modpacks: updated });
    persistModpacks(updated);
    if (supabaseService.isConfigured()) {
      supabaseService.saveModpacks(updated).catch((e) => console.warn('Supabase saveModpacks error:', e));
    }
    get().addActivityLog('ลบชุดท่าฝึกกายภาพ', 'TREATMENT', `ลบชุดท่า: ${mp?.name || id}`);
  },

  saveTreatmentPlan: (planData) => {
    const now = new Date().toISOString().split('T')[0];
    if (planData.id) {
      set((state) => {
        const updated = state.treatmentPlans.map((p) =>
          p.id === planData.id ? { ...p, ...planData, updatedAt: now } : p
        );
        try {
          localStorage.setItem('strongcare_hospital_treatment_plans', JSON.stringify(updated));
        } catch (e) {}
        if (supabaseService.isConfigured()) {
          supabaseService.saveTreatmentPlans(updated).catch((e) => console.warn('Supabase saveTreatmentPlans error:', e));
        }
        return { treatmentPlans: updated };
      });
      get().addActivityLog('อัปเดตแผนการรักษา', 'TREATMENT', `อัปเดตแผนการรักษาของ ${planData.patientName}`);
    } else {
      const newId = Math.max(0, ...get().treatmentPlans.map((p) => typeof p.id === 'number' ? p.id : 0)) + 1;
      const newPlan: TreatmentPlan = {
        ...planData,
        id: newId,
        createdAt: now,
      };
      set((state) => {
        const updated = [newPlan, ...state.treatmentPlans];
        try {
          localStorage.setItem('strongcare_hospital_treatment_plans', JSON.stringify(updated));
        } catch (e) {}
        if (supabaseService.isConfigured()) {
          supabaseService.saveTreatmentPlans(updated).catch((e) => console.warn('Supabase saveTreatmentPlans error:', e));
        }
        return { treatmentPlans: updated };
      });
      get().addActivityLog('สร้างแผนการรักษาใหม่', 'TREATMENT', `สร้างแผนการรักษาให้ ${planData.patientName}`);
    }
  },

  deleteTreatmentPlan: (id) => {
    set((state) => {
      const updated = state.treatmentPlans.filter((p) => p.id !== id);
      try {
        localStorage.setItem('strongcare_hospital_treatment_plans', JSON.stringify(updated));
      } catch (e) {}
      if (supabaseService.isConfigured()) {
        supabaseService.saveTreatmentPlans(updated).catch((e) => console.warn('Supabase saveTreatmentPlans error:', e));
      }
      return { treatmentPlans: updated };
    });
    get().addActivityLog('ลบแผนการรักษา', 'TREATMENT', `ลบแผนการรักษา ID: ${id}`);
  },

  deleteAppointmentForPatient: (params) => {
    const { dateStr, appointmentId, planId } = params;
    const patientId = params.patientId || params.patient?.id || params.patient?.code;
    const currentUserId = get().currentUserId;
    const currentRole = get().currentRole;
    const currentUser = get().users.find((u) => u.id === currentUserId) || {
      id: currentUserId,
      role: currentRole,
    };

    const patient = get().users.find(
      (u) =>
        (patientId && String(u.id) === String(patientId)) ||
        (patientId && u.code && String(u.code).toLowerCase() === String(patientId).toLowerCase()) ||
        (patientId && (u as any).patient_code && String((u as any).patient_code).toLowerCase() === String(patientId).toLowerCase()) ||
        (patientId && (u as any).hn && String((u as any).hn).toLowerCase() === String(patientId).toLowerCase()) ||
        (params.patient && isSamePatient(params.patient, u)) ||
        (patientId && isSamePatient({ id: patientId, code: String(patientId) }, u))
    ) || params.patient;

    if (!patient) {
      return { success: false, error: 'ไม่พบข้อมูลคนไข้ในระบบ' };
    }

    const checkAppt = {
      id: appointmentId || `apt-${planId || 'manual'}-${dateStr}`,
      date: dateStr,
      patientId: patient.id,
      status: 'scheduled',
    };

    const perm = canDeleteAppointment(
      currentUser,
      patient,
      checkAppt,
      get().delegations,
      get().symptomReports,
      dateKey()
    );

    if (!perm.allowed) {
      get().addActivityLog(
        'SECURITY_DENIED_DELETE_APPOINTMENT',
        'SYSTEM',
        `ปฏิเสธการลบนัดหมายวันที่ ${dateStr} ของคนไข้ ${patient.name}: ${perm.reason || 'ไม่มีสิทธิ์'}`
      );
      return { success: false, error: perm.reason || 'ไม่มีสิทธิ์ลบนัดหมายนี้' };
    }

    // 1. Update treatmentPlans (authoritative store)
    const patCodeClean = (patient.code || (patient as any).patient_code || patient.name || '')
      .replace(/[^a-zA-Z0-9ก-๙]/g, '')
      .toLowerCase();
    const cancelKeyApt = `${dateStr}-${patCodeClean}`;

    set((state) => {
      const updatedPlans = state.treatmentPlans.map((plan) => {
        const isTargetPlan = (planId && String(plan.id) === String(planId)) ||
          isSamePatient({ id: plan.patientId, code: plan.patientCode, name: plan.patientName }, patient);

        if (!isTargetPlan) return plan;

        let modified = false;
        let newSelectedDates = plan.selectedDates;
        let newScheduledDates = plan.scheduledDates;

        if (Array.isArray(plan.selectedDates) && plan.selectedDates.includes(dateStr)) {
          newSelectedDates = plan.selectedDates.filter((d) => d !== dateStr);
          modified = true;
        }

        if (Array.isArray(plan.scheduledDates)) {
          newScheduledDates = plan.scheduledDates.filter((d) => {
            const dStr = typeof d === 'string' ? d : d.date;
            return dStr !== dateStr;
          });
          modified = true;
        }

        if (modified) {
          return {
            ...plan,
            selectedDates: newSelectedDates,
            scheduledDates: newScheduledDates,
            updatedAt: dateKey(),
          };
        }
        return plan;
      });

      try {
        localStorage.setItem('strongcare_hospital_treatment_plans', JSON.stringify(updatedPlans));
      } catch {}

      if (supabaseService.isConfigured()) {
        supabaseService.saveTreatmentPlans(updatedPlans).catch((e) =>
          console.warn('Supabase saveTreatmentPlans error:', e)
        );
      }

      // 2. Clean strongcare_calendar_appointments in localStorage for this patient only
      try {
        const calSaved = localStorage.getItem('strongcare_calendar_appointments');
        if (calSaved) {
          const calApts = JSON.parse(calSaved);
          const dayNum = parseInt(dateStr.split('-')[2], 10);
          if (calApts[dayNum]) {
            calApts[dayNum] = calApts[dayNum].filter(
              (a: any) => !isSamePatient({ name: a.name }, patient)
            );
            if (calApts[dayNum].length === 0) delete calApts[dayNum];
            localStorage.setItem('strongcare_calendar_appointments', JSON.stringify(calApts));
          }
        }
      } catch {}

      // 3. Save patient-specific cancelled key in localStorage (never -all wildcard)
      try {
        const prevCancelled = JSON.parse(localStorage.getItem('strongcare_cancelled_appointments') || '[]');
        const updatedCancelled = Array.from(new Set([...prevCancelled, cancelKeyApt]));
        localStorage.setItem('strongcare_cancelled_appointments', JSON.stringify(updatedCancelled));
      } catch {}

      return {
        treatmentPlans: updatedPlans,
        cancelledAppointmentKeys: Array.from(new Set([...state.cancelledAppointmentKeys, cancelKeyApt])),
      };
    });

    get().addActivityLog(
      'DELETE_APPOINTMENT',
      'TREATMENT',
      `ลบวันนัดหมายวันที่ ${formatThaiDate(dateStr)} ของคนไข้ ${patient.name} (${patient.code || patient.id}) สำเร็จ`
    );

    return { success: true };
  },

  reportSymptom: (reportData) => {
    const newId = Math.max(0, ...get().symptomReports.map((r) => typeof r.id === 'number' ? r.id : 0)) + 1;
    const now = new Date().toISOString().replace('T', ' ').substring(0, 16);
    const newReport: PatientSymptomReport = {
      ...reportData,
      id: newId,
      reportedAt: now,
      status: 'pending',
    };
    set((state) => ({ symptomReports: [newReport, ...state.symptomReports] }));
    get().addActivityLog(
      'แจ้งอาการผิดปกติ',
      'PATIENT',
      `${reportData.patientName} แจ้งอาการ: ${reportData.symptomType} ระดับความปวด ${reportData.severity}/5`
    );
  },

  reviewSymptom: (id, reply) => {
    set((state) => ({
      symptomReports: state.symptomReports.map((r) =>
        r.id === id ? { ...r, status: 'reviewed', therapistReply: reply } : r
      ),
    }));
    get().addActivityLog('ตอบกลับอาการคนไข้', 'THERAPIST', `นักกายภาพตอบกลับรายงานอาการ ID: ${id}`);
  },

  addActivityLog: (action, category, details, device, ipAddress) => {
    const user = get().users.find((u) => u.id === get().currentUserId);
    const now = new Date().toISOString().replace('T', ' ').substring(0, 19);
    const newId = Math.max(0, ...get().activityLogs.map((l) => typeof l.id === 'number' ? l.id : 0)) + 1;
    const log: ActivityLog = {
      id: newId,
      timestamp: now,
      userId: get().currentUserId,
      userName: user?.name || 'ระบบส่วนกลาง',
      role: get().currentRole,
      action,
      category,
      details,
      device: device || 'Windows 11 / Chrome (Workstation)',
      ipAddress: ipAddress || '192.168.1.100',
    };
    set((state) => ({ activityLogs: [log, ...state.activityLogs].slice(0, 200) }));

    if (supabaseService.isConfigured()) {
      supabaseService.logActivity(action, details, category, get().currentRole, get().currentUserId, user?.name);
    }
  },

  kickSession: (logId) => {
    const log = get().activityLogs.find((l) => l.id === logId);
    if (!log) return;
    get().addActivityLog(
      'เตะเซสชันออกจากการเชื่อมต่อ (Kick Session)',
      'SYSTEM',
      `เตะเซสชันของ ${log.userName} (${log.device || 'ไม่ทราบอุปกรณ์'}) ที่เชื่อมต่อจาก IP ${log.ipAddress || 'N/A'}`
    );
  },

  banDevice: (device) => {
    if (!device) return;
    set((state) => ({
      bannedDevices: state.bannedDevices.includes(device) ? state.bannedDevices : [...state.bannedDevices, device],
    }));
    get().addActivityLog('แบนอุปกรณ์ (Ban Device Fingerprint)', 'SYSTEM', `แบนอุปกรณ์: ${device}`);

    if (supabaseService.isConfigured()) {
      supabaseService.banDevice(device, 'Security violation / banned by Admin');
    }
  },

  unbanDevice: (device) => {
    set((state) => ({
      bannedDevices: state.bannedDevices.filter((d) => d !== device),
    }));
    get().addActivityLog('ปลดแบนอุปกรณ์ (Unban Device)', 'SYSTEM', `ปลดแบนอุปกรณ์: ${device}`);

    if (supabaseService.isConfigured()) {
      supabaseService.unbanDevice(device);
    }
  },

  banIp: (ip) => {
    if (!ip) return;
    set((state) => ({
      bannedIps: state.bannedIps.includes(ip) ? state.bannedIps : [...state.bannedIps, ip],
    }));
    get().addActivityLog('แบนที่อยู่ IP (Ban IP Address)', 'SYSTEM', `แบนที่อยู่ IP: ${ip}`);

    if (supabaseService.isConfigured()) {
      supabaseService.banIp(ip, 'Suspicious network traffic / banned by Admin');
    }
  },

  unbanIp: (ip) => {
    set((state) => ({
      bannedIps: state.bannedIps.filter((i) => i !== ip),
    }));
    get().addActivityLog('ปลดแบนที่อยู่ IP (Unban IP Address)', 'SYSTEM', `ปลดแบน IP: ${ip}`);

    if (supabaseService.isConfigured()) {
      supabaseService.unbanIp(ip);
    }
  },

  addDelegation: (data) => {
    const newDelegation: TemporaryCaseDelegation = {
      ...data,
      id: `del-${Date.now()}`,
      status: 'active',
      createdAt: new Date().toISOString().split('T')[0],
    };
    const updated = [newDelegation, ...get().delegations];
    set({ delegations: updated });
    persistDelegations(updated);

    if (supabaseService.isConfigured()) {
      supabaseService.saveTemporaryCoverage(data).then((res) => {
        if (res.data?.id) {
          const synced = get().delegations.map((d) => d.id === newDelegation.id ? { ...d, id: res.data.id } : d);
          set({ delegations: synced });
          persistDelegations(synced);
        }
      }).catch((err) =>
        console.warn('Supabase saveTemporaryCoverage error:', err)
      );
    }

    get().addActivityLog(
      'มอบหมายเคสชั่วคราว (Case Delegation)',
      'PATIENT',
      `${data.originalTherapistName} มอบหมายเคส ${data.patientName} (${data.patientCode}) ให้ ${data.coveringTherapistName} ดูแลชั่วคราว (${data.startDate} ถึง ${data.endDate})`
    );
    return newDelegation;
  },

  revokeDelegation: (id) => {
    const delegation = get().delegations.find((d) => d.id === id);
    const updated = get().delegations.map((d) =>
      d.id === id ? { ...d, status: 'revoked' as const } : d
    );
    set({ delegations: updated });
    persistDelegations(updated);

    if (supabaseService.isConfigured()) {
      supabaseService.revokeTemporaryCoverage(id).catch((err) =>
        console.warn('Supabase revokeTemporaryCoverage error:', err)
      );
    }

    get().addActivityLog(
      'ยกเลิกการมอบหมายเคสชั่วคราว (Revoke Delegation)',
      'PATIENT',
      `ยกเลิกการมอบหมายเคส ${delegation?.patientName || id} จาก ${delegation?.coveringTherapistName || '-'}`
    );
  },

  isPatientCoveredByTherapist: (patientId, therapistId, checkDate) => {
    const today = checkDate || new Date().toISOString().split('T')[0];
    return get().delegations.some((d) => {
      if (d.status !== 'active') return false;
      const matchPatient = String(d.patientId) === String(patientId);
      const matchTherapist = String(d.coveringTherapistId) === String(therapistId);
      const inRange = today >= d.startDate && today <= d.endDate;
      return matchPatient && matchTherapist && inRange;
    });
  },

  getCoveringDelegationForPatient: (patientId) => {
    const today = new Date().toISOString().split('T')[0];
    return get().delegations.find((d) => {
      if (d.status !== 'active') return false;
      const matchPatient = String(d.patientId) === String(patientId);
      const inRange = today >= d.startDate && today <= d.endDate;
      return matchPatient && inRange;
    });
  },

  updateAiSettings: (newSettings) => {
    const updated = { ...get().aiSettings, ...newSettings };
    set({ aiSettings: updated });
    if (updated.similarityThreshold) {
      faceService.setSimilarityThreshold(updated.similarityThreshold);
    }
    get().addActivityLog('ตั้งค่าระบบและการทำงานของ AI', 'AI', 'ปรับเปลี่ยนพารามิเตอร์ระบบ AI ชีวกลศาสตร์');

    if (supabaseService.isConfigured()) {
      supabaseService.saveSystemSettings(updated);
    }
  },
}));

// Multi-Device Real-Time Sync Listener (Cross-Device via Central SSE & Local Broadcast)
if (typeof window !== 'undefined') {
  patientSyncService.subscribe((event) => {
    const rawUser = event.user || event.patient;
    if (!rawUser && event.type !== 'PATIENT_DELETED') return;

    if (event.type === 'PATIENT_DELETED') {
      const targetId = event.id;
      const targetCode = event.code;
      useHospitalStore.setState((state) => {
        const remaining = state.users.filter(
          (u) => u.id !== targetId && String(u.code).toUpperCase() !== String(targetCode).toUpperCase()
        );
        persistUsers(remaining);
        return { users: remaining };
      });
      return;
    }

    const userObj: UserAccount = {
      id: rawUser.id || Date.now(),
      code: rawUser.code || rawUser.patient_code || 'P-0000',
      username: rawUser.username || `user_${(rawUser.code || '').toLowerCase().replace(/[^a-z0-9]/g, '')}`,
      name: rawUser.name || 'ผู้รับบริการ',
      role: (rawUser.role as any) || 'patient',
      status: (rawUser.status as any) || 'active',
      age: rawUser.age || 65,
      gender: rawUser.gender || 'male',
      phone: rawUser.phone,
      diagnosis: rawUser.diagnosis || rawUser.chief_complaint || 'ตรวจประเมินกายภาพบำบัด',
      chiefComplaint: rawUser.chiefComplaint || rawUser.chief_complaint,
      assignedTherapistName: rawUser.assignedTherapistName || (rawUser as any).assigned_therapist_name || 'กภ. ธนากร วงศ์สวัสดิ์',
      assignedTherapistId: rawUser.assignedTherapistId || 1,
      face_image_url: rawUser.face_image_url,
      face_vector: rawUser.face_vector,
      pendingInfoNote: rawUser.pendingInfoNote,
      created_at: rawUser.created_at || new Date().toISOString().split('T')[0],
      last_active: rawUser.last_active || (event.type === 'ENROLLED_PENDING' ? 'สแกนหน้าแล้ว รอลงข้อมูล' : 'เพิ่งลงทะเบียน'),
    };

    if (event.type === 'INFO_COMPLETED' || event.type === 'PATIENT_UPDATED') {
      useHospitalStore.setState((state) => {
        const updated = state.users.map((u) =>
          u.id === userObj.id || u.code === userObj.code ? { ...u, ...userObj } : u
        );
        persistUsers(updated);
        return { users: updated };
      });
    } else if (event.type === 'ENROLLED_PENDING' || event.type === 'PATIENT_ENROLLED') {
      useHospitalStore.setState((state) => {
        const exists = state.users.some(
          (u) => u.id === userObj.id || u.code === userObj.code
        );
        let updatedUsers: UserAccount[];
        if (exists) {
          updatedUsers = state.users.map((u) =>
            u.id === userObj.id || u.code === userObj.code ? { ...u, ...userObj } : u
          );
        } else {
          updatedUsers = [userObj, ...state.users];
        }
        persistUsers(updatedUsers);
        return { users: updatedUsers };
      });

      useHospitalStore.getState().addActivityLog(
        'คนไข้ใหม่สแกนหน้าจาก Kiosk (เรียลไทม์)',
        'PATIENT',
        `ได้รับข้อมูลคนไข้ ${userObj.name} (${userObj.code}) ซิงค์จากสถานี Kiosk อัตโนมัติ`
      );
    }
  });
}

