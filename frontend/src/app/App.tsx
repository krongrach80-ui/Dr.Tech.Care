import React, { useState, useEffect } from 'react';
import { MintBackground } from '../components/Background/MintBackground';
import { Screen4Exercise } from '../pages/NewFlow/Screen4Exercise';
import { Screen5MiniGame } from '../pages/NewFlow/Screen5MiniGame';
import {
  checkDueReminder,
  getSavedTherapyConfig,
  TherapyScheduleConfig,
  TherapyMode,
} from '../services/therapySettingsService';
import {
  STRETCH_EXERCISES,
  StretchExerciseItem,
} from '../data/stretchExercises';
import {
  AdminModal,
  TherapySettingsModal,
  MiniGameSettingsModal,
  UserProfileModal,
  TherapistReportModal,
  AboutModal,
} from '../components/Modals/AppModals';
import { FaceAuthModal } from '../components/FaceAuth/FaceAuthModal';
import { HospitalPortal } from '../pages/Hospital/HospitalPortal';
import { ReceptionOnboardingModal } from '../components/Reception/ReceptionOnboardingModal';
import { PatientHomeScreen } from '../pages/PatientHome/PatientHomeScreen';
import { usePatientStore } from '../store/patientStore';
import { useExerciseStore } from '../store/exerciseStore';
import { useSessionStore } from '../store/sessionStore';
import { useHospitalStore } from '../store/hospitalStore';
import { api } from '../services/api';
import { supabaseService } from '../services/supabaseService';
import { OfflineStorageService } from '../services/offlineStorageService';
import { IS_STATIC_MODE } from '../config/apiConfig';
import { Patient } from '../types/patient';
import { TreatmentPlan } from '../types/hospital';
import { KioskSixStepWorkflow } from '../components/Kiosk/KioskSixStepWorkflow';
import { CheckCircle2, Shield } from 'lucide-react';

// Helper to parse route from URL hash and search params (for GitHub Pages SPA reload fallback)
const parseRouteFromUrl = (): { screen: number; modal?: 'hospital' | 'reception' | 'about' | 'profile' } => {
  if (typeof window === 'undefined') return { screen: 1 };
  const rawHash = (window.location.hash || '').replace(/^#\/?/, '').toLowerCase().trim();
  const searchParams = new URLSearchParams(window.location.search);
  const routePath = rawHash || (searchParams.get('p') || '').replace(/^\//, '').toLowerCase().trim();

  if (routePath === 'home' || routePath === 'patient' || routePath === 'screen2') {
    return { screen: 2 };
  }
  if (routePath === 'exercise' || routePath === 'workout' || routePath === 'screen4') {
    return { screen: 4 };
  }
  if (routePath === 'minigame' || routePath === 'game' || routePath === 'screen5') {
    return { screen: 5 };
  }
  if (routePath === 'hospital' || routePath === 'portal' || routePath === 'admin') {
    return { screen: 1, modal: 'hospital' };
  }
  if (routePath === 'reception') {
    return { screen: 1, modal: 'reception' };
  }
  if (routePath === 'about') {
    return { screen: 1, modal: 'about' };
  }
  if (routePath === 'profile') {
    return { screen: 1, modal: 'profile' };
  }
  return { screen: 1 };
};

export const App: React.FC = () => {
  // Navigation Flow State initialized from Hash URL
  const initialRoute = parseRouteFromUrl();
  const [currentScreen, setCurrentScreen] = useState<number>(initialRoute.screen);
  const [currentUserName, setCurrentUserName] = useState<string>('คุณสมชาย ใจดี');
  const [activeStretchQueue, setActiveStretchQueue] = useState<StretchExerciseItem[]>([]);
  const [activeCustomHoldTimes, setActiveCustomHoldTimes] = useState<Record<string, number>>({});

  // Screen 3 Sub-View: 'menu' (Default user menu) | 'config' (เลือกเวลาและท่าทาง)
  const [screen3SubView, setScreen3SubView] = useState<'menu' | 'config'>('menu');
  const [configMode, setConfigMode] = useState<TherapyMode>('physio');

  // Floating test nav is hidden by default on public demo (enabled only with ?dev=1 or ?test=1)
  const isDevMode = typeof window !== 'undefined' && (
    window.location.search.includes('dev=1') ||
    window.location.search.includes('test=1')
  );

  // Modal States
  const [isAdminOpen, setIsAdminOpen] = useState<boolean>(false);
  const [isHospitalPortalOpen, setIsHospitalPortalOpen] = useState<boolean>(initialRoute.modal === 'hospital');
  const [isReceptionOpen, setIsReceptionOpen] = useState<boolean>(initialRoute.modal === 'reception');
  const [isTherapySettingsOpen, setIsTherapySettingsOpen] = useState<boolean>(false);
  const [isMiniGameSettingsOpen, setIsMiniGameSettingsOpen] = useState<boolean>(false);
  const [isProfileModalOpen, setIsProfileModalOpen] = useState<boolean>(initialRoute.modal === 'profile');
  const [isAboutOpen, setIsAboutOpen] = useState<boolean>(initialRoute.modal === 'about');
  const [isTherapistReportOpen, setIsTherapistReportOpen] = useState<boolean>(false);
  const [therapistReportData, setTherapistReportData] = useState<{
    score: number | null;
    poseName: string;
    romAngle: number | null;
  }>({ score: null, poseName: 'ท่าที่ 1: กางแขนข้างลำตัว', romAngle: null });

  // Toast notification
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage(null);
    }, 3200);
  };

  // Global Stores
  const { patients, selectedPatient, selectPatient, fetchPatients, isFaceAuthOpen, faceAuthMode, closeFaceAuth, openFaceAuth } =
    usePatientStore();
  const { exercises, selectedExercise, selectExercise, fetchExercises } = useExerciseStore();
  const { finishSession } = useSessionStore();
  const { therapists, treatmentPlans, users } = useHospitalStore();

  const attendingTherapist = React.useMemo(() => {
    if (!selectedPatient) return therapists[0] || null;
    const userEntry = users.find(
      (u) => u.name === selectedPatient.name || String(u.id) === String(selectedPatient.id)
    );
    if (userEntry?.assignedTherapistId) {
      const matched = therapists.find((t) => t.id === userEntry.assignedTherapistId);
      if (matched) return matched;
    }
    return therapists[0] || null;
  }, [selectedPatient, users, therapists]);

  const activePlan = React.useMemo(() => {
    if (!selectedPatient) return treatmentPlans[0] || null;
    return (
      treatmentPlans.find(
        (p) => p.patientName === selectedPatient.name || String(p.patientId) === String(selectedPatient.id)
      ) || treatmentPlans[0] || null
    );
  }, [selectedPatient, treatmentPlans]);

  useEffect(() => {
    fetchPatients();
    fetchExercises();
  }, [fetchPatients, fetchExercises]);

  // Offline sync watcher: trigger on app launch and window 'online' event (skipped in static demo mode)
  useEffect(() => {
    if (IS_STATIC_MODE) return;

    let isRunning = false;
    const triggerSync = async () => {
      if (isRunning || (typeof navigator !== 'undefined' && !navigator.onLine)) return;
      isRunning = true;
      try {
        const res = await OfflineStorageService.syncPendingSessions();
        if (res.syncedCount > 0) {
          showToast(`ซิงก์ข้อมูลค้างส่งสำเร็จ ${res.syncedCount} รายการ`);
        }
      } catch (err) {
        console.warn('Auto sync pending sessions error:', err);
      } finally {
        isRunning = false;
      }
    };

    triggerSync();
    window.addEventListener('online', triggerSync);
    return () => {
      window.removeEventListener('online', triggerSync);
    };
  }, []);

  // Listen for unauthorized 401 events to redirect to Kiosk
  useEffect(() => {
    const handleUnauthorized = () => {
      setCurrentScreen(1);
      showToast('เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่');
    };
    window.addEventListener('auth:unauthorized', handleUnauthorized);
    return () => {
      window.removeEventListener('auth:unauthorized', handleUnauthorized);
    };
  }, []);

  // Synchronize URL hash for browser history & reload resilience on GitHub Pages
  const syncHash = (screen: number, modal?: string | null) => {
    if (typeof window === 'undefined') return;
    let target = '#/kiosk';
    if (modal === 'hospital') target = '#/hospital';
    else if (modal === 'reception') target = '#/reception';
    else if (modal === 'about') target = '#/about';
    else if (modal === 'profile') target = '#/profile';
    else if (screen === 2) target = '#/home';
    else if (screen === 4) target = '#/exercise';
    else if (screen === 5) target = '#/minigame';
    else target = '#/kiosk';

    if (window.location.hash !== target) {
      window.history.replaceState(null, '', target);
    }
  };

  // Sync state when URL hash changes (e.g. Browser Back / Forward buttons)
  useEffect(() => {
    const handleHashChange = () => {
      const route = parseRouteFromUrl();
      setCurrentScreen(route.screen);
      setIsHospitalPortalOpen(route.modal === 'hospital');
      setIsReceptionOpen(route.modal === 'reception');
      setIsAboutOpen(route.modal === 'about');
      setIsProfileModalOpen(route.modal === 'profile');
    };
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  // Stop and completely unmount Kiosk auto-login and camera when navigating to ANY other screen or modal
  const isKioskActive =
    currentScreen === 1 &&
    !isHospitalPortalOpen &&
    !isReceptionOpen &&
    !isAboutOpen &&
    !isProfileModalOpen &&
    !isAdminOpen;

  // Cleanup speech synthesis and camera whenever Kiosk is not active
  useEffect(() => {
    if (!isKioskActive) {
      try {
        if (typeof window !== 'undefined' && window.speechSynthesis) {
          window.speechSynthesis.cancel();
        }
      } catch {}
      try {
        if ((window as any).__kioskCameraStream) {
          (window as any).__kioskCameraStream.getTracks().forEach((t: MediaStreamTrack) => t.stop());
          delete (window as any).__kioskCameraStream;
        }
      } catch {}
    }
  }, [isKioskActive]);

  // Navigate & scroll to top smoothly (หน้า 3 ถูกนำออกไป - วิ่งเข้าหน้า 1 ตู้ Kiosk เสมอ)
  const handleNavigate = (screenNumber: number) => {
    if (screenNumber === 3) {
      screenNumber = 1;
    }
    // Stop all background speech synthesis and cancel auto-login in progress
    try {
      if (typeof window !== 'undefined' && window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
    } catch {}
    setCurrentScreen(screenNumber);
    syncHash(screenNumber, null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Open Sub-View Configuration ("เลือกเวลาและท่าทาง")
  const handleOpenScheduleConfig = (mode: TherapyMode = 'physio') => {
    setConfigMode(mode);
    setScreen3SubView('config');
    window.history.pushState({ screen: 3, subView: 'config', mode }, '');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Back to Screen 3 Menu from Config
  const handleBackToMenu = () => {
    setScreen3SubView('menu');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Start Workout immediately from Schedule Config -> Screen 4
  const handleStartNowFromConfig = (config: TherapyScheduleConfig) => {
    const categoryTitle = config.categoryTitle;

    // If stretch category, prepare active stretch queue
    if (config.category === 'stretch') {
      const selectedIds = config.selectedStretchIds && config.selectedStretchIds.length > 0
        ? config.selectedStretchIds
        : STRETCH_EXERCISES.map((e) => e.id);
      const queue = STRETCH_EXERCISES.filter((item) => selectedIds.includes(item.id));
      setActiveStretchQueue(queue);
      setActiveCustomHoldTimes(config.customHoldTimes || {});
    } else {
      setActiveStretchQueue([]);
      setActiveCustomHoldTimes({});
    }

    const baseEx = exercises[0] || {
      id: 1,
      name: 'Shoulder Lateral Raise (กางแขนยกหัวไหล่)',
      slug: 'shoulder_raise',
      category: 'Upper Body',
      description: 'ฝึกยกแขนออกด้านข้างลำตัวเพื่อฟื้นฟูกล้ามเนื้อ Deltoid',
      target_joint: 'shoulder',
      target_angle: 90,
      min_angle: 75,
      max_angle: 110,
      target_reps: 10,
      difficulty: 'beginner',
    };

    selectExercise({
      ...baseEx,
      name: `${categoryTitle}: ${baseEx.name}`,
    });

    showToast(`เริ่มโปรแกรม: ${categoryTitle}`);
    handleNavigate(4);
  };

  // Save Schedule Booking Confirmation
  const handleScheduleSaved = (config: TherapyScheduleConfig, msg: string) => {
    showToast(msg);
    setScreen3SubView('menu');
  };

  // Browser Back Button (popstate) handling for sub-view
  useEffect(() => {
    const handlePopState = (e: PopStateEvent) => {
      if (screen3SubView === 'config') {
        setScreen3SubView('menu');
      }
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [screen3SubView]);

  // Scheduled Reminder Notification Poller
  useEffect(() => {
    const checkReminder = () => {
      const due = checkDueReminder(selectedPatient?.id);
      if (due) {
        showToast(`⏰ ถึงเวลาฝึกกายภาพตามที่นัดหมายไว้: ${due.categoryTitle}!`);
      }
    };
    checkReminder();
    const interval = setInterval(checkReminder, 60000);
    return () => clearInterval(interval);
  }, [selectedPatient?.id]);

  // Login handler -> direct to Screen 2 (/home PatientHomeScreen)
  const handleLoginSuccess = (patient: Patient) => {
    if (!isKioskActive) {
      console.info('[AUTH] Suppressed login because user is on another screen/modal');
      return;
    }
    setCurrentUserName(patient.name);
    selectPatient(patient);
    showToast(`เข้าสู่ระบบสำเร็จ ยินดีต้อนรับ ${patient.name}`);
    setTimeout(() => {
      handleNavigate(2);
    }, 350);
  };

  // Logout handler to clean user session and prevent account crosstalk
  const handleLogout = () => {
    selectPatient(null as any);
    setCurrentUserName('');
    handleNavigate(1);
    showToast('ออกจากระบบเรียบร้อยแล้ว');
  };

  // Face auth login callback
  const handleFaceLoginDone = (patientData?: any) => {
    closeFaceAuth();
    if (patientData && patientData.name) {
      setCurrentUserName(patientData.name);
      selectPatient(patientData);
      showToast(`ยินดีต้อนรับ ${patientData.name} เข้าสู่ระบบด้วยใบหน้าสำเร็จ`);
    } else {
      showToast('เข้าสู่ระบบด้วยใบหน้าสำเร็จ');
    }
    setTimeout(() => {
      handleNavigate(2);
    }, 350);
  };

  // Therapist report submission
  const handleSubmitReport = async (note: string) => {
    try {
      await api.saveSession({
        patient_id: selectedPatient?.id || 1,
        exercise_id: selectedExercise?.id || 1,
        total_reps: 1,
        correct_reps: therapistReportData.score !== null && therapistReportData.score >= 70 ? 1 : 0,
        accuracy: therapistReportData.score ?? 0,
        avg_duration_per_rep: 6.0,
        status: 'completed',
        notes: note || `บันทึกผลท่า ${therapistReportData.poseName} ${therapistReportData.romAngle !== null ? `ROM ${therapistReportData.romAngle}°` : 'ไม่มีข้อมูลวัด'}`,
      });

      // Persist to Supabase treatment_sessions
      if (selectedPatient?.id) {
        supabaseService.saveTreatmentSession({
          patient_id: String(selectedPatient.id),
          exercise_id: selectedExercise?.id ? String(selectedExercise.id) : undefined,
          score: therapistReportData.score ?? 0,
          avg_angle: therapistReportData.romAngle ?? 0,
          accuracy_percent: therapistReportData.score ?? 0,
          notes: note || `บันทึกผลท่า ${therapistReportData.poseName}`,
          mode: therapistReportData.poseName.includes('มินิเกม') ? 'minigame' : 'therapy',
        }).catch(err => console.warn('Supabase saveTreatmentSession error:', err));
      }

      showToast('ส่งผลการฝึกให้นักกายภาพบำบัดเรียบร้อยแล้ว!');
    } catch (e) {
      showToast('⚠️ ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้ บันทึกผลไว้ในเครื่องเรียบร้อยแล้ว');
    }
  };

  return (
    <div
      className={`w-full relative flex flex-col items-center text-[#0B2B2B] ${
        currentScreen === 4 ? 'h-[100dvh] max-h-[100dvh] overflow-hidden' : 'min-h-[100dvh] justify-start'
      }`}
    >
      
      {/* 1. Full-Screen Vector Ambient Mint Background */}
      <MintBackground />

      {/* 2. Top Screen Switcher (ซ่อนเป็นค่าเริ่มต้นบนเดโมสาธารณะ แสดงเฉพาะเมื่อมี ?dev=1 หรือ ?test=1) */}
      {isDevMode && (
        <nav
          className={`fixed z-40 bg-[#0B2B2B]/90 backdrop-blur-md border border-emerald-400/35 rounded-full px-2.5 py-1 flex items-center gap-1.5 shadow-xl max-w-[calc(100vw-24px)] overflow-x-auto transition-all ${
            currentScreen === 4 ? 'top-1 sm:top-1.5 opacity-80 hover:opacity-100 scale-90 sm:scale-95' : 'top-2 sm:top-3'
          }`}
          aria-label="แถบสลับหน้าทดสอบ"
        >
          {[
            { num: 1, label: '1: ตู้ Kiosk (6 ขั้นตอน)' },
            { num: 2, label: '2: หน้าหลักคนไข้ (/home)' },
            { num: 4, label: '4: กายภาพบำบัด' },
            { num: 5, label: '5: มินิเกม' },
          ].map((tab) => (
            <button
              key={tab.num}
              onClick={() => handleNavigate(tab.num)}
              className={`text-xs font-semibold px-3 py-1.5 rounded-full transition-all whitespace-nowrap ${
                currentScreen === tab.num
                  ? 'bg-gradient-to-r from-[#6FD67F] to-[#4AE387] text-[#0B2B2B] font-bold shadow-sm'
                  : 'text-emerald-100/80 hover:text-white hover:bg-emerald-700/30'
              }`}
            >
              {tab.label}
            </button>
          ))}

          <div className="w-px h-4 bg-emerald-500/40 mx-0.5" />

          {/* Quick Shortcut: Reception Onboarding */}
          <button
            onClick={() => setIsReceptionOpen(true)}
            className="text-xs font-bold px-3 py-1.5 rounded-full text-emerald-200 hover:text-white hover:bg-emerald-700/40 transition whitespace-nowrap flex items-center gap-1"
            title="ต้อนรับและลงทะเบียนคนไข้ใหม่"
          >
            <span>✨ ต้อนรับ & สแกนหน้า</span>
          </button>

          {/* Quick Shortcut: Hospital Portal */}
          <button
            onClick={() => setIsHospitalPortalOpen(true)}
            className="text-xs font-extrabold px-3.5 py-1.5 rounded-full bg-emerald-500/25 border border-emerald-400/50 text-[#6FD67F] hover:bg-[#10B981] hover:text-[#0B2B2B] transition whitespace-nowrap flex items-center gap-1.5 shadow-sm"
            title="ระบบบุคลากรและโรงพยาบาล (ผอรพ / นักกายภาพ)"
          >
            <Shield className="w-3.5 h-3.5" />
            <span>🛡️ ระบบบุคลากร / รพ.</span>
          </button>
        </nav>
      )}

      {/* 3. Toast Notification Banner */}
      {toastMessage && (
        <div className="fixed top-14 sm:top-16 z-50 flex items-center gap-2.5 px-4 py-3 rounded-2xl bg-white text-[#0B2B2B] border-l-4 border-[#1E8A4C] shadow-xl animate-fadeIn max-w-sm w-[90%]">
          <div className="w-6 h-6 rounded-full bg-emerald-100 text-[#1E8A4C] flex items-center justify-center flex-shrink-0">
            <CheckCircle2 className="w-4 h-4" />
          </div>
          <span className="text-xs sm:text-sm font-semibold leading-snug">{toastMessage}</span>
        </div>
      )}

      {/* 4. Active Screens Viewport */}
      <main
        className={`w-full flex-1 flex flex-col items-center relative z-10 ${
          currentScreen === 4
            ? isDevMode
              ? 'h-[calc(100dvh-36px)] max-h-[calc(100dvh-36px)] pt-8 sm:pt-9 pb-1.5 px-1.5 sm:px-3 justify-between overflow-hidden'
              : 'h-[100dvh] max-h-[100dvh] pt-1 sm:pt-1.5 pb-1.5 px-1.5 sm:px-3 justify-between overflow-hidden'
            : isDevMode
            ? 'justify-center px-4 pt-14 pb-8 sm:pt-16 sm:pb-10'
            : 'justify-center px-4 pt-6 pb-8 sm:pt-8 sm:pb-10'
        }`}
      >
        
        {/* หน้า 1: ตู้ Kiosk อัจฉริยะ 6 ขั้นตอน (พักหน้าจอ -> ถามความพร้อม -> สแกนหน้า -> ล็อคอินสำเร็จ -> รายการที่หมอเซ็ต) */}
        {isKioskActive && (
          <KioskSixStepWorkflow
            isActive={isKioskActive}
            onLoginComplete={(patient) => {
              handleLoginSuccess(patient);
            }}
            onStartExerciseDirectly={(patient, plan, mode, stretchQueue, customHoldTimes) => {
              if (!isKioskActive) return;
              selectPatient(patient);
              setCurrentUserName(patient.name);

              if (mode === 'minigame') {
                showToast(`🎮 ยินดีต้อนรับ ${patient.name} เข้าสู่มินิเกมกายภาพ!`);
                handleNavigate(5);
                return;
              }

              // Set active stretch queue if provided; if not provided (physiotherapy prescribed route), clear stretch queue so it focuses on prescribed exercise
              if (stretchQueue && stretchQueue.length > 0) {
                setActiveStretchQueue(stretchQueue);
                setActiveCustomHoldTimes(customHoldTimes || {});
              } else {
                setActiveStretchQueue([]);
                setActiveCustomHoldTimes({});
              }

              if (plan?.assignedExercises && plan.assignedExercises.length > 0) {
                const firstExSlug = plan.assignedExercises[0].exerciseSlug;
                const matchedEx = exercises.find((e) => e.slug === firstExSlug);
                if (matchedEx) {
                  selectExercise(matchedEx);
                } else {
                  selectExercise({
                    id: 1,
                    name: plan.assignedExercises[0].exerciseName,
                    slug: plan.assignedExercises[0].exerciseSlug,
                    category: 'Upper Body',
                    description: plan.clinicalNotes || 'ฝึกตามที่หมอกำหนด',
                    target_joint: 'shoulder',
                    target_angle: 90,
                    min_angle: 75,
                    max_angle: 110,
                    target_reps: plan.assignedExercises[0].reps || 10,
                    difficulty: 'beginner',
                  });
                }
              }
              showToast(`ยินดีต้อนรับ ${patient.name} เริ่มต้นโปรแกรมการรักษา`);
              handleNavigate(4);
            }}
            onOpenHospitalPortal={() => {
              try {
                if (typeof window !== 'undefined' && window.speechSynthesis) {
                  window.speechSynthesis.cancel();
                }
              } catch {}
              setIsHospitalPortalOpen(true);
            }}
            onOpenAbout={() => {
              try {
                if (typeof window !== 'undefined' && window.speechSynthesis) {
                  window.speechSynthesis.cancel();
                }
              } catch {}
              setIsAboutOpen(true);
            }}
          />
        )}

        {/* หน้า 2: หน้าหลักคนไข้หลัง Login (/home) พร้อม IdleGuard 45s และ Masked Surname */}
        {currentScreen === 2 && (
          <PatientHomeScreen
            patient={
              selectedPatient ||
              ({
                id: 1,
                patient_code: 'P-0012',
                name: currentUserName || 'คุณสมชาย ใจดี',
                age: 68,
                gender: 'male',
                chief_complaint: 'ฟื้นฟูกล้ามเนื้อและข้อไหล่ติด',
              } as Patient)
            }
            attendingTherapist={attendingTherapist}
            activePlan={activePlan}
            onStartExercise={(mode) => {
              if (mode === 'minigame') {
                handleNavigate(5);
              } else {
                handleNavigate(4);
              }
            }}
            onLogout={handleLogout}
          />
        )}

        {/* หน้า 4: หน้าทำกายภาพ (Pose Biomechanics ROM Exercise) */}
        {currentScreen === 4 && (
          <Screen4Exercise
            onBack={() => handleNavigate(1)}
            onOpenTherapistModal={(score, poseName, romAngle) => {
              setTherapistReportData({ score, poseName, romAngle });
              setIsTherapistReportOpen(true);
            }}
            onNavigateToMinigame={() => {
              showToast('🎮 ยินดีต้อนรับเข้าสู่มินิเกมฝึกสมองและการตอบสนอง (+50 XP)');
              handleNavigate(5);
            }}
            includeMinigame={Boolean(activePlan?.includeMinigame ?? (activePlan as any)?.include_minigame ?? true)}
            selectedExercise={selectedExercise}
            stretchQueue={activeStretchQueue}
            customHoldTimes={activeCustomHoldTimes}
            patientId={selectedPatient?.id || 1}
          />
        )}

        {/* หน้า 5: กายภาพแบบมินิเกม (ตอบคำถาม ใช่/ไม่ ด้วยการยกมือ) */}
        {currentScreen === 5 && (
          <Screen5MiniGame
            patient={selectedPatient}
            onBack={() => handleNavigate(1)}
            onOpenTherapistModal={(score, poseName, romAngle) => {
              setTherapistReportData({ score, poseName, romAngle });
              setIsTherapistReportOpen(true);
            }}
            onOpenSettings={() => setIsMiniGameSettingsOpen(true)}
          />
        )}

      </main>

      {/* 5. Modals System */}
      {/* Admin Portal Modal */}
      <AdminModal
        isOpen={isAdminOpen}
        onClose={() => setIsAdminOpen(false)}
      />

      {/* Therapy Settings Modal */}
      <TherapySettingsModal
        isOpen={isTherapySettingsOpen}
        onClose={() => setIsTherapySettingsOpen(false)}
        exercises={exercises}
        selectedExercise={selectedExercise}
        onSelectExercise={selectExercise}
      />

      {/* Mini Game Settings Modal */}
      <MiniGameSettingsModal
        isOpen={isMiniGameSettingsOpen}
        onClose={() => setIsMiniGameSettingsOpen(false)}
      />

      {/* User Profile Modal */}
      <UserProfileModal
        isOpen={isProfileModalOpen}
        onClose={() => {
          setIsProfileModalOpen(false);
          syncHash(currentScreen, null);
        }}
        patient={selectedPatient}
        onPatientPurged={() => {
          showToast('ลบข้อมูลผู้ป่วยและข้อมูลชีวมิติเรียบร้อยตาม PDPA');
          fetchPatients();
          handleNavigate(1);
        }}
      />

      {/* Therapist Report Modal */}
      <TherapistReportModal
        isOpen={isTherapistReportOpen}
        onClose={() => setIsTherapistReportOpen(false)}
        score={therapistReportData.score}
        poseName={therapistReportData.poseName}
        romAngle={therapistReportData.romAngle}
        onSubmit={handleSubmitReport}
      />

      {/* Hospital Director & Clinical RBAC Portal (ผอรพ / นักกายภาพ / คนไข้) */}
      {isHospitalPortalOpen && (
        <HospitalPortal
          onClose={() => {
            setIsHospitalPortalOpen(false);
            syncHash(currentScreen, null);
          }}
          onLaunchKioskExercise={(exerciseId) => {
            setIsHospitalPortalOpen(false);
            handleNavigate(4);
          }}
          onSelectPatientForKiosk={(patient) => {
            selectPatient(patient);
            setCurrentUserName(patient.name);
            setIsHospitalPortalOpen(false);
            handleNavigate(1);
          }}
        />
      )}

      {/* Reception Onboarding Modal (กรอกข้อมูลคนไข้ก่อนแล้วค่อยสแกนหน้า) */}
      <ReceptionOnboardingModal
        isOpen={isReceptionOpen}
        onClose={() => {
          setIsReceptionOpen(false);
          syncHash(currentScreen, null);
        }}
        onSuccessNavigateToKiosk={(patient) => {
          selectPatient(patient);
          setCurrentUserName(patient.name);
          showToast(`ยินดีต้อนรับ ${patient.name} เข้าสู่ระบบตู้กายภาพบำบัด`);
          handleNavigate(1);
        }}
      />

      {/* Face Authentication Modal (Face Login & Face Enrollment) */}
      <FaceAuthModal
        isOpen={isFaceAuthOpen}
        onClose={closeFaceAuth}
        initialMode={faceAuthMode}
        onLoginSuccess={handleFaceLoginDone}
      />

      {/* About Modal */}
      <AboutModal
        isOpen={isAboutOpen}
        onClose={() => {
          setIsAboutOpen(false);
          syncHash(currentScreen, null);
        }}
      />

    </div>
  );
};
