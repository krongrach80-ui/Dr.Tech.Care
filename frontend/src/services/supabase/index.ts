/**
 * Centralized Supabase Service & Client Module
 * DrTech.Care Intelligent Physical Therapy System
 * 
 * Shared Single Source of Truth database service, realtime subscriptions,
 * storage buckets integration, and authentication handlers.
 */

export { supabase, isSupabaseConfigured, PATIENTS_REALTIME_CHANNEL } from '../../lib/supabase';
export { supabaseService } from '../supabaseService';
