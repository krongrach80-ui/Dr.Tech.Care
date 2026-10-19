-- ============================================================================
-- DR.TECH.CARE: Initial Admin & Staff Bootstrap Guide
-- Purpose: Safely create the first Administrator with deterministic email mapping.
-- WARNING: NEVER execute legacy init_all.sql or schema.sql on staging or production.
--          Those legacy files seed test accounts with plaintext password '1234'.
--          Always use official timestamped migrations and Supabase Auth.
-- ============================================================================

/*
================================================================================
STEP 1: DETERMINISTIC USERNAME TO INTERNAL EMAIL MAPPING
================================================================================
Because anon users cannot query the profiles table under strict RLS,
username-to-email mapping is strictly deterministic across the entire system:

  email = lower(username) || '@' || 'drtechcare.invalid'

Rules:
  - Usernames must match: ^[a-z0-9._-]{3,32}$
  - INTERNAL_AUTH_DOMAIN: Configured as 'drtechcare.invalid' (RFC 2606 / 6761 reserved .invalid TLD).
    Supabase Auth uses this domain for non-public internal accounts.
  - NOTE: drtechcare.invalid must be verified on staging first. Supabase Auth may reject it
    depending on email provider validation settings. If rejected, INTERNAL_AUTH_DOMAIN
    must be changed in ONE central place and stay identical across bootstrap, Edge Functions,
    and frontend login mapping.

Example:
  - 'admin' -> 'admin@drtechcare.invalid'
  - 'pt_somchai' -> 'pt_somchai@drtechcare.invalid'

================================================================================
STEP 2: SUPABASE AUTH CONFIGURATION (SECURITY LOCKDOWN)
================================================================================
1. Disable Public Sign-ups:
   - Supabase Dashboard -> Authentication -> Providers -> Email
   - Uncheck "Enable Signup".
   - Only admins and therapists created via server-side admin functions may exist.
   - Patients NEVER have Supabase Auth accounts (Face-only kiosk authentication).

2. Disable Public Password Resets:
   - Password resets are handled exclusively via the `admin-reset-password`
     Edge Function which enforces caller verification and writes to audit_logs.

================================================================================
STEP 3: CREATE THE FIRST ADMIN USER IN SUPABASE DASHBOARD
================================================================================
1. Open your Supabase Project Dashboard:
   https://supabase.com/dashboard/project/_/auth/users

2. Click "Add user" -> "Create user":
   - Email: admin@drtechcare.invalid
   - Password: Choose a strong initial password
   - Auto Confirm User: CHECK the checkbox (no email confirmation needed)
   
3. Click "Create user".

4. Copy the generated User UID (UUID).

================================================================================
STEP 4: EXECUTE THE SQL BELOW IN SUPABASE SQL EDITOR
================================================================================
Replace '<REPLACE_WITH_AUTH_UID_FROM_STEP_3>' with the UUID from Step 3 and run:
*/

-- 4.1 PRE-FLIGHT CHECK: Prevent silent overwrite if username 'admin' belongs to another ID
DO $$
DECLARE
  v_conflict_id uuid;
  v_target_id uuid := '<REPLACE_WITH_AUTH_UID_FROM_STEP_3>'::uuid;
BEGIN
  SELECT id INTO v_conflict_id 
  FROM public.profiles 
  WHERE username = 'admin' AND id != v_target_id;

  IF FOUND THEN
    RAISE EXCEPTION 'A profile with username "admin" already exists with a different ID (%). Please reconcile or deactivate the conflicting profile first.', v_conflict_id;
  END IF;
END $$;

-- 4.2 INSERT OR UPDATE ADMIN PROFILE
-- must_change_password defaults to TRUE for mandatory password rotation on first login.
-- Only set to false if the operator is the permanent administrator with a verified strong password.
INSERT INTO public.profiles (
  id,
  username,
  full_name,
  role,
  phone,
  email,
  avatar_url,
  is_active,
  must_change_password
)
VALUES (
  '<REPLACE_WITH_AUTH_UID_FROM_STEP_3>'::uuid,
  'admin',
  'Hospital Administrator',
  'admin',
  '081-000-0000',
  'admin@drtechcare.invalid',
  NULL,
  true,
  true
)
ON CONFLICT (id) DO UPDATE SET
  username = 'admin',
  full_name = EXCLUDED.full_name,
  role = 'admin',
  phone = EXCLUDED.phone,
  email = 'admin@drtechcare.invalid',
  is_active = true,
  must_change_password = EXCLUDED.must_change_password,
  deleted_at = NULL;

-- 4.3 VERIFICATION OF CREATED ADMIN
SELECT id, username, full_name, role, email, is_active, must_change_password 
FROM public.profiles 
WHERE role = 'admin';

-- ================================================================================
-- INSECURE LEGACY TEST ACCOUNTS AUDIT (from init_all.sql / seed.sql)
-- ================================================================================
-- The following accounts were historically seeded with weak default passwords ('1234'):
--   - 'admin' (director@strongcare.hospital)
--   - 'pt_thanakorn' (thanakorn.w@strongcare.hospital)
--   - 'pt_pimchanok' (pimchanok.s@strongcare.hospital)
--
-- RUN THIS QUERY IN PRODUCTION TO AUDIT THEIR STATUS:
SELECT id, username, full_name, role, email, is_active, created_at
FROM public.profiles
WHERE username IN ('admin', 'pt_thanakorn', 'pt_pimchanok')
ORDER BY username;

-- OPERATOR ACTION:
-- If any of these legacy profiles exist on production, verify their auth identity
-- and deactivate (is_active = false) or reset their credentials immediately.
-- Do NOT auto-delete them to avoid breaking clinical FK references.
