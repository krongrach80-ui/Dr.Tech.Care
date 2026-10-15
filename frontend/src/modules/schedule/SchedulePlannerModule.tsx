import React, { useState, useEffect } from 'react';
import { Calendar as CalendarIcon, Clock, Plus, Move, AlertTriangle, CheckCircle2, Gamepad2, Dumbbell } from 'lucide-react';
import { Card } from '../../components/common/Card';
import { Button } from '../../components/common/Button';
import { Modal } from '../../components/common/Modal';
import { Calendar } from '../../components/common/Calendar';
import { Badge } from '../../components/common/Badge';
import { Appointment, Exercise, User, TemporaryCoverage } from '../../types/schema';
import { api } from '../../lib/api';
import { formatDate } from '../../i18n';

export interface SchedulePlannerModuleProps {
  actorRole: 'admin' | 'pt';
  currentPtId?: string;
  defaultPatientId?: string;
}

export const SchedulePlannerModule: React.FC<SchedulePlannerModuleProps> = ({
  actorRole,
  currentPtId,
  defaultPatientId,
}) => {
  const [patients, setPatients] = useState<User[]>([]);
  const [selectedPatientId, setSelectedPatientId] = useState<string>(defaultPatientId || '');
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [activeCoverages, setActiveCoverages] = useState<TemporaryCoverage[]>([]);
  const [filterScope, setFilterScope] = useState<'my' | 'covered' | 'all'>('my');

  // Interactive Calendar state
  const [selectedDate, setSelectedDate] = useState<string>(new Date().toISOString().split('T')[0]);

  // Modal B: Daily Routine Assignment
  const [isAssignModalOpen, setIsAssignModalOpen] = useState<boolean>(false);
  const [routineItemsToAssign, setRoutineItemsToAssign] = useState<Array<{
    exercise_id: string;
    order_index: number;
    reps: number;
    sets: number;
    rest_seconds: number;
    custom_instructions: string;
  }>>([]);
  const [isSavingRoutine, setIsSavingRoutine] = useState<boolean>(false);

  // Move date state
  const [isMoveModalOpen, setIsMoveModalOpen] = useState<boolean>(false);
  const [appointmentToMove, setAppointmentToMove] = useState<Appointment | null>(null);
  const [newDateInput, setNewDateInput] = useState<string>('');

  useEffect(() => {
    // Load patients
    api.patients.list().then((res) => {
      setPatients(res.patients || []);
      if (!selectedPatientId && res.patients && res.patients.length > 0) {
        setSelectedPatientId(res.patients[0].id);
      }
    }).catch(console.error);

    // Load exercises
    api.exercises.list().then((res) => {
      setExercises(res.exercises || []);
    }).catch(console.error);

    // Load coverages
    api.pt.listCoverages().then((res) => {
      setActiveCoverages(res.coverages || []);
    }).catch(console.error);
  }, []);

  // Load appointments when selected patient or month changes
  useEffect(() => {
    if (!selectedPatientId) return;
    api.schedule.getAppointments({ patient_id: selectedPatientId }).then((res) => {
      setAppointments(res.appointments || []);
    }).catch(console.error);
  }, [selectedPatientId]);

  // Permission calculation: Can the user write schedule for this patient?
  const selectedPatient = patients.find((p) => p.id === selectedPatientId);
  const isOwner = actorRole === 'admin' || (actorRole === 'pt' && selectedPatient?.assigned_pt_id === currentPtId);
  const isCovering = actorRole === 'pt' && activeCoverages.some((c) => {
    const today = new Date().toISOString().split('T')[0];
    return c.patient_id === selectedPatientId && c.cover_pt_id === currentPtId && c.status === 'active' && today >= c.start_date && today <= c.end_date;
  });
  const canWrite = actorRole === 'admin' || isOwner || isCovering;

  // Filter patient options based on scope
  const filteredPatients = patients.filter((p) => {
    if (actorRole === 'admin' || filterScope === 'all') return true;
    if (filterScope === 'my') return p.assigned_pt_id === currentPtId;
    if (filterScope === 'covered') {
      return activeCoverages.some((c) => c.patient_id === p.id && c.cover_pt_id === currentPtId && c.status === 'active');
    }
    return true;
  });

  // Calendar event dots map
  const calendarEventDots: Record<string, 'completed' | 'scheduled' | 'missed'> = {};
  appointments.forEach((a) => {
    if (a.status === 'completed') calendarEventDots[a.appointment_date] = 'completed';
    else if (a.status === 'missed') calendarEventDots[a.appointment_date] = 'missed';
    else if (a.status === 'scheduled') calendarEventDots[a.appointment_date] = 'scheduled';
  });

  // Current appointment for the selected date
  const selectedDateAppointment = appointments.find((a) => a.appointment_date === selectedDate);

  const handleOpenAssignRoutine = () => {
    if (!canWrite) return;
    if (selectedDateAppointment && selectedDateAppointment.routine_items) {
      setRoutineItemsToAssign(
        selectedDateAppointment.routine_items.map((ri, idx) => ({
          exercise_id: ri.exercise_id,
          order_index: idx + 1,
          reps: ri.reps,
          sets: ri.sets,
          rest_seconds: ri.rest_seconds,
          custom_instructions: ri.custom_instructions || '',
        }))
      );
    } else {
      // Default to MG-01
      setRoutineItemsToAssign([
        {
          exercise_id: 'MG-01',
          order_index: 1,
          reps: 10,
          sets: 3,
          rest_seconds: 20,
          custom_instructions: 'ฝึกเอื้อมแขนต่อเนื่อง รักษาความเร็วสม่ำเสมอ',
        },
      ]);
    }
    setIsAssignModalOpen(true);
  };

  const handleSaveRoutine = async () => {
    if (!selectedPatientId || routineItemsToAssign.length === 0) return;
    setIsSavingRoutine(true);
    try {
      await api.schedule.assignRoutine({
        patient_id: selectedPatientId,
        appointment_date: selectedDate,
        items: routineItemsToAssign,
      });
      alert('จัดโปรแกรมกายภาพประจำวันเรียบร้อยแล้ว');
      setIsAssignModalOpen(false);

      // Reload appointments
      const res = await api.schedule.getAppointments({ patient_id: selectedPatientId });
      setAppointments(res.appointments || []);
    } catch (err: any) {
      alert('เกิดข้อผิดพลาด: ' + err?.message);
    } finally {
      setIsSavingRoutine(false);
    }
  };

  const handleMoveAppointment = async () => {
    if (!appointmentToMove || !newDateInput) return;
    try {
      await api.schedule.moveAppointmentDate(appointmentToMove.id, newDateInput);
      alert('ย้ายวันนัดหมายเรียบร้อยแล้ว');
      setIsMoveModalOpen(false);
      setAppointmentToMove(null);

      const res = await api.schedule.getAppointments({ patient_id: selectedPatientId });
      setAppointments(res.appointments || []);
    } catch (err: any) {
      alert('เกิดข้อผิดพลาด: ' + err?.message);
    }
  };

  return (
    <div className="space-y-6">
      <Card
        title={
          <div className="flex items-center gap-2.5">
            <CalendarIcon className="w-5 h-5 text-emerald-400" />
            <span>โมดูลที่ 3: ตารางนัดหมายและแผนการฝึกกายภาพ (Therapy Schedule Planner)</span>
          </div>
        }
        subtitle="ซิงก์โปรแกรมฝึกประจำวันกับ Kiosk ทันทีเมื่อผู้ป่วยสแกนใบหน้า พร้อมระบบเลื่อนนัดอัตโนมัติ (Auto-Reschedule)"
      >
        {/* Scope Selector for PT */}
        {actorRole === 'pt' && (
          <div className="flex items-center gap-2 mb-4 p-2 rounded-xl bg-slate-950 border border-slate-800 text-xs">
            <span className="text-slate-400 font-medium">มุมมองคนไข้:</span>
            <button
              onClick={() => setFilterScope('my')}
              className={`px-3 py-1 rounded-lg font-semibold transition-all ${
                filterScope === 'my' ? 'bg-emerald-600 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              คนไข้ในความดูแลของฉัน (My Patients)
            </button>
            <button
              onClick={() => setFilterScope('covered')}
              className={`px-3 py-1 rounded-lg font-semibold transition-all ${
                filterScope === 'covered' ? 'bg-amber-600 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              เคสรับฝากชั่วคราว (Covered Cases)
            </button>
            <button
              onClick={() => setFilterScope('all')}
              className={`px-3 py-1 rounded-lg font-semibold transition-all ${
                filterScope === 'all' ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              ผู้ป่วยทั้งหมด (All Patients - Read Only)
            </button>
          </div>
        )}

        {/* Patient Selector */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-center mb-6 p-4 rounded-2xl bg-slate-950/80 border border-slate-800">
          <div className="md:col-span-6 flex items-center gap-3">
            <span className="text-xs text-slate-300 font-semibold whitespace-nowrap">เลือกผู้ป่วย:</span>
            <select
              value={selectedPatientId}
              onChange={(e) => setSelectedPatientId(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500 font-medium"
            >
              {filteredPatients.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.full_name} ({p.id}) • {p.assigned_pt_name || 'ไม่มี PT ประจำ'}
                </option>
              ))}
            </select>
          </div>

          <div className="md:col-span-6 flex items-center justify-end gap-2">
            {!canWrite ? (
              <span className="text-xs text-amber-400 bg-amber-950/80 border border-amber-800 px-3 py-1.5 rounded-xl flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5" />
                โหมดอ่านอย่างเดียว (ไม่ใช่เคสประจำและไม่มีสิทธิ์ฝากเคส)
              </span>
            ) : isCovering ? (
              <Badge variant="covering">กำลังดูแลแทนตามการฝากเคสชั่วคราว (Covering Case)</Badge>
            ) : (
              <span className="text-xs text-emerald-400 bg-emerald-950/80 border border-emerald-800 px-3 py-1.5 rounded-xl flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5" />
                มีสิทธิ์แก้ไขและจัดโปรแกรมกายภาพเต็มรูปแบบ (Full Write)
              </span>
            )}
          </div>
        </div>

        {/* Calendar and Routine Split View */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left: Master Interactive Calendar */}
          <div className="lg:col-span-7">
            <Calendar
              events={calendarEventDots}
              selectedDate={selectedDate}
              onSelectDate={(d) => setSelectedDate(d)}
            />
          </div>

          {/* Right: Routine Inspector for selected date */}
          <div className="lg:col-span-5 flex flex-col justify-between p-5 rounded-2xl bg-slate-900 border border-slate-800 shadow-xl space-y-4">
            <div>
              <div className="flex items-center justify-between border-b border-slate-800 pb-3 mb-3">
                <div>
                  <h4 className="text-sm font-bold text-white flex items-center gap-2">
                    <Clock className="w-4 h-4 text-emerald-400" />
                    <span>วันที่เลือก: {formatDate(selectedDate)}</span>
                  </h4>
                  <p className="text-xs text-slate-400 mt-0.5">
                    ผู้ป่วย: {selectedPatient?.full_name || selectedPatientId}
                  </p>
                </div>

                {selectedDateAppointment ? (
                  <Badge
                    variant={
                      selectedDateAppointment.status === 'completed'
                        ? 'completed'
                        : selectedDateAppointment.status === 'missed'
                        ? 'missed'
                        : 'scheduled'
                    }
                  >
                    {selectedDateAppointment.status.toUpperCase()}
                  </Badge>
                ) : (
                  <span className="text-xs text-slate-500 italic">ไม่มีนัดหมาย</span>
                )}
              </div>

              {/* Routine items listing */}
              <div className="space-y-2.5">
                <h5 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                  รายการท่าฝึกประจำวัน (Daily Routine Checklist)
                </h5>

                {!selectedDateAppointment || !selectedDateAppointment.routine_items || selectedDateAppointment.routine_items.length === 0 ? (
                  <div className="p-6 rounded-xl bg-slate-950/60 border border-slate-800 text-center">
                    <p className="text-xs text-slate-400">ยังไม่ได้จัดโปรแกรมกายภาพสำหรับวันนี้</p>
                    {canWrite && (
                      <Button
                        variant="primary"
                        size="sm"
                        className="mt-3"
                        onClick={handleOpenAssignRoutine}
                        leftIcon={<Plus className="w-3.5 h-3.5" />}
                      >
                        + จัดโปรแกรมกายภาพประจำวัน
                      </Button>
                    )}
                  </div>
                ) : (
                  <div className="space-y-2">
                    {selectedDateAppointment.routine_items.map((item, idx) => (
                      <div
                        key={idx}
                        className="p-3 rounded-xl bg-slate-950/80 border border-slate-800 flex items-center justify-between text-xs"
                      >
                        <div className="flex items-center gap-2.5">
                          <span className="w-6 h-6 rounded-full bg-slate-800 text-emerald-400 font-bold flex items-center justify-center shrink-0">
                            {idx + 1}
                          </span>
                          <div>
                            <div className="font-semibold text-white flex items-center gap-1.5">
                              <span>{item.exercise_name_th || item.exercise_id}</span>
                              <span className="text-[10px] text-cyan-400">({item.exercise_id})</span>
                            </div>
                            <div className="text-[11px] text-slate-400 mt-0.5">
                              {item.reps} ครั้ง • {item.sets} เซ็ต • พัก {item.rest_seconds}s
                            </div>
                          </div>
                        </div>

                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase ${
                            item.status === 'completed'
                              ? 'bg-emerald-950 text-emerald-300 border border-emerald-700'
                              : 'bg-slate-800 text-slate-400'
                          }`}
                        >
                          {item.status}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Actions for this appointment date */}
            {canWrite && selectedDateAppointment && (
              <div className="pt-3 border-t border-slate-800 flex items-center justify-between gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setAppointmentToMove(selectedDateAppointment);
                    setNewDateInput(selectedDateAppointment.appointment_date);
                    setIsMoveModalOpen(true);
                  }}
                  leftIcon={<Move className="w-3.5 h-3.5" />}
                >
                  ย้ายวันนัดหมาย (Move Date)
                </Button>

                <Button
                  variant="primary"
                  size="sm"
                  onClick={handleOpenAssignRoutine}
                  leftIcon={<Plus className="w-3.5 h-3.5" />}
                >
                  แก้ไขโปรแกรมฝึกประจำวัน
                </Button>
              </div>
            )}
          </div>
        </div>
      </Card>

      {/* Modal B: Daily Routine Assignment */}
      <Modal
        isOpen={isAssignModalOpen}
        onClose={() => setIsAssignModalOpen(false)}
        size="xl"
        title="จัดโปรแกรมกายภาพประจำวัน (Daily Routine Assignment)"
        subtitle={`ผู้ป่วย: ${selectedPatient?.full_name} • วันที่: ${formatDate(selectedDate)}`}
      >
        <div className="space-y-4">
          <div className="p-3 rounded-xl bg-slate-950/80 border border-slate-800 text-xs text-slate-300 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
            <span>
              ข้อกำหนดระบบ: ท่ากายภาพ Pose-based อยู่ระหว่างพัฒนา (เลือกได้เฉพาะมินิเกมเท่านั้น เพื่อความเสถียรบน Kiosk)
            </span>
          </div>

          <div className="space-y-3">
            {routineItemsToAssign.map((item, idx) => (
              <div key={idx} className="p-4 rounded-xl bg-slate-950/90 border border-slate-800 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-emerald-400">ลำดับที่ {idx + 1}</span>
                  {routineItemsToAssign.length > 1 && (
                    <button
                      type="button"
                      onClick={() =>
                        setRoutineItemsToAssign(routineItemsToAssign.filter((_, i) => i !== idx))
                      }
                      className="text-xs text-rose-400 hover:underline"
                    >
                      ลบรายการนี้
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-slate-300 font-medium">เลือกแบบฝึกหัด *</label>
                    <select
                      value={item.exercise_id}
                      onChange={(e) => {
                        const newId = e.target.value;
                        const copy = [...routineItemsToAssign];
                        copy[idx].exercise_id = newId;
                        setRoutineItemsToAssign(copy);
                      }}
                      className="mt-1 w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
                    >
                      {exercises.map((ex) => {
                        const isPose = ex.category !== 'Minigame';
                        return (
                          <option key={ex.id} value={ex.id} disabled={isPose}>
                            {ex.name_th} ({ex.id}) {isPose ? '— [อยู่ระหว่างพัฒนา]' : '🎮 มินิเกม'}
                          </option>
                        );
                      })}
                    </select>
                  </div>

                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <label className="text-[11px] text-slate-400">จำนวนครั้ง (Reps)</label>
                      <input
                        type="number"
                        value={item.reps}
                        onChange={(e) => {
                          const copy = [...routineItemsToAssign];
                          copy[idx].reps = parseInt(e.target.value, 10) || 10;
                          setRoutineItemsToAssign(copy);
                        }}
                        className="mt-1 w-full bg-slate-900 border border-slate-700 rounded-xl px-2 py-1.5 text-xs text-white"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] text-slate-400">จำนวนเซ็ต (Sets)</label>
                      <input
                        type="number"
                        value={item.sets}
                        onChange={(e) => {
                          const copy = [...routineItemsToAssign];
                          copy[idx].sets = parseInt(e.target.value, 10) || 3;
                          setRoutineItemsToAssign(copy);
                        }}
                        className="mt-1 w-full bg-slate-900 border border-slate-700 rounded-xl px-2 py-1.5 text-xs text-white"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] text-slate-400">เวลาพัก (วินาที)</label>
                      <input
                        type="number"
                        value={item.rest_seconds}
                        onChange={(e) => {
                          const copy = [...routineItemsToAssign];
                          copy[idx].rest_seconds = parseInt(e.target.value, 10) || 30;
                          setRoutineItemsToAssign(copy);
                        }}
                        className="mt-1 w-full bg-slate-900 border border-slate-700 rounded-xl px-2 py-1.5 text-xs text-white"
                      />
                    </div>
                  </div>
                </div>

                <div>
                  <label className="text-[11px] text-slate-400">คำแนะนำเฉพาะบุคคล (Instructions)</label>
                  <input
                    type="text"
                    value={item.custom_instructions}
                    onChange={(e) => {
                      const copy = [...routineItemsToAssign];
                      copy[idx].custom_instructions = e.target.value;
                      setRoutineItemsToAssign(copy);
                    }}
                    placeholder="เช่น เอื้อมแขนขวาช้าๆ ไม่ต้องเกร็งไหล่"
                    className="mt-1 w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-white"
                  />
                </div>
              </div>
            ))}
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              setRoutineItemsToAssign([
                ...routineItemsToAssign,
                {
                  exercise_id: 'MG-02',
                  order_index: routineItemsToAssign.length + 1,
                  reps: 12,
                  sets: 3,
                  rest_seconds: 25,
                  custom_instructions: 'เอื้อมจับดาวตามจังหวะ',
                },
              ])
            }
            leftIcon={<Plus className="w-3.5 h-3.5" />}
          >
            + เพิ่มท่าฝึกในโปรแกรม
          </Button>

          <div className="flex justify-end gap-3 pt-4 border-t border-slate-800">
            <Button variant="ghost" onClick={() => setIsAssignModalOpen(false)}>
              ยกเลิก
            </Button>
            <Button variant="primary" onClick={handleSaveRoutine} isLoading={isSavingRoutine}>
              บันทึกโปรแกรมฝึกประจำวัน
            </Button>
          </div>
        </div>
      </Modal>

      {/* Move Appointment Date Modal */}
      <Modal
        isOpen={isMoveModalOpen}
        onClose={() => setIsMoveModalOpen(false)}
        size="sm"
        title="ย้ายวันนัดหมาย (Move Appointment Date)"
      >
        <div className="space-y-4">
          <div>
            <label className="text-xs text-slate-300 font-medium">ระบุวันที่นัดหมายใหม่</label>
            <input
              type="date"
              value={newDateInput}
              onChange={(e) => setNewDateInput(e.target.value)}
              className="mt-1.5 w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white"
            />
          </div>

          <div className="flex justify-end gap-3 pt-3 border-t border-slate-800">
            <Button variant="ghost" onClick={() => setIsMoveModalOpen(false)}>
              ยกเลิก
            </Button>
            <Button variant="primary" onClick={handleMoveAppointment}>
              บันทึกการย้ายวัน
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
