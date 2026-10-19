-- ============================================================================
-- DR.TECH.CARE: F12 Extension Schema Search Path Behavior Test
-- Verifies behavior of SECURITY DEFINER functions accessing the vector extension
-- when search_path is restricted.
-- ============================================================================

DO $$
DECLARE
  v_res text;
BEGIN
  RAISE NOTICE '--- Running F12 Extension Schema Test ---';

  -- Test 1: definer function with search_path = public, pg_temp (strict)
  CREATE OR REPLACE FUNCTION pg_temp.fn_test_vector_strict()
  RETURNS text
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public, pg_temp
  AS $fn$
  BEGIN
    RETURN ('[1,2]'::vector)::text;
  END;
  $fn$;

  BEGIN
    v_res := pg_temp.fn_test_vector_strict();
    RAISE NOTICE '[F12 RESULT] fn_test_vector_strict (search_path=public,pg_temp) succeeded: %', v_res;
  EXCEPTION
    WHEN OTHERS THEN
      RAISE NOTICE '[F12 RESULT] fn_test_vector_strict (search_path=public,pg_temp) failed: % (SQLSTATE: %)', SQLERRM, SQLSTATE;
  END;

  -- Test 2: definer function with search_path = public, extensions, pg_temp (robust)
  CREATE OR REPLACE FUNCTION pg_temp.fn_test_vector_robust()
  RETURNS text
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public, extensions, pg_temp
  AS $fn$
  BEGIN
    RETURN ('[1,2]'::vector)::text;
  END;
  $fn$;

  BEGIN
    v_res := pg_temp.fn_test_vector_robust();
    RAISE NOTICE '[F12 RESULT] fn_test_vector_robust (search_path=public,extensions,pg_temp) succeeded: %', v_res;
  EXCEPTION
    WHEN OTHERS THEN
      RAISE NOTICE '[F12 RESULT] fn_test_vector_robust (search_path=public,extensions,pg_temp) failed: % (SQLSTATE: %)', SQLERRM, SQLSTATE;
  END;
END $$;
