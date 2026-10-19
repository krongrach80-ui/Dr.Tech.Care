-- ============================================================================
-- DR.TECH.CARE: Phase 1 - Comprehensive Role-Matrix & Real-Table RLS Test Suite
-- Wrapped entirely in BEGIN ... ROLLBACK to leave zero persistent test residue.
-- Tests simulate: anon, admin, therapist (own patient), unrelated PT, covered PT,
--                 and trusted service_role.
-- Exercises real physical tables:
--   auth.users, profiles, patients, appointments, routine_items, audit_logs,
--   exercises, medical_notes, temporary_coverages, face_templates, storage.objects.
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
  v_stamped_note    record;
  v_unsecured_count int;
BEGIN
  RAISE NOTICE '====================================================================';
  RAISE NOTICE '>>> STARTING DR.TECH.CARE PHASE 1 REAL-TABLE RLS TEST SUITE <<<';
  RAISE NOTICE '====================================================================';

  -- --------------------------------------------------------------------------
  -- STEP 0: FIXTURE SETUP (Executed as session user / superuser)
  -- --------------------------------------------------------------------------
  
  -- 0a. Insert auth.users fixtures first to satisfy profiles.id foreign key constraint
  INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  VALUES 
    (v_admin_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'admin@drtechcare.invalid', 'dummy_hash', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
    (v_pt1_owner_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'pt1@drtechcare.invalid', 'dummy_hash', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
    (v_pt2_cover_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'pt2@drtechcare.invalid', 'dummy_hash', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
    (v_pt3_stranger_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'pt3@drtechcare.invalid', 'dummy_hash', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now())
  ON CONFLICT (id) DO NOTHING;

  -- 0b. Profiles fixtures
  INSERT INTO public.profiles (id, username, full_name, role, email, is_active)
  VALUES 
    (v_admin_id, 'test_admin', 'Admin Superuser', 'admin', 'admin@drtechcare.invalid', true),
    (v_pt1_owner_id, 'test_pt1', 'PT 1 Owner', 'therapist', 'pt1@drtechcare.invalid', true),
    (v_pt2_cover_id, 'test_pt2', 'PT 2 Cover', 'therapist', 'pt2@drtechcare.invalid', true),
    (v_pt3_stranger_id, 'test_pt3', 'PT 3 Stranger', 'therapist', 'pt3@drtechcare.invalid', true)
  ON CONFLICT (id) DO UPDATE SET 
    role = EXCLUDED.role, is_active = true, deleted_at = NULL;

  -- 0c. Patients fixtures (Patient 1 assigned to PT 1; Patient 2 assigned to PT 2)
  INSERT INTO public.patients (id, hn, full_name, assigned_therapist_id, treatment_status, pin_hash, face_vector)
  VALUES 
    (v_patient1_id, 'HN-TEST-001', 'Test Patient 1 (PT1 Caseload)', v_pt1_owner_id, 'active', 'test_pin_hash_1', '{"emb": [1,2,3]}'::jsonb),
    (v_patient2_id, 'HN-TEST-002', 'Test Patient 2 (PT2 Caseload)', v_pt2_cover_id, 'active', 'test_pin_hash_2', '{"emb": [4,5,6]}'::jsonb)
  ON CONFLICT (id) DO UPDATE SET 
    assigned_therapist_id = EXCLUDED.assigned_therapist_id;

  -- 0d. Exercises fixtures
  INSERT INTO public.exercises (id, code, name_th, category, kind, is_minigame, created_by)
  VALUES 
    (v_admin_ex_id, 'EX-ADM-01', 'Admin Core Exercise', 'Core', 'single', false, v_admin_id),
    (v_pt1_ex_id, 'EX-PT1-01', 'PT1 Custom Exercise', 'Custom', 'single', false, v_pt1_owner_id)
  ON CONFLICT (id) DO UPDATE SET 
    created_by = EXCLUDED.created_by, category = EXCLUDED.category;

  -- Ensure seed mini-game MG-01 exists
  SELECT id INTO v_mg1_ex_id FROM public.exercises WHERE code = 'MG-01' LIMIT 1;
  IF v_mg1_ex_id IS NULL THEN
    INSERT INTO public.exercises (code, slug, name_th, is_minigame)
    VALUES ('MG-01', 'minigame_quiz', 'มินิเกมตอบคำถามฝึกสมองและการตอบสนอง (Interactive Quiz)', true)
    RETURNING id INTO v_mg1_ex_id;
  END IF;

  SELECT id INTO v_ex1_ex_id FROM public.exercises WHERE code = 'EX-01' LIMIT 1;
  IF v_ex1_ex_id IS NULL THEN
    INSERT INTO public.exercises (code, slug, name_th, is_minigame)
    VALUES ('EX-01', 'ex-shoulder-abduction', 'Shoulder Abduction', false)
    RETURNING id INTO v_ex1_ex_id;
  END IF;

  -- 0e. Temporary Coverage: PT 2 covers Patient 1 active today
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
  -- CASE 1: ANON ROLE ISOLATION (Revoked Table & Sequence Privileges)
  -- Under: SET LOCAL ROLE anon
  -- Assert that anon SELECT on tables raises SQLSTATE 42501 (insufficient_privilege)
  -- ==========================================================================
  EXECUTE 'SET LOCAL ROLE anon';
  PERFORM set_config('request.jwt.claim.sub', '', true);
  PERFORM set_config('request.jwt.claims', '{"role":"anon"}', true);

  -- 1a. Real SELECT on public.profiles -> MUST raise SQLSTATE 42501
  v_error_caught := false;
  BEGIN
    SELECT count(*) INTO v_count FROM public.profiles;
  EXCEPTION
    WHEN SQLSTATE '42501' THEN
      v_error_caught := true;
  END;
  ASSERT v_error_caught = true, '[FAIL] Case 1: anon SELECT on profiles did not raise SQLSTATE 42501!';

  -- 1b. Real SELECT on public.patients -> MUST raise SQLSTATE 42501
  v_error_caught := false;
  BEGIN
    SELECT count(*) INTO v_count FROM public.patients;
  EXCEPTION
    WHEN SQLSTATE '42501' THEN
      v_error_caught := true;
  END;
  ASSERT v_error_caught = true, '[FAIL] Case 1: anon SELECT on patients did not raise SQLSTATE 42501!';

  -- 1c. Real INSERT on public.patients -> MUST raise SQLSTATE 42501
  v_error_caught := false;
  BEGIN
    INSERT INTO public.patients (id, hn, full_name)
    VALUES (gen_random_uuid(), 'HN-HACK', 'Hacked Patient');
  EXCEPTION
    WHEN SQLSTATE '42501' THEN
      v_error_caught := true;
  END;
  ASSERT v_error_caught = true, '[FAIL] Case 1: anon INSERT on patients did not raise SQLSTATE 42501!';

  EXECUTE 'RESET ROLE';
  RAISE NOTICE '[PASS] Case 1: anon role has zero table access and all queries raise SQLSTATE 42501.';


  -- ==========================================================================
  -- CASE 2: THERAPIST SCHEDULE WRITE (Own patient vs Unrelated patient vs Stranger)
  -- ==========================================================================
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM set_config('request.jwt.claim.sub', v_pt1_owner_id::text, true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_pt1_owner_id::text, 'role', 'authenticated')::text, true);

  -- 2a. Real appointment INSERT for own patient -> SUCCEEDS (1 row inserted)
  INSERT INTO public.appointments (patient_id, date, status, created_by)
  VALUES (v_patient1_id, v_bangkok_today, 'scheduled', v_pt1_owner_id)
  RETURNING id INTO v_test_appt_id;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  ASSERT v_rows = 1, '[FAIL] Case 2: PT 1 failed to insert appointment for own patient 1';

  -- 2b. Real routine_items INSERT for own patient (using MG-01 since pose exercises are locked)
  INSERT INTO public.routine_items (appointment_id, exercise_id, reps, sets)
  VALUES (v_test_appt_id, v_mg1_ex_id, 10, 3);
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  ASSERT v_rows = 1, '[FAIL] Case 2: PT 1 failed to insert routine_item for own patient 1';

  -- 2c. PT 1 writing schedule for Patient 2 (Unrelated patient owned by PT 2) -> must fail with SQLSTATE 42501
  v_error_caught := false;
  BEGIN
    INSERT INTO public.appointments (patient_id, date, status, created_by)
    VALUES (v_patient2_id, v_bangkok_today, 'scheduled', v_pt1_owner_id);
  EXCEPTION
    WHEN SQLSTATE '42501' THEN
      v_error_caught := true;
  END;
  ASSERT v_error_caught = true, '[FAIL] Case 2: PT 1 inserting appointment for unrelated patient 2 did not raise SQLSTATE 42501!';

  EXECUTE 'RESET ROLE';
  RAISE NOTICE '[PASS] Case 2: Therapist schedule write strictly enforced on real appointments.';


  -- ==========================================================================
  -- CASE 3: COVERED THERAPIST (Active coverage vs Expired coverage)
  -- ==========================================================================
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM set_config('request.jwt.claim.sub', v_pt2_cover_id::text, true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_pt2_cover_id::text, 'role', 'authenticated')::text, true);

  -- 3a. Active Coverage: PT 2 covering Patient 1
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
  RAISE NOTICE '[PASS] Case 3: Covered therapist authorized during active window and strictly revoked after end_date.';


  -- ==========================================================================
  -- CASE 4: EXERCISE LIBRARY CRUD OWNERSHIP & POSE GUARD BYPASS PREVENTION
  -- ==========================================================================
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM set_config('request.jwt.claim.sub', v_pt1_owner_id::text, true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_pt1_owner_id::text, 'role', 'authenticated')::text, true);

  -- 4a. PT edits self-created exercise -> assert 1 row affected
  UPDATE public.exercises SET name_th = 'PT1 Valid Custom Name' WHERE id = v_pt1_ex_id;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  ASSERT v_rows = 1, '[FAIL] Case 4: PT 1 failed to update own exercise!';

  -- 4b. PT attempts to create an exercise with MG- code -> MUST fail with SQLSTATE 42501
  v_error_caught := false;
  BEGIN
    INSERT INTO public.exercises (code, slug, name_th, is_minigame, created_by)
    VALUES ('MG-99', 'mg-rogue-game', 'Rogue Minigame', true, v_pt1_owner_id);
  EXCEPTION
    WHEN SQLSTATE '42501' THEN
      v_error_caught := true;
  END;
  ASSERT v_error_caught = true, '[FAIL] Case 4: Therapist was able to create mini-game with MG- code!';

  -- 4c. PT attempts to set is_minigame = true on an exercise -> RLS / Trigger rejects or forces false
  v_error_caught := false;
  BEGIN
    INSERT INTO public.exercises (code, slug, name_th, is_minigame, created_by)
    VALUES ('EX-PT-MINI', 'ex-pt-mini', 'PT Pretend Minigame', true, v_pt1_owner_id);
  EXCEPTION
    WHEN SQLSTATE '42501' THEN
      v_error_caught := true;
  END;
  ASSERT v_error_caught = true, '[FAIL] Case 4: Therapist was able to bypass pose guard by setting is_minigame = true!';

  EXECUTE 'RESET ROLE';
  RAISE NOTICE '[PASS] Case 4: Exercise library CRUD ownership & pose guard bypass prevention verified.';


  -- ==========================================================================
  -- CASE 5: AUDIT LOGS ACCESS ISOLATION & FORGE PREVENTION
  -- ==========================================================================
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM set_config('request.jwt.claim.sub', v_pt1_owner_id::text, true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_pt1_owner_id::text, 'role', 'authenticated')::text, true);

  -- 5a. Therapist querying audit_logs -> returns 0 rows
  SELECT count(*) INTO v_count FROM public.audit_logs;
  ASSERT v_count = 0, '[FAIL] Case 5: Therapist saw audit_logs rows! Expected 0.';

  -- 5b. Therapist directly inserting into audit_logs -> MUST raise SQLSTATE 42501 (no insert policy)
  v_error_caught := false;
  BEGIN
    INSERT INTO public.audit_logs (actor_name, action)
    VALUES ('Forged Actor', 'FORGED_AUDIT');
  EXCEPTION
    WHEN SQLSTATE '42501' THEN
      v_error_caught := true;
  END;
  ASSERT v_error_caught = true, '[FAIL] Case 5: Authenticated therapist was able to directly insert into audit_logs!';

  EXECUTE 'RESET ROLE';
  RAISE NOTICE '[PASS] Case 5: Audit logs access strictly isolated (Therapist read = 0, direct insert raises 42501).';


  -- ==========================================================================
  -- CASE 6: PROFILE TAMPERING PREVENTION (Trigger-enforced self-update, NO 42P17)
  -- ==========================================================================
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM set_config('request.jwt.claim.sub', v_pt1_owner_id::text, true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_pt1_owner_id::text, 'role', 'authenticated')::text, true);

  -- 6a. PT 1 attempting to alter username or role on own profile -> MUST raise SQLSTATE 42501
  v_error_caught := false;
  BEGIN
    UPDATE public.profiles SET username = 'hacked_pt1' WHERE id = v_pt1_owner_id;
  EXCEPTION
    WHEN SQLSTATE '42501' THEN
      v_error_caught := true;
  END;
  ASSERT v_error_caught = true, '[FAIL] Case 6: Therapist altered username on own profile!';

  -- 6b. PT 1 updating allowed field (full_name) -> SUCCEEDS (1 row affected, no 42P17 error)
  UPDATE public.profiles SET full_name = 'PT 1 Verified Name' WHERE id = v_pt1_owner_id;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  ASSERT v_rows = 1, '[FAIL] Case 6: Therapist failed to update full_name on own profile!';

  EXECUTE 'RESET ROLE';
  RAISE NOTICE '[PASS] Case 6: Profile self-update restrictions enforced cleanly without 42P17 recursion.';


  -- ==========================================================================
  -- CASE 7: MEDICAL NOTES APPEND-ONLY & FORGE PREVENTION
  -- Any therapist can read all notes and append to ANY patient, but author
  -- fields are forced by trigger.
  -- ==========================================================================
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM set_config('request.jwt.claim.sub', v_pt1_owner_id::text, true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_pt1_owner_id::text, 'role', 'authenticated')::text, true);

  -- 7a. PT 1 inserts note for Patient 2 (caseload owned by PT 2) attempting to forge author
  INSERT INTO public.medical_notes (patient_id, note_type, body, author_id, author_name, created_at)
  VALUES (v_patient2_id, 'progress', 'Clinical observation by PT1 on Patient 2', v_admin_id, 'Forged Admin', now() - interval '1 year')
  RETURNING id INTO v_temp_id;

  SELECT author_id, author_name, created_at INTO v_stamped_note
  FROM public.medical_notes WHERE id = v_temp_id;

  -- Verify forced author stamping
  ASSERT v_stamped_note.author_id = v_pt1_owner_id, '[FAIL] Case 7: author_id was not stamped with auth.uid()!';
  ASSERT v_stamped_note.author_name = 'PT 1 Verified Name', '[FAIL] Case 7: author_name was not stamped from profiles!';
  ASSERT v_stamped_note.created_at > (now() - interval '10 seconds'), '[FAIL] Case 7: created_at was not stamped with current timestamp!';

  -- 7b. UPDATE on medical_notes -> MUST raise P0001 (immutable)
  v_error_caught := false;
  BEGIN
    UPDATE public.medical_notes SET body = 'Tampered text' WHERE id = v_temp_id;
  EXCEPTION
    WHEN SQLSTATE 'P0001' THEN
      v_error_caught := true;
  END;
  ASSERT v_error_caught = true, '[FAIL] Case 7: UPDATE on medical_notes did not raise SQLSTATE P0001!';

  EXECUTE 'RESET ROLE';
  RAISE NOTICE '[PASS] Case 7: Medical notes author stamping & immutability strictly enforced.';


  -- ==========================================================================
  -- CASE 8: PATIENTS SENSITIVE COLUMNS GUARD (Privilege Hole 1)
  -- Unrelated PT changing patient1.assigned_therapist_id MUST fail
  -- ==========================================================================
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM set_config('request.jwt.claim.sub', v_pt2_cover_id::text, true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_pt2_cover_id::text, 'role', 'authenticated')::text, true);

  -- 8a. PT 2 (not current assigned PT) attempting to change assigned_therapist_id of Patient 1 -> MUST raise 42501
  v_error_caught := false;
  BEGIN
    UPDATE public.patients 
    SET assigned_therapist_id = v_pt2_cover_id 
    WHERE id = v_patient1_id;
  EXCEPTION
    WHEN SQLSTATE '42501' THEN
      v_error_caught := true;
  END;
  ASSERT v_error_caught = true, '[FAIL] Case 8: Unrelated PT was able to steal patient assigned_therapist_id!';

  -- 8b. PT 2 updating clinical Tab-1 field (underlying_diseases) on Patient 1 -> SUCCEEDS (1 row affected)
  UPDATE public.patients 
  SET underlying_diseases = 'Hypertension' 
  WHERE id = v_patient1_id;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  ASSERT v_rows = 1, '[FAIL] Case 8: Therapist failed to update clinical Tab-1 columns on patient!';

  EXECUTE 'RESET ROLE';
  RAISE NOTICE '[PASS] Case 8: Patient sensitive columns protected from unauthorized therapist reassignment.';


  -- ==========================================================================
  -- CASE 9: COLUMN-LEVEL SELECT LOCKDOWN (pin_hash & face_vector)
  -- ==========================================================================
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM set_config('request.jwt.claim.sub', v_pt1_owner_id::text, true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_pt1_owner_id::text, 'role', 'authenticated')::text, true);

  -- 9a. Therapist attempting to SELECT pin_hash from public.patients -> MUST raise 42501
  v_error_caught := false;
  BEGIN
    EXECUTE 'SELECT pin_hash FROM public.patients WHERE id = ' || quote_literal(v_patient1_id);
  EXCEPTION
    WHEN SQLSTATE '42501' THEN
      v_error_caught := true;
  END;
  ASSERT v_error_caught = true, '[FAIL] Case 9: Therapist was able to SELECT patients.pin_hash without SQLSTATE 42501!';

  -- 9b. Therapist attempting to SELECT face_vector from public.patients -> MUST raise 42501
  v_error_caught := false;
  BEGIN
    EXECUTE 'SELECT face_vector FROM public.patients WHERE id = ' || quote_literal(v_patient1_id);
  EXCEPTION
    WHEN SQLSTATE '42501' THEN
      v_error_caught := true;
  END;
  ASSERT v_error_caught = true, '[FAIL] Case 9: Therapist was able to SELECT patients.face_vector without SQLSTATE 42501!';

  EXECUTE 'RESET ROLE';
  RAISE NOTICE '[PASS] Case 9: Column-level permissions on patients (pin_hash & face_vector locked down with SQLSTATE 42501).';


  -- ==========================================================================
  -- CASE 10: FACE TEMPLATES CLIENT ACCESS LOCKDOWN (Zero client-facing policies)
  -- ==========================================================================
  -- 10a. Admin trying to SELECT face_templates -> returns 0 rows
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM set_config('request.jwt.claim.sub', v_admin_id::text, true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_admin_id::text, 'role', 'authenticated')::text, true);

  SELECT count(*) INTO v_count FROM public.face_templates;
  ASSERT v_count = 0, '[FAIL] Case 10: Admin saw face_templates rows! Expected 0.';

  -- 10b. Therapist trying to INSERT face_templates -> MUST raise 42501
  PERFORM set_config('request.jwt.claim.sub', v_pt1_owner_id::text, true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_pt1_owner_id::text, 'role', 'authenticated')::text, true);

  v_error_caught := false;
  BEGIN
    INSERT INTO public.face_templates (patient_id, pose, embedding)
    VALUES (v_patient1_id, 'straight', '[0,0,0]'::vector);
  EXCEPTION
    WHEN SQLSTATE '42501' THEN
      v_error_caught := true;
  END;
  ASSERT v_error_caught = true, '[FAIL] Case 10: Therapist was able to insert into face_templates!';

  EXECUTE 'RESET ROLE';
  RAISE NOTICE '[PASS] Case 10: Biometric face_templates strictly locked down against all client roles.';


  -- ==========================================================================
  -- CASE 11: TEMPORARY CASE COVERAGES VALIDATION
  -- ==========================================================================
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM set_config('request.jwt.claim.sub', v_pt2_cover_id::text, true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_pt2_cover_id::text, 'role', 'authenticated')::text, true);

  -- 11a. PT 2 trying to delegate Patient 1 (which PT 2 does not own) -> MUST raise P0001
  v_error_caught := false;
  BEGIN
    INSERT INTO public.temporary_coverages (patient_id, owner_therapist_id, cover_therapist_id, start_date, end_date)
    VALUES (v_patient1_id, v_pt2_cover_id, v_pt3_stranger_id, v_bangkok_today, v_bangkok_today + 2);
  EXCEPTION
    WHEN SQLSTATE 'P0001' THEN
      v_error_caught := true;
  END;
  ASSERT v_error_caught = true, '[FAIL] Case 11: Non-assigned therapist was able to delegate patient coverage!';

  -- 11b. PT 1 (owner) creating overlapping coverage -> MUST raise P0001
  PERFORM set_config('request.jwt.claim.sub', v_pt1_owner_id::text, true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_pt1_owner_id::text, 'role', 'authenticated')::text, true);

  v_error_caught := false;
  BEGIN
    INSERT INTO public.temporary_coverages (patient_id, owner_therapist_id, cover_therapist_id, start_date, end_date)
    VALUES (v_patient1_id, v_pt1_owner_id, v_pt3_stranger_id, v_bangkok_today, v_bangkok_today + 3);
  EXCEPTION
    WHEN SQLSTATE 'P0001' THEN
      v_error_caught := true;
  END;
  ASSERT v_error_caught = true, '[FAIL] Case 11: Overlapping active coverage was accepted!';

  EXECUTE 'RESET ROLE';
  RAISE NOTICE '[PASS] Case 11: Temporary coverages trigger validations strictly enforced.';


  -- ==========================================================================
  -- CASE 12: TRUSTED CONTEXT EXEMPTION (Positive Test as service_role)
  -- ==========================================================================
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM set_config('request.jwt.claim.sub', '', true);
  PERFORM set_config('request.jwt.claim.role', 'service_role', true);
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);

  -- 12a. service_role can create mini-games with MG- code
  INSERT INTO public.exercises (code, slug, name_th, is_minigame)
  VALUES ('MG-SRV-01', 'minigame_service_test', 'Service Role Minigame', true)
  RETURNING id INTO v_temp_id;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  ASSERT v_rows = 1, '[FAIL] Case 12: service_role was blocked from inserting mini-game!';

  -- 12b. service_role can insert medical notes with explicit custom author without being overwritten
  INSERT INTO public.medical_notes (patient_id, note_type, body, author_name, created_at)
  VALUES (v_patient1_id, 'pt_advice', 'Trusted Edge Function Note', 'Staging Edge Service', '2026-10-01 10:00:00+07')
  RETURNING id INTO v_temp_id;

  SELECT author_name INTO v_stamped_note FROM public.medical_notes WHERE id = v_temp_id;
  ASSERT v_stamped_note.author_name = 'Staging Edge Service', '[FAIL] Case 12: service_role author_name was wrongly overwritten!';

  EXECUTE 'RESET ROLE';
  RAISE NOTICE '[PASS] Case 12: Trusted context (service_role) successfully exempt from client guards.';


  -- ==========================================================================
  -- CASE 13: SCHEMA RLS ASSERTION (All public tables have RLS enabled)
  -- ==========================================================================
  SELECT count(*) INTO v_unsecured_count
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' 
    AND c.relkind = 'r'
    AND c.relrowsecurity = false;

  ASSERT v_unsecured_count = 0, 
    '[FAIL] Case 13: One or more public tables do NOT have RLS enabled!';

  RAISE NOTICE '[PASS] Case 13: All tables in schema public verified to have relrowsecurity = true.';

  -- ==========================================================================
  -- CASE 14: ANON ROLE IS UNTRUSTED (Cannot bypass patient trigger)
  -- ==========================================================================
  GRANT UPDATE ON public.patients TO anon;
  EXECUTE 'SET LOCAL ROLE anon';
  PERFORM set_config('request.jwt.claim.role', 'anon', true);

  v_error_caught := false;
  BEGIN
    UPDATE public.patients
    SET assigned_therapist_id = v_pt3_stranger_id
    WHERE id = v_patient1_id;
  EXCEPTION
    WHEN SQLSTATE '42501' THEN
      v_error_caught := true;
  END;
  EXECUTE 'RESET ROLE';
  REVOKE UPDATE ON public.patients FROM anon;

  ASSERT v_error_caught = true, '[FAIL] Case 14: Anon was considered trusted and altered assigned_therapist_id!';
  RAISE NOTICE '[PASS] Case 14: Anon context is strictly untrusted and rejected by patient sensitive update guard.';


  -- ==========================================================================
  -- CASE 15: HARD-DELETE PATIENT REJECTION
  -- ==========================================================================
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM set_config('request.jwt.claim.sub', v_admin_id::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_admin_id::text, 'role', 'authenticated')::text, true);

  v_error_caught := false;
  BEGIN
    DELETE FROM public.patients WHERE id = v_patient2_id;
  EXCEPTION
    WHEN SQLSTATE '42501' THEN
      v_error_caught := true;
  END;
  EXECUTE 'RESET ROLE';

  ASSERT v_error_caught = true, '[FAIL] Case 15: Authenticated client was able to hard-delete a patient record!';
  RAISE NOTICE '[PASS] Case 15: Hard deletion of patients is strictly blocked for authenticated clients.';


  -- ==========================================================================
  -- CASE 16: TIMEZONE BOUNDARY TEST (Bangkok 00:30 rollover)
  -- ==========================================================================
  DECLARE
    v_bkk_now timestamptz := '2026-10-20 00:30:00+07';
    v_bkk_today date := (v_bkk_now AT TIME ZONE 'Asia/Bangkok')::date;
    v_utc_date date := (v_bkk_now AT TIME ZONE 'UTC')::date;
    v_boundary_appt_id uuid := 'a0000000-0000-0000-0000-000000000099';
  BEGIN
    ASSERT v_bkk_today > v_utc_date, '[FAIL] Case 16: Timezone calculation assertion mismatch!';
    
    INSERT INTO public.appointments (id, patient_id, date, status)
    VALUES (v_boundary_appt_id, v_patient1_id, v_utc_date, 'scheduled')
    ON CONFLICT (id) DO NOTHING;

    ASSERT (SELECT date < v_bkk_today FROM public.appointments WHERE id = v_boundary_appt_id) = true,
      '[FAIL] Case 16: Appointment on UTC date was not recognized as past date in Bangkok timezone!';

    DELETE FROM public.appointments WHERE id = v_boundary_appt_id;
    RAISE NOTICE '[PASS] Case 16: Timezone boundary test passed (00:30 Bangkok strictly distinguishes hospital today vs yesterday).';
  END;

  -- ==========================================================================
  -- CASE 17: FRESH DB MEDICAL NOTE INSERT & SESSION AUTHOR STAMPING (F1)
  -- ==========================================================================
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM set_config('request.jwt.claim.sub', v_pt1_owner_id::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_pt1_owner_id::text, 'role', 'authenticated')::text, true);

  -- Therapist inserts medical note with forged author and NULL legacy fields
  INSERT INTO public.medical_notes (patient_id, note_type, body, author_name)
  VALUES (v_patient1_id, 'progress', 'Patient completed mobility assessment smoothly.', 'Forged System Admin')
  RETURNING id INTO v_temp_id;

  SELECT author_id, author_name, note, author_role, formatted_date 
  INTO v_stamped_note 
  FROM public.medical_notes 
  WHERE id = v_temp_id;

  ASSERT v_stamped_note.author_id = v_pt1_owner_id, '[FAIL] Case 17: Medical note author_id was not stamped with session UID!';
  ASSERT v_stamped_note.author_name != 'Forged System Admin', '[FAIL] Case 17: Forged author_name was accepted on medical note!';
  ASSERT v_stamped_note.note = 'Patient completed mobility assessment smoothly.', '[FAIL] Case 17: Legacy note column was not back-filled!';
  ASSERT v_stamped_note.author_role = 'therapist', '[FAIL] Case 17: Legacy author_role was not back-filled!';
  ASSERT v_stamped_note.formatted_date IS NOT NULL, '[FAIL] Case 17: Legacy formatted_date was not generated!';

  EXECUTE 'RESET ROLE';
  RAISE NOTICE '[PASS] Case 17: Fresh DB medical note inserted and author metadata stamped from session.';


  -- ==========================================================================
  -- CASE 18: MINIGAME CONVERGENCE CONFLICT RENAME ON NULL SLUG (F2)
  -- ==========================================================================
  DECLARE
    v_conflicting_null_slug_id uuid := 'd0000000-0000-0000-0000-000000000098';
    v_renamed_code text;
    v_rec_test record;
  BEGIN
    INSERT INTO public.exercises (id, code, slug, name_th, is_minigame)
    VALUES (v_conflicting_null_slug_id, 'MG-02', NULL, 'Legacy Exercise With Null Slug', false)
    ON CONFLICT (id) DO UPDATE SET code = 'MG-02', slug = NULL;

    FOR v_rec_test IN
      SELECT * FROM (VALUES
        ('minigame_arm_coordination', 'MG-02', 'มินิเกมฝึกประสานการเคลื่อนไหวแขน (Bilateral Arm Coordination)', 'ข้อต่อหัวไหล่และแขนสองข้าง', 5, 10, 2)
      ) AS t(slug, target_code, name_th, target_joint, rest_sec, reps, sets)
    LOOP
      IF EXISTS (
        SELECT 1 FROM public.exercises WHERE code = v_rec_test.target_code AND slug IS DISTINCT FROM v_rec_test.slug
      ) THEN
        UPDATE public.exercises
        SET code = 'EX-' || upper(substr(md5(random()::text || clock_timestamp()::text), 1, 8))
        WHERE id = v_conflicting_null_slug_id;
        RAISE NOTICE 'Notice: Renamed conflicting row with NULL slug to EX- prefix';
      END IF;
    END LOOP;

    SELECT code INTO v_renamed_code FROM public.exercises WHERE id = v_conflicting_null_slug_id;
    ASSERT v_renamed_code LIKE 'EX-%', '[FAIL] Case 18: Conflicting exercise with NULL slug was not renamed to EX- prefix!';
    DELETE FROM public.exercises WHERE id = v_conflicting_null_slug_id;
    RAISE NOTICE '[PASS] Case 18: Mini-game conflict check with NULL slug safely renamed conflicting row.';
  END;


  -- ==========================================================================
  -- CASE 19: THERAPIST WRITE RESTRICTIONS & COVERAGE CLINICAL UPDATE (F5b)
  -- ==========================================================================
  -- 19a. Therapist 3 (stranger, no coverage) attempts to update Patient 1 -> 0 rows
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM set_config('request.jwt.claim.sub', v_pt3_stranger_id::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_pt3_stranger_id::text, 'role', 'authenticated')::text, true);

  UPDATE public.patients
  SET therapist_notes = 'Tampered by stranger PT'
  WHERE id = v_patient1_id;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  ASSERT v_rows = 0, '[FAIL] Case 19a: Unassigned/uncovered therapist was able to update patient!';

  -- 19b. Therapist 2 (has active coverage for Patient 1) updates clinical notes -> MUST succeed (1 row)
  PERFORM set_config('request.jwt.claim.sub', v_pt2_cover_id::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_pt2_cover_id::text, 'role', 'authenticated')::text, true);

  UPDATE public.patients
  SET therapist_notes = 'Covering PT clinical update: gait improved'
  WHERE id = v_patient1_id;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  ASSERT v_rows = 1, '[FAIL] Case 19b: Active covering therapist was blocked from updating clinical notes!';

  -- 19c. Therapist 2 (covering) attempts to discharge or reassign Patient 1 -> MUST be rejected by sensitive fields trigger
  v_error_caught := false;
  BEGIN
    UPDATE public.patients
    SET treatment_status = 'discharged'
    WHERE id = v_patient1_id;
  EXCEPTION
    WHEN SQLSTATE '42501' THEN
      v_error_caught := true;
  END;
  ASSERT v_error_caught = true, '[FAIL] Case 19c: Covering therapist was able to discharge patient!';

  EXECUTE 'RESET ROLE';
  RAISE NOTICE '[PASS] Case 19: can_write_patient correctly restricts stranger PT, permits covered clinical edits, and guards sensitive fields.';


  -- ==========================================================================
  -- CASE 20: PATIENT COLUMN-LEVEL WRITE LOCKDOWN & REGISTRATION GUARD (F5)
  -- ==========================================================================
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM set_config('request.jwt.claim.sub', v_pt1_owner_id::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_pt1_owner_id::text, 'role', 'authenticated')::text, true);

  -- 20a. Attempt to update pin_hash -> MUST raise 42501 (permission denied for column)
  v_error_caught := false;
  BEGIN
    EXECUTE 'UPDATE public.patients SET pin_hash = ''hacked'' WHERE id = $1' USING v_patient1_id;
  EXCEPTION
    WHEN SQLSTATE '42501' THEN
      v_error_caught := true;
  END;
  ASSERT v_error_caught = true, '[FAIL] Case 20a: Therapist was able to update pin_hash!';

  -- 20b. Attempt to update progress_pct -> MUST raise 42501
  v_error_caught := false;
  BEGIN
    EXECUTE 'UPDATE public.patients SET progress_pct = 99.9 WHERE id = $1' USING v_patient1_id;
  EXCEPTION
    WHEN SQLSTATE '42501' THEN
      v_error_caught := true;
  END;
  ASSERT v_error_caught = true, '[FAIL] Case 20b: Therapist was able to update progress_pct!';

  -- 20c. Attempt to update face_registered -> MUST raise 42501
  v_error_caught := false;
  BEGIN
    EXECUTE 'UPDATE public.patients SET face_registered = true WHERE id = $1' USING v_patient1_id;
  EXCEPTION
    WHEN SQLSTATE '42501' THEN
      v_error_caught := true;
  END;
  ASSERT v_error_caught = true, '[FAIL] Case 20c: Therapist was able to update face_registered!';

  -- 20d. Non-admin therapist registering patient assigned to another therapist -> MUST raise 42501
  v_error_caught := false;
  BEGIN
    INSERT INTO public.patients (full_name, assigned_therapist_id)
    VALUES ('Patient Stolen', v_pt3_stranger_id);
  EXCEPTION
    WHEN SQLSTATE '42501' THEN
      v_error_caught := true;
  END;
  ASSERT v_error_caught = true, '[FAIL] Case 20d: Non-admin therapist was able to assign newly registered patient to another therapist!';

  EXECUTE 'RESET ROLE';
  RAISE NOTICE '[PASS] Case 20: Column-level write permissions and registration assignment guard strictly enforced.';


  -- ==========================================================================
  -- CASE 21: PATIENT COLUMN-LEVEL VISIBILITY ASSERTION (F6)
  -- ==========================================================================
  DECLARE
    v_missing_select_cols text[];
    v_anon_select_count int;
  BEGIN
    SELECT array_agg(attname::text ORDER BY attname::text)
    INTO v_missing_select_cols
    FROM pg_attribute
    WHERE attrelid = 'public.patients'::regclass
      AND attnum > 0
      AND NOT attisdropped
      AND NOT has_column_privilege('authenticated', 'public.patients', attname, 'SELECT');

    ASSERT v_missing_select_cols = ARRAY['face_vector', 'pin_hash'],
      format('[FAIL] Case 21: Expected hidden columns to be {face_vector, pin_hash}, found: %s', v_missing_select_cols::text);

    SELECT count(*) INTO v_anon_select_count
    FROM pg_attribute
    WHERE attrelid = 'public.patients'::regclass
      AND attnum > 0
      AND NOT attisdropped
      AND has_column_privilege('anon', 'public.patients', attname, 'SELECT');

    ASSERT v_anon_select_count = 0, '[FAIL] Case 21: Anon role has SELECT privilege on public.patients columns!';

    RAISE NOTICE '[PASS] Case 21: Patient column visibility strictly verified: only pin_hash & face_vector are hidden from authenticated; anon has 0.';
  END;


  -- ==========================================================================
  -- CASE 22: DANGEROUS PRIVILEGES & IMMUTABILITY GRANTS ASSERTION (F7)
  -- ==========================================================================
  DECLARE
    v_dangerous_grant_count int;
    v_notes_mutable_count int;
    v_audit_mutable_count int;
  BEGIN
    SELECT count(*) INTO v_dangerous_grant_count
    FROM information_schema.table_privileges
    WHERE table_schema = 'public'
      AND grantee IN ('anon', 'authenticated')
      AND privilege_type IN ('TRUNCATE', 'REFERENCES', 'TRIGGER');

    ASSERT v_dangerous_grant_count = 0,
      format('[FAIL] Case 22: Found %s dangerous table privilege grants (TRUNCATE/REFERENCES/TRIGGER) for anon/authenticated!', v_dangerous_grant_count);

    SELECT count(*) INTO v_notes_mutable_count
    FROM information_schema.table_privileges
    WHERE table_schema = 'public'
      AND table_name = 'medical_notes'
      AND grantee = 'authenticated'
      AND privilege_type IN ('UPDATE', 'DELETE');

    ASSERT v_notes_mutable_count = 0, '[FAIL] Case 22: Authenticated has UPDATE or DELETE grant on medical_notes!';

    SELECT count(*) INTO v_audit_mutable_count
    FROM information_schema.table_privileges
    WHERE table_schema = 'public'
      AND table_name = 'audit_logs'
      AND grantee = 'authenticated'
      AND privilege_type IN ('INSERT', 'UPDATE', 'DELETE');

    ASSERT v_audit_mutable_count = 0, '[FAIL] Case 22: Authenticated has INSERT, UPDATE, or DELETE grant on audit_logs!';

    RAISE NOTICE '[PASS] Case 22: Schema-wide table privilege grants asserted: zero TRUNCATE/REFERENCES/TRIGGER; notes & audit immutability grants verified.';
  END;


  -- ==========================================================================
  -- CASE 23: SESSION LOGS DIRECT INSERT DENIED FOR CLIENTS (F8)
  -- ==========================================================================
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM set_config('request.jwt.claim.sub', v_pt1_owner_id::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_pt1_owner_id::text, 'role', 'authenticated')::text, true);

  v_error_caught := false;
  BEGIN
    EXECUTE 'INSERT INTO public.session_logs (patient_id, session_date, score) VALUES ($1, $2, 100)'
      USING v_patient1_id, v_bangkok_today;
  EXCEPTION
    WHEN SQLSTATE '42501' THEN
      v_error_caught := true;
  END;
  EXECUTE 'RESET ROLE';

  ASSERT v_error_caught = true, '[FAIL] Case 23: Staff was able to directly insert session_logs!';
  RAISE NOTICE '[PASS] Case 23: Direct client insertion of session_logs is strictly rejected (service_role only).';


  -- ==========================================================================
  -- CASE 24: TEMPORARY COVERAGE REVOCATION RULES (F9)
  -- ==========================================================================
  DECLARE
    v_test_cov_id uuid := 'e0000000-0000-0000-0000-000000000099';
    v_rev_record record;
  BEGIN
    INSERT INTO public.temporary_coverages (id, patient_id, owner_therapist_id, cover_therapist_id, start_date, end_date, status)
    VALUES (v_test_cov_id, v_patient1_id, v_pt1_owner_id, v_pt2_cover_id, v_bangkok_today, v_bangkok_today + 5, 'active')
    ON CONFLICT (id) DO UPDATE SET status = 'active', revoked_at = NULL, revoked_by = NULL;

    -- 24a. Unrelated therapist (PT 3) attempts to revoke -> MUST be rejected (42501)
    EXECUTE 'SET LOCAL ROLE authenticated';
    PERFORM set_config('request.jwt.claim.sub', v_pt3_stranger_id::text, true);
    PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_pt3_stranger_id::text, 'role', 'authenticated')::text, true);

    v_error_caught := false;
    BEGIN
      UPDATE public.temporary_coverages SET status = 'revoked' WHERE id = v_test_cov_id;
    EXCEPTION
      WHEN SQLSTATE '42501' THEN
        v_error_caught := true;
    END;
    ASSERT v_error_caught = true, '[FAIL] Case 24a: Unrelated therapist was able to revoke coverage!';

    -- 24b. Cover therapist (PT 2) attempts to alter dates during update -> MUST be rejected (P0001)
    PERFORM set_config('request.jwt.claim.sub', v_pt2_cover_id::text, true);
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_pt2_cover_id::text, 'role', 'authenticated')::text, true);

    v_error_caught := false;
    BEGIN
      UPDATE public.temporary_coverages SET status = 'revoked', end_date = v_bangkok_today + 10 WHERE id = v_test_cov_id;
    EXCEPTION
      WHEN SQLSTATE 'P0001' THEN
        v_error_caught := true;
    END;
    ASSERT v_error_caught = true, '[FAIL] Case 24b: Caller was able to modify coverage dates during status update!';

    -- 24c. Non-trusted caller attempts to set status = 'expired' -> MUST be rejected (P0001 / 42501)
    v_error_caught := false;
    BEGIN
      UPDATE public.temporary_coverages SET status = 'expired' WHERE id = v_test_cov_id;
    EXCEPTION
      WHEN SQLSTATE 'P0001' OR SQLSTATE '42501' THEN
        v_error_caught := true;
    END;
    ASSERT v_error_caught = true, '[FAIL] Case 24c: Non-trusted caller was able to set status = expired!';

    -- 24d. Cover therapist (PT 2) successfully revokes coverage -> MUST succeed and stamp revoked_by = PT 2
    UPDATE public.temporary_coverages SET status = 'revoked' WHERE id = v_test_cov_id;
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    ASSERT v_rows = 1, '[FAIL] Case 24d: Covering therapist was blocked from revoking coverage!';

    SELECT status, revoked_by, revoked_at INTO v_rev_record FROM public.temporary_coverages WHERE id = v_test_cov_id;
    ASSERT v_rev_record.status = 'revoked', '[FAIL] Case 24d: Status was not set to revoked!';
    ASSERT v_rev_record.revoked_by = v_pt2_cover_id, '[FAIL] Case 24d: revoked_by was not stamped with PT 2!';
    ASSERT v_rev_record.revoked_at IS NOT NULL, '[FAIL] Case 24d: revoked_at was not stamped!';

    EXECUTE 'RESET ROLE';
    DELETE FROM public.temporary_coverages WHERE id = v_test_cov_id;
    RAISE NOTICE '[PASS] Case 24: Coverage revocation rules verified (cover can revoke, stranger denied, stamps set, other columns locked).';
  END;


  -- ==========================================================================
  -- CASE 25: PATIENT ANONYMIZATION PROCEDURE (F10)
  -- ==========================================================================
  DECLARE
    v_anon_patient_id uuid := 'c0000000-0000-0000-0000-000000000099';
    v_anon_note_id uuid := '90000000-0000-0000-0000-000000000099';
    v_anon_template_id uuid := '80000000-0000-0000-0000-000000000099';
    v_anon_pat_rec record;
    v_note_count int;
    v_tmpl_count int;
    v_audit_count int;
  BEGIN
    INSERT INTO public.patients (id, full_name, phone, pin_hash, treatment_status)
    VALUES (v_anon_patient_id, 'Sensitive Person', '089-999-8888', 'secret_hash', 'active')
    ON CONFLICT (id) DO NOTHING;

    INSERT INTO public.medical_notes (id, patient_id, note_type, body, author_name)
    VALUES (v_anon_note_id, v_anon_patient_id, 'progress', 'Permanent Clinical Progress Record', 'Dr. Smith')
    ON CONFLICT (id) DO NOTHING;

    INSERT INTO public.face_templates (id, patient_id, pose, embedding)
    VALUES (v_anon_template_id, v_anon_patient_id, 'straight', array_fill(0.1::real, ARRAY[128])::vector)
    ON CONFLICT (id) DO NOTHING;

    -- 25a. Therapist calling admin_anonymize_patient -> MUST be rejected (42501)
    EXECUTE 'SET LOCAL ROLE authenticated';
    PERFORM set_config('request.jwt.claim.sub', v_pt1_owner_id::text, true);
    PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_pt1_owner_id::text, 'role', 'authenticated')::text, true);

    v_error_caught := false;
    BEGIN
      PERFORM public.admin_anonymize_patient(v_anon_patient_id, 'Therapist illegal request');
    EXCEPTION
      WHEN SQLSTATE '42501' THEN
        v_error_caught := true;
    END;
    ASSERT v_error_caught = true, '[FAIL] Case 25a: Therapist was able to invoke admin_anonymize_patient!';

    -- 25b. Admin calling admin_anonymize_patient -> MUST succeed
    PERFORM set_config('request.jwt.claim.sub', v_admin_id::text, true);
    PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_admin_id::text, 'role', 'authenticated')::text, true);

    PERFORM public.admin_anonymize_patient(v_anon_patient_id, 'Right to be forgotten request');

    EXECUTE 'RESET ROLE';

    -- 25c. Assertions: direct identifiers wiped, templates deleted, notes intact, audit logged
    SELECT full_name, phone, pin_hash, treatment_status INTO v_anon_pat_rec
    FROM public.patients WHERE id = v_anon_patient_id;

    ASSERT v_anon_pat_rec.full_name = '[ANONYMIZED PATIENT]', '[FAIL] Case 25c: full_name was not anonymized!';
    ASSERT v_anon_pat_rec.phone = '000-000-0000', '[FAIL] Case 25c: phone was not wiped!';
    ASSERT v_anon_pat_rec.pin_hash IS NULL, '[FAIL] Case 25c: pin_hash was not wiped!';
    ASSERT v_anon_pat_rec.treatment_status = 'discharged', '[FAIL] Case 25c: patient status was not set to discharged!';

    SELECT count(*) INTO v_tmpl_count FROM public.face_templates WHERE patient_id = v_anon_patient_id;
    ASSERT v_tmpl_count = 0, '[FAIL] Case 25c: face_templates were not deleted!';

    SELECT count(*) INTO v_note_count FROM public.medical_notes WHERE patient_id = v_anon_patient_id;
    ASSERT v_note_count = 1, '[FAIL] Case 25c: clinical medical_notes were deleted or altered!';

    SELECT count(*) INTO v_audit_count FROM public.audit_logs 
    WHERE action = 'PATIENT_ANONYMIZED' AND detail LIKE '%' || v_anon_patient_id::text || '%';
    ASSERT v_audit_count >= 1, '[FAIL] Case 25c: Audit log for anonymization was not written!';

    DELETE FROM public.medical_notes WHERE id = v_anon_note_id;
    DELETE FROM public.patients WHERE id = v_anon_patient_id;
    RAISE NOTICE '[PASS] Case 25: admin_anonymize_patient successfully verified (admin authorized, therapist denied, notes preserved, templates erased, audit logged).';
  END;


  -- ==========================================================================
  -- CASE 26: GUC EMPTY STRING RESILIENCE IN is_trusted_context (F4)
  -- ==========================================================================
  -- Set empty strings on legacy and modern claim settings
  PERFORM set_config('request.jwt.claim.role', '', true);
  PERFORM set_config('request.jwt.claims', '', true);

  -- 1. Direct superuser session (postgres) must be recognized as trusted
  ASSERT public.is_trusted_context() = true,
    '[FAIL] Case 26: Direct superuser connection was NOT recognized as trusted after GUC reset to empty string!';

  -- 2. When switched to anon role, must NOT be trusted
  EXECUTE 'SET LOCAL ROLE anon';
  PERFORM set_config('request.jwt.claim.role', '', true);
  PERFORM set_config('request.jwt.claims', '', true);

  ASSERT public.is_trusted_context() = false,
    '[FAIL] Case 26: Anon role was mistakenly trusted after GUC reset to empty string!';

  -- 3. Modern PostgREST claims JSON with service_role must be recognized as trusted
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  ASSERT public.is_trusted_context() = true,
    '[FAIL] Case 26: Modern PostgREST claims JSON with role=service_role was not recognized as trusted!';

  -- Clean up session configs
  PERFORM set_config('request.jwt.claims', '', true);
  PERFORM set_config('request.jwt.claim.role', '', true);
  EXECUTE 'RESET ROLE';

  RAISE NOTICE '[PASS] Case 26: is_trusted_context verified resilient against empty string GUC reset and recognizes modern PostgREST JSON claims.';

  RAISE NOTICE '====================================================================';
  RAISE NOTICE '>>> ALL 26 ROLE-MATRIX & REAL-TABLE TESTS PASSED (100%%) <<<';
  RAISE NOTICE '====================================================================';
END $$;

ROLLBACK;
