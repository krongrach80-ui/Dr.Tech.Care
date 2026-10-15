/**
 * Moh Tech Care - Centralized Typed API Client
 * Strict typed HTTP requests, automatic Authorization header injection,
 * and 401 Force Logout handling. NO raw fetch inside UI components!
 */

const API_BASE = import.meta.env.VITE_API_URL || '/api';

export class ApiError extends Error {
  public status: number;
  public code?: string;
  public details?: any;

  constructor(message: string, status: number, code?: string, details?: any) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export function getAuthToken(): string | null {
  return localStorage.getItem('moh_auth_token');
}

export function setAuthToken(token: string | null): void {
  if (token) {
    localStorage.setItem('moh_auth_token', token);
  } else {
    localStorage.removeItem('moh_auth_token');
  }
}

export async function apiClient<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const token = getAuthToken();
  const headers = new Headers(options.headers || {});

  if (!headers.has('Content-Type') && !(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json; charset=utf-8');
  }
  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const url = endpoint.startsWith('http') ? endpoint : `${API_BASE}${endpoint.startsWith('/') ? '' : '/'}${endpoint}`;

  try {
    const res = await fetch(url, {
      ...options,
      headers,
    });

    // Handle 401 Unauthorized / Force Logout
    if (res.status === 401) {
      setAuthToken(null);
      // Dispatch global event so UI can trigger login modal or redirect
      window.dispatchEvent(new CustomEvent('moh:unauthorized'));
    }

    const contentType = res.headers.get('content-type') || '';
    let data: any = null;
    if (contentType.includes('application/json')) {
      data = await res.json();
    } else {
      data = await res.text();
    }

    if (!res.ok) {
      const errorMsg = data?.message || data?.error || `HTTP error ${res.status}`;
      const errorCode = data?.code;
      throw new ApiError(errorMsg, res.status, errorCode, data);
    }

    return data as T;
  } catch (err: any) {
    if (err instanceof ApiError) {
      throw err;
    }
    throw new ApiError(err?.message || 'Network error occurred', 0);
  }
}
