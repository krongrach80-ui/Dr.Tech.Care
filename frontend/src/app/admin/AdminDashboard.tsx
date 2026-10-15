import React, { useState } from 'react';
import {
  Users,
  Calendar,
  Dumbbell,
  UserCog,
  ShieldAlert,
  LogOut,
  Hospital,
  Sparkles,
  Monitor,
  Menu,
  X,
} from 'lucide-react';
import { UserManagementModule } from '../../modules/users/UserManagementModule';
import { PatientRecordsModule } from '../../modules/patients/PatientRecordsModule';
import { SchedulePlannerModule } from '../../modules/schedule/SchedulePlannerModule';
import { PtDirectoryModule } from '../../modules/pt/PtDirectoryModule';
import { ExerciseLibraryModule } from '../../modules/exercises/ExerciseLibraryModule';
import { AuditSecurityModule } from '../../modules/audit/AuditSecurityModule';
import { Badge } from '../../components/common/Badge';
import { Button } from '../../components/common/Button';
import { User } from '../../types/schema';
import { api } from '../../lib/api';

export interface AdminDashboardProps {
  currentUser: User;
  onLogout: () => void;
  onSwitchToKiosk: () => void;
}

type AdminModule = 'm1_users' | 'm2_patients' | 'm3_schedule' | 'm4_directory' | 'm5_exercises' | 'm6_audit';

export const AdminDashboard: React.FC<AdminDashboardProps> = ({
  currentUser,
  onLogout,
  onSwitchToKiosk,
}) => {
  const [activeModule, setActiveModule] = useState<AdminModule>('m1_users');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  const navItems = [
    { id: 'm1_users', label: '1. จัดการผู้ใช้ & Biometrics', icon: Users },
    { id: 'm2_patients', label: '2. ประวัติเวชระเบียนผู้ป่วย', icon: Users },
    { id: 'm3_schedule', label: '3. ตารางฝึก & วางแผนกายภาพ', icon: Calendar },
    { id: 'm4_directory', label: '4. ทำเนียบนักกายภาพบำบัด', icon: UserCog },
    { id: 'm5_exercises', label: '5. คลังท่ากายภาพ & มินิเกม', icon: Dumbbell },
    { id: 'm6_audit', label: '6. บันทึกความปลอดภัย & ตรวจสอบ', icon: ShieldAlert },
  ];

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col md:flex-row font-sans select-none">
      {/* Mobile Header */}
      <div className="md:hidden flex items-center justify-between p-4 bg-slate-900 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <Hospital className="w-5 h-5 text-emerald-400" />
          <span className="font-bold text-sm text-white">Moh Tech Care (Admin)</span>
        </div>
        <button
          onClick={() => setIsSidebarOpen(!isSidebarOpen)}
          className="p-1.5 rounded-lg bg-slate-800 text-slate-300"
        >
          {isSidebarOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>
      </div>

      {/* Sidebar */}
      <aside
        className={`fixed md:static inset-y-0 left-0 z-40 w-72 bg-slate-900 border-r border-slate-800 flex flex-col justify-between p-5 transform transition-transform duration-200 md:translate-x-0 ${
          isSidebarOpen ? 'translate-x-0 shadow-2xl' : '-translate-x-full'
        }`}
      >
        <div className="space-y-6">
          {/* Hospital Logo Header */}
          <div className="flex items-center gap-3 px-2">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-emerald-600 to-teal-400 p-0.5 shadow-md shadow-emerald-600/30">
              <div className="w-full h-full bg-slate-950 rounded-[10px] flex items-center justify-center">
                <Hospital className="w-5 h-5 text-emerald-400" />
              </div>
            </div>
            <div>
              <h1 className="font-extrabold text-sm text-white tracking-wide">MOH TECH CARE</h1>
              <p className="text-[10px] text-slate-400 font-medium">SUPER ADMIN DASHBOARD</p>
            </div>
          </div>

          {/* Current User Card */}
          <div className="p-3.5 rounded-2xl bg-slate-950/80 border border-slate-800 flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-purple-900/40 border border-purple-500/50 flex items-center justify-center font-bold text-xs text-purple-300">
              ผอ
            </div>
            <div className="overflow-hidden">
              <div className="text-xs font-bold text-white truncate">{currentUser.full_name}</div>
              <div className="flex items-center gap-1.5 mt-0.5">
                <Badge variant="admin" size="sm">ผู้อำนวยการ</Badge>
                <span className="text-[10px] text-slate-500 font-mono">{currentUser.id}</span>
              </div>
            </div>
          </div>

          {/* Navigation Links */}
          <nav className="space-y-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeModule === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => {
                    setActiveModule(item.id as AdminModule);
                    setIsSidebarOpen(false);
                  }}
                  className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all ${
                    isActive
                      ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/30'
                      : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
                  }`}
                >
                  <Icon className="w-4 h-4 shrink-0" />
                  <span className="truncate">{item.label}</span>
                </button>
              );
            })}
          </nav>
        </div>

        {/* Bottom Actions */}
        <div className="pt-4 border-t border-slate-800 space-y-2">
          <Button
            variant="outline"
            size="sm"
            className="w-full justify-start text-xs border-slate-700 hover:bg-slate-800"
            onClick={onSwitchToKiosk}
            leftIcon={<Monitor className="w-4 h-4 text-cyan-400" />}
          >
            เปิดตู้คีออสกายภาพ (Kiosk)
          </Button>

          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start text-xs text-rose-400 hover:text-rose-300 hover:bg-rose-950/30"
            onClick={onLogout}
            leftIcon={<LogOut className="w-4 h-4" />}
          >
            ออกจากระบบ (Logout)
          </Button>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 p-4 sm:p-8 overflow-y-auto max-h-screen">
        {activeModule === 'm1_users' && (
          <UserManagementModule actorRole="admin" />
        )}
        {activeModule === 'm2_patients' && (
          <PatientRecordsModule actorRole="admin" />
        )}
        {activeModule === 'm3_schedule' && (
          <SchedulePlannerModule actorRole="admin" />
        )}
        {activeModule === 'm4_directory' && (
          <PtDirectoryModule />
        )}
        {activeModule === 'm5_exercises' && (
          <ExerciseLibraryModule
            actorRole="admin"
            currentUserId={currentUser.id}
            currentUserName={currentUser.full_name}
          />
        )}
        {activeModule === 'm6_audit' && (
          <AuditSecurityModule />
        )}
      </main>
    </div>
  );
};
