# DR.TECH.CARE — Staging Deployment & Execution Runbook

This runbook documents the exact procedures, execution order, commands, and expected outputs for validating the DR.TECH.CARE database schema, security policies, and edge functions on a Supabase staging instance.

---

## 1. Prerequisites & Environment Setup

### 1.1 Staging Environment Variables (`.env.staging`)
Create an untracked `.env.staging` file in the repository root (strictly git-ignored):

```ini
# Environment Target Guard (Mandatory: must equal 'staging')
TARGET_ENV="staging"

# Staging Database Direct Connection String
# Port 5432 is direct PostgreSQL; Port 6543 is transaction pooler
STAGING_DB_URL="postgresql://postgres:[YOUR-STAGING-PASSWORD]@db.[YOUR-STAGING-REF].supabase.co:5432/postgres"

# Supabase API Endpoints & Keys
STAGING_SUPABASE_URL="https://[YOUR-STAGING-REF].supabase.co"
STAGING_ANON_KEY="[YOUR-STAGING-ANON-KEY]"
STAGING_SERVICE_ROLE_KEY="[YOUR-STAGING-SERVICE-ROLE-KEY]"
STAGING_PROJECT_REF="[YOUR-STAGING-REF]"

# Supabase Management Token (For Edge Function deployments & CLI commands)
SUPABASE_ACCESS_TOKEN="[YOUR-SUPABASE-PERSONAL-ACCESS-TOKEN]"

# Production Host Guard (Ensures scripts refuse if pointing to prod)
PRODUCTION_DB_HOST="db.prod-placeholder.supabase.co"
```

### 1.2 Required Supabase Extensions
Ensure the following extensions are enabled on your Supabase staging project (**Project Settings -> Database -> Extensions** or SQL editor):
1. `pgcrypto` (Core cryptographic functions)
2. `uuid-ossp` (UUID generation helpers)
3. `vector` (`pgvector`, required for 128-dim face embeddings)
4. `pg_cron` (Automated nightly appointment rollover at 00:05 Asia/Bangkok / 17:05 UTC)

---

## 2. Phase 0: Database Closeout Execution Order

All commands are executed from the repository root using the built-in runner `scripts/run-sql.mjs`.

### Step 1: Seed Legacy Baseline Fixture
Simulates a pre-existing legacy database state (pre-migration schema and synthetic records):
```powershell
node scripts/run-sql.mjs --i-know-this-is-staging supabase/tests/legacy_baseline.sql
```
**Expected Output:**
- `✓ Connected successfully to database.`
- `✓ Session setting set: app.allow_destructive_baseline = 'yes'`
- `Safety check passed: app.allow_destructive_baseline is set to "yes". Proceeding with legacy baseline setup.`
- `✓ Completed: supabase/tests/legacy_baseline.sql in <N>s`

---

### Step 2: Execute All Migrations (First Run)
Applies core schema, migrations 1 to 4, column permissions, triggers, and minigame convergence:
```powershell
node scripts/run-sql.mjs supabase/all_migrations.sql
```
**Expected Output:**
- `✓ Completed: supabase/all_migrations.sql in <N>s`
- `MIGRATION ASSERTION PASSED: All structural constraints, non-null guarantees, and soft-delete foreign keys verified.`
- `SECURITY AUDIT PASSED: All public tables have RLS enabled, zero open policies detected.`

---

### Step 3: Re-Execute All Migrations (Strict Idempotency Verification)
Proves that re-running all migrations on an already-migrated database executes cleanly with zero errors, zero duplicate constraints, and zero data loss:
```powershell
node scripts/run-sql.mjs supabase/all_migrations.sql
```
**Expected Output:**
- `✓ Completed: supabase/all_migrations.sql in <N>s`
- Zero errors, identical database state.

---

### Step 4: Run Staging Extras & Role-Matrix Test Suite
Applies development fixtures and executes the complete 16-case real-table RLS test suite:
```powershell
node scripts/run-sql.mjs supabase/dev_extras.sql
```
**Expected Output:**
- `>>> STARTING DR.TECH.CARE PHASE 1 REAL-TABLE RLS TEST SUITE <<<`
- `[PASS] Case 1: Anon role blocked from reading/writing patients.`
- `[PASS] Case 2: Authenticated therapist blocked from viewing inactive staff profiles.`
- `[PASS] Case 3: Assigned therapist can read/update clinical fields; stranger blocked.`
- `[PASS] Case 4: Temporary coverage delegation grant verified.`
- `[PASS] Case 5: Routine items write permissions verified.`
- `[PASS] Case 6: Append-only medical notes immutability verified.`
- `[PASS] Case 7: Append-only audit logs immutability verified.`
- `[PASS] Case 8: Pose exercise lock guard verified.`
- `[PASS] Case 9: Patient sensitive update trigger verified.`
- `[PASS] Case 10: Mini-game MG- code creation guard verified.`
- `[PASS] Case 11: Temporary coverages trigger validations strictly enforced.`
- `[PASS] Case 12: Trusted context (service_role) successfully exempt from client guards.`
- `[PASS] Case 13: All tables in schema public verified to have relrowsecurity = true.`
- `[PASS] Case 14: Anon context is strictly untrusted and rejected by patient sensitive update guard.`
- `[PASS] Case 15: Hard deletion of patients is strictly blocked for authenticated clients.`
- `[PASS] Case 16: Timezone boundary test passed (00:30 Bangkok strictly distinguishes hospital today vs yesterday).`
- `>>> ALL 16 ROLE-MATRIX & REAL-TABLE TESTS PASSED (100%) <<<`

---

### Step 5: Clean Database Verification (Empty Project Test)
To verify that `all_migrations.sql` runs standalone on a completely fresh Supabase project without legacy baseline:
```powershell
node scripts/run-sql.mjs supabase/all_migrations.sql
```
**Expected Output:**
- 100% clean schema creation from scratch.

---

## 3. Post-Migration Verification Queries (Item 0.2 Verification)

Run the following SQL query in the Supabase SQL Editor or via a verification script:

```sql
SELECT 
  -- 1. Patients Verification
  (SELECT count(*) FROM public.patients) AS patients_total,
  (SELECT count(*) FROM public.patients WHERE treatment_status = 'discharged') AS patients_discharged,
  (SELECT count(*) FROM public.patients WHERE face_registered = true) AS patients_face_registered,
  
  -- 2. Medical Notes Verification
  (SELECT count(*) FROM public.medical_notes) AS medical_notes_total,
  (SELECT count(*) FROM public.medical_notes WHERE note_type = 'progress') AS notes_progress,
  (SELECT count(*) FROM public.medical_notes WHERE note_type = 'pt_advice') AS notes_pt_advice,
  (SELECT count(*) FROM public.medical_notes WHERE note_type = 'outcome_rom') AS notes_outcome_rom,

  -- 3. Session Logs Verification
  (SELECT count(*) FROM public.session_logs) AS session_logs_total,
  (SELECT count(*) FROM public.session_logs WHERE correct_reps > 0) AS sessions_correct_gt_0,
  (SELECT count(*) FROM public.session_logs WHERE score > 0) AS sessions_score_gt_0,

  -- 4. Audit Logs Verification
  (SELECT count(*) FROM public.audit_logs WHERE action = 'LEGACY_LOGIN') AS audit_legacy_login,

  -- 5. Temporary Coverages Verification
  (SELECT count(*) FROM public.temporary_coverages) AS coverages_total,
  (SELECT count(*) FROM public.temporary_coverages WHERE owner_therapist_id IS NOT NULL) AS coverages_with_owner,
  (SELECT count(*) FROM public.temporary_coverages WHERE status = 'active') AS coverages_active,

  -- 6. Minigames Verification
  (SELECT count(*) FROM public.exercises WHERE is_minigame = true AND code IN ('MG-01', 'MG-02', 'MG-03')) AS minigames_count;
```

### Exact Expected Counts Matrix:
| Entity / Condition | Expected Count |
| :--- | :--- |
| `patients_total` | **2** |
| `patients_discharged` | **1** |
| `patients_face_registered` | **1** |
| `medical_notes_total` | **5** |
| `notes_progress` | **1** |
| `notes_pt_advice` | **2** |
| `notes_outcome_rom` | **2** |
| `session_logs_total` | **2** |
| `sessions_correct_gt_0` | **1** |
| `sessions_score_gt_0` | **2** |
| `audit_legacy_login` | **1** |
| `coverages_total` | **1** |
| `coverages_with_owner` | **1** |
| `coverages_active` | **1** |
| `minigames_count` | **3** (MG-01, MG-02, MG-03 each unique) |

---

## 4. Edge Functions Deployment & Verification

Deploy Edge Functions to staging using Supabase CLI with `--use-api`:
```powershell
npx supabase functions deploy --project-ref $env:STAGING_PROJECT_REF --use-api
```

Test function health and RLS enforcement over HTTP:
```powershell
curl -i -X POST "$env:STAGING_SUPABASE_URL/functions/v1/kiosk-get-routine" \
  -H "apikey: $env:STAGING_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{"kiosk_token": "invalid_or_expired"}'
```
Expected HTTP Status: `401 Unauthorized` or `403 Forbidden`.
