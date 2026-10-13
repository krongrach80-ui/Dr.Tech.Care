import { asset } from '../utils/asset';
import { API_BASE_URL, IS_STATIC_MODE } from '../config/apiConfig';
import { audioFeedback } from './audioService';

export type VoicePriority = 'emergency' | 'critical' | 'warning' | 'instruction' | 'success' | 'info';
export type VoiceLevel = 'system' | 'exercise' | 'result';

export interface VoiceOptions {
  priority?: VoicePriority;
  level?: VoiceLevel;
  cooldown?: number; // ms to wait before repeating same message or key
  key?: string; // identifier for cooldown grouping (e.g. 'arm_raise', 'posture_lean')
  force?: boolean; // ignore cooldown if true
  chime?: boolean; // play accompanying audio chime
}

const PRIORITY_WEIGHTS: Record<VoicePriority, number> = {
  emergency: 10,
  critical: 8,
  warning: 5,
  success: 3,
  instruction: 2,
  info: 1,
};

// Map of pre-generated native studio-quality Thai speech files
const STATIC_SOUNDS_MAP: Record<string, string> = {
  welcome: asset('sounds/welcome.mp3'),
  welcome_app: asset('sounds/welcome.mp3'),
  face_login_open: asset('sounds/face_look.mp3'),
  face_aligned_hold: asset('sounds/face_align_hold.mp3'),
  face_enroll_step1: asset('sounds/face_look_straight.mp3'),
  face_turn_left: asset('sounds/face_turn_left.mp3'),
  face_turn_right: asset('sounds/face_turn_right.mp3'),
  face_face_angles_done: asset('sounds/face_face_angles_done.mp3'),
  face_saving: asset('sounds/face_saving.mp3'),
  face_enrolled: asset('sounds/face_enrolled.mp3'),
  welcome_back: asset('sounds/welcome_back.mp3'),
  workout_start: asset('sounds/workout_start.mp3'),
  good_form: asset('sounds/good_form.mp3'),
  good_posture_encourage: asset('sounds/good_form.mp3'),
  raise_arm: asset('sounds/raise_arm.mp3'),
  rom_insufficient: asset('sounds/raise_arm.mp3'),
  squat_more: asset('sounds/squat_more.mp3'),
  leg_more: asset('sounds/leg_more.mp3'),
  slow_down: asset('sounds/slow_down.mp3'),
  speed_warning: asset('sounds/slow_down.mp3'),
  adjust_posture: asset('sounds/adjust_posture.mp3'),
  posture_lean_warning: asset('sounds/adjust_posture.mp3'),
  hold_pose: asset('sounds/hold_pose.mp3'),
  hold_phase_instruction: asset('sounds/hold_pose.mp3'),
  workout_complete: asset('sounds/workout_complete.mp3'),
  guide_home: asset('sounds/guide_home.mp3'),
  guide_training: asset('sounds/guide_training.mp3'),
  guide_exercises: asset('sounds/guide_exercises.mp3'),
  guide_history: asset('sounds/guide_history.mp3'),
  guide_patients: asset('sounds/guide_patients.mp3'),
  guide_result: asset('sounds/guide_result.mp3'),
  test_voice: asset('sounds/test_voice.mp3'),
  stretch_start: asset('sounds/stretch_start.mp3'),
  stretch_switch_right: asset('sounds/stretch_switch_right.mp3'),
  stretch_switch_left: asset('sounds/stretch_switch_left.mp3'),
  stretch_hold_begin: asset('sounds/stretch_hold_begin.mp3'),
  stretch_complete_all: asset('sounds/stretch_complete_all.mp3'),
  stretch_pose_1: asset('sounds/stretch_pose_1.mp3'),
  stretch_pose_2: asset('sounds/stretch_pose_2.mp3'),
  stretch_pose_3: asset('sounds/stretch_pose_3.mp3'),
  stretch_pose_4: asset('sounds/stretch_pose_4.mp3'),
  stretch_pose_5: asset('sounds/stretch_pose_5.mp3'),
  stretch_pose_6: asset('sounds/stretch_pose_6.mp3'),
  stretch_pose_7: asset('sounds/stretch_pose_7.mp3'),
  stretch_pose_8: asset('sounds/stretch_pose_8.mp3'),
  stretch_pose_9: asset('sounds/stretch_pose_9.mp3'),
  stretch_pose_10: asset('sounds/stretch_pose_10.mp3'),
  stretch_pose_11: asset('sounds/stretch_pose_11.mp3'),
  // Countdown audio mappings (Thai voice)
  count_3: asset('sounds/count_3.mp3'),
  count_2: asset('sounds/count_2.mp3'),
  count_1: asset('sounds/count_1.mp3'),
  count_ready: asset('sounds/count_ready.mp3'),
  'สาม': asset('sounds/count_3.mp3'),
  'สอง': asset('sounds/count_2.mp3'),
  'หนึ่ง': asset('sounds/count_1.mp3'),
  '3': asset('sounds/count_3.mp3'),
  '2': asset('sounds/count_2.mp3'),
  '1': asset('sounds/count_1.mp3'),
  'เริ่มได้เลย': asset('sounds/count_ready.mp3'),
};

class VoiceAssistantService {
  private currentAudio: HTMLAudioElement | null = null;
  private synth: SpeechSynthesis | null = null;
  private thaiVoice: SpeechSynthesisVoice | null = null;
  private isMuted: boolean = false;
  private volume: number = 1.0;
  private rate: number = 1.0;

  // Feedback Manager: Cooldowns & Duplicate Filter
  private lastSpokenMap: Map<string, number> = new Map();
  private currentPriority: VoicePriority = 'info';
  private isSpeaking: boolean = false;
  private currentText: string = '';

  // State listeners for UI animation and components
  private listeners: Set<(state: { isSpeaking: boolean; currentText: string; isMuted: boolean; volume: number; rate: number }) => void> = new Set();

  constructor() {
    if (typeof window !== 'undefined') {
      if ('speechSynthesis' in window) {
        this.synth = window.speechSynthesis;
        this.loadVoices();
        if (this.synth.onvoiceschanged !== undefined) {
          this.synth.onvoiceschanged = () => this.loadVoices();
        }
      }

      // Load saved preferences from localStorage
      try {
        const savedMuted = localStorage.getItem('physiovision_voice_muted');
        if (savedMuted !== null) this.isMuted = savedMuted === 'true';

        const savedVol = localStorage.getItem('physiovision_voice_volume');
        if (savedVol !== null) this.volume = parseFloat(savedVol);

        const savedRate = localStorage.getItem('physiovision_voice_rate');
        if (savedRate !== null) this.rate = parseFloat(savedRate);
      } catch (e) {
        console.warn('Could not read voice preferences from localStorage', e);
      }
    }
  }

  private loadVoices() {
    if (!this.synth) return;
    const voices = this.synth.getVoices();
    this.thaiVoice =
      voices.find((v) => v.lang.toLowerCase() === 'th-th' && (v.name.includes('Natural') || v.name.includes('Google') || v.name.includes('Premwadee'))) ||
      voices.find((v) => v.lang.toLowerCase() === 'th-th' || v.lang.startsWith('th')) ||
      null;
  }

  public subscribe(cb: (state: { isSpeaking: boolean; currentText: string; isMuted: boolean; volume: number; rate: number }) => void) {
    this.listeners.add(cb);
    cb(this.getState());
    return () => {
      this.listeners.delete(cb);
    };
  }

  private notify() {
    const state = this.getState();
    this.listeners.forEach((cb) => cb(state));
  }

  public getState() {
    return {
      isSpeaking: this.isSpeaking,
      currentText: this.currentText,
      isMuted: this.isMuted,
      volume: this.volume,
      rate: this.rate,
    };
  }

  public setMuted(muted: boolean) {
    this.isMuted = muted;
    if (muted) {
      this.stop();
    }
    try {
      localStorage.setItem('physiovision_voice_muted', String(muted));
    } catch (_) {}
    this.notify();
    return this.isMuted;
  }

  public toggleMute(): boolean {
    return this.setMuted(!this.isMuted);
  }

  public setVolume(vol: number) {
    this.volume = Math.max(0, Math.min(1, vol));
    if (this.currentAudio) {
      this.currentAudio.volume = this.volume;
    }
    try {
      localStorage.setItem('physiovision_voice_volume', String(this.volume));
    } catch (_) {}
    this.notify();
  }

  public setRate(rate: number) {
    this.rate = Math.max(0.6, Math.min(1.4, rate));
    if (this.currentAudio) {
      this.currentAudio.playbackRate = this.rate;
    }
    try {
      localStorage.setItem('physiovision_voice_rate', String(this.rate));
    } catch (_) {}
    this.notify();
  }

  /**
   * Resolve an audio URL for a given key or text
   */
  private resolveAudioUrl(key: string, text: string): string | null {
    // 1. Check exact key or text match
    if (STATIC_SOUNDS_MAP[key]) {
      return STATIC_SOUNDS_MAP[key];
    }
    if (STATIC_SOUNDS_MAP[text]) {
      return STATIC_SOUNDS_MAP[text];
    }

    // 2. Check rep counter pattern (e.g. rep_complete_5)
    if (key.startsWith('rep_complete_')) {
      const repNum = parseInt(key.replace('rep_complete_', ''), 10);
      if (repNum >= 1 && repNum <= 20) {
        return asset(`sounds/rep_${repNum}.mp3`);
      }
    }

    // 3. Check for specific keywords in text
    if (text.includes('ยินดีต้อนรับกลับมา')) return asset('sounds/welcome_back.mp3');
    if (text.includes('มองตรงมาที่กล้อง')) return asset('sounds/face_look_straight.mp3');
    if (text.includes('หันหน้าไปทางซ้าย') || text.includes('ขยับใบหน้าไปทางซ้าย')) return asset('sounds/face_turn_left.mp3');
    if (text.includes('หันหน้าไปทางขวา') || text.includes('ขยับใบหน้าไปทางขวา')) return asset('sounds/face_turn_right.mp3');
    if (text.includes('บันทึกข้อมูลใบหน้า')) return asset('sounds/face_saving.mp3');
    if (text.includes('สมัครสมาชิกเรียบร้อย')) return asset('sounds/face_enrolled.mp3');
    if (text.includes('มองกล้องเพื่อเข้าสู่ระบบ')) return asset('sounds/face_look.mp3');
    if (text.includes('จัดใบหน้าตรงแล้ว')) return asset('sounds/face_align_hold.mp3');
    if (text.includes('ทำได้ถูกต้อง')) return asset('sounds/good_form.mp3');
    if (text.includes('ปรับท่าทางก่อน')) return asset('sounds/adjust_posture.mp3');
    if (text.includes('ค่อย ๆ ยก')) return asset('sounds/slow_down.mp3');
    if (text.includes('ค้างท่าไว้นิ่งๆ')) return asset('sounds/hold_pose.mp3');
    if (text.includes('ทำครบตามเป้าหมาย')) return asset('sounds/workout_complete.mp3');
    if (text.includes('ยกแขนขึ้นอีก')) return asset('sounds/raise_arm.mp3');
    if (text.includes('ย่อเข่าลงอีก')) return asset('sounds/squat_more.mp3');
    if (text.includes('ยกขาขึ้นอีก')) return asset('sounds/leg_more.mp3');

    // 4. In static demo mode or when offline, bypass /api/tts entirely and fallback directly to Web Speech Synthesis
    if (IS_STATIC_MODE || (typeof navigator !== 'undefined' && !navigator.onLine)) {
      return null;
    }

    // 5. Dynamic TTS via backend proxy cache
    return `${API_BASE_URL || '/api'}/tts?text=${encodeURIComponent(text)}`;
  }

  /**
   * Core Spoken Feedback Manager with Priority, Cooldown & Duplicate Filter
   */
  public speak(text: string, options: VoiceOptions = {}): boolean {
    if (this.isMuted || !text.trim() || typeof window === 'undefined') {
      return false;
    }

    const {
      priority = 'info',
      cooldown = 3500, // default 3.5s cooldown
      key = text.trim(),
      force = false,
      chime = false,
    } = options;

    const now = Date.now();

    // 1. Cooldown Check
    if (!force) {
      const lastTime = this.lastSpokenMap.get(key) || 0;
      if (now - lastTime < cooldown) {
        return false; // Dropped to prevent speech spam
      }
    }

    // 2. Priority Check against currently active speech
    const incomingWeight = PRIORITY_WEIGHTS[priority];
    const currentWeight = this.isSpeaking ? PRIORITY_WEIGHTS[this.currentPriority] : 0;

    // If already speaking something of higher priority, do not interrupt
    if (this.isSpeaking && incomingWeight < currentWeight) {
      return false;
    }

    // Update cooldown map
    this.lastSpokenMap.set(key, now);

    // Optional Chime
    if (chime) {
      if (priority === 'success') {
        audioFeedback.playRepSuccess();
      } else if (priority === 'warning' || priority === 'critical') {
        audioFeedback.playWarning();
      } else if (priority === 'instruction') {
        audioFeedback.playHoldTick();
      }
    }

    // Stop previous audio or speech
    this.stopAudioOnly();

    // Play native Thai Audio file
    const audioUrl = this.resolveAudioUrl(key, text);

    if (audioUrl) {
      try {
        const audio = new Audio(audioUrl);
        audio.volume = this.volume;
        audio.playbackRate = this.rate;
        this.currentAudio = audio;

        audio.onplay = () => {
          this.isSpeaking = true;
          this.currentText = text;
          this.currentPriority = priority;
          this.notify();
        };

        audio.onended = () => {
          this.isSpeaking = false;
          this.currentText = '';
          this.currentPriority = 'info';
          this.notify();
        };

        audio.onerror = () => {
          // If audio network load failed, fallback to Web Speech Synthesis
          this.fallbackSpeechSynthesis(text, priority);
        };

        const playPromise = audio.play();
        if (playPromise !== undefined) {
          playPromise.catch((err) => {
            console.warn('Audio play failed, falling back to speech synthesis:', err);
            this.fallbackSpeechSynthesis(text, priority);
          });
        }

        return true;
      } catch (err) {
        console.warn('Failed to play audio element:', err);
        return this.fallbackSpeechSynthesis(text, priority);
      }
    } else {
      return this.fallbackSpeechSynthesis(text, priority);
    }
  }

  private fallbackSpeechSynthesis(text: string, priority: VoicePriority): boolean {
    if (!this.synth) return false;

    try {
      this.synth.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      if (this.thaiVoice) {
        utterance.voice = this.thaiVoice;
      }
      utterance.lang = 'th-TH';
      utterance.volume = this.volume;
      utterance.rate = this.rate;

      utterance.onstart = () => {
        this.isSpeaking = true;
        this.currentText = text;
        this.currentPriority = priority;
        this.notify();
      };

      utterance.onend = () => {
        this.isSpeaking = false;
        this.currentText = '';
        this.currentPriority = 'info';
        this.notify();
      };

      utterance.onerror = () => {
        this.isSpeaking = false;
        this.currentText = '';
        this.notify();
      };

      this.synth.speak(utterance);
      return true;
    } catch (e) {
      return false;
    }
  }

  private stopAudioOnly() {
    if (this.currentAudio) {
      this.currentAudio.pause();
      this.currentAudio.currentTime = 0;
      this.currentAudio = null;
    }
    if (this.synth) {
      this.synth.cancel();
    }
  }

  /**
   * Stop any current speech
   */
  public stop() {
    this.stopAudioOnly();
    this.isSpeaking = false;
    this.currentText = '';
    this.notify();
  }

  /**
   * Level 1: System Voice (นำทาง, แนะนำระบบ, สแกนใบหน้า)
   */
  public speakSystem(text: string, options?: VoiceOptions) {
    return this.speak(text, {
      level: 'system',
      priority: options?.priority || 'instruction',
      cooldown: options?.cooldown ?? 2500,
      ...options,
    });
  }

  /**
   * Level 2: Exercise Voice (แนะนำระหว่างกายภาพบำบัด Real-time จาก Pose AI)
   */
  public speakExercise(text: string, options?: VoiceOptions) {
    return this.speak(text, {
      level: 'exercise',
      priority: options?.priority || 'warning',
      cooldown: options?.cooldown ?? 3500,
      ...options,
    });
  }

  public speakInstruction(text: string, options?: VoiceOptions) {
    return this.speak(text, {
      level: 'exercise',
      priority: options?.priority || 'instruction',
      cooldown: options?.cooldown ?? 2500,
      ...options,
    });
  }

  public speakAlert(text: string, options?: VoiceOptions) {
    return this.speak(text, {
      level: 'exercise',
      priority: options?.priority || 'critical',
      cooldown: options?.cooldown ?? 1500,
      chime: true,
      force: true,
      ...options,
    });
  }

  /**
   * EMERGENCY STOP: Highest Priority Override (Preempts & cuts all speech immediately)
   */
  public speakEmergency(text: string, options?: VoiceOptions) {
    this.stopAudioOnly();
    this.isSpeaking = false;
    audioFeedback.playWarning();
    return this.speak(text, {
      level: 'exercise',
      priority: 'emergency',
      cooldown: 500,
      chime: false,
      force: true,
      ...options,
    });
  }

  /**
   * Level 3: Result Voice (สรุปผลการฟื้นฟูหลังจบรอบ)
   */
  public speakResult(text: string, options?: VoiceOptions) {
    return this.speak(text, {
      level: 'result',
      priority: options?.priority || 'success',
      cooldown: options?.cooldown ?? 1000,
      chime: true,
      force: true,
      ...options,
    });
  }

  /**
   * Spoken Page Guide ("🔊 ฟังคำแนะนำ") for elderly
   */
  public speakPageGuide(pageId: string, context?: any) {
    let guideText = '';
    let guideKey = `guide_${pageId}`;

    switch (pageId) {
      case 'home':
        guideText =
          'สวัสดีครับ ยินดีต้อนรับเข้าสู่ระบบกายภาพบำบัด Dr.Tech.Care คุณสามารถกดปุ่มเริ่มทำกายภาพ หรือเข้าสู่ระบบได้เลยครับ';
        break;

      case 'training':
        if (context?.exerciseName) {
          guideText = `กำลังเข้าสู่การฝึกท่า ${context.exerciseName} ครับ เป้าหมาย ${context.targetReps ?? 10} ครั้ง จัดลำตัวให้อยู่ในกรอบกล้อง และเริ่มเคลื่อนไหวตามคำแนะนำได้เลยครับ`;
        } else {
          guideText =
            'หน้านี้สำหรับการฝึกกายภาพบำบัดพร้อมกล้องตรวจจับท่าทาง กรุณาจัดลำตัวให้อยู่ในกรอบกล้อง และเริ่มเคลื่อนไหวตามคำแนะนำได้เลยครับ';
        }
        break;

      case 'exercises':
        guideText =
          'หน้านี้รวบรวมโปรแกรมกายภาพบำบัดทั้งหมด เช่น ท่ายกแขน ท่าย่อเข่า และท่ายกขา กรุณาเลือกท่าที่ต้องการเริ่มฝึกได้ทันทีครับ';
        break;

      case 'result':
        if (context?.reps !== undefined && context?.accuracy !== undefined) {
          guideText = `ยอดเยี่ยมมากครับ! สรุปการฝึกรอบนี้ คุณทำได้ ${context.reps} ครั้ง ความถูกต้องเฉลี่ย ${context.accuracy} เปอร์เซ็นต์ ร่างกายของคุณมีพัฒนาการที่ดีขึ้นอย่างต่อเนื่องครับ`;
        } else {
          guideText =
            'หน้านี้สรุปผลการออกกำลังกายกายภาพบำบัดของคุณ แสดงจำนวนครั้งที่ทำสำเร็จและความถูกต้องของสรีระครับ';
        }
        break;

      case 'history':
        guideText =
          'หน้านี้คือประวัติการฝึกซ้อมทั้งหมด บันทึกวันเวลา จำนวนครั้ง และความถูกต้องย้อนหลังครับ';
        break;

      case 'patients':
        guideText =
          'หน้านี้สำหรับจัดการข้อมูลผู้ป่วย คุณสามารถลงทะเบียนผู้ป่วยใหม่ด้วยใบหน้า หรือเลือกผู้ป่วยได้ครับ';
        break;

      default:
        guideText = 'ระบบกายภาพบำบัดฟิสิโอวิชั่น ยินดีให้บริการครับ';
    }

    this.speak(guideText, {
      key: guideKey,
      priority: 'instruction',
      cooldown: 1000,
      force: true,
      chime: true,
    });
  }

  /**
   * Test Voice Sample for Elderly Adjustment
   */
  public testVoice() {
    this.speak('สวัสดีครับ นี่คือเสียงจำลองระบบแนะนำอัตโนมัติของฟิสิโอวิชั่นครับ', {
      key: 'test_voice',
      priority: 'instruction',
      force: true,
      chime: true,
    });
  }
}

export const voiceAssistant = new VoiceAssistantService();
