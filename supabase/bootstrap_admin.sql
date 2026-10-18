-- ============================================================================
-- DR.TECH.CARE: Initial Admin & Staff Bootstrap Guide
-- Purpose: Safely create the first Administrator without hardcoded fallback credentials.
-- ============================================================================

/*
================================================================================
STEP 1: USERNAME TO INTERNAL EMAIL MAPPING RULE
================================================================================
In Dr.Tech.Care, staff (Admin and Therapists) log in using their Username or Email.
When a username is entered without an '@', the system maps it to an internal email:

  Format: <username>@strongcare.hospital

Examples:
  - 'admin'         -> 'admin@strongcare.hospital' (or 'director@strongcare.hospital')
  - 'pt_thanakorn'  -> 'thanakorn.w@strongcare.hospital'
  - 'pt_pimchanok'  -> 'pimchanok.s@strongcare.hospital'
  - 'pt_waranyoo'   -> 'waranyoo.r@strongcare.hospital'
  - 'pjj'           -> 'pjj@drtechcare.hospital'

================================================================================
STEP 2: CREATE THE FIRST ADMIN USER IN SUPABASE DASHBOARD
================================================================================
1. Open your Supabase Project Dashboard:
   https://supabase.com/dashboard/project/_/auth/users

2. Click "Add user" -> "Create user":
   - Email: director@strongcare.hospital (or admin@strongcare.hospital)
   - Password: Choose a strong temporary or permanent password
   - Auto Confirm User: CHECK the checkbox (so no email verification link is required)
   
3. Click "Create user".

4. Copy the generated User UID (e.g. 12345678-abcd-1234-abcd-1234567890ab).

================================================================================
STEP 3: EXECUTE THE SQL BELOW IN SUPABASE SQL EDITOR
================================================================================
Replace '<REPLACE_WITH_AUTH_UID_FROM_STEP_2>' with the copied UID and run:
*/

-- INSERT OR UPDATE ADMIN PROFILE
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
  '<REPLACE_WITH_AUTH_UID_FROM_STEP_2>'::uuid,
  'admin',
  'นพ. วรชัย อมรเวช (ผู้อำนวยการ รพ.)',
  'admin',
  '02-555-0199',
  'director@strongcare.hospital',
  NULL,
  true,
  false
)
ON CONFLICT (id) DO UPDATE SET
  username = 'admin',
  full_name = EXCLUDED.full_name,
  role = 'admin',
  is_active = true,
  deleted_at = NULL;

-- VERIFICATION
SELECT id, username, full_name, role, email, is_active 
FROM public.profiles 
WHERE role = 'admin';
