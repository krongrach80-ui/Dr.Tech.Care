import React, { useState, useEffect } from 'react';
import { ShieldAlert, ShieldCheck, Ban, LogOut, Search, RefreshCw, AlertTriangle, Laptop, Monitor } from 'lucide-react';
import { Table, Column } from '../../components/common/Table';
import { Badge } from '../../components/common/Badge';
import { Button } from '../../components/common/Button';
import { Card } from '../../components/common/Card';
import { Modal } from '../../components/common/Modal';
import { AuditLog, BannedIp } from '../../types/schema';
import { api } from '../../lib/api';
import { formatDateTime, formatEmpty } from '../../i18n';

export const AuditSecurityModule: React.FC = () => {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [bannedIps, setBannedIps] = useState<BannedIp[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [totalCount, setTotalCount] = useState<number>(0);
  const [searchAction, setSearchAction] = useState<string>('');
  const [securityFilter, setSecurityFilter] = useState<string>('');

  // Selected Log for Security Control Modal
  const [selectedLog, setSelectedLog] = useState<AuditLog | null>(null);
  const [isBanning, setIsBanning] = useState<boolean>(false);
  const [isForceLoggingOut, setIsForceLoggingOut] = useState<boolean>(false);

  const loadLogs = async () => {
    setIsLoading(true);
    try {
      const [logRes, banRes] = await Promise.all([
        api.audit.list({ action: searchAction, security: securityFilter, limit: 100 }),
        api.audit.getBannedIps(),
      ]);
      setLogs(logRes.logs || []);
      setTotalCount(logRes.total || 0);
      setBannedIps(banRes.banned_ips || []);
    } catch (err: any) {
      console.error('Failed to load audit logs:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      loadLogs();
    }, 250);
    return () => clearTimeout(timer);
  }, [searchAction, securityFilter]);

  const handleBanIp = async (ip: string) => {
    const reason = prompt(`ระบุเหตุผลในการแบน IP: ${ip}`, 'พบลักษณะการเข้าสู่ระบบต้องสงสัยซ้ำซ้อน');
    if (!reason) return;
    setIsBanning(true);
    try {
      const res = await api.audit.banIp(ip, reason);
      alert(res.message);
      loadLogs();
      setSelectedLog(null);
    } catch (err: any) {
      alert('เกิดข้อผิดพลาด: ' + err?.message);
    } finally {
      setIsBanning(false);
    }
  };

  const handleUnbanIp = async (ip: string) => {
    if (!confirm(`ต้องการปลดแบน IP: ${ip} หรือไม่?`)) return;
    try {
      const res = await api.audit.unbanIp(ip);
      alert(res.message);
      loadLogs();
    } catch (err: any) {
      alert('เกิดข้อผิดพลาด: ' + err?.message);
    }
  };

  const handleForceLogoutUser = async (userId: string) => {
    if (!confirm(`ต้องการบังคับออกจากระบบ (Force Logout) สำหรับผู้ใช้รหัส ${userId} ทุกเซสชันทันทีหรือไม่?`)) {
      return;
    }
    setIsForceLoggingOut(true);
    try {
      const res = await api.auth.forceLogout(userId);
      alert(res.message);
      loadLogs();
    } catch (err: any) {
      alert('เกิดข้อผิดพลาด: ' + err?.message);
    } finally {
      setIsForceLoggingOut(false);
    }
  };

  const isIpBanned = (ip: string) => {
    return bannedIps.some((b) => b.ip_address === ip && b.is_active === 1);
  };

  const columns: Column<AuditLog>[] = [
    {
      key: 'created_at',
      header: 'วันเวลา (Timestamp)',
      render: (l) => <span className="font-mono text-xs text-slate-300">{formatDateTime(l.created_at)}</span>,
    },
    {
      key: 'user',
      header: 'ผู้กระทำ (User / ID / Role)',
      render: (l) => (
        <div>
          <div className="font-semibold text-white">{formatEmpty(l.user_name || l.user_id)}</div>
          <div className="text-xs text-slate-400 font-mono">
            {l.user_id || 'GUEST'} • <span className="uppercase text-emerald-400">{l.user_role || '-'}</span>
          </div>
        </div>
      ),
    },
    {
      key: 'ip_address',
      header: 'IP Address',
      render: (l) => {
        const banned = isIpBanned(l.ip_address);
        return (
          <div className="flex items-center gap-1.5 font-mono text-xs">
            <span className={banned ? 'text-rose-400 line-through' : 'text-slate-300'}>{l.ip_address}</span>
            {banned && (
              <span className="text-[10px] bg-rose-950 border border-rose-700 text-rose-300 px-1.5 rounded">
                BANNED
              </span>
            )}
          </div>
        );
      },
    },
    {
      key: 'device_type',
      header: 'อุปกรณ์ (Device)',
      render: (l) => (
        <span className="inline-flex items-center gap-1 text-xs text-slate-300">
          {l.device_type === 'Kiosk' ? (
            <Monitor className="w-3.5 h-3.5 text-cyan-400" />
          ) : (
            <Laptop className="w-3.5 h-3.5 text-slate-400" />
          )}
          <span>{l.device_type}</span>
        </span>
      ),
    },
    {
      key: 'action',
      header: 'การกระทำ (Action)',
      render: (l) => (
        <div>
          <span className="font-mono text-xs font-semibold text-indigo-300 bg-indigo-950/60 border border-indigo-800/60 px-2 py-0.5 rounded-md">
            {l.action}
          </span>
          {l.details && <p className="text-[11px] text-slate-400 mt-1 max-w-md truncate">{l.details}</p>}
        </div>
      ),
    },
    {
      key: 'security_status',
      header: 'ความปลอดภัย',
      render: (l) => (
        <Badge variant={l.security_status === 'Suspicious' ? 'suspicious' : 'active'}>
          {l.security_status}
        </Badge>
      ),
    },
    {
      key: 'actions',
      header: 'จัดการความปลอดภัย',
      align: 'right',
      render: (l) => (
        <Button
          variant="secondary"
          size="sm"
          onClick={() => setSelectedLog(l)}
          leftIcon={<ShieldAlert className="w-3.5 h-3.5 text-amber-400" />}
        >
          ควบคุม IP / เซสชัน
        </Button>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <Card
        title={
          <div className="flex items-center gap-2.5">
            <ShieldAlert className="w-5 h-5 text-rose-400" />
            <span>โมดูลที่ 6: บันทึกความปลอดภัยและการควบคุมระบบ (Audit Logs & Security Control)</span>
          </div>
        }
        subtitle="บันทึกกิจกรรมความปลอดภัยทุกมิติ ตรวจจับความผิดปกติแบบ Rule-based และระงับสิทธิ์ด้วย Force Logout / IP Ban"
      >
        {/* Filters and search */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 mb-5">
          <div className="relative w-full sm:w-80">
            <Search className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
            <input
              type="text"
              value={searchAction}
              onChange={(e) => setSearchAction(e.target.value)}
              placeholder="ค้นหา Action เช่น LOGIN, FORCE_LOGOUT, BAN..."
              className="w-full bg-slate-950 border border-slate-700 rounded-xl pl-9 pr-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-rose-500 font-mono"
            />
          </div>

          <div className="flex items-center gap-3 w-full sm:w-auto">
            <select
              value={securityFilter}
              onChange={(e) => setSecurityFilter(e.target.value)}
              className="bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
            >
              <option value="">ทุกสถานะ (All Security Status)</option>
              <option value="Normal">Normal (ปกติ)</option>
              <option value="Suspicious">Suspicious (น่าสงสัย / ผิดปกติ)</option>
            </select>
            <Button variant="ghost" size="sm" onClick={loadLogs} title="รีเฟรช">
              <RefreshCw className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>

        {/* Banned IPs list preview banner */}
        {bannedIps.filter((b) => b.is_active === 1).length > 0 && (
          <div className="mb-6 p-4 rounded-2xl bg-rose-950/40 border border-rose-800/80 space-y-2">
            <h4 className="text-xs font-bold uppercase tracking-wider text-rose-300 flex items-center gap-2">
              <Ban className="w-4 h-4 text-rose-400" />
              <span>IP Address ที่ถูกแบนในขณะนี้ ({bannedIps.filter((b) => b.is_active === 1).length} รายการ)</span>
            </h4>
            <div className="flex flex-wrap gap-2">
              {bannedIps
                .filter((b) => b.is_active === 1)
                .map((b) => (
                  <div
                    key={b.id}
                    className="inline-flex items-center gap-2 bg-slate-900 border border-rose-800/80 px-3 py-1 rounded-full text-xs"
                  >
                    <span className="font-mono text-rose-300">{b.ip_address}</span>
                    <span className="text-[10px] text-slate-400">({b.reason})</span>
                    <button
                      onClick={() => handleUnbanIp(b.ip_address)}
                      className="text-slate-400 hover:text-white ml-1 text-xs"
                      title="ปลดแบน"
                    >
                      ✕
                    </button>
                  </div>
                ))}
            </div>
          </div>
        )}

        {/* Table */}
        <Table<AuditLog>
          columns={columns}
          data={logs}
          keyExtractor={(l) => l.id}
          isLoading={isLoading}
          emptyMessage="ไม่พบบันทึกประวัติความปลอดภัยตามเงื่อนไข"
        />
      </Card>

      {/* Security Control Modal */}
      {selectedLog && (
        <Modal
          isOpen={!!selectedLog}
          onClose={() => setSelectedLog(null)}
          size="md"
          title="หน้าต่างควบคุมความปลอดภัย (Security Control Modal)"
          subtitle={`กิจกรรม: ${selectedLog.action} (${formatDateTime(selectedLog.created_at)})`}
        >
          <div className="space-y-4">
            <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-400">IP Address:</span>
                <span className="font-mono text-white font-bold">{selectedLog.ip_address}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">ผู้ใช้งาน:</span>
                <span className="text-white">{selectedLog.user_name || 'ไม่ระบุตัวตน'} ({selectedLog.user_id || '-'})</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">อุปกรณ์:</span>
                <span className="text-white">{selectedLog.device_type}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">สถานะความปลอดภัย:</span>
                <Badge variant={selectedLog.security_status === 'Suspicious' ? 'suspicious' : 'active'}>
                  {selectedLog.security_status}
                </Badge>
              </div>
              {selectedLog.details && (
                <div className="pt-2 border-t border-slate-800 text-slate-300">
                  <span className="text-slate-500 font-semibold block mb-0.5">รายละเอียด:</span>
                  {selectedLog.details}
                </div>
              )}
            </div>

            <div className="space-y-3 pt-2">
              <h5 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                มาตรการตอบสนองความปลอดภัยฉุกเฉิน
              </h5>

              {/* Force Logout Action */}
              {selectedLog.user_id && (
                <div className="p-3.5 rounded-xl border border-amber-900/40 bg-amber-950/20 flex items-center justify-between">
                  <div>
                    <h6 className="text-xs font-bold text-amber-300 flex items-center gap-1.5">
                      <LogOut className="w-3.5 h-3.5" />
                      <span>บังคับออกจากระบบทันที (Force Logout)</span>
                    </h6>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      ยกเลิกเซสชันทั้งหมดของผู้ใช้รหัส {selectedLog.user_id} ในฐานข้อมูลทันที
                    </p>
                  </div>
                  <Button
                    variant="danger"
                    size="sm"
                    onClick={() => handleForceLogoutUser(selectedLog.user_id!)}
                    isLoading={isForceLoggingOut}
                  >
                    Force Logout
                  </Button>
                </div>
              )}

              {/* Ban IP Action */}
              <div className="p-3.5 rounded-xl border border-rose-900/40 bg-rose-950/20 flex items-center justify-between">
                <div>
                  <h6 className="text-xs font-bold text-rose-300 flex items-center gap-1.5">
                    <Ban className="w-3.5 h-3.5" />
                    <span>แบน IP Address ({selectedLog.ip_address})</span>
                  </h6>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    ระงับการเข้าถึงทุกคำขอ (รวมถึง Kiosk) ทันทีในระดับ Middleware
                  </p>
                </div>
                {isIpBanned(selectedLog.ip_address) ? (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleUnbanIp(selectedLog.ip_address)}
                  >
                    ปลดแบน IP
                  </Button>
                ) : (
                  <Button
                    variant="danger"
                    size="sm"
                    onClick={() => handleBanIp(selectedLog.ip_address)}
                    isLoading={isBanning}
                  >
                    แบน IP นี้
                  </Button>
                )}
              </div>
            </div>

            <div className="flex justify-end pt-3 border-t border-slate-800">
              <Button variant="ghost" onClick={() => setSelectedLog(null)}>
                ปิดหน้าต่าง
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};
