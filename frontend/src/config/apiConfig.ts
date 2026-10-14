/**
 * StrongCare - Multi-Device Synchronized API Configuration
 * 
 * Resolves the Central Backend API URL across:
 * - Local Machine (localhost / 127.0.0.1:5000)
 * - Hospital Local Network IP (e.g. http://192.168.x.x:5000/api)
 * - Custom Server IP saved in Settings
 * - Cloud/Production endpoints (VITE_API_BASE_URL)
 */

const STORAGE_API_KEY = 'strongcare_custom_api_base';

export function getCustomApiBaseUrl(): string | null {
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      const saved = localStorage.getItem(STORAGE_API_KEY);
      if (saved && saved.trim()) return saved.trim();
    } catch {}
  }
  return null;
}

export function setCustomApiBaseUrl(url: string | null): void {
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      if (url && url.trim()) {
        localStorage.setItem(STORAGE_API_KEY, url.trim());
      } else {
        localStorage.removeItem(STORAGE_API_KEY);
      }
      window.dispatchEvent(new CustomEvent('strongcare:api_url_changed', { detail: url }));
    } catch {}
  }
}

export function resolveDefaultApiUrl(): string {
  // 1. User manual override in localStorage
  const custom = getCustomApiBaseUrl();
  if (custom) return custom;

  // 2. Vite environment variable
  const envUrl = (import.meta.env.VITE_API_BASE_URL || '').trim();
  if (envUrl) return envUrl;

  // 3. GitHub Pages static fallback
  if (typeof window !== 'undefined' && window.location.hostname.endsWith('github.io')) {
    return '';
  }

  // 4. Dynamic Auto-Resolution for Multi-Device LAN:
  // If accessing from a tablet, kiosk, or doctor's laptop via IP (e.g. 192.168.x.x),
  // automatically point to the Central Node.js Server on port 5000 on that same IP!
  if (typeof window !== 'undefined' && window.location.hostname) {
    const hostname = window.location.hostname;
    const protocol = window.location.protocol || 'http:';
    // Port 5000 is our dedicated Central Backend
    return `${protocol}//${hostname}:5000/api`;
  }

  return 'http://127.0.0.1:5000/api';
}

export const API_BASE_URL: string = resolveDefaultApiUrl();

export const IS_STATIC_MODE: boolean =
  (typeof window !== 'undefined' && window.location.search.includes('demo=1')) ||
  (import.meta.env.VITE_STATIC_DEMO === 'true' && !import.meta.env.VITE_API_BASE_URL);

/**
 * Returns the SSE stream URL corresponding to the current API base
 */
export function getSseStreamUrl(): string {
  const base = resolveDefaultApiUrl();
  if (!base) return '';
  return `${base}/sync/events`;
}

/**
 * Helper to check connection to central backend
 */
export async function testBackendConnection(targetUrl?: string): Promise<{ ok: boolean; info?: any; error?: string }> {
  const base = targetUrl || resolveDefaultApiUrl();
  if (!base) return { ok: false, error: 'No API base URL configured' };

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 4000);
    const res = await fetch(`${base}/health`, { signal: controller.signal });
    clearTimeout(timeoutId);

    if (res.ok) {
      const json = await res.json();
      return { ok: true, info: json };
    }
    return { ok: false, error: `HTTP ${res.status}: ${res.statusText}` };
  } catch (err: any) {
    return { ok: false, error: err.name === 'AbortError' ? 'Connection timed out (4s)' : (err.message || 'Network unreachable') };
  }
}
