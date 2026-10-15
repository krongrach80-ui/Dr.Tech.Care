import React, { useState, useEffect } from 'react';
import { Search, UserPlus, Shield, UserCheck, Key, Edit, RefreshCw } from 'lucide-react';
import { Table, Column } from '../../components/common/Table';
import { Badge } from '../../components/common/Badge';
import { Button } from '../../components/common/Button';
import { Card } from '../../components/common/Card';
import { UserWizardModal } from './UserWizardModal';
import { EditAccountModal } from './EditAccountModal';
import { BiometricResetModal } from './BiometricResetModal';
import { User } from '../../types/schema';
import { api } from '../../lib/api';
import { formatEmpty } from '../../i18n';

export interface UserManagementModuleProps {
  actorRole: 'admin' | 'pt';
  currentPtId?: string;
}

export const UserManagementModule: React.FC<UserManagementModuleProps> = ({
  actorRole,
  currentPtId,
}) => {
  const [users, setUsers] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [search, setSearch] = useState<string>('');
  const [roleFilter, setRoleFilter] = useState<string>('all');

  // Modals state
  const [isWizardOpen, setIsWizardOpen] = useState(false);
  const [selectedUserForEdit, setSelectedUserForEdit] = useState<User | null>(null);
  const [selectedUserForBiometric, setSelectedUserForBiometric] = useState<User | null>(null);

  const loadUsers = async () => {
    setIsLoading(true);
    try {
      const res = await api.users.list({ role: roleFilter, search });
      setUsers(res.users || []);
    } catch (err: any) {
      console.error('Failed to load users:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      loadUsers();
    }, 250);
    return () => clearTimeout(timer);
  }, [search, roleFilter]);

  const handleQuickPasswordReset = async (u: User) => {
    if (!confirm(`ต้องการรีเซ็ตรหัสผ่านชั่วคราวสำหรับ ${u.full_name} หรือไม่?`)) return;
    try {
      const res = await api.users.resetPassword(u.id);
      alert(`รีเซ็ตรหัสผ่านสำเร็จ!\nรหัสผ่านชั่วคราวใหม่คือ: ${res.temporary_password}\n(ผู้ใช้ต้องเปลี่ยนรหัสผ่านเมื่อเข้าสู่ระบบครั้งแรก)`);
      loadUsers();
    } catch (err: any) {
      alert('เกิดข้อผิดพลาด: ' + err?.message);
    }
  };

  const columns: Column<User>[] = [
    {
      key: 'avatar',
      header: 'โปรไฟล์ / รหัส',
      render: (u) => (
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center font-bold text-xs text-emerald-400 shrink-0">
            {u.full_name ? u.full_name.charAt(0) : 'U'}
          </div>
          <div>
            <div className="font-semibold text-slate-100 flex items-center gap-1.5">
              <span>{u.full_name}</span>
            </div>
            <div className="text-xs font-mono text-emerald-400">{u.id}</div>
          </div>
        </div>
      ),
    },
    {
      key: 'username',
      header: 'ชื่อผู้ใช้ (Username)',
      render: (u) => <span className="font-mono text-xs text-slate-300">{u.username}</span>,
    },
    {
      key: 'role',
      header: 'บทบาท (Role)',
      render: (u) => {
        const variant = u.role === 'admin' ? 'admin' : u.role === 'pt' ? 'pt' : 'patient';
        const label = u.role === 'admin' ? 'Super Admin' : u.role === 'pt' ? 'Physiotherapist' : 'Patient';
        return <Badge variant={variant}>{label}</Badge>;
      },
    },
    {
      key: 'password_hash',
      header: 'รหัสผ่าน (Password Hash)',
      render: (u) => (
        <span className="font-mono text-xs text-slate-400 bg-slate-950/80 px-2 py-1 rounded-md border border-slate-800">
          {u.password_hash || 'Hashed ●●●●'}
        </span>
      ),
    },
    {
      key: 'face_id_status',
      header: 'สถานะชีวมิติ (Face ID)',
      render: (u) => {
        const isRegistered = u.face_id_status === 'Registered';
        return (
          <span
            className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${
              isRegistered
                ? 'bg-emerald-950/80 text-emerald-300 border border-emerald-700/60'
                : 'bg-amber-950/80 text-amber-300 border border-amber-700/60'
            }`}
          >
            <UserCheck className="w-3 h-3" />
            {isRegistered ? 'ลงทะเบียนแล้ว' : 'รอดำเนินการ'}
          </span>
        );
      },
    },
    {
      key: 'status',
      header: 'สถานะบัญชี',
      render: (u) => (
        <Badge variant={u.status === 'active' ? 'active' : 'disabled'}>
          {u.status === 'active' ? 'Active' : 'Disabled'}
        </Badge>
      ),
    },
    {
      key: 'phone',
      header: 'เบอร์ติดต่อ',
      render: (u) => <span>{formatEmpty(u.phone)}</span>,
    },
    {
      key: 'actions',
      header: 'การจัดการ',
      align: 'right',
      render: (u) => {
        // RBAC Check: PT can manage ONLY Patient accounts!
        const canManage = actorRole === 'admin' || u.role === 'patient';

        if (!canManage) {
          return <span className="text-xs text-slate-600 italic">อ่านอย่างเดียว</span>;
        }

        return (
          <div className="flex items-center justify-end gap-1.5" onClick={(e) => e.stopPropagation()}>
            <Button
              variant="ghost"
              size="sm"
              title="แก้ไขข้อมูลบัญชี"
              onClick={() => setSelectedUserForEdit(u)}
            >
              <Edit className="w-3.5 h-3.5 text-slate-300" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              title="รีเซ็ตรหัสผ่าน"
              onClick={() => handleQuickPasswordReset(u)}
            >
              <Key className="w-3.5 h-3.5 text-amber-400" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              title="จัดการชีวมิติใบหน้า"
              onClick={() => setSelectedUserForBiometric(u)}
            >
              <UserCheck className="w-3.5 h-3.5 text-emerald-400" />
            </Button>
          </div>
        );
      },
    },
  ];

  return (
    <div className="space-y-6">
      {/* Top Header Card */}
      <Card
        title={
          <div className="flex items-center gap-2.5">
            <Shield className="w-5 h-5 text-emerald-400" />
            <span>โมดูลที่ 1: การจัดการผู้ใช้งานและลงทะเบียนชีวมิติ (User & Biometrics)</span>
          </div>
        }
        subtitle="Single Source of Truth: จัดการบัญชีผู้ใช้ บันทึกใบหน้า 10 เฟรม และควบคุมสิทธิ์การเข้าถึง"
        action={
          <Button
            variant="primary"
            onClick={() => setIsWizardOpen(true)}
            leftIcon={<UserPlus className="w-4 h-4" />}
          >
            {actorRole === 'pt' ? '+ เพิ่มผู้ป่วยใหม่' : '+ เพิ่มผู้ใช้งานใหม่ (Wizard)'}
          </Button>
        }
      >
        {/* Search & Filters */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 mb-4">
          <div className="relative w-full sm:w-72">
            <Search className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="ค้นหาชื่อ, Username หรือรหัส HN..."
              className="w-full bg-slate-950 border border-slate-700 rounded-xl pl-9 pr-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
            />
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <span className="text-xs text-slate-400">กรองบทบาท:</span>
            <select
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value)}
              className="bg-slate-950 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-white focus:outline-none focus:border-emerald-500"
            >
              <option value="all">ทุกบทบาท (All Roles)</option>
              <option value="patient">ผู้ป่วย (Patient)</option>
              <option value="pt">นักกายภาพบำบัด (PT)</option>
              <option value="admin">ผู้อำนวยการ / Admin</option>
            </select>
            <Button variant="ghost" size="sm" onClick={loadUsers} title="รีเฟรชข้อมูล">
              <RefreshCw className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>

        {/* User Table */}
        <Table<User>
          columns={columns}
          data={users}
          keyExtractor={(u) => u.id}
          isLoading={isLoading}
          emptyMessage="ไม่พบข้อมูลผู้ใช้งานตามเงื่อนไขที่ค้นหา"
        />
      </Card>

      {/* 2-Step Wizard Modal */}
      <UserWizardModal
        isOpen={isWizardOpen}
        onClose={() => setIsWizardOpen(false)}
        onSuccess={() => {
          setIsWizardOpen(false);
          loadUsers();
        }}
        actorRole={actorRole}
        currentPtId={currentPtId}
      />

      {/* Edit Account Modal */}
      <EditAccountModal
        isOpen={!!selectedUserForEdit}
        onClose={() => setSelectedUserForEdit(null)}
        user={selectedUserForEdit}
        onSuccess={() => {
          setSelectedUserForEdit(null);
          loadUsers();
        }}
        actorRole={actorRole}
      />

      {/* Biometric Reset Modal */}
      <BiometricResetModal
        isOpen={!!selectedUserForBiometric}
        onClose={() => setSelectedUserForBiometric(null)}
        user={selectedUserForBiometric}
        onSuccess={() => {
          setSelectedUserForBiometric(null);
          loadUsers();
        }}
      />
    </div>
  );
};
