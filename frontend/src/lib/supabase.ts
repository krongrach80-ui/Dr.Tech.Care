/**
 * StrongCare - Supabase Client Singleton
 *
 * Configured via environment variables:
 * - VITE_SUPABASE_URL
 * - VITE_SUPABASE_ANON_KEY
 *
 * NOTE: Service role key is strictly forbidden in frontend client for security.
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';

const DEFAULT_SUPABASE_URL = 'https://gdsgsnklmrmnhniykxau.supabase.co';
const DEFAULT_SUPABASE_ANON_KEY = 'sb_publishable_gCepzZHsUT6wnJwhOiWKWA_q7M0AOkq';

const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL || DEFAULT_SUPABASE_URL).trim();
const supabaseAnonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY || DEFAULT_SUPABASE_ANON_KEY).trim();

/**
 * ตรวจสอบว่าได้กำหนด URL และ Anon Key ของ Supabase ถูกต้องหรือไม่
 */
export function isSupabaseConfigured(): boolean {
  if (!supabaseUrl || !supabaseAnonKey) return false;
  if (supabaseUrl.includes('your-project.supabase.co')) return false;
  if (supabaseAnonKey.includes('your-anon-key')) return false;
  return supabaseUrl.startsWith('http://') || supabaseUrl.startsWith('https://');
}

/**
 * Supabase Client Instance (Singleton)
 */
let clientInstance: SupabaseClient | null = null;

if (isSupabaseConfigured()) {
  try {
    clientInstance = createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        storageKey: 'strongcare_supabase_auth_token',
      },
      db: {
        schema: 'public',
      },
    });
    console.info('✓ Supabase Client initialized successfully with URL:', supabaseUrl);
  } catch (err) {
    console.error('Failed to initialize Supabase client:', err);
    clientInstance = null;
  }
} else {
  console.warn(
    '⚠️ Supabase is not yet configured. Please set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in your .env file to enable live database storage.'
  );
  // สร้าง dummy client สำหรับป้องกัน unhandled crash ตอนรัน offline / mock mode
  clientInstance = createClient(
    supabaseUrl || 'https://placeholder.supabase.co',
    supabaseAnonKey || 'placeholder-anon-key',
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    }
  );
}

export const supabase = clientInstance!;

/**
 * Shared Supabase Realtime channel name for Kiosk <-> Admin sync
 */
export const PATIENTS_REALTIME_CHANNEL = 'drtechcare_patients_channel';

export default supabase;
