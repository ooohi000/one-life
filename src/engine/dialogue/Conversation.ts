import type { Random } from '../core/Random';
import type { MemoryBank } from '../memory/MemoryBank';
import type { World } from '../memory/World';
import { type Line, type SpeakerStyle, type TopicCtx, TOPICS } from './topics';

export interface ConversationResult {
  lines: Line[];
  listenerStress: number;
  topics: string[];
}

/**
 * 대화 한 번 (예: 저녁 식탁).
 * 말하는 사람이 기억하는 모든 사람 × 모든 주제의 "하고 싶은 정도"를 매기고,
 * 높은 것부터 몇 개를 꺼낸다. 대사는 써둔 게 아니라 기억·사실·성향으로 조립된다.
 */
export function converse(opts: {
  world: World;
  day: number;
  rng: Random;
  speakerId: string;
  speaker: MemoryBank;
  style: SpeakerStyle;
  listenerId: string;
  listener: MemoryBank;
  maxTopics?: number;
}): ConversationResult {
  const candidates: Array<{ score: number; ctx: TopicCtx; topic: (typeof TOPICS)[number] }> = [];
  for (const [subjectId, acq] of opts.speaker.people) {
    if (subjectId === opts.listenerId) continue;
    const ref = opts.speaker.referTo(subjectId, opts.day, opts.world);
    if (!ref) continue; // 잊어버린 사람
    const ctx: TopicCtx = { ...opts, subjectId, acq: { ...acq, strength: opts.speaker.strengthAt(subjectId, opts.day) }, ref };
    // acq 사본에 기록하면 원본에 안 남으므로 mentioned/known은 원본을 가리키게 한다
    ctx.acq.mentioned = acq.mentioned;
    ctx.acq.known = acq.known;
    for (const topic of TOPICS) {
      const s = topic.salience(ctx);
      if (s > 0) candidates.push({ score: s + opts.rng.next() * 0.15, ctx, topic });
    }
  }
  candidates.sort((a, b) => b.score - a.score);
  const result: ConversationResult = { lines: [], listenerStress: 0, topics: [] };
  const usedSubjects = new Set<string>();
  for (const c of candidates) {
    if (result.topics.length >= (opts.maxTopics ?? 3)) break;
    if (usedSubjects.has(c.ctx.subjectId)) continue; // 한 사람 얘기는 한 번에 하나만
    if (c.topic.salience(c.ctx) <= 0) continue; // 앞 주제로 상황이 바뀌었을 수 있음
    const r = c.topic.run(c.ctx);
    result.lines.push(...r.lines);
    result.listenerStress += r.listenerStress;
    result.topics.push(`${c.topic.id}:${c.ctx.subjectId}`);
    usedSubjects.add(c.ctx.subjectId);
    opts.speaker.hear(c.ctx.subjectId, opts.day, 0.08); // 얘기를 꺼냈으니 기억이 조금 진해진다
  }
  return result;
}
