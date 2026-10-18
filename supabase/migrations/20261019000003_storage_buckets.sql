-- ============================================================================
-- DR.TECH.CARE: Phase 1 - Migration 3: Storage Buckets & Policies
-- Buckets: avatars (PRIVATE), biometric-data (PRIVATE), exercise-media (public)
-- CRITICAL SECURITY RULE: biometric-data has ZERO client-facing storage policies.
-- Only Edge Functions (service role) read or write biometric-data.
-- ============================================================================

-- 1. Create Buckets
-- avatars is made PRIVATE to protect patient photo privacy.
-- biometric-data is strictly PRIVATE with NO client-facing policies.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES 
  ('avatars', 'avatars', false, 5242880, ARRAY['image/jpeg', 'image/png', 'image/webp']),
  ('biometric-data', 'biometric-data', false, 10485760, ARRAY['image/jpeg', 'image/png']),
  ('exercise-media', 'exercise-media', true, 52428800, ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml', 'video/mp4', 'video/webm'])
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- 2. Dynamically Drop Legacy Policies on storage.objects for our Buckets
DO $$
DECLARE
  pol RECORD;
BEGIN
  FOR pol IN (
    SELECT schemaname, tablename, policyname 
    FROM pg_policies 
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND (
        policyname ILIKE '%avatar%' 
        OR policyname ILIKE '%biometric%' 
        OR policyname ILIKE '%exercise%'
        OR qual ILIKE '%avatars%'
        OR qual ILIKE '%biometric-data%'
        OR qual ILIKE '%exercise-media%'
        OR with_check ILIKE '%avatars%'
        OR with_check ILIKE '%biometric-data%'
        OR with_check ILIKE '%exercise-media%'
      )
  ) LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I', pol.policyname, pol.schemaname, pol.tablename);
  END LOOP;
END $$;

-- 3. Storage Policies on storage.objects

-- AVATARS (Private Bucket: Authenticated Staff Read via Signed URLs / Staff Session, Staff Write)
CREATE POLICY "avatars_staff_select" ON storage.objects
FOR SELECT TO authenticated
USING (
  bucket_id = 'avatars'
  AND public.current_app_role() IN ('admin', 'therapist')
);

CREATE POLICY "avatars_staff_insert" ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'avatars'
  AND public.current_app_role() IN ('admin', 'therapist')
);

CREATE POLICY "avatars_staff_update" ON storage.objects
FOR UPDATE TO authenticated
USING (
  bucket_id = 'avatars'
  AND public.current_app_role() IN ('admin', 'therapist')
);

CREATE POLICY "avatars_admin_delete" ON storage.objects
FOR DELETE TO authenticated
USING (
  bucket_id = 'avatars'
  AND public.is_admin()
);

-- BIOMETRIC DATA (Strictly Private - ZERO Client-Facing Policies)
-- NOTE: Absolutely NO storage policies are created for 'biometric-data'.
-- Direct client access (anon and authenticated) is default-denied by RLS.
-- Only Edge Functions using Supabase service_role key read/write this bucket.

-- EXERCISE MEDIA (Public Read, Staff Write)
CREATE POLICY "exercise_media_public_select" ON storage.objects
FOR SELECT TO public
USING (bucket_id = 'exercise-media');

CREATE POLICY "exercise_media_staff_insert" ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'exercise-media' 
  AND public.current_app_role() IN ('admin', 'therapist')
);

CREATE POLICY "exercise_media_staff_update" ON storage.objects
FOR UPDATE TO authenticated
USING (
  bucket_id = 'exercise-media' 
  AND public.current_app_role() IN ('admin', 'therapist')
);

CREATE POLICY "exercise_media_admin_delete" ON storage.objects
FOR DELETE TO authenticated
USING (
  bucket_id = 'exercise-media' 
  AND public.is_admin()
);

-- ============================================================================
-- 4. AUDIT ASSERTION: ZERO OPEN POLICIES ON storage.objects
-- Raises an exception if any policy on storage.objects has qual or with_check = 'true'.
-- ============================================================================

DO $$
DECLARE
  bad_pol RECORD;
BEGIN
  SELECT schemaname, tablename, policyname, qual, with_check
  INTO bad_pol
  FROM pg_policies
  WHERE schemaname = 'storage' AND tablename = 'objects'
    AND (
      trim(qual) = 'true' 
      OR trim(with_check) = 'true'
      OR qual = '(true)'
      OR with_check = '(true)'
    )
  LIMIT 1;

  IF FOUND THEN
    RAISE EXCEPTION 'SECURITY AUDIT FAILED: Open storage policy found: % on storage.objects (qual: %, with_check: %)',
      bad_pol.policyname, bad_pol.qual, bad_pol.with_check;
  END IF;

  RAISE NOTICE 'SECURITY AUDIT PASSED: Zero open policies on storage.objects.';
END $$;
