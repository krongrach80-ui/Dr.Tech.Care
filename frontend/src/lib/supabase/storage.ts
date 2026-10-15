/**
 * DrTech.Care - Centralized Supabase Storage Service
 * 
 * Strict User Data Isolation & Storage Organization:
 * 
 * 1. Bucket: avatars (Public / Authenticated Read)
 *    Path Rule: /{role}/{user_id}/avatar.jpg
 *    Example: /patient/P-1785/avatar.jpg or /pt/T-001/avatar.png
 * 
 * 2. Bucket: biometric-data (Strictly Private / RLS Protected)
 *    Path Rule: /{role}/{user_id}/face_frames/frame_{1_to_10}.jpg
 *    Example: /patient/P-1785/face_frames/frame_1.jpg
 * 
 * 3. Bucket: exercise-media (Public)
 *    Path Rule: /{category}/{item_id}/media_file.ext
 *    Example: /mini-games/MG-01/cover_image.png or /poses/under_development_placeholder.jpg
 */

import { supabase, isSupabaseConfigured } from '../supabase';

export type UserRoleFolder = 'patient' | 'pt' | 'admin';

export const STORAGE_BUCKETS = {
  AVATARS: 'avatars',
  BIOMETRIC_DATA: 'biometric-data',
  EXERCISE_MEDIA: 'exercise-media',
} as const;

export class SupabaseStorageService {
  // =========================================================================
  // PATH GENERATORS (STRICT FORMAT ENFORCEMENT)
  // =========================================================================

  /**
   * Generates strict avatar storage path: /{role}/{user_id}/avatar.{ext}
   */
  static getAvatarPath(role: UserRoleFolder, userId: string | number, ext: string = 'jpg'): string {
    const cleanRole = role.toLowerCase().trim();
    const cleanUserId = String(userId).replace(/[^a-zA-Z0-9_-]/g, '_');
    const cleanExt = ext.replace(/^\./, '').toLowerCase() || 'jpg';
    return `${cleanRole}/${cleanUserId}/avatar.${cleanExt}`;
  }

  /**
   * Generates strict biometric face frame storage path: /{role}/{user_id}/face_frames/frame_{1_to_10}.jpg
   */
  static getFaceFramePath(role: UserRoleFolder, userId: string | number, frameIndex: number): string {
    const cleanRole = role.toLowerCase().trim();
    const cleanUserId = String(userId).replace(/[^a-zA-Z0-9_-]/g, '_');
    const clampedIndex = Math.min(10, Math.max(1, Math.floor(frameIndex)));
    return `${cleanRole}/${cleanUserId}/face_frames/frame_${clampedIndex}.jpg`;
  }

  /**
   * Generates strict exercise media path: /{category}/{item_id}/{filename}
   */
  static getExerciseMediaPath(category: string, itemId: string | number, filename: string): string {
    const cleanCategory = (category || 'general').toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9_-]/g, '');
    const cleanItemId = String(itemId).replace(/[^a-zA-Z0-9_-]/g, '_');
    const cleanFilename = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
    return `${cleanCategory}/${cleanItemId}/${cleanFilename}`;
  }

  // =========================================================================
  // STORAGE OPERATORS
  // =========================================================================

  /**
   * Upload user avatar with strict path: /{role}/{user_id}/avatar.jpg
   */
  static async uploadAvatar(
    role: UserRoleFolder,
    userId: string | number,
    fileBlob: Blob | File,
    ext: string = 'jpg'
  ): Promise<{ success: boolean; path?: string; publicUrl?: string; error?: string }> {
    if (!isSupabaseConfigured()) {
      return { success: true, path: `local://${role}/${userId}/avatar.${ext}` };
    }

    try {
      const storagePath = this.getAvatarPath(role, userId, ext);
      const { data, error } = await supabase.storage
        .from(STORAGE_BUCKETS.AVATARS)
        .upload(storagePath, fileBlob, {
          cacheControl: '3600',
          upsert: true,
          contentType: ext === 'png' ? 'image/png' : 'image/jpeg',
        });

      if (error) {
        console.warn('[STORAGE] uploadAvatar error:', error.message);
        return { success: false, error: error.message };
      }

      const { data: publicUrlData } = supabase.storage
        .from(STORAGE_BUCKETS.AVATARS)
        .getPublicUrl(storagePath);

      return {
        success: true,
        path: data.path,
        publicUrl: publicUrlData.publicUrl,
      };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  /**
   * Upload isolated biometric frame (frame 1-10) to private bucket:
   * /{role}/{user_id}/face_frames/frame_{frameIndex}.jpg
   */
  static async uploadBiometricFaceFrame(
    role: UserRoleFolder,
    userId: string | number,
    frameIndex: number,
    imageBlobOrBase64: Blob | string
  ): Promise<{ success: boolean; path?: string; error?: string }> {
    if (!isSupabaseConfigured()) {
      return { success: true, path: `local://${role}/${userId}/face_frames/frame_${frameIndex}.jpg` };
    }

    try {
      let fileData: Blob;
      if (typeof imageBlobOrBase64 === 'string') {
        const res = await fetch(imageBlobOrBase64);
        fileData = await res.blob();
      } else {
        fileData = imageBlobOrBase64;
      }

      const storagePath = this.getFaceFramePath(role, userId, frameIndex);
      const { data, error } = await supabase.storage
        .from(STORAGE_BUCKETS.BIOMETRIC_DATA)
        .upload(storagePath, fileData, {
          cacheControl: '86400',
          upsert: true,
          contentType: 'image/jpeg',
        });

      if (error) {
        console.warn(`[STORAGE] uploadBiometricFaceFrame frame_${frameIndex} error:`, error.message);
        return { success: false, error: error.message };
      }

      return { success: true, path: data.path };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  /**
   * Upload exercise / mini-game media to public bucket:
   * /{category}/{item_id}/{filename}
   */
  static async uploadExerciseMedia(
    category: string,
    itemId: string | number,
    filename: string,
    fileBlob: Blob | File
  ): Promise<{ success: boolean; path?: string; publicUrl?: string; error?: string }> {
    if (!isSupabaseConfigured()) {
      return { success: true, path: `local://${category}/${itemId}/${filename}` };
    }

    try {
      const storagePath = this.getExerciseMediaPath(category, itemId, filename);
      const { data, error } = await supabase.storage
        .from(STORAGE_BUCKETS.EXERCISE_MEDIA)
        .upload(storagePath, fileBlob, {
          cacheControl: '86400',
          upsert: true,
        });

      if (error) {
        return { success: false, error: error.message };
      }

      const { data: publicUrlData } = supabase.storage
        .from(STORAGE_BUCKETS.EXERCISE_MEDIA)
        .getPublicUrl(storagePath);

      return {
        success: true,
        path: data.path,
        publicUrl: publicUrlData.publicUrl,
      };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  /**
   * Retrieves signed URL for strictly private biometric data
   */
  static async getBiometricSignedUrl(
    role: UserRoleFolder,
    userId: string | number,
    frameIndex: number,
    expiresInSec: number = 300
  ): Promise<string | null> {
    if (!isSupabaseConfigured()) return null;
    try {
      const storagePath = this.getFaceFramePath(role, userId, frameIndex);
      const { data, error } = await supabase.storage
        .from(STORAGE_BUCKETS.BIOMETRIC_DATA)
        .createSignedUrl(storagePath, expiresInSec);

      if (error || !data) return null;
      return data.signedUrl;
    } catch {
      return null;
    }
  }
}
