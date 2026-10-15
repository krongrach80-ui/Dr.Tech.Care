-- ==============================================================================
-- DR.TECH.CARE — PHASE P0 NEGATIVE-CASE SQL TEST SUITE
-- Verifies server-side authorization enforcement, triggers, and immutable rules
-- ==============================================================================

begin;

-- Create temporary mock users
insert into public.profiles (id, username, full_name, role)
values
  ('11111111-1111-1111-1111-111111111111', 'admin_tester', 'Dr. Director Admin', 'admin'),
  ('22222222-2222-2222-2222-222222222222', 'pt_owner', 'PT Primary Owner', 'therapist'),
  ('33333333-3333-3333-3333-333333333333', 'pt_cover', 'PT Cover Candidate', 'therapist'),
  ('44444444-4444-4444-4444-444444444444', 'patient_tester', 'Patient Somchai', 'patient')
on conflict (id) do nothing;

insert into public.patients (id, profile_id, patient_code, full_name, responsible_therapist_id)
values
  ('55555555-5555-5555-5555-555555555555', '44444444-4444-4444-4444-444444444444', 'P-TEST', 'Patient Somchai', '22222222-2222-2222-2222-222222222222')
on conflict (id) do nothing;

-- -----------------------------------------------------------------------------
-- TEST 1: can_edit_user()
-- -----------------------------------------------------------------------------
-- 1A: Admin can edit any user -> true
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
do $$
begin
  if not public.can_edit_user('22222222-2222-2222-2222-222222222222') then
    raise exception 'Test 1A Failed: Admin should be able to edit therapist';
  end if;
end $$;

-- 1B: PT cannot edit Admin -> false (Negative Case)
select set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);
do $$
begin
  if public.can_edit_user('11111111-1111-1111-1111-111111111111') then
    raise exception 'Test 1B Failed: PT must NOT be allowed to edit Admin';
  end if;
end $$;

-- 1C: PT cannot edit another PT -> false (Negative Case)
do $$
begin
  if public.can_edit_user('33333333-3333-3333-3333-333333333333') then
    raise exception 'Test 1C Failed: PT must NOT be allowed to edit another PT';
  end if;
end $$;

-- 1D: PT CAN edit a Patient -> true
do $$
begin
  if not public.can_edit_user('44444444-4444-4444-4444-444444444444') then
    raise exception 'Test 1D Failed: PT should be allowed to edit a Patient';
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- TEST 2: can_write_schedule()
-- -----------------------------------------------------------------------------
-- 2A: Owner PT can write schedule -> true
select set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);
do $$
begin
  if not public.can_write_schedule('55555555-5555-5555-5555-555555555555') then
    raise exception 'Test 2A Failed: Primary PT must be allowed to write schedule';
  end if;
end $$;

-- 2B: Unrelated PT CANNOT write schedule -> false (Negative Case)
select set_config('request.jwt.claim.sub', '33333333-3333-3333-3333-333333333333', true);
do $$
begin
  if public.can_write_schedule('55555555-5555-5555-5555-555555555555') then
    raise exception 'Test 2B Failed: Unrelated PT must NOT be allowed to write schedule';
  end if;
end $$;

-- 2C: With active temporary coverage, Cover PT CAN write schedule -> true
insert into public.temporary_coverages (
  patient_id, owner_pt_id, cover_pt_id, start_date, end_date, status
) values (
  '55555555-5555-5555-5555-555555555555',
  '22222222-2222-2222-2222-222222222222',
  '33333333-3333-3333-3333-333333333333',
  current_date - 1,
  current_date + 1,
  'active'
);

do $$
begin
  if not public.can_write_schedule('55555555-5555-5555-5555-555555555555') then
    raise exception 'Test 2C Failed: Active covering PT should be allowed to write schedule';
  end if;
end $$;

-- 2D: With expired coverage, Cover PT CANNOT write schedule -> false (Negative Case)
update public.temporary_coverages
set status = 'expired'
where cover_pt_id = '33333333-3333-3333-3333-333333333333';

do $$
begin
  if public.can_write_schedule('55555555-5555-5555-5555-555555555555') then
    raise exception 'Test 2D Failed: Expired covering PT must NOT be allowed to write schedule';
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- TEST 3: Medical Notes Immutability
-- -----------------------------------------------------------------------------
select set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);
insert into public.medical_notes (id, patient_id, note_type, body)
values ('66666666-6666-6666-6666-666666666666', '55555555-5555-5555-5555-555555555555', 'progress', 'Initial progress text');

-- 3A: UPDATE on medical_notes must throw exception (Negative Case)
do $$
declare
  v_caught boolean := false;
begin
  begin
    update public.medical_notes
    set body = 'Tampered text'
    where id = '66666666-6666-6666-6666-666666666666';
  exception when others then
    v_caught := true;
  end;
  
  if not v_caught then
    raise exception 'Test 3A Failed: UPDATE on medical_notes was not blocked by trigger';
  end if;
end $$;

-- 3B: DELETE on medical_notes must throw exception (Negative Case)
do $$
declare
  v_caught boolean := false;
begin
  begin
    delete from public.medical_notes where id = '66666666-6666-6666-6666-666666666666';
  exception when others then
    v_caught := true;
  end;
  
  if not v_caught then
    raise exception 'Test 3B Failed: DELETE on medical_notes was not blocked by trigger';
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- TEST 4: Pose Exercise Rejection when Flag is Disabled
-- -----------------------------------------------------------------------------
insert into public.exercises (id, slug, name_th, is_minigame)
values ('77777777-7777-7777-7777-777777777777', 'shoulder-abduction-test', 'ยกไหล่ด้านข้าง', false)
on conflict (id) do nothing;

insert into public.appointments (id, patient_id, scheduled_date)
values ('88888888-8888-8888-8888-888888888888', '55555555-5555-5555-5555-555555555555', current_date)
on conflict (id) do nothing;

-- Ensure FEATURE_PT_POSE_EXERCISES is false
update public.system_settings
set value = '{"FEATURE_PT_POSE_EXERCISES": false}'::jsonb
where key = 'feature_flags';

do $$
declare
  v_caught boolean := false;
begin
  begin
    insert into public.routine_items (appointment_id, exercise_id)
    values ('88888888-8888-8888-8888-888888888888', '77777777-7777-7777-7777-777777777777');
  exception when sqlstate '22000' then
    v_caught := true;
  end;

  if not v_caught then
    raise exception 'Test 4 Failed: Routine item with pose exercise must be rejected when FEATURE_PT_POSE_EXERCISES is false';
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- TEST 5: Audit Log Access
-- -----------------------------------------------------------------------------
-- 5A: PT cannot view audit -> false (Negative Case)
select set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);
do $$
begin
  if public.can_view_audit() then
    raise exception 'Test 5A Failed: PT must NOT have can_view_audit permission';
  end if;
end $$;

-- 5B: Admin CAN view audit -> true
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
do $$
begin
  if not public.can_view_audit() then
    raise exception 'Test 5B Failed: Admin must have can_view_audit permission';
  end if;
end $$;

rollback;
-- All tests completed and rolled back cleanly!
