// testMultiDeviceSync.js
// Automated verification for Central Backend API, SSE Real-Time Sync, and Face Biometrics
import http from 'http';
import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = 5000;
const BASE_URL = `http://127.0.0.1:${PORT}`;

function httpRequest(method, endpoint, data = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(endpoint, BASE_URL);
    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method: method,
      headers: {
        'Content-Type': 'application/json',
        ...headers
      }
    };

    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(body);
          resolve({ status: res.statusCode, data: parsed, headers: res.headers });
        } catch {
          resolve({ status: res.statusCode, text: body, headers: res.headers });
        }
      });
    });

    req.on('error', reject);

    if (data) {
      req.write(typeof data === 'string' ? data : JSON.stringify(data));
    }
    req.end();
  });
}

function listenSSE(endpoint, durationMs = 3000) {
  const events = [];
  let req;
  const promise = new Promise((resolve) => {
    const url = new URL(endpoint, BASE_URL);
    req = http.request({
      hostname: url.hostname,
      port: url.port,
      path: url.pathname,
      method: 'GET',
      headers: { Accept: 'text/event-stream' }
    }, (res) => {
      res.on('data', (chunk) => {
        const str = chunk.toString();
        const lines = str.split('\n');
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              events.push(JSON.parse(line.slice(6)));
            } catch {
              // Non-JSON SSE ping or text
            }
          }
        }
      });
    });

    req.on('error', () => {});
    req.end();

    setTimeout(() => {
      try { req.destroy(); } catch {}
      resolve(events);
    }, durationMs);
  });

  return { promise, abort: () => { try { req.destroy(); } catch {} } };
}

async function ensureServerRunning() {
  try {
    const res = await httpRequest('GET', '/api/health');
    if (res.status === 200) {
      console.log('✓ Found running central server at ' + BASE_URL);
      return null;
    }
  } catch {}

  console.log('Starting central server in background for testing (node backend/server.js)...');
  const serverProc = spawn('node', [path.join(__dirname, '..', 'backend', 'server.js')], {
    stdio: 'inherit',
    windowsHide: true
  });

  // Wait for server to become responsive
  for (let i = 0; i < 20; i++) {
    await new Promise(r => setTimeout(r, 250));
    try {
      const res = await httpRequest('GET', '/api/health');
      if (res.status === 200) {
        console.log('✓ Central server spawned successfully on ' + BASE_URL);
        return serverProc;
      }
    } catch {}
  }
  throw new Error('Failed to start central server within 5 seconds');
}

async function run() {
  console.log('============================================================');
  console.log('STRONG CARE - MULTI-DEVICE DATA SYNCHRONIZATION TEST SUITE');
  console.log('============================================================\n');

  let spawnedServer = null;
  try {
    spawnedServer = await ensureServerRunning();
    // 1. Health Check
    console.log('[TEST 1] Testing Central Backend Health & Network Discovery...');
    const healthRes = await httpRequest('GET', '/api/health');
    if (healthRes.status !== 200 || !healthRes.data.local_ips) {
      throw new Error(`Health check failed: ${JSON.stringify(healthRes)}`);
    }
    console.log(`✓ Central Server Healthy! Detected LAN IPs: ${healthRes.data.local_ips.join(', ')}`);
    console.log(`✓ Active Patients in Central DB: ${healthRes.data.total_patients}\n`);

    // 2. Real-Time SSE Listener
    console.log('[TEST 2] Setting up real-time SSE listener (Doctor Dashboard subscriber)...');
    const sseSession = listenSSE('/api/sync/events', 4000);

    // Small delay to ensure SSE connection is established
    await new Promise(r => setTimeout(r, 600));

    // 3. Register Patient from Kiosk
    console.log('[TEST 3] Simulating Kiosk patient face registration (POST /api/patients/register-face)...');
    const dummyFaceVector = Array(128).fill(0).map((_, i) => Math.sin(i * 0.15));
    const testPatientCode = `TEST-${Date.now().toString().slice(-4)}`;
    const registerPayload = {
      patient_code: testPatientCode,
      name: 'ทดสอบ ซิงค์หลายเครื่อง (Automated Test)',
      age: 45,
      gender: 'female',
      notes: 'ทดสอบระบบซิงค์ Real-Time ข้ามเครื่อง',
      phone: '089-999-8888',
      face_vector: dummyFaceVector,
      face_image_base64: 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP...',
      created_at: new Date().toISOString()
    };

    const regRes = await httpRequest('POST', '/api/patients/register-face', registerPayload);
    if (regRes.status !== 200 && regRes.status !== 201) {
      throw new Error(`Registration failed: ${JSON.stringify(regRes)}`);
    }
    console.log(`✓ Kiosk registration succeeded! Patient Code: ${testPatientCode}`);
    console.log(`✓ Server response: ${regRes.data.message}`);

    // 4. Verify Single Source of Truth: GET /api/patients
    console.log('\n[TEST 4] Verifying Single Source of Truth (GET /api/patients)...');
    const listRes = await httpRequest('GET', '/api/patients');
    const patientsList = Array.isArray(listRes.data) ? listRes.data : (listRes.data?.data || []);
    if (listRes.status !== 200 || !Array.isArray(patientsList)) {
      throw new Error(`GET /api/patients failed: ${JSON.stringify(listRes)}`);
    }
    const found = patientsList.find(p => p.code === testPatientCode || p.patient_code === testPatientCode);
    if (!found) {
      throw new Error(`Newly registered patient ${testPatientCode} not found in central database!`);
    }
    console.log(`✓ Patient ${testPatientCode} successfully verified in central DB!`);
    console.log(`✓ Stored fields: Name="${found.name}", FaceVectorLength=${found.face_vector?.length}`);

    // 5. Verify Biometric Face Recognition on Central Server
    console.log('\n[TEST 5] Testing Central Biometric Verification (POST /api/face/verify)...');
    // Matching face vector (with slight natural sensor noise)
    const noisyProbeVector = dummyFaceVector.map(v => v + (Math.random() - 0.5) * 0.02);
    const verifyRes = await httpRequest('POST', '/api/face/verify', { face_vector: noisyProbeVector });
    if (verifyRes.status !== 200 || !verifyRes.data.match) {
      throw new Error(`Face verification failed: ${JSON.stringify(verifyRes)}`);
    }
    console.log(`✓ Face matched successfully! Identified as: ${verifyRes.data.patient.name} (${verifyRes.data.patient.code || verifyRes.data.patient.patient_code})`);
    console.log(`✓ Biometric Confidence: ${verifyRes.data.similarity_percent}% (Threshold: 85%)`);

    // 6. Verify SSE Broadcast Arrival
    console.log('\n[TEST 6] Awaiting SSE events captured during registration...');
    const capturedEvents = await sseSession.promise;
    console.log(`✓ Captured ${capturedEvents.length} real-time SSE event(s)!`);
    const regEvent = capturedEvents.find(e => 
      (e.type === 'PATIENT_ENROLLED' || e.type === 'PATIENT_REGISTERED' || e.type === 'ENROLLED_PENDING') &&
      (e.user?.code === testPatientCode || e.patient?.patient_code === testPatientCode || e.patient?.code === testPatientCode)
    );
    if (!regEvent) {
      console.warn('Note: SSE event list:', capturedEvents);
      throw new Error('Expected PATIENT_ENROLLED, PATIENT_REGISTERED, or ENROLLED_PENDING SSE event not received by subscriber!');
    }
    console.log(`✓ Real-time SSE broadcast confirmed for ${testPatientCode}! Event type: ${regEvent.type}`);

    // 7. Verify Cleanup / Delete Synchronization
    console.log('\n[TEST 7] Cleaning up test patient from central database (DELETE /api/patients/:id)...');
    const delRes = await httpRequest('DELETE', `/api/patients/${found.id}`);
    if (delRes.status !== 200) {
      throw new Error(`DELETE failed: ${JSON.stringify(delRes)}`);
    }
    console.log(`✓ Patient ${testPatientCode} deleted successfully from central database.`);

    console.log('\n============================================================');
    console.log('ALL 7 MULTI-DEVICE SYNCHRONIZATION TESTS PASSED SUCCESSFULLY!');
    console.log('Central Database & Real-Time SSE Architecture is fully verified.');
    console.log('============================================================');
  } finally {
    if (spawnedServer) {
      console.log('Stopping test central server instance...');
      spawnedServer.kill();
    }
  }
}

run().catch(err => {
  console.error('\n❌ TEST FAILED:', err.message);
  process.exit(1);
});
