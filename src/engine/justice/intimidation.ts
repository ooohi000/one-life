import type { Random } from '../core/Random';
import type { Line } from '../dialogue/topics';
import { josa } from '../memory/MemoryBank';

/**
 * 입막음. 때린 쪽은 맞은 애·본 애가 말하지 못하게 한다.
 * - 협박 자체가 학교폭력(협박)이고 범죄(형법 제283조 협박죄)다.
 * - 그래서 들키면 더 커진다: 학폭위에서 고의성이 오르고 2호(접촉·협박·보복 금지)가 붙는다.
 * - 협박은 증거를 남기기도 한다: DM·단톡 캡처, 몰래 녹음.
 * 방식은 때린 애의 특성이, 반응은 듣는 애의 특성이 정한다. 대사는 조각을 조립한다.
 */
export type ThreatStyle = 'menace' | 'crew' | 'soft' | 'online' | 'reputation';

export interface ThreatActor {
  id: string;
  name: string;
  traits: string[];
  /** 같이 온 애들 수 */
  crew: number;
}

export interface ThreatTarget {
  id: string;
  name: string;
  traits: string[];
  /** 지금 이 애가 때린 애를 무서워하는 정도 0~100 */
  fear: number;
  /** 맞은 애인가, 본 애인가 */
  role: 'victim' | 'witness';
}

export interface ThreatResult {
  style: ThreatStyle;
  lines: Line[];
  /** 입을 닫았나 */
  silenced: boolean;
  /** 대놓고 맞섰나 ("말할 거야") */
  defiant: boolean;
  /** 증거가 남았나 (녹음·캡처) */
  evidence: 'recording' | 'screenshot' | null;
  /** 무서움이 얼마나 늘었나 */
  fearAdded: number;
}

const OPENERS: Record<ThreatStyle, string[]> = {
  menace: ['야, 잠깐 나 좀 보자.', '너 이리 와 봐.'],
  crew: ['(쉬는 시간, 화장실 앞. 셋이 둘러섰다.)', '(하굣길 골목. 뒤에서 누가 어깨를 잡았다.)'],
  soft: ['야… 아까 일 말인데.', '우리 얘기 좀 하자. 진지하게.'],
  online: ['(밤 11시, 모르는 계정에서 DM이 왔다.)', '(단톡방에서 갑자기 강제 초대됐다.)'],
  reputation: ['너 내가 누군지 모르지?', '야, 너 몇 반이냐?'],
};

const THREATS: Record<ThreatStyle, Record<ThreatTarget['role'], string[]>> = {
  menace: {
    victim: ['선생님한테 말하면 그땐 진짜 끝이다.', '꼰지르면 어떻게 되는지 알지? 집 어딘지도 알아.'],
    witness: ['너 아까 본 거 없는 거다.', '입 열면 다음은 너야.'],
  },
  crew: {
    victim: ['우리 다 같은 말 할 거다. "쟤가 먼저 쳤다." 누구 말 믿을 것 같냐?', '학교 다니기 싫으면 말해.'],
    witness: ['봤어? 못 봤지? 그래, 못 본 거야.', '너 혼자 다니잖아. 조심해라.'],
  },
  soft: {
    victim: ['우리 그냥 없던 일로 하자. 매점 한 달 쏠게.', '나 이번에 걸리면 생기부 끝나. 한 번만 봐줘.'],
    witness: ['괜히 일 키우지 말자. 너도 귀찮아지잖아.', '너 이거 말하면 너도 참고인으로 불려 다닌다?'],
  },
  online: {
    victim: ['"말하면 너 단톡에서 매장시킨다."', '"내일 학교에서 보자 ㅋ"'],
    witness: ['"너 오늘 본 거 말하면 알지?"', '"입조심해라"'],
  },
  reputation: {
    victim: ['나 아는 형들 많다. 말해 봐, 어떻게 되나.', '우리 형이 누군지 알면 그런 생각 못 할걸.'],
    witness: ['괜히 끼지 마라. 너랑 상관없잖아.', '너 내 친구들 다 알지? 알아서 해.'],
  },
};

/** 때린 애 특성 → 입막음 방식 */
export function threatStyle(a: ThreatActor, rng: Random): ThreatStyle {
  const has = (t: string) => a.traits.includes(t);
  const w: Array<[ThreatStyle, number]> = [
    ['menace', 1 + (has('bully') ? 1.5 : 0) + (has('brawler') ? 1 : 0) + (has('hotHeaded') ? 0.5 : 0)],
    ['crew', a.crew > 0 ? 1 + a.crew * 0.8 + (has('leader') ? 1 : 0) : 0],
    ['soft', 0.6 + (has('silverTongue') ? 1.5 : 0) + (has('liar') ? 1 : 0) + (has('calm') ? 0.5 : 0)],
    ['online', 0.7 + (has('attention') ? 0.8 : 0) + (has('coward') ? 1 : 0)],
    ['reputation', 0.4 + (has('bluffer') ? 2 : 0)],
  ];
  const total = w.reduce((s, [, v]) => s + v, 0);
  let r = rng.next() * total;
  for (const [s, v] of w) if ((r -= v) <= 0) return s;
  return 'menace';
}

const RESPONSES = {
  silenced: ['…알았어.', '(고개만 끄덕였다.)', '(아무 말도 못 했다.)'],
  defiant: ['말할 거야. 네가 뭘 하든.', '해 봐. 나도 이제 안 참아.', '그거 협박인 거 알지?'],
  shaky: ['…생각해 볼게.', '(대답 대신 자리를 피했다.)'],
};

/**
 * 입막음 한 번.
 * 반응: 겁쟁이·유리멘탈은 입을 닫고, 깡다구·모범생·오지랖은 맞선다.
 * 눈치백단·거짓말쟁이는 겉으로는 수긍하고 몰래 녹음한다.
 */
export function threaten(a: ThreatActor, t: ThreatTarget, rng: Random): ThreatResult {
  const style = threatStyle(a, rng);
  const has = (x: string) => t.traits.includes(x);
  const lines: Line[] = [];
  const opener = rng.pick(OPENERS[style]);
  if (opener.startsWith('(')) lines.push({ who: 'narration', text: opener });
  else lines.push({ who: a.id, text: opener });
  lines.push({ who: a.id, text: rng.pick(THREATS[style][t.role]) });

  const pressure = { menace: 25, crew: 35, soft: 8, online: 18, reputation: 15 }[style];
  const resist =
    (has('gritty') ? 0.35 : 0) + (has('rulesFollower') ? 0.2 : 0) + (has('meddler') ? 0.2 : 0) + (has('vigilante') ? 0.4 : 0) + (has('ironMind') ? 0.2 : 0)
    - (has('coward') ? 0.4 : 0) - (has('fragile') ? 0.25 : 0) - t.fear / 200 - (style === 'crew' ? 0.15 : 0);
  const fearAdded = Math.round(pressure * (1 - Math.max(0, resist)) * (t.role === 'witness' ? 0.6 : 1));
  // 회유는 겁보다 미안함·귀찮음으로 입을 닫게 한다
  const pSilence = Math.max(0.05, Math.min(0.95, 0.5 + fearAdded / 100 - resist + (style === 'soft' ? 0.15 : 0)));
  const silenced = rng.chance(pSilence);
  const defiant = !silenced && resist > 0.15 && rng.chance(0.6);
  const say = (s: string) => lines.push({ who: t.id, text: s });
  if (silenced) say(rng.pick(RESPONSES.silenced));
  else if (defiant) say(rng.pick(RESPONSES.defiant));
  else say(rng.pick(RESPONSES.shaky));

  // 증거: 온라인 협박은 캡처가 남고, 눈치 빠른 애는 녹음을 켠다
  let evidence: ThreatResult['evidence'] = null;
  if (style === 'online' && rng.chance(0.7)) evidence = 'screenshot';
  else if (rng.chance(0.05 + (has('observant') ? 0.3 : 0) + (has('liar') ? 0.15 : 0) + (defiant ? 0.15 : 0))) evidence = 'recording';
  if (evidence === 'screenshot') lines.push({ who: 'narration', text: `(${josa(t.name, '은는')} 말없이 화면을 캡처했다.)` });
  if (evidence === 'recording') lines.push({ who: 'narration', text: `(주머니 속 휴대폰은 녹음 중이었다.)` });
  if (defiant && (style === 'menace' || style === 'crew') && rng.chance(0.3)) {
    lines.push({ who: a.id, text: rng.pick(['…두고 보자.', '너 진짜 후회한다.']) });
  }
  return { style, lines, silenced, defiant, evidence, fearAdded };
}

export const STYLE_LABEL: Record<ThreatStyle, string> = { menace: '대놓고 협박', crew: '무리로 둘러싸기', soft: '회유', online: 'DM·단톡 협박', reputation: '허세 (아는 형)' };
