import React, { useState, useEffect } from 'react';
import { KioskTerminal } from '../modules/kiosk/KioskTerminal';
import { AdminDashboard } from './admin/AdminDashboard';
import { PtWorkspaceDashboard } from './pt/PtWorkspaceDashboard';
import { User } from '../types/schema';
import { api, setAuthToken } from '../lib/api';
import { Monitor, Shield, UserCheck, RefreshCw } from 'lucide-react';

export const App: React.FC = () => {
  const [currentSurface, setCurrentSurface] = useState<'kiosk' | 'admin' | 'pt'>('kiosk');
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isInitializing, setIsInitializing] = useState<boolean>(true);

  // Sync with URL Hash (#kiosk, #admin, #pt)
  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash.replace(/^#\/?/, '').toLowerCase();
      if (hash === 'admin') setCurrentSurface('admin');
      else if (hash === 'pt') setCurrentSurface('pt');
      else if (hash === 'kiosk') setCurrentSurface('kiosk');
    };

    handleHashChange();
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  // Check existing session
  useEffect(() => {
    async function checkAuthSession() {
      try {
        const res = await api.auth.me();
        if (res.user) {
          setCurrentUser(res.user);
          if (res.user.role === 'admin') {
            if (window.location.hash === '#admin') setCurrentSurface('admin');
          } else if (res.user.role === 'pt') {
            if (window.location.hash === '#pt') setCurrentSurface('pt');
          }
        }
      } catch {
        // No active session or kiosk mode
      } finally {
        setIsInitializing(false);
      }
    }

    checkAuthSession();

    // Listen to global force-logout / 401 unauthorized event
    const handleUnauthorized = () => {
      setCurrentUser(null);
      setCurrentSurface('kiosk');
      window.location.hash = 'kiosk';
    };

    window.addEventListener('moh:unauthorized', handleUnauthorized);
    return () => window.removeEventListener('moh:unauthorized', handleUnauthorized);
  }, []);

  const handleStaffLoginSuccess = (role: 'admin' | 'pt', user: User) => {
    setCurrentUser(user);
    if (role === 'admin') {
      setCurrentSurface('admin');
      window.location.hash = 'admin';
    } else {
      setCurrentSurface('pt');
      window.location.hash = 'pt';
    }
  };

  const handleLogout = async () => {
    try {
      await api.auth.logout();
    } catch {
      // Ignored
    } finally {
      setCurrentUser(null);
      setAuthToken(null);
      setCurrentSurface('kiosk');
      window.location.hash = 'kiosk';
    }
  };

  // Quick switch for testing and demonstration
  const handleSwitchSurface = async (target: 'kiosk' | 'admin' | 'pt') => {
    if (target === 'kiosk') {
      setCurrentSurface('kiosk');
      window.location.hash = 'kiosk';
      return;
    }

    // Auto-login default test users if not authenticated
    if (!currentUser || currentUser.role !== target) {
      try {
        const defaultUsername = target === 'admin' ? 'admin' : 'pt.varisara';
        const res = await api.auth.login({ username: defaultUsername, password: 'password123' });
        setCurrentUser(res.user);
      } catch (err) {
        console.warn('Auto-login notice:', err);
      }
    }

    setCurrentSurface(target);
    window.location.hash = target;
  };

  if (isInitializing) {
    return (
      <div className="w-screen h-screen bg-slate-950 flex flex-col items-center justify-center text-white space-y-3">
        <div className="w-10 h-10 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin" />
        <span className="text-xs font-mono text-slate-400">Moh Tech Care System Initializing...</span>
      </div>
    );
  }

  return (
    <div className="relative w-full min-h-screen bg-slate-950">
      {/* Dev Surface Quick Switcher Floating Bar */}
      <div className="fixed top-2 right-2 z-50 flex items-center gap-1 bg-slate-900/90 border border-slate-700/80 p-1 rounded-full shadow-2xl backdrop-blur-md opacity-75 hover:opacity-100 transition-opacity">
        <button
          onClick={() => handleSwitchSurface('kiosk')}
          className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold transition-all ${
            currentSurface === 'kiosk'
              ? 'bg-emerald-600 text-white shadow-sm'
              : 'text-slate-400 hover:text-white'
          }`}
          title="ตู้คีออสกายภาพสำหรับผู้ป่วย (Patient Kiosk)"
        >
          <Monitor className="w-3.5 h-3.5" />
          <span>Kiosk</span>
        </button>

        <button
          onClick={() => handleSwitchSurface('admin')}
          className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold transition-all ${
            currentSurface === 'admin'
              ? 'bg-purple-600 text-white shadow-sm'
              : 'text-slate-400 hover:text-white'
          }`}
          title="แดชบอร์ดผู้อำนวยการโรงพยาบาล (Super Admin)"
        >
          <Shield className="w-3.5 h-3.5" />
          <span>Super Admin</span>
        </button>

        <button
          onClick={() => handleSwitchSurface('pt')}
          className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold transition-all ${
            currentSurface === 'pt'
              ? 'bg-teal-600 text-white shadow-sm'
              : 'text-slate-400 hover:text-white'
          }`}
          title="พื้นที่ทำงานนักกายภาพบำบัด (PT Workspace)"
        >
          <UserCheck className="w-3.5 h-3.5" />
          <span>PT Workspace</span>
        </button>
      </div>

      {/* Surface Render */}
      {currentSurface === 'kiosk' && (
        <KioskTerminal onNavigateToStaff={handleStaffLoginSuccess} />
      )}

      {currentSurface === 'admin' && currentUser && currentUser.role === 'admin' && (
        <AdminDashboard
          currentUser={currentUser}
          onLogout={handleLogout}
          onSwitchToKiosk={() => handleSwitchSurface('kiosk')}
        />
      )}

      {currentSurface === 'pt' && currentUser && currentUser.role === 'pt' && (
        <PtWorkspaceDashboard
          currentUser={currentUser}
          onLogout={handleLogout}
          onSwitchToKiosk={() => handleSwitchSurface('kiosk')}
        />
      )}

      {/* Fallback if accessing admin or pt without matching role */}
      {currentSurface !== 'kiosk' && (!currentUser || currentUser.role !== currentSurface) && (
        <div className="w-screen h-screen flex flex-col items-center justify-center bg-slate-950 text-white p-6 text-center space-y-4">
          <Shield className="w-16 h-16 text-amber-400 animate-pulse" />
          <h2 className="text-xl font-bold">กรุณาเข้าสู่ระบบเพื่อเข้าใช้งาน {currentSurface.toUpperCase()}</h2>
          <p className="text-xs text-slate-400">
            ระบบตรวจสอบสิทธิ์ระดับ Server-Side RBAC กรุณาเข้าสู่ระบบผ่านปุ่ม [🛡️ ระบบบุคลากร / รพ.] บนหน้า Kiosk
          </p>
          <div className="flex gap-3 pt-2">
            <button
              onClick={() => handleSwitchSurface('kiosk')}
              className="px-4 py-2 rounded-xl bg-emerald-600 text-white text-xs font-semibold"
            >
              กลับสู่หน้า Kiosk Terminal
            </button>
            <button
              onClick={() => handleSwitchSurface(currentSurface)}
              className="px-4 py-2 rounded-xl bg-slate-800 text-slate-200 text-xs font-semibold"
            >
              ลองเข้าสู่ระบบอัตโนมัติอีกครั้ง
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
