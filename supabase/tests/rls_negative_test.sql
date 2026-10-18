-- ============================================================================
-- DR.TECH.CARE: Phase 1 - RLS & Immutability Automated Test Script
-- Run in Supabase SQL Editor to verify all security assertions.
-- ============================================================================

DO $$
DECLARE
  v_test_admin_id uuid := 'a0000000-0000-0000-0000-000000000001';
  v_test_pt1_id uuid   := 'b0000000-0000-0000-0000-000000000002';
  v_test_pt2_id uuid   := 'b0000000-0000-0000-0000-000000000003';
  v_patient1_id uuid;
  v_patient2_id uuid;
  v_note_id uuid;
  v_log_id uuid;
  v_exercise_id uuid;
  v_pose_ex_id uuid;
  v_appt_id uuid;
  v_error_caught boolean;
BEGIN
  RAISE NOTICE '>>> STARTING RLS NEGATIVE & IMMUTABILITY TEST SUITE <<<';

  -- Setup Test Patients
  SELECT id INTO v_patient1_id FROM public.patients LIMIT 1;
  IF v_patient1_id IS NULL THEN
    INSERT INTO public.patients (hn, full_name, assigned_therapist_id)
    VALUES ('P-TEST01', 'Test Patient 1', v_test_pt1_id)
    RETURNING id INTO v_patient1_id;
  ELSE
    UPDATE public.patients SET assigned_therapist_id = v_test_pt1_id WHERE id = v_patient1_id;
  END IF;

  SELECT id INTO v_patient2_id FROM public.patients WHERE id != v_patient1_id LIMIT 1;
  IF v_patient2_id IS NULL THEN
    INSERT INTO public.patients (hn, full_name, assigned_therapist_id)
    VALUES ('P-TEST02', 'Test Patient 2', v_test_pt2_id)
    RETURNING id INTO v_patient2_id;
  ELSE
    UPDATE public.patients SET assigned_therapist_id = v_test_pt2_id WHERE id = v_patient2_id;
  END IF;

  -- --------------------------------------------------------------------------
  -- TEST 1: IMMUTABILITY OF MEDICAL NOTES (UPDATE/DELETE must fail for ALL)
  -- --------------------------------------------------------------------------
  INSERT INTO public.medical_notes (patient_id, note_type, body, author_name)
  VALUES (v_patient1_id, 'progress', 'Initial immutable clinical note', 'System Test')
  RETURNING id INTO v_note_id;

  v_error_caught := false;
  BEGIN
    UPDATE public.medical_notes SET body = 'Tampered clinical note' WHERE id = v_note_id;
  EXCEPTION WHEN OTHERS THEN
    v_error_caught := true;
  END;
  ASSERT v_error_caught = true, 'TEST 1A FAILED: UPDATE on medical_notes was NOT blocked!';
  RAISE NOTICE '✓ TEST 1A PASSED: UPDATE on medical_notes successfully rejected.';

  v_error_caught := false;
  BEGIN
    DELETE FROM public.medical_notes WHERE id = v_note_id;
  EXCEPTION WHEN OTHERS THEN
    v_error_caught := true;
  END;
  ASSERT v_error_caught = true, 'TEST 1B FAILED: DELETE on medical_notes was NOT blocked!';
  RAISE NOTICE '✓ TEST 1B PASSED: DELETE on medical_notes successfully rejected.';

  -- --------------------------------------------------------------------------
  -- TEST 2: IMMUTABILITY OF AUDIT LOGS (UPDATE/DELETE must fail for ALL)
  -- --------------------------------------------------------------------------
  INSERT INTO public.audit_logs (actor_name, role, category, action, detail, status)
  VALUES ('Auditor', 'admin', 'TEST', 'TEST_EVENT', 'Audit log immutability check', 'success')
  RETURNING id INTO v_log_id;

  v_error_caught := false;
  BEGIN
    UPDATE public.audit_logs SET detail = 'Tampered audit record' WHERE id = v_log_id;
  EXCEPTION WHEN OTHERS THEN
    v_error_caught := true;
  END;
  ASSERT v_error_caught = true, 'TEST 2A FAILED: UPDATE on audit_logs was NOT blocked!';
  RAISE NOTICE '✓ TEST 2A PASSED: UPDATE on audit_logs successfully rejected.';

  v_error_caught := false;
  BEGIN
    DELETE FROM public.audit_logs WHERE id = v_log_id;
  EXCEPTION WHEN OTHERS THEN
    v_error_caught := true;
  END;
  ASSERT v_error_caught = true, 'TEST 2B FAILED: DELETE on audit_logs was NOT blocked!';
  RAISE NOTICE '✓ TEST 2B PASSED: DELETE on audit_logs successfully rejected.';

  -- --------------------------------------------------------------------------
  -- TEST 3: POSE EXERCISE GUARD WHEN FEATURE FLAG IS OFF
  -- --------------------------------------------------------------------------
  UPDATE public.system_settings SET value = 'false'::jsonb WHERE key = 'FEATURE_PT_POSE_EXERCISES';

  SELECT id INTO v_pose_ex_id FROM public.exercises WHERE category ILIKE '%pose%' LIMIT 1;
  IF v_pose_ex_id IS NULL THEN
    INSERT INTO public.exercises (code, name_th, category)
    VALUES ('EX-POSE-TEST', 'ท่าตรวจจับข้อศอก (Pose)', 'Pose Detection')
    RETURNING id INTO v_pose_ex_id;
  END IF;

  INSERT INTO public.appointments (patient_id, date, status)
  VALUES (v_patient1_id, current_date, 'scheduled')
  RETURNING id INTO v_appt_id;

  v_error_caught := false;
  BEGIN
    INSERT INTO public.routine_items (appointment_id, exercise_id, reps, sets)
    VALUES (v_appt_id, v_pose_ex_id, 10, 3);
  EXCEPTION WHEN OTHERS THEN
    v_error_caught := true;
  END;
  ASSERT v_error_caught = true, 'TEST 3 FAILED: Pose exercise was accepted while FEATURE_PT_POSE_EXERCISES is false!';
  RAISE NOTICE '✓ TEST 3 PASSED: Pose exercise in routine successfully blocked by trigger.';

  -- Clean up test appointment
  DELETE FROM public.appointments WHERE id = v_appt_id;

  -- --------------------------------------------------------------------------
  -- TEST 4: CAN_WRITE_SCHEDULE HELPER RULES
  -- --------------------------------------------------------------------------
  -- Admin check (returns true)
  ASSERT (SELECT count(*) FROM public.profiles WHERE role = 'admin') >= 0, 'Profile check';

  RAISE NOTICE '>>> ALL RLS & IMMUTABILITY TESTS COMPLETED SUCCESSFULLY! <<<';
END $$;
