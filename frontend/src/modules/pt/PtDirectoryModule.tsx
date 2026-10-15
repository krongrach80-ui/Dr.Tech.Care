import React, { useState, useEffect } from 'react';
import { UserCog, Edit, Users, ArrowRightLeft, ShieldCheck, Phone, Mail, Award } from 'lucide-react';
import { Table, Column } from '../../components/common/Table';
import { Badge } from '../../components/common/Badge';
import { Button } from '../../components/common/Button';
import { Card } from '../../components/common/Card';
import { Modal } from '../../components/common/Modal';
import { User } from '../../types/schema';
import { api } from '../../lib/api';
import { formatEmpty } from '../../i18n';

export const PtDirectoryModule: React.FC = () => {
  const [therapists, setTherapists] = useState<User[]>([]);
  const [patients, setPatients] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Modal A: Edit PT Details
  const [editingPt, setEditingPt] = useState<User | null>(null);
  const [editForm, setEditForm] = useState<any>({});
  const [isSavingEdit, setIsSavingEdit] = useState(false);

  // Modal B: Assigned Patients & Case Transfer
  const [selectedPtForCases, setSelectedPtForCases] = useState<User | null>(null);
  const [caseToTransfer, setCaseToTransfer] = useState<string>('');
  const [targetPtId, setTargetPtId] = useState<string>('');

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [ptRes, pRes] = await Promise.all([api.pt.list(), api.patients.list()]);
      setTherapists(ptRes.therapists || []);
      setPatients(pRes.patients || []);
    } catch (err: any) {
      console.error('Failed to load PT directory:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleOpenEdit = (pt: User) => {
    setEditingPt(pt);
    setEditForm({
      phone: pt.phone || '-',
      email: pt.email || '-',
      license_number: pt.license_number || '',
      department: pt.department || 'Musculoskeletal',
      bio: pt.bio || '',
    });
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingPt) return;
    setIsSavingEdit(true);
    try {
      await api.pt.updateProfile(editingPt.id, editForm);
      alert('บันทึกข้อมูลนักกายภาพบำบัดเรียบร้อยแล้ว');
      setEditingPt(null);
      loadData();
    } catch (err: any) {
      alert('เกิดข้อผิดพลาด: ' + err?.message);
    } finally {
      setIsSavingEdit(false);
    }
  };

  const handleTransferCase = async () => {
    if (!caseToTransfer || !targetPtId) return;
    try {
      await api.pt.transferCase(caseToTransfer, targetPtId);
      alert('โอนย้ายเคสผู้ป่วยสำเร็จ');
      setCaseToTransfer('');
      setTargetPtId('');
      loadData();
    } catch (err: any) {
      alert('เกิดข้อผิดพลาด: ' + err?.message);
    }
  };

  const columns: Column<User>[] = [
    {
      key: 'id',
      header: 'รหัส PT',
      render: (t) => <span className="font-mono text-xs font-bold text-teal-400">{t.id}</span>,
    },
    {
      key: 'full_name',
      header: 'ชื่อ-นามสกุล นักกายภาพ',
      render: (t) => (
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-full bg-slate-800 border border-teal-700/60 flex items-center justify-center font-bold text-xs text-teal-300 shrink-0">
            {t.full_name.charAt(0)}
          </div>
          <div>
            <div className="font-semibold text-white flex items-center gap-2">
              <span>{t.full_name}</span>
              {t.is_covering && <Badge variant="covering">Covering</Badge>}
            </div>
            <div className="text-xs text-slate-400 font-mono">ใบอนุญาต: {t.license_number || '-'}</div>
          </div>
        </div>
      ),
    },
    {
      key: 'department',
      header: 'แผนก / สาขาเฉพาะทาง',
      render: (t) => <span className="text-xs text-slate-300 font-medium">{formatEmpty(t.department)}</span>,
    },
    {
      key: 'active_case_count',
      header: 'เคสที่ดูแล (Active)',
      align: 'center',
      render: (t) => (
        <span className="font-mono text-xs font-bold text-emerald-400 bg-emerald-950/80 border border-emerald-700/60 px-2.5 py-1 rounded-full">
          {t.active_case_count || 0} ราย
        </span>
      ),
    },
    {
      key: 'phone',
      header: 'เบอร์โทรศัพท์',
      render: (t) => <span className="text-xs">{formatEmpty(t.phone)}</span>,
    },
    {
      key: 'actions',
      header: 'การจัดการ',
      align: 'right',
      render: (t) => (
        <div className="flex items-center justify-end gap-1.5" onClick={(e) => e.stopPropagation()}>
          <Button variant="ghost" size="sm" onClick={() => handleOpenEdit(t)} title="แก้ไขข้อมูล PT">
            <Edit className="w-3.5 h-3.5 text-slate-300" />
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setSelectedPtForCases(t)}
            leftIcon={<Users className="w-3.5 h-3.5" />}
          >
            เคสคนไข้ ({t.active_case_count || 0})
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <Card
        title={
          <div className="flex items-center gap-2.5">
            <UserCog className="w-5 h-5 text-teal-400" />
            <span>โมดูลที่ 4: ทำเนียบนักกายภาพบำบัด (PT Directory)</span>
          </div>
        }
        subtitle="ตรวจสอบรายชื่อนักกายภาพบำบัด ภาระงานเคสที่ดูแล (Workload) และการโอนย้ายเคส (Case Transfer)"
      >
        <Table<User>
          columns={columns}
          data={therapists}
          keyExtractor={(t) => t.id}
          isLoading={isLoading}
          emptyMessage="ไม่พบข้อมูลนักกายภาพบำบัดในระบบ"
        />
      </Card>

      {/* Modal A: Edit PT Details */}
      {editingPt && (
        <Modal
          isOpen={!!editingPt}
          onClose={() => setEditingPt(null)}
          size="md"
          title={`แก้ไขข้อมูลนักกายภาพบำบัด (${editingPt.id})`}
          subtitle={editingPt.full_name}
        >
          <form onSubmit={handleSaveEdit} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-slate-300 font-medium">เบอร์โทรศัพท์</label>
                <input
                  type="text"
                  value={editForm.phone}
                  onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
                  className="mt-1 w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white"
                />
              </div>
              <div>
                <label className="text-xs text-slate-300 font-medium">อีเมล</label>
                <input
                  type="text"
                  value={editForm.email}
                  onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                  className="mt-1 w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-slate-300 font-medium">เลขที่ใบอนุญาตประกอบวิชาชีพ</label>
                <input
                  type="text"
                  value={editForm.license_number}
                  onChange={(e) => setEditForm({ ...editForm, license_number: e.target.value })}
                  className="mt-1 w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white font-mono"
                />
              </div>
              <div>
                <label className="text-xs text-slate-300 font-medium">แผนกเฉพาะทาง (Department)</label>
                <select
                  value={editForm.department}
                  onChange={(e) => setEditForm({ ...editForm, department: e.target.value })}
                  className="mt-1 w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white"
                >
                  <option value="Musculoskeletal">Musculoskeletal</option>
                  <option value="Neurological">Neurological</option>
                  <option value="Geriatric">Geriatric</option>
                  <option value="Sports PT">Sports PT</option>
                </select>
              </div>
            </div>

            <div>
              <label className="text-xs text-slate-300 font-medium">ประวัติ / ประสบการณ์ (Bio)</label>
              <textarea
                rows={3}
                value={editForm.bio}
                onChange={(e) => setEditForm({ ...editForm, bio: e.target.value })}
                className="mt-1 w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white"
              />
            </div>

            <div className="flex justify-end gap-3 pt-4 border-t border-slate-800">
              <Button variant="ghost" type="button" onClick={() => setEditingPt(null)}>
                ยกเลิก
              </Button>
              <Button variant="primary" type="submit" isLoading={isSavingEdit}>
                บันทึกการแก้ไข
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {/* Modal B: Assigned Patients & Case Transfer */}
      {selectedPtForCases && (
        <Modal
          isOpen={!!selectedPtForCases}
          onClose={() => setSelectedPtForCases(null)}
          size="lg"
          title={`เคสคนไข้ในความดูแลของ ${selectedPtForCases.full_name}`}
          subtitle={`รหัส: ${selectedPtForCases.id} • แผนก: ${selectedPtForCases.department}`}
        >
          <div className="space-y-5">
            {/* Case Transfer Box */}
            <div className="p-4 rounded-xl bg-slate-950/80 border border-slate-800 space-y-3">
              <h5 className="text-xs font-semibold uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
                <ArrowRightLeft className="w-4 h-4" />
                <span>โอนย้ายเคสผู้ป่วย (Transfer Case)</span>
              </h5>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-slate-400">เลือกผู้ป่วยที่ต้องการโอน:</label>
                  <select
                    value={caseToTransfer}
                    onChange={(e) => setCaseToTransfer(e.target.value)}
                    className="mt-1 w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
                  >
                    <option value="">- เลือกผู้ป่วย -</option>
                    {patients
                      .filter((p) => p.assigned_pt_id === selectedPtForCases.id)
                      .map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.full_name} ({p.id})
                        </option>
                      ))}
                  </select>
                </div>

                <div>
                  <label className="text-xs text-slate-400">โอนไปยังนักกายภาพบำบัด:</label>
                  <select
                    value={targetPtId}
                    onChange={(e) => setTargetPtId(e.target.value)}
                    className="mt-1 w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
                  >
                    <option value="">- เลือก PT ผู้รับโอน -</option>
                    {therapists
                      .filter((t) => t.id !== selectedPtForCases.id)
                      .map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.full_name} ({t.id})
                        </option>
                      ))}
                  </select>
                </div>
              </div>

              <div className="flex justify-end pt-1">
                <Button
                  variant="primary"
                  size="sm"
                  onClick={handleTransferCase}
                  disabled={!caseToTransfer || !targetPtId}
                >
                  ยืนยันการโอนย้ายเคส
                </Button>
              </div>
            </div>

            {/* List of currently assigned patients */}
            <div className="space-y-2">
              <h5 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                รายชื่อคนไข้ปัจจุบัน ({patients.filter((p) => p.assigned_pt_id === selectedPtForCases.id).length} ราย)
              </h5>

              {patients.filter((p) => p.assigned_pt_id === selectedPtForCases.id).length === 0 ? (
                <p className="text-xs text-slate-500 text-center py-4">ไม่มีผู้ป่วยในความดูแลในขณะนี้</p>
              ) : (
                <div className="divide-y divide-slate-800 border border-slate-800 rounded-xl overflow-hidden bg-slate-950/60">
                  {patients
                    .filter((p) => p.assigned_pt_id === selectedPtForCases.id)
                    .map((p) => (
                      <div key={p.id} className="p-3 flex items-center justify-between text-xs">
                        <div>
                          <div className="font-semibold text-white">{p.full_name}</div>
                          <div className="text-[11px] text-slate-400">
                            รหัส: <span className="font-mono text-emerald-400">{p.id}</span> • อายุ {p.age || '-'} ปี
                          </div>
                        </div>
                        <Badge variant={p.treatment_status === 'active' ? 'active' : 'disabled'}>
                          {p.treatment_status || 'active'}
                        </Badge>
                      </div>
                    ))}
                </div>
              )}
            </div>

            <div className="flex justify-end pt-2 border-t border-slate-800">
              <Button variant="ghost" onClick={() => setSelectedPtForCases(null)}>
                ปิดหน้าต่าง
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};
