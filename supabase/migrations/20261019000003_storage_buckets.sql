-- ============================================================================
-- DR.TECH.CARE: Phase 1 - Migration 3: Storage Buckets & Policies
-- Buckets: avatars (public), biometric-data (PRIVATE), exercise-media (public)
-- ============================================================================

-- 1. Create Buckets
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES 
  ('avatars', 'avatars', true, 5242880, ARRAY['image/jpeg', 'image/png', 'image/webp']),
  ('biometric-data', 'biometric-data', false, 10485760, ARRAY['image/jpeg', 'image/png']),
  ('exercise-media', 'exercise-media', true, 52428800, ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml', 'video/mp4', 'video/webm'])
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- 2. Storage Policies on storage.objects

-- AVATARS (Public Read, Authenticated Write)
DROP POLICY IF EXISTS "avatars_public_select" ON storage.objects;
CREATE POLICY "avatars_public_select" ON storage.objects
FOR SELECT TO public
USING (bucket_id = 'avatars');

DROP POLICY IF EXISTS "avatars_staff_insert" ON storage.objects;
CREATE POLICY "avatars_staff_insert" ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'avatars');

DROP POLICY IF EXISTS "avatars_staff_update" ON storage.objects;
CREATE POLICY "avatars_staff_update" ON storage.objects
FOR UPDATE TO authenticated
USING (bucket_id = 'avatars');

-- BIOMETRIC DATA (Strictly Private - NO Public URL)
-- Only authenticated staff can read/write; anon has zero access.
DROP POLICY IF EXISTS "biometric_data_deny_anon" ON storage.objects;
DROP POLICY IF EXISTS "biometric_data_staff_select" ON storage.objects;
CREATE POLICY "biometric_data_staff_select" ON storage.objects
FOR SELECT TO authenticated
USING (
  bucket_id = 'biometric-data' 
  AND public.current_app_role() IN ('admin', 'therapist')
);

DROP POLICY IF EXISTS "biometric_data_staff_insert" ON storage.objects;
CREATE POLICY "biometric_data_staff_insert" ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'biometric-data' 
  AND public.current_app_role() IN ('admin', 'therapist')
);

DROP POLICY IF EXISTS "biometric_data_admin_delete" ON storage.objects;
CREATE POLICY "biometric_data_admin_delete" ON storage.objects
FOR DELETE TO authenticated
USING (
  bucket_id = 'biometric-data' 
  AND public.is_admin()
);

-- EXERCISE MEDIA (Public Read, Staff Write)
DROP POLICY IF EXISTS "exercise_media_public_select" ON storage.objects;
CREATE POLICY "exercise_media_public_select" ON storage.objects
FOR SELECT TO public
USING (bucket_id = 'exercise-media');

DROP POLICY IF EXISTS "exercise_media_staff_insert" ON storage.objects;
CREATE POLICY "exercise_media_staff_insert" ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'exercise-media' 
  AND public.current_app_role() IN ('admin', 'therapist')
);

DROP POLICY IF EXISTS "exercise_media_staff_update" ON storage.objects;
CREATE POLICY "exercise_media_staff_update" ON storage.objects
FOR UPDATE TO authenticated
USING (
  bucket_id = 'exercise-media' 
  AND public.current_app_role() IN ('admin', 'therapist')
);
