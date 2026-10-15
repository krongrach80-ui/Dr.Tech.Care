import React, { useState, useEffect } from 'react';
import { UserCheck, Calendar, FileText, Share2, Plus, Phone, Mail, Award, AlertCircle, XCircle } from 'lucide-react';
import { Card } from '../../components/common/Card';
import { Button } from '../../components/common/Button';
import { Badge } from '../../components/common/Badge';
import { Modal } from '../../components/common/Modal';
import { Table, Column } from '../../components/common/Table';
import { User, TemporaryCoverage } from '../../types/schema';
import { api } from '../../lib/api';
import { formatDate, formatEmpty } from '../../i18n';

export interface PtWorkspaceModuleProps {
  currentPt: User;
  onNavigateToSchedule?: (patientId: string) => void;
  onNavigateToRecords?: (patientId: string) => void;
}

export const PtWorkspaceModule: React.FC<PtWorkspaceModuleProps> = ({
  currentPt,
  onNavigateToSchedule,
  onNavigateToRecords,
}) => {
  const [profile, setProfile] = useState<User>(currentPt);
  const [assignedPatients, setAssignedPatients] = useState<User[]>([]);
  const [coverages, setCoverages] = useState<TemporaryCoverage[]>([]);
  const [otherTherapists, setOtherTherapists] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Edit My Profile Modal
  const [isEditProfileOpen, setIsEditProfileOpen] = useState(false);
  const [profileForm, setProfileForm] = useState({
    phone: currentPt.phone || '-',
    email: currentPt.email || '-',
    bio: currentPt.bio || '',
  });

  // Assign Temporary Coverage Modal
  const [isCoverageModalOpen, setIsCoverageModalOpen] = useState(false);
  const [coverageForm, setCoverageForm] = useState({
    patient_id: '',
    cover_pt_id: '',
    start_date: new Date().toISOString().split('T')[0],
    end_date: new Date(Date.now() + 3 * 86400000).toISOString().split('T')[0],
    reason: '',
  });
  const [isSubmittingCoverage, setIsSubmittingCoverage] = useState(false);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [ptRes, patRes, covRes] = await Promise.all([
        api.auth.me(),
        api.patients.list(),
        api.pt.listCoverages(currentPt.id),
      ]);

      if (ptRes.user) setProfile(ptRes.user);

      // Filter own assigned patients
      const myPatients = (patRes.patients || []).filter((p) => p.assigned_pt_id === currentPt.id);
      setAssignedPatients(myPatients);
      setCoverages(covRes.coverages || []);

      // Load therapists for delegation picker (excluding self)
      const allPts = await api.pt.list();
      setOtherTherapists((allPts.therapists || []).filter((t) => t.id !== currentPt.id));
    } catch (err: any) {
      console.error('Failed to load PT workspace:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await api.pt.updateProfile(profile.id, profileForm);
      setProfile(res.therapist);
      alert('บันทึกข้อมูลส่วนตัวสำเร็จ');
      setIsEditProfileOpen(false);
    } catch (err: any) {
      alert('เกิดข้อผิดพลาด: ' + err?.message);
    }
  };

  const handleCreateCoverage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!coverageForm.patient_id || !coverageForm.cover_pt_id) {
      alert('กรุณาเลือกผู้ป่วยและนักกายภาพบำบัดผู้รับฝาก');
      return;
    }
    setIsSubmittingCoverage(true);
    try {
      await api.pt.createCoverage(coverageForm);
      alert('ฝากเคสชั่วคราวสำเร็จเรียบร้อยแล้ว');
      setIsCoverageModalOpen(false);
      setCoverageForm({
        patient_id: '',
        cover_pt_id: '',
        start_date: new Date().toISOString().split('T')[0],
        end_date: new Date(Date.now() + 3 * 86400000).toISOString().split('T')[0],
        reason: '',
      });
      loadData();
    } catch (err: any) {
      alert('เกิดข้อผิดพลาด: ' + err?.message);
    } finally {
      setIsSubmittingCoverage(false);
    }
  };

  const handleRevokeCoverage = async (coverageId: number) => {
    if (!confirm('ต้องการยกเลิกการฝากเคสนี้ก่อนกำหนดหรือไม่?')) return;
    try {
      await api.pt.revokeCoverage(coverageId);
      alert('ยกเลิกการฝากเคสเรียบร้อยแล้ว');
      loadData();
    } catch (err: any) {
      alert('เกิดข้อผิดพลาด: ' + err?.message);
    }
  };

  const patientColumns: Column<User>[] = [
    {
      key: 'id',
      header: 'รหัส HN',
      render: (p) => <span className="font-mono text-xs font-bold text-emerald-400">{p.id}</span>,
    },
    {
      key: 'full_name',
      header: 'ชื่อ-นามสกุล ผู้ป่วย',
      render: (p) => (
        <div>
          <div className="font-semibold text-white">{p.full_name}</div>
          <div className="text-xs text-slate-400">
            อายุ {p.age || '-'} ปี • {p.gender === 'male' ? 'ชาย' : 'หญิง'}
          </div>
        </div>
      ),
    },
    {
      key: 'admission_date',
      header: 'วันที่รับเข้าฟื้นฟู',
      render: (p) => <span>{formatDate(p.admission_date)}</span>,
    },
    {
      key: 'treatment_status',
      header: 'สถานะ',
      render: (p) => (
        <Badge variant={p.treatment_status === 'active' ? 'active' : 'disabled'}>
          {p.treatment_status || 'active'}
        </Badge>
      ),
    },
    {
      key: 'actions',
      header: 'ทางลัด (Shortcuts)',
      align: 'right',
      render: (p) => (
        <div className="flex items-center justify-end gap-2" onClick={(e) => e.stopPropagation()}>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => onNavigateToSchedule && onNavigateToSchedule(p.id)}
            leftIcon={<Calendar className="w-3.5 h-3.5" />}
          >
            ตารางฝึก (M3)
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={() => onNavigateToRecords && onNavigateToRecords(p.id)}
            leftIcon={<FileText className="w-3.5 h-3.5" />}
          >
            เวชระเบียน (M2)
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      {/* SECTION 1: MY PROFILE */}
      <Card
        title={
          <div className="flex items-center gap-2.5">
            <UserCheck className="w-5 h-5 text-teal-400" />
            <span>ส่วนที่ 1: ข้อมูลส่วนตัวและวิชาชีพ (My PT Profile)</span>
          </div>
        }
        action={
          <Button variant="outline" size="sm" onClick={() => setIsEditProfileOpen(true)}>
            แก้ไขข้อมูลส่วนตัว
          </Button>
        }
      >
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6 p-4 rounded-2xl bg-slate-950/80 border border-slate-800">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-full bg-slate-800 border-2 border-teal-500/60 flex items-center justify-center text-teal-300 font-bold text-xl shrink-0">
              {profile.full_name ? profile.full_name.charAt(0) : 'P'}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-bold text-white">{profile.full_name}</h3>
                <Badge variant="pt">นักกายภาพบำบัด</Badge>
              </div>
              <div className="text-xs text-slate-400 mt-0.5">
                รหัสประจำตัว: <span className="font-mono text-emerald-400 font-semibold">{profile.id}</span> • เลขที่ใบอนุญาต:{' '}
                <span className="font-mono text-teal-400 font-semibold">{profile.license_number || '-'}</span> (อ่านอย่างเดียว)
              </div>
              <div className="text-xs text-slate-400 mt-1">
                แผนกเฉพาะทาง:{' '}
                <span className="text-white font-medium">{formatEmpty(profile.department)}</span> (อ่านอย่างเดียว)
              </div>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 text-xs text-slate-300">
            <div className="flex items-center gap-2">
              <Phone className="w-4 h-4 text-slate-400" />
              <span>{formatEmpty(profile.phone)}</span>
            </div>
            <div className="flex items-center gap-2">
              <Mail className="w-4 h-4 text-slate-400" />
              <span>{formatEmpty(profile.email)}</span>
            </div>
          </div>
        </div>

        {profile.bio && (
          <div className="mt-3 p-3 rounded-xl bg-slate-950/40 border border-slate-800/80 text-xs text-slate-300">
            <span className="text-slate-400 font-semibold">ประวัติ / ประสบการณ์: </span>
            {profile.bio}
          </div>
        )}
      </Card>

      {/* SECTION 2: ASSIGNED CASES & TEMPORARY CASE DELEGATION */}
      <Card
        title={
          <div className="flex items-center gap-2.5">
            <Award className="w-5 h-5 text-emerald-400" />
            <span>ส่วนที่ 2: เคสผู้ป่วยในความดูแล (Assigned Cases)</span>
          </div>
        }
        subtitle={`จำนวนเคสที่กำลังดูแล: ${assignedPatients.length} ราย`}
        action={
          <Button
            variant="success"
            onClick={() => setIsCoverageModalOpen(true)}
            leftIcon={<Share2 className="w-4 h-4" />}
          >
            + ฝากเคสชั่วคราว (Assign Temporary Coverage)
          </Button>
        }
      >
        {/* Active delegations banner */}
        {coverages.length > 0 && (
          <div className="mb-6 p-4 rounded-2xl bg-amber-950/40 border border-amber-800/60 space-y-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-amber-300 flex items-center gap-2">
              <Share2 className="w-4 h-4" />
              <span>รายการฝากเคสชั่วคราวที่กำลังมีผล (Active Delegations)</span>
            </h4>
            <div className="space-y-2">
              {coverages.map((cov) => (
                <div
                  key={cov.id}
                  className="p-3 rounded-xl bg-slate-950/80 border border-slate-800 flex items-center justify-between text-xs"
                >
                  <div>
                    <span className="font-bold text-white">{cov.patient_name || cov.patient_id}</span>
                    <span className="text-slate-400 mx-2">ฝากให้</span>
                    <span className="text-emerald-400 font-semibold">{cov.cover_pt_name || cov.cover_pt_id}</span>
                    <div className="text-[11px] text-slate-500 mt-0.5">
                      ระยะเวลา: {formatDate(cov.start_date)} ถึง {formatDate(cov.end_date)} • หมายเหตุ: {cov.reason || '-'}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={cov.status === 'active' ? 'covering' : 'disabled'}>
                      {cov.status}
                    </Badge>
                    {cov.status === 'active' && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleRevokeCoverage(cov.id)}
                        className="text-rose-400 hover:text-rose-300"
                        title="ยกเลิกการฝากเคสก่อนกำหนด"
                      >
                        <XCircle className="w-4 h-4" />
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <Table<User>
          columns={patientColumns}
          data={assignedPatients}
          keyExtractor={(p) => p.id}
          isLoading={isLoading}
          emptyMessage="ยังไม่มีผู้ป่วยที่ได้รับมอบหมายในความดูแลของคุณ"
        />
      </Card>

      {/* Edit My Profile Modal */}
      <Modal
        isOpen={isEditProfileOpen}
        onClose={() => setIsEditProfileOpen(false)}
        size="md"
        title="แก้ไขข้อมูลส่วนตัว (Edit My Profile)"
        subtitle="เลขที่ใบอนุญาตและแผนกเฉพาะทางเป็นค่าอ่านอย่างเดียวตามข้อกำหนดวิชาชีพ"
      >
        <form onSubmit={handleSaveProfile} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-slate-300 font-medium">เบอร์โทรศัพท์</label>
              <input
                type="text"
                value={profileForm.phone}
                onChange={(e) => setProfileForm({ ...profileForm, phone: e.target.value })}
                className="mt-1 w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white"
              />
            </div>
            <div>
              <label className="text-xs text-slate-300 font-medium">อีเมล</label>
              <input
                type="text"
                value={profileForm.email}
                onChange={(e) => setProfileForm({ ...profileForm, email: e.target.value })}
                className="mt-1 w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white"
              />
            </div>
          </div>

          <div>
            <label className="text-xs text-slate-300 font-medium">ประวัติ / ประสบการณ์ (Bio)</label>
            <textarea
              rows={3}
              value={profileForm.bio}
              onChange={(e) => setProfileForm({ ...profileForm, bio: e.target.value })}
              className="mt-1 w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white"
            />
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-slate-800">
            <Button variant="ghost" type="button" onClick={() => setIsEditProfileOpen(false)}>
              ยกเลิก
            </Button>
            <Button variant="primary" type="submit">
              บันทึกการแก้ไข
            </Button>
          </div>
        </form>
      </Modal>

      {/* Assign Temporary Coverage Modal */}
      <Modal
        isOpen={isCoverageModalOpen}
        onClose={() => setIsCoverageModalOpen(false)}
        size="md"
        title="ฝากเคสชั่วคราว (Assign Temporary Coverage)"
        subtitle="ผู้รับฝากจะมีสิทธิ์แก้ไขตารางฝึก (M3) ของผู้ป่วยรายนี้ตามช่วงเวลาที่กำหนดเท่านั้น"
      >
        <form onSubmit={handleCreateCoverage} className="space-y-4">
          <div>
            <label className="text-xs text-slate-300 font-medium">เลือกผู้ป่วยในความดูแลของคุณ *</label>
            <select
              value={coverageForm.patient_id}
              onChange={(e) => setCoverageForm({ ...coverageForm, patient_id: e.target.value })}
              required
              className="mt-1 w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white"
            >
              <option value="">- เลือกผู้ป่วย -</option>
              {assignedPatients.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.full_name} ({p.id})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-xs text-slate-300 font-medium">เลือกนักกายภาพบำบัดผู้รับฝากเคส *</label>
            <select
              value={coverageForm.cover_pt_id}
              onChange={(e) => setCoverageForm({ ...coverageForm, cover_pt_id: e.target.value })}
              required
              className="mt-1 w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white"
            >
              <option value="">- เลือก PT ผู้รับฝาก -</option>
              {otherTherapists.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.full_name} ({t.id}) • แผนก {t.department}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-slate-300 font-medium">วันที่เริ่มต้น *</label>
              <input
                type="date"
                value={coverageForm.start_date}
                onChange={(e) => setCoverageForm({ ...coverageForm, start_date: e.target.value })}
                required
                className="mt-1 w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white"
              />
            </div>
            <div>
              <label className="text-xs text-slate-300 font-medium">วันที่สิ้นสุด *</label>
              <input
                type="date"
                value={coverageForm.end_date}
                onChange={(e) => setCoverageForm({ ...coverageForm, end_date: e.target.value })}
                required
                className="mt-1 w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white"
              />
            </div>
          </div>

          <div>
            <label className="text-xs text-slate-300 font-medium">เหตุผล / ข้อสังเกตเพิ่มเติม (Reason)</label>
            <textarea
              rows={2}
              value={coverageForm.reason}
              onChange={(e) => setCoverageForm({ ...coverageForm, reason: e.target.value })}
              placeholder="เช่น ลาประชุมวิชาการ หรือดูแลแทนระหว่างอบรม"
              className="mt-1 w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white"
            />
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-slate-800">
            <Button variant="ghost" type="button" onClick={() => setIsCoverageModalOpen(false)}>
              ยกเลิก
            </Button>
            <Button variant="success" type="submit" isLoading={isSubmittingCoverage}>
              บันทึกการฝากเคส
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
