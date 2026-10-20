import type { Random } from '../core/Random';
import type { Trace } from './evidence';

/**
 * 아무도 모르는 싸움은 없던 일이 될까? 대부분은 누군가 안다. 문제는 "누가, 언제".
 * - 현장: 지나가던 사람의 112, 지능형 CCTV 감지
 * - 맞은 애: 보복이 무섭거나 자존심 때문에 말 안 하기도 한다
 * - 부모: 얼굴의 멍, 병원비 — 알아채면 학교에, 크게 다쳤으면 경찰에
 * - 목격자: 오지랖 있는 애가 선생님에게
 * - 영상: 누가 SNS에 올리면 학교가 안다
 * 신고가 늦을수록 CCTV는 지워진다 (evidence.ts).
 */
export type Discoverer = 'police' | 'victim' | 'parents' | 'witness' | 'video';

export interface DiscoveryCtx {
  /** 맞은 쪽 최대 부상 0~3 */
  injury: number;
  /** 맞은 애가 보복을 무서워하는 정도 0~1 */
  fear: number;
  /** 맞은 애 자존심 (일러바치기 싫음) 0~1 */
  pride: number;
  /** 맞은 애 부모가 아이를 살피는 정도 0~1 */
  parentPresence: number;
  /** 부모가 일에 뛰어드는 정도 0~1 */
  parentInvolvement: number;
  /** 목격자 중 오지랖 있는 애 비율 0~1 */
  witnessMeddle: number;
}

export interface Discovery {
  by: Discoverer;
  /** 싸움 뒤 며칠 만에 */
  afterDays: number;
  /** 경찰까지 가나 (아니면 학교만) */
  police: boolean;
  text: string;
}

const HEAL_DAYS = [0, 7, 14, 30];

export function discover(t: Trace, c: DiscoveryCtx, rng: Random, horizon = 60): Discovery | null {
  if (t.policeOnScene) return { by: 'police', afterDays: 0, police: true, text: '현장에 경찰이 왔다. 그 자리에서 이름과 학교를 댔다.' };
  for (let d = 0; d < horizon; d++) {
    const fade = Math.exp(-d / 12);
    // 크게 다치면 병원 → 부모가 무조건 안다
    if (c.injury >= 3 && d === 0) return { by: 'parents', afterDays: 0, police: true, text: '응급실에서 부모님이 달려왔다. 바로 경찰서에 고소장을 냈다.' };
    if (rng.chance((0.03 + c.injury * 0.05) * (1 - c.fear * 0.7) * (1 - c.pride * 0.5) * fade)) {
      return { by: 'victim', afterDays: d, police: c.injury >= 2 && rng.chance(0.4), text: d === 0 ? '맞은 애가 그날 바로 선생님에게 말했다.' : `맞은 애가 ${d}일 동안 고민하다 결국 말했다.` };
    }
    if (c.injury >= 1 && d < HEAL_DAYS[c.injury]! && rng.chance(c.parentPresence * 0.25)) {
      if (rng.chance(0.3 + c.parentInvolvement * 0.6)) {
        return { by: 'parents', afterDays: d, police: c.injury >= 2 && rng.chance(0.3 + c.parentInvolvement * 0.5), text: `${d === 0 ? '그날 밤' : `${d}일 뒤`} 부모님이 얼굴의 멍을 봤다. "누가 그랬어." 다음 날 학교에 학폭 신고가 들어갔다.` };
      }
    }
    if (t.witnesses > 0 && rng.chance(c.witnessMeddle * 0.08 * fade)) {
      return { by: 'witness', afterDays: d, police: false, text: '그때 본 애가 담임 선생님에게 말했다.' };
    }
    if (t.uploaded && rng.chance(0.12)) {
      return { by: 'video', afterDays: d, police: rng.chance(0.2), text: '누가 찍은 영상이 SNS에 돌았다. 학교가 알게 됐다.' };
    }
  }
  return null;
}
