#!/usr/bin/env node
/**
 * scripts/http-rls-proof.mjs
 * DR.TECH.CARE: Real HTTP-Level PostgREST & Auth RLS Proof (STEP E)
 *
 * Validates real HTTP status codes, headers, and response payloads
 * against a live Supabase project through PostgREST (not SET ROLE).
 *
 * Requirements:
 *  1. anon GET /patients -> denied
 *  2. therapist GET patients?select=pin_hash -> permission denied (42501)
 *  3. therapist B PATCH therapist A's patient -> rejected / 0 rows
 *  4. therapist POST medical_notes with a forged author_id -> stored row has caller's own id
 *  5. therapist POST audit_logs -> denied
 *  6. therapist POST session_logs -> denied
 *  7. service_role PATCH of a sensitive patient field -> succeeds (trusted)
 *  8. therapist PATCH pin_hash on own patient -> denied (F5)
 *
 * Env required:
 *  STAGING_SUPABASE_URL, STAGING_ANON_KEY, STAGING_SERVICE_ROLE_KEY
 */

import fs from 'fs';
import path from 'path';

// Automatically load .env.staging if present
const stagingEnvPath = path.resolve('.env.staging');
if (fs.existsSync(stagingEnvPath)) {
  if (typeof process.loadEnvFile === 'function') {
    process.loadEnvFile(stagingEnvPath);
  }
}

const SUPABASE_URL = process.env.STAGING_SUPABASE_URL?.replace(/\/$/, '');
const ANON_KEY = process.env.STAGING_ANON_KEY;
const SERVICE_ROLE_KEY = process.env.STAGING_SERVICE_ROLE_KEY;

console.log('========================================================');
console.log('DR.TECH.CARE: HTTP PostgREST & Auth RLS Verification');
console.log('========================================================\n');

// Prerequisite checks
const missingVars = [];
if (!SUPABASE_URL) missingVars.push('STAGING_SUPABASE_URL');
if (!ANON_KEY) missingVars.push('STAGING_ANON_KEY');
if (!SERVICE_ROLE_KEY) missingVars.push('STAGING_SERVICE_ROLE_KEY');

if (missingVars.length > 0) {
  console.error(`❌ NOT RUN: Missing environment variable(s): ${missingVars.join(', ')}`);
  console.error('   Please provide them in .env.staging or environment before running STEP E.');
  process.exit(2);
}

const REST_URL = `${SUPABASE_URL}/rest/v1`;
const AUTH_URL = `${SUPABASE_URL}/auth/v1`;

const nonce = Math.random().toString(36).substring(2, 8);
const timestamp = Date.now();
const testPassword = `P@ssw0rd_${nonce}_${timestamp}!`;

const usersToCreate = [
  { role: 'admin', username: `zz_test_admin_${nonce}`, email: `zz_test_admin_${nonce}@internal.drtechcare.hospital` },
  { role: 'therapist', username: `zz_test_pta_${nonce}`, email: `zz_test_pta_${nonce}@internal.drtechcare.hospital` },
  { role: 'therapist', username: `zz_test_ptb_${nonce}`, email: `zz_test_ptb_${nonce}@internal.drtechcare.hospital` },
];

let createdUserIds = [];
let createdPatientId = null;
let createdNoteIds = [];

// Helper for HTTP requests
async function makeRequest(url, { method = 'GET', headers = {}, body = null } = {}) {
  const reqHeaders = { ...headers };
  let reqBody = body;
  if (body && typeof body === 'object' && !(body instanceof URLSearchParams)) {
    reqHeaders['Content-Type'] = 'application/json';
    reqBody = JSON.stringify(body);
  }

  const res = await fetch(url, {
    method,
    headers: reqHeaders,
    body: reqBody,
  });

  const status = res.status;
  const statusText = res.statusText;
  let data = null;
  const rawText = await res.text();
  try {
    data = JSON.parse(rawText);
  } catch {
    data = rawText;
  }

  return { status, statusText, data, headers: res.headers };
}

async function cleanup() {
  console.log('\n--- Cleaning up temporary test fixtures ---');

  // 1. Delete test medical notes
  for (const noteId of createdNoteIds) {
    try {
      await makeRequest(`${REST_URL}/medical_notes?id=eq.${noteId}`, {
        method: 'DELETE',
        headers: {
          apikey: SERVICE_ROLE_KEY,
          Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
        },
      });
    } catch (e) {
      console.warn(`Warning: Could not delete test note ${noteId}:`, e.message);
    }
  }

  // 2. Delete test patient
  if (createdPatientId) {
    try {
      await makeRequest(`${REST_URL}/patients?id=eq.${createdPatientId}`, {
        method: 'DELETE',
        headers: {
          apikey: SERVICE_ROLE_KEY,
          Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
        },
      });
    } catch (e) {
      console.warn(`Warning: Could not delete test patient ${createdPatientId}:`, e.message);
    }
  }

  // 3. Delete test profiles
  for (const user of createdUserIds) {
    try {
      await makeRequest(`${REST_URL}/profiles?id=eq.${user.id}`, {
        method: 'DELETE',
        headers: {
          apikey: SERVICE_ROLE_KEY,
          Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
        },
      });
    } catch (e) {
      console.warn(`Warning: Could not delete test profile ${user.id}:`, e.message);
    }
  }

  // 4. Delete auth users via Admin API
  for (const user of createdUserIds) {
    try {
      await makeRequest(`${AUTH_URL}/admin/users/${user.id}`, {
        method: 'DELETE',
        headers: {
          apikey: SERVICE_ROLE_KEY,
          Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
        },
      });
      console.log(`✓ Deleted auth user ${user.email} (${user.id})`);
    } catch (e) {
      console.warn(`Warning: Could not delete auth user ${user.id}:`, e.message);
    }
  }
}

async function runProof() {
  const testResults = [];

  try {
    console.log('1. Provisioning test accounts via Auth Admin API...');
    for (const u of usersToCreate) {
      const createRes = await makeRequest(`${AUTH_URL}/admin/users`, {
        method: 'POST',
        headers: {
          apikey: SERVICE_ROLE_KEY,
          Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
        },
        body: {
          email: u.email,
          password: testPassword,
          email_confirm: true,
          user_metadata: { username: u.username },
        },
      });

      if (createRes.status !== 200 && createRes.status !== 201) {
        throw new Error(`Failed to create user ${u.email}: ${JSON.stringify(createRes.data)}`);
      }

      const userId = createRes.data.id || createRes.data.user?.id;
      u.id = userId;
      createdUserIds.push(u);
      console.log(`   ✓ Created auth user ${u.email} -> ${userId}`);

      // Upsert matching profiles row
      const profRes = await makeRequest(`${REST_URL}/profiles`, {
        method: 'POST',
        headers: {
          apikey: SERVICE_ROLE_KEY,
          Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
          Prefer: 'resolution=merge-duplicates,return=representation',
        },
        body: {
          id: userId,
          username: u.username,
          full_name: `Test User ${u.username}`,
          role: u.role,
          is_active: true,
        },
      });

      if (profRes.status >= 300) {
        throw new Error(`Failed to insert profile for ${userId}: ${JSON.stringify(profRes.data)}`);
      }
    }

    console.log('\n2. Signing in to obtain client JWT tokens via Anon Key...');
    const tokens = {};
    for (const u of usersToCreate) {
      const loginRes = await makeRequest(`${AUTH_URL}/token?grant_type=password`, {
        method: 'POST',
        headers: {
          apikey: ANON_KEY,
        },
        body: {
          email: u.email,
          password: testPassword,
        },
      });

      if (loginRes.status !== 200) {
        throw new Error(`Failed to sign in as ${u.email}: ${JSON.stringify(loginRes.data)}`);
      }

      tokens[u.role === 'admin' ? 'admin' : u.username.includes('pta') ? 'pt_a' : 'pt_b'] = loginRes.data.access_token;
      console.log(`   ✓ Signed in as ${u.username} (${u.role})`);
    }

    const ptA = usersToCreate.find(u => u.username.includes('pta'));
    const ptB = usersToCreate.find(u => u.username.includes('ptb'));
    const adminUser = usersToCreate.find(u => u.role === 'admin');

    console.log('\n3. Creating test patient assigned to Therapist A...');
    const patRes = await makeRequest(`${REST_URL}/patients`, {
      method: 'POST',
      headers: {
        apikey: SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
        Prefer: 'return=representation',
      },
      body: {
        full_name: `HTTP Proof Patient ${nonce}`,
        assigned_therapist_id: ptA.id,
        treatment_status: 'active',
        pin_hash: 'initial_hash_1234',
        progress_pct: 10.0,
      },
    });

    if (patRes.status !== 201) {
      throw new Error(`Failed to create test patient: ${JSON.stringify(patRes.data)}`);
    }

    createdPatientId = patRes.data[0].id;
    console.log(`   ✓ Created test patient ID: ${createdPatientId}`);

    console.log('\n========================================================');
    console.log('EXECUTING 8 HTTP POSTGREST RLS CHECKS');
    console.log('========================================================\n');

    // -------------------------------------------------------------------------
    // TEST 1: anon GET /patients -> denied
    // -------------------------------------------------------------------------
    {
      const res = await makeRequest(`${REST_URL}/patients`, {
        method: 'GET',
        headers: {
          apikey: ANON_KEY,
        },
      });

      const isDenied = res.status === 401 || res.status === 403 || res.data?.code === '42501';
      testResults.push({
        num: 1,
        title: 'anon GET /patients -> denied',
        status: res.status,
        bodySnippet: JSON.stringify(res.data),
        passed: isDenied,
      });
      console.log(`[HTTP 1] anon GET /patients -> Status ${res.status}: ${isDenied ? 'PASS (denied)' : 'FAIL'}`);
      console.log(`         Response: ${JSON.stringify(res.data)}\n`);
    }

    // -------------------------------------------------------------------------
    // TEST 2: therapist GET patients?select=pin_hash -> permission denied (42501)
    // -------------------------------------------------------------------------
    {
      const res = await makeRequest(`${REST_URL}/patients?select=pin_hash`, {
        method: 'GET',
        headers: {
          apikey: ANON_KEY,
          Authorization: `Bearer ${tokens.pt_a}`,
        },
      });

      const isDenied42501 = (res.status === 403 || res.status === 400) && (res.data?.code === '42501' || JSON.stringify(res.data).includes('permission denied'));
      testResults.push({
        num: 2,
        title: 'therapist GET patients?select=pin_hash -> permission denied (42501)',
        status: res.status,
        bodySnippet: JSON.stringify(res.data),
        passed: isDenied42501,
      });
      console.log(`[HTTP 2] therapist GET patients?select=pin_hash -> Status ${res.status}: ${isDenied42501 ? 'PASS (42501)' : 'FAIL'}`);
      console.log(`         Response: ${JSON.stringify(res.data)}\n`);
    }

    // -------------------------------------------------------------------------
    // TEST 3: therapist B PATCH therapist A's patient -> rejected / 0 rows
    // -------------------------------------------------------------------------
    {
      const res = await makeRequest(`${REST_URL}/patients?id=eq.${createdPatientId}`, {
        method: 'PATCH',
        headers: {
          apikey: ANON_KEY,
          Authorization: `Bearer ${tokens.pt_b}`,
          Prefer: 'return=representation',
        },
        body: {
          therapist_notes: 'Tampered by Therapist B without assignment or coverage',
        },
      });

      // PostgREST returns 200 with [] or 204 with 0 rows
      const isRejected = (res.status === 200 && Array.isArray(res.data) && res.data.length === 0) || res.status === 404 || res.status === 403;
      testResults.push({
        num: 3,
        title: "therapist B PATCH therapist A's patient -> rejected / 0 rows",
        status: res.status,
        bodySnippet: JSON.stringify(res.data),
        passed: isRejected,
      });
      console.log(`[HTTP 3] therapist B PATCH therapist A's patient -> Status ${res.status}: ${isRejected ? 'PASS (0 rows affected)' : 'FAIL'}`);
      console.log(`         Response: ${JSON.stringify(res.data)}\n`);
    }

    // -------------------------------------------------------------------------
    // TEST 4: therapist POST medical_notes with a forged author_id -> stored row has caller's own id
    // -------------------------------------------------------------------------
    {
      const res = await makeRequest(`${REST_URL}/medical_notes`, {
        method: 'POST',
        headers: {
          apikey: ANON_KEY,
          Authorization: `Bearer ${tokens.pt_a}`,
          Prefer: 'return=representation',
        },
        body: {
          patient_id: createdPatientId,
          note_type: 'pt_advice',
          body: 'Clinical exercise routine updated by therapist A.',
          author_id: adminUser.id, // Forged author ID!
          author_name: 'Forged Director', // Forged author name!
        },
      });

      let passed = false;
      let storedAuthorId = null;
      let storedAuthorName = null;

      if (res.status === 201 && Array.isArray(res.data) && res.data[0]) {
        const storedRow = res.data[0];
        createdNoteIds.push(storedRow.id);
        storedAuthorId = storedRow.author_id;
        storedAuthorName = storedRow.author_name;
        // Must be stamped with caller's own id (ptA.id) and NOT adminUser.id
        passed = (storedAuthorId === ptA.id && storedAuthorName !== 'Forged Director');
      }

      testResults.push({
        num: 4,
        title: 'therapist POST medical_notes with forged author_id -> stamped with caller own id',
        status: res.status,
        bodySnippet: `stored author_id: ${storedAuthorId}, expected: ${ptA.id}, name: ${storedAuthorName}`,
        passed,
      });
      console.log(`[HTTP 4] therapist POST medical_notes (forged author) -> Status ${res.status}: ${passed ? 'PASS (trigger stamped caller id)' : 'FAIL'}`);
      console.log(`         Stored author_id: ${storedAuthorId} (expected caller: ${ptA.id})\n`);
    }

    // -------------------------------------------------------------------------
    // TEST 5: therapist POST audit_logs -> denied
    // -------------------------------------------------------------------------
    {
      const res = await makeRequest(`${REST_URL}/audit_logs`, {
        method: 'POST',
        headers: {
          apikey: ANON_KEY,
          Authorization: `Bearer ${tokens.pt_a}`,
          Prefer: 'return=representation',
        },
        body: {
          action: 'CLIENT_FORGED_AUDIT',
          detail: 'Therapist injected fake audit trail',
        },
      });

      const isDenied = (res.status === 401 || res.status === 403 || res.data?.code === '42501');
      testResults.push({
        num: 5,
        title: 'therapist POST audit_logs -> denied',
        status: res.status,
        bodySnippet: JSON.stringify(res.data),
        passed: isDenied,
      });
      console.log(`[HTTP 5] therapist POST audit_logs -> Status ${res.status}: ${isDenied ? 'PASS (denied)' : 'FAIL'}`);
      console.log(`         Response: ${JSON.stringify(res.data)}\n`);
    }

    // -------------------------------------------------------------------------
    // TEST 6: therapist POST session_logs -> denied
    // -------------------------------------------------------------------------
    {
      const res = await makeRequest(`${REST_URL}/session_logs`, {
        method: 'POST',
        headers: {
          apikey: ANON_KEY,
          Authorization: `Bearer ${tokens.pt_a}`,
          Prefer: 'return=representation',
        },
        body: {
          patient_id: createdPatientId,
          session_date: new Date().toISOString().split('T')[0],
          score: 95,
        },
      });

      const isDenied = (res.status === 401 || res.status === 403 || res.data?.code === '42501');
      testResults.push({
        num: 6,
        title: 'therapist POST session_logs -> denied',
        status: res.status,
        bodySnippet: JSON.stringify(res.data),
        passed: isDenied,
      });
      console.log(`[HTTP 6] therapist POST session_logs -> Status ${res.status}: ${isDenied ? 'PASS (denied)' : 'FAIL'}`);
      console.log(`         Response: ${JSON.stringify(res.data)}\n`);
    }

    // -------------------------------------------------------------------------
    // TEST 7: service_role PATCH of a sensitive patient field -> succeeds (trusted)
    // -------------------------------------------------------------------------
    {
      const res = await makeRequest(`${REST_URL}/patients?id=eq.${createdPatientId}`, {
        method: 'PATCH',
        headers: {
          apikey: SERVICE_ROLE_KEY,
          Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
          Prefer: 'return=representation',
        },
        body: {
          progress_pct: 88.5,
          assigned_therapist_id: ptB.id, // Sensitive reassignment
        },
      });

      const isSuccess = (res.status === 200 || res.status === 204) && Array.isArray(res.data) && res.data[0]?.progress_pct === 88.5;
      testResults.push({
        num: 7,
        title: 'service_role PATCH sensitive patient field -> succeeds (trusted)',
        status: res.status,
        bodySnippet: JSON.stringify(res.data),
        passed: isSuccess,
      });
      console.log(`[HTTP 7] service_role PATCH sensitive field -> Status ${res.status}: ${isSuccess ? 'PASS (trusted update applied)' : 'FAIL'}`);
      console.log(`         Response: ${JSON.stringify(res.data)}\n`);
    }

    // -------------------------------------------------------------------------
    // TEST 8: therapist PATCH pin_hash on own patient -> denied (F5)
    // -------------------------------------------------------------------------
    {
      const res = await makeRequest(`${REST_URL}/patients?id=eq.${createdPatientId}`, {
        method: 'PATCH',
        headers: {
          apikey: ANON_KEY,
          Authorization: `Bearer ${tokens.pt_a}`,
          Prefer: 'return=representation',
        },
        body: {
          pin_hash: 'hacked_pin_hash',
        },
      });

      const isDenied = (res.status === 403 || res.status === 400) && (res.data?.code === '42501' || JSON.stringify(res.data).includes('permission denied'));
      testResults.push({
        num: 8,
        title: 'therapist PATCH pin_hash on patient -> denied (F5 column privilege)',
        status: res.status,
        bodySnippet: JSON.stringify(res.data),
        passed: isDenied,
      });
      console.log(`[HTTP 8] therapist PATCH pin_hash -> Status ${res.status}: ${isDenied ? 'PASS (column-level write denied 42501)' : 'FAIL'}`);
      console.log(`         Response: ${JSON.stringify(res.data)}\n`);
    }

    // Summary table
    console.log('========================================================');
    console.log('STEP E: HTTP PROOF TEST SUMMARY RESULTS');
    console.log('========================================================');
    let allPassed = true;
    for (const t of testResults) {
      console.log(`Test ${t.num}: [${t.passed ? 'PASS' : 'FAIL'}] ${t.title} (HTTP ${t.status})`);
      if (!t.passed) allPassed = false;
    }

    if (allPassed) {
      console.log('\n🎉 ALL 8 HTTP POSTGREST RLS CHECKS PASSED (100%)');
    } else {
      console.error('\n❌ ONE OR MORE HTTP POSTGREST RLS CHECKS FAILED');
      process.exitCode = 1;
    }
  } catch (err) {
    console.error('\n❌ Unhandled exception during HTTP RLS proof:');
    console.error(err);
    process.exitCode = 1;
  } finally {
    await cleanup();
  }
}

runProof();
