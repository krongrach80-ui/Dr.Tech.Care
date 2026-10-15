/**
 * DrTech.Care - Super Admin Dashboard Architecture Utilities
 * Implements Shared Single Source of Truth & strict "-" fallback formatting.
 */

export const defaultDash = (val: any): string => {
  if (val === undefined || val === null) return '-';
  if (typeof val === 'string') {
    const trimmed = val.trim();
    return trimmed.length > 0 ? trimmed : '-';
  }
  if (typeof val === 'number') {
    return isNaN(val) ? '-' : String(val);
  }
  if (Array.isArray(val)) {
    return val.length > 0 ? val.join(', ') : '-';
  }
  return String(val);
};

export const formatThaiDate = (dateStr?: string): string => {
  if (!dateStr) return '-';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString('th-TH', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return dateStr;
  }
};

export const formatThaiDateTime = (dateStr?: string): string => {
  if (!dateStr) return '-';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleString('th-TH', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return dateStr;
  }
};
