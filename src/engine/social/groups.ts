import type { Random } from '../core/Random';
import { FRIEND, type SocialGraph } from './graph';

/**
 * 무리. 정해 둔 반 편성이 아니라 친구 관계가 뭉친 덩어리.
 * 이름은 구성원들의 특성·놀이로 붙는다: 일진 무리, 겜돌이 무리, 운동부 무리…
 */
export interface Group {
  id: number;
  members: string[];
  label: string;
  /** 대장 (제일 존중받거나 센 애) */
  leader: string;
  /** 무리 성향: 범죄로 끄는 정도 0~1 */
  delinquency: number;
}

interface Kind {
  label: string;
  traits: string[];
  hangouts?: string[];
  delinquency: number;
}

/** 무리 이름 붙이는 규칙 (위에서부터 먼저 맞는 것) */
const KINDS: Kind[] = [
  { label: '일진 무리', traits: ['bully', 'brawler', 'rebelSoul', 'firstStrike', 'stickyFingers'], delinquency: 0.8 },
  { label: '폭주 무리', traits: ['speedFreak', 'attention'], delinquency: 0.6 },
  { label: '의리파 무리', traits: ['loyal', 'gritty', 'vigilante'], delinquency: 0.2 },
  { label: '운동부 무리', traits: ['athletic', 'tough'], hangouts: ['gym', 'soccer'], delinquency: 0.15 },
  { label: '겜돌이 무리', traits: ['gamer', 'nightOwl'], hangouts: ['pcbang'], delinquency: 0.15 },
  { label: '모범생 무리', traits: ['rulesFollower', 'grinder', 'bookSmart'], hangouts: ['academy', 'library'], delinquency: 0 },
  { label: '인싸 무리', traits: ['socialite', 'attention', 'silverTongue'], hangouts: ['karaoke'], delinquency: 0.2 },
  { label: '예체능 무리', traits: ['artsy'], hangouts: ['practiceRoom'], delinquency: 0.05 },
];

/**
 * 친구 관계로 무리를 찾는다 (라벨 전파: 각자 친구들이 제일 많이 속한 무리로 옮겨 감).
 * 친구가 없는 애는 무리가 없다 — 그것도 현실이다.
 */
export function findGroups(g: SocialGraph, rng: Random, minSize = 3): Group[] {
  const ids = [...g.people.keys()];
  const label = new Map(ids.map((id, i) => [id, i]));
  for (let round = 0; round < 12; round++) {
    let changed = 0;
    for (const id of shuffle(ids, rng)) {
      const counts = new Map<number, number>();
      for (const f of g.friends(id)) {
        if (!g.mutual(id, f)) continue;
        const l = label.get(f)!;
        counts.set(l, (counts.get(l) ?? 0) + (g.rel(id, f)!.closeness));
      }
      if (!counts.size) continue;
      const best = [...counts].sort((a, b) => b[1] - a[1])[0]![0];
      if (best !== label.get(id)) {
        label.set(id, best);
        changed++;
      }
    }
    if (!changed) break;
  }
  const byLabel = new Map<number, string[]>();
  for (const [id, l] of label) byLabel.set(l, [...(byLabel.get(l) ?? []), id]);
  const groups: Group[] = [];
  for (const members of byLabel.values()) {
    if (members.length < minSize) continue;
    groups.push(describe(g, groups.length, members));
  }
  return groups;
}

function describe(g: SocialGraph, id: number, members: string[]): Group {
  const ppl = members.map((m) => g.people.get(m)!);
  let bestKind: Kind | null = null;
  let bestScore = 0;
  for (const k of KINDS) {
    const traitShare = ppl.filter((p) => p.traits.some((t) => k.traits.includes(t))).length / ppl.length;
    if (traitShare < 0.3) continue; // 특성으로 묶여야 그 무리다 (학원은 다들 다닌다)
    const score = traitShare + (k.hangouts ? (ppl.filter((p) => p.hangouts.some((h) => k.hangouts!.includes(h))).length / ppl.length) * 0.15 : 0);
    if (score > bestScore + 0.05) {
      bestScore = score;
      bestKind = k;
    }
  }
  const kind = bestKind;
  // 대장: 무리 안에서 존중을 제일 많이 받거나, 센 애
  const respectOf = (m: string) => members.reduce((s, o) => s + (o === m ? 0 : g.rel(o, m)?.respect ?? 0), 0) + g.people.get(m)!.power * 0.3 + (g.people.get(m)!.traits.includes('leader') ? 30 : 0);
  const leader = [...members].sort((a, b) => respectOf(b) - respectOf(a))[0]!;
  return { id, members, label: kind?.label ?? '그냥 친한 애들', leader, delinquency: kind?.delinquency ?? 0.1 };
}

/** 그 사람이 속한 무리 */
export function groupOf(groups: Group[], id: string): Group | undefined {
  return groups.find((gr) => gr.members.includes(id));
}

/**
 * 패싸움 모으기: 무리 사람들 + 의리 있는 친구들이 온다. 겁쟁이·모범생은 빠진다.
 */
export function rallyForFight(g: SocialGraph, groups: Group[], who: string, rng: Random, traitsOf: (id: string) => { loyalty: number; fight: number }): string[] {
  const out = new Set<string>([who]);
  const gr = groupOf(groups, who);
  const pool = new Set([...(gr?.members ?? []), ...g.friends(who)]);
  for (const m of pool) {
    if (m === who) continue;
    const r = g.rel(m, who);
    if (!r || r.closeness < FRIEND) continue;
    const t = traitsOf(m);
    const p = (r.closeness / 100) * 0.5 + t.loyalty * 0.4 + t.fight * 0.25 + (gr?.members.includes(m) ? gr.delinquency * 0.3 : 0);
    if (rng.chance(Math.max(0, Math.min(0.95, p)))) out.add(m);
  }
  return [...out];
}

function shuffle<T>(xs: T[], rng: Random): T[] {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng.next() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}
