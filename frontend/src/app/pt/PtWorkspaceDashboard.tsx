import React, { useState } from 'react';
import {
  Users,
  Calendar,
  Dumbbell,
  Briefcase,
  LogOut,
  Hospital,
  Monitor,
  Menu,
  X,
  Share2,
} from 'lucide-react';
import { UserManagementModule } from '../../modules/users/UserManagementModule';
import { PatientRecordsModule } from '../../modules/patients/PatientRecordsModule';
import { SchedulePlannerModule } from '../../modules/schedule/SchedulePlannerModule';
import { PtWorkspaceModule } from '../../modules/pt/PtWorkspaceModule';
import { ExerciseLibraryModule } from '../../modules/exercises/ExerciseLibraryModule';
import { Badge } from '../../components/common/Badge';
import { Button } from '../../components/common/Button';
import { User } from '../../types/schema';

export interface PtWorkspaceDashboardProps {
  currentUser: User;
  onLogout: () => void;
  onSwitchToKiosk: () => void;
}

type PtModule = 'm4_workspace' | 'm1_patients' | 'm2_records' | 'm3_schedule' | 'm5_exercises';

export const PtWorkspaceDashboard: React.FC<PtWorkspaceDashboardProps> = ({
  currentUser,
  onLogout,
  onSwitchToKiosk,
}) => {
  const [activeModule, setActiveModule] = useState<PtModule>('m4_workspace');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [targetPatientForShortcut, setTargetPatientForShortcut] = useState<string | undefined>(undefined);

  const navItems = [
    { id: 'm4_workspace', label: 'พื้นที่ทำงาน PT & เคส (Workspace)', icon: Briefcase },
    { id: 'm1_patients', label: '1. จัดการบัญชีผู้ป่วย (Patients)', icon: Users },
    { id: 'm2_records', label: '2. เวชระเบียนคนไข้ (Records)', icon: Users },
    { id: 'm3_schedule', label: '3. ตารางฝึก & วางแผน (Schedule)', icon: Calendar },
    { id: 'm5_exercises', label: '5. คลังท่ากายภาพ (Exercises)', icon: Dumbbell },
    // M6 Audit Logs is STRICTLY HIDDEN for Physiotherapists per Section 3!
  ];

  const handleNavigateToSchedule = (patientId: string) => {
    setTargetPatientForShortcut(patientId);
    setActiveModule('m3_schedule');
  };

  const handleNavigateToRecords = (patientId: string) => {
    setTargetPatientForShortcut(patientId);
    setActiveModule('m2_records');
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col md:flex-row font-sans select-none">
      {/* Mobile Header */}
      <div className="md:hidden flex items-center justify-between p-4 bg-slate-900 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <Hospital className="w-5 h-5 text-teal-400" />
          <span className="font-bold text-sm text-white">Moh Tech Care (PT Workspace)</span>
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
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-teal-600 to-emerald-400 p-0.5 shadow-md shadow-teal-600/30">
              <div className="w-full h-full bg-slate-950 rounded-[10px] flex items-center justify-center">
                <Hospital className="w-5 h-5 text-teal-400" />
              </div>
            </div>
            <div>
              <h1 className="font-extrabold text-sm text-white tracking-wide">MOH TECH CARE</h1>
              <p className="text-[10px] text-teal-400 font-medium">PT WORKSPACE</p>
            </div>
          </div>

          {/* Current PT User Card */}
          <div className="p-3.5 rounded-2xl bg-slate-950/80 border border-slate-800 flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-teal-900/40 border border-teal-500/50 flex items-center justify-center font-bold text-xs text-teal-300">
              PT
            </div>
            <div className="overflow-hidden">
              <div className="text-xs font-bold text-white truncate">{currentUser.full_name}</div>
              <div className="flex items-center gap-1.5 mt-0.5">
                <Badge variant="pt" size="sm">นักกายภาพบำบัด</Badge>
                <span className="text-[10px] text-slate-500 font-mono">{currentUser.id}</span>
              </div>
              <div className="text-[10px] text-slate-400 mt-1 font-mono">
                {currentUser.department || 'Musculoskeletal'}
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
                    setActiveModule(item.id as PtModule);
                    setIsSidebarOpen(false);
                  }}
                  className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all ${
                    isActive
                      ? 'bg-teal-600 text-white shadow-md shadow-teal-600/30'
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
        {activeModule === 'm4_workspace' && (
          <PtWorkspaceModule
            currentPt={currentUser}
            onNavigateToSchedule={handleNavigateToSchedule}
            onNavigateToRecords={handleNavigateToRecords}
          />
        )}
        {activeModule === 'm1_patients' && (
          <UserManagementModule
            actorRole="pt"
            currentPtId={currentUser.id}
          />
        )}
        {activeModule === 'm2_records' && (
          <PatientRecordsModule
            actorRole="pt"
            currentPtId={currentUser.id}
            defaultPatientId={targetPatientForShortcut}
          />
        )}
        {activeModule === 'm3_schedule' && (
          <SchedulePlannerModule
            actorRole="pt"
            currentPtId={currentUser.id}
            defaultPatientId={targetPatientForShortcut}
          />
        )}
        {activeModule === 'm5_exercises' && (
          <ExerciseLibraryModule
            actorRole="pt"
            currentUserId={currentUser.id}
            currentUserName={currentUser.full_name}
          />
        )}
      </main>
    </div>
  );
};
