import React, { useState, useMemo, useEffect, useRef } from 'react';
import {
  LogIn,
  ArrowLeft,
  Users,
  User,
  Camera,
  Stethoscope,
  Dumbbell,
  History,
  Sliders,
  LogOut,
  Search,
  Plus,
  Pencil,
  Trash2,
  KeyRound,
  Shield,
  Ban,
  CheckCircle2,
  AlertCircle,
  Eye,
  EyeOff,
  Play,
  Activity,
  ChevronRight,
  ChevronLeft,
  Menu,
  Phone,
  Mail,
  FileText,
  HeartPulse,
  X,
  Check,
  Laptop,
  Globe,
  RefreshCw,
  Lock,
  Unlock,
  Settings,
  UserCheck,
  AlertTriangle,
  Sparkles,
  ShieldAlert,
  CalendarDays,
  Clock,
  Calendar,
  LayoutGrid,
  List,
  ShieldCheck,
  Copy,
  PackagePlus,
  Server,
  Share2,
  Target,
  Gamepad2,
} from 'lucide-react';
import { useHospitalStore } from '../../store/hospitalStore';
import { validatePasswordStrength } from '../../services/authSecurityService';
import { UserAccount, UserRole, PhysicalTherapist, HospitalExercise, ActivityLog, TreatmentPlan, TemporaryCaseDelegation } from '../../types/hospital';
import { ReceptionOnboardingModal } from '../../components/Reception/ReceptionOnboardingModal';
import { AddUserModal } from '../../components/Hospital/AddUserModal';
import { EditUserModal } from '../../components/Hospital/EditUserModal';
import { ChangePasswordModal } from '../../components/Hospital/ChangePasswordModal';
import { DeleteUserModal } from '../../components/Hospital/DeleteUserModal';
import { AddExerciseModal } from '../../components/Hospital/AddExerciseModal';
import { EditExerciseModal } from '../../components/Hospital/EditExerciseModal';
import { DeleteExerciseModal } from '../../components/Hospital/DeleteExerciseModal';
import { CreateModpackModal } from '../../components/Hospital/CreateModpackModal';
import { EditPatientModal } from '../../components/Hospital/EditPatientModal';
import { EditTherapistModal } from '../../components/Hospital/EditTherapistModal';
import { ConfirmActionModal } from '../../components/Hospital/ConfirmActionModal';
import { BannedManagementModal } from '../../components/Hospital/BannedManagementModal';
import { EditTreatmentPlanModal } from '../../components/Hospital/EditTreatmentPlanModal';
import { NetworkSyncModal } from '../../components/Hospital/NetworkSyncModal';
import { PatientFaceEnrollModal } from '../../components/Hospital/PatientFaceEnrollModal';
import { patientFaceStorageService } from '../../services/patientFaceStorageService';
import { faceRegistryService } from '../../services/faceRegistryService';
import { BiometricResetModal } from '../../components/Hospital/BiometricResetModal';
import { PtAssignedPatientsModal } from '../../components/Hospital/PtAssignedPatientsModal';
import { PatientCalendarModal } from '../../components/Hospital/PatientCalendarModal';
import { DailyRoutineAssignmentModal } from '../../components/Hospital/DailyRoutineAssignmentModal';
import { SecurityControlModal } from '../../components/Hospital/SecurityControlModal';
import { TemporaryCaseDelegationModal } from '../../components/Hospital/TemporaryCaseDelegationModal';
import { EditMyProfileModal } from '../../components/Hospital/EditMyProfileModal';
import { PatientQuickInfoModal } from '../../components/Hospital/PatientQuickInfoModal';
import { CourseModeSelectionModal } from '../../components/Hospital/CourseModeSelectionModal';
import { MiniGameQuestionsManager } from '../../components/Hospital/MiniGameQuestionsManager';
import { defaultDash, formatThaiDate, formatThaiDateTime } from '../../utils/dashboardUtils';
import { supabase, PATIENTS_REALTIME_CHANNEL } from '../../lib/supabase';
import { supabaseService } from '../../services/supabaseService';

const THAI_MONTH_NAMES = [
  'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
  'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'
];

const TIMETABLE_DAYS_CONFIG = [
  { key: 'จันทร์', label: 'วันจันทร์', short: 'จ.', en: 'Monday', color: 'border-amber-300 bg-amber-50/70 text-amber-950', headerBg: 'bg-amber-100 text-amber-950 border-amber-300', dot: 'bg-amber-500' },
  { key: 'อังคาร', label: 'วันอังคาร', short: 'อ.', en: 'Tuesday', color: 'border-pink-300 bg-pink-50/70 text-pink-950', headerBg: 'bg-pink-100 text-pink-950 border-pink-300', dot: 'bg-pink-500' },
  { key: 'พุธ', label: 'วันพุธ', short: 'พ.', en: 'Wednesday', color: 'border-emerald-300 bg-emerald-50/70 text-emerald-950', headerBg: 'bg-emerald-100 text-emerald-950 border-emerald-300', dot: 'bg-emerald-500' },
  { key: 'พฤหัสบดี', label: 'วันพฤหัสบดี', short: 'พฤ.', en: 'Thursday', color: 'border-orange-300 bg-orange-50/70 text-orange-950', headerBg: 'bg-orange-100 text-orange-950 border-orange-300', dot: 'bg-orange-500' },
  { key: 'ศุกร์', label: 'วันศุกร์', short: 'ศ.', en: 'Friday', color: 'border-blue-300 bg-blue-50/70 text-blue-950', headerBg: 'bg-blue-100 text-blue-950 border-blue-300', dot: 'bg-blue-500' },
  { key: 'เสาร์', label: 'วันเสาร์', short: 'ส.', en: 'Saturday', color: 'border-purple-300 bg-purple-50/70 text-purple-950', headerBg: 'bg-purple-100 text-purple-950 border-purple-300', dot: 'bg-purple-500' },
  { key: 'อาทิตย์', label: 'วันอาทิตย์', short: 'อา.', en: 'Sunday', color: 'border-rose-300 bg-rose-50/70 text-rose-950', headerBg: 'bg-rose-100 text-rose-950 border-rose-300', dot: 'bg-rose-500' },
];

const TIMETABLE_PERIODS_CONFIG = [
  { id: 'p1', time: '08:30 - 09:30', periodNum: 1, label: 'คาบ 1 (เช้า)', isBreak: false },
  { id: 'p2', time: '09:30 - 10:30', periodNum: 2, label: 'คาบ 2 (เช้า)', isBreak: false },
  { id: 'p3', time: '10:30 - 11:30', periodNum: 3, label: 'คาบ 3 (เช้า)', isBreak: false },
  { id: 'lunch', time: '11:30 - 13:00', periodNum: 0, label: '☕ พักกลางวัน & บำรุงรักษาฆ่าเชื้อตู้ Kiosk', isBreak: true },
  { id: 'p4', time: '13:00 - 14:00', periodNum: 4, label: 'คาบ 4 (บ่าย)', isBreak: false },
  { id: 'p5', time: '14:00 - 15:00', periodNum: 5, label: 'คาบ 5 (บ่าย)', isBreak: false },
  { id: 'p6', time: '15:00 - 16:00', periodNum: 6, label: 'คาบ 6 (บ่าย)', isBreak: false },
  { id: 'p7', time: '16:00 - 17:00', periodNum: 7, label: 'คาบ 7 (เย็น)', isBreak: false },
];

interface HospitalPortalProps {
  onClose: () => void;
  onLaunchKioskExercise?: (exerciseId?: number | string) => void;
  onSelectPatientForKiosk?: (patientData: any) => void;
}

type TabKey = 'users' | 'patients' | 'schedules' | 'therapists' | 'exercises' | 'logs' | 'settings';

export const HospitalPortal: React.FC<HospitalPortalProps> = ({
  onClose,
  onLaunchKioskExercise,
  onSelectPatientForKiosk,
}) => {
  const {
    currentRole,
    setCurrentRole,
    currentUserId,
    setCurrentUserId,
    users,
    therapists,
    exercises,
    modpacks,
    treatmentPlans,
    delegations,
    addDelegation,
    revokeDelegation,
    isPatientCoveredByTherapist,
    getCoveringDelegationForPatient,
    activityLogs,
    bannedDevices,
    bannedIps,
    aiSettings,
    addUser,
    completePendingPatientInfo,
    updateUser,
    deleteUser,
    resetUserPassword,
    changePasswordWithVerification,
    addTherapist,
    updateTherapist,
    addExercise,
    updateExercise,
    deleteExercise,
    addModpack,
    deleteModpack,
    saveTreatmentPlan,
    deleteTreatmentPlan,
    kickSession,
    banDevice,
    unbanDevice,
    banIp,
    unbanIp,
    updateAiSettings,
    addActivityLog,
    loginStaff,
    logoutStaff,
    isSupabaseConnected,
    isLoadingFromDb,
    initializeFromSupabase,
    upsertPatientFromSupabase,
  } = useHospitalStore();

  // Toast notification
  const [toast, setToast] = useState<string | null>(null);
  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3500);
  };

  // Load from Supabase on mount and listen to Realtime changes
  useEffect(() => {
    // 1. Initial fetch
    initializeFromSupabase();

    // 2. Realtime listener: BOTH postgres_changes and broadcast on shared PATIENTS_REALTIME_CHANNEL
    console.info('[SUPABASE REALTIME] Subscribing to patients realtime channel in Admin Dashboard...');
    const handleIncomingPatient = (patientPayload: any) => {
      if (!patientPayload) return;
      console.info('[SUPABASE REALTIME] Incoming patient event:', patientPayload);
      upsertPatientFromSupabase(patientPayload);
      showToast(`🔔 คนไข้ใหม่: ${patientPayload.full_name || patientPayload.name || patientPayload.patient_code} (${patientPayload.patient_code})`);
      initializeFromSupabase();
    };

    const channel = supabase
      .channel(PATIENTS_REALTIME_CHANNEL)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'patients' },
        (payload) => {
          console.info('[SUPABASE REALTIME] postgres_changes INSERT on patients:', payload);
          handleIncomingPatient(payload.new);
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'patients' },
        (payload) => {
          console.info('[SUPABASE REALTIME] postgres_changes UPDATE on patients:', payload);
          handleIncomingPatient(payload.new);
        }
      )
      .on('broadcast', { event: 'patient_registered' }, (payload) => {
        console.info('[SUPABASE REALTIME] broadcast patient_registered:', payload);
        handleIncomingPatient(payload.payload);
      })
      .on('broadcast', { event: 'new_patient' }, (payload) => {
        console.info('[SUPABASE REALTIME] broadcast new_patient:', payload);
        handleIncomingPatient(payload.payload);
      })
      .on('broadcast', { event: 'patient_update' }, (payload) => {
        console.info('[SUPABASE REALTIME] broadcast patient_update:', payload);
        handleIncomingPatient(payload.payload);
      })
      .on('broadcast', { event: 'patient_login' }, (payload) => {
        console.info('[SUPABASE REALTIME] broadcast patient_login:', payload);
        const data = payload?.payload;
        if (data) {
          showToast(`👤 คนไข้เข้าใช้งานตู้ Kiosk: ${data.name || data.patient_code} (${data.patient_code}) [ความคล้ายคลึง: ${data.similarity || '-'}]`);
        }
      })
      .subscribe((status, err) => {
        if (err) {
          console.error('[SUPABASE REALTIME] Channel error:', err);
        } else {
          console.info('[SUPABASE REALTIME] Channel status:', status);
        }
      });

    // 3. Lightweight non-intrusive HEAD count checker (0 payload bytes)
    let lastKnownCount = -1;
    const countInterval = setInterval(async () => {
      try {
        const { count, error } = await supabase
          .from('patients')
          .select('*', { count: 'exact', head: true });
        if (error || count === null) return;

        const localPatientsCount = useHospitalStore.getState().users.filter((u) => u.role === 'patient').length;
        if (lastKnownCount !== -1 && count !== localPatientsCount) {
          console.info(`[REALTIME HEAD CHECK] Database count (${count}) !== local (${localPatientsCount}), updating...`);
          initializeFromSupabase();
        }
        lastKnownCount = count;
      } catch {}
    }, 4000);

    return () => {
      supabase.removeChannel(channel);
      clearInterval(countInterval);
    };
  }, [initializeFromSupabase, upsertPatientFromSupabase]);

  // Active Tab
  const [activeTab, setActiveTab] = useState<TabKey>('users');

  // Staff Authentication Barrier
  const [isStaffAuthenticated, setIsStaffAuthenticated] = useState<boolean>(false);
  const [isLoggingIn, setIsLoggingIn] = useState<boolean>(false);
  const [staffUsernameInput, setStaffUsernameInput] = useState<string>('');
  const [staffPasswordInput, setStaffPasswordInput] = useState<string>('');
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [staffAuthError, setStaffAuthError] = useState<string | null>(null);

  // Staff Rate Limit & Lockout (ผิด 5 ครั้ง -> ล็อก 60 วินาที)
  const [failedAttempts, setFailedAttempts] = useState<number>(0);
  const [lockoutUntil, setLockoutUntil] = useState<number | null>(null);
  const [lockoutSecondsLeft, setLockoutSecondsLeft] = useState<number>(0);

  // Lockout Countdown Timer
  useEffect(() => {
    if (!lockoutUntil) return;
    const interval = setInterval(() => {
      const remaining = Math.max(0, Math.ceil((lockoutUntil - Date.now()) / 1000));
      setLockoutSecondsLeft(remaining);
      if (remaining <= 0) {
        setLockoutUntil(null);
        setFailedAttempts(0);
        setStaffAuthError(null);
        clearInterval(interval);
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [lockoutUntil]);

  // Session Idle Timeout (15 นาที = 900,000 ms)
  const lastActivityRef = useRef<number>(Date.now());
  useEffect(() => {
    if (!isStaffAuthenticated) return;

    const handleUserActivity = () => {
      lastActivityRef.current = Date.now();
    };

    window.addEventListener('mousemove', handleUserActivity);
    window.addEventListener('keydown', handleUserActivity);
    window.addEventListener('click', handleUserActivity);

    const idleChecker = setInterval(() => {
      const elapsed = Date.now() - lastActivityRef.current;
      if (elapsed >= 15 * 60 * 1000) {
        handleStaffLogout();
        setStaffAuthError('🔒 เซสชันหมดอายุเนื่องจากไม่มีการใช้งานเกิน 15 นาที เพื่อความปลอดภัยของข้อมูลโรงพยาบาล');
      }
    }, 30000);

    return () => {
      window.removeEventListener('mousemove', handleUserActivity);
      window.removeEventListener('keydown', handleUserActivity);
      window.removeEventListener('click', handleUserActivity);
      clearInterval(idleChecker);
    };
  }, [isStaffAuthenticated]);

  // Staff Logout Handler
  const handleStaffLogout = () => {
    logoutStaff();
    setIsStaffAuthenticated(false);
    setStaffUsernameInput('');
    setStaffPasswordInput('');
    setStaffAuthError(null);
    showToast('ออกจากระบบบุคลากรเรียบร้อยแล้ว');
  };

  // Staff Login Submission (Checks real username + password + Rate Limit)
  const handleStaffLogin = async (e?: React.FormEvent, overrideUsername?: string, overridePassword?: string) => {
    if (e) e.preventDefault();

    if (lockoutUntil && Date.now() < lockoutUntil) {
      setStaffAuthError(`⚠️ ระบบถูกล็อกชั่วคราวเนื่องจากใส่รหัสผิดเกินกำหนด กรุณารออีก ${lockoutSecondsLeft} วินาที`);
      return;
    }

    const u = (overrideUsername !== undefined ? overrideUsername : staffUsernameInput).trim();
    const p = (overridePassword !== undefined ? overridePassword : staffPasswordInput).trim();

    if (!u) {
      setStaffAuthError('กรุณากรอก Username ประจำตัวบุคลากร');
      return;
    }
    if (!p) {
      setStaffAuthError('กรุณากรอก Password รหัสผ่าน');
      return;
    }

    setIsLoggingIn(true);
    setStaffAuthError(null);

    try {
      const result = await loginStaff(u, p);
      if (result.success && result.user) {
        if (result.user.must_change_password) {
          setMustChangePasswordUser(result.user);
          setNewMandatoryPassword('');
          setConfirmMandatoryPassword('');
          setMandatoryPasswordError(null);
          return;
        }
        setIsStaffAuthenticated(true);
        setStaffAuthError(null);
        setStaffUsernameInput('');
        setStaffPasswordInput('');
        setFailedAttempts(0);
        setLockoutUntil(null);
        lastActivityRef.current = Date.now();
        if (result.user.role === 'therapist' && (activeTab === 'logs' || activeTab === 'settings')) {
          setActiveTab('users');
        }
        showToast(`เข้าสู่ระบบสำเร็จ: ยินดีต้อนรับ ${result.user.name} (${result.user.role === 'admin' ? 'แอดมินใหญ่' : 'นักกายภาพบำบัด'})`);
      } else {
        const newFails = failedAttempts + 1;
        setFailedAttempts(newFails);
        if (newFails >= 5) {
          const lockTime = Date.now() + 60000;
          setLockoutUntil(lockTime);
          setLockoutSecondsLeft(60);
          setStaffAuthError('⚠️ ป้อนรหัสผิดครบ 5 ครั้ง! ระบบถูกล็อกชั่วคราวเพื่อความปลอดภัย กรุณารอ 60 วินาที');
        } else {
          setStaffAuthError(`${result.error || 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง'} (ใส่ผิดครั้งที่ ${newFails}/5)`);
        }
      }
    } finally {
      setIsLoggingIn(false);
    }
  };

  // Mandatory First-time Password Change State
  const [mustChangePasswordUser, setMustChangePasswordUser] = useState<UserAccount | null>(null);
  const [newMandatoryPassword, setNewMandatoryPassword] = useState<string>('');
  const [confirmMandatoryPassword, setConfirmMandatoryPassword] = useState<string>('');
  const [showNewMandatoryPassword, setShowNewMandatoryPassword] = useState<boolean>(false);
  const [showConfirmMandatoryPassword, setShowConfirmMandatoryPassword] = useState<boolean>(false);
  const [mandatoryPasswordError, setMandatoryPasswordError] = useState<string | null>(null);
  const [isSubmittingMandatoryPassword, setIsSubmittingMandatoryPassword] = useState<boolean>(false);

  const handleSubmitMandatoryPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!mustChangePasswordUser) return;

    const strength = validatePasswordStrength(newMandatoryPassword);
    if (!strength.isValid) {
      setMandatoryPasswordError(strength.message || 'รหัสผ่านต้องมีความยาวอย่างน้อย 8 ตัวอักษร');
      return;
    }
    if (newMandatoryPassword !== confirmMandatoryPassword) {
      setMandatoryPasswordError('ยืนยันรหัสผ่านใหม่ไม่ตรงกับรหัสผ่านที่ตั้ง');
      return;
    }

    setIsSubmittingMandatoryPassword(true);
    setMandatoryPasswordError(null);
    try {
      const isSuccess = await changePasswordWithVerification(
        mustChangePasswordUser.id,
        newMandatoryPassword
      );
      if (isSuccess) {
        const changedUser = mustChangePasswordUser;
        setMustChangePasswordUser(null);
        setIsStaffAuthenticated(true);
        setStaffUsernameInput('');
        setStaffPasswordInput('');
        setFailedAttempts(0);
        setLockoutUntil(null);
        lastActivityRef.current = Date.now();
        if (changedUser.role === 'therapist' && (activeTab === 'logs' || activeTab === 'settings')) {
          setActiveTab('users');
        }
        showToast(`🔒 ตั้งรหัสผ่านใหม่สำเร็จ ยินดีต้อนรับ ${changedUser.name}`);
      } else {
        setMandatoryPasswordError('ไม่สามารถเปลี่ยนรหัสผ่านได้');
      }
    } catch (err: unknown) {
      setMandatoryPasswordError(
        err instanceof Error ? err.message : 'เกิดข้อผิดพลาดในการเปลี่ยนรหัสผ่าน'
      );
    } finally {
      setIsSubmittingMandatoryPassword(false);
    }
  };

  // Helper to pre-fill credentials into form (Development only - NEVER fills plain password)
  const handleFillDemoAccount = (username: string) => {
    setStaffUsernameInput(username);
    setStaffPasswordInput('');
    setStaffAuthError(null);
  };

  // Guard against forbidden tab navigation for Physiotherapist
  useEffect(() => {
    if (currentRole === 'therapist' && (activeTab === 'logs' || activeTab === 'settings')) {
      setActiveTab('therapists');
      showToast('⛔ 403 Forbidden: สิทธิ์ไม่เพียงพอ หน้านี้สงวนสิทธิ์เฉพาะผู้อำนวยการ รพ. / Super Admin เท่านั้น');
    }
  }, [currentRole, activeTab]);

  // Current active staff info
  const currentUser = useMemo(() => {
    return users.find((u) => u.id === currentUserId) || users[0];
  }, [users, currentUserId]);

  // Current Therapist profile if in therapist mode
  const currentTherapist = useMemo(() => {
    const cur = users.find((u) => u.id === currentUserId);
    if (!cur) return therapists[0];
    return (
      therapists.find((t) => t.code === cur.code || t.name === cur.name || t.id === cur.id) ||
      therapists[0]
    );
  }, [therapists, users, currentUserId]);

  // Temporary Case Delegation Modal State & PT Profile Modal State
  const [isDelegationModalOpen, setIsDelegationModalOpen] = useState<boolean>(false);
  const [selectedDelegationPatientId, setSelectedDelegationPatientId] = useState<string | number | null>(null);
  const [isEditMyProfileModalOpen, setIsEditMyProfileModalOpen] = useState<boolean>(false);

  // My Assigned Patients under primary care
  const myAssignedPatients = useMemo(() => {
    return users.filter((u) => {
      if (u.role !== 'patient') return false;
      const isAssigned =
        u.assignedTherapistId === currentUserId ||
        (currentTherapist && (u.assignedTherapistId === currentTherapist.id || (u.assignedTherapistName && u.assignedTherapistName.includes(currentTherapist.name))));
      return isAssigned;
    });
  }, [users, currentUserId, currentTherapist]);

  // Covered Cases (Assigned to other PTs, but delegated to this PT)
  const myCoveredPatients = useMemo(() => {
    return users.filter((u) => {
      if (u.role !== 'patient') return false;
      return (
        isPatientCoveredByTherapist(u.id, currentUserId) ||
        (currentTherapist && isPatientCoveredByTherapist(u.id, currentTherapist.id))
      );
    });
  }, [users, currentUserId, currentTherapist, isPatientCoveredByTherapist, delegations]);

  // Cases this PT has delegated out to peer PTs
  const myDelegatedOutCases = useMemo(() => {
    return delegations.filter((d) => {
      if (d.status !== 'active') return false;
      return (
        d.originalTherapistId === currentUserId ||
        (currentTherapist && d.originalTherapistId === currentTherapist.id)
      );
    });
  }, [delegations, currentUserId, currentTherapist]);

  // Access Control Helpers for Schedules (Case-Based Write Access)
  const canWriteScheduleForPlan = (plan: TreatmentPlan): boolean => {
    if (currentRole === 'admin') return true;
    if (currentRole === 'therapist') {
      const isOwner =
        plan.therapistId === currentUserId ||
        (currentTherapist && (plan.therapistId === currentTherapist.id || (plan.therapistName && currentTherapist.name && plan.therapistName.includes(currentTherapist.name))));
      if (isOwner) return true;
      if (
        isPatientCoveredByTherapist(plan.patientId, currentUserId) ||
        (currentTherapist && isPatientCoveredByTherapist(plan.patientId, currentTherapist.id))
      ) {
        return true;
      }
      return false;
    }
    return false;
  };

  const canWriteScheduleForPatient = (pat: UserAccount): boolean => {
    if (currentRole === 'admin') return true;
    if (currentRole === 'therapist') {
      const isOwner =
        pat.assignedTherapistId === currentUserId ||
        (currentTherapist && (pat.assignedTherapistId === currentTherapist.id || (pat.assignedTherapistName && currentTherapist.name && pat.assignedTherapistName.includes(currentTherapist.name))));
      if (isOwner) return true;
      if (
        isPatientCoveredByTherapist(pat.id, currentUserId) ||
        (currentTherapist && isPatientCoveredByTherapist(pat.id, currentTherapist.id))
      ) {
        return true;
      }
      return false;
    }
    return false;
  };

  // Reception Onboarding Modal
  const [isReceptionOpen, setIsReceptionOpen] = useState<boolean>(false);
  const [isNetworkSyncModalOpen, setIsNetworkSyncModalOpen] = useState<boolean>(false);

  // Responsive Collapsible Sidebar state (optimizes screen space on portrait/vertical kiosks)
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState<boolean>(false);

  // =========================================================================
  // 1. STATE FOR USER MANAGEMENT (Tab 1: users)
  // =========================================================================
  const [userSearch, setUserSearch] = useState<string>('');
  const [userRoleFilter, setUserRoleFilter] = useState<'all' | 'patient' | 'therapist'>('all');
  const [revealedPasswords, setRevealedPasswords] = useState<Record<string | number, boolean>>({});
  const [userPage, setUserPage] = useState<number>(1);
  const userPageSize = 8;

  const togglePasswordVisibility = (userId: string | number) => {
    setRevealedPasswords((prev) => ({ ...prev, [userId]: !prev[userId] }));
  };

  const filteredUsers = useMemo(() => {
    return users.filter((u) => {
      const matchRole = userRoleFilter === 'all' || u.role === userRoleFilter;
      const q = userSearch.toLowerCase().trim();
      const matchQuery =
        !q ||
        u.name.toLowerCase().includes(q) ||
        u.username.toLowerCase().includes(q) ||
        u.code.toLowerCase().includes(q) ||
        (u.phone && u.phone.includes(q)) ||
        (u.assignedTherapistName && u.assignedTherapistName.toLowerCase().includes(q));
      return matchRole && matchQuery;
    });
  }, [users, userRoleFilter, userSearch]);

  const totalUserPages = Math.max(1, Math.ceil(filteredUsers.length / userPageSize));
  const paginatedUsers = useMemo(() => {
    const start = (userPage - 1) * userPageSize;
    return filteredUsers.slice(start, start + userPageSize);
  }, [filteredUsers, userPage, userPageSize]);

  // Add User Modal State
  const [isAddUserModalOpen, setIsAddUserModalOpen] = useState<boolean>(false);

  const handleAddUser = async (
    userData: Omit<UserAccount, 'id' | 'created_at'>,
    therapistExtra?: Omit<PhysicalTherapist, 'id'>
  ) => {
    const createdUser = addUser(userData);
    if (therapistExtra) {
      addTherapist(therapistExtra);
    }

    const code = createdUser.code || userData.code || `P-${Math.floor(1000 + Math.random() * 9000)}`;
    const resolvedVector: number[] | undefined = Array.isArray(userData.face_vector)
      ? (userData.face_vector as number[])
      : typeof userData.face_vector === 'string'
      ? patientFaceStorageService.parseVector(userData.face_vector) || undefined
      : undefined;

    if (userData.role === 'patient') {
      patientFaceStorageService.savePatientRecord(code, {
        patient_profile: {
          patient_id: code,
          id: createdUser.id,
          full_name: userData.name.trim(),
          first_name: userData.name.trim().split(' ')[0] || userData.name.trim(),
          last_name: userData.name.trim().split(' ').slice(1).join(' ') || '',
          age: Number(userData.age) || 65,
          gender: userData.gender || 'male',
          contact: userData.phone?.trim(),
          phone: userData.phone?.trim(),
          status: 'active',
        },
        biometric_data: resolvedVector ? {
          face_vector: resolvedVector,
          registered_face_url: userData.face_image_url || '',
          enrolled_at: new Date().toISOString(),
          model_version: 'face-resnet34-v2',
        } : undefined,
        medical_records: {
          diagnosis: userData.chiefComplaint || 'ข้อไหล่ติดระยะฟื้นฟู (Frozen Shoulder)',
          chief_complaint: userData.chiefComplaint,
          treatment_plan: userData.patientBackground,
        },
      }, userData.face_image_url);

      if (resolvedVector) {
        faceRegistryService.saveProfile({
          patientId: createdUser.id,
          patientCode: code,
          name: userData.name.trim(),
          age: Number(userData.age) || 65,
          gender: userData.gender,
          embeddings: [resolvedVector],
          face_image_url: userData.face_image_url,
          enrolledAt: new Date().toISOString(),
        });
      }

      try {
        await supabaseService.createProfile({
          username: userData.username,
          name: userData.name.trim(),
          role: 'patient',
          phone: userData.phone?.trim() || undefined,
          email: userData.email?.trim() || undefined,
          status: userData.status || 'active',
        });

        await supabaseService.createPatient({
          patient_code: code,
          full_name: userData.name.trim(),
          age: Number(userData.age) || 65,
          gender: userData.gender || 'male',
          phone: userData.phone?.trim() || null,
          pin: userData.password || '1234',
          pin_hash: userData.password || '1234',
          chief_complaint: userData.chiefComplaint || 'ข้อไหล่ติดระยะฟื้นฟู (Frozen Shoulder)',
          medical_history: userData.patientBackground || 'ลงทะเบียนผู้ป่วยใหม่ผ่านระบบแอดมิน (10-Snap Biometric)',
          treatment_outcome: userData.treatmentOutcome || '',
          therapist_notes: userData.therapistNotes || '',
          responsible_therapist_id: userData.assignedTherapistId || null,
          status: userData.status || 'active',
          embeddings: resolvedVector,
          photo: userData.face_image_url || null,
        });

        // Trigger store re-initialization from Supabase to keep all tables synchronized
        initializeFromSupabase();
      } catch (sbErr) {
        console.warn('[SUPABASE] handleAddUser sync error:', sbErr);
      }
    } else if (userData.role === 'therapist') {
      if (therapistExtra) {
        try {
          await supabaseService.createTherapist({
            code,
            name: userData.name.trim(),
            phone: userData.phone?.trim(),
            email: userData.email?.trim(),
            specialty: therapistExtra.specialty,
            licenseNumber: therapistExtra.licenseNumber,
            bio: therapistExtra.bio,
            status: 'active',
          });
          initializeFromSupabase();
        } catch (tErr) {
          console.warn('[SUPABASE] handleAddUser therapist error:', tErr);
        }
      }
    } else if (userData.face_vector) {
      // Save face biometrics for therapist/staff as well if enrolled
      faceRegistryService.saveProfile({
        patientId: createdUser.id,
        patientCode: code,
        name: userData.name.trim(),
        embeddings: Array.isArray(userData.face_vector) && Array.isArray((userData.face_vector as any)[0])
          ? (userData.face_vector as any)
          : [userData.face_vector as number[]],
        face_image_url: userData.face_image_url,
        enrolledAt: new Date().toISOString(),
      });
    }
  };

  // Edit User Modal State
  const [editingUser, setEditingUser] = useState<UserAccount | null>(null);

  const handleEditUser = (
    userId: number | string,
    updatedData: Partial<UserAccount>,
    therapistExtra?: Partial<PhysicalTherapist>
  ) => {
    updateUser(userId, updatedData);
    if (therapistExtra) {
      const existingTherapist = therapists.find((t) => t.id === userId);
      if (existingTherapist) {
        updateTherapist(userId, therapistExtra);
      } else {
        addTherapist({
          code: updatedData.code || `T-${Math.floor(100 + Math.random() * 900)}`,
          name: updatedData.name || 'นักกายภาพ',
          specialty:
            therapistExtra.specialty ||
            'กายภาพบำบัดระบบกระดูกและกล้ามเนื้อ (Orthopedic PT)',
          phone: updatedData.phone || '08x-xxx-xxxx',
          email: updatedData.email || 'pt@drtechcare.hospital',
          licenseNumber: therapistExtra.licenseNumber || 'กภ. 8920',
          activePatientsCount: 0,
          assignedCases: [],
          bio: therapistExtra.bio || '',
          status: 'active',
        });
      }
    }
  };

  // Check if current user can edit target user
  const canEditUser = (targetUser: UserAccount): boolean => {
    if (currentRole === 'admin') return true;
    if (currentRole === 'therapist') {
      // Physiotherapist has active edit rights on all patients
      return targetUser.role === 'patient';
    }
    return false;
  };

  // Edit Password / PIN Modal State
  const [editingPasswordUser, setEditingPasswordUser] = useState<UserAccount | null>(null);

  // Temporary Password Reset Result Modal State (Shows once with copy button)
  const [resetResult, setResetResult] = useState<{
    user: UserAccount;
    tempPass: string;
  } | null>(null);
  const [copiedResetPass, setCopiedResetPass] = useState<boolean>(false);

  const handleResetUserPassword = async (targetUser: UserAccount) => {
    if (
      !confirm(
        `คุณต้องการรีเซ็ตรหัสผ่านสำหรับ "${targetUser.name}" (${targetUser.username}) ใช่หรือไม่?\n\nระบบจะสร้างรหัสผ่านชั่วคราวใหม่ความยาว 11 ตัวอักษร และบังคับให้ผู้ใช้งานเปลี่ยนรหัสผ่านทันทีเมื่อเข้าสู่ระบบครั้งแรก`
      )
    ) {
      return;
    }
    const tempPassword = await resetUserPassword(targetUser.id);
    setResetResult({
      user: targetUser,
      tempPass: tempPassword,
    });
    setCopiedResetPass(false);
    showToast(`รีเซ็ตรหัสผ่านสำหรับ ${targetUser.name} เรียบร้อยแล้ว`);
  };

  // Delete User Confirmation Modal State
  const [deletingUser, setDeletingUser] = useState<UserAccount | null>(null);

  // Check if current user can delete target user
  const canDeleteUser = (targetUser: UserAccount): boolean => {
    if (currentRole === 'admin') return true;
    if (currentRole === 'therapist') {
      // Physiotherapist has active delete rights on patient accounts
      return targetUser.role === 'patient';
    }
    return false;
  };

  // =========================================================================
  // 2. STATE FOR PATIENT DATA (Tab 2: patients)
  // =========================================================================
  const [patientSearch, setPatientSearch] = useState<string>('');
  const [patientCareFilter, setPatientCareFilter] = useState<'all' | 'assigned'>('all');
  const [patientDetailModal, setPatientDetailModal] = useState<UserAccount | null>(null);
  const [enrollingFacePatient, setEnrollingFacePatient] = useState<UserAccount | null>(null);

  // Module 1 Modal C: Biometric Reset Modal State
  const [biometricResetUser, setBiometricResetUser] = useState<UserAccount | null>(null);

  // Module 3 Modals: Patient Calendar & Daily Routine Assignment
  const [calendarPatientModal, setCalendarPatientModal] = useState<UserAccount | null>(null);
  const [dailyRoutineDate, setDailyRoutineDate] = useState<{
    isOpen: boolean;
    patient: UserAccount | null;
    date: string;
  }>({ isOpen: false, patient: null, date: '' });

  // Module 4 Modal B: PT Assigned Patients Management
  const [ptAssignedModalTherapist, setPtAssignedModalTherapist] = useState<PhysicalTherapist | null>(null);

  // Module 6 Modal: Security Control Modal
  const [securityControlTarget, setSecurityControlTarget] = useState<ActivityLog | null>(null);

  // Module 3: Auto-Reschedule Cron / Trigger for Missed Sessions
  const checkAndAutoRescheduleMissedSessions = () => {
    const todayStr = new Date().toISOString().split('T')[0];
    const plans = useHospitalStore.getState().treatmentPlans;
    plans.forEach((plan) => {
      if (plan.scheduledDates && Array.isArray(plan.scheduledDates)) {
        let changed = false;
        const updatedDates = plan.scheduledDates.map((item: any) => {
          if (typeof item === 'string') {
            if (item < todayStr) {
              changed = true;
              return { date: todayStr, status: 'missed_rescheduled' };
            }
            return item;
          } else if (item && typeof item === 'object') {
            if (item.date < todayStr && item.status === 'scheduled') {
              changed = true;
              return { ...item, date: todayStr, status: 'missed_rescheduled' };
            }
          }
          return item;
        });

        if (changed) {
          const { id, createdAt, ...restPlan } = plan;
          saveTreatmentPlan({ ...restPlan, id, scheduledDates: updatedDates });
          addActivityLog(
            '[Auto-Reschedule Trigger]',
            'SYSTEM',
            `ตรวจพบการขาดนัดรักษาของคนไข้ ${plan.patientName || plan.patientId}. เลื่อนนัดหมายและยกยอดรูทีนกายภาพมายัง ${todayStr} อัตโนมัติ`,
            'Kiosk Auto-Scheduler Cron',
            '127.0.0.1 (Kiosk Auto-Trigger)'
          );
        }
      }
    });
  };

  useEffect(() => {
    checkAndAutoRescheduleMissedSessions();
    const interval = setInterval(checkAndAutoRescheduleMissedSessions, 60000);
    return () => clearInterval(interval);
  }, []);

  const filteredPatients = useMemo(() => {
    return users
      .filter((u) => {
        if (u.role !== 'patient') return false;
        if (currentRole === 'therapist' && patientCareFilter === 'assigned') {
          const isAssigned = canEditUser(u);
          if (!isAssigned) return false;
        }
        const q = patientSearch.toLowerCase().trim();
        return (
          !q ||
          u.name.toLowerCase().includes(q) ||
          u.code.toLowerCase().includes(q) ||
          (u.phone && u.phone.includes(q)) ||
          (u.diagnosis && u.diagnosis.toLowerCase().includes(q)) ||
          (u.assignedTherapistName && u.assignedTherapistName.toLowerCase().includes(q)) ||
          (u.chiefComplaint && u.chiefComplaint.toLowerCase().includes(q)) ||
          (u.pendingInfoNote && u.pendingInfoNote.toLowerCase().includes(q))
        );
      })
      .sort((a, b) => {
        // บัญชีที่เพิ่งสแกนหน้าและรอลงข้อมูลส่วนตัว ให้ขึ้นมาบนสุดเสมอ
        if (a.status === 'pending_info' && b.status !== 'pending_info') return -1;
        if (a.status !== 'pending_info' && b.status === 'pending_info') return 1;
        return 0;
      });
  }, [users, patientSearch, currentRole, patientCareFilter, canEditUser]);

  // =========================================================================
  // 3. STATE FOR THERAPY SCHEDULES (Tab 3: schedules - Admin & Therapist)
  // =========================================================================
  const [isTreatmentPlanModalOpen, setIsTreatmentPlanModalOpen] = useState<boolean>(false);
  const [selectedPlanForEdit, setSelectedPlanForEdit] = useState<TreatmentPlan | null>(null);
  const [deletingPlan, setDeletingPlan] = useState<TreatmentPlan | null>(null);
  const [planSearch, setPlanSearch] = useState<string>('');
  const [planStatusFilter, setPlanStatusFilter] = useState<'all' | 'active' | 'paused' | 'completed'>('all');
  const [planCareFilter, setPlanCareFilter] = useState<'my_patients' | 'covered_cases' | 'all'>('my_patients');

  // Timetable scheduling states (ตารางเรียนกายภาพ) & Approval Gate (P2-10)
  const [scheduleViewMode, setScheduleViewMode] = useState<'individual' | 'combined'>('individual');
  const [scheduleSelectedMonth, setScheduleSelectedMonth] = useState<number>(9); // 0-indexed, 9 = ตุลาคม (October)
  const [scheduleSelectedYear, setScheduleSelectedYear] = useState<number>(2026);
  const [scheduleDayFilter, setScheduleDayFilter] = useState<string>('all');

  // Interactive Calendar & Quick Info Modal States (Image 1, 2, 3 UX/UI)
  const [selectedCalendarPatient, setSelectedCalendarPatient] = useState<any>(null);
  const [selectedCalendarDay, setSelectedCalendarDay] = useState<number>(16);
  const [isPatientPickerModalOpen, setIsPatientPickerModalOpen] = useState<boolean>(false);
  const [patientPickerSearch, setPatientPickerSearch] = useState<string>('');
  const [isQuickInfoModalOpen, setIsQuickInfoModalOpen] = useState<boolean>(false);
  const [quickInfoPatient, setQuickInfoPatient] = useState<any>(null);
  const [quickInfoPlan, setQuickInfoPlan] = useState<TreatmentPlan | null>(null);
  const [quickInfoSelectedDay, setQuickInfoSelectedDay] = useState<number | null>(null);
  const [isCourseModeModalOpen, setIsCourseModeModalOpen] = useState<boolean>(false);
  const [selectedDateForCourse, setSelectedDateForCourse] = useState<string>('2026-10-16');

  // Dynamic Calendar Appointments (strictly for real active patients in the system)
  const [calendarAppointments, setCalendarAppointments] = useState<Record<number, Array<{ time: string; name: string; type: 'green' | 'cyan' | 'purple' | 'dual' }>>>(() => {
    try {
      const raw = localStorage.getItem('strongcare_calendar_appointments');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') {
          return parsed;
        }
      }
    } catch {}
    return {};
  });

  // Automatically prune calendar appointments for deleted or non-existent patients
  useEffect(() => {
    const validPatientNames = new Set(
      users
        .filter((u) => u.role === 'patient')
        .flatMap((u) => [
          (u.name || '').toLowerCase().replace(/^(นาย|นาง|นางสาว|เด็กชาย|เด็กหญิง)\s*/, '').trim(),
          (u.username || '').toLowerCase(),
          (u.code || '').toLowerCase(),
        ])
        .filter(Boolean)
    );

    setCalendarAppointments((prev) => {
      let changed = false;
      const updated: Record<number, any[]> = {};
      Object.keys(prev).forEach((k) => {
        const num = Number(k);
        const validApts = (prev[num] || []).filter((apt: any) => {
          const aptName = (apt.name || '').toLowerCase().replace(/^(นาย|นาง|นางสาว|เด็กชาย|เด็กหญิง)\s*/, '').trim();
          return Array.from(validPatientNames).some(
            (pName) => pName === aptName || pName.includes(aptName) || aptName.includes(pName)
          );
        });
        if (validApts.length !== (prev[num] || []).length) {
          changed = true;
        }
        if (validApts.length > 0) {
          updated[num] = validApts;
        }
      });
      if (changed) {
        try {
          localStorage.setItem('strongcare_calendar_appointments', JSON.stringify(updated));
        } catch {}
        return updated;
      }
      return prev;
    });
  }, [users]);

  // Sync calendar appointments to localStorage whenever they change
  useEffect(() => {
    try {
      localStorage.setItem('strongcare_calendar_appointments', JSON.stringify(calendarAppointments));
    } catch {}
  }, [calendarAppointments]);

  // Handler: Delete single appointment on a specific date
  const handleDeleteAppointment = (day: number, aptIndex: number, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const targetApt = calendarAppointments[day]?.[aptIndex];
    if (!targetApt) return;

    if (!window.confirm(`ยืนยันการลบนัดหมาย "${targetApt.time} ${targetApt.name}" ในวันที่ ${day} ${THAI_MONTH_NAMES[scheduleSelectedMonth]} ใช่หรือไม่?`)) {
      return;
    }

    setCalendarAppointments((prev) => {
      const next = { ...prev };
      if (next[day]) {
        const updatedList = next[day].filter((_, idx) => idx !== aptIndex);
        if (updatedList.length === 0) {
          delete next[day];
        } else {
          next[day] = updatedList;
        }
      }
      try {
        localStorage.setItem('strongcare_calendar_appointments', JSON.stringify(next));
      } catch {}
      return next;
    });

    addActivityLog(
      'CANCEL_APPOINTMENT',
      'TREATMENT',
      `ลบนัดหมายวันที่ ${day} ${THAI_MONTH_NAMES[scheduleSelectedMonth]} ของคนไข้ ${targetApt.name} (${targetApt.time})`
    );
    showToast(`🗑️ ลบนัดหมายของ ${targetApt.name} วันที่ ${day} เรียบร้อยแล้ว`);
  };

  // Handler: Delete all appointments on a specific day (ลบวันนัด)
  const handleDeleteDayAppointments = (day: number, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const dayApts = calendarAppointments[day] || [];
    if (dayApts.length === 0) {
      showToast(`วันที่ ${day} ยังไม่มีรายการนัดหมาย`);
      return;
    }

    const names = dayApts.map((a) => a.name).join(', ');
    if (!window.confirm(`ยืนยันการลบวันนัดหมายในวันที่ ${day} ${THAI_MONTH_NAMES[scheduleSelectedMonth]} (${names}) ใช่หรือไม่?`)) {
      return;
    }

    setCalendarAppointments((prev) => {
      const next = { ...prev };
      delete next[day];
      try {
        localStorage.setItem('strongcare_calendar_appointments', JSON.stringify(next));
      } catch {}
      return next;
    });

    addActivityLog(
      'CANCEL_APPOINTMENT_DATE',
      'TREATMENT',
      `ลบวันนัดหมายวันที่ ${day} ${THAI_MONTH_NAMES[scheduleSelectedMonth]} (${names}) ทั้งหมด`
    );
    showToast(`🗑️ ลบวันนัดหมายวันที่ ${day} เรียบร้อยแล้ว`);
  };

  // Default selected calendar patient to first available real patient
  useEffect(() => {
    if (!selectedCalendarPatient && users.length > 0) {
      const firstPat = users.find((u) => u.role === 'patient');
      if (firstPat) {
        setSelectedCalendarPatient(firstPat);
      }
    }
  }, [users, selectedCalendarPatient]);

  // AI Clinical Approval Gate States (Human-in-the-Loop Protocol)
  interface AiRecommendationProposal {
    id: number | string;
    patientId: number | string;
    patientName: string;
    patientCode: string;
    proposedAdjustment: string;
    clinicalRationale: string;
    status: 'PENDING_CLINICAL_APPROVAL' | 'APPROVED' | 'REJECTED';
    createdAt: string;
    therapistNotes?: string;
  }

  const [aiProposals, setAiProposals] = useState<AiRecommendationProposal[]>([
    {
      id: 101,
      patientId: 12,
      patientName: 'นายสมชาย ใจดี',
      patientCode: 'P-0012',
      proposedAdjustment: 'ปรับเพิ่มเวลาค้างท่าเป็น 25 วินาที (+5s) พร้อมท่ายืดอกเปิดไหล่',
      clinicalRationale: 'คะแนนความแม่นยำเฉลี่ย 88% ติดต่อกัน 3 ครั้ง • ไม่มี Safety Violations • ROM ข้อไหล่เพิ่มขึ้น 12°',
      status: 'PENDING_CLINICAL_APPROVAL',
      createdAt: new Date(Date.now() - 3600000).toISOString(),
    },
    {
      id: 102,
      patientId: 13,
      patientName: 'นางเพ็ญศรี สุขเกษม',
      patientCode: 'P-0013',
      proposedAdjustment: 'คงเวลาค้างท่า 15 วินาที และเน้นการทรงตัวพร้อมเก้าอี้พยุง',
      clinicalRationale: 'ตรวจพบ compensation ลำตัวเอียง 12° ระหว่างทำท่ายกเข่าสลับ',
      status: 'PENDING_CLINICAL_APPROVAL',
      createdAt: new Date(Date.now() - 7200000).toISOString(),
    },
  ]);

  // Load pending approvals from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem('strongcare_pending_approvals');
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setAiProposals((prev) => {
            const combined = [...parsed, ...prev.filter((p) => !parsed.some((x: any) => x.id === p.id))];
            return combined;
          });
        }
      }
    } catch {}
  }, []);

  const handleApproveProposal = (proposal: AiRecommendationProposal) => {
    setAiProposals((prev) =>
      prev.map((p) => (p.id === proposal.id ? { ...p, status: 'APPROVED' } : p))
    );
    const targetPlan = treatmentPlans.find(
      (tp) => String(tp.patientId) === String(proposal.patientId) || tp.patientCode === proposal.patientCode
    );
    if (targetPlan) {
      saveTreatmentPlan({
        ...targetPlan,
        clinicalNotes: `${targetPlan.clinicalNotes} [อนุมัติ AI: ${proposal.proposedAdjustment} โดย ${currentUser?.name || 'นักกายภาพ'}]`,
      });
    }
    addActivityLog(
      'APPROVE_AI_RECOMMENDATION',
      'AI',
      `อนุมัติข้อเสนอแนะ AI สำหรับคนไข้ ${proposal.patientName} (${proposal.patientCode}): ${proposal.proposedAdjustment}`
    );
    showToast(`✅ อนุมัติข้อเสนอแนะ AI สำหรับ ${proposal.patientName} สำเร็จ`);
  };

  const handleRejectProposal = (proposal: AiRecommendationProposal) => {
    setAiProposals((prev) =>
      prev.map((p) => (p.id === proposal.id ? { ...p, status: 'REJECTED' } : p))
    );
    addActivityLog(
      'REJECT_AI_RECOMMENDATION',
      'AI',
      `ปฏิเสธข้อเสนอแนะ AI สำหรับคนไข้ ${proposal.patientName} (${proposal.patientCode})`
    );
    showToast(`❌ ปฏิเสธข้อเสนอแนะ AI สำหรับ ${proposal.patientName} (คงแผนเดิม)`);
  };

  const handleAdjustProposal = (proposal: AiRecommendationProposal) => {
    const customAdjustment = prompt('กรุณาระบุการปรับแก้แผนการรักษาทางคลินิก:', proposal.proposedAdjustment);
    if (!customAdjustment) return;

    setAiProposals((prev) =>
      prev.map((p) =>
        p.id === proposal.id
          ? { ...p, proposedAdjustment: customAdjustment, status: 'APPROVED', therapistNotes: 'ปรับแก้โดยนักกายภาพ' }
          : p
      )
    );
    const targetPlan = treatmentPlans.find(
      (tp) => String(tp.patientId) === String(proposal.patientId) || tp.patientCode === proposal.patientCode
    );
    if (targetPlan) {
      saveTreatmentPlan({
        ...targetPlan,
        clinicalNotes: `${targetPlan.clinicalNotes} [ปรับแก้โดยนักกายภาพ: ${customAdjustment}]`,
      });
    }
    addActivityLog(
      'ADJUST_AI_RECOMMENDATION',
      'AI',
      `ปรับแก้และอนุมัติข้อเสนอแนะสำหรับคนไข้ ${proposal.patientName}: ${customAdjustment}`
    );
    showToast(`✏️ บันทึกการปรับแก้และอนุมัติแผนสำหรับ ${proposal.patientName} สำเร็จ`);
  };

  const filteredTreatmentPlans = useMemo(() => {
    return treatmentPlans.filter((plan) => {
      // PT Care filter
      if (currentRole === 'therapist') {
        if (planCareFilter === 'my_patients') {
          const isMyPlan =
            plan.therapistId === currentUserId ||
            (currentTherapist && (plan.therapistId === currentTherapist.id || (plan.therapistName && currentTherapist.name && plan.therapistName.includes(currentTherapist.name)))) ||
            (currentUser?.name &&
              plan.therapistName.includes(currentUser.name.replace(/^(กภ\.|นาย|นางสาว|ดร\.)\s*/, '')));
          if (!isMyPlan) return false;
        } else if (planCareFilter === 'covered_cases') {
          const isCovered =
            isPatientCoveredByTherapist(plan.patientId, currentUserId) ||
            (currentTherapist && isPatientCoveredByTherapist(plan.patientId, currentTherapist.id));
          if (!isCovered) return false;
        }
      }

      // Status filter
      if (planStatusFilter !== 'all' && plan.status !== planStatusFilter) {
        return false;
      }

      // Day filter
      if (scheduleDayFilter !== 'all') {
        const days = plan.scheduleDays || [];
        if (!days.includes(scheduleDayFilter)) return false;
      }

      // Text search
      const q = planSearch.toLowerCase().trim();
      if (!q) return true;

      const matchPatient =
        plan.patientName.toLowerCase().includes(q) || plan.patientCode.toLowerCase().includes(q);
      const matchTherapist = plan.therapistName.toLowerCase().includes(q);
      const matchDiagnosis =
        plan.diagnosis.toLowerCase().includes(q) || plan.targetJoint.toLowerCase().includes(q);
      const matchExercise = plan.assignedExercises.some(
        (e) =>
          e.exerciseName.toLowerCase().includes(q) || e.exerciseSlug.toLowerCase().includes(q)
      );
      const matchSchedule =
        (plan.scheduleDays && plan.scheduleDays.some((d) => d.includes(q))) ||
        (plan.timeSlot && plan.timeSlot.toLowerCase().includes(q)) ||
        (plan.roomStation && plan.roomStation.toLowerCase().includes(q));

      return matchPatient || matchTherapist || matchDiagnosis || matchExercise || matchSchedule;
    });
  }, [treatmentPlans, currentRole, planCareFilter, planStatusFilter, planSearch, scheduleDayFilter, currentUserId, currentUser, currentTherapist, isPatientCoveredByTherapist, delegations]);

  // =========================================================================
  // 4. STATE FOR PHYSIOTHERAPIST DATA (Tab 4: therapists)
  // =========================================================================
  const [therapistSearch, setTherapistSearch] = useState<string>('');
  const [editingTherapist, setEditingTherapist] = useState<PhysicalTherapist | null>(null);
  const [isAddTherapistOpen, setIsAddTherapistOpen] = useState<boolean>(false);
  const [newTherapistForm, setNewTherapistForm] = useState<{
    name: string;
    username: string;
    password: string;
    specialty: string;
    phone: string;
    email: string;
    licenseNumber: string;
    bio: string;
    status: 'active' | 'on_leave';
  }>({
    name: '',
    username: '',
    password: '1234',
    specialty: 'กายภาพบำบัดระบบกระดูกและกล้ามเนื้อ (Orthopedics)',
    phone: '',
    email: '',
    licenseNumber: 'กภ. 8920',
    bio: '',
    status: 'active',
  });

  const filteredTherapists = useMemo(() => {
    // Deduplicate therapists by code and clean name to avoid duplicate cards
    const seen = new Set<string>();
    const deduped: PhysicalTherapist[] = [];
    for (const t of therapists) {
      const key = `${String(t.code || '').trim().toUpperCase()}_${(t.name || '').trim().toLowerCase()}`;
      if (!seen.has(key)) {
        seen.add(key);
        deduped.push(t);
      }
    }
    return deduped.filter((t) => {
      const q = therapistSearch.toLowerCase().trim();
      return (
        !q ||
        t.name.toLowerCase().includes(q) ||
        t.code.toLowerCase().includes(q) ||
        t.specialty.toLowerCase().includes(q) ||
        t.phone.includes(q) ||
        (t.bio && t.bio.toLowerCase().includes(q))
      );
    });
  }, [therapists, therapistSearch]);

  // Check if current user can edit target therapist
  const canEditTherapist = (t: PhysicalTherapist): boolean => {
    if (currentRole === 'admin') return true;
    if (currentRole === 'therapist') {
      // PT can edit ONLY their own account data
      const currentNameClean = (currentUser?.name || currentTherapist?.name || '')
        .replace(/^(กภ\.|นาย|นางสาว|ดร\.)\s*/, '')
        .trim();
      const therapistNameClean = (t.name || '')
        .replace(/^(กภ\.|นาย|นางสาว|ดร\.)\s*/, '')
        .trim();
      return (
        t.id === currentUserId ||
        (Boolean(currentTherapist) && t.id === currentTherapist.id) ||
        (Boolean(currentNameClean) &&
          Boolean(therapistNameClean) &&
          (therapistNameClean.includes(currentNameClean) || currentNameClean.includes(therapistNameClean)))
      );
    }
    return false;
  };

  const handleAddTherapistSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTherapistForm.name.trim()) {
      showToast('กรุณากรอกชื่อนักกายภาพบำบัด');
      return;
    }
    const randCode = `T-${Math.floor(1000 + Math.random() * 9000)}`;
    const usernameClean = (
      newTherapistForm.username.trim() ||
      newTherapistForm.name.trim().toLowerCase().replace(/^(กภ\.|นาย|นางสาว|ดร\.)\s*/, '').replace(/\s+/g, '_') ||
      randCode.toLowerCase()
    ).toLowerCase();
    const pass = newTherapistForm.password.trim() || '1234';

    // 1. Add to therapists directory
    addTherapist({
      code: randCode,
      name: newTherapistForm.name.trim(),
      specialty: newTherapistForm.specialty,
      phone: newTherapistForm.phone || '08x-xxx-xxxx',
      email: newTherapistForm.email || `${usernameClean}@drtechcare.hospital`,
      licenseNumber: newTherapistForm.licenseNumber || 'กภ. 9999',
      activePatientsCount: 0,
      assignedCases: [],
      bio: newTherapistForm.bio || 'นักกายภาพบำบัดวิชาชีพ โรงพยาบาล Dr.Tech.Care',
      status: newTherapistForm.status,
    });

    // 2. Add to users so they immediately show in Tab 1 (จัดการผู้ใช้งาน) and can log in
    addUser({
      username: usernameClean,
      name: newTherapistForm.name.trim(),
      role: 'therapist',
      status: newTherapistForm.status === 'on_leave' ? 'suspended' : 'active',
      code: randCode,
      password: pass,
      must_change_password: false,
      phone: newTherapistForm.phone || undefined,
      email: newTherapistForm.email || `${usernameClean}@drtechcare.hospital`,
      last_active: 'เพิ่งลงทะเบียน',
    });

    setIsAddTherapistOpen(false);
    showToast(`เพิ่มนักกายภาพบำบัดใหม่สำเร็จ: ${newTherapistForm.name} (Username: ${usernameClean})`);
    setNewTherapistForm({
      name: '',
      username: '',
      password: '1234',
      specialty: 'กายภาพบำบัดระบบกระดูกและกล้ามเนื้อ (Orthopedics)',
      phone: '',
      email: '',
      licenseNumber: 'กภ. 8920',
      bio: '',
      status: 'active',
    });
  };

  // =========================================================================
  // 4. STATE FOR EXERCISE LIBRARY (Tab 4: exercises)
  // =========================================================================
  const [exerciseSubTab, setExerciseSubTab] = useState<'exercises' | 'modpacks' | 'minigame_questions'>('exercises');
  const [exerciseSearch, setExerciseSearch] = useState<string>('');
  const [exerciseCategoryFilter, setExerciseCategoryFilter] = useState<string>('all');
  const [isAddExerciseOpen, setIsAddExerciseOpen] = useState<boolean>(false);
  const [isCreateModpackOpen, setIsCreateModpackOpen] = useState<boolean>(false);
  const [editingExercise, setEditingExercise] = useState<HospitalExercise | null>(null);
  const [deletingExercise, setDeletingExercise] = useState<HospitalExercise | null>(null);

  const filteredExercises = useMemo(() => {
    return exercises.filter((ex) => {
      const matchCat = exerciseCategoryFilter === 'all' || ex.category === exerciseCategoryFilter;
      const q = exerciseSearch.toLowerCase().trim();
      const matchQ =
        !q ||
        ex.name.toLowerCase().includes(q) ||
        ex.englishName.toLowerCase().includes(q) ||
        ex.targetJoint.toLowerCase().includes(q) ||
        ex.description.toLowerCase().includes(q);
      return matchCat && matchQ;
    });
  }, [exercises, exerciseCategoryFilter, exerciseSearch]);

  // =========================================================================
  // 5. STATE FOR USAGE / ACTIVITY LOG (Tab 5: logs - Admin only)
  // =========================================================================
  const [logSearch, setLogSearch] = useState<string>('');
  const [logCategoryFilter, setLogCategoryFilter] = useState<string>('all');
  const [isBannedManagementOpen, setIsBannedManagementOpen] = useState<boolean>(false);
  const [kickedLogIds, setKickedLogIds] = useState<(number | string)[]>([]);
  const [confirmKickLog, setConfirmKickLog] = useState<ActivityLog | null>(null);
  const [confirmBanDevice, setConfirmBanDevice] = useState<string | null>(null);
  const [confirmBanIp, setConfirmBanIp] = useState<string | null>(null);

  const filteredLogs = useMemo(() => {
    return activityLogs.filter((log) => {
      const matchCat = logCategoryFilter === 'all' || log.category === logCategoryFilter;
      const q = logSearch.toLowerCase().trim();
      const matchQ =
        !q ||
        log.userName.toLowerCase().includes(q) ||
        log.action.toLowerCase().includes(q) ||
        log.details.toLowerCase().includes(q) ||
        (log.device && log.device.toLowerCase().includes(q)) ||
        (log.ipAddress && log.ipAddress.includes(q));
      return matchCat && matchQ;
    });
  }, [activityLogs, logCategoryFilter, logSearch]);

  // =========================================================================
  // 6. STATE FOR SYSTEM SETTINGS (Tab 6: settings - Admin only)
  // =========================================================================
  const [localAiSettings, setLocalAiSettings] = useState(aiSettings);
  const [isSavingSettings, setIsSavingSettings] = useState<boolean>(false);
  const [isResetSettingsOpen, setIsResetSettingsOpen] = useState<boolean>(false);

  const handleSaveSettings = () => {
    setIsSavingSettings(true);
    setTimeout(() => {
      updateAiSettings(localAiSettings);
      setIsSavingSettings(false);
      showToast('บันทึกการตั้งค่าเรียบร้อยแล้ว');
    }, 450);
  };

  const handleResetSettingsConfirm = () => {
    const defaults = {
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
    };
    setLocalAiSettings(defaults);
    updateAiSettings(defaults);
    showToast('รีเซ็ตเป็นค่ามาตรฐานที่แนะนำเรียบร้อยแล้ว');
  };

  // If not authenticated, render Staff Login Screen or Force Password Change
  if (!isStaffAuthenticated) {
    const demoAccounts = [
      {
        username: 'admin',
        role: 'admin' as const,
        roleTitle: 'แอดมินใหญ่ (Admin)',
        name: 'นพ. วรชัย อมรเวช',
        code: 'ADM-01',
        description: 'ผู้อำนวยการ รพ. • สิทธิ์เต็ม 7 เมนู',
        badgeColor: 'bg-amber-100 text-amber-900 border-amber-300',
      },
      {
        username: 'pt_thanakorn',
        role: 'therapist' as const,
        roleTitle: 'นักกายภาพ (PT)',
        name: 'กภ. ธนากร วงศ์สวัสดิ์',
        code: 'T-003',
        description: 'นักกายภาพวิชาชีพ • สิทธิ์ 5 เมนู (รวมตารางกายภาพ)',
        badgeColor: 'bg-emerald-100 text-emerald-800 border-emerald-300',
      },
      {
        username: 'pt_pimchanok',
        role: 'therapist' as const,
        roleTitle: 'นักกายภาพ (PT)',
        name: 'กภ. พิมพ์ชนก สุขเกษม',
        code: 'T-007',
        description: 'นักกายภาพวิชาชีพ • สิทธิ์ 5 เมนู (รวมตารางกายภาพ)',
        badgeColor: 'bg-emerald-100 text-emerald-800 border-emerald-300',
      },
    ];

    // Sub-view A: Mandatory First-time Password Change Screen
    if (mustChangePasswordUser) {
      return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-gradient-to-b from-[#E8F8F1] via-[#FFFFFF] to-[#E4F0FC] p-4 animate-fadeIn overflow-y-auto">
          <div className="bg-white rounded-[32px] sm:rounded-[36px] border-2 border-amber-400 p-6 sm:p-8 max-w-lg w-full shadow-2xl space-y-6 text-center my-auto">
            {/* Header Banner */}
            <div className="space-y-3">
              <div className="w-16 h-16 rounded-3xl bg-gradient-to-br from-amber-500 to-amber-700 text-white mx-auto flex items-center justify-center shadow-lg shadow-amber-600/30">
                <ShieldAlert className="w-8 h-8" />
              </div>

              <div>
                <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-50 text-amber-900 border border-amber-200 text-xs font-bold mb-2">
                  <Lock className="w-3.5 h-3.5 text-amber-700" />
                  <span>บังคับเปลี่ยนรหัสผ่าน (First-time Security Setup)</span>
                </div>
                <h2 className="text-xl sm:text-2xl font-black text-[#0F2F2B]">
                  ตั้งรหัสผ่านใหม่ก่อนเข้าใช้งาน
                </h2>
                <p className="text-xs text-slate-600 font-medium mt-1 leading-relaxed">
                  บัญชีของคุณได้รับการรีเซ็ตรหัสผ่านหรือเข้าสู่ระบบเป็นครั้งแรก เพื่อความปลอดภัยสูงสุด กรุณาตั้งรหัสผ่านใหม่ที่มีความยาวอย่างน้อย 8 ตัวอักษร (แนะนำ 10 ตัวขึ้นไป)
                </p>
              </div>
            </div>

            {/* Target User Info */}
            <div className="p-3 rounded-2xl bg-slate-50 border border-slate-200 text-xs text-left flex items-center justify-between">
              <div>
                <span className="text-slate-500">บัญชีผู้ใช้งาน:</span>{' '}
                <strong className="text-[#0F2F2B] font-bold">{mustChangePasswordUser.name}</strong>
              </div>
              <span className="font-mono text-emerald-800 font-bold bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                @{mustChangePasswordUser.username}
              </span>
            </div>

            {/* Form */}
            <form onSubmit={handleSubmitMandatoryPassword} className="space-y-4 text-left">
              {/* New Password */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  รหัสผ่านใหม่ (อย่างน้อย 8 ตัวอักษร แนะนำ 10+) <span className="text-rose-500">*</span>
                </label>
                <div className="bg-slate-50 rounded-2xl border border-slate-300 p-3 flex items-center gap-2.5 focus-within:border-[#10B981] focus-within:ring-2 focus-within:ring-emerald-200 transition">
                  <Lock className="w-5 h-5 text-emerald-600 flex-shrink-0" />
                  <input
                    type={showNewMandatoryPassword ? 'text' : 'password'}
                    value={newMandatoryPassword}
                    onChange={(e) => {
                      setNewMandatoryPassword(e.target.value);
                      setMandatoryPasswordError(null);
                    }}
                    placeholder="กรอกรหัสผ่านใหม่อย่างน้อย 8 ตัวอักษร"
                    className="w-full bg-transparent text-sm font-semibold text-[#0F2F2B] outline-none"
                    autoFocus
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewMandatoryPassword(!showNewMandatoryPassword)}
                    className="text-slate-400 hover:text-slate-700 transition p-1 cursor-pointer"
                  >
                    {showNewMandatoryPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Confirm New Password */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  ยืนยันรหัสผ่านใหม่อีกครั้ง <span className="text-rose-500">*</span>
                </label>
                <div className="bg-slate-50 rounded-2xl border border-slate-300 p-3 flex items-center gap-2.5 focus-within:border-[#10B981] focus-within:ring-2 focus-within:ring-emerald-200 transition">
                  <KeyRound className="w-5 h-5 text-emerald-600 flex-shrink-0" />
                  <input
                    type={showConfirmMandatoryPassword ? 'text' : 'password'}
                    value={confirmMandatoryPassword}
                    onChange={(e) => {
                      setConfirmMandatoryPassword(e.target.value);
                      setMandatoryPasswordError(null);
                    }}
                    placeholder="กรอกรหัสผ่านใหม่อีกครั้งให้ตรงกัน"
                    className="w-full bg-transparent text-sm font-semibold text-[#0F2F2B] outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmMandatoryPassword(!showConfirmMandatoryPassword)}
                    className="text-slate-400 hover:text-slate-700 transition p-1 cursor-pointer"
                  >
                    {showConfirmMandatoryPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Error Alert */}
              {mandatoryPasswordError && (
                <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold flex items-center gap-2 animate-fadeIn">
                  <AlertCircle className="w-4 h-4 text-rose-600 flex-shrink-0" />
                  <span>{mandatoryPasswordError}</span>
                </div>
              )}

              {/* Actions */}
              <div className="flex flex-col gap-2.5 pt-2">
                <button
                  type="submit"
                  disabled={isSubmittingMandatoryPassword}
                  className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-700 text-white font-extrabold text-sm shadow-md shadow-emerald-700/20 hover:brightness-105 transition active:scale-95 cursor-pointer flex items-center justify-center gap-2 disabled:opacity-60"
                >
                  {isSubmittingMandatoryPassword ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>กำลังบันทึกรหัสผ่านใหม่...</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-4 h-4" />
                      <span>บันทึกรหัสผ่านใหม่และเข้าใช้งาน</span>
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setMustChangePasswordUser(null);
                    setStaffPasswordInput('');
                  }}
                  className="w-full py-2.5 rounded-2xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs transition cursor-pointer flex items-center justify-center gap-1.5"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span>ยกเลิก (กลับสู่หน้า Login)</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      );
    }

    // Sub-view B: Standard Staff Login Form
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-gradient-to-br from-[#E6FBF2] via-[#FFFFFF] to-[#E0F2FE] p-4 animate-fadeIn overflow-y-auto">
        <div className="bg-white rounded-[32px] sm:rounded-[36px] border-2 border-cyan-300 ring-4 ring-emerald-100/60 p-6 sm:p-8 max-w-lg w-full shadow-2xl space-y-6 text-center my-auto">
          {/* Header Banner */}
          <div className="space-y-3">
            <div className="w-16 h-16 rounded-3xl bg-gradient-to-br from-[#10B981] via-[#06B6D4] to-[#2563EB] text-white mx-auto flex items-center justify-center shadow-xl shadow-cyan-500/30">
              <Shield className="w-8 h-8" />
            </div>

            <div>
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-gradient-to-r from-emerald-50 via-white to-sky-50 text-emerald-900 border border-cyan-200 text-xs font-bold mb-2 shadow-2xs">
                <Sparkles className="w-3.5 h-3.5 text-cyan-600" />
                <span>Dr.Tech.Care • Hospital Staff Portal</span>
              </div>
              <h2 className="text-xl sm:text-2xl font-black text-[#0F2F2B]">
                เข้าสู่ระบบบุคลากร Dr.Tech.Care
              </h2>
              <p className="text-xs text-slate-500 font-medium mt-1">
                สำหรับผู้อำนวยการ รพ., แอดมินใหญ่ และนักกายภาพบำบัด
              </p>
            </div>
          </div>

          {/* Login Form */}
          <form onSubmit={handleStaffLogin} className="space-y-4 text-left">
            {/* Username Field */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                Username (ชื่อผู้ใช้) <span className="text-rose-500">*</span>
              </label>
              <div className="bg-slate-50 rounded-2xl border border-emerald-200 p-3 flex items-center gap-2.5 focus-within:border-cyan-500 focus-within:ring-2 focus-within:ring-cyan-200 transition">
                <User className="w-5 h-5 text-cyan-600 flex-shrink-0" />
                <input
                  type="text"
                  value={staffUsernameInput}
                  onChange={(e) => {
                    setStaffUsernameInput(e.target.value);
                    setStaffAuthError(null);
                  }}
                  placeholder="เช่น admin หรือ pt_thanakorn"
                  className="w-full bg-transparent text-sm font-semibold text-[#0F2F2B] outline-none"
                  autoFocus
                  autoComplete="username"
                />
              </div>
            </div>

            {/* Password Field with Show/Hide Toggle */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                Password (รหัสผ่าน) <span className="text-rose-500">*</span>
              </label>
              <div className="bg-slate-50 rounded-2xl border border-emerald-200 p-3 flex items-center gap-2.5 focus-within:border-cyan-500 focus-within:ring-2 focus-within:ring-cyan-200 transition">
                <Lock className="w-5 h-5 text-cyan-600 flex-shrink-0" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={staffPasswordInput}
                  onChange={(e) => {
                    setStaffPasswordInput(e.target.value);
                    setStaffAuthError(null);
                  }}
                  placeholder="กรอกรหัสผ่านเข้าสู่ระบบ"
                  className="w-full bg-transparent text-sm font-semibold text-[#0F2F2B] outline-none"
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="text-slate-400 hover:text-slate-700 transition p-1 cursor-pointer"
                  title={showPassword ? 'ซ่อนรหัสผ่าน' : 'แสดงรหัสผ่าน'}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Auto-detect role hint */}
            <div className="text-[11px] text-slate-700 bg-gradient-to-r from-emerald-50 via-white to-sky-50 border border-cyan-200 rounded-xl px-3 py-2 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
              <span>ระบบจะตรวจสอบสิทธิ์อัตโนมัติ: Admin (7 เมนู) หรือ นักกายภาพ (5 เมนู)</span>
            </div>

            {/* Error Message Alert */}
            {staffAuthError && (
              <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold flex items-center gap-2 animate-fadeIn">
                <AlertCircle className="w-4 h-4 text-rose-600 flex-shrink-0" />
                <span>{staffAuthError}</span>
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex flex-col gap-2.5 pt-2">
              <button
                type="submit"
                disabled={isLoggingIn}
                className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-[#10B981] via-[#06B6D4] to-[#2563EB] hover:opacity-95 text-white font-extrabold text-sm shadow-lg shadow-cyan-500/25 hover:brightness-105 transition active:scale-95 cursor-pointer flex items-center justify-center gap-2 disabled:opacity-60"
                id="btnStaffLoginSubmit"
              >
                {isLoggingIn ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>กำลังเข้าสู่ระบบ Supabase...</span>
                  </>
                ) : (
                  <>
                    <LogIn className="w-4 h-4" />
                    <span>เข้าสู่ระบบบุคลากร</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={onClose}
                className="w-full py-2.5 rounded-2xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs transition cursor-pointer flex items-center justify-center gap-1.5"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>กลับหน้าหลักตู้คนไข้</span>
              </button>
            </div>
          </form>

          {/* Demo Accounts Quick-Select Table (DEV ONLY - Completely Hidden in Production) */}
          {import.meta.env.DEV && (
            <div className="pt-4 border-t border-slate-100 text-left space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
                  <span>บัญชีตัวอย่างสำหรับทดสอบ (เฉพาะโหมดพัฒนา):</span>
                </span>
                <span className="text-[10px] text-emerald-800 font-bold bg-emerald-100 px-2 py-0.5 rounded-full border border-emerald-300">
                  DEV Mode
                </span>
              </div>

              <div className="space-y-2">
                {demoAccounts.map((acc) => (
                  <div
                    key={acc.username}
                    className="p-3 rounded-2xl border border-emerald-100 bg-slate-50/70 hover:bg-emerald-50/50 hover:border-emerald-300 transition flex items-center justify-between gap-3 text-xs"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-extrabold text-[#0F2F2B] truncate">{acc.name}</span>
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${acc.badgeColor}`}>
                          {acc.roleTitle}
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-500 font-mono mt-0.5">
                        Username: <strong className="text-emerald-800">{acc.username}</strong>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      <button
                        type="button"
                        onClick={() => handleFillDemoAccount(acc.username)}
                        className="px-3 py-1.5 rounded-xl bg-white border border-slate-200 hover:border-emerald-400 text-slate-700 hover:text-emerald-800 font-bold text-[11px] transition cursor-pointer shadow-2xs"
                        title="กรอกชื่อผู้ใช้ลงในฟอร์ม"
                      >
                        ใช้ชื่อนี้
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Sidebar Menu Items based on Role
  // Admin: 7 items | Physiotherapist: 5 items
  const sidebarItems: { id: TabKey; label: string; icon: React.FC<{ className?: string }>; adminOnly?: boolean }[] = [
    { id: 'users', label: '1. จัดการผู้ใช้งาน', icon: Users },
    { id: 'patients', label: '2. ข้อมูลคนไข้', icon: User },
    { id: 'schedules', label: '3. ตารางกายภาพ', icon: CalendarDays },
    {
      id: 'therapists',
      label: currentRole === 'therapist' ? '4. โต๊ะทำงาน (PT Workspace)' : '4. ข้อมูลนักกายภาพ',
      icon: Stethoscope,
    },
    { id: 'exercises', label: '5. โจทย์ในมินิเกม', icon: Gamepad2 },
    { id: 'logs', label: '6. ประวัติการใช้งาน', icon: History, adminOnly: true },
    { id: 'settings', label: '7. ตั้งค่าระบบ', icon: Sliders, adminOnly: true },
  ];

  const visibleSidebarItems = sidebarItems.filter((item) => {
    if (item.adminOnly && currentRole !== 'admin') return false;
    return true;
  });

  return (
    <div className="fixed inset-0 z-50 flex bg-gradient-to-br from-[#E6FBF2] via-[#FFFFFF] to-[#E0F2FE] text-[#0F2F2B] font-sans overflow-hidden animate-fadeIn select-none">
      {/* ==================================================================== */}
      {/* 1. LEFT SIDEBAR (Green-to-Blue Deep Medical Gradient Theme)           */}
      {/* ==================================================================== */}
      <aside
        className={`${
          isSidebarCollapsed ? 'w-16 sm:w-18 p-2.5 items-center' : 'w-56 sm:w-60 p-3.5 sm:p-4'
        } bg-gradient-to-b from-[#064E3B] via-[#0E3A45] to-[#0A2540] text-white flex flex-col justify-between flex-shrink-0 shadow-2xl border-r border-teal-800/40 transition-all duration-200 z-30 select-none`}
      >
        <div className="w-full">
          {/* Brand Logo & Collapse Toggle */}
          <div className={`flex items-center ${isSidebarCollapsed ? 'justify-center flex-col gap-2' : 'justify-between'} py-1.5 mb-3 border-b border-teal-700/50`}>
            <div className="flex items-center gap-2 min-w-0">
              <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-[#10B981] to-[#06B6D4] text-white flex items-center justify-center shadow-md shadow-emerald-500/25 flex-shrink-0">
                <HeartPulse className="w-4 h-4 text-white" />
              </div>
              {!isSidebarCollapsed && (
                <div className="min-w-0">
                  <div className="font-extrabold text-sm tracking-tight leading-tight text-white truncate">
                    Dr.Tech.Care
                  </div>
                  <div className="text-[10px] text-cyan-200/90 font-medium truncate">
                    {currentRole === 'admin' ? 'แอดมิน (Admin)' : 'นักกายภาพ (PT)'}
                  </div>
                </div>
              )}
            </div>

            <button
              onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
              className="p-1 rounded-lg text-cyan-200 hover:text-white hover:bg-white/10 transition cursor-pointer flex-shrink-0"
              title={isSidebarCollapsed ? 'ขยายเมนู' : 'ย่อเมนูเพื่อเพิ่มพื้นที่'}
            >
              {isSidebarCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
            </button>
          </div>

          {/* Navigation Menu */}
          <nav className="space-y-1" aria-label="เมนูระบบบริหารจัดการ">
            {visibleSidebarItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => setActiveTab(item.id)}
                  title={item.label}
                  className={`w-full flex items-center ${
                    isSidebarCollapsed ? 'justify-center p-2.5' : 'gap-2.5 px-3 py-2'
                  } rounded-xl font-semibold text-xs transition-all text-left cursor-pointer ${
                    isActive
                      ? 'bg-gradient-to-r from-[#10B981] via-[#06B6D4] to-[#2563EB] text-white font-black shadow-lg shadow-cyan-500/30 border border-white/20'
                      : 'text-emerald-100/80 hover:bg-white/10 hover:text-white'
                  }`}
                >
                  <Icon className={`w-4 h-4 flex-shrink-0 ${isActive ? 'text-white' : 'text-cyan-300'}`} />
                  {!isSidebarCollapsed && <span className="flex-1 truncate">{item.label}</span>}
                  {!isSidebarCollapsed && item.id === 'schedules' && (
                    <span
                      className={`text-[10px] font-black px-1.5 py-0.5 rounded-full ${
                        isActive ? 'bg-white/25 text-white' : 'bg-cyan-500/30 text-cyan-100'
                      }`}
                    >
                      {treatmentPlans.length}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        </div>

        {/* Bottom Sidebar Info & Logout */}
        <div className="pt-3 border-t border-teal-700/50 space-y-1.5 w-full">
          {!isSidebarCollapsed && (
            <div className="px-2.5 py-1.5 rounded-xl bg-gradient-to-r from-[#064E3B]/70 to-[#0A2540]/70 border border-cyan-500/30 text-[10px] text-cyan-200/90 shadow-2xs">
              <div className="truncate">ฐานข้อมูล: <span className={isSupabaseConnected ? "text-[#4AE387] font-bold" : "text-amber-400 font-bold"}>{isSupabaseConnected ? "Cloud 🟢" : "Local 🟡"}</span></div>
              <div className="text-[10px] text-cyan-300/80 truncate">ผู้ใช้: {currentUser?.name?.split(' ')[0] || currentUser?.username}</div>
            </div>
          )}

          <button
            onClick={handleStaffLogout}
            title="ออกจากระบบบุคลากร"
            className={`w-full flex items-center ${
              isSidebarCollapsed ? 'justify-center p-2' : 'gap-2 px-3 py-2'
            } rounded-xl bg-rose-950/40 border border-rose-800/50 text-rose-200 text-xs font-semibold hover:bg-rose-900/60 hover:text-white transition active:scale-95 cursor-pointer`}
          >
            <LogOut className="w-3.5 h-3.5 text-rose-400 flex-shrink-0" />
            {!isSidebarCollapsed && <span>ออกจากระบบ</span>}
          </button>

          <button
            onClick={onClose}
            title="กลับหน้าหลักตู้คนไข้"
            className={`w-full flex items-center ${
              isSidebarCollapsed ? 'justify-center p-2' : 'gap-2 px-3 py-1.5'
            } rounded-xl border border-cyan-700/60 text-cyan-200/90 text-[11px] font-medium hover:bg-white/10 hover:text-white transition active:scale-95 cursor-pointer`}
          >
            <ArrowLeft className="w-3.5 h-3.5 flex-shrink-0" />
            {!isSidebarCollapsed && <span>กลับหน้าตู้ Kiosk</span>}
          </button>
        </div>
      </aside>

      {/* ==================================================================== */}
      {/* 2. MAIN CONTENT AREA                                                 */}
      {/* ==================================================================== */}
      <main className="flex-1 flex flex-col h-full overflow-hidden bg-gradient-to-br from-[#E6FBF2] via-[#FFFFFF] to-[#E0F2FE]">
        {/* Top Header Bar */}
        <header className="h-16 px-3.5 sm:px-6 border-b border-cyan-100/80 bg-gradient-to-r from-white/95 via-[#F0FDF4]/90 to-[#F0F9FF]/95 backdrop-blur-md flex items-center justify-between flex-shrink-0 gap-2">
          {/* Header Title with Mobile Collapse Toggle */}
          <div className="flex items-center gap-2.5 min-w-0">
            <button
              onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
              className="p-1.5 rounded-xl bg-gradient-to-r from-emerald-50 to-sky-50 text-emerald-800 hover:text-cyan-800 border border-cyan-200 transition cursor-pointer flex-shrink-0 shadow-2xs"
              title={isSidebarCollapsed ? 'ขยายเมนู' : 'ย่อเมนู'}
            >
              <Menu className="w-4 h-4" />
            </button>
            <div className="min-w-0">
              <h1 className="text-sm sm:text-base lg:text-lg font-extrabold text-[#0F2F2B] tracking-tight truncate flex items-center gap-1.5">
                <span>
                  {activeTab === 'users' && 'จัดการผู้ใช้งาน'}
                  {activeTab === 'patients' && 'ข้อมูลคนไข้'}
                  {activeTab === 'schedules' && 'ตารางฝึกกายภาพ'}
                  {activeTab === 'therapists' && 'ข้อมูลนักกายภาพ'}
                  {activeTab === 'exercises' && 'โจทย์ในมินิเกม'}
                  {activeTab === 'logs' && 'ประวัติการใช้งาน'}
                  {activeTab === 'settings' && 'ตั้งค่าระบบ'}
                </span>
                <span className="hidden xl:inline text-xs font-semibold text-slate-400">
                  {activeTab === 'users' && '(User Management)'}
                  {activeTab === 'patients' && '(Patient Data)'}
                  {activeTab === 'schedules' && '(Therapy Schedules)'}
                  {activeTab === 'therapists' && '(Physiotherapist Data)'}
                  {activeTab === 'exercises' && '(MiniGame Questions Management)'}
                  {activeTab === 'logs' && '(Audit Log)'}
                  {activeTab === 'settings' && '(Settings)'}
                </span>
              </h1>
              <div className="w-10 sm:w-16 h-1 rounded-full bg-gradient-to-r from-[#10B981] via-[#06B6D4] to-[#2563EB] mt-0.5 shadow-xs" />
            </div>
          </div>

          {/* Right Header Controls */}
          <div className="flex items-center gap-2 flex-shrink-0">
            {/* Supabase Connection Status Indicator */}
            <div className={`hidden lg:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold border ${isSupabaseConnected ? 'bg-gradient-to-r from-emerald-50 to-sky-50 text-emerald-800 border-cyan-300' : 'bg-amber-50 text-amber-800 border-amber-300'}`}>
              <span className={`w-2 h-2 rounded-full ${isSupabaseConnected ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'}`} />
              <span>{isSupabaseConnected ? 'Supabase 🟢' : 'Offline 🟡'}</span>
            </div>

            {/* Quick Reception Action button */}
            <button
              onClick={() => setIsReceptionOpen(true)}
              className="hidden md:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-gradient-to-r from-[#10B981] via-[#0284C7] to-[#2563EB] text-white text-xs font-bold shadow-md shadow-cyan-500/20 hover:opacity-95 transition cursor-pointer"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>+ ต้อนรับ & สแกนหน้า</span>
            </button>

            {/* Central DB Sync Status Badge */}
            <button
              onClick={() => setIsNetworkSyncModalOpen(true)}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-full bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 text-xs font-bold transition cursor-pointer shadow-2xs"
              title="ตั้งค่าเชื่อมต่อเซิร์ฟเวอร์กลาง & ซิงค์ข้อมูลข้ามเครื่อง (Multi-Device Sync)"
            >
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <Server className="w-3.5 h-3.5 text-emerald-700" />
              <span className="hidden xl:inline font-mono text-[11px]">เซิร์ฟเวอร์กลาง</span>
            </button>

            {/* User Profile Badge (Real user + role) */}
            <div className="flex items-center gap-2 pl-2 border-l border-cyan-200">
              <div
                className={`w-8 h-8 rounded-full font-extrabold flex items-center justify-center text-xs shadow-md flex-shrink-0 ${
                  currentRole === 'admin' ? 'bg-[#0A2540] text-amber-300' : 'bg-gradient-to-br from-[#10B981] via-[#06B6D4] to-[#2563EB] text-white'
                }`}
              >
                {currentUser?.name?.charAt(0) || (currentRole === 'admin' ? 'ผ' : 'ธ')}
              </div>
              <div className="hidden sm:block text-left max-w-[110px] lg:max-w-[160px]">
                <div className="text-xs font-bold text-[#0F2F2B] leading-tight truncate">
                  {currentUser?.name || (currentRole === 'admin' ? 'นพ. วรชัย' : 'กภ. ธนากร')}
                </div>
                <div className="text-[10px] text-slate-500 font-mono truncate">
                  {currentUser?.code || (currentRole === 'admin' ? 'ADM-01' : 'T-003')}
                </div>
              </div>
            </div>

            {/* Logout Button */}
            <button
              onClick={handleStaffLogout}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-full bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-xs font-bold transition cursor-pointer"
              title="ออกจากระบบบุคลากร"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">ออก</span>
            </button>
          </div>
        </header>

        {/* In-app Toast Banner */}
        {toast && (
          <div className="mx-3.5 sm:mx-6 mt-2.5 p-2.5 rounded-xl bg-emerald-100 border border-emerald-300 text-emerald-900 text-xs font-bold flex items-center gap-2 animate-fadeIn shadow-2xs">
            <CheckCircle2 className="w-4 h-4 text-emerald-700 flex-shrink-0" />
            <span>{toast}</span>
          </div>
        )}

        {/* Content Viewport */}
        <div className="flex-1 overflow-y-auto p-3.5 sm:p-5 lg:p-6 space-y-4 sm:space-y-5">
          {/* ================================================================== */}
          {/* PAGE 1: จัดการผู้ใช้งาน (User Management)                            */}
          {/* ================================================================== */}
          {activeTab === 'users' && (
            <div className="space-y-4 sm:space-y-5 animate-fadeIn">
              {/* Permission Banner */}
              <div className="p-3 rounded-2xl bg-white border border-emerald-200 shadow-2xs flex items-center justify-between text-xs gap-2 flex-wrap">
                <div className="flex items-center gap-2 min-w-0">
                  <Shield className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                  <span className="leading-snug">
                    สิทธิ์ปัจจุบัน ({currentRole === 'admin' ? 'แอดมินใหญ่' : 'นักกายภาพ'}):{' '}
                    <strong>
                      {currentRole === 'admin'
                        ? 'สามารถ เพิ่มบัญชี, แก้ไขชื่อ, แก้ไขรหัสผ่าน, และลบบัญชีผู้ใช้งานทั้งหมดได้'
                        : 'สามารถ เพิ่มบัญชีคนไข้ใหม่ได้ และลบบัญชีได้เฉพาะคนไข้ที่ตนเองดูแลเท่านั้น'}
                    </strong>
                  </span>
                </div>
                <span className="font-mono text-[10px] text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded-full font-bold flex-shrink-0 border border-emerald-200">
                  {users.length} บัญชี
                </span>
              </div>

              {/* Top Stats Cards */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-3.5">
                <div className="bg-gradient-to-br from-white via-emerald-50/40 to-teal-50/20 rounded-2xl p-3 sm:p-3.5 border border-emerald-200/80 shadow-xs flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-100 to-teal-100 text-emerald-700 flex items-center justify-center flex-shrink-0 shadow-2xs">
                    <Users className="w-5 h-5" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-xl sm:text-2xl font-black text-[#0F2F2B] leading-none">
                      {users.length}
                    </div>
                    <div className="text-[11px] text-slate-500 font-semibold mt-1 truncate">ผู้ใช้งานทั้งหมด</div>
                  </div>
                </div>

                <div className="bg-gradient-to-br from-white via-teal-50/40 to-cyan-50/20 rounded-2xl p-3 sm:p-3.5 border border-teal-200/80 shadow-xs flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-teal-100 to-cyan-100 text-teal-700 flex items-center justify-center flex-shrink-0 shadow-2xs">
                    <User className="w-5 h-5" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-xl sm:text-2xl font-black text-[#0F2F2B] leading-none">
                      {users.filter((u) => u.role === 'patient').length}
                    </div>
                    <div className="text-[11px] text-slate-500 font-semibold mt-1 truncate">คนไข้</div>
                  </div>
                </div>

                <div className="bg-gradient-to-br from-white via-sky-50/40 to-blue-50/20 rounded-2xl p-3 sm:p-3.5 border border-sky-200/80 shadow-xs flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-sky-100 to-blue-100 text-sky-700 flex items-center justify-center flex-shrink-0 shadow-2xs">
                    <Stethoscope className="w-5 h-5" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-xl sm:text-2xl font-black text-[#0F2F2B] leading-none">
                      {users.filter((u) => u.role === 'therapist').length}
                    </div>
                    <div className="text-[11px] text-slate-500 font-semibold mt-1 truncate">นักกายภาพ</div>
                  </div>
                </div>

                <div className="bg-gradient-to-br from-white via-blue-50/40 to-indigo-50/20 rounded-2xl p-3 sm:p-3.5 border border-blue-200/80 shadow-xs flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-100 to-indigo-100 text-blue-700 flex items-center justify-center flex-shrink-0 shadow-2xs">
                    <Shield className="w-5 h-5" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-xl sm:text-2xl font-black text-[#0F2F2B] leading-none">
                      {users.filter((u) => u.role === 'admin').length}
                    </div>
                    <div className="text-[11px] text-slate-500 font-semibold mt-1 truncate">แอดมิน (Admin)</div>
                  </div>
                </div>
              </div>

              {/* Search, Filter & Add Button */}
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5">
                <div className="w-full sm:w-64 lg:w-72 relative">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3.5 top-1/2 transform -translate-y-1/2" />
                  <input
                    type="text"
                    value={userSearch}
                    onChange={(e) => {
                      setUserSearch(e.target.value);
                      setUserPage(1);
                    }}
                    placeholder="ค้นหาชื่อ, username, รหัส..."
                    className="w-full pl-9 pr-3.5 py-1.5 sm:py-2 rounded-full bg-white border border-cyan-200 text-xs font-semibold text-[#0F2F2B] placeholder:text-slate-400 shadow-2xs focus:outline-none focus:ring-2 focus:ring-[#06B6D4]"
                  />
                </div>

                <div className="flex items-center gap-2 justify-between sm:justify-end flex-wrap">
                  <div className="flex items-center gap-1 p-1 rounded-full bg-gradient-to-r from-emerald-50/80 via-white to-sky-50/80 border border-cyan-200/80 shadow-2xs">
                    <button
                      onClick={() => {
                        setUserRoleFilter('all');
                        setUserPage(1);
                      }}
                      className={`text-xs font-bold px-2.5 sm:px-3 py-1 rounded-full transition cursor-pointer ${
                        userRoleFilter === 'all' ? 'bg-gradient-to-r from-[#10B981] to-[#0284C7] text-white shadow-xs' : 'text-slate-600 hover:text-cyan-800'
                      }`}
                    >
                      ทั้งหมด
                    </button>
                    <button
                      onClick={() => {
                        setUserRoleFilter('patient');
                        setUserPage(1);
                      }}
                      className={`text-xs font-bold px-2.5 sm:px-3 py-1 rounded-full transition cursor-pointer ${
                        userRoleFilter === 'patient' ? 'bg-gradient-to-r from-[#10B981] to-[#0284C7] text-white shadow-xs' : 'text-slate-600 hover:text-cyan-800'
                      }`}
                    >
                      คนไข้ (Patient)
                    </button>
                    <button
                      onClick={() => {
                        setUserRoleFilter('therapist');
                        setUserPage(1);
                      }}
                      className={`text-xs font-bold px-2.5 sm:px-3 py-1 rounded-full transition cursor-pointer ${
                        userRoleFilter === 'therapist' ? 'bg-[#0F2F2B] text-emerald-200 shadow-xs' : 'text-slate-600 hover:text-cyan-800'
                      }`}
                    >
                      นักกายภาพ (PT)
                    </button>
                    <button
                      onClick={() => {
                        setUserRoleFilter('admin' as any);
                        setUserPage(1);
                      }}
                      className={`text-xs font-bold px-2.5 sm:px-3 py-1 rounded-full transition cursor-pointer ${
                        (userRoleFilter as any) === 'admin' ? 'bg-purple-600 text-white shadow-xs' : 'text-slate-600 hover:text-cyan-800'
                      }`}
                    >
                      Super Admin
                    </button>
                  </div>

                  <button
                    onClick={() => setActiveTab('schedules')}
                    className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-gradient-to-r from-emerald-50 to-sky-50 text-slate-700 border border-cyan-200 text-xs font-bold hover:border-cyan-400 transition cursor-pointer"
                  >
                    <CalendarDays className="w-3.5 h-3.5 text-cyan-600" />
                    <span>ตารางกายภาพ ({treatmentPlans.length})</span>
                  </button>

                  <button
                    onClick={() => setIsAddUserModalOpen(true)}
                    className="flex items-center gap-1.5 px-3.5 py-1.5 sm:py-2 rounded-full bg-gradient-to-r from-[#10B981] via-[#06B6D4] to-[#2563EB] text-white text-xs font-bold shadow-md shadow-cyan-500/25 hover:brightness-105 transition active:scale-95 cursor-pointer whitespace-nowrap"
                    title={currentRole === 'therapist' ? "ลงทะเบียนคนไข้ใหม่ พร้อมสแกนใบหน้า 10 ช็อต" : "ลงทะเบียนผู้ใช้ใหม่ พร้อมสแกนใบหน้า 10 ช็อต"}
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>{currentRole === 'therapist' ? '+ Add New Patient' : '+ Add New User'}</span>
                  </button>
                </div>
              </div>

              {/* Table of Users */}
              <div className="bg-white rounded-2xl border border-cyan-100 shadow-xs overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs sm:text-sm border-collapse">
                    <thead>
                      <tr className="border-b border-cyan-100 text-slate-700 text-[11px] font-bold uppercase tracking-wider bg-gradient-to-r from-emerald-50/80 via-white to-sky-50/80">
                        <th className="py-2.5 px-3 sm:px-4 sticky left-0 bg-gradient-to-r from-emerald-50 to-white z-20 shadow-xs border-r border-cyan-100 min-w-[170px] sm:min-w-[210px]">
                          รูปหน้า / ชื่อผู้ใช้งาน (Avatar & Name)
                        </th>
                        <th className="py-2.5 px-3 sm:px-4 whitespace-nowrap min-w-[110px]">Unique ID / HN</th>
                        <th className="py-2.5 px-3 sm:px-4 whitespace-nowrap min-w-[110px]">บทบาท (Role)</th>
                        <th className="py-2.5 px-3 sm:px-4 whitespace-nowrap min-w-[130px]">Password Hash</th>
                        <th className="py-2.5 px-3 sm:px-4 whitespace-nowrap min-w-[120px]">Face ID Status</th>
                        <th className="py-2.5 px-3 sm:px-4 whitespace-nowrap min-w-[105px]">Account Status</th>
                        <th className="py-2.5 px-3 sm:px-4 text-right whitespace-nowrap min-w-[140px]">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-emerald-50">
                      {paginatedUsers.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="py-10 text-center">
                            <div className="flex flex-col items-center justify-center space-y-2">
                              <div className="w-10 h-10 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center">
                                <Search className="w-5 h-5" />
                              </div>
                              <div className="font-bold text-xs sm:text-sm text-slate-600">
                                ไม่พบข้อมูลผู้ใช้งานที่ตรงตามเงื่อนไข
                              </div>
                              <div className="text-[11px] text-slate-400">
                                ลองเปลี่ยนคำค้นหา หรือรีเซ็ตตัวกรองเพื่อดูรายชื่อทั้งหมด
                              </div>
                            </div>
                          </td>
                        </tr>
                      ) : (
                        paginatedUsers.map((user) => {
                          const canEdit = canEditUser(user);
                          const canDelete = canDeleteUser(user);
                          const faceImg = user.face_image_url || patientFaceStorageService.getProfileFaceImage(user.code);
                          const hasFaceEnrolled = Boolean(user.face_vector || user.biometricVector || user.faceRegisteredAt || (user as any).faceDossier?.length);
                          const isAccountDisabled = user.status === 'disabled';

                          return (
                            <tr key={user.id} className="hover:bg-emerald-50/40 transition group">
                              {/* 1. User Avatar / Face Preview + Name & Username */}
                              <td className="py-2.5 px-3 sm:px-4 sticky left-0 bg-white group-hover:bg-emerald-50/60 z-10 shadow-xs border-r border-emerald-100/60 min-w-[170px] sm:min-w-[210px]">
                                <div className="flex items-center gap-2.5">
                                  {faceImg ? (
                                    <img
                                      src={faceImg}
                                      alt={user.name}
                                      className="w-9 h-9 rounded-full object-cover border-2 border-emerald-400 shadow-xs flex-shrink-0"
                                    />
                                  ) : (
                                    <div
                                      className={`w-9 h-9 rounded-full font-bold flex items-center justify-center text-xs shadow-xs flex-shrink-0 ${
                                        user.role === 'patient'
                                          ? 'bg-[#10B981] text-white'
                                          : user.role === 'therapist'
                                          ? 'bg-[#0F2F2B] text-emerald-200'
                                          : 'bg-purple-600 text-white'
                                      }`}
                                    >
                                      {user.name.charAt(user.name.startsWith('นาย') || user.name.startsWith('นาง') ? 3 : 0) || 'ผ'}
                                    </div>
                                  )}
                                  <div className="min-w-0">
                                    <div className="font-bold text-[#0F2F2B] leading-tight text-xs sm:text-sm truncate max-w-[140px] sm:max-w-[180px]">
                                      {user.name}
                                    </div>
                                    <div className="text-[10px] text-slate-500 font-mono truncate max-w-[140px] sm:max-w-[180px] mt-0.5">
                                      @{user.username}
                                    </div>
                                  </div>
                                </div>
                              </td>

                              {/* 2. Unique ID / HN (strictly unique) */}
                              <td className="py-2.5 px-3 sm:px-4 whitespace-nowrap">
                                <span className="px-2.5 py-1 rounded-xl bg-slate-100 border border-slate-200 font-mono font-bold text-xs text-slate-800">
                                  {defaultDash(user.code)}
                                </span>
                              </td>

                              {/* 3. Role Badge */}
                              <td className="py-2.5 px-3 sm:px-4 whitespace-nowrap">
                                {user.role === 'patient' && (
                                  <span className="px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200 font-bold text-xs whitespace-nowrap">
                                    Patient
                                  </span>
                                )}
                                {user.role === 'therapist' && (
                                  <span className="px-2.5 py-0.5 rounded-full bg-[#0F2F2B] text-emerald-200 border border-emerald-950 font-bold text-xs whitespace-nowrap">
                                    Physiotherapist
                                  </span>
                                )}
                                {user.role === 'admin' && (
                                  <span className="px-2.5 py-0.5 rounded-full bg-purple-100 text-purple-900 border border-purple-300 font-bold text-xs whitespace-nowrap">
                                    Super Admin
                                  </span>
                                )}
                              </td>

                              {/* 4. Password Hash (SHA-256 masked) */}
                              <td className="py-2.5 px-3 sm:px-4 whitespace-nowrap">
                                <div className="inline-flex items-center gap-1.5 bg-stone-50 px-2.5 py-1 rounded-xl border border-stone-200">
                                  <Lock className="w-3.5 h-3.5 text-emerald-600" />
                                  <span className="font-mono font-bold text-[11px] text-slate-700 tracking-wider">
                                    sha256_••••••••
                                  </span>
                                </div>
                              </td>

                              {/* 5. Face ID Status (Registered / Pending) */}
                              <td className="py-2.5 px-3 sm:px-4 whitespace-nowrap">
                                {hasFaceEnrolled ? (
                                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300 font-bold text-[11px]">
                                    <Check className="w-3 h-3 text-emerald-600" />
                                    <span>Registered</span>
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-900 border border-amber-300 font-bold text-[11px]">
                                    <Clock className="w-3 h-3 text-amber-700" />
                                    <span>Pending</span>
                                  </span>
                                )}
                              </td>

                              {/* 6. Account Status (Active / Disabled) */}
                              <td className="py-2.5 px-3 sm:px-4 whitespace-nowrap">
                                {isAccountDisabled ? (
                                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-rose-100 text-rose-800 border border-rose-300 font-bold text-[11px]">
                                    <span className="w-1.5 h-1.5 rounded-full bg-rose-600" />
                                    <span>Disabled</span>
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300 font-bold text-[11px]">
                                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-600" />
                                    <span>Active</span>
                                  </span>
                                )}
                              </td>

                              {/* 7. Actions: Edit Account (Modal B), Biometric Reset (Modal C), Delete */}
                              <td className="py-2.5 px-3 sm:px-4 text-right whitespace-nowrap">
                                <div className="inline-flex items-center gap-1.5 justify-end">
                                  {/* Direct Enter for Patients */}
                                  {user.role === 'patient' && (
                                    <button
                                      onClick={() => {
                                        if (onSelectPatientForKiosk) {
                                          onSelectPatientForKiosk({
                                            id: user.id,
                                            patient_code: user.code,
                                            code: user.code,
                                            name: user.name,
                                            age: user.age || 45,
                                            gender: (user.gender as any) || 'other',
                                            chief_complaint: user.chiefComplaint || user.diagnosis || 'ฟื้นฟูกล้ามเนื้อและข้อต่อ',
                                            photo: (user as any).avatar || user.face_image_url,
                                          });
                                          showToast(`เข้าสู่ระบบในฐานะคนไข้ ${user.name} (${user.code}) เรียบร้อยแล้ว`);
                                        } else {
                                          showToast(`เลือกคนไข้ ${user.name}`);
                                        }
                                      }}
                                      title={`เข้าใช้งานระบบในฐานะคนไข้ ${user.name} (${user.code})`}
                                      className="px-2.5 py-1 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white text-xs font-bold transition flex items-center gap-1 cursor-pointer shadow-xs active:scale-95"
                                    >
                                      <LogIn className="w-3 h-3" />
                                      <span>เข้าใช้งาน</span>
                                    </button>
                                  )}

                                  {/* Direct Switch for Staff */}
                                  {(user.role === 'therapist' || user.role === 'admin') && currentRole === 'admin' && (
                                    <button
                                      onClick={() => {
                                        setCurrentRole(user.role as any);
                                        setCurrentUserId(user.code);
                                        showToast(`สลับใช้งานเป็น: ${user.name} (${user.role === 'admin' ? 'ผู้อำนวยการ/Admin' : 'นักกายภาพ'})`);
                                      }}
                                      title={`สลับเซสชันเป็น ${user.name} (${user.code})`}
                                      className="px-2.5 py-1 rounded-xl border border-indigo-200 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 text-xs font-bold transition flex items-center gap-1 cursor-pointer shadow-xs active:scale-95"
                                    >
                                      <RefreshCw className="w-3 h-3" />
                                      <span>สลับบัญชี</span>
                                    </button>
                                  )}

                                  {currentRole === 'therapist' && user.role !== 'patient' ? (
                                    <span className="px-2.5 py-1 rounded-xl bg-slate-100 text-slate-400 font-semibold text-[11px] border border-slate-200" title="สิทธิ์ไม่เพียงพอ: นักกายภาพไม่สามารถแก้ไขข้อมูลของเพื่อนร่วมงานหรือผู้ดูแลระบบได้">
                                      🔒 Read-Only
                                    </span>
                                  ) : (
                                    <>
                                      {/* Modal B: Edit Account button */}
                                      <button
                                        onClick={() => {
                                          if (canEdit) {
                                            setEditingUser(user);
                                          } else {
                                            showToast('สิทธิ์ไม่เพียงพอ: นักกายภาพสามารถแก้ไขได้เฉพาะคนไข้เท่านั้น');
                                          }
                                        }}
                                        disabled={!canEdit}
                                        title="Edit Account (แก้ไขข้อมูลบัญชี, สิทธิ์, รหัสผ่าน, สถานะ)"
                                        className={`px-2.5 py-1 rounded-xl border text-xs font-bold transition flex items-center gap-1 ${
                                          canEdit
                                            ? 'border-slate-200 text-slate-700 hover:bg-emerald-50 hover:text-emerald-700 hover:border-emerald-300 cursor-pointer shadow-xs'
                                            : 'border-slate-100 text-slate-300 cursor-not-allowed bg-slate-50'
                                        }`}
                                      >
                                        <Pencil className="w-3 h-3" />
                                        <span>Edit</span>
                                      </button>

                                      {/* Modal C: Biometric Reset button */}
                                      <button
                                        onClick={() => {
                                          setBiometricResetUser(user);
                                        }}
                                        title="Biometric Reset (ดูเวกเตอร์ใบหน้า, ลบอัตลักษณ์ หรือเปิดกล้องสแกน 10 ช็อตใหม่)"
                                        className="px-2.5 py-1 rounded-xl border border-cyan-300 bg-cyan-50/70 text-cyan-800 hover:bg-cyan-100 text-xs font-bold transition flex items-center gap-1 cursor-pointer shadow-xs"
                                      >
                                        <Camera className="w-3 h-3 text-cyan-700" />
                                        <span>Face Reset</span>
                                      </button>

                                      {/* Delete User */}
                                      <button
                                        onClick={() => {
                                          if (canDelete) {
                                            setDeletingUser(user);
                                          } else {
                                            showToast(
                                              user.role === 'admin'
                                                ? 'ไม่สามารถลบบัญชีแอดมินใหญ่ได้'
                                                : 'คุณสามารถลบได้เฉพาะคนไข้ที่ตนเองดูแล'
                                            );
                                          }
                                        }}
                                        disabled={!canDelete}
                                        title={canDelete ? 'ลบบัญชีผู้ใช้งาน' : 'ลบได้เฉพาะคนไข้ที่ตนเองดูแลเท่านั้น'}
                                        className={`p-1.5 rounded-xl border transition ${
                                          canDelete
                                            ? 'border-slate-200 text-rose-600 hover:bg-rose-50 hover:border-rose-300 cursor-pointer shadow-xs'
                                            : 'border-slate-100 text-slate-300 cursor-not-allowed bg-slate-50'
                                        }`}
                                      >
                                        <Trash2 className="w-3 h-3" />
                                      </button>
                                    </>
                                  )}
                                </div>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>

                {/* Pagination */}
                <div className="py-4 px-6 border-t border-emerald-100 flex items-center justify-between text-xs text-slate-500 font-semibold">
                  <div>
                    แสดง {Math.min(filteredUsers.length, (userPage - 1) * userPageSize + 1)}-
                    {Math.min(filteredUsers.length, userPage * userPageSize)} จาก {filteredUsers.length} รายการ
                  </div>

                  <div className="flex items-center gap-1.5">
                    {Array.from({ length: totalUserPages }).map((_, idx) => {
                      const p = idx + 1;
                      return (
                        <button
                          key={p}
                          onClick={() => setUserPage(p)}
                          className={`w-7 h-7 rounded-full font-bold flex items-center justify-center transition cursor-pointer ${
                            userPage === p
                              ? 'bg-[#10B981] text-white shadow-sm'
                              : 'text-slate-600 hover:bg-emerald-50 hover:text-emerald-800'
                          }`}
                        >
                          {p}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ================================================================== */}
          {/* PAGE 2: ข้อมูลคนไข้ (Patient Data)                                    */}
          {/* ================================================================== */}
          {activeTab === 'patients' && (
            <div className="space-y-6 animate-fadeIn">
              {/* Header bar */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h3 className="font-bold text-lg text-[#0F2F2B]">
                    {currentRole === 'therapist'
                      ? 'ข้อมูลเวชระเบียนคนไข้ (นักกายภาพบำบัด)'
                      : 'ข้อมูลเวชระเบียนคนไข้ทั้งหมด'}
                  </h3>
                  <p className="text-xs text-slate-500">
                    {currentRole === 'therapist'
                      ? 'คุณสามารถดูและแก้ไขเวชระเบียนเฉพาะคนไข้ที่ตนเองดูแลได้ (คนไข้ท่านอื่นดูข้อมูลได้เท่านั้น)'
                      : 'สิทธิ์แอดมินใหญ่: สามารถดูและแก้ไขเวชระเบียนคนไข้ทั้งหมดในระบบได้'}
                  </p>
                </div>

                <div className="flex items-center gap-3 flex-wrap">
                  {/* PT Filter Toggle */}
                  {currentRole === 'therapist' && (
                    <div className="flex items-center gap-1 p-1 bg-white border border-emerald-200 rounded-full shadow-2xs">
                      <button
                        onClick={() => setPatientCareFilter('assigned')}
                        className={`px-3 py-1.5 rounded-full text-xs font-bold transition cursor-pointer ${
                          patientCareFilter === 'assigned'
                            ? 'bg-[#10B981] text-white shadow-xs'
                            : 'text-slate-600 hover:text-emerald-800'
                        }`}
                      >
                        เฉพาะที่ฉันดูแล
                      </button>
                      <button
                        onClick={() => setPatientCareFilter('all')}
                        className={`px-3 py-1.5 rounded-full text-xs font-bold transition cursor-pointer ${
                          patientCareFilter === 'all'
                            ? 'bg-[#0F2F2B] text-emerald-300 shadow-xs'
                            : 'text-slate-600 hover:text-emerald-800'
                        }`}
                      >
                        คนไข้ทั้งหมด
                      </button>
                    </div>
                  )}

                  <div className="w-64 relative">
                    <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={patientSearch}
                      onChange={(e) => setPatientSearch(e.target.value)}
                      placeholder="ค้นหาชื่อ, รหัส, อาการ..."
                      className="w-full pl-9 pr-3 py-2 rounded-full bg-white border border-emerald-200 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-[#10B981]"
                    />
                  </div>

                  <button
                    onClick={() => {
                      initializeFromSupabase();
                      showToast('ซิงค์ข้อมูลกับ Supabase เรียบร้อยแล้ว');
                    }}
                    className="p-2 rounded-full border border-emerald-200 text-emerald-700 bg-white hover:bg-emerald-50 transition cursor-pointer shadow-2xs active:scale-95 flex items-center justify-center"
                    title="รีเฟรชข้อมูลจาก Supabase"
                  >
                    <RefreshCw className="w-4 h-4" />
                  </button>

                  <button
                    onClick={() => setIsReceptionOpen(true)}
                    className="px-4 py-2 rounded-full bg-gradient-to-r from-[#10B981] via-[#06B6D4] to-[#2563EB] text-white text-xs font-bold shadow-md shadow-cyan-500/25 hover:opacity-95 transition flex items-center gap-2 cursor-pointer whitespace-nowrap active:scale-95"
                  >
                    <Plus className="w-4 h-4" />
                    <span>+ ลงทะเบียนคนไข้ใหม่</span>
                  </button>
                </div>
              </div>

              {/* Patient List Cards */}
              <div className="space-y-4">
                {filteredPatients.length === 0 ? (
                  <div className="bg-white rounded-3xl p-10 text-center text-slate-400 border border-emerald-100">
                    ไม่พบข้อมูลคนไข้ที่ค้นหา
                  </div>
                ) : (
                  filteredPatients.map((patient) => (
                    <div
                      key={patient.id}
                      className={`bg-white rounded-3xl p-6 border shadow-sm space-y-4 transition ${
                        patient.status === 'pending_info'
                          ? 'border-2 border-amber-400 bg-amber-50/25 ring-2 ring-amber-300/40 shadow-md'
                          : 'border border-emerald-100 hover:border-emerald-300'
                      }`}
                    >
                      {/* Patient Main Bar */}
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-emerald-50 pb-3">
                        <div className="flex items-center gap-3">
                          {(() => {
                            const faceImg = patient.face_image_url || patientFaceStorageService.getProfileFaceImage(patient.code);
                            return faceImg ? (
                              <img
                                src={faceImg}
                                alt={patient.name}
                                className="w-12 h-12 rounded-2xl object-cover shadow-md border-2 border-emerald-300"
                              />
                            ) : (
                              <div className={`w-12 h-12 rounded-2xl text-white font-black text-lg flex items-center justify-center shadow-md ${
                                patient.status === 'pending_info'
                                  ? 'bg-gradient-to-br from-amber-500 to-amber-700'
                                  : 'bg-gradient-to-br from-[#10B981] to-[#059669]'
                              }`}>
                                {patient.name.charAt(patient.name.startsWith('นาย') || patient.name.startsWith('นาง') ? 3 : 0)}
                              </div>
                            );
                          })()}
                          <div>
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-extrabold text-base text-[#0F2F2B]">{patient.name}</span>
                              <span className="px-2 py-0.5 rounded-full bg-emerald-50 border border-emerald-200 font-mono text-xs font-bold text-emerald-800">
                                {patient.code}
                              </span>
                              {patient.status === 'pending_info' ? (
                                <span className="inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full bg-amber-100 border border-amber-300 font-extrabold text-xs text-amber-900 shadow-xs animate-pulse">
                                  <Clock className="w-3.5 h-3.5 text-amber-700" />
                                  <span>บัญชีนี้สแกนหน้าแล้ว รอลงข้อมูลส่วนตัว</span>
                                </span>
                              ) : (
                                <span className="text-xs font-semibold text-slate-500">
                                  อายุ {patient.age || 65} ปี • {patient.gender === 'female' ? 'หญิง' : 'ชาย'}
                                </span>
                              )}
                              {(() => {
                                const hasBiometrics = Boolean(
                                  patient.face_vector ||
                                  (patient as any).biometricVector ||
                                  patient.face_image_url ||
                                  ((patient as any).medical_history && (patient as any).medical_history.includes('FACE_EMB')) ||
                                  patientFaceStorageService.getProfileFaceImage(patient.code)
                                );
                                return hasBiometrics ? (
                                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-50 border border-emerald-300 font-bold text-[11px] text-emerald-800">
                                    <Camera className="w-3 h-3 text-emerald-600" />
                                    <span>บันทึกใบหน้าแล้ว 🟢</span>
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-amber-50 border border-amber-300 font-bold text-[11px] text-amber-800 animate-pulse">
                                    <AlertCircle className="w-3 h-3 text-amber-600" />
                                    <span>ยังไม่บันทึกใบหน้า ⚠️</span>
                                  </span>
                                );
                              })()}
                            </div>
                            <div className="text-xs text-slate-500 mt-0.5 flex items-center gap-3">
                              <span>โทร: <strong className="text-slate-700">{patient.phone || 'ยังไม่ได้ระบุ'}</strong></span>
                              <span>•</span>
                              <span>วันที่เริ่มเข้าระบบ: <strong className="text-emerald-800">{patient.created_at || '2026-02-01'}</strong></span>
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          {/* Face Enrollment Button */}
                          <button
                            onClick={() => setEnrollingFacePatient(patient)}
                            className="px-3.5 py-2 rounded-full border border-teal-300 bg-teal-50 hover:bg-teal-100 text-teal-800 text-xs font-bold transition cursor-pointer flex items-center gap-1.5 shadow-2xs active:scale-95"
                            title="สแกนใบหน้าคนไข้ 10 ช็อต หรืออัปโหลดรูป เพื่อให้ตู้ Kiosk จดจำใบหน้าได้ทันที"
                          >
                            <Camera className="w-3.5 h-3.5 text-teal-600" />
                            <span>สแกน/ผูกใบหน้า</span>
                          </button>
                          {patient.status === 'pending_info' ? (
                            <button
                              onClick={() => setPatientDetailModal({ ...patient })}
                              className="px-4 py-2 rounded-full bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-white font-extrabold text-xs shadow-md transition flex items-center gap-1.5 cursor-pointer active:scale-95"
                              title="กรอกข้อมูลคนไข้และซิงค์กลับตู้ Kiosk ทันที"
                            >
                              <Pencil className="w-3.5 h-3.5 text-white" />
                              <span>กรอกข้อมูลคนไข้ (ซิงค์ตู้ Kiosk)</span>
                            </button>
                          ) : (
                            <button
                              onClick={() => setPatientDetailModal({ ...patient })}
                              className={`px-4 py-2 rounded-full border text-xs font-bold transition cursor-pointer flex items-center gap-1.5 ${
                                canEditUser(patient)
                                  ? 'border-emerald-200 text-emerald-800 hover:bg-emerald-50'
                                  : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                              }`}
                              title={
                                canEditUser(patient)
                                  ? 'ดูและแก้ไขข้อมูลเวชระเบียนคนไข้'
                                  : 'ดูข้อมูลเวชระเบียน (โหมดดูอย่างเดียว)'
                              }
                            >
                              {canEditUser(patient) ? (
                                <>
                                  <Pencil className="w-3.5 h-3.5 text-emerald-600" />
                                  <span>ดูและแก้ไขข้อมูล</span>
                                </>
                              ) : (
                                <>
                                  <Eye className="w-3.5 h-3.5 text-slate-500" />
                                  <span>ดูข้อมูลคนไข้</span>
                                </>
                              )}
                            </button>
                          )}

                          {onSelectPatientForKiosk && (
                            <button
                              onClick={() => {
                                onSelectPatientForKiosk({
                                  ...patient,
                                  code: patient.code || (patient as any).patient_code || '',
                                  patient_code: (patient as any).patient_code || patient.code || '',
                                  name: patient.name || 'ผู้รับบริการ',
                                  id: patient.id || patient.code || (patient as any).patient_code || String(Date.now()),
                                });
                                showToast(`เลือกคนไข้ ${patient.name} เข้าสู่ระบบเรียบร้อย`);
                                onClose();
                              }}
                              className="px-4 py-2 rounded-full bg-gradient-to-r from-[#10B981] via-[#06B6D4] to-[#2563EB] text-white text-xs font-bold hover:opacity-95 transition flex items-center gap-1.5 cursor-pointer shadow-md shadow-cyan-500/25 active:scale-95"
                            >
                              <Play className="w-3.5 h-3.5" />
                              <span>เข้าทำกายภาพที่ตู้</span>
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Clinical Grid Details */}
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
                        {/* 1. ประวัติการซักประวัติ */}
                        <div className="p-3.5 rounded-2xl bg-emerald-50/50 border border-emerald-100 space-y-1">
                          <div className="font-bold text-emerald-900 flex items-center gap-1.5">
                            <FileText className="w-3.5 h-3.5 text-emerald-600" />
                            <span>ประวัติการซักประวัติ (Chief Complaint)</span>
                          </div>
                          <p className="text-slate-600 leading-relaxed text-[11px]">
                            {patient.chiefComplaint || patient.diagnosis || 'มีอาการปวดตึงข้อไหล่และกล้ามเนื้อเรื้อรัง'}
                          </p>
                        </div>

                        {/* 2. หมอที่รับผิดชอบ & ประวัติคนไข้ */}
                        <div className="p-3.5 rounded-2xl bg-emerald-50/50 border border-emerald-100 space-y-1">
                          <div className="font-bold text-emerald-900 flex items-center gap-1.5">
                            <Stethoscope className="w-3.5 h-3.5 text-emerald-600" />
                            <span>หมอที่รับผิดชอบ & ประวัติโรค</span>
                          </div>
                          <div className="text-[11px] text-slate-700">
                            <strong>แพทย์/กภ.:</strong> {patient.assignedTherapistName || 'กภ. ธนากร วงศ์สวัสดิ์'}
                          </div>
                          <div className="text-[11px] text-slate-600">
                            <strong>ประวัติคนไข้:</strong> {(patient.patientBackground || '')
                              .replace(/\[PENDING_INFO\]/g, '')
                              .replace(/FACE_EMB:\[.*?\]/gs, '')
                              .replace(/FACE_PHOTO:data:image\/[^\s\n]+/g, '')
                              .replace(/รอลงข้อมูลส่วนตัว/g, '')
                              .trim() || 'ความดันโลหิตปกติ ไม่มีประวัติผ่าตัด'}
                          </div>
                        </div>

                        {/* 3. ผลการรักษา */}
                        <div className="p-3.5 rounded-2xl bg-emerald-50/50 border border-emerald-100 space-y-1">
                          <div className="font-bold text-emerald-900 flex items-center gap-1.5">
                            <Activity className="w-3.5 h-3.5 text-emerald-600" />
                            <span>ผลการรักษา (Outcome / ROM)</span>
                          </div>
                          <p className="text-slate-600 leading-relaxed text-[11px]">
                            {patient.treatmentOutcome || 'ROM องศาเพิ่มขึ้น 12°, อาการปวดลดลง ความสม่ำเสมอ 92%'}
                          </p>
                        </div>

                        {/* 4. โน้ต/คำแนะนำจากนักกายภาพ */}
                        <div className="p-3.5 rounded-2xl bg-amber-50/70 border border-amber-200/80 space-y-1">
                          <div className="font-bold text-amber-900 flex items-center gap-1.5">
                            <Sparkles className="w-3.5 h-3.5 text-amber-600" />
                            <span>โน้ตคำแนะนำจากนักกายภาพ</span>
                          </div>
                          <p className="text-slate-700 leading-relaxed text-[11px]">
                            {(patient.therapistNotes || '')
                              .replace(/\[PENDING_INFO\]/g, '')
                              .replace(/บัญชีนี้สแกนหน้าแล้ว รอลงข้อมูลส่วนตัว/g, '')
                              .trim() || 'เน้นฝึกยืดเหยียดเบาๆ สม่ำเสมอ ไม่ฝืนยกของหนักเกิน 3 กก.'}
                          </p>
                        </div>
                      </div>

                      {/* 5. Assigned Physical Therapy Schedule Banner */}
                      {(() => {
                        const ptPlan = treatmentPlans.find(
                          (p) =>
                            String(p.patientId) === String(patient.id) ||
                            p.patientCode === patient.code ||
                            p.patientName === patient.name
                        );
                        return (
                          <div className="p-3.5 rounded-2xl bg-emerald-50/80 border border-emerald-200/90 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                            <div className="space-y-1.5 min-w-0">
                              <div className="font-bold text-emerald-950 flex items-center gap-2 flex-wrap">
                                <div className="flex items-center gap-1.5 text-emerald-800">
                                  <CalendarDays className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                                  <span>ตารางฝึกกายภาพที่มอบหมาย:</span>
                                </div>
                                {ptPlan ? (
                                  <span className="px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-900 text-[11px] font-bold border border-emerald-300">
                                    {ptPlan.assignedExercises.length} ท่าฝึก (
                                    {ptPlan.status === 'active'
                                      ? 'กำลังรักษา 🟢'
                                      : ptPlan.status === 'paused'
                                      ? 'พักชั่วคราว 🟡'
                                      : 'เสร็จสิ้น 🔵'}
                                    )
                                  </span>
                                ) : (
                                  <span className="px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-500 text-[11px] font-semibold border border-slate-200">
                                    ยังไม่มีตารางฝึก
                                  </span>
                                )}
                              </div>
                              {ptPlan ? (
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  {ptPlan.assignedExercises.map((ex, i) => (
                                    <span
                                      key={i}
                                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl bg-white border border-emerald-200 text-[#0F2F2B] font-semibold text-[11px] shadow-2xs"
                                    >
                                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                                      <strong>{ex.exerciseName}</strong>
                                      <span className="text-slate-400">
                                        ({ex.sets} เซ็ต × {ex.reps} ครั้ง {ex.holdSeconds}s)
                                      </span>
                                    </span>
                                  ))}
                                </div>
                              ) : (
                                <p className="text-slate-500 text-[11px]">
                                  คนไข้รายนี้ยังไม่ได้รับการมอบหมายโปรแกรมท่าฝึกกายภาพบำบัด
                                </p>
                              )}
                            </div>

                            <div className="flex items-center gap-2 flex-shrink-0">
                              <button
                                onClick={() => {
                                  if (ptPlan) {
                                    setSelectedPlanForEdit(ptPlan);
                                  } else {
                                    setSelectedPlanForEdit({
                                      id: '',
                                      patientId: patient.id,
                                      patientName: patient.name,
                                      patientCode: patient.code,
                                      therapistId: currentUserId,
                                      therapistName:
                                        currentRole === 'therapist'
                                          ? currentUser?.name || 'นักกายภาพ'
                                          : patient.assignedTherapistName || 'กภ. ธนากร วงศ์สวัสดิ์',
                                      diagnosis:
                                        patient.diagnosis ||
                                        patient.chiefComplaint ||
                                        'ฟื้นฟูกล้ามเนื้อและข้อต่อ',
                                      targetJoint: 'ข้อต่อและกล้ามเนื้อ',
                                      assignedExercises: [
                                        {
                                          exerciseSlug: 'shoulder_raise',
                                          exerciseName: 'กางแขนยกด้านข้าง',
                                          sets: 3,
                                          reps: 10,
                                          holdSeconds: 3,
                                          difficulty: 'beginner',
                                        },
                                      ],
                                      clinicalNotes: 'ฝึกอย่างสม่ำเสมอ พักระหว่างเซ็ต',
                                      createdAt: new Date().toISOString().split('T')[0],
                                      status: 'active',
                                    } as TreatmentPlan);
                                  }
                                  setIsTreatmentPlanModalOpen(true);
                                }}
                                className="px-3 py-1.5 rounded-full border border-emerald-300 bg-white hover:bg-emerald-50 text-emerald-800 font-bold text-xs transition cursor-pointer flex items-center gap-1.5 shadow-2xs"
                              >
                                <CalendarDays className="w-3.5 h-3.5 text-emerald-600" />
                                <span>{ptPlan ? 'ปรับตารางฝึก' : '+ จัดตารางฝึก'}</span>
                              </button>
                            </div>
                          </div>
                        );
                      })()}
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {/* ================================================================== */}
          {/* PAGE 3: ตารางกายภาพ (Physical Therapy Schedules - Admin & Therapist)*/}
          {/* ================================================================== */}
          {activeTab === 'schedules' && (
            <div className="space-y-5 sm:space-y-6 animate-fadeIn">
              {/* Header Bar: Dynamically adapts to Individual vs Combined Calendar */}
              {scheduleViewMode === 'individual' ? (
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 animate-fadeIn">
                  <div>
                    <h3 className="font-black text-xl text-[#0F2F2B] flex items-center gap-2">
                      <CalendarDays className="w-5 h-5 text-[#0097A7]" />
                      <span>ปฏิทินนัดหมายคนไข้ (รายบุคคล)</span>
                    </h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      แตะวันที่ในปฏิทินเพื่อเริ่มตัดคอร์สกายภาพให้คนไข้ที่เลือก
                    </p>
                  </div>

                  {/* Patient Info Card (Image 2 Top-Right) */}
                  <div className="flex items-center gap-3 bg-white px-4 py-2.5 rounded-2xl border border-slate-200 shadow-2xs">
                    <div className="w-10 h-10 rounded-full bg-[#0097A7] text-white flex items-center justify-center flex-shrink-0 shadow-sm">
                      <User className="w-5 h-5" />
                    </div>
                    <div className="min-w-0 text-left">
                      <div className="text-[10px] text-slate-400 font-semibold leading-tight">กำลังจัดคอร์สให้</div>
                      <div className="flex items-center gap-2">
                        <span className="font-black text-sm text-slate-800 truncate">
                          {selectedCalendarPatient?.name || users.find((u) => u.role === 'patient')?.name || 'ยังไม่มีคนไข้'}
                        </span>
                        <span className="font-mono text-xs font-bold text-slate-400">
                          HN: {selectedCalendarPatient?.code || selectedCalendarPatient?.patient_code || users.find((u) => u.role === 'patient')?.code || '-'}
                        </span>
                      </div>
                    </div>
                    <button
                      onClick={() => setIsPatientPickerModalOpen(true)}
                      className="ml-2 px-3 py-1.5 rounded-full border border-slate-200 hover:border-teal-500 text-xs font-bold text-slate-600 hover:text-teal-700 hover:bg-teal-50 transition cursor-pointer whitespace-nowrap"
                    >
                      เปลี่ยนคนไข้
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 animate-fadeIn">
                  <div>
                    <h3 className="font-black text-xl text-[#0F2F2B] flex items-center gap-2">
                      <CalendarDays className="w-5 h-5 text-[#0097A7]" />
                      <span>ปฏิทินคนไข้รวม (All Patients Calendar)</span>
                    </h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      แสดงภาพรวมตารางนัดหมายและการฝึกกายภาพของคนไข้ทุกคนในโรงพยาบาล
                    </p>
                  </div>

                  {/* Combined Patients Overview Card (Pure Department Overview, No Individual Patient Selector) */}
                  <div className="flex items-center gap-3 bg-white px-4 py-2.5 rounded-2xl border border-slate-200 shadow-2xs">
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#0097A7] to-emerald-600 text-white flex items-center justify-center flex-shrink-0 shadow-sm">
                      <Users className="w-5 h-5" />
                    </div>
                    <div className="min-w-0 text-left">
                      <div className="text-[10px] text-slate-400 font-semibold leading-tight">ภาพรวมคนไข้ทั้งแผนก</div>
                      <div className="flex items-center gap-2">
                        <span className="font-black text-sm text-slate-800 truncate">
                          {users.filter((u) => u.role === 'patient').length} คน
                        </span>
                        <span className="font-mono text-xs font-bold text-teal-700 bg-teal-50 px-2 py-0.5 rounded-full border border-teal-200">
                          รวม {treatmentPlans.length} คอร์ส
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* View Switcher Bar (Matches Image 1 & 2) */}
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pt-1">
                <div className="flex flex-wrap items-center gap-2">
                  {/* Schedule View Pills */}
                  <div className="flex items-center p-1 bg-white border border-emerald-200 rounded-full shadow-2xs flex-wrap gap-1">
                    <button
                      onClick={() => setScheduleViewMode('individual')}
                      className={`px-3.5 py-1.5 rounded-full text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                        scheduleViewMode === 'individual'
                          ? 'bg-[#0097A7] text-white font-black shadow-xs'
                          : 'text-slate-600 hover:text-teal-700'
                      }`}
                      title="มุมมองปฏิทินนัดหมายคนไข้รายบุคคล (ตัดคอร์ส/ตั้งค่ามินิเกม)"
                    >
                      <User className="w-3.5 h-3.5" />
                      <span>ปฏิทินรายบุคคล</span>
                    </button>
                    <button
                      onClick={() => setScheduleViewMode('combined')}
                      className={`px-3.5 py-1.5 rounded-full text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                        scheduleViewMode === 'combined'
                          ? 'bg-[#0097A7] text-white font-black shadow-xs'
                          : 'text-slate-600 hover:text-emerald-800'
                      }`}
                      title="มุมมองปฏิทินคนไข้รวม (แสดงนัดหมายทุกคนในระบบ)"
                    >
                      <Users className="w-3.5 h-3.5" />
                      <span>ปฏิทินคนไข้รวม</span>
                    </button>
                  </div>
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                  {/* Primary Add Schedule Button (Teal style from Image 1) */}
                  <button
                    onClick={() => {
                      setSelectedPlanForEdit(null);
                      setIsTreatmentPlanModalOpen(true);
                    }}
                    className="px-4 py-2 rounded-2xl bg-gradient-to-r from-[#0097A7] to-[#00838F] text-white text-xs font-extrabold shadow-md hover:shadow-lg hover:opacity-95 transition flex items-center gap-1.5 cursor-pointer whitespace-nowrap active:scale-95"
                  >
                    <Plus className="w-4 h-4" />
                    <span>+ สร้างตารางฝึกใหม่</span>
                  </button>
                </div>
              </div>

              {/* Stats Cards */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-3.5">
                <div className="bg-white rounded-2xl p-3 sm:p-3.5 border border-emerald-100 shadow-2xs flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center flex-shrink-0">
                    <CalendarDays className="w-5 h-5" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-xl sm:text-2xl font-black text-[#0F2F2B] leading-none">
                      {treatmentPlans.length}
                    </div>
                    <div className="text-[11px] text-slate-500 font-semibold mt-1 truncate">ตารางนัดหมายทั้งหมด</div>
                  </div>
                </div>

                <div className="bg-white rounded-2xl p-3 sm:p-3.5 border border-emerald-100 shadow-2xs flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center flex-shrink-0">
                    <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-xl sm:text-2xl font-black text-[#0F2F2B] leading-none">
                      {treatmentPlans.filter((p) => p.status === 'active').length}
                    </div>
                    <div className="text-[11px] text-slate-500 font-semibold mt-1 truncate">กำลังรักษา (Active)</div>
                  </div>
                </div>

                <div className="bg-white rounded-2xl p-3 sm:p-3.5 border border-emerald-100 shadow-2xs flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center flex-shrink-0">
                    <Clock className="w-5 h-5 text-amber-600" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-xl sm:text-2xl font-black text-[#0F2F2B] leading-none">
                      {treatmentPlans.filter((p) => p.status === 'paused').length}
                    </div>
                    <div className="text-[11px] text-slate-500 font-semibold mt-1 truncate">พักชั่วคราว (Paused)</div>
                  </div>
                </div>

                <div className="bg-white rounded-2xl p-3 sm:p-3.5 border border-emerald-100 shadow-2xs flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center flex-shrink-0">
                    <Activity className="w-5 h-5 text-blue-600" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-xl sm:text-2xl font-black text-[#0F2F2B] leading-none">
                      {treatmentPlans.filter((p) => p.status === 'completed').length}
                    </div>
                    <div className="text-[11px] text-slate-500 font-semibold mt-1 truncate">สำเร็จแล้ว (Completed)</div>
                  </div>
                </div>
              </div>






                            {/* ================================================================== */}
              {/* INTERACTIVE CALENDAR VIEW (รองรับทั้งรายบุคคล และ ปฏิทินคนไข้รวม)       */}
              {/* ================================================================== */}
              <div className="space-y-6 animate-fadeIn text-left">
                  {/* Calendar Card Container matching Image 2 */}
                  <div className="bg-white rounded-[32px] border border-slate-100 shadow-sm p-6 sm:p-8 space-y-6">
                    {/* Header: Month Navigator + Status Legends */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-3 border-b border-slate-100">
                      <div className="flex items-center gap-3">
                        <button
                          type="button"
                          onClick={() => {
                            if (scheduleSelectedMonth === 0) {
                              setScheduleSelectedMonth(11);
                              setScheduleSelectedYear(scheduleSelectedYear - 1);
                            } else {
                              setScheduleSelectedMonth(scheduleSelectedMonth - 1);
                            }
                          }}
                          className="w-9 h-9 rounded-full border border-slate-200 hover:bg-slate-50 flex items-center justify-center text-slate-600 transition cursor-pointer"
                          title="เดือนก่อนหน้า"
                        >
                          <ChevronLeft className="w-5 h-5" />
                        </button>

                        <h2 className="text-xl sm:text-2xl font-black text-[#0F2F2B] tracking-tight">
                          {THAI_MONTH_NAMES[scheduleSelectedMonth]} {scheduleSelectedYear + 543}
                        </h2>

                        <button
                          type="button"
                          onClick={() => {
                            if (scheduleSelectedMonth === 11) {
                              setScheduleSelectedMonth(0);
                              setScheduleSelectedYear(scheduleSelectedYear + 1);
                            } else {
                              setScheduleSelectedMonth(scheduleSelectedMonth + 1);
                            }
                          }}
                          className="w-9 h-9 rounded-full border border-slate-200 hover:bg-slate-50 flex items-center justify-center text-slate-600 transition cursor-pointer"
                          title="เดือนถัดไป"
                        >
                          <ChevronRight className="w-5 h-5" />
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            setScheduleSelectedMonth(9);
                            setScheduleSelectedYear(2026);
                            setSelectedCalendarDay(14);
                          }}
                          className="px-3.5 py-1 rounded-full bg-emerald-50 text-emerald-700 text-xs font-black border border-emerald-200 hover:bg-emerald-100 transition cursor-pointer"
                        >
                          วันนี้
                        </button>

                        {/* View Mode Indicator Badge */}
                        <div
                          className={`hidden md:inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black border transition ${
                            scheduleViewMode === 'individual'
                              ? 'bg-teal-50 text-teal-800 border-teal-200'
                              : 'bg-emerald-50 text-emerald-800 border-emerald-200'
                          }`}
                        >
                          {scheduleViewMode === 'individual' ? (
                            <>
                              <User className="w-3.5 h-3.5 text-teal-600" />
                              <span>รายบุคคล: {(selectedCalendarPatient?.name || users.find((u) => u.role === 'patient')?.name || 'คนไข้').replace(/^(นาย|นาง|นางสาว|เด็กชาย|เด็กหญิง)\s*/, '')}</span>
                            </>
                          ) : (
                            <>
                              <Users className="w-3.5 h-3.5 text-emerald-600" />
                              <span>นัดหมายคนไข้รวมทุกคน</span>
                            </>
                          )}
                        </div>

                        {/* Selected Day Quick Action: Delete Date button */}
                        {calendarAppointments[selectedCalendarDay]?.length > 0 && (
                          <button
                            type="button"
                            onClick={(e) => handleDeleteDayAppointments(selectedCalendarDay, e)}
                            className="px-3.5 py-1 rounded-full bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-black border border-rose-300 transition flex items-center gap-1.5 cursor-pointer shadow-2xs active:scale-95"
                            title={`ลบวันนัดหมายวันที่ ${selectedCalendarDay} ${THAI_MONTH_NAMES[scheduleSelectedMonth]}`}
                          >
                            <Trash2 className="w-3.5 h-3.5 text-rose-600" />
                            <span>ลบวันนัด (วันที่ {selectedCalendarDay})</span>
                          </button>
                        )}
                      </div>

                      {/* Status Legends matching Image 2 */}
                      <div className="flex items-center gap-4 flex-wrap">
                        <div className="flex items-center gap-1.5">
                          <span className="w-2.5 h-2.5 rounded-full bg-[#10B981]" />
                          <span className="text-xs font-bold text-slate-600">กำลังรักษา</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span className="w-2.5 h-2.5 rounded-full bg-[#F59E0B]" />
                          <span className="text-xs font-bold text-slate-600">พักการฝึก</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span className="w-2.5 h-2.5 rounded-full bg-[#3B82F6]" />
                          <span className="text-xs font-bold text-slate-600">สำเร็จครบโปรแกรม</span>
                        </div>
                      </div>
                    </div>

                    {/* Weekday Columns Header (7 Columns) with colored dots matching Image 2 */}
                    <div className="grid grid-cols-7 gap-2.5 sm:gap-3 text-center">
                      <div className="flex items-center justify-center gap-1.5 text-xs font-black text-slate-700 py-1">
                        <span className="w-2 h-2 rounded-full bg-amber-500" />
                        <span>จ.</span>
                      </div>
                      <div className="flex items-center justify-center gap-1.5 text-xs font-black text-slate-700 py-1">
                        <span className="w-2 h-2 rounded-full bg-pink-500" />
                        <span>อ.</span>
                      </div>
                      <div className="flex items-center justify-center gap-1.5 text-xs font-black text-slate-700 py-1">
                        <span className="w-2 h-2 rounded-full bg-emerald-500" />
                        <span>พ.</span>
                      </div>
                      <div className="flex items-center justify-center gap-1.5 text-xs font-black text-slate-700 py-1">
                        <span className="w-2 h-2 rounded-full bg-orange-500" />
                        <span>พฤ.</span>
                      </div>
                      <div className="flex items-center justify-center gap-1.5 text-xs font-black text-slate-700 py-1">
                        <span className="w-2 h-2 rounded-full bg-blue-500" />
                        <span>ศ.</span>
                      </div>
                      <div className="flex items-center justify-center gap-1.5 text-xs font-black text-slate-700 py-1">
                        <span className="w-2 h-2 rounded-full bg-purple-500" />
                        <span>ส.</span>
                      </div>
                      <div className="flex items-center justify-center gap-1.5 text-xs font-black text-slate-700 py-1">
                        <span className="w-2 h-2 rounded-full bg-rose-500" />
                        <span>อา.</span>
                      </div>
                    </div>

                    {/* 35 Calendar Cells (October 2569 / 2026) */}
                    <div className="grid grid-cols-7 gap-2.5 sm:gap-3">
                      {/* Leading 3 empty cells for Mon, Tue, Wed before Thu Oct 1 */}
                      <div className="bg-slate-50/40 rounded-2xl min-h-[92px] border border-transparent" />
                      <div className="bg-slate-50/40 rounded-2xl min-h-[92px] border border-transparent" />
                      <div className="bg-slate-50/40 rounded-2xl min-h-[92px] border border-transparent" />

                      {/* Days 1 to 31 */}
                      {Array.from({ length: 31 }, (_, i) => i + 1).map((day) => {
                        const isToday = day === 14;
                        const isSelected = day === selectedCalendarDay;
                        // Strictly filter out non-patients and only show real patients currently in users
                        const rawApts = calendarAppointments[day] || [];
                        const dayAppointments = rawApts.filter((apt) => {
                          const n = (apt.name || '').toLowerCase().trim();
                          if (!n) return false;
                          const cleanName = n.replace(/^(นาย|นาง|นางสาว|เด็กชาย|เด็กหญิง)\s*/, '').trim().toLowerCase();
                          return users.some(
                            (u) =>
                              u.role === 'patient' &&
                              (((u.name || '').toLowerCase().replace(/^(นาย|นาง|นางสาว|เด็กชาย|เด็กหญิง)\s*/, '').trim() === cleanName) ||
                                (u.name || '').toLowerCase().includes(cleanName) ||
                                cleanName.includes((u.name || '').toLowerCase().replace(/^(นาย|นาง|นางสาว|เด็กชาย|เด็กหญิง)\s*/, '').trim()) ||
                                (u.username && u.username.toLowerCase() === cleanName) ||
                                (u.code && u.code.toLowerCase() === cleanName))
                          );
                        });

                        const activePatName = selectedCalendarPatient?.name || users.find((u) => u.role === 'patient')?.name || '';
                        const cleanSelectedPatientName = activePatName
                          .replace(/^(นาย|นาง|นางสาว|เด็กชาย|เด็กหญิง)\s*/, '')
                          .trim()
                          .split(' ')[0]
                          .toLowerCase();
                        const displayedAppointments = scheduleViewMode === 'individual'
                          ? dayAppointments.filter(
                              (apt) =>
                                cleanSelectedPatientName &&
                                ((apt.name || '').toLowerCase().includes(cleanSelectedPatientName) ||
                                  cleanSelectedPatientName.includes((apt.name || '').toLowerCase()))
                            )
                          : dayAppointments;

                        return (
                          <div
                            key={day}
                            onClick={() => setSelectedCalendarDay(day)}
                            className={`rounded-2xl min-h-[92px] p-2.5 flex flex-col justify-between transition cursor-pointer select-none relative ${
                              isSelected
                                ? 'border-2 border-[#00A8E8] bg-white shadow-md shadow-cyan-100/80 ring-2 ring-cyan-200/50'
                                : isToday
                                ? 'border-2 border-emerald-500 bg-white shadow-xs'
                                : 'bg-slate-50/60 hover:bg-slate-100/80 border border-transparent hover:border-slate-200'
                            }`}
                          >
                            {/* Day Header Row */}
                            <div className="flex items-center justify-between">
                              <span
                                className={`text-sm font-extrabold ${
                                  isSelected
                                    ? 'text-cyan-700 font-black'
                                    : isToday
                                    ? 'text-emerald-800 font-black'
                                    : 'text-slate-500'
                                }`}
                              >
                                {day}
                              </span>

                              {isToday && (
                                <span className="px-2 py-0.5 rounded-full bg-[#10B981] text-white text-[10px] font-extrabold shadow-2xs">
                                  วันนี้
                                </span>
                              )}
                            </div>

                            {/* Middle: Appointment Pills or Action Button */}
                            <div className="space-y-1 my-1">
                              {displayedAppointments.map((apt, aIdx) => (
                                <div
                                  key={aIdx}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setQuickInfoSelectedDay(day);
                                    const cleanApt = apt.name.replace(/^(นาย|นาง|นางสาว)\s*/, '').trim().toLowerCase();
                                    const targetPat =
                                      users.find(
                                        (u) =>
                                          u.role === 'patient' &&
                                          ((u.name || '').toLowerCase().includes(cleanApt) ||
                                            cleanApt.includes((u.name || '').replace(/^(นาย|นาง|นางสาว)\s*/, '').trim().toLowerCase()) ||
                                            u.username.toLowerCase() === cleanApt)
                                      ) ||
                                      selectedCalendarPatient ||
                                      users.find((u) => u.role === 'patient');
                                    if (targetPat) {
                                      setQuickInfoPatient(targetPat);
                                      setIsQuickInfoModalOpen(true);
                                    }
                                  }}
                                  className={`px-2 py-0.5 rounded-md text-[10px] font-bold truncate transition cursor-pointer hover:opacity-90 flex items-center justify-between gap-1 group/pill ${
                                    apt.type === 'dual'
                                      ? 'bg-gradient-to-r from-emerald-100 via-teal-50 to-purple-100 text-[#064E3B] border border-emerald-300 shadow-2xs font-extrabold'
                                      : apt.type === 'green'
                                      ? 'bg-emerald-100 text-emerald-800'
                                      : apt.type === 'cyan'
                                      ? 'bg-sky-100 text-sky-800'
                                      : 'bg-purple-100 text-purple-800'
                                  }`}
                                  title="คลิกเพื่อดูข้อมูลคนไข้ด่วน"
                                >
                                  <span className="truncate">{apt.time} {apt.name}</span>
                                  <button
                                    type="button"
                                    onClick={(e) => handleDeleteAppointment(day, aIdx, e)}
                                    className="p-0.5 rounded-full hover:bg-rose-200 text-slate-400 hover:text-rose-600 transition flex items-center justify-center flex-shrink-0 cursor-pointer ml-1"
                                    title={`ลบนัดหมาย ${apt.time} ${apt.name}`}
                                  >
                                    <X className="w-2.5 h-2.5 stroke-[3]" />
                                  </button>
                                </div>
                              ))}

                              {/* Selected Day Action Button matching Image 2 (+ ตัดคอร์สที่นี่) */}
                              {isSelected && (
                                <div className="space-y-1 mt-1">
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setSelectedDateForCourse(`2026-10-${String(day).padStart(2, '0')}`);
                                      setIsCourseModeModalOpen(true);
                                    }}
                                    className="w-full py-1.5 px-2 bg-[#009FD9] hover:bg-[#0089BD] text-white rounded-full text-[11px] font-black shadow-xs hover:shadow transition flex items-center justify-center gap-1 active:scale-95 cursor-pointer"
                                    title="คลิกเพื่อเลือกรูปแบบการฝึกและตัดคอร์ส"
                                  >
                                    <span>+ ตัดคอร์สที่นี่</span>
                                  </button>
                                  {dayAppointments.length > 0 && (
                                    <button
                                      type="button"
                                      onClick={(e) => handleDeleteDayAppointments(day, e)}
                                      className="w-full py-1 px-2 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-300 rounded-full text-[10px] font-black shadow-2xs hover:shadow transition flex items-center justify-center gap-1 active:scale-95 cursor-pointer"
                                      title={`ลบวันนัดหมายวันที่ ${day} ${THAI_MONTH_NAMES[scheduleSelectedMonth]}`}
                                    >
                                      <Trash2 className="w-3 h-3 text-rose-600" />
                                      <span>ลบวันนัด</span>
                                    </button>
                                  )}
                                </div>
                              )}
                            </div>

                            {/* Bottom spacer */}
                            <div className="h-0.5" />
                          </div>
                        );
                      })}

                      {/* Trailing 1 empty cell to complete 35 cells grid */}
                      <div className="bg-slate-50/40 rounded-2xl min-h-[92px] border border-transparent" />
                    </div>
                  </div>
                </div>
              </div>
          )}

          {/* ================================================================== */}
          {/* PAGE 3: ข้อมูลนักกายภาพ (Physiotherapist Data)                        */}
          {/* ================================================================== */}
          {/* ================================================================== */}
          {/* PAGE 4: ข้อมูลนักกายภาพ & PT WORKSPACE                              */}
          {/* ================================================================== */}
          {activeTab === 'therapists' && (
            currentRole === 'therapist' ? (
              /* ============================================================= */
              /* PT WORKSPACE & CASE MANAGEMENT (MODULE 4 SPECIFICATION)       */
              /* ============================================================= */
              <div className="space-y-6 animate-fadeIn text-left">
                {/* Header */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div>
                    <h3 className="font-black text-xl text-[#0F2F2B] flex items-center gap-2">
                      <Stethoscope className="w-6 h-6 text-emerald-600" />
                      <span>PT Workspace & การจัดการเคสคนไข้</span>
                    </h3>
                    <p className="text-xs text-slate-500 mt-1">
                      พื้นที่ทำงานส่วนบุคคลสำหรับนักกายภาพบำบัด: ข้อมูลเวชปฏิบัติ, เคสคนไข้ในความดูแลหลัก และระบบฝากเคสชั่วคราว (Temporary Delegation)
                    </p>
                  </div>

                  <div className="flex items-center gap-2.5">
                    <button
                      onClick={() => setIsDelegationModalOpen(true)}
                      className="px-4 py-2.5 rounded-2xl bg-gradient-to-r from-[#10B981] via-[#06B6D4] to-[#2563EB] text-white text-xs font-black shadow-md shadow-cyan-500/25 hover:opacity-95 transition flex items-center gap-2 cursor-pointer active:scale-95"
                      title="มอบหมายสิทธิ์ดูแลคนไข้ให้เพื่อนนักกายภาพบำบัดดูแลแทนชั่วคราว พร้อมระบุช่วงเวลา"
                    >
                      <Plus className="w-4 h-4" />
                      <span>+ ฝากเคสชั่วคราว (Assign Temporary Coverage)</span>
                    </button>
                  </div>
                </div>

                {/* SECTION 1: PERSONAL PROFILE CARD (MY PROFILE) */}
                <div className="bg-white rounded-3xl p-6 sm:p-7 border border-emerald-200 shadow-sm relative overflow-hidden">
                  <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-br from-emerald-100/40 via-cyan-100/30 to-transparent rounded-full -mr-20 -mt-20 pointer-events-none" />

                  <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 relative z-10">
                    <div className="flex flex-col sm:flex-row items-start sm:items-center gap-5">
                      {/* Avatar / Photo */}
                      <div className="relative group">
                        {currentTherapist?.photoUrl ? (
                          <img
                            src={currentTherapist.photoUrl}
                            alt={currentTherapist.name}
                            className="w-20 h-20 rounded-3xl object-cover border-2 border-emerald-400 shadow-md shadow-emerald-500/20"
                          />
                        ) : (
                          <div className="w-20 h-20 rounded-3xl bg-gradient-to-br from-[#0F2F2B] via-emerald-900 to-[#0A2540] text-emerald-200 font-black text-2xl flex items-center justify-center shadow-md shadow-emerald-950/20">
                            {currentTherapist?.name ? currentTherapist.name.charAt(currentTherapist.name.startsWith('กภ.') ? 4 : 0) : 'ก'}
                          </div>
                        )}
                        <span className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-emerald-500 border-2 border-white flex items-center justify-center text-[10px] text-white" title="Active">
                          ✓
                        </span>
                      </div>

                      {/* Name & Credentials */}
                      <div className="space-y-1.5">
                        <div className="flex items-center gap-2.5 flex-wrap">
                          <h4 className="font-black text-lg sm:text-xl text-[#0F2F2B]">
                            {currentTherapist?.name || currentUser?.name || 'กภ. ธนากร วงศ์สวัสดิ์'}
                          </h4>
                          <span className="px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-900 font-extrabold text-[11px] border border-emerald-300">
                            นักกายภาพบำบัดวิชาชีพ (PT Specialist)
                          </span>
                          <span className="px-2.5 py-0.5 rounded-full bg-cyan-100 text-cyan-900 font-mono text-[11px] font-bold border border-cyan-300">
                            {currentTherapist?.code || 'T-101'}
                          </span>
                        </div>

                        {/* Read-Only License and Specialty Badges */}
                        <div className="flex items-center gap-2 flex-wrap text-xs">
                          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-slate-100 text-slate-700 font-bold border border-slate-200" title="เลขที่ใบอนุญาตประกอบวิชาชีพ (กำหนดจากระบบส่วนกลาง - Read-Only)">
                            <Lock className="w-3.5 h-3.5 text-slate-400" />
                            <span>เลขที่ใบอนุญาต: <strong>{currentTherapist?.licenseNumber || 'กภ. 8920'}</strong></span>
                          </div>
                          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-emerald-50 text-emerald-900 font-bold border border-emerald-200" title="ความเชี่ยวชาญทางคลินิก (กำหนดจากระบบส่วนกลาง - Read-Only)">
                            <HeartPulse className="w-3.5 h-3.5 text-emerald-600" />
                            <span>แผนก/ความเชี่ยวชาญ: <strong>{currentTherapist?.specialty || 'กายภาพบำบัดระบบกระดูกและกล้ามเนื้อ'}</strong></span>
                          </div>
                        </div>

                        {/* Contacts */}
                        <div className="flex items-center gap-4 text-xs text-slate-600 flex-wrap pt-0.5">
                          <div className="flex items-center gap-1.5">
                            <Phone className="w-3.5 h-3.5 text-emerald-600" />
                            <span>โทรศัพท์: <strong>{currentTherapist?.phone || currentUser?.phone || '081-234-5678'}</strong></span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <Mail className="w-3.5 h-3.5 text-emerald-600" />
                            <span>อีเมล: <strong>{currentTherapist?.email || currentUser?.email || 'pt.thanakorn@drtechcare.hospital'}</strong></span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Edit My Profile Button */}
                    <div className="flex items-center gap-2 flex-shrink-0 self-start sm:self-auto">
                      <button
                        onClick={() => setIsEditMyProfileModalOpen(true)}
                        className="px-4 py-2.5 rounded-2xl bg-white hover:bg-emerald-50 text-emerald-900 border border-emerald-300 font-extrabold text-xs shadow-xs transition flex items-center gap-2 cursor-pointer active:scale-95"
                        title="แก้ไขรูปโปรไฟล์ เบอร์โทรศัพท์ อีเมล และประวัติส่วนตัว"
                      >
                        <Pencil className="w-4 h-4 text-emerald-600" />
                        <span>แก้ไขข้อมูลของฉัน (Edit My Profile)</span>
                      </button>
                    </div>
                  </div>

                  {/* Bio statement */}
                  <div className="mt-4 pt-4 border-t border-emerald-100/80 text-xs text-slate-600 space-y-1">
                    <span className="font-extrabold text-slate-800">ประวัติส่วนตัว & การศึกษา (Bio):</span>
                    <p className="text-[12px] leading-relaxed text-slate-600 bg-emerald-50/40 p-3 rounded-2xl border border-emerald-100">
                      {currentTherapist?.bio || 'สำเร็จการศึกษากายภาพบำบัดบัณฑิต มีประสบการณ์ฟื้นฟูกระดูกและข้อ 6 ปี เชี่ยวชาญการรักษาอาการข้อไหล่ติด ออฟฟิศซินโดรม และข้อเข่าเสื่อม'}
                    </p>
                  </div>
                </div>

                {/* SECTION 2: METRICS & SUMMARY CARDS */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
                  <div className="bg-white rounded-2xl p-4 border border-emerald-200 shadow-2xs flex items-center gap-3.5">
                    <div className="w-12 h-12 rounded-2xl bg-emerald-100 text-emerald-800 flex items-center justify-center font-bold">
                      <Users className="w-6 h-6" />
                    </div>
                    <div>
                      <div className="text-2xl font-black text-[#0F2F2B] leading-none">
                        {myAssignedPatients.length}
                      </div>
                      <div className="text-xs font-bold text-slate-500 mt-1">คนไข้ในความดูแลหลัก (Primary Cases)</div>
                    </div>
                  </div>

                  <div className="bg-white rounded-2xl p-4 border border-cyan-200 shadow-2xs flex items-center gap-3.5">
                    <div className="w-12 h-12 rounded-2xl bg-cyan-100 text-cyan-800 flex items-center justify-center font-bold">
                      <ShieldCheck className="w-6 h-6" />
                    </div>
                    <div>
                      <div className="text-2xl font-black text-cyan-900 leading-none">
                        {myCoveredPatients.length}
                      </div>
                      <div className="text-xs font-bold text-slate-500 mt-1">เคสที่ได้รับฝากดูแลแทน (Covering Cases)</div>
                    </div>
                  </div>

                  <div className="bg-white rounded-2xl p-4 border border-amber-200 shadow-2xs flex items-center gap-3.5">
                    <div className="w-12 h-12 rounded-2xl bg-amber-100 text-amber-800 flex items-center justify-center font-bold">
                      <Clock className="w-6 h-6" />
                    </div>
                    <div>
                      <div className="text-2xl font-black text-amber-900 leading-none">
                        {myDelegatedOutCases.length}
                      </div>
                      <div className="text-xs font-bold text-slate-500 mt-1">เคสที่ฝากเพื่อนดูแล (Delegated Out)</div>
                    </div>
                  </div>
                </div>

                {/* SECTION 3: MY ASSIGNED PATIENTS TABLE */}
                <div className="bg-white rounded-3xl border border-emerald-200 shadow-sm overflow-hidden">
                  <div className="p-5 border-b border-emerald-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5">
                      <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center font-bold">
                        <Users className="w-5 h-5" />
                      </div>
                      <div>
                        <h4 className="font-black text-base text-[#0F2F2B]">
                          คนไข้ในความรับผิดชอบหลัก ({myAssignedPatients.length} ราย)
                        </h4>
                        <p className="text-xs text-slate-500">
                          คนไข้ที่มีคุณเป็นนักกายภาพประจำตัว มีสิทธิ์เต็มในการปรับตารางฝึกและบันทึกเวชระเบียน
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => {
                          setSelectedDelegationPatientId(null);
                          setIsDelegationModalOpen(true);
                        }}
                        className="px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-[#10B981] via-[#06B6D4] to-[#2563EB] text-white text-xs font-black shadow-xs hover:opacity-95 transition flex items-center gap-1.5 cursor-pointer active:scale-95"
                        title="มอบหมายสิทธิ์ดูแลคนไข้ให้เพื่อนนักกายภาพบำบัดดูแลแทนชั่วคราว พร้อมระบุช่วงเวลา"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>+ ฝากเคสชั่วคราว (Assign Temporary Coverage)</span>
                      </button>

                      <span className="text-xs font-bold text-emerald-800 bg-emerald-50 px-3 py-1 rounded-full border border-emerald-200">
                        Primary Care
                      </span>
                    </div>
                  </div>

                  {myAssignedPatients.length === 0 ? (
                    <div className="py-12 text-center space-y-2 bg-emerald-50/30">
                      <div className="text-2xl">📋</div>
                      <div className="font-bold text-sm text-[#0F2F2B]">ยังไม่มีคนไข้ที่มอบหมายให้คุณดูแลโดยตรง</div>
                      <p className="text-xs text-slate-400">
                        คุณสามารถเพิ่มคนไข้ใหม่ได้จากแท็บ "1. จัดการผู้ใช้งาน" หรือรับฝากเคสจากเพื่อนร่วมงาน
                      </p>
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs border-collapse">
                        <thead>
                          <tr className="border-b border-emerald-100 bg-emerald-50/70 text-slate-600 font-bold uppercase tracking-wider text-[11px]">
                            <th className="py-3 px-4">คนไข้ (HN / ชื่อ)</th>
                            <th className="py-3 px-4">อายุ / เพศ</th>
                            <th className="py-3 px-4">วันที่รับเข้า (Admission)</th>
                            <th className="py-3 px-4">อาการเริ่มต้น / การวินิจฉัย</th>
                            <th className="py-3 px-4">สถานะ</th>
                            <th className="py-3 px-4 text-right">ทางลัดการทำงาน</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-emerald-50">
                          {myAssignedPatients.map((pat) => (
                            <tr key={pat.id} className="hover:bg-emerald-50/40 transition">
                              <td className="py-3 px-4">
                                <div className="flex items-center gap-2.5">
                                  <div className="w-8 h-8 rounded-full bg-emerald-100 text-emerald-800 font-bold flex items-center justify-center text-xs flex-shrink-0">
                                    {pat.name.charAt(pat.name.startsWith('นาย') || pat.name.startsWith('นาง') ? 3 : 0)}
                                  </div>
                                  <div>
                                    <div className="font-black text-sm text-[#0F2F2B]">{pat.name}</div>
                                    <div className="font-mono text-[11px] text-emerald-800 font-bold">HN: {pat.code}</div>
                                  </div>
                                </div>
                              </td>
                              <td className="py-3 px-4 font-semibold text-slate-700">
                                {pat.age || 65} ปี • {pat.gender === 'female' ? 'หญิง' : pat.gender === 'other' ? 'อื่นๆ' : 'ชาย'}
                              </td>
                              <td className="py-3 px-4 font-mono text-slate-600">
                                {pat.admissionDate || '2026-10-01'}
                              </td>
                              <td className="py-3 px-4 text-slate-700 max-w-[220px] truncate" title={pat.chiefComplaint || pat.diagnosis || '-'}>
                                {pat.chiefComplaint || pat.diagnosis || 'ฟื้นฟูกายภาพบำบัดตามอาการ'}
                              </td>
                              <td className="py-3 px-4">
                                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-bold text-[11px]">
                                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-600" />
                                  <span>Active</span>
                                </span>
                              </td>
                              <td className="py-3 px-4 text-right">
                                <div className="inline-flex items-center gap-1.5 justify-end">
                                  {/* Shortcut to Delegate this Patient */}
                                  <button
                                    onClick={() => {
                                      setSelectedDelegationPatientId(pat.id);
                                      setIsDelegationModalOpen(true);
                                    }}
                                    className="px-2.5 py-1.5 rounded-xl bg-gradient-to-r from-emerald-50 to-teal-50 hover:bg-emerald-100 text-emerald-900 border border-emerald-300 font-extrabold text-xs transition flex items-center gap-1 cursor-pointer shadow-2xs"
                                    title="ฝากเคสคนไข้รายนี้ให้เพื่อนร่วมงานช่วยดูแลชั่วคราว"
                                  >
                                    <Share2 className="w-3 h-3 text-emerald-700" />
                                    <span>ฝากเคส (Delegate)</span>
                                  </button>

                                  {/* Shortcut to Module 3: Schedule & Routine */}
                                  <button
                                    onClick={() => setCalendarPatientModal(pat)}
                                    className="px-3 py-1.5 rounded-xl bg-white hover:bg-emerald-50 text-emerald-900 border border-emerald-300 font-extrabold text-xs shadow-2xs transition flex items-center gap-1 cursor-pointer"
                                    title="เปิดปฏิทินนัดหมายและจัดโปรแกรมฝึกของคนไข้รายนี้ (Module 3)"
                                  >
                                    <Calendar className="w-3.5 h-3.5 text-emerald-600" />
                                    <span>Schedule & Routine</span>
                                  </button>

                                  {/* Shortcut to Module 2: Medical Records */}
                                  <button
                                    onClick={() => setPatientDetailModal(pat)}
                                    className="px-3 py-1.5 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-900 border border-emerald-200 font-extrabold text-xs transition flex items-center gap-1 cursor-pointer"
                                    title="ดูเวชระเบียนและบันทึกความคืบหน้า (Module 2)"
                                  >
                                    <FileText className="w-3.5 h-3.5 text-emerald-600" />
                                    <span>Medical Records</span>
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

                {/* SECTION 4: TEMPORARY CASE DELEGATIONS OVERSIGHT (INCOMING & OUTGOING) */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                  {/* Incoming Covered Cases */}
                  <div className="bg-white rounded-3xl border border-cyan-200 shadow-sm overflow-hidden flex flex-col justify-between">
                    <div>
                      <div className="p-4 bg-cyan-50/60 border-b border-cyan-100 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <ShieldCheck className="w-5 h-5 text-cyan-700" />
                          <h4 className="font-black text-sm text-cyan-950">
                            เคสที่ได้รับฝากดูแลแทนชั่วคราว ({myCoveredPatients.length} เคส)
                          </h4>
                        </div>
                        <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-cyan-200 text-cyan-900">
                          สิทธิ์ Full Write Access
                        </span>
                      </div>

                      {myCoveredPatients.length === 0 ? (
                        <div className="py-8 text-center text-xs text-slate-400">
                          ขณะนี้ไม่มีเคสที่เพื่อนร่วมงานฝากให้คุณดูแลแทน
                        </div>
                      ) : (
                        <div className="p-4 space-y-3">
                          {myCoveredPatients.map((pat) => {
                            const cov = getCoveringDelegationForPatient(pat.id);
                            return (
                              <div key={pat.id} className="p-3.5 rounded-2xl bg-cyan-50/40 border border-cyan-200 flex items-center justify-between gap-3">
                                <div>
                                  <div className="font-black text-sm text-[#0F2F2B] flex items-center gap-2">
                                    <span>{pat.name}</span>
                                    <span className="font-mono text-xs font-bold text-cyan-800">({pat.code})</span>
                                  </div>
                                  <div className="text-xs text-slate-600 mt-0.5">
                                    ฝากโดย: <strong>{cov?.originalTherapistName || 'เพื่อนร่วมงาน'}</strong>
                                  </div>
                                  <div className="text-[11px] text-cyan-800 font-mono mt-0.5">
                                    ช่วงเวลา: {cov?.startDate} ถึง {cov?.endDate}
                                  </div>
                                  {cov?.reason && (
                                    <div className="text-[11px] text-slate-500 mt-1 italic">
                                      "{cov.reason}"
                                    </div>
                                  )}
                                </div>

                                <button
                                  onClick={() => setCalendarPatientModal(pat)}
                                  className="px-3 py-1.5 rounded-xl bg-cyan-600 hover:bg-cyan-700 text-white font-bold text-xs flex items-center gap-1 shadow-xs cursor-pointer flex-shrink-0"
                                  title="เข้าจัดตารางฝึกและประเมินผลเคสฝาก"
                                >
                                  <Calendar className="w-3.5 h-3.5" />
                                  <span>จัดตารางฝึก</span>
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Outgoing Delegated Cases */}
                  <div className="bg-white rounded-3xl border border-amber-200 shadow-sm overflow-hidden flex flex-col justify-between">
                    <div>
                      <div className="p-4 bg-amber-50/60 border-b border-amber-100 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Clock className="w-5 h-5 text-amber-700" />
                          <h4 className="font-black text-sm text-amber-950">
                            เคสที่คุณฝากเพื่อนร่วมงานดูแล ({myDelegatedOutCases.length} รายการ)
                          </h4>
                        </div>
                        <button
                          onClick={() => setIsDelegationModalOpen(true)}
                          className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-amber-200 hover:bg-amber-300 text-amber-900 cursor-pointer"
                        >
                          + ฝากเคสเพิ่ม
                        </button>
                      </div>

                      {myDelegatedOutCases.length === 0 ? (
                        <div className="py-8 text-center text-xs text-slate-400">
                          คุณยังไม่ได้ส่งมอบเคสใดให้เพื่อนร่วมงานดูแลแทน
                        </div>
                      ) : (
                        <div className="p-4 space-y-3">
                          {myDelegatedOutCases.map((del) => (
                            <div key={del.id} className="p-3.5 rounded-2xl bg-amber-50/40 border border-amber-200 flex items-center justify-between gap-3">
                              <div>
                                <div className="font-black text-sm text-[#0F2F2B] flex items-center gap-2">
                                  <span>{del.patientName}</span>
                                  <span className="font-mono text-xs font-bold text-amber-900">({del.patientCode})</span>
                                </div>
                                <div className="text-xs text-slate-600 mt-0.5">
                                  ผู้ดูแลแทน: <strong className="text-emerald-800">{del.coveringTherapistName}</strong>
                                </div>
                                <div className="text-[11px] text-amber-900 font-mono mt-0.5">
                                  ช่วงเวลา: {del.startDate} ถึง {del.endDate}
                                </div>
                                {del.reason && (
                                  <div className="text-[11px] text-slate-500 mt-1 italic">
                                    "{del.reason}"
                                  </div>
                                )}
                              </div>

                              <button
                                onClick={() => {
                                  revokeDelegation(del.id);
                                  showToast(`ดึงเคส ${del.patientName} กลับมาดูแลเองเรียบร้อยแล้ว`);
                                }}
                                className="px-3 py-1.5 rounded-xl bg-white hover:bg-rose-50 text-rose-700 border border-rose-300 font-bold text-xs flex items-center gap-1 shadow-2xs cursor-pointer flex-shrink-0"
                                title="ยกเลิกการฝากและดึงเคสกลับทันที"
                              >
                                <X className="w-3.5 h-3.5" />
                                <span>ดึงเคสกลับ</span>
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              /* ============================================================= */
              /* SUPER ADMIN PT DIRECTORY & GOVERNANCE VIEW                     */
              /* ============================================================= */
              <div className="space-y-6 animate-fadeIn text-left">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div>
                    <h3 className="font-bold text-lg text-[#0F2F2B]">ข้อมูลนักกายภาพบำบัดประจำโรงพยาบาล</h3>
                    <p className="text-xs text-slate-500">
                      แสดง: ชื่อ, เคสที่รับผิดชอบ, เบอร์โทร, ประวัติส่วนตัว (สิทธิ์ Super Admin บริหารจัดการรายชื่อและสิทธิ์การฝากเคส)
                    </p>
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="w-64 relative">
                      <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        value={therapistSearch}
                        onChange={(e) => setTherapistSearch(e.target.value)}
                        placeholder="ค้นหานักกายภาพ..."
                        className="w-full pl-9 pr-3 py-2 rounded-full bg-white border border-emerald-200 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-[#10B981]"
                      />
                    </div>
                  </div>
                </div>

                {/* Therapist Cards Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                  {filteredTherapists.map((therapist) => {
                    const canEdit = canEditTherapist(therapist);

                    return (
                      <div
                        key={therapist.id}
                        className="bg-white rounded-3xl p-6 border border-emerald-100 shadow-sm space-y-4 transition"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div className="w-12 h-12 rounded-2xl bg-[#0F2F2B] text-emerald-200 font-bold flex items-center justify-center text-base shadow-md">
                              {therapist.name.charAt(therapist.name.startsWith('กภ.') ? 4 : 0)}
                            </div>
                            <div>
                              <div className="font-bold text-sm text-[#0F2F2B] flex items-center gap-1.5">
                                <span>{therapist.name}</span>
                              </div>
                              <div className="text-[11px] font-mono text-emerald-700 font-bold">
                                {therapist.code} • ใบอนุญาต {therapist.licenseNumber}
                              </div>
                            </div>
                          </div>

                          <span
                            className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full ${
                              therapist.status === 'active'
                                ? 'bg-emerald-100 text-emerald-800'
                                : 'bg-amber-100 text-amber-800'
                            }`}
                          >
                            {therapist.status === 'active' ? 'ปฏิบัติงาน' : 'ลาพัก'}
                          </span>
                        </div>

                        {/* Contact & Specialty */}
                        <div className="text-xs text-slate-600 bg-slate-50 p-3.5 rounded-2xl space-y-1.5 border border-slate-100">
                          <div className="font-semibold text-emerald-900">{therapist.specialty}</div>
                          <div className="flex items-center gap-1 text-slate-600">
                            <Phone className="w-3.5 h-3.5 text-emerald-600" />
                            <span>โทรศัพท์: <strong>{therapist.phone}</strong></span>
                          </div>
                          <div className="text-slate-500 text-[11px]">อีเมล: {therapist.email}</div>
                        </div>

                        {/* Bio & Background */}
                        <div className="text-xs text-slate-600 bg-emerald-50/50 p-3 rounded-2xl border border-emerald-100">
                          <div className="font-bold text-emerald-950 mb-1">ประวัติส่วนตัว & การศึกษา:</div>
                          <p className="text-[11px] text-slate-600 leading-relaxed">
                            {therapist.bio || 'สำเร็จการศึกษากายภาพบำบัดบัณฑิต มีประสบการณ์ฟื้นฟูกระดูกและข้อ 6 ปี'}
                          </p>
                        </div>

                        {/* Responsible Cases */}
                        <div className="text-xs space-y-1.5 pt-1">
                          <div className="flex items-center justify-between font-bold">
                            <span className="text-slate-700">เคสที่รับผิดชอบ ({therapist.activePatientsCount} เคส):</span>
                          </div>
                          <div className="flex flex-wrap gap-1.5">
                            {(therapist.assignedCases && therapist.assignedCases.length > 0
                              ? therapist.assignedCases
                              : ['นายสมชาย ใจดี', 'นางมาลี รักสุข']
                            ).map((pName, idx) => (
                              <span
                                key={idx}
                                className="px-2 py-0.5 rounded-lg bg-emerald-50 text-emerald-900 font-semibold text-[11px] border border-emerald-100"
                              >
                                {pName}
                              </span>
                            ))}
                          </div>
                        </div>

                        {/* Action Buttons: Assigned Patients & Edit Details */}
                        <div className="pt-2 border-t border-emerald-50 flex items-center justify-between flex-wrap gap-2">
                          <button
                            onClick={() => setPtAssignedModalTherapist(therapist)}
                            className="px-3.5 py-1.5 rounded-full border border-cyan-300 bg-cyan-50/80 hover:bg-cyan-100 text-cyan-800 text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shadow-2xs"
                            title="ดูและจัดการเคสคนไข้ที่รับผิดชอบ พร้อมโอนย้ายเคส (Modal B)"
                          >
                            <Users className="w-3.5 h-3.5 text-cyan-600" />
                            <span>Assigned Patients ({therapist.activePatientsCount || therapist.assignedCases?.length || 0})</span>
                          </button>

                          <button
                            onClick={() => {
                              if (canEdit) {
                                setEditingTherapist(therapist);
                              } else {
                                showToast('คุณสามารถแก้ไขได้เฉพาะข้อมูลของตนเอง');
                              }
                            }}
                            className="px-3.5 py-1.5 rounded-full text-xs font-bold transition flex items-center gap-1.5 cursor-pointer bg-[#10B981] text-white hover:bg-emerald-600 shadow-sm"
                            title="แก้ไขข้อมูลนักกายภาพ (Modal A)"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                            <span>Edit Details</span>
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* SUPER ADMIN GOVERNANCE: ALL TEMPORARY CASE DELEGATIONS OVERSIGHT */}
                <div className="bg-white rounded-3xl p-6 border border-emerald-200 shadow-sm space-y-4 mt-8">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-emerald-100">
                    <div className="flex items-center gap-2.5">
                      <div className="w-9 h-9 rounded-xl bg-purple-50 text-purple-700 flex items-center justify-center font-bold">
                        <Shield className="w-5 h-5" />
                      </div>
                      <div>
                        <h4 className="font-black text-base text-[#0F2F2B]">
                          Super Admin Governance: การกำกับดูแลการฝากเคสคนไข้ทั่วทั้งโรงพยาบาล
                        </h4>
                        <p className="text-xs text-slate-500">
                          ผู้อำนวยการ รพ. และ Super Admin สามารถตรวจสอบและเพิกถอนสิทธิ์การฝากเคส (Override Revocation) ได้ตลอดเวลา
                        </p>
                      </div>
                    </div>

                    <span className="text-xs font-bold px-3 py-1 rounded-full bg-purple-100 text-purple-900 border border-purple-200">
                      Super Admin Override
                    </span>
                  </div>

                  {delegations.length === 0 ? (
                    <div className="py-8 text-center text-xs text-slate-400 bg-slate-50/50 rounded-2xl border border-dashed border-slate-200">
                      ขณะนี้ไม่มีประวัติการฝากเคสชั่วคราวในระบบ
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs border-collapse">
                        <thead>
                          <tr className="border-b border-slate-200 bg-slate-50 text-slate-600 font-bold uppercase tracking-wider text-[11px]">
                            <th className="py-2.5 px-3">คนไข้ (HN / ชื่อ)</th>
                            <th className="py-2.5 px-3">นักกายภาพผู้รับผิดชอบหลัก</th>
                            <th className="py-2.5 px-3">นักกายภาพที่รับฝากดูแลแทน</th>
                            <th className="py-2.5 px-3">ช่วงวันที่ฝากเคส</th>
                            <th className="py-2.5 px-3">เหตุผล / บันทึกทางคลินิก</th>
                            <th className="py-2.5 px-3">สถานะ</th>
                            <th className="py-2.5 px-3 text-right">อำนาจผู้บริหาร</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {delegations.map((d) => (
                            <tr key={d.id} className="hover:bg-slate-50/60 transition">
                              <td className="py-2.5 px-3">
                                <div className="font-bold text-slate-900">{d.patientName}</div>
                                <div className="text-[10px] font-mono text-emerald-800 font-bold">HN: {d.patientCode}</div>
                              </td>
                              <td className="py-2.5 px-3 text-slate-700 font-medium">
                                {d.originalTherapistName}
                              </td>
                              <td className="py-2.5 px-3">
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-cyan-100 text-cyan-900 font-bold text-[11px]">
                                  <span>{d.coveringTherapistName}</span>
                                  <span className="text-[9px] bg-cyan-200 px-1 rounded">Covering</span>
                                </span>
                              </td>
                              <td className="py-2.5 px-3 font-mono text-slate-600 text-[11px]">
                                {d.startDate} ถึง {d.endDate}
                              </td>
                              <td className="py-2.5 px-3 text-slate-600 max-w-[200px] truncate" title={d.reason || '-'}>
                                {d.reason || '-'}
                              </td>
                              <td className="py-2.5 px-3">
                                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                  d.status === 'active' ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-500'
                                }`}>
                                  {d.status === 'active' ? 'Active 🟢' : 'Revoked ⚪'}
                                </span>
                              </td>
                              <td className="py-2.5 px-3 text-right">
                                {d.status === 'active' ? (
                                  <button
                                    onClick={() => {
                                      revokeDelegation(d.id);
                                      showToast(`เพิกถอนสิทธิ์การฝากเคส ${d.patientName} สำเร็จ (Super Admin Override)`);
                                    }}
                                    className="px-2.5 py-1 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-300 font-bold text-[11px] transition cursor-pointer"
                                    title="ใช้อำนาจผู้อำนวยการเพิกถอนสิทธิ์การฝากเคสทันที"
                                  >
                                    Revoke Coverage
                                  </button>
                                ) : (
                                  <span className="text-[10px] text-slate-400">เพิกถอนแล้ว</span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            )
          )}

          {/* ================================================================== */}
          {/* PAGE 5: โจทย์ในมินิเกม (MiniGame Questions Management)                */}
          {/* ================================================================== */}
          {activeTab === 'exercises' && (
            <div className="space-y-6 animate-fadeIn">
              {/* Header Title */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h3 className="font-extrabold text-lg text-[#0F2F2B] flex items-center gap-2">
                    <Gamepad2 className="w-5 h-5 text-emerald-600" />
                    <span>คลังโจทย์คำถามมินิเกม (MiniGame Questions Management)</span>
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    จัดการคลังคำถามมินิเกมฝึกสมองและการเคลื่อนไหว (Interactive Quiz) สำหรับคนไข้และตู้ Kiosk
                  </p>
                </div>
              </div>

              {/* VIEW: MINIGAME QUESTIONS (คลังโจทย์คำถามมินิเกมฝึกสมอง) */}
              <div className="space-y-6">
                <MiniGameQuestionsManager onShowToast={showToast} />
              </div>
            </div>
          )}

          {/* ================================================================== */}
          {/* PAGE 5: ประวัติการใช้งาน (Usage / Activity Log) — Admin only!        */}
          {/* ================================================================== */}
          {activeTab === 'logs' && currentRole === 'admin' && (
            <div className="space-y-6 animate-fadeIn">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h3 className="font-bold text-lg text-[#0F2F2B]">ประวัติการใช้งานระบบ (System Activity & Security Audit Log)</h3>
                  <p className="text-xs text-slate-500">
                    แสดง: ใครเข้าสู่ระบบล่าสุด, ใครแก้ไขข้อมูลตรงไหน, ใช้งานจากอุปกรณ์/IP ใด • สิทธิ์แอดมิน: เตะเครื่อง, แบนเครื่อง, แบน IP
                  </p>
                </div>

                <div className="flex items-center gap-2.5">
                  <button
                    onClick={() => setIsBannedManagementOpen(true)}
                    className="px-4 py-2 rounded-full border border-rose-300 bg-rose-50 text-rose-700 text-xs font-bold hover:bg-rose-100 transition flex items-center gap-1.5 cursor-pointer shadow-xs"
                  >
                    <Ban className="w-3.5 h-3.5" />
                    <span>จัดการรายการแบน ({bannedDevices.length + bannedIps.length})</span>
                  </button>
                </div>
              </div>

              {/* Filters for Activity Log */}
              <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
                <div className="w-full sm:w-80 relative">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={logSearch}
                    onChange={(e) => setLogSearch(e.target.value)}
                    placeholder="ค้นหาผู้กระทำ, การกระทำ, อุปกรณ์..."
                    className="w-full pl-9 pr-3 py-2 rounded-full bg-white border border-emerald-200 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-[#10B981]"
                  />
                </div>

                <div className="flex items-center gap-1.5 text-xs">
                  {['all', 'AUTH', 'PATIENT', 'THERAPIST', 'TREATMENT', 'SYSTEM', 'AI'].map((cat) => (
                    <button
                      key={cat}
                      onClick={() => setLogCategoryFilter(cat)}
                      className={`px-3 py-1 rounded-full font-bold transition cursor-pointer ${
                        logCategoryFilter === cat
                          ? 'bg-[#10B981] text-white shadow-sm'
                          : 'bg-white border border-emerald-200 text-slate-600 hover:text-emerald-800'
                      }`}
                    >
                      {cat}
                    </button>
                  ))}
                </div>
              </div>

              {/* Activity Log Table */}
              <div className="bg-white rounded-2xl border border-emerald-100 shadow-xs overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="border-b border-emerald-100 text-slate-600 text-[11px] font-bold uppercase tracking-wider bg-emerald-50/70">
                        <th className="py-2.5 px-3 sm:px-4 whitespace-nowrap">Timestamp</th>
                        <th className="py-2.5 px-3 sm:px-4 whitespace-nowrap">User / Role / ID</th>
                        <th className="py-2.5 px-3 sm:px-4 whitespace-nowrap">IP Address</th>
                        <th className="py-2.5 px-3 sm:px-4 whitespace-nowrap">Device / OS Type</th>
                        <th className="py-2.5 px-3 sm:px-4 min-w-[190px]">Action Performed</th>
                        <th className="py-2.5 px-3 sm:px-4 whitespace-nowrap">Security Status</th>
                        <th className="py-2.5 px-3 sm:px-4 text-right whitespace-nowrap">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-emerald-50">
                      {filteredLogs.map((log) => {
                        const isKicked = kickedLogIds.includes(log.id);
                        const isDeviceBanned = Boolean(log.device && bannedDevices.includes(log.device));
                        const isIpBanned = Boolean(log.ipAddress && bannedIps.includes(log.ipAddress));
                        const isSuspicious =
                          log.securityStatus === 'suspicious' ||
                          log.status === 'warning' ||
                          log.status === 'error';
                        const isKiosk =
                          Boolean(log.device && log.device.toLowerCase().includes('kiosk')) ||
                          Boolean(log.action && log.action.toLowerCase().includes('kiosk'));

                        return (
                          <tr key={log.id} className="hover:bg-emerald-50/30 transition">
                            {/* 1. Timestamp */}
                            <td className="py-2.5 px-3 sm:px-4 font-mono text-slate-500 whitespace-nowrap text-[11px]">
                              {log.timestamp}
                            </td>

                            {/* 2. User / Role / ID */}
                            <td className="py-2.5 px-3 sm:px-4 whitespace-nowrap">
                              <div className="font-bold text-[#0F2F2B] flex items-center gap-1.5">
                                <span>{log.userName}</span>
                                {isKicked && (
                                  <span className="text-[9px] px-1.5 py-0.2 rounded-full bg-amber-100 text-amber-800 font-bold border border-amber-300">
                                    เตะออก
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center gap-1 mt-0.5">
                                <span className="text-[10px] px-2 py-0.2 rounded-full bg-emerald-100 text-emerald-800 font-bold">
                                  {log.role}
                                </span>
                                <span className="text-[10px] px-1.5 py-0.2 rounded font-mono font-bold bg-slate-100 text-slate-700 border border-slate-200">
                                  {log.userCode || defaultDash((log as any).userId)}
                                </span>
                              </div>
                            </td>

                            {/* 3. IP Address */}
                            <td className="py-2.5 px-3 sm:px-4 whitespace-nowrap">
                              <div className="flex items-center gap-1.5 text-slate-700 font-mono text-[11px]">
                                <Globe className="w-3.5 h-3.5 text-slate-400" />
                                <span>{log.ipAddress || '192.168.1.100'}</span>
                              </div>
                              {isIpBanned && (
                                <span className="text-rose-600 font-bold bg-rose-50 px-1.5 py-0.2 rounded text-[9px] border border-rose-200 mt-0.5 inline-block">
                                  [Banned IP]
                                </span>
                              )}
                            </td>

                            {/* 4. Device / OS Type (Desktop / Kiosk) */}
                            <td className="py-2.5 px-3 sm:px-4 whitespace-nowrap">
                              <div className="flex items-center gap-1.5 text-slate-700">
                                <Laptop className="w-3.5 h-3.5 text-slate-400" />
                                <span className="font-medium text-[11px] truncate max-w-[140px]">{log.device || 'Windows 11 / Chrome'}</span>
                              </div>
                              <div className="flex items-center gap-1 mt-0.5">
                                <span
                                  className={`text-[9px] px-1.5 py-0.2 rounded font-bold ${
                                    isKiosk
                                      ? 'bg-cyan-100 text-cyan-800 border border-cyan-200'
                                      : 'bg-slate-100 text-slate-600 border border-slate-200'
                                  }`}
                                >
                                  {isKiosk ? 'Kiosk' : 'Desktop'}
                                </span>
                                {isDeviceBanned && (
                                  <span className="text-rose-600 font-bold bg-rose-50 px-1 py-0.2 rounded text-[9px] border border-rose-200">
                                    [Banned]
                                  </span>
                                )}
                              </div>
                            </td>

                            {/* 5. Action Performed */}
                            <td className="py-2.5 px-3 sm:px-4">
                              <div className="font-bold text-emerald-950 flex items-center gap-1.5">
                                <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-slate-100 text-slate-700">
                                  {log.category}
                                </span>
                                <span>{log.action}</span>
                              </div>
                              <div className="text-slate-600 text-[11px] mt-0.5">{log.details}</div>
                            </td>

                            {/* 6. Security Status Badge (Normal / Suspicious) */}
                            <td className="py-2.5 px-3 sm:px-4 whitespace-nowrap">
                              {isSuspicious ? (
                                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-rose-100 text-rose-800 border border-rose-300 font-bold text-[10px]">
                                  <AlertTriangle className="w-3 h-3 text-rose-600" />
                                  <span>Suspicious</span>
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300 font-bold text-[10px]">
                                  <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                                  <span>Normal</span>
                                </span>
                              )}
                            </td>

                            {/* 7. Security Control Actions */}
                            <td className="py-2.5 px-3 sm:px-4 text-right whitespace-nowrap">
                              <div className="inline-flex items-center gap-1.5">
                                {/* Security Control Modal Button */}
                                <button
                                  onClick={() => setSecurityControlTarget(log)}
                                  className="px-2.5 py-1 rounded-lg border border-cyan-300 bg-cyan-50/80 hover:bg-cyan-100 text-cyan-800 font-bold text-[10px] transition cursor-pointer flex items-center gap-1 shadow-2xs"
                                  title="เปิดแผงควบคุมความปลอดภัยขั้นสูง (Force Logout & Ban/Unban IP/Device)"
                                >
                                  <Shield className="w-3 h-3 text-cyan-600" />
                                  <span>Control</span>
                                </button>

                                {/* Quick Kick Button */}
                                {isKicked ? (
                                  <button
                                    disabled
                                    className="px-2 py-1 rounded-lg border border-slate-200 bg-slate-100 text-slate-400 font-bold text-[10px] cursor-not-allowed"
                                  >
                                    เตะออกแล้ว
                                  </button>
                                ) : (
                                  <button
                                    onClick={() => setConfirmKickLog(log)}
                                    title="เตะผู้ใช้ออกจากระบบทันที"
                                    className="px-2 py-1 rounded-lg border border-amber-300 bg-amber-50 text-amber-800 font-bold text-[10px] hover:bg-amber-100 transition cursor-pointer"
                                  >
                                    เตะออก
                                  </button>
                                )}

                                {/* Quick Ban IP Button */}
                                {isIpBanned ? (
                                  <button
                                    onClick={() => {
                                      if (log.ipAddress) {
                                        unbanIp(log.ipAddress);
                                        showToast('ยกเลิกแบน IP เรียบร้อยแล้ว');
                                      }
                                    }}
                                    title="ยกเลิกแบนที่อยู่ IP นี้"
                                    className="px-2 py-1 rounded-lg border border-slate-300 bg-slate-100 text-slate-600 font-bold text-[10px] hover:bg-slate-200 transition cursor-pointer"
                                  >
                                    ปลด IP
                                  </button>
                                ) : (
                                  <button
                                    onClick={() => setConfirmBanIp(log.ipAddress || '192.168.1.100')}
                                    title="แบน IP Address นี้"
                                    className="px-2 py-1 rounded-lg border border-rose-300 bg-rose-50 text-rose-700 font-bold text-[10px] hover:bg-rose-100 transition cursor-pointer"
                                  >
                                    แบน IP
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ================================================================== */}
          {/* PAGE 6: ตั้งค่าระบบ (System Settings) — Admin only!                  */}
          {/* ================================================================== */}
          {activeTab === 'settings' && currentRole === 'admin' && (
            <div className="space-y-6 animate-fadeIn max-w-4xl">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-bold text-lg text-[#0F2F2B]">ตั้งค่าระบบและ AI ชีวมิติ (System Settings)</h3>
                  <p className="text-xs text-slate-500">
                    ควบคุมการตั้งค่าระบบ AI สแกนใบหน้า, AI กายภาพบำบัดชีวกลศาสตร์, เสียงแนะนำ และการเชื่อมต่อ
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => setIsResetSettingsOpen(true)}
                    className="px-4 py-2 rounded-full border border-slate-300 text-slate-600 text-xs font-bold hover:bg-slate-100 transition cursor-pointer"
                  >
                    รีเซ็ตเป็นค่าเริ่มต้น
                  </button>
                  <button
                    onClick={handleSaveSettings}
                    disabled={isSavingSettings}
                    className="px-5 py-2 rounded-full bg-gradient-to-r from-[#10B981] via-[#06B6D4] to-[#2563EB] text-white text-xs font-bold shadow-md shadow-cyan-500/25 hover:opacity-95 transition cursor-pointer flex items-center gap-1.5 disabled:opacity-50 active:scale-95"
                  >
                    {isSavingSettings ? (
                      <>
                        <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        <span>กำลังบันทึก...</span>
                      </>
                    ) : (
                      <span>บันทึกการตั้งค่า</span>
                    )}
                  </button>
                </div>
              </div>

              {/* Settings Card Sections */}
              <div className="space-y-5">
                {/* 1. AI Face Recognition & Liveness */}
                <div className="bg-white rounded-3xl p-6 border border-emerald-100 shadow-sm space-y-4">
                  <div className="flex items-center gap-2 border-b border-emerald-50 pb-2">
                    <UserCheck className="w-5 h-5 text-emerald-600" />
                    <h4 className="font-bold text-sm text-[#0F2F2B]">1. ระบบ AI สแกนใบหน้าและชีวมิติ (Face Recognition & Liveness)</h4>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5 text-xs font-semibold">
                    <div>
                      <div className="flex justify-between text-slate-700 mb-1">
                        <span>เกณฑ์ความคล้ายคลึงใบหน้า (Cosine Similarity):</span>
                        <span className="text-emerald-700 font-bold">{localAiSettings.similarityThreshold}</span>
                      </div>
                      <input
                        type="range"
                        min={0.7}
                        max={0.95}
                        step={0.01}
                        value={localAiSettings.similarityThreshold}
                        onChange={(e) =>
                          setLocalAiSettings({ ...localAiSettings, similarityThreshold: parseFloat(e.target.value) })
                        }
                        className="w-full accent-[#10B981]"
                      />
                      <span className="text-[11px] text-slate-400">เกณฑ์แนะนำ: 0.80 (ช่วงปลอดภัย 0.78–0.85 ป้องกันคนหน้าคล้าย)</span>
                    </div>

                    <div>
                      <div className="flex justify-between text-slate-700 mb-1">
                        <span>เกณฑ์แยกความต่าง (Top-1 / Top-2 Margin):</span>
                        <span className="text-emerald-700 font-bold">{localAiSettings.marginThreshold}</span>
                      </div>
                      <input
                        type="range"
                        min={0.03}
                        max={0.15}
                        step={0.01}
                        value={localAiSettings.marginThreshold}
                        onChange={(e) =>
                          setLocalAiSettings({ ...localAiSettings, marginThreshold: parseFloat(e.target.value) })
                        }
                        className="w-full accent-[#10B981]"
                      />
                      <span className="text-[11px] text-slate-400">ป้องกันความสับสนระหว่างคนไข้ที่มีโครงหน้าคล้ายกัน</span>
                    </div>
                  </div>

                  <div className="pt-2 flex items-center justify-between text-xs">
                    <div>
                      <div className="font-bold text-slate-800">โหมดตรวจจับการมีชีวิต (Liveness Verification)</div>
                      <div className="text-slate-500 text-[11px]">บังคับตรวจจับการมีชีวิต (กระพริบตา, หันศีรษะ, หรืออ้าปาก) ป้องกันรูปถ่าย</div>
                    </div>
                    <input
                      type="checkbox"
                      checked={localAiSettings.strictLivenessChallenge}
                      onChange={(e) =>
                        setLocalAiSettings({ ...localAiSettings, strictLivenessChallenge: e.target.checked })
                      }
                      className="w-5 h-5 rounded text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                    />
                  </div>
                </div>

                {/* 2. AI Physiotherapy Biomechanics */}
                <div className="bg-white rounded-3xl p-6 border border-emerald-100 shadow-sm space-y-4">
                  <div className="flex items-center gap-2 border-b border-emerald-50 pb-2">
                    <Activity className="w-5 h-5 text-emerald-600" />
                    <h4 className="font-bold text-sm text-[#0F2F2B]">2. ระบบ AI ตรวจจับท่ากายภาพและชีวกลศาสตร์ (Pose Biomechanics Engine)</h4>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5 text-xs font-semibold">
                    <div>
                      <div className="flex justify-between text-slate-700 mb-1">
                        <span>เกณฑ์ความเชื่อมั่นโมเดลท่าทาง (Pose Confidence):</span>
                        <span className="text-emerald-700 font-bold">{localAiSettings.poseConfidenceThreshold ?? 0.65}</span>
                      </div>
                      <input
                        type="range"
                        min={0.50}
                        max={0.90}
                        step={0.05}
                        value={localAiSettings.poseConfidenceThreshold ?? 0.65}
                        onChange={(e) =>
                          setLocalAiSettings({ ...localAiSettings, poseConfidenceThreshold: parseFloat(e.target.value) })
                        }
                        className="w-full accent-[#10B981]"
                      />
                      <span className="text-[11px] text-slate-400">เกณฑ์มาตรฐานที่แนะนำ: 0.65 (pose_landmarker_full)</span>
                    </div>

                    <div>
                      <div className="flex justify-between text-slate-700 mb-1">
                        <span>เกณฑ์ความชัดเจนข้อต่อ (Landmark Visibility):</span>
                        <span className="text-emerald-700 font-bold">{localAiSettings.minVisibilityThreshold ?? 0.55}</span>
                      </div>
                      <input
                        type="range"
                        min={0.35}
                        max={0.80}
                        step={0.05}
                        value={localAiSettings.minVisibilityThreshold ?? 0.55}
                        onChange={(e) =>
                          setLocalAiSettings({ ...localAiSettings, minVisibilityThreshold: parseFloat(e.target.value) })
                        }
                        className="w-full accent-[#10B981]"
                      />
                      <span className="text-[11px] text-slate-400">เกณฑ์มาตรฐานที่แนะนำ: 0.55 (ไม่นับมุมถ้ามองไม่เห็นชัดเจน)</span>
                    </div>

                    <div>
                      <div className="flex justify-between text-slate-700 mb-1">
                        <span>ความคลาดเคลื่อนมุมเป้าหมาย (ROM Tolerance):</span>
                        <span className="text-emerald-700 font-bold">{localAiSettings.toleranceDeg ?? 10}°</span>
                      </div>
                      <input
                        type="range"
                        min={5}
                        max={15}
                        step={1}
                        value={localAiSettings.toleranceDeg ?? 10}
                        onChange={(e) =>
                          setLocalAiSettings({ ...localAiSettings, toleranceDeg: parseInt(e.target.value) })
                        }
                        className="w-full accent-[#10B981]"
                      />
                      <span className="text-[11px] text-slate-400">เกณฑ์มาตรฐานที่แนะนำ: 8–10° เพื่อความแม่นยำทางกายภาพ</span>
                    </div>

                    <div>
                      <div className="flex justify-between text-slate-700 mb-1">
                        <span>มุมเอียงชดเชยลำตัวสูงสุด (Max Trunk Lean Angle):</span>
                        <span className="text-emerald-700 font-bold">{localAiSettings.maxTrunkLeanDeg}°</span>
                      </div>
                      <input
                        type="range"
                        min={10}
                        max={35}
                        step={1}
                        value={localAiSettings.maxTrunkLeanDeg}
                        onChange={(e) =>
                          setLocalAiSettings({ ...localAiSettings, maxTrunkLeanDeg: parseInt(e.target.value) })
                        }
                        className="w-full accent-[#10B981]"
                      />
                      <span className="text-[11px] text-slate-400">หากเอียงลำตัวเกินนี้ ระบบจะแจ้งเตือนว่าโกงท่า</span>
                    </div>

                    <div>
                      <div className="flex justify-between text-slate-700 mb-1">
                        <span>ความเร็วการเคลื่อนไหวสูงสุด (Max Velocity):</span>
                        <span className="text-emerald-700 font-bold">{localAiSettings.maxVelocityDegPerSec}°/วินาที</span>
                      </div>
                      <input
                        type="range"
                        min={120}
                        max={360}
                        step={10}
                        value={localAiSettings.maxVelocityDegPerSec}
                        onChange={(e) =>
                          setLocalAiSettings({ ...localAiSettings, maxVelocityDegPerSec: parseInt(e.target.value) })
                        }
                        className="w-full accent-[#10B981]"
                      />
                      <span className="text-[11px] text-slate-400">ป้องกันการสะบัดแขนหรือกระตุกข้อต่อเร็วเกินไปจนบาดเจ็บ</span>
                    </div>
                  </div>
                </div>

                {/* 3. Audio & Voice Guidance & Cloud Sync */}
                <div className="bg-white rounded-3xl p-6 border border-emerald-100 shadow-sm space-y-4 text-xs">
                  <div className="flex items-center gap-2 border-b border-emerald-50 pb-2">
                    <Sliders className="w-5 h-5 text-emerald-600" />
                    <h4 className="font-bold text-sm text-[#0F2F2B]">3. ระบบเสียงและการซิงค์ข้อมูลแม่ข่าย (Voice & Server Sync)</h4>
                  </div>

                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="font-bold text-slate-800">เสียงผู้ช่วย AI แนะนำท่าทางภาษาไทย (Voice Guidance)</div>
                        <div className="text-slate-500 text-[11px]">ออกเสียงนับจำนวนครั้งและเตือนความปลอดภัยระหว่างคนไข้ทำท่า</div>
                      </div>
                      <input
                        type="checkbox"
                        checked={localAiSettings.enableVoiceGuidance}
                        onChange={(e) =>
                          setLocalAiSettings({ ...localAiSettings, enableVoiceGuidance: e.target.checked })
                        }
                        className="w-5 h-5 rounded text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                      />
                    </div>

                    <div className="flex items-center justify-between pt-2 border-t border-emerald-50">
                      <div>
                        <div className="font-bold text-slate-800">ซิงค์เวชระเบียนโรงพยาบาลอัตโนมัติ (HIS Cloud Sync)</div>
                        <div className="text-slate-500 text-[11px]">อัปเดตสถิติผลการรักษาขึ้นระบบแม่ข่ายส่วนกลาง</div>
                      </div>
                      <input
                        type="checkbox"
                        checked={localAiSettings.enableAutoSync}
                        onChange={(e) =>
                          setLocalAiSettings({ ...localAiSettings, enableAutoSync: e.target.checked })
                        }
                        className="w-5 h-5 rounded text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* ==================================================================== */}
      {/* 3. RECEPTION ONBOARDING MODAL                                        */}
      {/* ==================================================================== */}
      <ReceptionOnboardingModal
        isOpen={isReceptionOpen}
        onClose={() => setIsReceptionOpen(false)}
        onSuccessNavigateToKiosk={(patientData) => {
          if (onSelectPatientForKiosk) onSelectPatientForKiosk(patientData);
          if (onLaunchKioskExercise) onLaunchKioskExercise();
          onClose();
        }}
      />

      {/* ==================================================================== */}
      {/* 4. ADD USER MODAL (Tab 1: users)                                     */}
      {/* ==================================================================== */}
      <AddUserModal
        isOpen={isAddUserModalOpen}
        onClose={() => setIsAddUserModalOpen(false)}
        currentRole={currentRole}
        currentUserId={currentUserId}
        currentUserName={currentUser?.name || 'กภ. ธนากร วงศ์สวัสดิ์'}
        therapists={therapists}
        existingUsers={users}
        onSubmitUser={handleAddUser}
        onSuccessToast={showToast}
      />

      {/* ==================================================================== */}
      {/* 5. EDIT USER MODAL (Tab 1: users)                                    */}
      {/* ==================================================================== */}
      <EditUserModal
        isOpen={!!editingUser}
        onClose={() => setEditingUser(null)}
        user={editingUser}
        currentRole={currentRole}
        currentUserId={currentUserId}
        currentUserName={currentUser?.name || 'กภ. ธนากร วงศ์สวัสดิ์'}
        therapists={therapists}
        existingUsers={users}
        onSubmitUser={handleEditUser}
        onSuccessToast={showToast}
      />

      {/* ==================================================================== */}
      {/* 6. CHANGE PASSWORD MODAL (Tab 1: users)                              */}
      {/* ==================================================================== */}
      <ChangePasswordModal
        isOpen={!!editingPasswordUser}
        onClose={() => setEditingPasswordUser(null)}
        user={editingPasswordUser}
        onSavePassword={(userId, newPassword) => {
          resetUserPassword(userId, newPassword);
        }}
        onSuccessToast={showToast}
      />

      {/* 6.1 TEMPORARY PASSWORD DISPLAY MODAL (Shows once upon reset) */}
      {resetResult && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fadeIn">
          <div className="bg-white rounded-3xl border-2 border-emerald-400 p-6 sm:p-8 max-w-md w-full shadow-2xl text-center space-y-5">
            <div className="w-14 h-14 rounded-2xl bg-emerald-100 text-emerald-800 flex items-center justify-center mx-auto border border-emerald-300 shadow-sm">
              <KeyRound className="w-7 h-7 text-emerald-700" />
            </div>

            <div>
              <h3 className="text-lg font-black text-[#0F2F2B]">
                รหัสผ่านชั่วคราวใหม่ (แสดงเพียงครั้งเดียว)
              </h3>
              <p className="text-xs text-slate-600 mt-1">
                สำหรับผู้ใช้: <strong className="text-emerald-900">{resetResult.user.name}</strong> ({resetResult.user.username})
              </p>
            </div>

            <div className="bg-emerald-50/80 border-2 border-dashed border-emerald-400 rounded-2xl p-4 space-y-2">
              <div className="text-[11px] font-bold text-emerald-800">
                รหัสผ่านชั่วคราว (Temporary Password):
              </div>
              <div className="text-xl sm:text-2xl font-mono font-black text-[#0F2F2B] tracking-wider select-all break-all">
                {resetResult.tempPass}
              </div>
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(resetResult.tempPass);
                  setCopiedResetPass(true);
                  setTimeout(() => setCopiedResetPass(false), 3000);
                }}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-white border border-emerald-300 text-emerald-800 text-xs font-bold hover:bg-emerald-100/70 transition shadow-xs cursor-pointer"
              >
                {copiedResetPass ? (
                  <>
                    <Check className="w-4 h-4 text-emerald-600" />
                    <span>คัดลอกสำเร็จแล้ว</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-4 h-4 text-emerald-600" />
                    <span>คัดลอกรหัสผ่าน</span>
                  </>
                )}
              </button>
            </div>

            <div className="p-3 bg-amber-50 border border-amber-200 rounded-2xl text-[11px] text-amber-900 text-left space-y-1">
              <div className="font-bold flex items-center gap-1 text-amber-950">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-600 flex-shrink-0" />
                <span>คำเตือนความปลอดภัย:</span>
              </div>
              <p className="leading-relaxed">
                รหัสผ่านชั่วคราวนี้จะแสดงบนหน้านี้<strong>เพียงครั้งเดียวเท่านั้น</strong> และจะไม่สามารถเปิดดูย้อนหลังได้อีก เพื่อความปลอดภัย เมื่อผู้ใช้งานนำรหัสนี้เข้าสู่ระบบ ระบบจะบังคับให้เปลี่ยนรหัสผ่านทันทีก่อนเข้าใช้งาน
              </p>
            </div>

            <button
              type="button"
              onClick={() => setResetResult(null)}
              className="w-full py-3 rounded-2xl bg-[#0F2F2B] text-emerald-200 font-bold text-xs hover:bg-emerald-950 transition cursor-pointer"
            >
              เข้าใจแล้ว ปิดหน้าต่างนี้
            </button>
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* 7. DELETE USER CONFIRMATION MODAL (Tab 1: users)                     */}
      {/* ==================================================================== */}
      <DeleteUserModal
        isOpen={!!deletingUser}
        onClose={() => setDeletingUser(null)}
        user={deletingUser}
        currentRole={currentRole}
        currentUserId={currentUserId}
        onConfirmDelete={(userId) => {
          deleteUser(userId);
        }}
        onSuccessToast={showToast}
      />

      {/* ==================================================================== */}
      {/* 8. VIEW & EDIT PATIENT CLINICAL DATA MODAL (Tab 2: patients)         */}
      {/* ==================================================================== */}
      <EditPatientModal
        isOpen={!!patientDetailModal}
        onClose={() => setPatientDetailModal(null)}
        patient={patientDetailModal}
        therapists={therapists}
        currentRole={currentRole}
        currentUserId={currentUserId}
        currentUserName={currentUser?.name || 'เจ้าหน้าที่'}
        canEdit={patientDetailModal ? canEditUser(patientDetailModal) : false}
        onSavePatient={async (patientId, data) => {
          const isPending =
            patientDetailModal?.status === 'pending_info' ||
            (patientDetailModal?.chiefComplaint && patientDetailModal.chiefComplaint.includes('[PENDING_INFO]')) ||
            (patientDetailModal?.patientBackground && patientDetailModal.patientBackground.includes('[PENDING_INFO]')) ||
            (patientDetailModal?.therapistNotes && patientDetailModal.therapistNotes.includes('[PENDING_INFO]')) ||
            (patientDetailModal?.name && (patientDetailModal.name.includes('รอลงข้อมูล') || patientDetailModal.name.startsWith('ผู้รับบริการใหม่')));

          const cleanComplaint = (data.chiefComplaint || 'ตรวจประเมินกายภาพบำบัด')
            .replace(/\[PENDING_INFO\]/g, '')
            .replace(/รอลงข้อมูลส่วนตัว/g, '')
            .trim();

          const cleanNotes = (data.therapistNotes || 'ลงทะเบียนเรียบร้อยแล้ว')
            .replace(/\[PENDING_INFO\]/g, '')
            .replace(/บัญชีนี้สแกนหน้าแล้ว รอลงข้อมูลส่วนตัว/g, '')
            .trim();

          if (isPending) {
            completePendingPatientInfo(patientId, {
              name: data.name || 'ผู้รับบริการ',
              age: data.age,
              gender: data.gender,
              phone: data.phone,
              chiefComplaint: cleanComplaint,
              patientBackground: data.patientBackground,
              assignedTherapistId: data.assignedTherapistId,
              assignedTherapistName: data.assignedTherapistName,
            });
          } else {
            updateUser(patientId, {
              ...data,
              chiefComplaint: cleanComplaint,
              therapistNotes: cleanNotes,
              status: 'active',
            });
          }

          // Direct Supabase Update & Cross-Device Broadcast to Kiosk
          const targetUser = users.find((u) => String(u.id) === String(patientId)) || patientDetailModal;
          const targetCode = targetUser?.code || (targetUser as any)?.patient_code || (data as any)?.code || (data as any)?.patient_code || patientDetailModal?.code || (typeof patientId === 'string' && patientId.startsWith('P-') ? patientId : undefined);
          if (targetCode) {
            try {
              // 1. Fetch current row to preserve biometric face vectors/photos
              const { data: curDbPatient } = await supabase
                .from('patients')
                .select('*')
                .eq('patient_code', targetCode)
                .maybeSingle();

              let medHist = (data.patientBackground || 'ลงทะเบียนเวชระเบียนเรียบร้อยแล้ว')
                .replace(/\[PENDING_INFO\]/g, '')
                .replace(/รอลงข้อมูลส่วนตัว/g, '')
                .trim();

              if (curDbPatient?.medical_history) {
                const embMatch = curDbPatient.medical_history.match(/FACE_EMB:\[.*?\]/s);
                const photoMatch = curDbPatient.medical_history.match(/FACE_PHOTO:data:image\/[^\s\n]+/);
                if (embMatch && !medHist.includes('FACE_EMB:')) {
                  medHist += `\n${embMatch[0]}`;
                }
                if (photoMatch && !medHist.includes('FACE_PHOTO:')) {
                  medHist += `\n${photoMatch[0]}`;
                }
              }

              const preservedVector = curDbPatient?.face_vector || (targetUser as any)?.face_vector || (targetUser as any)?.biometricVector;
              const preservedPhoto = curDbPatient?.photo || curDbPatient?.avatar_url || (targetUser as any)?.face_image_url || patientFaceStorageService.getProfileFaceImage(targetCode);

              if (preservedVector && !medHist.includes('FACE_EMB:')) {
                const vecStr = typeof preservedVector === 'string' ? preservedVector : JSON.stringify(preservedVector);
                medHist = `FACE_EMB:${vecStr}\n${medHist}`;
              }
              if (preservedPhoto && !medHist.includes('FACE_PHOTO:')) {
                medHist = `FACE_PHOTO:${preservedPhoto}\n${medHist}`;
              }

              let resolvedTherapistId = null;
              if (targetUser?.assignedTherapistId) {
                resolvedTherapistId = await supabaseService.resolveTherapistProfileId(targetUser.assignedTherapistId);
              }

              // 2. Direct Supabase Upsert
              await supabase.from('patients').upsert({
                patient_code: targetCode,
                full_name: data.name?.trim(),
                age: Number(data.age) || 65,
                gender: data.gender || 'male',
                phone: data.phone?.trim() || null,
                chief_complaint: cleanComplaint,
                medical_history: medHist,
                therapist_notes: cleanNotes,
                responsible_therapist_id: resolvedTherapistId,
                status: 'active',
              }, { onConflict: 'patient_code' });

              // 3. Update isolated local dossier in patientFaceStorageService
              patientFaceStorageService.savePatientRecord(targetCode, {
                patient_profile: {
                  patient_id: targetCode,
                  id: patientId,
                  full_name: data.name?.trim(),
                  first_name: data.name?.trim().split(' ')[0] || data.name?.trim(),
                  last_name: data.name?.trim().split(' ').slice(1).join(' ') || '',
                  age: Number(data.age) || 65,
                  gender: data.gender || 'male',
                  contact: data.phone?.trim() || undefined,
                  phone: data.phone?.trim() || undefined,
                  status: 'active',
                },
                medical_records: {
                  diagnosis: cleanComplaint,
                  chief_complaint: cleanComplaint,
                  treatment_plan: data.patientBackground?.trim() || undefined,
                  progress_notes: cleanNotes,
                },
              }, preservedPhoto);

              // 4. Update Face Registry profile name
              const regProf = faceRegistryService.getAllProfiles().find((p: any) => p.patientCode && p.patientCode.toUpperCase() === targetCode.toUpperCase());
              if (regProf) {
                faceRegistryService.saveProfile({
                  ...regProf,
                  name: data.name?.trim() || regProf.name,
                });
              }

              // 5. Multi-event Realtime Broadcast to Kiosk (across devices)
              const broadcastPayload = {
                patient_code: targetCode,
                full_name: data.name?.trim(),
                name: data.name?.trim(),
                age: Number(data.age) || 65,
                gender: data.gender,
                phone: data.phone,
                chief_complaint: cleanComplaint,
                status: 'active',
                isCompleted: true,
                face_image_url: preservedPhoto,
              };

              await supabase.channel(PATIENTS_REALTIME_CHANNEL).send({
                type: 'broadcast',
                event: 'patient_completed',
                payload: broadcastPayload,
              });

              await supabase.channel(PATIENTS_REALTIME_CHANNEL).send({
                type: 'broadcast',
                event: 'patient_registered',
                payload: broadcastPayload,
              });
            } catch (sbErr) {
              console.error('[SUPABASE] onSavePatient sync error:', sbErr);
            }
          }

          showToast(`✓ บันทึกข้อมูลและซิงค์คนไข้ (${data.name}) ไปยังตู้ Kiosk เรียบร้อยแล้ว!`);
          initializeFromSupabase();
        }}
        onSuccessToast={showToast}
      />

      {/* ==================================================================== */}
      {/* 9. EDIT THERAPIST MODAL (Tab 3: therapists)                          */}
      {/* ==================================================================== */}
      <EditTherapistModal
        isOpen={!!editingTherapist}
        onClose={() => setEditingTherapist(null)}
        therapist={editingTherapist}
        allPatients={users}
        currentRole={currentRole}
        currentUserId={currentUserId}
        currentUserName={currentUser?.name || 'เจ้าหน้าที่'}
        canEdit={editingTherapist ? canEditTherapist(editingTherapist) : false}
        onSaveTherapist={(therapistId, data) => {
          updateTherapist(therapistId, data);
        }}
        onSuccessToast={showToast}
      />

      {/* ==================================================================== */}
      {/* 10. ADD THERAPIST MODAL (Admin only)                                 */}
      {/* ==================================================================== */}
      {isAddTherapistOpen && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-[#0F2F2B]/60 backdrop-blur-sm animate-fadeIn"
          onClick={() => setIsAddTherapistOpen(false)}
        >
          <div
            className="w-full max-w-lg bg-white rounded-3xl p-6 shadow-2xl border border-emerald-200 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-2 border-b border-emerald-100">
              <h4 className="font-bold text-base text-[#0F2F2B]">เพิ่มนักกายภาพบำบัดใหม่</h4>
              <button
                onClick={() => setIsAddTherapistOpen(false)}
                className="p-1 rounded-full text-slate-400 hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleAddTherapistSubmit} className="space-y-3.5 text-xs font-semibold">
              <div>
                <label className="block text-slate-700 mb-1">ชื่อ-นามสกุล (เช่น กภ. สุภาพร มั่งคั่ง หรือ pj):</label>
                <input
                  type="text"
                  value={newTherapistForm.name}
                  onChange={(e) => setNewTherapistForm({ ...newTherapistForm, name: e.target.value })}
                  placeholder="เช่น กภ. สุภาพร มั่งคั่ง หรือ pj"
                  className="w-full px-3.5 py-2.5 rounded-2xl border border-emerald-200 text-sm font-bold outline-none"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-700 mb-1">ชื่อผู้ใช้ (Username สำหรับ Login):</label>
                  <input
                    type="text"
                    value={newTherapistForm.username}
                    onChange={(e) => setNewTherapistForm({ ...newTherapistForm, username: e.target.value })}
                    placeholder="เช่น pj หรือ pt_somchai"
                    className="w-full px-3.5 py-2.5 rounded-2xl border border-emerald-200 text-sm font-semibold outline-none"
                  />
                  <span className="text-[10px] text-slate-400">ถ้าเว้นว่าง ระบบจะใช้ชื่อภาษาอังกฤษ</span>
                </div>
                <div>
                  <label className="block text-slate-700 mb-1">รหัสผ่านเริ่มต้น (Password):</label>
                  <input
                    type="text"
                    value={newTherapistForm.password}
                    onChange={(e) => setNewTherapistForm({ ...newTherapistForm, password: e.target.value })}
                    placeholder="1234"
                    className="w-full px-3.5 py-2.5 rounded-2xl border border-emerald-200 text-sm font-semibold outline-none"
                  />
                  <span className="text-[10px] text-slate-400">ค่าเริ่มต้น: 1234</span>
                </div>
              </div>

              <div>
                <label className="block text-slate-700 mb-1">ความเชี่ยวชาญ:</label>
                <input
                  type="text"
                  value={newTherapistForm.specialty}
                  onChange={(e) => setNewTherapistForm({ ...newTherapistForm, specialty: e.target.value })}
                  className="w-full px-3.5 py-2.5 rounded-2xl border border-emerald-200 text-sm outline-none"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-700 mb-1">เบอร์โทรศัพท์:</label>
                  <input
                    type="text"
                    value={newTherapistForm.phone}
                    onChange={(e) => setNewTherapistForm({ ...newTherapistForm, phone: e.target.value })}
                    placeholder="08x-xxx-xxxx"
                    className="w-full px-3.5 py-2.5 rounded-2xl border border-emerald-200 text-sm outline-none"
                  />
                </div>
                <div>
                  <label className="block text-slate-700 mb-1">เลขที่ใบประกอบวิชาชีพ:</label>
                  <input
                    type="text"
                    value={newTherapistForm.licenseNumber}
                    onChange={(e) => setNewTherapistForm({ ...newTherapistForm, licenseNumber: e.target.value })}
                    className="w-full px-3.5 py-2.5 rounded-2xl border border-emerald-200 text-sm outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-700 mb-1">อีเมลบุคลากร (Staff Email):</label>
                <input
                  type="email"
                  value={newTherapistForm.email}
                  onChange={(e) => setNewTherapistForm({ ...newTherapistForm, email: e.target.value })}
                  placeholder="therapist@drtechcare.hospital"
                  className="w-full px-3.5 py-2.5 rounded-2xl border border-emerald-200 text-sm outline-none"
                />
              </div>

              <div>
                <label className="block text-slate-700 mb-1">ประวัติส่วนตัว & การศึกษา:</label>
                <textarea
                  rows={2}
                  value={newTherapistForm.bio}
                  onChange={(e) => setNewTherapistForm({ ...newTherapistForm, bio: e.target.value })}
                  placeholder="ประวัติการศึกษาและการทำงาน..."
                  className="w-full p-3 rounded-2xl border border-emerald-200 text-sm outline-none"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-emerald-100">
                <button
                  type="button"
                  onClick={() => setIsAddTherapistOpen(false)}
                  className="px-4 py-2 rounded-full border border-slate-300 text-slate-600 font-bold cursor-pointer"
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-full bg-gradient-to-r from-[#10B981] via-[#06B6D4] to-[#2563EB] text-white font-bold shadow-md shadow-cyan-500/25 hover:opacity-95 transition cursor-pointer active:scale-95"
                >
                  ยืนยันเพิ่ม
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* 11. ADD EXERCISE MODAL (Tab 4: exercises)                            */}
      {/* ==================================================================== */}
      <AddExerciseModal
        isOpen={isAddExerciseOpen}
        onClose={() => setIsAddExerciseOpen(false)}
        currentUserName={currentUser?.name || (currentRole === 'therapist' ? 'นักกายภาพบำบัด' : 'ผู้อำนวยการ นพ.วรชัย')}
        onSubmitExercise={addExercise}
        onSuccessToast={showToast}
      />

      {/* ==================================================================== */}
      {/* 12. EDIT EXERCISE MODAL (Tab 4: exercises)                           */}
      {/* ==================================================================== */}
      <EditExerciseModal
        isOpen={!!editingExercise}
        onClose={() => setEditingExercise(null)}
        exercise={editingExercise}
        onUpdateExercise={updateExercise}
        onSuccessToast={showToast}
      />

      {/* ==================================================================== */}
      {/* 13. DELETE EXERCISE CONFIRMATION MODAL (Tab 4: exercises)            */}
      {/* ==================================================================== */}
      <DeleteExerciseModal
        isOpen={!!deletingExercise}
        onClose={() => setDeletingExercise(null)}
        exercise={deletingExercise}
        onConfirmDelete={deleteExercise}
        onSuccessToast={showToast}
      />

      {/* ==================================================================== */}
      {/* 13B. CREATE MODPACK MODAL (Tab 4: exercises)                         */}
      {/* ==================================================================== */}
      <CreateModpackModal
        isOpen={isCreateModpackOpen}
        onClose={() => setIsCreateModpackOpen(false)}
        availableExercises={exercises}
        onSaveModpack={addModpack}
        onSuccessToast={showToast}
      />

      {/* ==================================================================== */}
      {/* 14. BANNED MANAGEMENT MODAL (Tab 5: logs)                            */}
      {/* ==================================================================== */}
      <BannedManagementModal
        isOpen={isBannedManagementOpen}
        onClose={() => setIsBannedManagementOpen(false)}
        bannedDevices={bannedDevices}
        bannedIps={bannedIps}
        onUnbanDevice={unbanDevice}
        onBanDevice={banDevice}
        onUnbanIp={unbanIp}
        onBanIp={banIp}
        onSuccessToast={showToast}
      />

      {/* ==================================================================== */}
      {/* 15. CONFIRM KICK SESSION MODAL (Tab 5: logs)                         */}
      {/* ==================================================================== */}
      <ConfirmActionModal
        isOpen={Boolean(confirmKickLog)}
        onClose={() => setConfirmKickLog(null)}
        title="เตะผู้ใช้ออกจากระบบ"
        message="ต้องการเตะผู้ใช้ออกจากระบบใช่หรือไม่?"
        detail={
          confirmKickLog ? (
            <div className="space-y-1">
              <div><strong className="text-slate-800">ผู้ใช้:</strong> {confirmKickLog.userName} ({confirmKickLog.role})</div>
              <div><strong className="text-slate-800">การกระทำ:</strong> {confirmKickLog.action}</div>
              <div><strong className="text-slate-800">อุปกรณ์/IP:</strong> {confirmKickLog.device || 'Windows 11'} ({confirmKickLog.ipAddress || '192.168.1.100'})</div>
              <div><strong className="text-slate-800">เวลา:</strong> {confirmKickLog.timestamp}</div>
            </div>
          ) : undefined
        }
        confirmLabel="ยืนยันการเตะออก"
        variant="warning"
        iconType="kick"
        onConfirm={() => {
          if (confirmKickLog) {
            kickSession(confirmKickLog.id);
            setKickedLogIds((prev) => [...prev, confirmKickLog.id]);
            showToast('เตะออกเรียบร้อยแล้ว');
          }
        }}
      />

      {/* ==================================================================== */}
      {/* 16. CONFIRM BAN DEVICE MODAL (Tab 5: logs)                           */}
      {/* ==================================================================== */}
      <ConfirmActionModal
        isOpen={Boolean(confirmBanDevice)}
        onClose={() => setConfirmBanDevice(null)}
        title="ยืนยันการแบนอุปกรณ์"
        message="ต้องการแบนเครื่องอุปกรณ์นี้ใช่หรือไม่?"
        detail={
          confirmBanDevice ? (
            <div>
              <strong className="text-slate-800">ข้อมูลอุปกรณ์ที่จะแบน:</strong>
              <div className="font-mono text-rose-700 font-bold mt-0.5">{confirmBanDevice}</div>
            </div>
          ) : undefined
        }
        confirmLabel="ยืนยันการแบนเครื่อง"
        variant="danger"
        iconType="ban"
        onConfirm={() => {
          if (confirmBanDevice) {
            banDevice(confirmBanDevice);
            showToast('แบนเครื่องเรียบร้อยแล้ว');
          }
        }}
      />

      {/* ==================================================================== */}
      {/* 17. CONFIRM BAN IP MODAL (Tab 5: logs)                               */}
      {/* ==================================================================== */}
      <ConfirmActionModal
        isOpen={Boolean(confirmBanIp)}
        onClose={() => setConfirmBanIp(null)}
        title="ยืนยันการแบน IP Address"
        message="ต้องการแบนที่อยู่ IP นี้ใช่หรือไม่?"
        detail={
          confirmBanIp ? (
            <div>
              <strong className="text-slate-800">IP Address ที่จะแบน:</strong>
              <div className="font-mono text-rose-700 font-bold mt-0.5">{confirmBanIp}</div>
            </div>
          ) : undefined
        }
        confirmLabel="ยืนยันการแบน IP"
        variant="danger"
        iconType="ban"
        onConfirm={() => {
          if (confirmBanIp) {
            banIp(confirmBanIp);
            showToast('แบน IP เรียบร้อยแล้ว');
          }
        }}
      />

      {/* ==================================================================== */}
      {/* 18. CONFIRM RESET SETTINGS MODAL (Tab 6: settings)                   */}
      {/* ==================================================================== */}
      <ConfirmActionModal
        isOpen={isResetSettingsOpen}
        onClose={() => setIsResetSettingsOpen(false)}
        title="รีเซ็ตการตั้งค่าระบบ"
        message="ต้องการรีเซ็ตการตั้งค่าทั้งหมดกลับเป็นค่าเริ่มต้นใช่หรือไม่?"
        detail="การตั้งค่าระบบ AI ชีวมิติ ค่าเกณฑ์ความปลอดภัยของท่าทาง และเสียงแนะนำทั้งหมดจะถูกปรับกลับเป็นมาตรฐานเริ่มต้นทางการแพทย์"
        confirmLabel="ยืนยันการรีเซ็ต"
        variant="warning"
        iconType="reset"
        onConfirm={handleResetSettingsConfirm}
      />

      {/* ==================================================================== */}
      {/* 19. ASSIGN & EDIT TREATMENT PLAN MODAL (Tab 3: schedules)            */}
      {/* ==================================================================== */}
      <EditTreatmentPlanModal
        isOpen={isTreatmentPlanModalOpen}
        onClose={() => {
          setIsTreatmentPlanModalOpen(false);
          setSelectedPlanForEdit(null);
        }}
        plan={selectedPlanForEdit}
        patients={users}
        therapists={therapists}
        exercises={exercises}
        modpacks={modpacks}
        currentRole={currentRole}
        currentUserId={currentUserId}
        currentUserName={currentUser?.name || 'เจ้าหน้าที่'}
        onSavePlan={(planData) => {
          saveTreatmentPlan(planData);
        }}
        onSuccessToast={showToast}
      />

      {/* ==================================================================== */}
      {/* 20. CONFIRM DELETE TREATMENT PLAN MODAL                              */}
      {/* ==================================================================== */}
      <ConfirmActionModal
        isOpen={Boolean(deletingPlan)}
        onClose={() => setDeletingPlan(null)}
        title="ยืนยันการลบตารางฝึกกายภาพ"
        message={`ต้องการลบตารางฝึกกายภาพของ ${deletingPlan?.patientName} (${deletingPlan?.patientCode}) ใช่หรือไม่?`}
        detail="เมื่อลบแล้ว รายการท่าทางที่มอบหมายในตารางนี้จะถูกยกเลิก แต่ประวัติข้อมูลคนไข้เดิมจะยังคงอยู่"
        confirmLabel="ยืนยันการลบตาราง"
        variant="danger"
        iconType="warning"
        onConfirm={() => {
          if (deletingPlan) {
            deleteTreatmentPlan(deletingPlan.id);
            showToast(`ลบตารางฝึกกายภาพของ ${deletingPlan.patientName} เรียบร้อยแล้ว`);
            setDeletingPlan(null);
          }
        }}
      />

      {/* ==================================================================== */}
      {/* 21. NETWORK & CENTRAL DATABASE SYNC MODAL                            */}
      {/* ==================================================================== */}
      <NetworkSyncModal
        isOpen={isNetworkSyncModalOpen}
        onClose={() => setIsNetworkSyncModalOpen(false)}
        onSuccessToast={showToast}
      />

      {/* ==================================================================== */}
      {/* 22. PATIENT FACE ENROLL MODAL                                         */}
      {/* ==================================================================== */}
      <PatientFaceEnrollModal
        isOpen={Boolean(enrollingFacePatient)}
        onClose={() => setEnrollingFacePatient(null)}
        patient={enrollingFacePatient}
        onSuccessToast={showToast}
      />

      {/* ==================================================================== */}
      {/* 23. MODULE 1 MODAL C: BIOMETRIC RESET MODAL                          */}
      {/* ==================================================================== */}
      <BiometricResetModal
        isOpen={Boolean(biometricResetUser)}
        onClose={() => setBiometricResetUser(null)}
        user={biometricResetUser}
        onLaunchScanner={(u: UserAccount) => {
          setBiometricResetUser(null);
          setEnrollingFacePatient(u);
        }}
        onSuccessToast={showToast}
      />

      {/* ==================================================================== */}
      {/* 24. MODULE 3 MODAL A: INTERACTIVE PATIENT CALENDAR MODAL             */}
      {/* ==================================================================== */}
      <PatientCalendarModal
        isOpen={Boolean(calendarPatientModal)}
        onClose={() => setCalendarPatientModal(null)}
        patient={calendarPatientModal}
        canWrite={calendarPatientModal ? canWriteScheduleForPatient(calendarPatientModal) : true}
        exercises={exercises}
        onOpenRoutineAssignment={(pat, dateStr) => {
          setDailyRoutineDate({ isOpen: true, patient: pat, date: dateStr });
        }}
        onSuccessToast={showToast}
      />

      {/* ==================================================================== */}
      {/* 25. MODULE 3 MODAL B: DAILY ROUTINE ASSIGNMENT MODAL                 */}
      {/* ==================================================================== */}
      <DailyRoutineAssignmentModal
        isOpen={dailyRoutineDate.isOpen}
        onClose={() => setDailyRoutineDate({ isOpen: false, patient: null, date: '' })}
        patient={dailyRoutineDate.patient}
        canWrite={dailyRoutineDate.patient ? canWriteScheduleForPatient(dailyRoutineDate.patient) : true}
        dateStr={dailyRoutineDate.date}
        exercises={exercises}
        existingPlan={
          dailyRoutineDate.patient
            ? treatmentPlans.find(
                (p) =>
                  String(p.patientId) === String(dailyRoutineDate.patient?.id) ||
                  p.patientCode === dailyRoutineDate.patient?.code
              ) || null
            : null
        }
        onSaveRoutine={(assignedEx, clinicalNotes) => {
          if (!dailyRoutineDate.patient) return;
          const currentPlan = treatmentPlans.find(
            (p) =>
              String(p.patientId) === String(dailyRoutineDate.patient?.id) ||
              p.patientCode === dailyRoutineDate.patient?.code
          );
          if (currentPlan) {
            const { id, createdAt, ...restPlan } = currentPlan;
            saveTreatmentPlan({
              ...restPlan,
              id,
              assignedExercises: assignedEx,
              clinicalNotes,
            });
          } else {
            saveTreatmentPlan({
              id: `plan_${Date.now()}`,
              patientId: dailyRoutineDate.patient.id,
              patientName: dailyRoutineDate.patient.name,
              patientCode: dailyRoutineDate.patient.code,
              therapistId: currentUserId,
              therapistName: currentUser?.name || 'นักกายภาพบำบัด',
              diagnosis: dailyRoutineDate.patient.diagnosis || 'ฟื้นฟูกายภาพบำบัดตามอาการ',
              targetJoint: 'ข้อต่อและกล้ามเนื้อตามหลักกายภาพ',
              assignedExercises: assignedEx,
              clinicalNotes,
              status: 'active',
              scheduleDays: ['จันทร์', 'พุธ', 'ศุกร์'],
              timeSlot: '09:30 - 10:30',
              startTime: '09:30',
              endTime: '10:30',
              startDate: '2026-10-01',
              endDate: '2026-10-31',
              roomStation: 'ตู้ Kiosk 1',
              includeMinigame: true,
            });
          }
          setDailyRoutineDate({ isOpen: false, patient: null, date: '' });
          showToast(`บันทึกและซิงค์โปรแกรมกายภาพของ ${dailyRoutineDate.patient.name} ไปยังตู้ Kiosk สำเร็จ!`);
        }}
        onSuccessToast={showToast}
      />

      {/* ==================================================================== */}
      {/* 25B. MODULE 4: TEMPORARY CASE DELEGATION MODAL                       */}
      {/* ==================================================================== */}
      <TemporaryCaseDelegationModal
        isOpen={isDelegationModalOpen}
        onClose={() => {
          setIsDelegationModalOpen(false);
          setSelectedDelegationPatientId(null);
        }}
        currentTherapist={currentTherapist}
        assignedPatients={myAssignedPatients}
        activeTherapists={therapists}
        initialPatientId={selectedDelegationPatientId}
        onSubmitDelegation={(data) => {
          addDelegation(data);
          showToast(`ฝากเคส ${data.patientName} ให้ ${data.coveringTherapistName} สำเร็จ`);
        }}
        onSuccessToast={showToast}
      />

      {/* ==================================================================== */}
      {/* 25C. MODULE 4: EDIT MY PROFILE MODAL                                 */}
      {/* ==================================================================== */}
      <EditMyProfileModal
        isOpen={isEditMyProfileModalOpen}
        onClose={() => setIsEditMyProfileModalOpen(false)}
        therapist={currentTherapist}
        userAccount={currentUser}
        onSaveProfile={(updated) => {
          if (currentTherapist) {
            updateTherapist(currentTherapist.id, updated);
            showToast('อัปเดตข้อมูลโปรไฟล์ส่วนตัวสำเร็จ');
          }
        }}
        onSuccessToast={showToast}
      />

      {/* ==================================================================== */}
      {/* 26. MODULE 4 MODAL B: PT ASSIGNED PATIENTS CASE MANAGEMENT           */}
      {/* ==================================================================== */}
      <PtAssignedPatientsModal
        isOpen={Boolean(ptAssignedModalTherapist)}
        onClose={() => setPtAssignedModalTherapist(null)}
        therapist={ptAssignedModalTherapist}
        allTherapists={therapists}
        onOpenPatientProfile={(pat) => {
          setPatientDetailModal(pat);
        }}
        onOpenDelegation={(pat) => {
          setSelectedDelegationPatientId(pat.id);
          setIsDelegationModalOpen(true);
        }}
        onSuccessToast={showToast}
      />

      {/* ==================================================================== */}
      {/* 27. MODULE 6: SECURITY CONTROL MODAL                                 */}
      {/* ==================================================================== */}
      <SecurityControlModal
        isOpen={Boolean(securityControlTarget)}
        onClose={() => setSecurityControlTarget(null)}
        targetIp={securityControlTarget?.ipAddress}
        targetDevice={securityControlTarget?.device}
        targetUserCode={securityControlTarget?.userCode || (securityControlTarget as any)?.user}
        onSuccessToast={showToast}
      />

      {/* ==================================================================== */}
      {/* 28. PATIENT QUICK INFO MODAL (Image 1 UX/UI)                         */}
      {/* ==================================================================== */}
      <PatientQuickInfoModal
        isOpen={isQuickInfoModalOpen}
        onClose={() => setIsQuickInfoModalOpen(false)}
        patient={quickInfoPatient || selectedCalendarPatient || users.find((u) => u.role === 'patient')}
        treatmentPlan={quickInfoPlan}
        dayNumber={quickInfoSelectedDay}
        onDeleteAppointmentDate={
          quickInfoSelectedDay
            ? () => handleDeleteDayAppointments(quickInfoSelectedDay)
            : undefined
        }
        onNavigateToCalendar={(pat) => {
          setIsQuickInfoModalOpen(false);
          setSelectedCalendarPatient(pat);
          setScheduleViewMode('individual');
          setSelectedCalendarDay(16);
          showToast(`เปิดหน้าปฏิทินเพื่อตัดคอร์สใหม่ให้ ${pat.name || 'คนไข้'}`);
        }}
      />

      {/* ==================================================================== */}
      {/* 29. COURSE MODE SELECTION MODAL (Image 3 UX/UI)                      */}
      {/* ==================================================================== */}
      {isCourseModeModalOpen && (
        <CourseModeSelectionModal
          isOpen={isCourseModeModalOpen}
          onClose={() => setIsCourseModeModalOpen(false)}
          patient={selectedCalendarPatient || users.find((u) => u.role === 'patient')}
          dateStr={selectedDateForCourse}
          exercises={exercises}
          modpacks={modpacks}
          onSaveCourse={(courseData) => {
            const cleanName = courseData.patientName.replace(/^(นาย|นาง|นางสาว)\s*/, '');
            const timeOnly = courseData.timeSlot.split(' - ')[0] || '09:30';

            // Build list of appointment chips to add per day (Requirement 6: แสดงในชิปเดียวกันหากมี 2 แบบ)
            const aptsToAdd: { time: string; name: string; type: 'purple' | 'green' | 'dual' }[] = [];
            if (courseData.includePhysio && courseData.includeMinigame) {
              aptsToAdd.push({
                time: timeOnly,
                name: `${cleanName} 🎮`,
                type: 'dual',
              });
            } else if (courseData.includeMinigame) {
              aptsToAdd.push({
                time: timeOnly,
                name: `${cleanName} 🎮`,
                type: 'purple',
              });
            } else {
              aptsToAdd.push({
                time: timeOnly,
                name: cleanName,
                type: 'green',
              });
            }

            const allDates = courseData.selectedDates && courseData.selectedDates.length > 0
              ? courseData.selectedDates
              : [courseData.date];

            setCalendarAppointments((prev) => {
              const next = { ...prev };
              allDates.forEach((dStr) => {
                const dayNum = parseInt(dStr.split('-')[2], 10);
                if (dayNum) {
                  next[dayNum] = [...(next[dayNum] || []), ...aptsToAdd];
                }
              });
              return next;
            });

            const modeLabel =
              courseData.includePhysio && courseData.includeMinigame
                ? `กายภาพ + มินิเกมฝึกสมอง (${courseData.minigameQuestionCount} ข้อ)`
                : courseData.includeMinigame
                ? `มินิเกมฝึกสมอง (${courseData.minigameQuestionCount} ข้อ)`
                : `กายภาพปกติ (ROM Exercise)`;

            saveTreatmentPlan({
              id: `plan_${Date.now()}`,
              patientId: courseData.patientId,
              patientName: courseData.patientName,
              patientCode: courseData.patientCode,
              therapistId: currentUserId,
              therapistName: currentUser?.name || 'นักกายภาพบำบัด',
              diagnosis: selectedCalendarPatient?.diagnosis || 'ข้อไหล่ติดระยะฟื้นฟู (Frozen Shoulder)',
              targetJoint: selectedCalendarPatient?.targetJoint || 'ข้อไหล่และกล้ามเนื้อสะบัก (Shoulder & Scapula)',
              assignedExercises: courseData.includePhysio ? courseData.assignedExercises : [],
              clinicalNotes: courseData.notes || `ตัดคอร์ส ${modeLabel} จำนวน ${allDates.length} ครั้ง (เริ่ม ${courseData.date})`,
              status: 'active',
              scheduleDays: ['จันทร์', 'ศุกร์'],
              timeSlot: courseData.timeSlot,
              startTime: timeOnly,
              endTime: courseData.timeSlot.split(' - ')[1] || '10:30',
              startDate: courseData.date,
              endDate: courseData.endDate || allDates[allDates.length - 1] || '2026-11-16',
              roomStation: courseData.station,
              includeMinigame: courseData.includeMinigame,
              minigameQuestionCount: courseData.minigameQuestionCount,
              trainingModes: courseData.trainingModes,
            });

            addActivityLog(
              'ASSIGN_TREATMENT_PLAN',
              'TREATMENT',
              `ตัดคอร์ส ${modeLabel} จำนวน ${allDates.length} ครั้ง สำหรับ ${courseData.patientName} (${courseData.patientCode})`
            );

            showToast(`✅ ยืนยันตัดคอร์ส ${allDates.length} ครั้ง (${modeLabel}) สำหรับ ${courseData.patientName} เรียบร้อย!`);
            setIsCourseModeModalOpen(false);
          }}
        />
      )}

      {/* ==================================================================== */}
      {/* 30. PATIENT PICKER MODAL (For Calendar View Top-Right)               */}
      {/* ==================================================================== */}
      {isPatientPickerModalOpen && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-[#0F2F2B]/60 backdrop-blur-sm animate-fadeIn"
          onClick={() => setIsPatientPickerModalOpen(false)}
        >
          <div
            className="w-full max-w-md bg-white rounded-3xl shadow-2xl border border-slate-100 overflow-hidden animate-scaleUp p-5 space-y-4 text-left"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div>
                <h3 className="text-base font-black text-[#0F2F2B]">เลือกคนไข้สำหรับจัดคอร์ส</h3>
                <p className="text-xs text-slate-500">เลือกคนไข้ที่ต้องการดูหรือตัดคอร์สในปฏิทิน</p>
              </div>
              <button
                type="button"
                onClick={() => setIsPatientPickerModalOpen(false)}
                className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-600 flex items-center justify-center transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Search Input */}
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={patientPickerSearch}
                onChange={(e) => setPatientPickerSearch(e.target.value)}
                placeholder="ค้นหาชื่อ หรือ HN คนไข้..."
                className="w-full pl-9 pr-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-[#0097A7]"
                autoFocus
              />
            </div>

            {/* Patient List */}
            <div className="max-h-72 overflow-y-auto space-y-2 pr-1 custom-scrollbar">
              {users
                .filter((u) => u.role === 'patient')
                .filter((u) => {
                  if (!patientPickerSearch) return true;
                  const term = patientPickerSearch.toLowerCase();
                  return (
                    u.name?.toLowerCase().includes(term) ||
                    u.code?.toLowerCase().includes(term) ||
                    (u as any).patient_code?.toLowerCase().includes(term)
                  );
                })
                .map((pat) => (
                  <div
                    key={pat.id}
                    onClick={() => {
                      setSelectedCalendarPatient(pat);
                      setIsPatientPickerModalOpen(false);
                      showToast(`เลือกคนไข้: ${pat.name}`);
                    }}
                    className={`p-3 rounded-2xl border transition cursor-pointer flex items-center justify-between gap-3 ${
                      selectedCalendarPatient?.id === pat.id
                        ? 'border-[#0097A7] bg-teal-50/50 shadow-xs'
                        : 'border-slate-200 hover:border-teal-300 hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-9 h-9 rounded-full bg-[#0097A7] text-white flex items-center justify-center font-bold text-xs flex-shrink-0">
                        <User className="w-4 h-4" />
                      </div>
                      <div className="min-w-0">
                        <div className="font-black text-xs text-slate-800 truncate">{pat.name}</div>
                        <div className="text-[11px] text-slate-400 font-mono">
                          HN: {pat.code || (pat as any).patient_code || '-'}
                        </div>
                        {pat.diagnosis && (
                          <div className="text-[10px] text-teal-700 truncate mt-0.5">
                            {pat.diagnosis}
                          </div>
                        )}
                      </div>
                    </div>

                    {selectedCalendarPatient?.id === pat.id ? (
                      <span className="px-2.5 py-0.5 rounded-full bg-[#0097A7] text-white text-[10px] font-bold">
                        เลือกอยู่
                      </span>
                    ) : (
                      <button className="px-2.5 py-1 rounded-full border border-slate-200 text-[11px] font-bold text-slate-600 hover:bg-white">
                        เลือก
                      </button>
                    )}
                  </div>
                ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
