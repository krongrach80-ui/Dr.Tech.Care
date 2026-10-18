-- ============================================================================
-- DR.TECH.CARE: Initial Admin & Staff Bootstrap Guide
-- Purpose: Safely create the first Administrator with deterministic email mapping.
-- ============================================================================

/*
================================================================================
STEP 1: DETERMINISTIC USERNAME TO INTERNAL EMAIL MAPPING
================================================================================
Because anon users cannot query the profiles table under strict RLS,
username-to-email mapping is strictly deterministic across the entire system:

  email = lower(username) || '@' || <INTERNAL_AUTH_DOMAIN>

Rule:
  - Usernames must match: ^[a-z0-9._-]{3,32}$
  - <INTERNAL_AUTH_DOMAIN>: Must be specified by you (either a domain you own,
    or the RFC 2606 / 6761 reserved .invalid TLD, e.g. drtechcare.invalid,
    if your Supabase instance accepts it). Never use a domain owned by third parties!

Example:
  - 'admin' -> lower('admin') || '@' || '<INTERNAL_AUTH_DOMAIN>'

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
   - Email: lower('admin') || '@' || '<INTERNAL_AUTH_DOMAIN>'
   - Password: Choose a strong initial password
   - Auto Confirm User: CHECK the checkbox (no email confirmation needed)
   
3. Click "Create user".

4. Copy the generated User UID (UUID).

================================================================================
STEP 4: EXECUTE THE SQL BELOW IN SUPABASE SQL EDITOR
================================================================================
Replace placeholders with your values and run:
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
  '<REPLACE_WITH_AUTH_UID_FROM_STEP_3>'::uuid,
  'admin',
  '<ADMIN_FULL_NAME>',
  'admin',
  '<ADMIN_PHONE>',
  lower('admin') || '@' || '<INTERNAL_AUTH_DOMAIN>',
  NULL,
  true,
  false
)
ON CONFLICT (id) DO UPDATE SET
  username = 'admin',
  full_name = EXCLUDED.full_name,
  role = 'admin',
  phone = EXCLUDED.phone,
  email = EXCLUDED.email,
  is_active = true,
  deleted_at = NULL;

-- VERIFICATION
SELECT id, username, full_name, role, email, is_active 
FROM public.profiles 
WHERE role = 'admin';
