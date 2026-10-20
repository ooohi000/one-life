import type { Random } from '../core/Random';
import type { Household } from './household';

/**
 * 아동학대: 누가 알아채고, 누가 말하고, 그 뒤 무슨 일이 벌어지나.
 *
 * 근거 (2024 아동학대 연차보고서 등):
 * - 신고 5만 건 → 학대 판정 2.4만 건. 아동 본인 신고 28%(2020년 14%), 부모 신고 24%
 * - 교사·의사 등은 신고의무자 — 알고도 안 하면 과태료
 * - 판정 뒤 분리 보호 9.4%(즉각분리 포함), 나머지는 원가정 보호 + 사례관리(부모 교육·상담)
 * - 재학대 15.9% — 개입이 늘 성공하지는 않는다
 */
export type Observer = 'teacher' | 'friend' | 'player' | 'self';

export interface Signs {
  /** 남은 멍 일수 (맞은 날부터 7~10일 보인다) */
  bruiseDays: number;
  /** 최근 한 달 결석 */
  absences: number;
  /** 표정이 어둡다·움츠러든다 (두려움에서) */
  withdrawn: boolean;
}

export type CaseStage = 'none' | 'suspected' | 'reported' | 'decided';
export type CaseOutcome = 'notAbuse' | 'homeWithSupport' | 'abuserRemoved' | 'childSeparated';

export interface ProtectionEvent {
  day: number;
  who: Observer | 'agency';
  text: string;
}

/** 한 아이를 둘러싼 보호 과정 */
export class ProtectionCase {
  stage: CaseStage = 'none';
  outcome: CaseOutcome | null = null;
  readonly log: ProtectionEvent[] = [];
  reports = 0;
  /** 판정 뒤 다시 학대가 있었나 */
  reabused = false;
  private decidedDay = -1;
  /** 부모 교육이 먹혔나 */
  private reformed = false;
  private lastReportDay = -999;
  private lastNoticeDay = -999;

  constructor(readonly house: Household) {}

  /**
   * 누군가 아이의 징후를 본다.
   * notice: 관찰자의 눈치(특성 notice), closeness: 아이와의 친밀도 0~1
   * 반환: 알아챘으면 true
   */
  observe(by: Observer, signs: Signs, o: { notice: number; closeness: number; meddle: number }, day: number, rng: Random): boolean {
    if (this.childAway() || day - this.lastReportDay < 90) return false;
    // 이미 학대로 판정돼 사례관리 중이면 상담원이 보고 있다 — 새로 신고할 일은 재학대 때뿐
    if (this.stage === 'decided' && this.outcome !== 'notAbuse') return false;
    // 멍은 대개 옷 속에 있다. 보이는 건 가끔이다
    const visible = (signs.bruiseDays > 0 ? 0.08 : 0) + Math.min(0.1, signs.absences * 0.02) + (signs.withdrawn ? 0.01 : 0);
    if (visible <= 0) return false;
    const p = visible * (0.25 + o.notice * 0.5 + o.closeness * 0.4) * (by === 'teacher' ? 0.6 : 1);
    if (!rng.chance(p) || day - this.lastNoticeDay < 30) return false;
    this.lastNoticeDay = day;
    if (this.stage === 'none') this.stage = 'suspected';
    const fear = this.house.maxFear();
    const disclose = rng.chance(Math.min(0.85, 0.15 + o.closeness * 0.4 - fear / 400 + (signs.bruiseDays > 0 ? 0.1 : 0)));
    const whoKo = { teacher: '담임 선생님', friend: '친구', player: '나', self: '나' }[by];
    if (by === 'teacher') {
      this.say(day, by, disclose ? '담임 선생님이 상담실로 불렀다. "팔은 왜 그래?" …처음으로 말했다.' : '담임 선생님이 팔의 멍을 봤다. "넘어졌어요." 선생님은 믿지 않는 눈치였다.');
      // 신고의무자: 아이가 말하지 않아도 의심되면 신고해야 한다
      if (rng.chance((disclose ? 0.8 : 0.35) + o.meddle * 0.15)) this.report(day, 'teacher', disclose, rng);
    } else {
      this.say(day, by, disclose ? `${whoKo}가 물었다. 결국 다 털어놨다.` : `${whoKo}가 물었다. "아니야, 그냥 부딪혔어."`);
      if (disclose && rng.chance(0.25 + o.meddle * 0.5)) {
        this.say(day, by, `${whoKo}가 담임 선생님에게 말했다.`);
        this.report(day, 'teacher', true, rng);
      }
    }
    return true;
  }

  /** 아이 스스로 신고 (1388·112·학교 상담) */
  selfReport(day: number, rng: Random): void {
    this.say(day, 'self', '떨리는 손으로 112를 눌렀다.');
    this.report(day, 'self', true, rng);
  }

  /** 신고 → 아동보호전문기관·경찰 조사 → 판정 → 조치 */
  report(day: number, by: Observer, disclosed: boolean, rng: Random): void {
    this.reports++;
    this.lastReportDay = day;
    this.stage = 'reported';
    this.say(day, 'agency', '아동보호전문기관 상담원과 경찰이 집에 왔다.');
    const hits = this.house.parents.reduce((s, p) => s + p.incidents.hit, 0);
    const evidence = (disclosed ? 0.45 : 0.1) + Math.min(0.4, hits * 0.08) + (by === 'teacher' ? 0.1 : 0);
    if (!rng.chance(evidence)) {
      this.say(day, 'agency', '증거가 부족했다. "일반 사례"로 끝났다. 그날 밤 집은 더 조용했다.');
      this.outcome = 'notAbuse';
      this.stage = 'decided';
      for (const p of this.house.parents) if (p.incidents.hit > 0) p.anger = Math.min(100, p.anger + 30);
      return;
    }
    this.stage = 'decided';
    this.decidedDay = day;
    const abuser = [...this.house.parents].sort((a, b) => b.incidents.hit - a.incidents.hit)[0]!;
    const protector = this.house.parents.find((p) => p !== abuser && p.traits.affection >= 0.6 && p.traits.temper < 0.5);
    const severe = abuser.incidents.hit >= 6 || this.house.maxFear() >= 85;
    if (severe && rng.chance(0.3)) {
      if (protector) {
        abuser.removed = true;
        this.outcome = 'abuserRemoved';
        this.say(day, 'agency', `학대로 판정됐다. 법원 임시조치로 ${abuser.me}는 집에서 나가야 했다. 100m 접근 금지.`);
      } else {
        this.house.childAway = rng.chance(0.5) ? '친척 집' : '학대피해아동쉼터';
        this.outcome = 'childSeparated';
        this.say(day, 'agency', `학대로 판정됐다. 그날 바로 ${this.house.childAway}으로 옮겨졌다. 학교는 계속 다닐 수 있다.`);
      }
    } else {
      this.outcome = 'homeWithSupport';
      this.say(day, 'agency', `학대로 판정됐다. 집에서 지내되, 상담원이 정기적으로 온다. ${abuser.me}는 부모 교육을 받아야 한다.`);
      // 부모 교육: 사랑이 있는 부모일수록 달라진다
      this.reformed = rng.chance(0.6 + abuser.traits.affection * 0.4);
      if (this.reformed) {
        abuser.traits.temper = Math.max(0.3, Math.min(abuser.traits.temper - 0.25, 0.45));
        abuser.anger = 0;
        abuser.traits.drinking = Math.max(0.05, abuser.traits.drinking - 0.3);
      } else {
        abuser.traits.temper = Math.max(0.3, abuser.traits.temper - 0.2);
      }
    }
  }

  /** 판정 뒤 다시 손이 올라갔나 — 재학대 */
  afterIncident(day: number, hit: boolean, rng: Random): void {
    // 재학대는 판정 뒤 1년 안을 본다
    if (this.stage !== 'decided' || this.outcome === 'notAbuse' || !hit || this.reabused || day - this.decidedDay > 365) return;
    // 사례관리 중이라 상담원이 정기적으로 오지만, 다 드러나지는 않는다
    if (!rng.chance(0.4)) return;
    this.reabused = true;
    this.say(day, 'agency', '또 일이 생겼다. 상담원이 다시 왔다.');
    if (rng.chance(0.35)) {
      this.house.childAway = '학대피해아동쉼터';
      this.outcome = 'childSeparated';
      this.say(day, 'agency', '이번엔 분리 보호. 쉼터로 옮겨졌다.');
    }
  }

  childAway(): boolean {
    return this.house.childAway !== null;
  }

  private say(day: number, who: ProtectionEvent['who'], text: string): void {
    this.log.push({ day, who, text });
  }
}
