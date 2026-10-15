import { useState, useEffect } from 'react';
import { th } from './th';
import { en } from './en';

export type Language = 'th' | 'en';

let currentLanguage: Language = (localStorage.getItem('moh_lang') as Language) || 'th';
const listeners = new Set<(lang: Language) => void>();

export function setLanguage(lang: Language) {
  currentLanguage = lang;
  localStorage.setItem('moh_lang', lang);
  listeners.forEach((listener) => listener(lang));
}

export function getLanguage(): Language {
  return currentLanguage;
}

export function useI18n() {
  const [lang, setLang] = useState<Language>(currentLanguage);

  useEffect(() => {
    const handler = (newLang: Language) => setLang(newLang);
    listeners.add(handler);
    return () => {
      listeners.delete(handler);
    };
  }, []);

  const t = lang === 'th' ? th : en;

  return {
    lang,
    setLanguage,
    t,
    formatDate,
    formatDateTime,
    formatEmpty,
  };
}

/**
 * Format date as DD/MM/YYYY (Asia/Bangkok)
 */
export function formatDate(dateInput: string | Date | null | undefined): string {
  if (!dateInput) return '-';
  try {
    const d = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
    if (isNaN(d.getTime())) return '-';
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    return `${day}/${month}/${year}`;
  } catch {
    return '-';
  }
}

/**
 * Format datetime as DD/MM/YYYY HH:mm
 */
export function formatDateTime(dateInput: string | Date | null | undefined): string {
  if (!dateInput) return '-';
  try {
    const d = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
    if (isNaN(d.getTime())) return '-';
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    const hours = String(d.getHours()).padStart(2, '0');
    const minutes = String(d.getMinutes()).padStart(2, '0');
    return `${day}/${month}/${year} ${hours}:${minutes}`;
  } catch {
    return '-';
  }
}

/**
 * Global rule: Any optional field left empty is stored and rendered as "-"
 */
export function formatEmpty(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '-';
  const str = String(value).trim();
  return str === '' ? '-' : str;
}
