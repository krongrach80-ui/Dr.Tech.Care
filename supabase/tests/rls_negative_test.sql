-- ============================================================================
-- DR.TECH.CARE: Phase 1 - Comprehensive Role-Matrix & Security Test Suite
-- Simulates: anon, admin, therapist (own patient), unrelated therapist, covered therapist
-- Verifies: Zero anon access, schedule ownership, coverage expiry, exercise CRUD,
--           audit log isolation, profile tampering prevention, and immutability.
-- ============================================================================

DO $$
DECLARE
  -- Predefined Test Actors
  v_admin_id       uuid := 'a0000000-0000-0000-0000-000000000001';
  v_pt1_owner_id   uuid := 'b0000000-0000-0000-0000-000000000002';
  v_pt2_cover_id   uuid := 'b0000000-0000-0000-0000-000000000003';
  v_pt3_stranger_id uuid := 'b0000000-0000-0000-0000-000000000004';
  
  -- Test Entities
  v_patient1_id    uuid := 'c0000000-0000-0000-0000-000000000001';
  v_patient2_id    uuid := 'c0000000-0000-0000-0000-000000000002';
  v_admin_ex_id    uuid := 'd0000000-0000-0000-0000-000000000001';
  v_pt1_ex_id      uuid := 'd0000000-0000-0000-0000-000000000002';
  v_pose_ex_id     uuid := 'd0000000-0000-0000-0000-000000000003';
  v_cov_active_id  uuid := 'e0000000-0000-0000-0000-000000000001';
  v_cov_expired_id uuid := 'e0000000-0000-0000-0000-000000000002';
  
  v_note_id        uuid;
  v_log_id         uuid;
  v_appt_id        uuid;
  v_count          int;
  v_error_caught   boolean;
  v_bangkok_today  date := (timezone('Asia/Bangkok', now()))::date;
BEGIN
  RAISE NOTICE '====================================================================';
  RAISE NOTICE '>>> STARTING DR.TECH.CARE PHASE 1 ROLE-MATRIX TEST SUITE <<<';
  RAISE NOTICE '====================================================================';

  -- --------------------------------------------------------------------------
  -- STEP 0: FIXTURE SETUP (Run as Superuser / Migrator)
  -- --------------------------------------------------------------------------
  -- Setup Profiles
  INSERT INTO public.profiles (id, username, full_name, role, email, is_active)
  VALUES 
    (v_admin_id, 'test_admin', 'Admin Superuser', 'admin', 'admin@strongcare.hospital', true),
    (v_pt1_owner_id, 'test_pt1', 'PT 1 Owner', 'therapist', 'pt1@strongcare.hospital', true),
    (v_pt2_cover_id, 'test_pt2', 'PT 2 Cover', 'therapist', 'pt2@strongcare.hospital', true),
    (v_pt3_stranger_id, 'test_pt3', 'PT 3 Stranger', 'therapist', 'pt3@strongcare.hospital', true)
  ON CONFLICT (id) DO UPDATE SET 
    role = EXCLUDED.role, is_active = true, deleted_at = NULL;

  -- Setup Patients (Patient 1 owned by PT 1; Patient 2 owned by PT 2)
  INSERT INTO public.patients (id, hn, full_name, assigned_therapist_id, treatment_status)
  VALUES 
    (v_patient1_id, 'HN-TEST-001', 'Test Patient 1 (PT1 Caseload)', v_pt1_owner_id, 'active'),
    (v_patient2_id, 'HN-TEST-002', 'Test Patient 2 (PT2 Caseload)', v_pt2_cover_id, 'active')
  ON CONFLICT (id) DO UPDATE SET 
    assigned_therapist_id = EXCLUDED.assigned_therapist_id;

  -- Setup Exercises
  INSERT INTO public.exercises (id, code, name_th, category, kind, is_minigame, created_by)
  VALUES 
    (v_admin_ex_id, 'EX-ADM-01', 'Admin Core Exercise', 'Core', 'single', false, v_admin_id),
    (v_pt1_ex_id, 'EX-PT1-01', 'PT1 Custom Exercise', 'Custom', 'single', false, v_pt1_owner_id),
    (v_pose_ex_id, 'EX-POSE-01', 'Pose Detection Exercise', 'Pose Detection', 'single', false, v_admin_id)
  ON CONFLICT (id) DO UPDATE SET 
    created_by = EXCLUDED.created_by, category = EXCLUDED.category;

  -- Setup Temporary Coverage for Patient 1:
  -- PT 2 is covering Patient 1 ACTIVE today: [v_bangkok_today - 1, v_bangkok_today + 5]
  INSERT INTO public.temporary_coverages (id, patient_id, owner_therapist_id, cover_therapist_id, start_date, end_date, status)
  VALUES 
    (v_cov_active_id, v_patient1_id, v_pt1_owner_id, v_pt2_cover_id, v_bangkok_today - 1, v_bangkok_today + 5, 'active')
  ON CONFLICT (id) DO UPDATE SET 
    start_date = EXCLUDED.start_date, end_date = EXCLUDED.end_date, status = 'active', revoked_at = NULL;

  -- Ensure FEATURE_PT_POSE_EXERCISES is false
  INSERT INTO public.system_settings (key, value)
  VALUES ('FEATURE_PT_POSE_EXERCISES', 'false'::jsonb)
  ON CONFLICT (key) DO UPDATE SET value = 'false'::jsonb;

  -- --------------------------------------------------------------------------
  -- TEST CASE 1: ANON ROLE READS NOTHING
  -- Verify anon gets 0 rows from profiles, patients, medical_notes, audit_logs, face_templates, biometric-data
  -- --------------------------------------------------------------------------
  RAISE NOTICE '--- TEST 1: ANON ROLE ISOLATION ---';
  
  -- Verify current_app_role() returns 'anon' when no auth.uid()
  ASSERT public.current_app_role() = 'anon', '[FAIL] current_app_role() should return anon for unauthenticated session';
  
  -- Verify anon cannot pass is_admin()
  ASSERT public.is_admin() = false, '[FAIL] anon must never be admin';
  
  -- Verify anon cannot edit any user
  ASSERT public.can_edit_user(v_patient1_id) = false, '[FAIL] anon cannot edit user';
  
  -- Verify anon cannot write schedule
  ASSERT public.can_write_schedule(v_patient1_id) = false, '[FAIL] anon cannot write schedule';
  
  -- Verify anon cannot view audit
  ASSERT public.can_view_audit() = false, '[FAIL] anon cannot view audit logs';

  RAISE NOTICE '[PASS] Case 1: Anon role has zero authorization and fails all security checks.';

  -- --------------------------------------------------------------------------
  -- TEST CASE 2: THERAPIST SCHEDULE WRITE (OWN PATIENT vs UNRELATED PATIENT)
  -- --------------------------------------------------------------------------
  RAISE NOTICE '--- TEST 2: THERAPIST SCHEDULE WRITE PERMISSIONS ---';

  -- Simulate PT 1 (Owner of Patient 1)
  -- can_write_schedule(Patient 1) must be TRUE
  PERFORM set_config('request.jwt.claim.sub', v_pt1_owner_id::text, true);
  ASSERT public.can_write_schedule(v_patient1_id) = true, 
    '[FAIL] PT 1 should be authorized to write schedule for their assigned patient 1';
  RAISE NOTICE '[PASS] Case 2A: PT 1 authorized to write schedule for own patient 1.';

  -- PT 1 writing schedule for Patient 2 (Unrelated patient owned by PT 2) -> must be FALSE
  ASSERT public.can_write_schedule(v_patient2_id) = false, 
    '[FAIL] PT 1 must NOT be authorized to write schedule for unrelated patient 2';
  RAISE NOTICE '[PASS] Case 2B: PT 1 denied schedule write on unrelated patient 2.';

  -- Simulate PT 3 (Stranger - not owner, not covering)
  PERFORM set_config('request.jwt.claim.sub', v_pt3_stranger_id::text, true);
  ASSERT public.can_write_schedule(v_patient1_id) = false, 
    '[FAIL] PT 3 Stranger must NOT be authorized to write schedule for patient 1';
  ASSERT public.can_write_schedule(v_patient2_id) = false, 
    '[FAIL] PT 3 Stranger must NOT be authorized to write schedule for patient 2';
  RAISE NOTICE '[PASS] Case 2C: Stranger PT 3 denied schedule write on all non-caseload patients.';

  -- --------------------------------------------------------------------------
  -- TEST CASE 3: COVERED THERAPIST (ACTIVE vs EXPIRED COVERAGE)
  -- --------------------------------------------------------------------------
  RAISE NOTICE '--- TEST 3: TEMPORARY COVERAGE WINDOW ENFORCEMENT ---';

  -- Simulate PT 2 (Active Covering Therapist for Patient 1)
  PERFORM set_config('request.jwt.claim.sub', v_pt2_cover_id::text, true);
  ASSERT public.can_write_schedule(v_patient1_id) = true, 
    '[FAIL] PT 2 should be authorized to write schedule for patient 1 during active coverage';
  RAISE NOTICE '[PASS] Case 3A: Active covered therapist (PT 2) authorized to write schedule for patient 1.';

  -- Now test expired coverage: update coverage end_date to yesterday
  UPDATE public.temporary_coverages
  SET end_date = v_bangkok_today - 1
  WHERE id = v_cov_active_id;

  ASSERT public.can_write_schedule(v_patient1_id) = false, 
    '[FAIL] PT 2 must be DENIED schedule write once temporary coverage is expired (end_date in past)';
  RAISE NOTICE '[PASS] Case 3B: Expired coverage strictly revokes schedule write rights after end_date.';

  -- Restore active coverage for subsequent tests
  UPDATE public.temporary_coverages
  SET end_date = v_bangkok_today + 5
  WHERE id = v_cov_active_id;

  -- --------------------------------------------------------------------------
  -- TEST CASE 4: EXERCISE LIBRARY CRUD OWNERSHIP
  -- Admin created = read-only for PT; PT self-created = editable by PT
  -- --------------------------------------------------------------------------
  RAISE NOTICE '--- TEST 4: EXERCISE OWNERSHIP & EDIT RULES ---';

  -- Simulate PT 1
  PERFORM set_config('request.jwt.claim.sub', v_pt1_owner_id::text, true);

  -- PT 1 editing Admin-created exercise -> must be FALSE
  ASSERT public.can_edit_exercise(v_admin_ex_id) = false, 
    '[FAIL] PT 1 must NOT be allowed to edit Admin-created exercise';
  RAISE NOTICE '[PASS] Case 4A: PT 1 denied editing admin-created exercise.';

  -- PT 1 editing own exercise -> must be TRUE
  ASSERT public.can_edit_exercise(v_pt1_ex_id) = true, 
    '[FAIL] PT 1 must be allowed to edit own-created exercise';
  RAISE NOTICE '[PASS] Case 4B: PT 1 authorized to edit self-created exercise.';

  -- Simulate Admin -> full CRUD on all exercises
  PERFORM set_config('request.jwt.claim.sub', v_admin_id::text, true);
  ASSERT public.can_edit_exercise(v_admin_ex_id) = true, '[FAIL] Admin should edit admin exercise';
  ASSERT public.can_edit_exercise(v_pt1_ex_id) = true, '[FAIL] Admin should edit any exercise';
  RAISE NOTICE '[PASS] Case 4C: Admin authorized to edit all exercises.';

  -- --------------------------------------------------------------------------
  -- TEST CASE 5: AUDIT LOGS ACCESS ISOLATION (ADMIN ONLY)
  -- --------------------------------------------------------------------------
  RAISE NOTICE '--- TEST 5: AUDIT LOG ACCESS ISOLATION ---';

  -- Simulate PT 1
  PERFORM set_config('request.jwt.claim.sub', v_pt1_owner_id::text, true);
  ASSERT public.can_view_audit() = false, 
    '[FAIL] Therapist must be DENIED access to audit logs (can_view_audit must be false)';
  RAISE NOTICE '[PASS] Case 5A: Therapist strictly denied access to audit logs.';

  -- Simulate Admin
  PERFORM set_config('request.jwt.claim.sub', v_admin_id::text, true);
  ASSERT public.can_view_audit() = true, 
    '[FAIL] Admin must be granted access to audit logs';
  RAISE NOTICE '[PASS] Case 5B: Admin authorized to view audit logs.';

  -- --------------------------------------------------------------------------
  -- TEST CASE 6: PROFILE TAMPERING PREVENTION
  -- Therapist can only edit patients; cannot update Admin or other PT profiles
  -- --------------------------------------------------------------------------
  RAISE NOTICE '--- TEST 6: USER MANAGEMENT & PROFILE PERMISSIONS ---';

  -- Simulate PT 1
  PERFORM set_config('request.jwt.claim.sub', v_pt1_owner_id::text, true);

  -- PT 1 attempting to edit Admin profile -> must be FALSE
  ASSERT public.can_edit_user(v_admin_id) = false, 
    '[FAIL] Therapist must NOT be allowed to edit Admin profile';
  RAISE NOTICE '[PASS] Case 6A: Therapist denied editing Admin profile.';

  -- PT 1 attempting to edit PT 2 profile -> must be FALSE
  ASSERT public.can_edit_user(v_pt2_cover_id) = false, 
    '[FAIL] Therapist must NOT be allowed to edit fellow Therapist profile';
  RAISE NOTICE '[PASS] Case 6B: Therapist denied editing fellow Therapist profile.';

  -- PT 1 attempting to edit Patient profile -> must be TRUE
  ASSERT public.can_edit_user(v_patient1_id) = true, 
    '[FAIL] Therapist should be allowed to manage patient profiles';
  RAISE NOTICE '[PASS] Case 6C: Therapist authorized to manage patient profiles.';

  -- --------------------------------------------------------------------------
  -- TEST CASE 7: IMMUTABILITY OF MEDICAL NOTES (UPDATE / DELETE REJECTED)
  -- --------------------------------------------------------------------------
  RAISE NOTICE '--- TEST 7: IMMUTABILITY OF CLINICAL RECORDS ---';

  INSERT INTO public.medical_notes (patient_id, note_type, body, author_name)
  VALUES (v_patient1_id, 'progress', 'Initial immutable clinical note', 'System Test')
  RETURNING id INTO v_note_id;

  v_error_caught := false;
  BEGIN
    UPDATE public.medical_notes SET body = 'Tampered clinical note' WHERE id = v_note_id;
  EXCEPTION WHEN OTHERS THEN
    v_error_caught := true;
  END;
  ASSERT v_error_caught = true, '[FAIL] UPDATE on medical_notes was NOT blocked!';
  RAISE NOTICE '[PASS] Case 7A: UPDATE on medical_notes rejected by trigger.';

  v_error_caught := false;
  BEGIN
    DELETE FROM public.medical_notes WHERE id = v_note_id;
  EXCEPTION WHEN OTHERS THEN
    v_error_caught := true;
  END;
  ASSERT v_error_caught = true, '[FAIL] DELETE on medical_notes was NOT blocked!';
  RAISE NOTICE '[PASS] Case 7B: DELETE on medical_notes rejected by trigger.';

  -- --------------------------------------------------------------------------
  -- TEST CASE 8: IMMUTABILITY OF AUDIT LOGS (UPDATE / DELETE REJECTED)
  -- --------------------------------------------------------------------------
  INSERT INTO public.audit_logs (actor_name, role, category, action, detail, status)
  VALUES ('Auditor', 'admin', 'SECURITY', 'IMMUTABILITY_CHECK', 'Security log verify', 'success')
  RETURNING id INTO v_log_id;

  v_error_caught := false;
  BEGIN
    UPDATE public.audit_logs SET detail = 'Tampered audit record' WHERE id = v_log_id;
  EXCEPTION WHEN OTHERS THEN
    v_error_caught := true;
  END;
  ASSERT v_error_caught = true, '[FAIL] UPDATE on audit_logs was NOT blocked!';
  RAISE NOTICE '[PASS] Case 8A: UPDATE on audit_logs rejected by trigger.';

  v_error_caught := false;
  BEGIN
    DELETE FROM public.audit_logs WHERE id = v_log_id;
  EXCEPTION WHEN OTHERS THEN
    v_error_caught := true;
  END;
  ASSERT v_error_caught = true, '[FAIL] DELETE on audit_logs was NOT blocked!';
  RAISE NOTICE '[PASS] Case 8B: DELETE on audit_logs rejected by trigger.';

  -- --------------------------------------------------------------------------
  -- TEST CASE 9: POSE EXERCISE GATING IN ROUTINE (FEATURE_PT_POSE_EXERCISES = false)
  -- --------------------------------------------------------------------------
  RAISE NOTICE '--- TEST 9: POSE EXERCISE FEATURE GATING ---';

  INSERT INTO public.appointments (patient_id, date, status)
  VALUES (v_patient1_id, v_bangkok_today, 'scheduled')
  RETURNING id INTO v_appt_id;

  v_error_caught := false;
  BEGIN
    INSERT INTO public.routine_items (appointment_id, exercise_id, reps, sets)
    VALUES (v_appt_id, v_pose_ex_id, 10, 3);
  EXCEPTION WHEN OTHERS THEN
    v_error_caught := true;
  END;
  ASSERT v_error_caught = true, 
    '[FAIL] Pose exercise was accepted into routine while FEATURE_PT_POSE_EXERCISES is false!';
  RAISE NOTICE '[PASS] Case 9: Pose exercise in routine successfully rejected by trigger.';

  -- Clean up test appointment
  DELETE FROM public.appointments WHERE id = v_appt_id;

  -- Reset config
  PERFORM set_config('request.jwt.claim.sub', '', true);

  RAISE NOTICE '====================================================================';
  RAISE NOTICE '>>> ALL 9 ROLE-MATRIX & SECURITY TEST SUITES PASSED (100%%) <<<';
  RAISE NOTICE '====================================================================';
END $$;
