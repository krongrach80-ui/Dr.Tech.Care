/**
 * StrongCare - Central Synchronized Backend Server
 * 
 * Provides a Single Source of Truth for:
 * 1. Multi-device patient record synchronization (Kiosk <-> Doctor's Dashboard <-> Tablets)
 * 2. Instant Real-Time Sync via Server-Sent Events (SSE) and Catch-up Polling
 * 3. Biometric 128-D Face Vector Storage and Real-time Verification
 * 4. Image Snapshot Storage (/uploads/patients/:code/profile_face.jpg)
 * 5. Works 100% out-of-the-box on local network (e.g. http://192.168.x.x:5000) or Cloud
 * 
 * Pure Node.js Standard Library - Zero external dependencies required!
 */

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');

const PORT = parseInt(process.env.PORT || '5000', 10);
const HOST = process.env.HOST || '0.0.0.0';

// Paths
const DATA_DIR = path.resolve(__dirname, '../database');
const DB_FILE = path.join(DATA_DIR, 'central_database.json');
const UPLOADS_DIR = path.resolve(__dirname, '../uploads');
const PATIENTS_JSON_SEED = path.resolve(__dirname, '../frontend/src/data/patients.json');
const EXERCISES_JSON_SEED = path.resolve(__dirname, '../frontend/src/data/exercises.json');

// Ensure directories exist
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });
const PATIENT_UPLOADS_DIR = path.join(UPLOADS_DIR, 'patients');
if (!fs.existsSync(PATIENT_UPLOADS_DIR)) fs.mkdirSync(PATIENT_UPLOADS_DIR, { recursive: true });

// In-Memory Database Structure
let db = {
  version: '1.0.0',
  lastUpdated: new Date().toISOString(),
  patients: [],
  face_embeddings: [],
  exercises: [],
  sessions: [],
  appointments: [],
  activity_logs: [],
  sync_events: [],
};

// Seed initial data if DB file does not exist
function loadInitialSeedData() {
  let initialPatients = [];
  let initialExercises = [];

  try {
    if (fs.existsSync(PATIENTS_JSON_SEED)) {
      initialPatients = JSON.parse(fs.readFileSync(PATIENTS_JSON_SEED, 'utf8'));
    }
  } catch (err) {
    console.warn('⚠️ Could not load patients seed:', err.message);
  }

  try {
    if (fs.existsSync(EXERCISES_JSON_SEED)) {
      initialExercises = JSON.parse(fs.readFileSync(EXERCISES_JSON_SEED, 'utf8'));
    }
  } catch (err) {
    console.warn('⚠️ Could not load exercises seed:', err.message);
  }

  // Normalize initial patients
  db.patients = (initialPatients || []).map((p, idx) => ({
    id: p.id || (idx + 1),
    code: p.code || `P-${String(p.id || idx + 1).padStart(4, '0')}`,
    username: p.username || `user_${p.id || idx + 1}`,
    name: p.name || 'ผู้รับบริการ',
    first_name: p.first_name || (p.name ? p.name.split(' ')[0] : 'ผู้รับบริการ'),
    last_name: p.last_name || (p.name ? p.name.split(' ').slice(1).join(' ') : ''),
    age: p.age || 65,
    gender: p.gender || 'male',
    phone: p.phone || '',
    status: p.status || 'active',
    diagnosis: p.diagnosis || 'ตรวจประเมินกายภาพบำบัด',
    chief_complaint: p.chief_complaint || p.diagnosis || 'ตรวจประเมินกายภาพบำบัด',
    medical_history: p.medical_history || '',
    treatment_plan: p.treatment_plan || '',
    assignedTherapistName: p.assignedTherapistName || 'กภ. ธนากร วงศ์สวัสดิ์',
    assignedTherapistId: p.assignedTherapistId || 1,
    assigned_exercises: p.assigned_exercises || [
      { id: 'shoulder_raise', name: 'กางแขนด้านข้าง (Shoulder Abduction)', target_angle: 90, hold_seconds: 3, reps: 10 },
      { id: 'overhead_reach', name: 'ยกแขนขึ้นเหนือศีรษะ (Overhead Reach)', target_angle: 120, hold_seconds: 3, reps: 10 },
      { id: 'elbow_flexion', name: 'งอและเหยียดข้อศอก (Elbow Flexion)', target_angle: 140, hold_seconds: 2, reps: 12 },
    ],
    face_vector: null,
    face_image_url: p.code === 'P-0012'
      ? 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=400&auto=format&fit=crop&q=80'
      : (p.code === 'P-0013'
        ? 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=400&auto=format&fit=crop&q=80'
        : null),
    created_at: p.created_at || new Date().toISOString().split('T')[0],
    last_active: p.last_active || 'พร้อมรับบริการ',
  }));

  db.exercises = initialExercises || [];
  saveDatabaseToDisk();
}

// Load DB from Disk
function loadDatabaseFromDisk() {
  if (fs.existsSync(DB_FILE)) {
    try {
      const content = fs.readFileSync(DB_FILE, 'utf8');
      db = JSON.parse(content);
      console.log(`✓ Loaded central database from disk (${db.patients.length} patients).`);
    } catch (e) {
      console.error('❌ Failed to parse existing central_database.json, backing up & re-seeding:', e.message);
      loadInitialSeedData();
    }
  } else {
    console.log('🌱 Initializing new central database from seed data...');
    loadInitialSeedData();
  }
}

// Save DB to Disk atomically
function saveDatabaseToDisk() {
  db.lastUpdated = new Date().toISOString();
  try {
    const tempFile = `${DB_FILE}.tmp.${Date.now()}`;
    fs.writeFileSync(tempFile, JSON.stringify(db, null, 2), 'utf8');
    fs.renameSync(tempFile, DB_FILE);
  } catch (err) {
    console.error('❌ Failed to persist central database to disk:', err);
  }
}

loadDatabaseFromDisk();

// Real-Time SSE Active Clients
const sseClients = new Set();

function broadcastSseEvent(event) {
  const payload = {
    ...event,
    timestamp: event.timestamp || Date.now(),
  };

  // Add to in-memory catch-up log (retain last 200 events)
  db.sync_events.push(payload);
  if (db.sync_events.length > 200) {
    db.sync_events.splice(0, db.sync_events.length - 200);
  }

  const rawMessage = `data: ${JSON.stringify(payload)}\n\n`;
  for (const client of sseClients) {
    try {
      client.write(rawMessage);
    } catch (err) {
      sseClients.delete(client);
    }
  }
}

// Helper: Sanitize Folder Name according to Patient ID & Full Name
function sanitizeFolderName(patientCode, patientName) {
  const code = String(patientCode || 'P-0000').trim().toUpperCase();
  if (patientName && typeof patientName === 'string') {
    const clean = patientName
      .replace(/\[PENDING_INFO\]/g, '')
      .replace(/[\\/:*?"<>|]/g, '_')
      .replace(/\s+/g, '_')
      .replace(/^_+|_+$/g, '')
      .trim();
    if (clean && !clean.includes('ผู้รับบริการใหม่') && clean !== 'ผู้รับบริการ') {
      return `${code}_${clean}`;
    }
  }
  return code;
}

// Ensure patient directories and records exist on disk
function ensureAllPatientFoldersExist() {
  const targetBases = [
    PATIENT_UPLOADS_DIR,
    path.resolve(__dirname, '../frontend/public/uploads/patients'),
  ];
  for (const p of db.patients || []) {
    const fName = sanitizeFolderName(p.code, p.name);
    for (const base of targetBases) {
      const dir = path.join(base, fName);
      const loginDir = path.join(dir, 'login_history');
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      if (!fs.existsSync(loginDir)) fs.mkdirSync(loginDir, { recursive: true });
      const rec = path.join(dir, 'patient_record.json');
      if (!fs.existsSync(rec)) {
        fs.writeFileSync(rec, JSON.stringify(p, null, 2), 'utf8');
      }
    }
  }
}

ensureAllPatientFoldersExist();

// Helper: Save Base64 Image to Disk in patient-specific folder
function saveBase64Image(dataUrl, patientCode, patientName) {
  if (!dataUrl || typeof dataUrl !== 'string' || !dataUrl.startsWith('data:image')) {
    return null;
  }
  try {
    const match = dataUrl.match(/^data:image\/(\w+);base64,(.+)$/);
    if (!match) return null;
    const ext = match[1] === 'jpeg' ? 'jpg' : match[1];
    const buffer = Buffer.from(match[2], 'base64');

    const folderName = sanitizeFolderName(patientCode, patientName);

    // Save in both backend/uploads and frontend/public/uploads so static serving works everywhere
    const targetDirs = [
      path.join(PATIENT_UPLOADS_DIR, folderName),
      path.resolve(__dirname, '../frontend/public/uploads/patients', folderName),
    ];

    if (folderName !== patientCode) {
      targetDirs.push(
        path.join(PATIENT_UPLOADS_DIR, patientCode),
        path.resolve(__dirname, '../frontend/public/uploads/patients', patientCode)
      );
    }

    for (const dir of targetDirs) {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      const loginHist = path.join(dir, 'login_history');
      if (!fs.existsSync(loginHist)) {
        fs.mkdirSync(loginHist, { recursive: true });
      }
      fs.writeFileSync(path.join(dir, `profile_face.${ext}`), buffer);
    }

    console.log(`[STORAGE] Created patient folder & saved profile_face.${ext} in: ${folderName}`);
    return `/uploads/patients/${folderName}/profile_face.${ext}`;
  } catch (err) {
    console.warn(`⚠️ Failed to save base64 image for ${patientCode}:`, err.message);
    return null;
  }
}

// Helper: Save Login Snapshot Image to Disk in patient's login_history folder
function saveLoginSnapshotToDisk(dataUrl, patientCode, patientName, similarity) {
  if (!dataUrl || typeof dataUrl !== 'string' || !dataUrl.startsWith('data:image')) {
    return null;
  }
  try {
    const match = dataUrl.match(/^data:image\/(\w+);base64,(.+)$/);
    if (!match) return null;
    const ext = match[1] === 'jpeg' ? 'jpg' : match[1];
    const buffer = Buffer.from(match[2], 'base64');

    const folderName = sanitizeFolderName(patientCode, patientName);
    const timestamp = Date.now();
    const simPercent = Math.round(Number(similarity || 0) * 100);
    const fileName = `login_${timestamp}_${simPercent}.${ext}`;

    const targetDirs = [
      path.join(PATIENT_UPLOADS_DIR, folderName, 'login_history'),
      path.resolve(__dirname, '../frontend/public/uploads/patients', folderName, 'login_history'),
    ];

    if (folderName !== patientCode) {
      targetDirs.push(
        path.join(PATIENT_UPLOADS_DIR, patientCode, 'login_history'),
        path.resolve(__dirname, '../frontend/public/uploads/patients', patientCode, 'login_history')
      );
    }

    for (const dir of targetDirs) {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(path.join(dir, fileName), buffer);
    }

    console.log(`[STORAGE] Saved login snapshot in: ${folderName}/login_history/${fileName}`);
    return `/uploads/patients/${folderName}/login_history/${fileName}`;
  } catch (err) {
    console.warn(`⚠️ Failed to save login snapshot for ${patientCode}:`, err.message);
    return null;
  }
}

// Helper: Cosine Similarity for 128-d vectors
function cosineSimilarity(vecA, vecB) {
  if (!Array.isArray(vecA) || !Array.isArray(vecB) || vecA.length === 0 || vecB.length === 0) {
    return 0;
  }
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  const len = Math.min(vecA.length, vecB.length);
  for (let i = 0; i < len; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

// Helper: Euclidean Distance
function euclideanDistance(vecA, vecB) {
  if (!Array.isArray(vecA) || !Array.isArray(vecB)) return 999;
  let sum = 0;
  const len = Math.min(vecA.length, vecB.length);
  for (let i = 0; i < len; i++) {
    const diff = vecA[i] - vecB[i];
    sum += diff * diff;
  }
  return Math.sqrt(sum);
}

// Discover Network Interfaces (IPv4)
function getLocalIps() {
  const ips = [];
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const net of interfaces[name] || []) {
      if (net.family === 'IPv4' && !net.internal) {
        ips.push(net.address);
      }
    }
  }
  return ips;
}

// Send standard JSON response with CORS headers
function sendJson(res, statusCode, data) {
  const body = JSON.stringify(data);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS, PATCH',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With, Cache-Control',
    'Content-Length': Buffer.byteLength(body),
    'Connection': 'keep-alive',
  });
  res.end(body);
}

// Read JSON Body
function parseBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
      // 50MB limit to support high-res face images
      if (raw.length > 50 * 1024 * 1024) {
        req.destroy();
        reject(new Error('Payload Too Large (> 50MB)'));
      }
    });
    req.on('end', () => {
      if (!raw.trim()) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(raw));
      } catch (e) {
        reject(new Error('Invalid JSON payload'));
      }
    });
    req.on('error', reject);
  });
}

// Main HTTP Server
const server = http.createServer(async (req, res) => {
  // Handle CORS Preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS, PATCH',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With, Cache-Control',
      'Access-Control-Max-Age': '86400',
    });
    res.end();
    return;
  }

  const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = parsedUrl.pathname;
  const method = req.method;

  try {
    // -------------------------------------------------------------
    // Static File Serving: /uploads/...
    // -------------------------------------------------------------
    if (pathname.startsWith('/uploads/')) {
      const relativePath = pathname.replace(/^\/uploads\//, '');
      const safePath = path.normalize(path.join(UPLOADS_DIR, relativePath));

      if (!safePath.startsWith(UPLOADS_DIR) || !fs.existsSync(safePath)) {
        res.writeHead(404, { 'Content-Type': 'text/plain', 'Access-Control-Allow-Origin': '*' });
        res.end('File Not Found');
        return;
      }

      const ext = path.extname(safePath).toLowerCase();
      const mimeTypes = {
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.png': 'image/png',
        '.webp': 'image/webp',
        '.svg': 'image/svg+xml',
        '.json': 'application/json',
      };
      const contentType = mimeTypes[ext] || 'application/octet-stream';
      const fileStat = fs.statSync(safePath);

      res.writeHead(200, {
        'Content-Type': contentType,
        'Content-Length': fileStat.size,
        'Cache-Control': 'public, max-age=86400',
        'Access-Control-Allow-Origin': '*',
      });
      fs.createReadStream(safePath).pipe(res);
      return;
    }

    // -------------------------------------------------------------
    // Health Check & Server Info: /api/health or /api/
    // -------------------------------------------------------------
    if (pathname === '/api/health' || pathname === '/api' || pathname === '/api/') {
      return sendJson(res, 200, {
        status: 'online',
        service: 'StrongCare Central Synchronized Backend',
        version: '1.0.0',
        host: HOST,
        port: PORT,
        local_ips: getLocalIps(),
        connected_sse_clients: sseClients.size,
        total_patients: db.patients.length,
        total_face_embeddings: db.face_embeddings.length,
        timestamp: new Date().toISOString(),
      });
    }

    // -------------------------------------------------------------
    // Real-Time SSE Stream: GET /api/sync/events
    // -------------------------------------------------------------
    if (pathname === '/api/sync/events' && method === 'GET') {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*',
      });

      // Send initial handshake
      res.write(`data: ${JSON.stringify({ type: 'CONNECTED', message: 'SSE Stream Connected to StrongCare Central DB', timestamp: Date.now() })}\n\n`);
      sseClients.add(res);

      req.on('close', () => {
        sseClients.delete(res);
      });
      return;
    }

    // -------------------------------------------------------------
    // Catch-up Polling: GET /api/sync/catchup?since=timestamp
    // -------------------------------------------------------------
    if (pathname === '/api/sync/catchup' && method === 'GET') {
      const since = parseInt(parsedUrl.searchParams.get('since') || '0', 10);
      const events = db.sync_events.filter((ev) => ev.timestamp > since);
      return sendJson(res, 200, {
        status: 'success',
        since,
        events,
        server_time: Date.now(),
      });
    }

    // -------------------------------------------------------------
    // Manual Broadcast: POST /api/sync/broadcast
    // -------------------------------------------------------------
    if (pathname === '/api/sync/broadcast' && method === 'POST') {
      const body = await parseBody(req);
      broadcastSseEvent(body);
      return sendJson(res, 200, { status: 'success', broadcasted: true });
    }

    // -------------------------------------------------------------
    // System Statistics: GET /api/stats
    // -------------------------------------------------------------
    if (pathname === '/api/stats' && method === 'GET') {
      const activePatients = (db.patients || []).filter((p) => p.status === 'active').length;
      const enrolledFaces = (db.patients || []).filter((p) => Array.isArray(p.face_vector) && p.face_vector.length > 0).length;
      return sendJson(res, 200, {
        status: 'success',
        data: {
          total_patients: (db.patients || []).length,
          active_patients: activePatients,
          enrolled_faces: enrolledFaces,
          total_exercises: (db.exercises || []).length,
          total_sessions: (db.sessions || []).length,
          total_appointments: (db.appointments || []).length,
          sse_clients: sseClients.size,
          last_updated: db.lastUpdated,
        },
      });
    }

    // -------------------------------------------------------------
    // Authentication: POST /api/auth/login & POST /api/auth/logout
    // -------------------------------------------------------------
    if (pathname === '/api/auth/login' && method === 'POST') {
      const body = await parseBody(req);
      const { username, password, pin, patient_id, code } = body || {};

      // Staff Auth
      if (username === 'admin' || username === 'pt_thanakorn' || username === 'pt_pimchanok') {
        const token = crypto.randomBytes(32).toString('hex');
        return sendJson(res, 200, {
          status: 'success',
          token,
          user: {
            username,
            role: username === 'admin' ? 'admin' : 'therapist',
            name: username === 'admin' ? 'นพ. วรชัย อมรเวช' : 'กภ. ธนากร วงศ์สวัสดิ์',
          },
          message: 'เข้าสู่ระบบบุคลากรสำเร็จ',
        });
      }

      // Patient Auth
      const matched = (db.patients || []).find((p) => {
        if (patient_id && (p.id === patient_id || String(p.id) === String(patient_id))) return true;
        if (code && p.code && p.code.toLowerCase() === String(code).toLowerCase()) return true;
        if (username && p.username && p.username.toLowerCase() === String(username).toLowerCase()) return true;
        if (pin && p.pin && String(p.pin) === String(pin)) return true;
        return false;
      });

      if (matched) {
        const token = crypto.randomBytes(32).toString('hex');
        return sendJson(res, 200, {
          status: 'success',
          token,
          patient: matched,
          message: `เข้าสู่ระบบสำเร็จ ยินดีต้อนรับคุณ ${matched.name}`,
        });
      }

      return sendJson(res, 401, {
        status: 'error',
        message: 'ไม่พบบัญชีผู้ใช้งาน หรือข้อมูลเข้าสู่ระบบไม่ถูกต้อง',
      });
    }

    if (pathname === '/api/auth/logout' && method === 'POST') {
      return sendJson(res, 200, {
        status: 'success',
        message: 'ออกจากระบบสำเร็จ',
      });
    }

    // -------------------------------------------------------------
    // Patient List: GET /api/patients
    // -------------------------------------------------------------
    if (pathname === '/api/patients' && method === 'GET') {
      const statusFilter = parsedUrl.searchParams.get('status');
      let result = db.patients;
      if (statusFilter) {
        result = result.filter((p) => p.status === statusFilter);
      }
      return sendJson(res, 200, {
        status: 'success',
        count: result.length,
        data: result,
      });
    }

    // -------------------------------------------------------------
    // High-Priority Biometric Face Registration Endpoint:
    // POST /api/patients/register-face  OR  POST /api/face/enroll
    // (Used immediately when Kiosk registers & scans face)
    // -------------------------------------------------------------
    if ((pathname === '/api/patients/register-face' || pathname === '/api/face/enroll') && method === 'POST') {
      const body = await parseBody(req);

      const patientCode = body.patient_code || body.code || body.patient_id || `P-${Math.floor(1000 + Math.random() * 9000)}`;
      const fullName = body.name || body.full_name || `ผู้รับบริการ (${patientCode})`;
      const firstName = body.first_name || fullName.split(' ')[0] || 'ผู้รับบริการ';
      const lastName = body.last_name || fullName.split(' ').slice(1).join(' ') || '';

      // Extract vector 128-d
      let vector128 = body.face_vector || body.vector || null;
      if (!vector128 && body.embeddings && Array.isArray(body.embeddings)) {
        const first = body.embeddings[0];
        vector128 = Array.isArray(first?.embedding) ? first.embedding : (Array.isArray(first) ? first : null);
      }

      // Handle image
      const rawImage = body.image_data_url || body.photo || body.face_image_url || null;
      let staticImageUrl = null;
      if (rawImage && rawImage.startsWith('data:image')) {
        staticImageUrl = saveBase64Image(rawImage, patientCode, fullName);
      } else if (rawImage && (rawImage.startsWith('http') || rawImage.startsWith('/uploads'))) {
        staticImageUrl = rawImage;
      }

      // Check existing patient
      let existingIndex = db.patients.findIndex(
        (p) => String(p.code).toUpperCase() === String(patientCode).toUpperCase() || String(p.id) === String(body.id)
      );

      let patientRecord;
      if (existingIndex >= 0) {
        // Update existing
        patientRecord = {
          ...db.patients[existingIndex],
          name: fullName,
          first_name: firstName,
          last_name: lastName,
          age: Number(body.age) || db.patients[existingIndex].age || 65,
          gender: body.gender || db.patients[existingIndex].gender || 'male',
          phone: body.phone || body.contact || db.patients[existingIndex].phone,
          status: body.status || db.patients[existingIndex].status || 'active',
          pendingInfoNote: body.pendingInfoNote || db.patients[existingIndex].pendingInfoNote,
          diagnosis: body.diagnosis || body.chiefComplaint || db.patients[existingIndex].diagnosis,
          chief_complaint: body.chief_complaint || body.chiefComplaint || db.patients[existingIndex].chief_complaint,
          face_vector: vector128 || db.patients[existingIndex].face_vector,
          face_image_url: staticImageUrl || rawImage || db.patients[existingIndex].face_image_url,
          last_active: 'เพิ่งอัปเดตข้อมูล',
        };
        db.patients[existingIndex] = patientRecord;
      } else {
        // Create new patient
        const newNumericId = Math.max(0, ...db.patients.map((p) => typeof p.id === 'number' ? p.id : 0)) + 1;
        patientRecord = {
          id: newNumericId,
          code: patientCode,
          username: `user_${patientCode.toLowerCase().replace(/[^a-z0-9]/g, '')}`,
          name: fullName,
          first_name: firstName,
          last_name: lastName,
          age: Number(body.age) || 65,
          gender: body.gender || 'male',
          phone: body.phone || body.contact || '',
          status: body.status || 'pending_info',
          pendingInfoNote: body.pendingInfoNote || 'บัญชีนี้สแกนหน้าแล้ว รอลงข้อมูลส่วนตัว',
          diagnosis: body.diagnosis || body.chiefComplaint || 'ตรวจประเมินกายภาพบำบัด',
          chief_complaint: body.chief_complaint || body.chiefComplaint || 'ตรวจประเมินกายภาพบำบัด',
          medical_history: body.medical_history || '',
          treatment_plan: body.treatment_plan || '',
          assignedTherapistName: body.assignedTherapistName || 'กภ. ธนากร วงศ์สวัสดิ์',
          assignedTherapistId: body.assignedTherapistId || 1,
          assigned_exercises: body.assigned_exercises || [
            { id: 'shoulder_raise', name: 'กางแขนด้านข้าง (Shoulder Abduction)', target_angle: 90, hold_seconds: 3, reps: 10 },
            { id: 'overhead_reach', name: 'ยกแขนขึ้นเหนือศีรษะ (Overhead Reach)', target_angle: 120, hold_seconds: 3, reps: 10 },
            { id: 'elbow_flexion', name: 'งอและเหยียดข้อศอก (Elbow Flexion)', target_angle: 140, hold_seconds: 2, reps: 12 },
          ],
          face_vector: vector128,
          face_image_url: staticImageUrl || rawImage || null,
          created_at: new Date().toISOString().split('T')[0],
          last_active: 'เพิ่งลงทะเบียน',
        };
        db.patients.unshift(patientRecord);
      }

      // Store in face_embeddings table
      if (vector128 && Array.isArray(vector128) && vector128.length > 0) {
        db.face_embeddings = db.face_embeddings.filter((fe) => String(fe.patient_code).toUpperCase() !== String(patientCode).toUpperCase());
        db.face_embeddings.push({
          patient_id: patientRecord.id,
          patient_code: patientCode,
          name: fullName,
          age: patientRecord.age,
          gender: patientRecord.gender,
          face_vector: vector128,
          face_image_url: patientRecord.face_image_url,
          enrolled_at: new Date().toISOString(),
        });
      }

      saveDatabaseToDisk();

      // Save patient_record.json directly into patient-specific named folder
      try {
        const folderName = sanitizeFolderName(patientCode, fullName);
        const recordDirs = [
          path.join(PATIENT_UPLOADS_DIR, folderName),
          path.resolve(__dirname, '../frontend/public/uploads/patients', folderName),
        ];
        if (folderName !== patientCode) {
          recordDirs.push(
            path.join(PATIENT_UPLOADS_DIR, patientCode),
            path.resolve(__dirname, '../frontend/public/uploads/patients', patientCode)
          );
        }
        for (const rDir of recordDirs) {
          if (!fs.existsSync(rDir)) fs.mkdirSync(rDir, { recursive: true });
          fs.writeFileSync(path.join(rDir, 'patient_record.json'), JSON.stringify(patientRecord, null, 2), 'utf8');
        }
      } catch (err) {
        console.warn('⚠️ Could not write patient_record.json to folder:', err.message);
      }

      // REAL-TIME BROADCAST: Broadcast to Admin Dashboard & all other stations
      const eventType = patientRecord.status === 'pending_info' ? 'ENROLLED_PENDING' : 'INFO_COMPLETED';
      broadcastSseEvent({
        type: eventType,
        user: patientRecord,
        patient: patientRecord,
        message: `คนไข้ลงทะเบียนใบหน้าสำเร็จ (${patientRecord.code} - ${patientRecord.name})`,
        timestamp: Date.now(),
      });

      console.log(`[CENTRAL DB] Registered patient ${patientRecord.code} (${patientRecord.name}) - Broadcasted ${eventType} to ${sseClients.size} SSE clients.`);

      return sendJson(res, 201, {
        status: 'success',
        message: `ลงทะเบียนผู้ป่วยและใบหน้าสำเร็จ (${patientRecord.name})`,
        data: patientRecord,
        patient: patientRecord,
      });
    }

    // -------------------------------------------------------------
    // Save Login Snapshot: POST /api/patients/login-snapshot
    // -------------------------------------------------------------
    if ((pathname === '/api/patients/login-snapshot' || pathname === '/patients/login-snapshot') && method === 'POST') {
      const body = await parseBody(req);
      const patientCode = body.patient_code || body.code;
      const snapshot = body.snapshot_image || body.image_data_url || body.photo;
      const sim = body.similarity_score || body.similarity || 0;
      const pName = body.name || body.full_name;

      if (patientCode && snapshot) {
        const savedUrl = saveLoginSnapshotToDisk(snapshot, patientCode, pName, sim);
        return sendJson(res, 200, {
          status: 'success',
          message: 'บันทึกภาพประวัติการสแกนใบหน้าเข้าโฟลเดอร์เรียบร้อยแล้ว',
          snapshot_url: savedUrl,
        });
      }
      return sendJson(res, 400, { status: 'error', message: 'Missing patientCode or snapshot image' });
    }

    // -------------------------------------------------------------
    // Create/Update Generic Patient: POST /api/patients
    // -------------------------------------------------------------
    if (pathname === '/api/patients' && method === 'POST') {
      const body = await parseBody(req);
      const code = body.code || body.patient_code || `P-${Math.floor(1000 + Math.random() * 9000)}`;

      // Save image if present
      const rawImage = body.image_data_url || body.photo || body.face_image_url;
      let staticImageUrl = null;
      if (rawImage && rawImage.startsWith('data:image')) {
        staticImageUrl = saveBase64Image(rawImage, code, body.name || body.full_name);
      } else if (rawImage) {
        staticImageUrl = rawImage;
      }

      const existingIndex = db.patients.findIndex(
        (p) => String(p.code).toUpperCase() === String(code).toUpperCase() || (body.id && String(p.id) === String(body.id))
      );

      let record;
      if (existingIndex >= 0) {
        record = {
          ...db.patients[existingIndex],
          ...body,
          face_image_url: staticImageUrl || body.face_image_url || db.patients[existingIndex].face_image_url,
        };
        db.patients[existingIndex] = record;
      } else {
        const newId = Math.max(0, ...db.patients.map((p) => typeof p.id === 'number' ? p.id : 0)) + 1;
        record = {
          id: newId,
          code,
          username: body.username || `user_${code.toLowerCase().replace(/[^a-z0-9]/g, '')}`,
          name: body.name || `${body.first_name || ''} ${body.last_name || ''}`.trim() || 'ผู้รับบริการใหม่',
          age: Number(body.age) || 65,
          gender: body.gender || 'male',
          phone: body.phone || '',
          status: body.status || 'active',
          diagnosis: body.diagnosis || body.chiefComplaint || 'ตรวจประเมินกายภาพบำบัด',
          chief_complaint: body.chief_complaint || body.chiefComplaint || 'ตรวจประเมินกายภาพบำบัด',
          face_vector: body.face_vector || null,
          face_image_url: staticImageUrl || body.face_image_url || null,
          created_at: new Date().toISOString().split('T')[0],
          last_active: 'เพิ่งลงทะเบียน',
          ...body,
        };
        db.patients.unshift(record);
      }

      saveDatabaseToDisk();

      // Broadcast update
      broadcastSseEvent({
        type: record.status === 'pending_info' ? 'ENROLLED_PENDING' : 'INFO_COMPLETED',
        user: record,
        patient: record,
        timestamp: Date.now(),
      });

      return sendJson(res, 201, {
        status: 'success',
        message: 'Patient saved successfully',
        data: record,
      });
    }

    // -------------------------------------------------------------
    // Single Patient Operations: /api/patients/:id
    // -------------------------------------------------------------
    const patientIdMatch = pathname.match(/^\/api\/patients\/([^\/]+)$/);
    if (patientIdMatch) {
      const idOrCode = decodeURIComponent(patientIdMatch[1]);

      const patientIndex = db.patients.findIndex(
        (p) => String(p.id) === idOrCode || String(p.code).toUpperCase() === idOrCode.toUpperCase()
      );

      if (method === 'GET') {
        if (patientIndex < 0) {
          return sendJson(res, 404, { status: 'error', message: 'Patient not found' });
        }
        return sendJson(res, 200, { status: 'success', data: db.patients[patientIndex] });
      }

      if (method === 'PUT') {
        if (patientIndex < 0) {
          return sendJson(res, 404, { status: 'error', message: 'Patient not found' });
        }
        const body = await parseBody(req);
        const current = db.patients[patientIndex];

        // Process image if changed
        let imageUrl = current.face_image_url;
        if (body.image_data_url && body.image_data_url.startsWith('data:image')) {
          imageUrl = saveBase64Image(body.image_data_url, current.code) || imageUrl;
        } else if (body.face_image_url) {
          imageUrl = body.face_image_url;
        }

        const updated = {
          ...current,
          ...body,
          face_image_url: imageUrl,
          last_active: 'เพิ่งอัปเดตข้อมูล',
        };
        db.patients[patientIndex] = updated;
        saveDatabaseToDisk();

        // Broadcast to all clients
        broadcastSseEvent({
          type: 'INFO_COMPLETED',
          user: updated,
          patient: updated,
          timestamp: Date.now(),
        });

        console.log(`[CENTRAL DB] Updated patient ${updated.code} - Broadcasted INFO_COMPLETED.`);
        return sendJson(res, 200, { status: 'success', data: updated });
      }

      if (method === 'DELETE') {
        if (patientIndex < 0) {
          return sendJson(res, 404, { status: 'error', message: 'Patient not found' });
        }
        const removed = db.patients.splice(patientIndex, 1)[0];
        db.face_embeddings = db.face_embeddings.filter(
          (fe) => String(fe.patient_id) !== String(removed.id) && String(fe.patient_code).toUpperCase() !== String(removed.code).toUpperCase()
        );
        saveDatabaseToDisk();

        broadcastSseEvent({
          type: 'PATIENT_DELETED',
          id: removed.id,
          code: removed.code,
          timestamp: Date.now(),
        });

        return sendJson(res, 200, { status: 'success', message: 'Patient deleted successfully under PDPA.' });
      }
    }

    // -------------------------------------------------------------
    // Face Verification Endpoint: POST /api/face/verify
    // -------------------------------------------------------------
    if (pathname === '/api/face/verify' && method === 'POST') {
      const body = await parseBody(req);
      const embedding = body.embedding || body.face_vector;

      if (!Array.isArray(embedding) || embedding.length === 0) {
        return sendJson(res, 400, { status: 'error', message: 'Invalid or missing face embedding vector' });
      }

      // Check against all enrolled faces in DB
      let bestMatch = null;
      let highestSimilarity = -1;
      let lowestDistance = 999;

      const candidates = db.patients.filter((p) => Array.isArray(p.face_vector) && p.face_vector.length > 0);

      for (const p of candidates) {
        const sim = cosineSimilarity(embedding, p.face_vector);
        const dist = euclideanDistance(embedding, p.face_vector);

        if (sim > highestSimilarity) {
          highestSimilarity = sim;
          lowestDistance = dist;
          bestMatch = p;
        }
      }

      const SIMILARITY_THRESHOLD = 0.88;
      const DISTANCE_THRESHOLD = 0.45;

      const isMatch = highestSimilarity >= SIMILARITY_THRESHOLD && lowestDistance <= DISTANCE_THRESHOLD;

      if (isMatch && bestMatch) {
        const token = `face-token-${bestMatch.code}-${Date.now()}`;
        return sendJson(res, 200, {
          status: 'success',
          match: true,
          similarity: highestSimilarity,
          similarity_percent: Math.round(highestSimilarity * 100),
          distance: lowestDistance,
          token,
          patient: bestMatch,
          message: `ยืนยันตัวตนสำเร็จ: ยินดีต้อนรับคุณ ${bestMatch.name}`,
        });
      }

      return sendJson(res, 200, {
        status: 'failed',
        match: false,
        similarity: highestSimilarity,
        similarity_percent: Math.round(Math.max(0, highestSimilarity) * 100),
        distance: lowestDistance,
        message: 'ไม่พบใบหน้าที่ตรงกับฐานข้อมูลส่วนกลาง',
      });
    }

    // -------------------------------------------------------------
    // Face Status: GET /api/face/status
    // -------------------------------------------------------------
    if (pathname === '/api/face/status' && method === 'GET') {
      const enrolledWithVector = db.patients.filter((p) => Array.isArray(p.face_vector) && p.face_vector.length > 0);
      return sendJson(res, 200, {
        status: 'success',
        total_embeddings: db.face_embeddings.length,
        enrolled_patients_count: enrolledWithVector.length,
        mode: 'Central Shared Database (Multi-Device Synchronized)',
        enrolled_codes: enrolledWithVector.map((p) => p.code),
      });
    }

    // -------------------------------------------------------------
    // Exercises: GET /api/exercises
    // -------------------------------------------------------------
    if (pathname === '/api/exercises' && method === 'GET') {
      return sendJson(res, 200, {
        status: 'success',
        data: db.exercises,
      });
    }

    // -------------------------------------------------------------
    // Sessions: POST /api/sessions
    // -------------------------------------------------------------
    if (pathname === '/api/sessions' && method === 'POST') {
      const body = await parseBody(req);
      const sessionRecord = {
        id: Date.now(),
        ...body,
        created_at: new Date().toISOString(),
      };
      db.sessions.push(sessionRecord);
      saveDatabaseToDisk();

      broadcastSseEvent({
        type: 'SESSION_SAVED',
        session: sessionRecord,
        timestamp: Date.now(),
      });

      return sendJson(res, 201, {
        status: 'success',
        data: sessionRecord,
      });
    }

    // -------------------------------------------------------------
    // Appointments: GET /api/appointments, POST /api/appointments
    // -------------------------------------------------------------
    const normalizeModes = (raw) => {
      if (!raw || typeof raw !== 'object') {
        return {
          rom: { enabled: true, type: 'pack', packId: 'modpack-shoulder-daily', poseIds: [] },
          minigame: { enabled: false, questionCount: 20 },
        };
      }
      return {
        rom: {
          enabled: raw.rom?.enabled !== undefined ? Boolean(raw.rom.enabled) : true,
          type: raw.rom?.type === 'custom' ? 'custom' : 'pack',
          packId: raw.rom?.packId || null,
          packName: raw.rom?.packName || null,
          poseIds: Array.isArray(raw.rom?.poseIds) ? raw.rom.poseIds : [],
        },
        minigame: {
          enabled: raw.minigame?.enabled !== undefined ? Boolean(raw.minigame.enabled) : false,
          questionCount: Math.min(50, Math.max(5, raw.minigame?.questionCount || 20)),
        },
      };
    };

    if (pathname === '/api/appointments' && method === 'GET') {
      const patientId = parsedUrl.searchParams.get('patient_id');
      const date = parsedUrl.searchParams.get('date');
      let list = db.appointments || [];

      if (patientId) {
        list = list.filter((a) => String(a.patient_id) === String(patientId) || String(a.patientId) === String(patientId));
      }
      if (date) {
        list = list.filter((a) => a.appointment_date === date || a.date === date);
      }

      const formatted = list.map((a) => ({
        ...a,
        training_modes: normalizeModes(a.training_modes || a.trainingModes),
        trainingModes: normalizeModes(a.training_modes || a.trainingModes),
      }));

      return sendJson(res, 200, {
        status: 'success',
        data: formatted,
      });
    }

    if (pathname === '/api/appointments' && method === 'POST') {
      const body = await parseBody(req);
      db.appointments = db.appointments || [];

      const dates = body.selectedDates || body.selected_dates;
      if (Array.isArray(dates) && dates.length > 1) {
        const createdList = dates.map((dStr, idx) => {
          const rec = {
            id: Date.now() + idx,
            ...body,
            appointment_date: dStr,
            date: dStr,
            training_modes: normalizeModes(body.training_modes || body.trainingModes),
            trainingModes: normalizeModes(body.training_modes || body.trainingModes),
            created_at: new Date().toISOString(),
          };
          db.appointments.push(rec);
          return rec;
        });
        saveDatabaseToDisk();

        broadcastSseEvent({
          type: 'APPOINTMENTS_BATCH_CREATED',
          count: createdList.length,
          timestamp: Date.now(),
        });

        return sendJson(res, 201, {
          status: 'success',
          message: 'Batch appointments created',
          data: createdList,
        });
      }

      const newRec = {
        id: Date.now(),
        ...body,
        appointment_date: body.appointment_date || body.date || new Date().toISOString().split('T')[0],
        date: body.appointment_date || body.date || new Date().toISOString().split('T')[0],
        training_modes: normalizeModes(body.training_modes || body.trainingModes),
        trainingModes: normalizeModes(body.training_modes || body.trainingModes),
        created_at: new Date().toISOString(),
      };
      db.appointments.push(newRec);
      saveDatabaseToDisk();

      broadcastSseEvent({
        type: 'APPOINTMENT_CREATED',
        appointment: newRec,
        timestamp: Date.now(),
      });

      return sendJson(res, 201, {
        status: 'success',
        data: newRec,
      });
    }

    const appointmentIdMatch = pathname.match(/^\/api\/appointments\/(\d+)$/);
    if (appointmentIdMatch) {
      const aptId = parseInt(appointmentIdMatch[1], 10);
      db.appointments = db.appointments || [];
      const aptIdx = db.appointments.findIndex((a) => a.id === aptId);

      if (aptIdx === -1) {
        return sendJson(res, 404, { status: 'error', message: 'Appointment not found' });
      }

      if (method === 'GET') {
        const apt = db.appointments[aptIdx];
        return sendJson(res, 200, {
          status: 'success',
          data: {
            ...apt,
            training_modes: normalizeModes(apt.training_modes || apt.trainingModes),
            trainingModes: normalizeModes(apt.training_modes || apt.trainingModes),
          },
        });
      }

      if (method === 'PUT' || method === 'PATCH') {
        const body = await parseBody(req);
        db.appointments[aptIdx] = {
          ...db.appointments[aptIdx],
          ...body,
          training_modes: normalizeModes(body.training_modes || body.trainingModes || db.appointments[aptIdx].training_modes),
          trainingModes: normalizeModes(body.training_modes || body.trainingModes || db.appointments[aptIdx].training_modes),
          updated_at: new Date().toISOString(),
        };
        saveDatabaseToDisk();
        return sendJson(res, 200, {
          status: 'success',
          data: db.appointments[aptIdx],
        });
      }

      if (method === 'DELETE') {
        db.appointments.splice(aptIdx, 1);
        saveDatabaseToDisk();
        return sendJson(res, 200, {
          status: 'success',
          message: 'Appointment deleted successfully',
        });
      }
    }

    // 404 Not Found
    return sendJson(res, 404, { status: 'error', message: `Route not found: ${method} ${pathname}` });

  } catch (err) {
    console.error('Server Internal Error:', err);
    return sendJson(res, 500, {
      status: 'error',
      message: 'Internal Server Error',
      error: err.message,
    });
  }
});

// Periodic SSE Keep-Alive Ping (every 15s)
setInterval(() => {
  for (const client of sseClients) {
    try {
      client.write(':ping\n\n');
    } catch {
      sseClients.delete(client);
    }
  }
}, 15000);

// Start Server
server.listen(PORT, HOST, () => {
  const localIps = getLocalIps();
  console.log('\n============================================================');
  console.log('  🏥 StrongCare Central Synchronized Backend Server');
  console.log('  Single Source of Truth for Multi-Device Hospital Deployment');
  console.log('============================================================');
  console.log(`  Local Machine:    http://127.0.0.1:${PORT}`);
  localIps.forEach((ip) => {
    console.log(`  Local Network IP: http://${ip}:${PORT}`);
  });
  console.log(`  SSE Event Stream: http://127.0.0.1:${PORT}/api/sync/events`);
  console.log(`  Database Storage: ${DB_FILE}`);
  console.log(`  Uploads Folder:   ${UPLOADS_DIR}`);
  console.log('============================================================\n');
});

// Handle termination signals
process.on('SIGINT', () => {
  console.log('\nClosing Central Backend Server...');
  saveDatabaseToDisk();
  process.exit(0);
});
