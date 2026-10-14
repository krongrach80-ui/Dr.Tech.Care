const fs = require('fs');
const path = require('path');

const seedFile = path.resolve(__dirname, '../frontend/src/data/patients.json');
if (!fs.existsSync(seedFile)) {
  console.error('Cannot find seed file:', seedFile);
  process.exit(1);
}

const patients = JSON.parse(fs.readFileSync(seedFile, 'utf8'));

function sanitize(code, name) {
  const clean = (name || '')
    .replace(/\[PENDING_INFO\]/g, '')
    .replace(/[\\/:*?"<>|]/g, '_')
    .replace(/\s+/g, '_')
    .replace(/^_+|_+$/g, '')
    .trim();
  return clean ? `${code}_${clean}` : code;
}

const targetBases = [
  path.resolve(__dirname, '../uploads/patients'),
  path.resolve(__dirname, '../frontend/public/uploads/patients')
];

for (const p of patients) {
  const folderName = sanitize(p.code, p.name);
  for (const base of targetBases) {
    const dir = path.join(base, folderName);
    const loginDir = path.join(dir, 'login_history');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    if (!fs.existsSync(loginDir)) fs.mkdirSync(loginDir, { recursive: true });

    // Save record json
    const recordFile = path.join(dir, 'patient_record.json');
    if (!fs.existsSync(recordFile)) {
      fs.writeFileSync(recordFile, JSON.stringify(p, null, 2), 'utf8');
    }

    // Save fallback profile_face.jpg
    const imgPath = path.join(dir, 'profile_face.jpg');
    if (!fs.existsSync(imgPath)) {
      const iconPath = path.resolve(__dirname, '../frontend/public/logo_icon.png');
      if (fs.existsSync(iconPath)) {
        fs.copyFileSync(iconPath, imgPath);
      }
    }

    console.log('✓ Created patient folder:', dir);
  }
}

console.log('All patient folders seeded successfully!');
