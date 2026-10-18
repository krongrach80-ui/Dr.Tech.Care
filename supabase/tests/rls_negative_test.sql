-- ============================================================================
-- DR.TECH.CARE: Phase 1 - Comprehensive Role-Matrix & Real-Table RLS Test Suite
-- Wrapped entirely in BEGIN ... ROLLBACK to leave zero persistent test residue.
-- Tests simulate: anon, admin, therapist (own patient), unrelated PT, covered PT.
-- Exercises real SELECT, INSERT, UPDATE, DELETE on real physical tables:
--   auth.users, profiles, patients, appointments, routine_items, audit_logs,
--   exercises, face_templates, storage.objects.
-- Asserts row counts via GET DIAGNOSTICS (0 rows) or specific SQLSTATE (42501 / P0001).
-- ============================================================================

BEGIN;

DO $$
DECLARE
  -- Predefined Test Actors
  v_admin_id        uuid := 'a0000000-0000-0000-0000-000000000001';
  v_pt1_owner_id    uuid := 'b0000000-0000-0000-0000-000000000002';
  v_pt2_cover_id    uuid := 'b0000000-0000-0000-0000-000000000003';
  v_pt3_stranger_id uuid := 'b0000000-0000-0000-0000-000000000004';
  
  -- Predefined Test Entities
  v_patient1_id     uuid := 'c0000000-0000-0000-0000-000000000001';
  v_patient2_id     uuid := 'c0000000-0000-0000-0000-000000000002';
  v_admin_ex_id     uuid := 'd0000000-0000-0000-0000-000000000001';
  v_pt1_ex_id       uuid := 'd0000000-0000-0000-0000-000000000002';
  v_mg1_ex_id       uuid;
  v_ex1_ex_id       uuid;
  v_cov_active_id   uuid := 'e0000000-0000-0000-0000-000000000001';
  
  v_bangkok_today   date := (timezone('Asia/Bangkok', now()))::date;
  v_count           int;
  v_rows            int;
  v_error_caught    boolean;
  v_temp_id         uuid;
  v_test_appt_id    uuid;
BEGIN
  RAISE NOTICE '====================================================================';
  RAISE NOTICE '>>> STARTING DR.TECH.CARE PHASE 1 REAL-TABLE RLS TEST SUITE <<<';
  RAISE NOTICE '====================================================================';

  -- --------------------------------------------------------------------------
  -- STEP 0: FIXTURE SETUP (Executed as session user / superuser)
  -- --------------------------------------------------------------------------
  
  -- 0a. Insert auth.users fixtures first to satisfy profiles.id foreign key constraint
  -- Entire suite is wrapped in BEGIN ... ROLLBACK so these rows NEVER persist.
  INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  VALUES 
    (v_admin_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'admin@test.invalid', 'dummy_hash', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
    (v_pt1_owner_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'pt1@test.invalid', 'dummy_hash', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
    (v_pt2_cover_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'pt2@test.invalid', 'dummy_hash', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
    (v_pt3_stranger_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'pt3@test.invalid', 'dummy_hash', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now())
  ON CONFLICT (id) DO NOTHING;

  -- 0b. Profiles fixtures
  INSERT INTO public.profiles (id, username, full_name, role, email, is_active)
  VALUES 
    (v_admin_id, 'test_admin', 'Admin Superuser', 'admin', 'admin@test.invalid', true),
    (v_pt1_owner_id, 'test_pt1', 'PT 1 Owner', 'therapist', 'pt1@test.invalid', true),
    (v_pt2_cover_id, 'test_pt2', 'PT 2 Cover', 'therapist', 'pt2@test.invalid', true),
    (v_pt3_stranger_id, 'test_pt3', 'PT 3 Stranger', 'therapist', 'pt3@test.invalid', true)
  ON CONFLICT (id) DO UPDATE SET 
    role = EXCLUDED.role, is_active = true, deleted_at = NULL;

  -- 0c. Patients fixtures (Patient 1 assigned to PT 1; Patient 2 assigned to PT 2)
  -- Note: Patients have NO profile row in public.profiles.
  INSERT INTO public.patients (id, hn, full_name, assigned_therapist_id, treatment_status)
  VALUES 
    (v_patient1_id, 'HN-TEST-001', 'Test Patient 1 (PT1 Caseload)', v_pt1_owner_id, 'active'),
    (v_patient2_id, 'HN-TEST-002', 'Test Patient 2 (PT2 Caseload)', v_pt2_cover_id, 'active')
  ON CONFLICT (id) DO UPDATE SET 
    assigned_therapist_id = EXCLUDED.assigned_therapist_id;

  -- 0d. Exercises fixtures
  INSERT INTO public.exercises (id, code, name_th, category, kind, is_minigame, created_by)
  VALUES 
    (v_admin_ex_id, 'EX-ADM-01', 'Admin Core Exercise', 'Core', 'single', false, v_admin_id),
    (v_pt1_ex_id, 'EX-PT1-01', 'PT1 Custom Exercise', 'Custom', 'single', false, v_pt1_owner_id)
  ON CONFLICT (id) DO UPDATE SET 
    created_by = EXCLUDED.created_by, category = EXCLUDED.category;

  -- Query seed mini-game MG-01 (is_minigame = true) and seed exercise EX-01 (is_minigame = false)
  SELECT id INTO v_mg1_ex_id FROM public.exercises WHERE code = 'MG-01' LIMIT 1;
  IF v_mg1_ex_id IS NULL THEN
    INSERT INTO public.exercises (code, slug, name_th, is_minigame)
    VALUES ('MG-01', 'mg-balloon-pop', 'Balloon Pop', true)
    RETURNING id INTO v_mg1_ex_id;
  END IF;

  SELECT id INTO v_ex1_ex_id FROM public.exercises WHERE code = 'EX-01' LIMIT 1;
  IF v_ex1_ex_id IS NULL THEN
    INSERT INTO public.exercises (code, slug, name_th, is_minigame)
    VALUES ('EX-01', 'ex-shoulder-abduction', 'Shoulder Abduction', false)
    RETURNING id INTO v_ex1_ex_id;
  END IF;

  -- 0e. Temporary Coverage for Patient 1: PT 2 covers Patient 1 active today
  INSERT INTO public.temporary_coverages (id, patient_id, owner_therapist_id, cover_therapist_id, start_date, end_date, status)
  VALUES 
    (v_cov_active_id, v_patient1_id, v_pt1_owner_id, v_pt2_cover_id, v_bangkok_today - 1, v_bangkok_today + 5, 'active')
  ON CONFLICT (id) DO UPDATE SET 
    start_date = EXCLUDED.start_date, end_date = EXCLUDED.end_date, status = 'active', revoked_at = NULL;

  -- 0f. Baseline Audit Log Entry
  INSERT INTO public.audit_logs (actor_name, role, category, action, detail, status)
  VALUES ('System Admin', 'admin', 'SECURITY', 'FIXTURE_SETUP', 'Baseline audit log entry', 'success');

  -- 0g. Ensure FEATURE_PT_POSE_EXERCISES is false for pose gating tests
  INSERT INTO public.system_settings (key, value)
  VALUES ('FEATURE_PT_POSE_EXERCISES', 'false'::jsonb)
  ON CONFLICT (key) DO UPDATE SET value = 'false'::jsonb;


  -- ==========================================================================
  -- CASE 1: ANON ROLE ISOLATION (Zero direct table & storage access)
  -- Real queries under: SET LOCAL ROLE anon
  -- Assert 0 rows on SELECT, and real INSERT fails with SQLSTATE 42501 (insufficient_privilege).
  -- ==========================================================================
  EXECUTE 'SET LOCAL ROLE anon';
  PERFORM set_config('request.jwt.claim.sub', '', true);
  PERFORM set_config('request.jwt.claims', '{"role":"anon"}', true);

  -- 1a. Real SELECT row counts on public tables -> must return 0
  SELECT count(*) INTO v_count FROM public.profiles;
  ASSERT v_count = 0, '[FAIL] Case 1: anon saw profiles rows (expected 0)';

  SELECT count(*) INTO v_count FROM public.patients;
  ASSERT v_count = 0, '[FAIL] Case 1: anon saw patients rows (expected 0)';

  SELECT count(*) INTO v_count FROM public.appointments;
  ASSERT v_count = 0, '[FAIL] Case 1: anon saw appointments rows (expected 0)';

  SELECT count(*) INTO v_count FROM public.routine_items;
  ASSERT v_count = 0, '[FAIL] Case 1: anon saw routine_items rows (expected 0)';

  SELECT count(*) INTO v_count FROM public.audit_logs;
  ASSERT v_count = 0, '[FAIL] Case 1: anon saw audit_logs rows (expected 0)';

  SELECT count(*) INTO v_count FROM public.exercises;
  ASSERT v_count = 0, '[FAIL] Case 1: anon saw exercises rows (expected 0)';

  SELECT count(*) INTO v_count FROM public.face_templates;
  ASSERT v_count = 0, '[FAIL] Case 1: anon saw face_templates rows (expected 0)';

  -- 1b. Real SELECT on storage.objects for private buckets -> must return 0
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'storage' AND table_name = 'objects') THEN
    SELECT count(*) INTO v_count FROM storage.objects WHERE bucket_id IN ('biometric-data', 'avatars');
    ASSERT v_count = 0, '[FAIL] Case 1: anon saw private storage objects (expected 0)';
  END IF;

  -- 1c. Real INSERT attempts on tables -> must fail with SQLSTATE 42501 (insufficient_privilege)
  v_error_caught := false;
  BEGIN
    INSERT INTO public.profiles (id, username, full_name, role)
    VALUES (gen_random_uuid(), 'anon_attacker', 'Attacker', 'admin');
  EXCEPTION
    WHEN SQLSTATE '42501' THEN
      v_error_caught := true;
  END;
  ASSERT v_error_caught = true, '[FAIL] Case 1: anon was able to insert into profiles without SQLSTATE 42501!';

  v_error_caught := false;
  BEGIN
    INSERT INTO public.patients (id, hn, full_name)
    VALUES (gen_random_uuid(), 'HN-HACK', 'Hacked Patient');
  EXCEPTION
    WHEN SQLSTATE '42501' THEN
      v_error_caught := true;
  END;
  ASSERT v_error_caught = true, '[FAIL] Case 1: anon was able to insert into patients without SQLSTATE 42501!';

  v_error_caught := false;
  BEGIN
    INSERT INTO public.audit_logs (action)
    VALUES ('HACK_ATTEMPT');
  EXCEPTION
    WHEN SQLSTATE '42501' THEN
      v_error_caught := true;
  END;
  ASSERT v_error_caught = true, '[FAIL] Case 1: anon was able to insert into audit_logs without SQLSTATE 42501!';

  EXECUTE 'RESET ROLE';
  RAISE NOTICE '[PASS] Case 1: anon role has zero read access across all tables & buckets, and all mutations raise SQLSTATE 42501.';


  -- ==========================================================================
  -- CASE 2: THERAPIST SCHEDULE WRITE (Own patient vs Unrelated patient vs Stranger)
  -- Real INSERT on appointments and routine_items under: SET LOCAL ROLE authenticated
  -- ==========================================================================
  -- 2a. PT 1 writing schedule for Patient 1 (Own assigned caseload)
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM set_config('request.jwt.claim.sub', v_pt1_owner_id::text, true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_pt1_owner_id::text, 'role', 'authenticated')::text, true);

  -- Real appointment INSERT for own patient -> SUCCEEDS (1 row inserted)
  INSERT INTO public.appointments (patient_id, date, status, created_by)
  VALUES (v_patient1_id, v_bangkok_today, 'scheduled', v_pt1_owner_id)
  RETURNING id INTO v_test_appt_id;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  ASSERT v_rows = 1, '[FAIL] Case 2: PT 1 failed to insert appointment for own patient 1 (expected 1 row)';

  -- Real routine_items INSERT for own patient's appointment (using MG-01 since pose exercises are locked)
  INSERT INTO public.routine_items (appointment_id, exercise_id, reps, sets)
  VALUES (v_test_appt_id, v_mg1_ex_id, 10, 3);
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  ASSERT v_rows = 1, '[FAIL] Case 2: PT 1 failed to insert routine_item for own patient 1 (expected 1 row)';

  -- 2b. PT 1 writing schedule for Patient 2 (Unrelated patient owned by PT 2) -> must fail with SQLSTATE 42501
  v_error_caught := false;
  BEGIN
    INSERT INTO public.appointments (patient_id, date, status, created_by)
    VALUES (v_patient2_id, v_bangkok_today, 'scheduled', v_pt1_owner_id);
  EXCEPTION
    WHEN SQLSTATE '42501' THEN
      v_error_caught := true;
  END;
  ASSERT v_error_caught = true, '[FAIL] Case 2: PT 1 inserting appointment for unrelated patient 2 did not raise SQLSTATE 42501!';

  -- 2c. PT 3 (Stranger) writing schedule for Patient 1 -> must fail with SQLSTATE 42501
  PERFORM set_config('request.jwt.claim.sub', v_pt3_stranger_id::text, true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_pt3_stranger_id::text, 'role', 'authenticated')::text, true);

  v_error_caught := false;
  BEGIN
    INSERT INTO public.appointments (patient_id, date, status, created_by)
    VALUES (v_patient1_id, v_bangkok_today, 'scheduled', v_pt3_stranger_id);
  EXCEPTION
    WHEN SQLSTATE '42501' THEN
      v_error_caught := true;
  END;
  ASSERT v_error_caught = true, '[FAIL] Case 2: Stranger PT 3 inserting appointment for patient 1 did not raise SQLSTATE 42501!';

  EXECUTE 'RESET ROLE';
  RAISE NOTICE '[PASS] Case 2: Therapist schedule write strictly enforced on real appointments & routine_items (rejections raise SQLSTATE 42501).';


  -- ==========================================================================
  -- CASE 3: COVERED THERAPIST (Active coverage vs Expired coverage)
  -- Real appointment INSERT during active window vs after end_date
  -- ==========================================================================
  -- 3a. Active Coverage: PT 2 covering Patient 1
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM set_config('request.jwt.claim.sub', v_pt2_cover_id::text, true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_pt2_cover_id::text, 'role', 'authenticated')::text, true);

  INSERT INTO public.appointments (patient_id, date, status, created_by)
  VALUES (v_patient1_id, v_bangkok_today, 'scheduled', v_pt2_cover_id)
  RETURNING id INTO v_temp_id;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  ASSERT v_rows = 1, '[FAIL] Case 3: Active covering PT 2 should insert appointment (expected 1 row)';

  -- 3b. Expire coverage: set end_date = yesterday
  EXECUTE 'RESET ROLE';
  UPDATE public.temporary_coverages SET end_date = v_bangkok_today - 1 WHERE id = v_cov_active_id;

  -- 3c. PT 2 attempts write after expiration -> must fail with SQLSTATE 42501
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM set_config('request.jwt.claim.sub', v_pt2_cover_id::text, true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_pt2_cover_id::text, 'role', 'authenticated')::text, true);

  v_error_caught := false;
  BEGIN
    INSERT INTO public.appointments (patient_id, date, status, created_by)
    VALUES (v_patient1_id, v_bangkok_today, 'scheduled', v_pt2_cover_id);
  EXCEPTION
    WHEN SQLSTATE '42501' THEN
      v_error_caught := true;
  END;
  ASSERT v_error_caught = true, '[FAIL] Case 3: Covering PT after expiration did not raise SQLSTATE 42501!';

  -- Restore active coverage
  EXECUTE 'RESET ROLE';
  UPDATE public.temporary_coverages SET end_date = v_bangkok_today + 5 WHERE id = v_cov_active_id;
  RAISE NOTICE '[PASS] Case 3: Covered therapist authorized during active window and strictly revoked (SQLSTATE 42501) after end_date.';


  -- ==========================================================================
  -- CASE 4: EXERCISE LIBRARY CRUD OWNERSHIP
  -- Real UPDATE on exercises: PT edits self-created only; Admin-created protected
  -- RLS silently filters non-owned rows, so assert via GET DIAGNOSTICS ROW_COUNT.
  -- ==========================================================================
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM set_config('request.jwt.claim.sub', v_pt1_owner_id::text, true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_pt1_owner_id::text, 'role', 'authenticated')::text, true);

  -- Attempt UPDATE on Admin's exercise -> RLS filters silently, assert 0 rows affected
  UPDATE public.exercises SET name_th = 'Unauthorized Edit' WHERE id = v_admin_ex_id;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  ASSERT v_rows = 0, '[FAIL] Case 4: PT 1 updated admin exercise! Expected 0 rows affected.';

  -- Attempt UPDATE on self-created exercise -> assert 1 row affected
  UPDATE public.exercises SET name_th = 'PT1 Valid Custom Name' WHERE id = v_pt1_ex_id;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  ASSERT v_rows = 1, '[FAIL] Case 4: PT 1 failed to update own exercise! Expected 1 row affected.';

  EXECUTE 'RESET ROLE';
  RAISE NOTICE '[PASS] Case 4: Exercise CRUD ownership verified (PT edits self-created = 1 row; Admin-created = 0 rows).';


  -- ==========================================================================
  -- CASE 5: AUDIT LOGS ACCESS ISOLATION (Admin only)
  -- Real SELECT on audit_logs: Therapist sees 0 rows; Admin sees all logs
  -- ==========================================================================
  -- 5a. Therapist querying audit_logs
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM set_config('request.jwt.claim.sub', v_pt1_owner_id::text, true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_pt1_owner_id::text, 'role', 'authenticated')::text, true);

  SELECT count(*) INTO v_count FROM public.audit_logs;
  ASSERT v_count = 0, '[FAIL] Case 5: Therapist saw audit_logs rows! Expected 0.';

  -- 5b. Admin querying audit_logs
  PERFORM set_config('request.jwt.claim.sub', v_admin_id::text, true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_admin_id::text, 'role', 'authenticated')::text, true);

  SELECT count(*) INTO v_count FROM public.audit_logs;
  ASSERT v_count > 0, '[FAIL] Case 5: Admin could not see audit_logs rows! Expected > 0.';

  EXECUTE 'RESET ROLE';
  RAISE NOTICE '[PASS] Case 5: Audit logs access strictly isolated (Therapist sees 0 rows; Admin sees all logs).';


  -- ==========================================================================
  -- CASE 6: PROFILE TAMPERING PREVENTION & CASE 6C PATIENT RESOLUTION
  -- Real UPDATE on profiles & patients
  -- Therapist cannot update Admin or peer PT profiles; Therapist can update own profile and manage patients.
  -- RLS filters unauthorized updates silently (0 rows affected).
  -- ==========================================================================
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM set_config('request.jwt.claim.sub', v_pt1_owner_id::text, true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_pt1_owner_id::text, 'role', 'authenticated')::text, true);

  -- 6a. PT 1 attempting to UPDATE Admin profile -> RLS filters silently, assert 0 rows affected
  UPDATE public.profiles SET full_name = 'Hacked Admin' WHERE id = v_admin_id;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  ASSERT v_rows = 0, '[FAIL] Case 6A: Therapist was able to update Admin profile! (expected 0 rows affected)';

  -- 6b. PT 1 attempting to UPDATE PT 2 profile -> RLS filters silently, assert 0 rows affected
  UPDATE public.profiles SET full_name = 'Hacked PT2' WHERE id = v_pt2_cover_id;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  ASSERT v_rows = 0, '[FAIL] Case 6B: Therapist was able to update fellow PT profile! (expected 0 rows affected)';

  -- 6c. PT 1 updating own profile -> assert 1 row affected
  UPDATE public.profiles SET full_name = 'PT 1 Verified Name' WHERE id = v_pt1_owner_id;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  ASSERT v_rows = 1, '[FAIL] Case 6C: Therapist failed to update own profile!';

  -- 6d. Case 6C: Patient ID resolution in can_edit_user()
  -- Patients have NO profile row in public.profiles.
  -- can_edit_user(patient_id) queries public.patients by id = target_user_id and returns true.
  ASSERT public.can_edit_user(v_patient1_id) = true, 
    '[FAIL] Case 6C: can_edit_user(patient_id) must return true by resolving against public.patients table!';
  ASSERT public.can_edit_user(v_admin_id) = false, 
    '[FAIL] Case 6C: can_edit_user(admin_id) must return false for therapist!';
  ASSERT public.can_edit_user(v_pt2_cover_id) = false, 
    '[FAIL] Case 6C: can_edit_user(peer_pt_id) must return false for therapist!';

  -- Real UPDATE on public.patients -> assert 1 row affected
  UPDATE public.patients SET underlying_diseases = 'Asthma' WHERE id = v_patient1_id;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  ASSERT v_rows = 1, '[FAIL] Case 6C: Therapist failed to update patient details in public.patients!';

  EXECUTE 'RESET ROLE';
  RAISE NOTICE '[PASS] Case 6: Profile tampering prevented (Admin/Peer PT update = 0 rows; self update = 1 row; patient resolved via public.patients).';


  -- ==========================================================================
  -- CASE 7: IMMUTABILITY OF MEDICAL NOTES (Triggers block UPDATE/DELETE)
  -- Asserts trigger raises SQLSTATE P0001 (raise_exception) with clinical message
  -- ==========================================================================
  INSERT INTO public.medical_notes (patient_id, note_type, body, author_name)
  VALUES (v_patient1_id, 'progress', 'Initial immutable clinical note', 'PT 1')
  RETURNING id INTO v_temp_id;

  v_error_caught := false;
  BEGIN
    UPDATE public.medical_notes SET body = 'Tampered text' WHERE id = v_temp_id;
  EXCEPTION
    WHEN SQLSTATE 'P0001' THEN
      IF SQLERRM ILIKE '%Medical notes are append-only%' THEN
        v_error_caught := true;
      END IF;
  END;
  ASSERT v_error_caught = true, '[FAIL] Case 7: UPDATE on medical_notes did not raise SQLSTATE P0001 with append-only notice!';

  v_error_caught := false;
  BEGIN
    DELETE FROM public.medical_notes WHERE id = v_temp_id;
  EXCEPTION
    WHEN SQLSTATE 'P0001' THEN
      IF SQLERRM ILIKE '%Medical notes are append-only%' THEN
        v_error_caught := true;
      END IF;
  END;
  ASSERT v_error_caught = true, '[FAIL] Case 7: DELETE on medical_notes did not raise SQLSTATE P0001 with append-only notice!';
  RAISE NOTICE '[PASS] Case 7: Medical notes immutability strictly enforced by trigger (UPDATE & DELETE raise SQLSTATE P0001).';


  -- ==========================================================================
  -- CASE 8: IMMUTABILITY OF AUDIT LOGS (Triggers block UPDATE/DELETE)
  -- Asserts trigger raises SQLSTATE P0001 (raise_exception) with immutable message
  -- ==========================================================================
  INSERT INTO public.audit_logs (actor_name, role, category, action, detail, status)
  VALUES ('Auditor', 'admin', 'SECURITY', 'IMMUTABILITY_TEST', 'Testing trigger lockdown', 'success')
  RETURNING id INTO v_temp_id;

  v_error_caught := false;
  BEGIN
    UPDATE public.audit_logs SET detail = 'Tampered log' WHERE id = v_temp_id;
  EXCEPTION
    WHEN SQLSTATE 'P0001' THEN
      IF SQLERRM ILIKE '%Audit logs are immutable%' THEN
        v_error_caught := true;
      END IF;
  END;
  ASSERT v_error_caught = true, '[FAIL] Case 8: UPDATE on audit_logs did not raise SQLSTATE P0001 with immutable notice!';

  v_error_caught := false;
  BEGIN
    DELETE FROM public.audit_logs WHERE id = v_temp_id;
  EXCEPTION
    WHEN SQLSTATE 'P0001' THEN
      IF SQLERRM ILIKE '%Audit logs are immutable%' THEN
        v_error_caught := true;
      END IF;
  END;
  ASSERT v_error_caught = true, '[FAIL] Case 8: DELETE on audit_logs did not raise SQLSTATE P0001 with immutable notice!';
  RAISE NOTICE '[PASS] Case 8: Audit logs immutability strictly enforced by trigger (UPDATE & DELETE raise SQLSTATE P0001).';


  -- ==========================================================================
  -- CASE 9: POSE EXERCISE GATING IN ROUTINES (Rule: is_minigame = true only)
  -- While FEATURE_PT_POSE_EXERCISES is false:
  --   Inserting EX-01 (is_minigame = false) MUST be rejected (SQLSTATE P0001).
  --   Inserting MG-01 (is_minigame = true) MUST succeed (1 row inserted).
  -- ==========================================================================
  -- Ensure FEATURE_PT_POSE_EXERCISES is false
  UPDATE public.system_settings SET value = 'false'::jsonb WHERE key = 'FEATURE_PT_POSE_EXERCISES';

  -- 9a. Inserting EX-01 (is_minigame = false) -> MUST raise SQLSTATE P0001
  v_error_caught := false;
  BEGIN
    INSERT INTO public.routine_items (appointment_id, exercise_id, reps, sets)
    VALUES (v_test_appt_id, v_ex1_ex_id, 10, 3);
  EXCEPTION
    WHEN SQLSTATE 'P0001' THEN
      IF SQLERRM ILIKE '%Routine items may only reference mini-games%' THEN
        v_error_caught := true;
      END IF;
  END;
  ASSERT v_error_caught = true, 
    '[FAIL] Case 9A: Routine insert with regular exercise EX-01 (is_minigame = false) did not raise SQLSTATE P0001!';

  -- 9b. Inserting MG-01 (is_minigame = true) -> MUST SUCCEED (1 row affected)
  INSERT INTO public.routine_items (appointment_id, exercise_id, reps, sets)
  VALUES (v_test_appt_id, v_mg1_ex_id, 15, 2);
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  ASSERT v_rows = 1, '[FAIL] Case 9B: Routine insert with mini-game MG-01 (is_minigame = true) failed!';

  RAISE NOTICE '[PASS] Case 9: Pose exercise gating verified (EX-01 is_minigame=false rejected with SQLSTATE P0001; MG-01 is_minigame=true accepted).';

  -- Clean up session configs
  PERFORM set_config('request.jwt.claim.sub', '', true);
  PERFORM set_config('request.jwt.claims', '', true);

  RAISE NOTICE '====================================================================';
  RAISE NOTICE '>>> ALL 9 ROLE-MATRIX & REAL-TABLE TESTS PASSED (100%%) <<<';
  RAISE NOTICE '====================================================================';
END $$;

ROLLBACK;
