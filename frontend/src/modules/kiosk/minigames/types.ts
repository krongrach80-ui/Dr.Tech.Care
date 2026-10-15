import React from 'react';

export interface MiniGameConfig {
  reps: number;
  sets: number;
  restSeconds: number;
  instructions?: string;
}

export interface MiniGameResult {
  correct: number;
  incorrect: number;
  score: number;
  durationSec: number;
}

export interface MiniGameProps {
  config: MiniGameConfig;
  onFinish: (result: MiniGameResult) => void;
  videoElement: HTMLVideoElement | null;
}

export interface MiniGameDefinition {
  id: string; // MG-01, MG-02
  nameTh: string;
  nameEn: string;
  Component: React.ComponentType<MiniGameProps>;
  defaultConfig: MiniGameConfig;
}
