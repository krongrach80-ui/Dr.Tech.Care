import { MiniGameDefinition } from './types';
import { MG01BalloonPop } from './MG01BalloonPop';
import { MG02ReachCatch } from './MG02ReachCatch';

export const MINI_GAMES_REGISTRY: Record<string, MiniGameDefinition> = {
  'MG-01': {
    id: 'MG-01',
    nameTh: 'เกมเป่าลูกโป่งเอื้อมจับ',
    nameEn: 'Balloon Pop',
    Component: MG01BalloonPop,
    defaultConfig: {
      reps: 10,
      sets: 3,
      restSeconds: 20,
      instructions: 'เอื้อมมือสัมผัสลูกโป่งเพื่อฝึก Range of Motion ข้อไหล่',
    },
  },
  'MG-02': {
    id: 'MG-02',
    nameTh: 'เกมจับดาวนำวิถี',
    nameEn: 'Reach & Catch',
    Component: MG02ReachCatch,
    defaultConfig: {
      reps: 12,
      sets: 3,
      restSeconds: 25,
      instructions: 'เอื้อมแตะดวงดาวตามตำแหน่งเพื่อฝึกการควบคุมกล้ามเนื้อแขน',
    },
  },
};

export function getMiniGameById(id: string): MiniGameDefinition | undefined {
  return MINI_GAMES_REGISTRY[id];
}
