-- ==============================================================================
-- DR.TECH.CARE — DATABASE MIGRATION 20261015100002: MEDICAL NOTES DATA MIGRATION
-- Stack: Supabase PostgreSQL (Idempotent data copy from patients to medical_notes)
-- ==============================================================================

do $$
declare
  r record;
begin
  -- 1. Copy treatment_outcome -> medical_notes (note_type: 'outcome_rom')
  for r in (
    select id, treatment_outcome, responsible_therapist_id, created_at
    from public.patients
    where treatment_outcome is not null and trim(treatment_outcome) != '' and trim(treatment_outcome) != '-'
  ) loop
    if not exists (
      select 1 from public.medical_notes
      where patient_id = r.id and note_type = 'outcome_rom' and body like '%[Imported]%'
    ) then
      insert into public.medical_notes (
        patient_id,
        note_type,
        body,
        author_id,
        author_name,
        created_at
      ) values (
        r.id,
        'outcome_rom',
        '[Imported] ' || r.treatment_outcome,
        r.responsible_therapist_id,
        'Imported Record',
        coalesce(r.created_at, now())
      );
    end if;
  end loop;

  -- 2. Copy therapist_notes -> medical_notes (note_type: 'pt_advice')
  for r in (
    select id, therapist_notes, responsible_therapist_id, created_at
    from public.patients
    where therapist_notes is not null and trim(therapist_notes) != '' and trim(therapist_notes) != '-'
  ) loop
    if not exists (
      select 1 from public.medical_notes
      where patient_id = r.id and note_type = 'pt_advice' and body like '%[Imported]%'
    ) then
      insert into public.medical_notes (
        patient_id,
        note_type,
        body,
        author_id,
        author_name,
        created_at
      ) values (
        r.id,
        'pt_advice',
        '[Imported] ' || r.therapist_notes,
        r.responsible_therapist_id,
        'Imported Record',
        coalesce(r.created_at, now())
      );
    end if;
  end loop;

end $$;
