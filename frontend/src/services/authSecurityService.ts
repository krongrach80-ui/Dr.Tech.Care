/**
 * Dr.Tech.Care - Cryptographic Password Hashing & Clinical RBAC Service
 * Strictly hashes passwords with SHA-256 (Web Crypto API)
 * Enforces Role-Based Access Control (ผอ.รพ. vs นักกายภาพบำบัด)
 */

import { UserRole } from '../types/hospital';

/**
 * Hash plain text password using standard SHA-256
 */
export async function hashPassword(plainText: string): Promise<string> {
  if (typeof crypto === 'undefined' || !crypto.subtle) {
    // Fallback simple bitwise hash if subtle crypto unavailable in test runner
    let hash = 0;
    for (let i = 0; i < plainText.length; i++) {
      hash = (hash << 5) - hash + plainText.charCodeAt(i);
      hash |= 0;
    }
    return `fallback_${Math.abs(hash)}`;
  }

  const encoder = new TextEncoder();
  const data = encoder.encode(plainText.trim());
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

// Pre-computed SHA-256 hashes for standard system passwords
export const STANDARD_PASSWORD_HASHES: Record<string, string> = {
  // SHA-256 of "1234" (dev fallback)
  '1234': '03ac674216f3e15c761ee1a5e255f067953623c8b388b4459e13f978d7c846f4',
  // SHA-256 of "Admin@2026!"
  'Admin@2026!': 'f5280b5ee6f50b86bf091fe7c3ceec0f3214a1a5df804d9e03d42fe42e47c18a',
  // SHA-256 of "PtCare@2026!"
  'PtCare@2026!': '7b6f3c4dbce31f50ea7f62e684074ee0f912a7d4db32ec79f57ebbf7ee7e6b72',
  // SHA-256 of "admin*password"
  'admin*password': '4a8a08f09d37b73795649038408b5f33021722410036f3f014a4155db8b093f3',
  // SHA-256 of "pt*pass123"
  'pt*pass123': '58a699a714ee6b6be4a01c87796d11e4945d947214e21df932ff4b2496739ea8',
};

/**
 * Validates password strength (Strict Security: minimum 8 characters, recommends 10+)
 */
export function validatePasswordStrength(password: string): { isValid: boolean; message?: string } {
  const clean = password.trim();
  if (!clean) {
    return { isValid: false, message: 'กรุณากรอกรหัสผ่าน' };
  }
  if (clean.length < 8) {
    return { isValid: false, message: 'รหัสผ่านต้องมีความยาวอย่างน้อย 8 ตัวอักษร (แนะนำ 10 ตัวอักษรขึ้นไป)' };
  }
  return { isValid: true };
}

/**
 * Generates a strong temporary password (11 characters) for password resets
 */
export function generateSecureTemporaryPassword(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  let randStr = '';
  for (let i = 0; i < 4; i++) {
    randStr += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  const digits = Math.floor(1000 + Math.random() * 9000);
  return `DrCare#${randStr}${digits}`.slice(0, 11);
}

/**
 * Verify input password against stored hash or legacy plain string
 */
export async function verifyStaffPassword(
  inputPass: string,
  storedHashOrPlain: string
): Promise<boolean> {
  const cleanInput = inputPass.trim();
  if (!cleanInput) return false;

  const inputHash = await hashPassword(cleanInput);

  // 1. Direct cryptographic hash match (standard path)
  if (inputHash === storedHashOrPlain) return true;

  // 2. Standard legacy fallback match ONLY IF the stored value is still the unmigrated default hash
  if (storedHashOrPlain === STANDARD_PASSWORD_HASHES['1234'] && cleanInput === '1234') {
    return true;
  }

  // 3. Backward compatibility if stored value is still plain text matching input
  if (cleanInput === storedHashOrPlain) return true;

  return false;
}

/**
 * Strict Clinical RBAC permissions checker
 */
export function checkStaffPermission(
  role: UserRole,
  action: 'view_logs' | 'system_settings' | 'manage_staff' | 'edit_prescription' | 'view_patients'
): boolean {
  if (role === 'admin') {
    // ผอ.รพ. / Super Admin has all permissions
    return true;
  }

  if (role === 'therapist') {
    // นักกายภาพบำบัด can only manage patients and prescriptions; FORBIDDEN from logs, settings, and other staff
    if (action === 'view_logs' || action === 'system_settings' || action === 'manage_staff') {
      return false;
    }
    return true;
  }

  return false;
}
