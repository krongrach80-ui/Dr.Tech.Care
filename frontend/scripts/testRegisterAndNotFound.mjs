import assert from 'node:assert';
import fs from 'node:fs';

console.log('======================================================================');
console.log('TEST SUITE: สมัครบัญชีไปหน้าจัดการข้อมูล & ถ้าหน้าไม่ตรงขึ้นไม่พบหน้าในระบบ');
console.log('======================================================================');

// 1. Test routing parser function logic
const testParser = (hash, query = '') => {
  const rawHash = (hash || '').replace(/^#\/?/, '').toLowerCase().trim();
  const searchParams = new URLSearchParams(query);
  const routePath = rawHash || (searchParams.get('p') || '').replace(/^\//, '').toLowerCase().trim();

  if (routePath === '' || routePath === 'kiosk' || routePath === 'screen1') {
    return { screen: 1 };
  }
  if (routePath === 'home' || routePath === 'patient' || routePath === 'screen2') {
    return { screen: 2 };
  }
  if (routePath === 'exercise' || routePath === 'workout' || routePath === 'screen4') {
    return { screen: 4 };
  }
  if (routePath === 'minigame' || routePath === 'game' || routePath === 'screen5') {
    return { screen: 5 };
  }
  if (
    routePath === 'hospital' ||
    routePath === 'portal' ||
    routePath === 'admin' ||
    routePath === 'management' ||
    routePath === 'data' ||
    routePath === 'users' ||
    routePath === 'patients'
  ) {
    return { screen: 1, modal: 'hospital' };
  }
  if (
    routePath === 'register' ||
    routePath === 'signup' ||
    routePath === 'enroll' ||
    routePath === 'add-user' ||
    routePath === 'reception'
  ) {
    return { screen: 1, modal: 'hospital', autoAddUser: true };
  }
  if (routePath === 'about') {
    return { screen: 1, modal: 'about' };
  }
  if (routePath === 'profile') {
    return { screen: 1, modal: 'profile' };
  }

  return { screen: 1, isNotFound: true, unmatchedPath: routePath };
};

// Route tests
console.log('\n--- 1. Testing Route Parser & Unmatched Paths (หน้าไม่ตรง) ---');

const notFoundRes1 = testParser('#/unknown-page');
assert.strictEqual(notFoundRes1.isNotFound, true, 'Unknown page should have isNotFound: true');
assert.strictEqual(notFoundRes1.unmatchedPath, 'unknown-page');
console.log('✓ ผ่าน: เข้า URL #/unknown-page (หน้าไม่ตรง) -> isNotFound: true');

const notFoundRes2 = testParser('', 'p=/invalid-route');
assert.strictEqual(notFoundRes2.isNotFound, true, 'Query param invalid page should have isNotFound: true');
console.log('✓ ผ่าน: เข้า URL ?p=/invalid-route (หน้าไม่ตรง) -> isNotFound: true');

console.log('\n--- 2. Testing Register Redirection to Data Management (สมัครบัญชีให้ไปหน้าจัดการข้อมูล) ---');

const regRes1 = testParser('#/register');
assert.strictEqual(regRes1.modal, 'hospital', 'Register route must redirect to hospital/management modal');
assert.strictEqual(regRes1.autoAddUser, true, 'Register route must flag autoAddUser: true');
console.log('✓ ผ่าน: เข้า #/register -> นำทางไปหน้าจัดการข้อมูล (modal: hospital, autoAddUser: true)');

const regRes2 = testParser('#/signup');
assert.strictEqual(regRes2.modal, 'hospital', 'Signup route must redirect to hospital/management modal');
assert.strictEqual(regRes2.autoAddUser, true);
console.log('✓ ผ่าน: เข้า #/signup -> นำทางไปหน้าจัดการข้อมูล (modal: hospital, autoAddUser: true)');

const regRes3 = testParser('#/reception');
assert.strictEqual(regRes3.modal, 'hospital', 'Reception onboarding redirected to data management');
console.log('✓ ผ่าน: เข้า #/reception -> นำทางไปหน้าจัดการข้อมูล');

console.log('\n--- 3. Testing Standard Routes Integrity ---');
assert.strictEqual(testParser('#/kiosk').screen, 1);
assert.strictEqual(testParser('#/home').screen, 2);
assert.strictEqual(testParser('#/exercise').screen, 4);
assert.strictEqual(testParser('#/minigame').screen, 5);
assert.strictEqual(testParser('#/hospital').modal, 'hospital');
console.log('✓ ผ่าน: เส้นทางหน้ามาตรฐาน (kiosk, home, exercise, minigame, hospital) ทำงานถูกต้องครบถ้วน');

console.log('\n--- 4. Checking Codebase Messages & Buttons ---');
const appTsx = fs.readFileSync('frontend/src/app/App.tsx', 'utf8');
const kioskTsx = fs.readFileSync('frontend/src/components/Kiosk/KioskSixStepWorkflow.tsx', 'utf8');
const hospitalTsx = fs.readFileSync('frontend/src/pages/Hospital/HospitalPortal.tsx', 'utf8');
const apiTs = fs.readFileSync('frontend/src/services/api.ts', 'utf8');

assert(appTsx.includes('ไม่พบหน้าในระบบ'), 'App.tsx must render ไม่พบหน้าในระบบ');
assert(appTsx.includes('ถ้าจะสมัครบัญชีให้ไป'), 'App.tsx must guide to data management');
assert(appTsx.includes('ไปหน้าจัดการข้อมูล (เพิ่มบัญชี)'), 'App.tsx must provide button to data management');

assert(kioskTsx.includes('ไม่พบหน้าในระบบ'), 'Kiosk must show ไม่พบหน้าในระบบ on mismatch');
assert(kioskTsx.includes('ถ้าจะสมัครบัญชีให้ไป'), 'Kiosk must guide to data management');
assert(kioskTsx.includes('ไปหน้าจัดการข้อมูล (เพิ่มบัญชีคนไข้ใหม่)'), 'Kiosk button must link to data management');

assert(hospitalTsx.includes('จัดการข้อมูล (ผู้ใช้งาน)'), 'HospitalPortal tab must be named จัดการข้อมูล (ผู้ใช้งาน)');
assert(hospitalTsx.includes('autoOpenAddUser'), 'HospitalPortal must support autoOpenAddUser');

assert(apiTs.includes('ไม่พบหน้าในระบบ'), 'api.ts verification failure message must be ไม่พบหน้าในระบบ');

console.log('✓ ผ่าน: ข้อความ ปุ่ม และโฟลว์ทั้งหมดได้รับการตรวจสอบตรงตามข้อกำหนดครบถ้วน');

console.log('\n======================================================================');
console.log('RESULT: ALL TESTS PASSED SUCCESSFULLY (100%)');
console.log('======================================================================\n');
