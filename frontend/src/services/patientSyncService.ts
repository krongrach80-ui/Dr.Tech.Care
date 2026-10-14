/**
 * Dr.Tech.Care - Multi-Device Real-Time Patient Synchronization Service
 * 
 * Synchronizes new biometric face enrollment, patient profiles, and clinical records
 * INSTANTLY across physical devices (Kiosk Terminal <-> Doctor's Dashboard <-> Tablets)
 * 
 * Transport Layers:
 * 1. Primary: Server-Sent Events (SSE) from Central Node.js Server (Cross-Device Instant Push)
 * 2. Secondary: Active Catch-Up Polling fallback (every 4s) to survive NAT/proxies
 * 3. Local: BroadcastChannel & Storage events for multi-tab/multi-window on the same device
 */

import { UserAccount } from '../types/hospital';
import { resolveDefaultApiUrl, getSseStreamUrl } from '../config/apiConfig';

export type PatientSyncEventType =
  | 'ENROLLED_PENDING'
  | 'INFO_COMPLETED'
  | 'PATIENT_ENROLLED'
  | 'PATIENT_UPDATED'
  | 'PATIENT_DELETED'
  | 'CONNECTED';

export interface PatientSyncEvent {
  type: PatientSyncEventType;
  user?: UserAccount;
  patient?: any;
  id?: string | number;
  code?: string;
  message?: string;
  timestamp: number;
}

const SYNC_CHANNEL_NAME = 'strongcare_patient_sync_channel';
const STORAGE_SYNC_KEY = 'strongcare_last_patient_sync';

class PatientSyncService {
  private channel: BroadcastChannel | null = null;
  private listeners: Set<(event: PatientSyncEvent) => void> = new Set();
  private eventSource: EventSource | null = null;
  private isSseConnected: boolean = false;
  private lastEventTimestamp: number = Date.now();
  private reconnectTimer: any = null;
  private pollInterval: any = null;

  constructor() {
    this.initLocalBroadcasters();
    if (typeof window !== 'undefined') {
      this.initSseStream();
      this.startCatchUpPolling();

      // Listen for custom API URL changes (e.g. user updated server IP in Settings)
      window.addEventListener('strongcare:api_url_changed', () => {
        console.log('[SYNC] Central API Base URL changed, reconnecting SSE stream...');
        this.reconnectSse();
      });

      // Reconnect when browser comes back online
      window.addEventListener('online', () => {
        console.log('[SYNC] Network back online, resuming SSE connection...');
        this.reconnectSse();
      });
    }
  }

  /**
   * 1. Initialize Browser-Local Broadcasters (BroadcastChannel & localStorage)
   */
  private initLocalBroadcasters() {
    if (typeof window === 'undefined') return;

    if (typeof BroadcastChannel !== 'undefined') {
      try {
        this.channel = new BroadcastChannel(SYNC_CHANNEL_NAME);
        this.channel.onmessage = (msgEvent) => {
          if (msgEvent.data && msgEvent.data.type) {
            this.notifyListeners(msgEvent.data as PatientSyncEvent);
          }
        };
      } catch (e) {
        console.warn('BroadcastChannel not available:', e);
      }
    }

    window.addEventListener('storage', (e) => {
      if (e.key === STORAGE_SYNC_KEY && e.newValue) {
        try {
          const parsed = JSON.parse(e.newValue);
          this.notifyListeners(parsed);
        } catch {}
      }
    });
  }

  /**
   * 2. Initialize Real-Time SSE Stream with Central Backend Server
   */
  private initSseStream() {
    const sseUrl = getSseStreamUrl();
    if (!sseUrl || typeof EventSource === 'undefined') return;

    try {
      if (this.eventSource) {
        this.eventSource.close();
        this.eventSource = null;
      }

      console.log(`[SYNC] Connecting to Central Real-Time SSE stream: ${sseUrl}`);
      this.eventSource = new EventSource(sseUrl);

      this.eventSource.onopen = () => {
        this.isSseConnected = true;
        console.log('✓ [SYNC] Central Real-Time SSE connection established successfully!');
      };

      this.eventSource.onmessage = (msg) => {
        try {
          if (!msg.data || msg.data.trim().startsWith(':')) return; // ignore comments/keep-alive
          const event: PatientSyncEvent = JSON.parse(msg.data);
          if (event.timestamp) {
            this.lastEventTimestamp = Math.max(this.lastEventTimestamp, event.timestamp);
          }
          if (event.type && event.type !== 'CONNECTED') {
            console.log(`⚡ [SYNC EVENT RECEIVED]: ${event.type}`, event.user?.code || event.patient?.code || '');
            this.notifyListeners(event);
          }
        } catch (err) {
          console.warn('[SYNC] Error parsing SSE payload:', err);
        }
      };

      this.eventSource.onerror = () => {
        this.isSseConnected = false;
        if (this.eventSource) {
          this.eventSource.close();
          this.eventSource = null;
        }
        // Attempt scheduled reconnect in 4 seconds
        if (!this.reconnectTimer) {
          this.reconnectTimer = setTimeout(() => {
            this.reconnectTimer = null;
            this.initSseStream();
          }, 4000);
        }
      };
    } catch (err) {
      console.warn('[SYNC] Failed to construct EventSource:', err);
    }
  }

  /**
   * Reconnect SSE Stream manually or after settings change
   */
  public reconnectSse() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }
    this.isSseConnected = false;
    this.initSseStream();
  }

  /**
   * 3. Active Catch-Up Polling Fallback (Every 5 seconds)
   * Ensures zero dropped events if device was in sleep mode or behind strict HTTP proxy
   */
  private startCatchUpPolling() {
    if (this.pollInterval) clearInterval(this.pollInterval);

    this.pollInterval = setInterval(async () => {
      const baseUrl = resolveDefaultApiUrl();
      if (!baseUrl) return;

      try {
        const catchupUrl = `${baseUrl}/sync/catchup?since=${this.lastEventTimestamp}`;
        const res = await fetch(catchupUrl, { method: 'GET' });
        if (res.ok) {
          const json = await res.json();
          if (json.events && Array.isArray(json.events) && json.events.length > 0) {
            console.log(`[SYNC POLLING] Recovered ${json.events.length} missed events from central DB.`);
            for (const ev of json.events) {
              if (ev.timestamp > this.lastEventTimestamp) {
                this.lastEventTimestamp = ev.timestamp;
                this.notifyListeners(ev);
              }
            }
          }
        }
      } catch {
        // Silent catch for offline moments
      }
    }, 5000);
  }

  private notifyListeners(event: PatientSyncEvent) {
    this.listeners.forEach((listener) => {
      try {
        listener(event);
      } catch (err) {
        console.error('Error in patient sync listener:', err);
      }
    });
  }

  public subscribe(callback: (event: PatientSyncEvent) => void): () => void {
    this.listeners.add(callback);
    return () => {
      this.listeners.delete(callback);
    };
  }

  /**
   * Broadcast: New Patient Enrolled at Kiosk (Pending Info)
   */
  public broadcastEnrolledPending(user: UserAccount): void {
    const event: PatientSyncEvent = {
      type: 'ENROLLED_PENDING',
      user,
      patient: user,
      timestamp: Date.now(),
    };
    this.send(event);
  }

  /**
   * Broadcast: Patient Info Form Completed
   */
  public broadcastInfoCompleted(user: UserAccount): void {
    const event: PatientSyncEvent = {
      type: 'INFO_COMPLETED',
      user,
      patient: user,
      timestamp: Date.now(),
    };
    this.send(event);
  }

  /**
   * Send event across all layers:
   * 1. In-process listeners
   * 2. Local BroadcastChannel & localStorage
   * 3. HTTP POST to Central Server /api/sync/broadcast
   */
  private send(event: PatientSyncEvent): void {
    // 1. In-process listeners
    this.notifyListeners(event);

    // 2. BroadcastChannel (same machine multi-tab)
    if (this.channel) {
      try {
        this.channel.postMessage(event);
      } catch {}
    }

    // 3. LocalStorage event (fallback for separate browser contexts on same machine)
    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        localStorage.setItem(STORAGE_SYNC_KEY, JSON.stringify(event));
      } catch {}
    }

    // 4. HTTP POST to Central Server (Broadcasts to Doctor's PC, Tablets, etc. via SSE)
    const baseUrl = resolveDefaultApiUrl();
    if (baseUrl) {
      fetch(`${baseUrl}/sync/broadcast`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(event),
      }).catch((err) => {
        console.warn('[SYNC] HTTP broadcast to central server failed:', err.message);
      });
    }
  }

  /**
   * Synchronize registered patient with central server explicitly
   */
  public async syncPatientToBackend(patientData: any): Promise<any> {
    const baseUrl = resolveDefaultApiUrl();
    if (!baseUrl) return null;

    try {
      const res = await fetch(`${baseUrl}/patients/register-face`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patientData),
      });

      if (!res.ok) {
        throw new Error(`Central server returned HTTP ${res.status}`);
      }

      const json = await res.json();
      console.log('✓ [SYNC] Successfully synchronized patient record to Central DB:', json.data?.code);
      return json.data;
    } catch (err: any) {
      console.warn('⚠️ [SYNC] Direct HTTP sync to Central DB error:', err.message);
      return null;
    }
  }

  /**
   * Check current synchronization health
   */
  public getStatus(): { isSseConnected: boolean; apiUrl: string; lastSyncTime: number } {
    return {
      isSseConnected: this.isSseConnected,
      apiUrl: resolveDefaultApiUrl(),
      lastSyncTime: this.lastEventTimestamp,
    };
  }
}

export const patientSyncService = new PatientSyncService();
