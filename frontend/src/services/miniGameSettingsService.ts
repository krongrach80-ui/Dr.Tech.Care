import { supabase, isSupabaseConfigured } from '../lib/supabase';

export interface MiniGameSettings {
  questionCount: number; // e.g. 5, 10, 15, 20
  soundEnabled: boolean;
  inputMode: 'camera' | 'touch';
  holdDurationSec: number; // 0.6, 0.8, 1.0
}

const SETTINGS_KEY = 'strongcare_minigame_settings';

export const DEFAULT_MINI_GAME_SETTINGS: MiniGameSettings = {
  questionCount: 10,
  soundEnabled: true,
  inputMode: 'camera',
  holdDurationSec: 0.7,
};

export function getSavedMiniGameSettings(): MiniGameSettings {
  if (typeof window === 'undefined') return DEFAULT_MINI_GAME_SETTINGS;
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return DEFAULT_MINI_GAME_SETTINGS;
    const parsed = JSON.parse(raw);
    return {
      questionCount: typeof parsed.questionCount === 'number' && parsed.questionCount > 0 ? parsed.questionCount : 10,
      soundEnabled: typeof parsed.soundEnabled === 'boolean' ? parsed.soundEnabled : true,
      inputMode: parsed.inputMode === 'touch' ? 'touch' : 'camera',
      holdDurationSec: typeof parsed.holdDurationSec === 'number' ? parsed.holdDurationSec : 0.7,
    };
  } catch {
    return DEFAULT_MINI_GAME_SETTINGS;
  }
}

export function saveMiniGameSettings(settings: MiniGameSettings): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    window.dispatchEvent(new CustomEvent('minigame:settings_updated', { detail: settings }));

    if (isSupabaseConfigured()) {
      void supabase.from('system_settings').upsert({
        key: 'minigame_settings',
        value: settings,
        updated_at: new Date().toISOString(),
      });
    }
  } catch (err) {
    console.warn('Failed to save mini game settings:', err);
  }
}

export async function syncMiniGameSettingsFromCloud(): Promise<MiniGameSettings> {
  if (!isSupabaseConfigured()) return getSavedMiniGameSettings();
  try {
    const { data } = await supabase.from('system_settings').select('value').eq('key', 'minigame_settings').maybeSingle();
    if (data?.value) {
      const parsed = data.value;
      const valid: MiniGameSettings = {
        questionCount: typeof parsed.questionCount === 'number' && parsed.questionCount > 0 ? parsed.questionCount : 10,
        soundEnabled: typeof parsed.soundEnabled === 'boolean' ? parsed.soundEnabled : true,
        inputMode: parsed.inputMode === 'touch' ? 'touch' : 'camera',
        holdDurationSec: typeof parsed.holdDurationSec === 'number' ? parsed.holdDurationSec : 0.7,
      };
      if (typeof window !== 'undefined') {
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(valid));
        window.dispatchEvent(new CustomEvent('minigame:settings_updated', { detail: valid }));
      }
      return valid;
    }
  } catch {}
  return getSavedMiniGameSettings();
}
