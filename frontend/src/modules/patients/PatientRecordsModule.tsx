import React, { useState, useEffect } from 'react';
import { Users, FileText, Activity, Search, PlusCircle, CheckCircle2, AlertCircle } from 'lucide-react';
import { Table, Column } from '../../components/common/Table';
import { Badge } from '../../components/common/Badge';
import { Button } from '../../components/common/Button';
import { Card } from '../../components/common/Card';
import { Modal } from '../../components/common/Modal';
import { Calendar } from '../../components/common/Calendar';
import { User, MedicalNote, SessionLog } from '../../types/schema';
import { api } from '../../lib/api';
import { formatDate, formatDateTime, formatEmpty } from '../../i18n';

export interface PatientRecordsModuleProps {
  actorRole: 'admin' | 'pt';
  currentPtId?: string;
  defaultPatientId?: string;
}

export const PatientRecordsModule: React.FC<PatientRecordsModuleProps> = ({
  actorRole,
  currentPtId,
  defaultPatientId,
}) => {
  const [patients, setPatients] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [search, setSearch] = useState<string>('');
  const [therapists, setTherapists] = useState<User[]>([]);

  // Selected patient for 3-Tab Modal
  const [selectedPatient, setSelectedPatient] = useState<User | null>(null);
  const [activeTab, setActiveTab] = useState<'info' | 'notes' | 'performance'>('info');

  // Tab 1 state
  const [tab1Form, setTab1Form] = useState<any>({});
  const [isSavingTab1, setIsSavingTab1] = useState<boolean>(false);

  // Tab 2 state
  const [notes, setNotes] = useState<MedicalNote[]>([]);
  const [newNoteContent, setNewNoteContent] = useState<string>('');
  const [referencedNoteId, setReferencedNoteId] = useState<number | undefined>(undefined);
  const [isAppendingNote, setIsAppendingNote] = useState<boolean>(false);

  // Tab 3 state
  const [perfRange, setPerfRange] = useState<'1week' | '1month' | 'all'>('1month');
  const [sessionLogs, setSessionLogs] = useState<SessionLog[]>([]);
  const [accuracyPercent, setAccuracyPercent] = useState<number>(0);
  const [totalCorrect, setTotalCorrect] = useState<number>(0);
  const [totalIncorrect, setTotalIncorrect] = useState<number>(0);
  const [frequencyCalendar, setFrequencyCalendar] = useState<Record<string, any>>({});

  const loadPatients = async () => {
    setIsLoading(true);
    try {
      const res = await api.patients.list(search);
      setPatients(res.patients || []);

      // If defaultPatientId is provided, open it directly
      if (defaultPatientId) {
        const found = (res.patients || []).find((p) => p.id === defaultPatientId);
        if (found) handleOpenPatientModal(found);
      }
    } catch (err: any) {
      console.error('Failed to load patients:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    api.pt.list().then((res) => setTherapists(res.therapists || [])).catch(console.error);
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      loadPatients();
    }, 250);
    return () => clearTimeout(timer);
  }, [search]);

  const handleOpenPatientModal = async (patient: User) => {
    setSelectedPatient(patient);
    setActiveTab('info');
    setTab1Form({
      full_name: patient.full_name,
      age: patient.age || 60,
      gender: patient.gender || 'male',
      phone: patient.phone || '-',
      assigned_pt_id: patient.assigned_pt_id || '',
      initial_symptoms: patient.initial_symptoms || '',
      underlying_diseases: patient.underlying_diseases || '-',
      drug_allergies: patient.drug_allergies || '-',
      treatment_status: patient.treatment_status || 'active',
    });

    // Load Notes
    api.patients.getNotes(patient.id).then((res) => setNotes(res.notes || [])).catch(console.error);

    // Load Analytics
    loadAnalytics(patient.id, perfRange);
  };

  const loadAnalytics = async (patientId: string, range: '1week' | '1month' | 'all') => {
    try {
      const res = await api.patients.getAnalytics(patientId, range);
      setSessionLogs(res.logs || []);
      setAccuracyPercent(res.accuracy_percent || 0);
      setTotalCorrect(res.total_correct || 0);
      setTotalIncorrect(res.total_incorrect || 0);
      setFrequencyCalendar(res.frequency_calendar || {});
    } catch (err: any) {
      console.error('Failed to load analytics:', err);
    }
  };

  const handleSaveTab1 = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPatient) return;
    setIsSavingTab1(true);
    try {
      const res = await api.patients.updatePersonal(selectedPatient.id, tab1Form);
      setSelectedPatient(res.patient);
      alert('บันทึกข้อมูลทั่วไปเรียบร้อยแล้ว');
      loadPatients();
    } catch (err: any) {
      alert('เกิดข้อผิดพลาด: ' + err?.message);
    } finally {
      setIsSavingTab1(false);
    }
  };

  const handleAppendNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPatient || !newNoteContent.trim()) return;
    setIsAppendingNote(true);
    try {
      const res = await api.patients.appendNote(selectedPatient.id, newNoteContent.trim(), referencedNoteId);
      setNotes([res.note, ...notes]);
      setNewNoteContent('');
      setReferencedNoteId(undefined);
    } catch (err: any) {
      alert('เกิดข้อผิดพลาด: ' + err?.message);
    } finally {
      setIsAppendingNote(false);
    }
  };

  const columns: Column<User>[] = [
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
            อายุ {formatEmpty(p.age)} ปี • {p.gender === 'male' ? 'ชาย' : p.gender === 'female' ? 'หญิง' : 'อื่นๆ'}
          </div>
        </div>
      ),
    },
    {
      key: 'assigned_pt_name',
      header: 'นักกายภาพบำบัดประจำตัว',
      render: (p) => (
        <span className="text-xs text-slate-300 font-medium">
          {formatEmpty(p.assigned_pt_name || p.assigned_pt_id)}
        </span>
      ),
    },
    {
      key: 'treatment_status',
      header: 'สถานะการรักษา',
      render: (p) => (
        <Badge variant={p.treatment_status === 'active' ? 'active' : 'disabled'}>
          {p.treatment_status === 'active' ? 'กำลังรักษา (Active)' : 'จำหน่าย (Discharged)'}
        </Badge>
      ),
    },
    {
      key: 'phone',
      header: 'เบอร์ติดต่อ',
      render: (p) => <span className="text-xs">{formatEmpty(p.phone)}</span>,
    },
    {
      key: 'actions',
      header: 'จัดการ',
      align: 'right',
      render: (p) => (
        <Button variant="primary" size="sm" onClick={() => handleOpenPatientModal(p)}>
          ดูเวชระเบียน & แดชบอร์ด ➔
        </Button>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <Card
        title={
          <div className="flex items-center gap-2.5">
            <Users className="w-5 h-5 text-emerald-400" />
            <span>โมดูลที่ 2: ข้อมูลและเวชระเบียนผู้ป่วยทั้งหมด (All Patient Records)</span>
          </div>
        }
        subtitle="เข้าถึงข้อมูลสุขภาพผู้ป่วย บันทึกความก้าวหน้าทางการแพทย์แบบ Append-Only และวิเคราะห์ประสิทธิภาพ"
      >
        <div className="flex items-center justify-between gap-3 mb-4">
          <div className="relative w-full sm:w-80">
            <Search className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="ค้นหาชื่อผู้ป่วย, รหัส HN หรืออาการ..."
              className="w-full bg-slate-950 border border-slate-700 rounded-xl pl-9 pr-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
            />
          </div>
          <span className="text-xs text-slate-400">ผู้ป่วยทั้งหมด: {patients.length} ราย</span>
        </div>

        <Table<User>
          columns={columns}
          data={patients}
          keyExtractor={(p) => p.id}
          isLoading={isLoading}
          onRowClick={handleOpenPatientModal}
          emptyMessage="ไม่พบข้อมูลผู้ป่วยในระบบ"
        />
      </Card>

      {/* 3-Tab Patient Profile Modal */}
      {selectedPatient && (
        <Modal
          isOpen={!!selectedPatient}
          onClose={() => setSelectedPatient(null)}
          size="2xl"
          title={
            <div className="flex items-center gap-2">
              <span className="font-mono text-emerald-400 font-bold bg-emerald-950/60 border border-emerald-700/50 px-2 py-0.5 rounded-lg text-sm">
                {selectedPatient.id}
              </span>
              <span>{selectedPatient.full_name}</span>
            </div>
          }
          subtitle={`อายุ ${selectedPatient.age || '-'} ปี • วันที่รับเข้าฟื้นฟู: ${formatDate(selectedPatient.admission_date)}`}
        >
          {/* Tabs Navigation */}
          <div className="flex items-center gap-2 border-b border-slate-800 pb-3 mb-5">
            <button
              onClick={() => setActiveTab('info')}
              className={`px-4 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all ${
                activeTab === 'info'
                  ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/30'
                  : 'bg-slate-950 text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              <Users className="w-3.5 h-3.5" />
              <span>แท็บ 1: ข้อมูลทั่วไป (Personal Info)</span>
            </button>

            <button
              onClick={() => setActiveTab('notes')}
              className={`px-4 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all ${
                activeTab === 'notes'
                  ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/30'
                  : 'bg-slate-950 text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              <FileText className="w-3.5 h-3.5" />
              <span>แท็บ 2: ประวัติ & บันทึกแพทย์ (History & Notes)</span>
            </button>

            <button
              onClick={() => {
                setActiveTab('performance');
                loadAnalytics(selectedPatient.id, perfRange);
              }}
              className={`px-4 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all ${
                activeTab === 'performance'
                  ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/30'
                  : 'bg-slate-950 text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              <Activity className="w-3.5 h-3.5" />
              <span>แท็บ 3: ประสิทธิภาพ & การฝึก (Performance)</span>
            </button>
          </div>

          {/* TAB 1: PERSONAL INFO */}
          {activeTab === 'info' && (
            <form onSubmit={handleSaveTab1} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="text-xs text-slate-300 font-medium">ชื่อ-นามสกุล *</label>
                  <input
                    type="text"
                    value={tab1Form.full_name || ''}
                    onChange={(e) => setTab1Form({ ...tab1Form, full_name: e.target.value })}
                    required
                    className="mt-1 w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white"
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-300 font-medium">อายุ (ปี)</label>
                  <input
                    type="number"
                    value={tab1Form.age || ''}
                    onChange={(e) => setTab1Form({ ...tab1Form, age: parseInt(e.target.value, 10) })}
                    className="mt-1 w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white"
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-300 font-medium">เพศ</label>
                  <select
                    value={tab1Form.gender || 'male'}
                    onChange={(e) => setTab1Form({ ...tab1Form, gender: e.target.value })}
                    className="mt-1 w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white"
                  >
                    <option value="male">ชาย</option>
                    <option value="female">หญิง</option>
                    <option value="other">อื่นๆ</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-slate-300 font-medium">เบอร์โทรศัพท์</label>
                  <input
                    type="text"
                    value={tab1Form.phone || ''}
                    onChange={(e) => setTab1Form({ ...tab1Form, phone: e.target.value })}
                    className="mt-1 w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white"
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-300 font-medium">
                    นักกายภาพบำบัดเจ้าของไข้
                    {actorRole === 'pt' && selectedPatient.assigned_pt_id !== currentPtId && (
                      <span className="text-[10px] text-amber-400 ml-1.5">(อ่านอย่างเดียว: ไม่ใช่เคสของคุณ)</span>
                    )}
                  </label>
                  <select
                    value={tab1Form.assigned_pt_id || ''}
                    disabled={actorRole === 'pt' && selectedPatient.assigned_pt_id !== currentPtId}
                    onChange={(e) => setTab1Form({ ...tab1Form, assigned_pt_id: e.target.value })}
                    className="mt-1 w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white disabled:opacity-50"
                  >
                    <option value="">- เลือกนักกายภาพบำบัด -</option>
                    {therapists.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.full_name} ({t.id})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="text-xs text-slate-300 font-medium">อาการเริ่มต้น / การวินิจฉัย</label>
                <textarea
                  rows={2}
                  value={tab1Form.initial_symptoms || ''}
                  onChange={(e) => setTab1Form({ ...tab1Form, initial_symptoms: e.target.value })}
                  className="mt-1 w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-slate-300 font-medium">โรคประจำตัว (Underlying Diseases)</label>
                  <input
                    type="text"
                    value={tab1Form.underlying_diseases || ''}
                    onChange={(e) => setTab1Form({ ...tab1Form, underlying_diseases: e.target.value })}
                    className="mt-1 w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white"
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-300 font-medium">ประวัติการแพ้ยา (Drug Allergies)</label>
                  <input
                    type="text"
                    value={tab1Form.drug_allergies || ''}
                    onChange={(e) => setTab1Form({ ...tab1Form, drug_allergies: e.target.value })}
                    className="mt-1 w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white"
                  />
                </div>
              </div>

              <div className="flex items-center justify-between pt-4 border-t border-slate-800">
                <span className="text-xs text-slate-500">
                  * หมายเหตุ: การจัดตารางฝึกและแบบฝึกหัดประจำวัน ดำเนินการผ่านโมดูลที่ 3 (Schedule Planner) เท่านั้น
                </span>
                <Button variant="primary" type="submit" isLoading={isSavingTab1}>
                  บันทึกการแก้ไขข้อมูลทั่วไป
                </Button>
              </div>
            </form>
          )}

          {/* TAB 2: HISTORY & APPEND-ONLY NOTES */}
          {activeTab === 'notes' && (
            <div className="space-y-6">
              <div className="p-3 rounded-xl bg-slate-950/80 border border-slate-800 flex items-center justify-between">
                <div>
                  <span className="text-xs text-slate-400">วันที่รับเข้าการรักษา (Admission Date):</span>
                  <span className="text-xs font-bold text-white ml-2">{formatDate(selectedPatient.admission_date)}</span>
                </div>
                <div className="text-xs text-slate-400">
                  จำนวนบันทึกทั้งหมด: <span className="text-emerald-400 font-bold">{notes.length} รายการ</span>
                </div>
              </div>

              {/* Append New Note Form */}
              <form onSubmit={handleAppendNote} className="p-4 rounded-2xl bg-slate-950/80 border border-slate-800 space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
                    <PlusCircle className="w-4 h-4" />
                    <span>เขียนบันทึกความก้าวหน้าทางการแพทย์ใหม่ (Append Medical Note)</span>
                  </h4>
                  <span className="text-[10px] text-slate-500">Append-Only • ป้องกันการแก้ไข/ลบโดย Trigger</span>
                </div>

                <textarea
                  rows={3}
                  value={newNoteContent}
                  onChange={(e) => setNewNoteContent(e.target.value)}
                  placeholder="ระบุความก้าวหน้าในการฟื้นฟู อาการปวด หรือข้อสังเกตเพิ่มเติม (ระบบจะประทับเวลาและชื่อผู้บันทึกอัตโนมัติ)..."
                  required
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                />

                <div className="flex items-center justify-between pt-1">
                  <div className="flex items-center gap-2 text-xs text-slate-400">
                    <span>อ้างอิงบันทึกก่อนหน้า (ถ้ามี):</span>
                    <select
                      value={referencedNoteId || ''}
                      onChange={(e) => setReferencedNoteId(e.target.value ? parseInt(e.target.value, 10) : undefined)}
                      className="bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-xs text-white"
                    >
                      <option value="">- ไม่อ้างอิง -</option>
                      {notes.map((n) => (
                        <option key={n.id} value={n.id}>
                          บันทึก #{n.id} ({n.header_stamp})
                        </option>
                      ))}
                    </select>
                  </div>

                  <Button variant="success" size="sm" type="submit" isLoading={isAppendingNote}>
                    + บันทึกลงเวชระเบียน
                  </Button>
                </div>
              </form>

              {/* Medical Notes List */}
              <div className="space-y-3">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                  ประวัติบันทึกทางการแพทย์ (Medical Notes Timeline)
                </h4>

                {notes.length === 0 ? (
                  <p className="text-xs text-slate-500 text-center py-6">ยังไม่มีบันทึกทางการแพทย์สำหรับผู้ป่วยรายนี้</p>
                ) : (
                  notes.map((note) => (
                    <div
                      key={note.id}
                      className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 space-y-2 hover:border-slate-700 transition-colors"
                    >
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-mono text-emerald-400 font-semibold">{note.header_stamp}</span>
                        {note.referenced_note_id && (
                          <span className="text-[10px] text-cyan-400 bg-cyan-950/80 border border-cyan-800 px-2 py-0.5 rounded-full">
                            อ้างอิงบันทึก #{note.referenced_note_id}
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-slate-200 whitespace-pre-wrap leading-relaxed">{note.note_content}</p>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {/* TAB 3: PERFORMANCE & ANALYTICS */}
          {activeTab === 'performance' && (
            <div className="space-y-6">
              {/* Range Selector */}
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <span className="text-xs text-slate-400">ช่วงเวลาการวิเคราะห์:</span>
                <div className="flex items-center gap-1.5">
                  {[
                    { id: '1week', label: '1 สัปดาห์ล่าสุด' },
                    { id: '1month', label: '1 เดือนล่าสุด' },
                    { id: 'all', label: 'ทั้งหมด' },
                  ].map((r) => (
                    <button
                      key={r.id}
                      onClick={() => {
                        setPerfRange(r.id as any);
                        loadAnalytics(selectedPatient.id, r.id as any);
                      }}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                        perfRange === r.id
                          ? 'bg-emerald-600 text-white'
                          : 'bg-slate-950 text-slate-400 hover:text-white'
                      }`}
                    >
                      {r.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Metric Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="p-4 rounded-2xl bg-slate-950/80 border border-slate-800 flex flex-col justify-between">
                  <span className="text-xs text-slate-400">ความแม่นยำเฉลี่ย (Accuracy %)</span>
                  <div className="text-2xl font-bold text-emerald-400 mt-2">{accuracyPercent}%</div>
                  <span className="text-[10px] text-slate-500 mt-1">คำนวณจาก Kiosk Sessions</span>
                </div>

                <div className="p-4 rounded-2xl bg-slate-950/80 border border-slate-800 flex flex-col justify-between">
                  <span className="text-xs text-slate-400">จำนวนครั้งที่ทำถูกต้อง (Correct Reps)</span>
                  <div className="text-2xl font-bold text-cyan-400 mt-2">{totalCorrect} ครั้ง</div>
                  <span className="text-[10px] text-slate-500 mt-1">เปรียบเทียบกับผิด {totalIncorrect} ครั้ง</span>
                </div>

                <div className="p-4 rounded-2xl bg-slate-950/80 border border-slate-800 flex flex-col justify-between">
                  <span className="text-xs text-slate-400">จำนวนการฝึกทั้งหมด (Sessions)</span>
                  <div className="text-2xl font-bold text-purple-400 mt-2">{sessionLogs.length} ครั้ง</div>
                  <span className="text-[10px] text-slate-500 mt-1">บันทึกผ่านตู้คีออสอัตโนมัติ</span>
                </div>
              </div>

              {/* Training Frequency Calendar */}
              <div>
                <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-3">
                  ปฏิทินความถี่การฝึก (Training Frequency Calendar)
                </h4>
                <Calendar events={frequencyCalendar} />
              </div>

              {/* Recent Exercise Logs */}
              <div className="space-y-3">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                  ประวัติผลการฝึกรายเซสชัน (Session Breakdown)
                </h4>
                {sessionLogs.length === 0 ? (
                  <p className="text-xs text-slate-500 text-center py-4">ไม่มีประวัติการฝึกในช่วงเวลานี้</p>
                ) : (
                  <div className="space-y-2">
                    {sessionLogs.map((log) => (
                      <div
                        key={log.id}
                        className="p-3 rounded-xl bg-slate-950/60 border border-slate-800 flex items-center justify-between text-xs"
                      >
                        <div>
                          <div className="font-semibold text-white">{log.exercise_name_th || log.exercise_id}</div>
                          <div className="text-[11px] text-slate-400">{formatDateTime(log.started_at)}</div>
                        </div>
                        <div className="flex items-center gap-4">
                          <span className="text-emerald-400 font-mono">
                            ถูก {log.correct_reps} / ผิด {log.incorrect_reps}
                          </span>
                          <span className="font-bold text-white bg-slate-900 px-2 py-1 rounded-md border border-slate-700">
                            {log.accuracy_percent}%
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </Modal>
      )}
    </div>
  );
};
