/**
 * Dr.Tech.Care - Real-time Cross-Platform Patient Registration & Sync Service
 * Synchronizes new biometric face enrollment and patient information
 * instantly across Kiosk and Admin Hospital Portal (same tab, multi-tab, or multi-window)
 */

import { UserAccount } from '../types/hospital';

export type PatientSyncEventType = 'ENROLLED_PENDING' | 'INFO_COMPLETED';

export interface PatientSyncEvent {
  type: PatientSyncEventType;
  user: UserAccount;
  timestamp: number;
}

const SYNC_CHANNEL_NAME = 'strongcare_patient_sync_channel';
const STORAGE_SYNC_KEY = 'strongcare_last_patient_sync';

class PatientSyncService {
  private channel: BroadcastChannel | null = null;
  private listeners: Set<(event: PatientSyncEvent) => void> = new Set();

  constructor() {
    if (typeof window !== 'undefined' && typeof BroadcastChannel !== 'undefined') {
      try {
        this.channel = new BroadcastChannel(SYNC_CHANNEL_NAME);
        this.channel.onmessage = (msgEvent) => {
          if (msgEvent.data && msgEvent.data.type) {
            this.notifyListeners(msgEvent.data as PatientSyncEvent);
          }
        };
      } catch (e) {
        console.warn('BroadcastChannel not available, falling back to storage events:', e);
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

  public broadcastEnrolledPending(user: UserAccount): void {
    const event: PatientSyncEvent = {
      type: 'ENROLLED_PENDING',
      user,
      timestamp: Date.now(),
    };
    this.send(event);
  }

  public broadcastInfoCompleted(user: UserAccount): void {
    const event: PatientSyncEvent = {
      type: 'INFO_COMPLETED',
      user,
      timestamp: Date.now(),
    };
    this.send(event);
  }

  private send(event: PatientSyncEvent): void {
    // 1. In-process listeners
    this.notifyListeners(event);

    // 2. BroadcastChannel (cross-tab / cross-window instant)
    if (this.channel) {
      try {
        this.channel.postMessage(event);
      } catch {}
    }

    // 3. LocalStorage event (fallback for separate contexts)
    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        localStorage.setItem(STORAGE_SYNC_KEY, JSON.stringify(event));
      } catch {}
    }
  }
}

export const patientSyncService = new PatientSyncService();
