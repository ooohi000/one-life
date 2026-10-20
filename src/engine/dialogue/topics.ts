import type { Random } from '../core/Random';
import { FACTS, type FactKey, rankOf } from '../memory/facts';
import { type Acquaintance, type Belief, callName, josa, type MemoryBank } from '../memory/MemoryBank';
import type { World } from '../memory/World';

/** 말하는 사람의 성향. 같은 기억도 성향에 따라 다른 말이 된다 */
export interface SpeakerStyle {
  /** 따뜻함 0~1: 위로하고 감싸는 정도 */
  warmth: number;
  /** 기대 0~1: 자식에게 바라는 수준, 비교하는 정도 */
  expectation: number;
}

export interface Line {
  who: string; // 말한 사람 id
  text: string;
}

export interface TopicCtx {
  world: World;
  day: number;
  rng: Random;
  speakerId: string;
  speaker: MemoryBank;
  style: SpeakerStyle;
  listenerId: string;
  listener: MemoryBank;
  subjectId: string;
  acq: Acquaintance;
  ref: { text: string; byName: boolean };
}

export interface TopicResult {
  lines: Line[];
  /** 듣는 사람 스트레스 변화 */
  listenerStress: number;
}

export interface TopicDef {
  id: string;
  /** 이 주제를 꺼낼 만한가, 얼마나 하고 싶은가 (0이면 안 꺼냄) */
  salience: (c: TopicCtx) => number;
  run: (c: TopicCtx) => TopicResult;
}

// ---------- 도우미 ----------

const pick = <T>(rng: Random, xs: T[]): T => rng.pick(xs);
const recent = (c: TopicCtx, since: number, days: number) => c.day - since <= days;
const said = (c: TopicCtx, key: string, withinDays: number) => {
  const d = c.acq.mentioned.get(key);
  return d !== undefined && c.day - d < withinDays;
};
/** 사실을 어떻게 알게 됐는지에 따른 말끝 */
function hearsay(b: Belief, verb: string): string {
  if (b.source === 'rumor') return `${verb}다며? 진짜야?`;
  if (b.source === 'told') return `${verb}대.`;
  return `${verb}더라.`;
}
function milestoneQuestion(key: FactKey, who: string): string {
  const w = josa(who, '은는');
  switch (key) {
    case 'university': return `${w} 대학 어디 갔니?`;
    case 'military': return `${w} 군대 갔니?`;
    case 'job': return `${w} 요즘 뭐 하니? 취직했대?`;
    case 'married': return `${w} 아직 결혼 안 했니?`;
    default: return `${w} 요즘 어떻게 지내니?`;
  }
}
function factPhrase(key: FactKey, value: string): string {
  if (key === 'university') return value === '재수' ? '재수한' : `${value} 간`;
  if (key === 'military') return `${value} 간`;
  if (key === 'job') return `${value} 들어간`;
  if (key === 'married') return '결혼한';
  return value;
}
/** "~간대" 꼴로 */
function factVerb(key: FactKey, value: string): string {
  if (key === 'university') return value === '재수' ? '재수한' : `${value} 갔`;
  if (key === 'military') return `${value} 갔`;
  if (key === 'job') return `${value} 들어갔`;
  if (key === 'married') return '결혼했';
  return value;
}

/** 자식이 대답할 때: "청림대 갔어", "재수해" */
export function answer(key: FactKey, value: string): string {
  if (key === 'university') return value === '재수' ? '재수해.' : `${value} 갔어.`;
  if (key === 'military') return `${value} 갔어.`;
  if (key === 'job') return `${value} 들어갔어.`;
  if (key === 'married') return '결혼했어.';
  if (key === 'dating') return `${josa(callName(value), '이랑랑')} 사귄대.`;
  if (key === 'livesIn') return `${value} 살아.`;
  return `${value}.`;
}
/** 새 소식을 들은 직후의 반응 — 성향마다 다르다 */
export function react(c: TopicCtx, key: FactKey, value: string): string | null {
  const { warmth, expectation } = c.style;
  if (key === 'job') {
    if (expectation > 0.6 && warmth < 0.5) return pick(c.rng, ['대기업? 걔는 뭐가 돼도 될 줄 알았다. 너는 준비는 하고 있니?', '좋겠다, 그 집은.']);
    if (warmth >= 0.5) return pick(c.rng, ['어머, 잘됐다. 너도 연락 한번 해 봐.', '착하더니 잘 풀렸네.']);
    return '그렇구나.';
  }
  if (key === 'military') {
    if (warmth >= 0.5) return '벌써 그럴 나이가 됐구나. 걔 엄마 걱정 많겠다.';
    return pick(c.rng, ['그래, 갈 때 됐지.', '거기 가서 사람 좀 되겠네.']);
  }
  if (key === 'university' && value === '재수' && warmth >= 0.5) return '에구, 걔도 힘들겠다.';
  if (key === 'dating') {
    if (expectation > 0.6 && warmth < 0.5) return '걔는 공부는 안 하고 연애하니?';
    return warmth >= 0.5 ? '어머, 좋을 때다.' : '그래?';
  }
  return null;
}

// ---------- 주제들 (데이터로 계속 늘린다) ----------

export const TOPICS: TopicDef[] = [
  {
    // 아는 아이의 큰 소식을 모르면 궁금해서 묻는다
    id: 'askMilestone',
    salience: (c) => {
      for (const key of Object.keys(FACTS) as FactKey[]) {
        const truth = c.world.fact(c.subjectId, key, c.day);
        if (!truth || !FACTS[key].milestone || !recent(c, truth.since, 400)) continue;
        if (c.speaker.knows(c.subjectId, key)?.value === truth.value) continue;
        if (said(c, `ask:${key}`, 60)) continue;
        return 1.1 + c.acq.strength * 0.5;
      }
      return 0;
    },
    run: (c) => {
      const key = (Object.keys(FACTS) as FactKey[]).find((k) => {
        const t = c.world.fact(c.subjectId, k, c.day);
        return t && FACTS[k].milestone && c.speaker.knows(c.subjectId, k)?.value !== t.value;
      })!;
      c.acq.mentioned.set(`ask:${key}`, c.day);
      const lines: Line[] = [];
      const name = c.world.get(c.subjectId).name;
      if (c.ref.byName) lines.push({ who: c.speakerId, text: milestoneQuestion(key, c.ref.text) });
      else lines.push({ who: c.speakerId, text: `${c.ref.text} 있잖아, 걔 이름이 뭐였더라… ${milestoneQuestion(key, '걔')}` });
      const known = c.listener.knows(c.subjectId, key);
      if (known) {
        const intro = c.ref.byName ? '' : `${name}? `;
        lines.push({ who: c.listenerId, text: `${intro}${answer(key, known.value)}` });
        c.speaker.learn(c.subjectId, key, known.value, 'told', c.day, c.listenerId);
        const r = react(c, key, known.value);
        if (r) lines.push({ who: c.speakerId, text: r });
      } else {
        lines.push({ who: c.listenerId, text: pick(c.rng, ['몰라, 요즘 연락 안 해.', '글쎄… 모르겠는데.']) });
      }
      return { lines, listenerStress: 0 };
    },
  },
  {
    // 아는 아이와 내 아이를 비교한다 — 말하는 사람 성향에 따라 비교·위로·무심
    id: 'compare',
    salience: (c) => {
      const b = c.speaker.knows(c.subjectId, 'university');
      const mine = c.speaker.knows(c.listenerId, 'university');
      if (!b || !mine || c.acq.mentioned.has(`compare:university:${b.value}`)) return 0;
      const theirs = rankOf('university', b.value);
      const ours = rankOf('university', mine.value);
      if (theirs === null || ours === null || theirs >= ours) return 0;
      return 0.5 + (ours - theirs) * 0.12 + c.style.expectation * 0.3;
    },
    run: (c) => {
      const b = c.speaker.knows(c.subjectId, 'university')!;
      c.acq.mentioned.set(`compare:university:${b.value}`, c.day);
      const who = josa(c.ref.text, '은는');
      const news = `${who} ${hearsay(b, factVerb('university', b.value))}`;
      const prefix = b.source === 'rumor' ? `${b.from ? '걔네 엄마' : '누가'}한테 들었는데, ` : '';
      const { warmth, expectation } = c.style;
      let tail: string;
      let stress: number;
      if (expectation > 0.6 && warmth < 0.5) {
        tail = pick(c.rng, ['같이 놀러 다니더니 너는 왜 그랬니.', '그 집 엄마 볼 낯이 없다.', '너도 조금만 했으면 됐잖아.']);
        stress = 9;
      } else if (expectation > 0.6) {
        tail = pick(c.rng, ['너도 조금만 더 했으면… 아니다, 고생했어.', '아쉽긴 하다. 그래도 수고했어.']);
        stress = 4;
      } else if (warmth >= 0.5) {
        tail = pick(c.rng, ['엄마는 네가 건강한 게 제일이야.', '다 자기 길이 있는 거지 뭐.']);
        stress = -2;
      } else {
        tail = '';
        stress = 1;
      }
      const lines: Line[] = [{ who: c.speakerId, text: `${prefix}${news} ${tail}`.trim() }];
      // 소문이면 아들이 확인해 준다 → 엄마 기억에서 소문이 사실로 바뀐다
      const confirm = b.source === 'rumor' ? c.listener.knows(c.subjectId, 'university') : undefined;
      if (confirm) {
        lines.push({ who: c.listenerId, text: confirm.value === b.value ? '응, 맞아.' : `아니, ${answer('university', confirm.value)}` });
        c.speaker.learn(c.subjectId, 'university', confirm.value, 'told', c.day, c.listenerId);
      }
      if (stress >= 9) lines.push({ who: c.listenerId, text: pick(c.rng, ['…그만 좀 해.', '엄마는 맨날 남이랑 비교만 하지.', '……']) });
      return { lines, listenerStress: stress };
    },
  },
  {
    // 내 아이가 더 잘했으면 은근히 기뻐한다
    id: 'praise',
    salience: (c) => {
      const b = c.speaker.knows(c.subjectId, 'university');
      const mine = c.speaker.knows(c.listenerId, 'university');
      if (!b || !mine || c.acq.mentioned.has(`compare:university:${b.value}`)) return 0;
      const theirs = rankOf('university', b.value);
      const ours = rankOf('university', mine.value);
      if (theirs === null || ours === null || theirs <= ours) return 0;
      return 0.5;
    },
    run: (c) => {
      const b = c.speaker.knows(c.subjectId, 'university')!;
      c.acq.mentioned.set(`compare:university:${b.value}`, c.day);
      const who = josa(c.ref.text, '은는');
      const pity = c.acq.impression < -10 && c.style.warmth < 0.5
        ? '그럴 줄 알았다. 놀기만 하더니.'
        : c.style.warmth >= 0.5 ? '걔도 고생 많았을 텐데.' : '';
      return {
        lines: [{ who: c.speakerId, text: `${who} ${hearsay(b, factVerb('university', b.value))} ${pity} 우리 아들은 잘했네.`.replace(/\s+/g, ' ').trim() }],
        listenerStress: -3,
      };
    },
  },
  {
    // 첫인상이 나빴던 애는 기억한다
    id: 'warn',
    salience: (c) => (c.acq.impression <= -15 && !said(c, 'warn', 365) && c.style.warmth < 0.7 ? 0.35 : 0),
    run: (c) => {
      c.acq.mentioned.set('warn', c.day);
      const who = c.ref.byName ? c.ref.text : '그 애';
      return {
        lines: [{ who: c.speakerId, text: `${josa(who, '이가')} ${c.acq.firstMet.context} 때 인사도 안 하던 애 맞지? 엄마는 걔 별로더라.` }],
        listenerStress: 2,
      };
    },
  },
  {
    // 소식이 없어도, 정이 든 아이는 가끔 떠올린다
    id: 'reminisce',
    salience: (c) => (c.acq.impression >= 15 && c.acq.strength >= 0.5 && !said(c, 'reminisce', 300) ? 0.3 : 0),
    run: (c) => {
      c.acq.mentioned.set('reminisce', c.day);
      const years = Math.max(1, Math.round((c.day - c.acq.firstMet.day) / 365));
      return {
        lines: [{ who: c.speakerId, text: `${josa(c.ref.text, '은는')} 요즘 잘 지내니? ${c.acq.firstMet.context} 게 벌써 ${years}년 전이네.` }],
        listenerStress: -1,
      };
    },
  },
];

export { callName, factPhrase };
