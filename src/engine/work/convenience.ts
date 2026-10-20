import type { Random } from '../core/Random';
import { MIN_WAGE } from '../npc/actions';

/**
 * 편의점 근무. 직접 하는 노동 — 계산대에서 바코드를 찍고, 진열하고, 폐기하고, 사람을 상대한다.
 *
 * 구조: 근무 시계가 1분씩 간다 → 손님이 오고(시간대별), 할 일이 생기고, 가끔 양심을 묻는 일이 터진다.
 * 작업(계산·진열·폐기·청소)은 "미니게임 결과"(quality 0~1)를 받아서 끝난다.
 *   - 화면이 붙으면: 플레이어가 직접 한 결과
 *   - 지금/자동 근무: 손 실력(경험·눈치·생활력) + 몸 상태로 계산한 결과 (autoHand)
 *
 * 현실 근거 (청소년 알바):
 * - 만 18세 미만: 1일 7시간·주 35시간, 밤 10시 이후·휴일 근로는 원칙적으로 불가 → 근무는 17:30~21:30
 * - 최저시급은 성인과 같다(2026년 10,320원). 주 15시간 이상이면 주휴수당. 근로계약서 필수.
 * - 못 받으면 고용노동부 1350, 청소년근로권익센터 1644-3199
 * - 청소년에게 담배·술 판매 금지(청소년보호법). 알바생도 처벌받을 수 있고 가게는 영업정지.
 */

export interface Product {
  id: string;
  name: string;
  price: number;
  /** 청소년 판매 금지 */
  adult?: boolean;
  /** 진열대 */
  shelf: 'food' | 'drink' | 'snack' | 'counter' | 'daily';
}

export const PRODUCTS: Product[] = [
  { id: 'kimbap', name: '삼각김밥', price: 1500, shelf: 'food' },
  { id: 'dosirak', name: '도시락', price: 4900, shelf: 'food' },
  { id: 'ramen', name: '컵라면', price: 1800, shelf: 'food' },
  { id: 'sandwich', name: '샌드위치', price: 3200, shelf: 'food' },
  { id: 'cola', name: '콜라', price: 2200, shelf: 'drink' },
  { id: 'coffee', name: '캔커피', price: 1600, shelf: 'drink' },
  { id: 'water', name: '생수', price: 1000, shelf: 'drink' },
  { id: 'energy', name: '에너지드링크', price: 2500, shelf: 'drink' },
  { id: 'chips', name: '과자', price: 1700, shelf: 'snack' },
  { id: 'icecream', name: '아이스크림', price: 1800, shelf: 'snack' },
  { id: 'gum', name: '껌', price: 1200, shelf: 'counter' },
  { id: 'cigarette', name: '담배', price: 4500, adult: true, shelf: 'counter' },
  { id: 'soju', name: '소주', price: 1900, adult: true, shelf: 'drink' },
  { id: 'beer', name: '캔맥주', price: 2800, adult: true, shelf: 'drink' },
  { id: 'umbrella', name: '우산', price: 6000, shelf: 'daily' },
  { id: 'battery', name: '보조배터리 대여', price: 3000, shelf: 'counter' },
];
const P = (id: string) => PRODUCTS.find((p) => p.id === id)!;

/** 손님 유형 */
export type CustomerKind = 'student' | 'worker' | 'elder' | 'drunk' | 'rude' | 'rider' | 'regular';

/** 이 세계의 사람이 손님으로 올 때 (WorldSim이 채워 준다) */
export interface KnownVisitor {
  id: string;
  name: string;
  age: number;
  /** 주인공과의 관계 */
  relation: 'friend' | 'classmate' | 'bully' | 'parentFriend' | 'teacher' | 'acquaintance';
}

export interface Customer {
  n: number;
  kind: CustomerKind;
  label: string;
  items: Product[];
  arrived: number;
  /** 기다릴 수 있는 시간(분) */
  patience: number;
  visitor?: KnownVisitor;
  /** 내는 돈 */
  pays: number;
  /** 미성년자인가 (판매 금지 상품을 들고 왔으면 문제) */
  minor: boolean;
}

export type TaskKind = 'checkout' | 'restock' | 'discard' | 'clean';

export interface Task {
  id: string;
  kind: TaskKind;
  label: string;
  /** 표준 소요(분) — 결과(quality)가 좋으면 빨라진다 */
  baseMin: number;
  customer?: Customer;
  shelf?: Product['shelf'];
}

/** 미니게임 결과 */
export interface HandResult {
  /** 0~1: 정확도·속도 */
  quality: number;
  /** 거스름돈 실수 등 (원). 음수면 덜 줌, 양수면 더 줌 */
  changeError?: number;
}

export interface Dilemma {
  id: string;
  kind: 'idCheck' | 'expiredFood' | 'freebie' | 'overpaid' | 'unpaidOvertime' | 'shoplifter' | 'drunk';
  text: string;
  options: Array<{ id: string; label: string }>;
  customer?: Customer;
}

export interface ShiftEvent {
  minute: number;
  text: string;
  kind: 'customer' | 'task' | 'dilemma' | 'boss' | 'people' | 'trouble';
}

export type BossType = 'kind' | 'strict' | 'stingy';

export interface Job {
  store: string;
  boss: BossType;
  /** 실제로 주는 시급 (인색한 사장은 최저임금보다 적게 주기도 한다) */
  hourly: number;
  /** 근로계약서 썼나 */
  contract: boolean;
  /** 사장 평가 -100~100 */
  standing: number;
  /** 근무 횟수 (손이 익는다) */
  shifts: number;
  warnings: number;
  fired: boolean;
  /** 이번 주 일한 시간 (주휴수당) */
  weekMinutes: number;
}

export function newJob(rng: Random): Job {
  const boss: BossType = rng.pick(['kind', 'kind', 'strict', 'strict', 'stingy']);
  return {
    store: rng.pick(['GS25 ○○역점', 'CU ○○사거리점', '세븐일레븐 ○○초교점', '이마트24 ○○아파트점']),
    boss,
    hourly: boss === 'stingy' && rng.chance(0.5) ? 9000 : MIN_WAGE,
    contract: boss !== 'stingy' || rng.chance(0.3),
    standing: 0,
    shifts: 0,
    warnings: 0,
    fired: false,
    weekMinutes: 0,
  };
}

/** 근무하는 사람 (주인공) */
export interface Worker {
  id: string;
  name: string;
  age: number;
  /** 눈치·생활력 0~100 */
  tact: number;
  streetSmart: number;
  speech: number;
  /** 몸 상태 0~1 (졸림·스트레스·배고픔이 깎는다) */
  condition: number;
}

export interface ShiftReport {
  minutes: number;
  wage: number;
  sales: number;
  customers: number;
  servedFast: number;
  leftAngry: number;
  changeErrors: number;
  /** 손님 만족 평균 0~100 */
  satisfaction: number;
  standingDelta: number;
  events: ShiftEvent[];
  /** 마주친 이 세계 사람들과 무슨 일이 있었나 */
  met: Array<{ visitor: KnownVisitor; note: string; closeness: number; grudge: number; rumor?: string }>;
  /** 양심 선택 기록 */
  choices: Array<{ kind: Dilemma['kind']; option: string }>;
  /** 법·규정 위반 (단속에 걸리면 큰일) */
  violations: string[];
  /** 몸에 남는 것 */
  stress: number;
  fatigueMin: number;
  /** 폐기 먹어서 아낀 저녁 */
  ateExpired: boolean;
  fired: boolean;
}

const KIND_LABEL: Record<CustomerKind, string> = {
  student: '교복 입은 학생', worker: '퇴근하는 직장인', elder: '동네 어르신', drunk: '술 취한 아저씨', rude: '반말하는 손님', rider: '배달 기사님', regular: '단골',
};

/** 시간대별 손님 수 (분당) — 저녁 6~8시 퇴근길이 제일 바쁘다 */
function arrivalRate(minuteOfDay: number): number {
  const h = minuteOfDay / 60;
  if (h < 18) return 0.25;
  if (h < 20) return 0.45;
  if (h < 21) return 0.3;
  return 0.22;
}

export interface ShiftOptions {
  start: number;
  end: number;
  raining?: boolean;
  /**
   * 화면에서 직접 할 때: 게임 시간이 압축되니(1분 ≈ 1초) 사람이 따라갈 수 있게
   * 손님 오는 빈도(pace)를 줄이고, 기다려 주는 시간(patience)을 늘린다. 자동 근무는 1·1.
   */
  pace?: number;
  patience?: number;
}

/**
 * 근무 한 번. tick()으로 1분씩 흘러가고, 할 일(tasks)과 고민(dilemma)이 생긴다.
 * 플레이어(화면)든 자동 손이든 perform()/decide()로 처리한다.
 */
export class ConvenienceShift {
  minute: number;
  readonly end: number;
  readonly queue: Customer[] = [];
  readonly tasks: Task[] = [];
  /** 답을 기다리는 고민들 (한 손님이 둘을 들고 올 수도 있다) */
  private dilemmas: Dilemma[] = [];
  get dilemma(): Dilemma | null {
    return this.dilemmas[0] ?? null;
  }
  private restocking = new Set<Product['shelf']>();
  private overtimeAsked = false;
  readonly report: ShiftReport;
  private shelves: Record<Product['shelf'], number> = { food: 1, drink: 1, snack: 1, counter: 1, daily: 1 };
  private n = 0;
  private busyUntil = 0;
  private satSum = 0;
  private satN = 0;
  private discardDone = false;
  private nextTaskId = 0;
  private visitorsLeft: KnownVisitor[];
  /** 근무 중 지금 하고 있는 일 */
  doing: Task | null = null;

  constructor(
    readonly job: Job,
    readonly worker: Worker,
    readonly rng: Random,
    /** 이 동네에 사는 아는 사람들 (오늘 손님으로 올 수 있는) */
    visitors: KnownVisitor[] = [],
    readonly opts: ShiftOptions = { start: 17 * 60 + 30, end: 21 * 60 + 30 },
  ) {
    this.minute = opts.start;
    this.end = opts.end;
    this.visitorsLeft = [...visitors];
    this.report = {
      minutes: 0, wage: 0, sales: 0, customers: 0, servedFast: 0, leftAngry: 0, changeErrors: 0, satisfaction: 0, standingDelta: 0,
      events: [], met: [], choices: [], violations: [], stress: 0, fatigueMin: 0, ateExpired: false, fired: false,
    };
    this.log('boss', job.boss === 'kind' ? '사장님: "오늘도 잘 부탁해~"' : job.boss === 'strict' ? '사장님: "어제 시재 300원 비더라. 똑바로 해."' : '사장님: "이번 달 장사 안 돼. 아껴 써."');
  }

  get done(): boolean {
    return this.minute >= this.end && !this.dilemma;
  }

  /** 1분 흐른다 */
  tick(): void {
    if (this.dilemma || this.minute >= this.end) return;
    const rng = this.rng;
    this.minute++;
    this.report.minutes++;
    // 손님
    if (rng.chance(arrivalRate(this.minute) * (this.opts.raining ? 1.3 : 1) * (this.opts.pace ?? 1))) this.arrive();
    // 기다리다 지친 손님
    for (const c of [...this.queue]) {
      if (this.minute - c.arrived > c.patience) {
        this.queue.splice(this.queue.indexOf(c), 1);
        const ti = this.tasks.findIndex((t) => t.customer === c);
        if (ti >= 0) this.tasks.splice(ti, 1);
        this.report.leftAngry++;
        this.satisfy(0);
        this.log('customer', `${c.label}: "${rng.pick(['아 됐어요.', '장사 안 하나?', '(물건을 내려놓고 나간다)'])}"`);
      }
    }
    // 진열대가 비면 할 일이 생긴다
    for (const s of Object.keys(this.shelves) as Array<Product['shelf']>) {
      if (this.shelves[s] < 0.3 && !this.restocking.has(s) && !this.tasks.some((t) => t.kind === 'restock' && t.shelf === s)) {
        this.addTask({ kind: 'restock', label: `${({ food: '도시락·김밥', drink: '음료', snack: '과자', counter: '계산대 앞', daily: '생활용품' })[s]} 채우기`, baseMin: 6, shelf: s });
      }
    }
    // 8시 폐기 시간
    if (!this.discardDone && this.minute >= 20 * 60) {
      this.discardDone = true;
      this.addTask({ kind: 'discard', label: '유통기한 지난 삼각김밥·도시락 폐기', baseMin: 8 });
    }
    // 가끔 사건
    if (rng.chance(0.004)) this.addTask({ kind: 'clean', label: '바닥에 쏟은 컵라면 국물 닦기', baseMin: 5 });
    if (!this.overtimeAsked && this.minute === this.end - 10) {
      this.overtimeAsked = true;
      if (rng.chance(this.job.boss === 'kind' ? 0.1 : 0.35)) {
        this.ask({ id: 'ot', kind: 'unpaidOvertime', text: '마감 10분 전, 사장님: "다음 알바가 30분 늦는대. 좀만 더 있어 줄래?"', options: [{ id: 'stay', label: '그냥 있어 준다' }, { id: 'ask', label: '"그럼 30분 수당 주시는 거죠?"' }, { id: 'leave', label: '"죄송해요, 학원 가야 해요."' }] });
      }
    }
    if (rng.chance(0.003)) this.trouble();
    // 지금 하는 일이 끝났나
    if (this.doing && this.minute >= this.busyUntil) this.doing = null;
  }

  /**
   * 할 일을 한다 — result는 미니게임 결과.
   * realtime: 화면에서 직접 한 경우 그동안 시계는 이미 흘렀다(tick을 화면이 불렀다) → 시간을 더 보내지 않는다.
   */
  perform(taskId: string, result: HandResult, realtime = false): void {
    const t = this.tasks.find((x) => x.id === taskId);
    if (!t || this.dilemma) return;
    this.tasks.splice(this.tasks.indexOf(t), 1);
    const q = Math.max(0, Math.min(1, result.quality));
    const took = realtime ? 0 : Math.max(1, Math.round(t.baseMin * (1.6 - q)));
    this.doing = t;
    this.busyUntil = this.minute + took;
    if (t.kind === 'restock' && t.shelf) this.restocking.add(t.shelf);
    // 일하는 동안 시간이 간다 (다른 손님은 기다린다)
    for (let i = 0; i < took - 1 && this.minute < this.end && !this.dilemma; i++) this.tick();
    this.report.fatigueMin += took;
    if (t.kind === 'checkout' && t.customer) this.checkout(t.customer, q, result.changeError ?? 0);
    else if (t.kind === 'restock' && t.shelf) {
      this.shelves[t.shelf] = 0.7 + q * 0.3;
      this.restocking.delete(t.shelf);
      if (q < 0.3) this.log('task', '진열을 대충 했다. 라벨이 거꾸로다.');
    } else if (t.kind === 'discard') {
      this.ask({ id: 'expired', kind: 'expiredFood', text: '폐기할 삼각김밥 세 개. 저녁을 못 먹었다. 사장님은 "폐기는 무조건 버려"라고 했었다.', options: [{ id: 'eat', label: '몰래 먹는다' }, { id: 'ask', label: '사장님께 먹어도 되냐고 물어본다' }, { id: 'throw', label: '버린다' }] });
    } else if (t.kind === 'clean') this.log('task', q > 0.5 ? '바닥을 닦았다.' : '대충 닦았다. 끈적거린다.');
  }

  /** 고민에 답한다 */
  decide(optionId: string): void {
    const d = this.dilemma;
    if (!d) return;
    this.dilemmas.shift();
    this.report.choices.push({ kind: d.kind, option: optionId });
    const rng = this.rng;
    const c = d.customer;
    const meet = (note: string, closeness: number, grudge: number, rumor?: string) => {
      if (c?.visitor) this.report.met.push({ visitor: c.visitor, note, closeness, grudge, rumor });
    };
    switch (d.kind) {
      case 'idCheck':
        if (optionId === 'sell') {
          this.report.violations.push('청소년 담배·술 판매');
          meet('신분증 없이 팔아 줬다', 6, 0, `${this.worker.name}네 편의점은 신분증 검사 안 한대.`);
          // 단속반(미성년자 위장 손님)일 수도 있다
          if (rng.chance(c?.visitor ? 0.02 : 0.12)) {
            this.log('trouble', '계산이 끝나자 그 손님 뒤로 단속반이 들어왔다. "청소년 주류·담배 판매로 적발됐습니다."');
            this.job.standing -= 60;
            this.report.fired = true;
          }
        } else if (optionId === 'refuse') {
          this.log('customer', c?.visitor ? `${c.visitor.name}: "아 야, 우리 사이에 진짜 이러기냐?"` : '손님: "아 됐어요." (나간다)');
          meet('신분증 없다고 안 팔았다', -4, c?.visitor?.relation === 'bully' ? 25 : 8);
          this.job.standing += 2;
        }
        break;
      case 'expiredFood':
        if (optionId === 'eat') {
          this.report.ateExpired = true;
          if (this.job.boss === 'strict' && rng.chance(0.3)) {
            this.log('boss', 'CCTV를 돌려본 사장님: "폐기 먹지 말랬지. 이번이 마지막 경고야."');
            this.job.warnings++;
            this.job.standing -= 15;
          } else this.log('task', '창고에서 삼각김밥을 먹었다. 차가웠지만 맛있었다.');
        } else if (optionId === 'ask') {
          const ok = this.job.boss !== 'strict';
          this.log('boss', ok ? '사장님: "먹어 먹어, 버리는 건데 뭐."' : '사장님: "안 돼. 규정이야."');
          this.report.ateExpired = ok;
          this.job.standing += 3;
        } else this.log('task', '폐기를 버렸다. 배가 고팠다.');
        break;
      case 'freebie':
        if (optionId === 'give') {
          this.report.violations.push('계산 안 하고 줌');
          this.report.sales -= c?.items.reduce((s, p) => s + p.price, 0) ?? 0;
          meet('공짜로 줬다', 10, 0, `${this.worker.name}네 편의점 가면 공짜로 줌 ㅋㅋ`);
          if (rng.chance(0.25)) {
            this.log('boss', '시재가 안 맞았다. 사장님이 CCTV를 봤다. "친구한테 공짜로 줬어?"');
            this.job.standing -= 30;
            this.job.warnings++;
          }
        } else {
          meet('안 된다고 했다', -3, 3);
          this.log('customer', c?.visitor ? `${c.visitor.name}: "치사하네 ㅋㅋ 알았어."` : '');
        }
        break;
      case 'overpaid':
        if (optionId === 'return') {
          this.log('customer', '"어머, 고마워요 학생." 어르신이 웃었다.');
          this.satisfy(100);
          this.job.standing += 3;
        } else {
          this.log('task', '만 원짜리 한 장이 더 있었다. 주머니에 넣었다.');
          this.report.violations.push('거스름돈 착복');
        }
        break;
      case 'unpaidOvertime':
        if (optionId === 'stay') {
          this.log('boss', '30분 더 있었다. 수당 얘기는 없었다.');
          this.report.fatigueMin += 30;
          this.report.violations.push('연장 근로 무급 (사장 쪽 위반)');
          this.job.standing += 8;
        } else if (optionId === 'ask') {
          this.log('boss', this.job.boss === 'stingy' ? '사장님: "알바가 무슨 수당을 따져?"' : '사장님: "아, 그래 그래. 30분 치 줄게."');
          if (this.job.boss !== 'stingy') this.report.wage += Math.round(this.job.hourly * 0.5 * 1.5);
          this.job.standing += this.job.boss === 'stingy' ? -10 : 2;
        } else {
          this.log('boss', '사장님: "…그래, 가 봐." 표정이 별로였다.');
          this.job.standing -= 5;
        }
        break;
      case 'shoplifter':
        if (optionId === 'confront') {
          const scared = c?.visitor?.relation === 'bully';
          this.log('trouble', scared ? `${c!.visitor!.name}: "뭐? 너 지금 나한테 그랬냐?" …결국 계산하고 나갔다. 나가면서 노려봤다.` : '"저기요, 그거 계산 안 하셨어요." 손님이 얼굴이 빨개져서 계산했다.');
          meet('훔치는 걸 잡았다', -10, scared ? 35 : 15);
          this.job.standing += 10;
        } else if (optionId === 'boss') {
          this.log('boss', '사장님께 말했다. 사장님이 CCTV를 확인하고 경찰에 신고했다.');
          meet('훔친 걸 사장님께 말했다', -20, 40, c?.visitor ? `${c.visitor.name} 편의점에서 물건 훔치다 걸렸대.` : undefined);
          this.job.standing += 12;
        } else {
          this.log('task', '못 본 척했다.');
          this.report.sales -= 3000;
          meet('훔치는 걸 봤지만 모른 척했다', 3, 0);
        }
        break;
      case 'drunk':
        if (optionId === 'polite') {
          const ok = rng.chance(0.4 + this.worker.speech / 200);
          this.log('customer', ok ? '아저씨가 "그래 미안하다 학생…" 하고 나갔다.' : '아저씨가 계속 소리를 질렀다. 다른 손님들이 나갔다.');
          this.report.stress += ok ? 5 : 15;
          if (!ok) this.report.leftAngry += 2;
        } else if (optionId === 'firm') {
          this.log('customer', '"나가 주세요." …아저씨가 욕을 하며 나갔다. 손이 떨렸다.');
          this.report.stress += 10;
        } else {
          this.log('trouble', '112에 신고했다. 경찰이 와서 아저씨를 데려갔다.');
          this.report.stress += 8;
        }
        break;
    }
  }

  /** 근무 끝 정산 */
  finish(): ShiftReport {
    while (this.minute < this.end && !this.dilemma) this.tick();
    const r = this.report;
    const hours = r.minutes / 60;
    r.wage += Math.round(this.job.hourly * hours);
    this.job.weekMinutes += r.minutes;
    this.job.shifts++;
    r.satisfaction = this.satN ? Math.round(this.satSum / this.satN) : 70;
    const perf = (r.satisfaction - 60) / 10 - r.leftAngry * 1.5 - r.changeErrors * 3;
    r.standingDelta = Math.round(perf + (this.job.boss === 'strict' ? -1 : 1));
    this.job.standing = Math.max(-100, Math.min(100, this.job.standing + r.standingDelta));
    r.stress = Math.min(45, r.stress + 6 + r.leftAngry * 1.5 + r.changeErrors * 2);
    if (this.job.warnings >= 3 || this.job.standing <= -60) {
      r.fired = true;
      this.job.fired = true;
      this.log('boss', '사장님: "내일부터 안 나와도 돼."');
    }
    return r;
  }

  // ───────── 내부 ─────────

  private arrive() {
    const rng = this.rng;
    this.n++;
    // 이 세계 사람이 손님으로 온다 (하루에 몇 명)
    const visitor = this.visitorsLeft.length && rng.chance(0.18) ? this.visitorsLeft.splice(Math.floor(rng.next() * this.visitorsLeft.length), 1)[0] : undefined;
    const h = this.minute / 60;
    const kind: CustomerKind = visitor ? (visitor.age < 20 ? 'student' : 'regular')
      : rng.pick(h < 19 ? ['student', 'student', 'worker', 'worker', 'elder', 'rider', 'regular'] : h < 20.5 ? ['worker', 'worker', 'worker', 'rude', 'rider', 'regular', 'student', 'elder'] : ['worker', 'worker', 'drunk', 'rude', 'rider', 'regular', 'student']);
    const minor = visitor ? visitor.age < 19 : kind === 'student' && rng.chance(0.9);
    const pick = (): Product => {
      if (this.opts.raining && rng.chance(0.15)) return P('umbrella');
      const wantsAdult = (kind === 'worker' || kind === 'drunk' || kind === 'rude') ? rng.chance(0.35) : minor ? rng.chance(visitor?.relation === 'bully' ? 0.6 : 0.05) : false;
      if (wantsAdult) return rng.pick(PRODUCTS.filter((p) => p.adult));
      return rng.pick(PRODUCTS.filter((p) => !p.adult && p.id !== 'umbrella'));
    };
    const items = Array.from({ length: 1 + Math.floor(rng.next() * (kind === 'worker' ? 4 : 3)) }, pick);
    const total = items.reduce((s, p) => s + p.price, 0);
    const pays = rng.chance(0.7) ? total : Math.ceil(total / 10000) * 10000 + (rng.chance(0.2) ? 10000 : 0);
    const c: Customer = {
      n: this.n, kind, items, arrived: this.minute, patience: (kind === 'elder' ? 8 : kind === 'rude' ? 3 : 5) * (this.opts.patience ?? 1), pays, minor, visitor,
      label: visitor ? `${visitor.name}(${({ friend: '친구', classmate: '같은 반', bully: '일진', parentFriend: '엄마 친구', teacher: '선생님', acquaintance: '아는 애' })[visitor.relation]})` : KIND_LABEL[kind],
    };
    this.queue.push(c);
    this.report.customers++;
    this.addTask({ kind: 'checkout', label: `${c.label} 계산 — ${items.map((p) => p.name).join(', ')}`, baseMin: 0.6 + items.length * 0.3, customer: c });
    if (visitor) this.greet(c);
  }

  private greet(c: Customer) {
    const v = c.visitor!;
    const lines: Record<KnownVisitor['relation'], string[]> = {
      friend: ['야 ㅋㅋ 너 여기서 일하냐?', '오 사장님 ㅋㅋ'],
      classmate: ['어? 너 여기서 알바해?', '(눈이 마주쳤다. 어색하게 고개를 끄덕였다.)'],
      bully: ['어~ 알바생? ㅋㅋ', '(친구들이랑 들어오며 웃는다.)'],
      parentFriend: ['어머, 너 OO이 아니니? 여기서 일해?', '엄마는 아시니?'],
      teacher: ['…너 여기서 알바하냐? 학교에 신고는 했고?', '(선생님이 컵라면을 들고 서 있다.)'],
      acquaintance: ['어, 안녕.', '(아는 얼굴이다.)'],
    };
    this.log('people', `${c.label}: "${this.rng.pick(lines[v.relation])}"`);
    if (v.relation === 'parentFriend') {
      this.report.met.push({ visitor: v, note: '편의점에서 알바하는 걸 봤다', closeness: 0, grudge: 0, rumor: `${this.worker.name}이 편의점에서 알바하더라.` });
    }
  }

  private checkout(c: Customer, q: number, changeError: number) {
    const rng = this.rng;
    this.queue.splice(this.queue.indexOf(c), 1);
    // 미성년자가 담배·술을 들고 왔다
    if (c.items.some((p) => p.adult) && (c.minor || rng.chance(0.04))) {
      this.ask({
        id: `id${c.n}`, kind: 'idCheck', customer: c,
        text: `${c.label}: "${c.items.filter((p) => p.adult).map((p) => p.name).join(', ')} 주세요." ${c.visitor ? (c.minor ? '같은 학년이다.' : '') : c.minor ? '앳돼 보인다.' : '나이를 가늠하기 어렵다.'}`,
        options: [{ id: 'refuse', label: '"신분증 보여 주세요." (없으면 안 판다)' }, { id: 'sell', label: '그냥 판다' }],
      });
      c.items = c.items.filter((p) => !p.adult);
    }
    // 친구가 공짜로 달라고 한다
    if (c.visitor && (c.visitor.relation === 'friend' || c.visitor.relation === 'bully') && rng.chance(c.visitor.relation === 'bully' ? 0.5 : 0.25)) {
      this.ask({
        id: `free${c.n}`, kind: 'freebie', customer: c,
        text: c.visitor.relation === 'bully' ? `${c.visitor.name}: "야, 이거 그냥 줘라. 친구잖아?"` : `${c.visitor.name}: "야 이거 하나만 그냥 주면 안 되냐 ㅋㅋ 아무도 모르잖아."`,
        options: [{ id: 'give', label: '그냥 준다' }, { id: 'no', label: '"안 돼, 나 잘려."' }],
      });
    }
    // 어르신이 돈을 더 냈다
    if (c.kind === 'elder' && rng.chance(0.08)) {
      this.ask({ id: `over${c.n}`, kind: 'overpaid', customer: c, text: '어르신이 낸 돈을 세어 보니 만 원이 더 있다. 어르신은 모르는 눈치다.', options: [{ id: 'return', label: '"어르신, 돈 더 주셨어요."' }, { id: 'keep', label: '모른 척한다' }] });
    }
    // 계산 안 하고 주머니에 넣는 손님
    if (rng.chance(c.visitor?.relation === 'bully' ? 0.15 : 0.008)) {
      this.ask({ id: `steal${c.n}`, kind: 'shoplifter', customer: c, text: `${c.label}이 과자 하나를 주머니에 넣는 걸 봤다.`, options: [{ id: 'confront', label: '"그거 계산하셔야죠."' }, { id: 'boss', label: '사장님께 말한다' }, { id: 'ignore', label: '못 본 척한다' }] });
    }
    if (c.kind === 'drunk' && rng.chance(0.25)) {
      this.ask({ id: `drunk${c.n}`, kind: 'drunk', customer: c, text: '술 취한 아저씨: "야! 학생! 이거 왜 이렇게 비싸! 사장 나오라 그래!"', options: [{ id: 'polite', label: '공손하게 달랜다' }, { id: 'firm', label: '"나가 주세요."' }, { id: 'police', label: '112에 신고한다' }] });
    }
    const total = c.items.reduce((s, p) => s + p.price, 0);
    this.report.sales += total;
    for (const p of c.items) this.shelves[p.shelf] = Math.max(0, this.shelves[p.shelf] - 0.05);
    if (changeError !== 0) {
      this.report.changeErrors++;
      this.report.sales -= changeError;
      this.log('task', changeError > 0 ? `거스름돈을 ${changeError.toLocaleString()}원 더 줬다. 마감 때 시재가 빌 거다.` : `거스름돈을 ${(-changeError).toLocaleString()}원 덜 줬다. "학생, 잔돈 덜 줬잖아!"`);
    }
    const waited = this.minute - c.arrived;
    if (waited <= 2) this.report.servedFast++;
    this.satisfy(Math.max(0, Math.min(100, 100 - waited * 12 - (changeError < 0 ? 40 : 0) + q * 10 - (c.kind === 'rude' ? 15 : 0))));
    if (c.kind === 'rude' && rng.chance(0.4)) {
      this.log('customer', `반말하는 손님: "${rng.pick(['야, 봉투.', '빨리 좀 해.', '카드 안 되냐?'])}"`);
      this.report.stress += 3;
    }
  }

  private trouble() {
    const rng = this.rng;
    const x = rng.pick(['정전', '택배', '포스기']);
    if (x === '정전') this.log('trouble', '갑자기 정전. 손님들이 웅성거렸다. 3분 뒤 불이 들어왔다.');
    if (x === '택배') this.addTask({ kind: 'restock', label: '택배 박스 정리', baseMin: 5, shelf: 'daily' });
    if (x === '포스기') this.log('trouble', '포스기가 멈췄다. 재부팅하는 동안 줄이 길어졌다.');
  }

  private ask(d: Dilemma) {
    this.dilemmas.push(d);
    this.log('dilemma', d.text);
  }

  private addTask(t: Omit<Task, 'id'>) {
    this.tasks.push({ ...t, id: `t${this.nextTaskId++}` });
    if (t.kind !== 'checkout') this.log('task', `할 일: ${t.label}`);
    if (t.kind === 'checkout') return;
  }

  private satisfy(v: number) {
    this.satSum += v;
    this.satN++;
  }

  private log(kind: ShiftEvent['kind'], text: string) {
    if (text) this.report.events.push({ minute: this.minute, text, kind });
  }
}

/**
 * 자동 손: 화면 없이(또는 "평소대로 하기") 근무할 때 미니게임 결과를 대신 낸다.
 * 손이 익을수록(근무 횟수), 눈치·생활력이 높을수록, 몸 상태가 좋을수록 잘한다.
 */
export function autoHand(w: Worker, job: Job, task: Task, rng: Random): HandResult {
  const skill = Math.min(1, 0.35 + Math.min(job.shifts, 30) / 60 + (w.tact + w.streetSmart) / 400);
  const quality = Math.max(0, Math.min(1, skill * (0.6 + w.condition * 0.4) + (rng.next() - 0.5) * 0.3));
  let changeError = 0;
  if (task.kind === 'checkout' && task.customer && task.customer.pays > 0 && rng.chance(Math.max(0.01, 0.12 - quality * 0.12))) {
    changeError = rng.pick([-1000, 1000, -500, 500, 10000]);
  }
  return { quality, changeError };
}

/**
 * 월급날(주말 정산). 주 15시간 이상이면 주휴수당 = (주 근로시간 ÷ 40) × 8시간 × 시급.
 * 짠돌이 사장은 최저임금·주휴수당을 안 주기도 한다 → 참을까, 말할까, 신고할까.
 */
export interface Payday {
  /** 주휴수당으로 이번에 실제로 들어온 돈 (시급분은 근무 때마다 이미 받았다) */
  weeklyPaid: number;
  paid: number;
  /** 받았어야 할 돈 */
  owed: number;
  text: string;
  options: Array<{ id: 'accept' | 'ask' | 'report'; label: string }>;
}

export function payday(job: Job, rng: Random): Payday {
  const hours = job.weekMinutes / 60;
  const legalHourly = Math.max(job.hourly, MIN_WAGE);
  const weekly = hours >= 15 ? Math.round((Math.min(hours, 40) / 40) * 8 * legalHourly) : 0;
  const owed = Math.round(hours * legalHourly) + weekly;
  const paidWeekly = job.boss === 'stingy' && rng.chance(0.7) ? 0 : weekly;
  const paid = Math.round(hours * job.hourly) + paidWeekly;
  job.weekMinutes = 0;
  const short = owed - paid;
  return {
    weeklyPaid: paidWeekly,
    paid,
    owed,
    text: short > 0
      ? `이번 주 ${hours.toFixed(1)}시간 일했다. 통장에 ${paid.toLocaleString()}원이 들어왔다. 계산해 보니 ${short.toLocaleString()}원이 모자란다.${job.hourly < MIN_WAGE ? ' 시급이 최저임금보다 적다.' : ''}${weekly && !paidWeekly ? ' 주휴수당도 없다.' : ''}`
      : `이번 주 ${hours.toFixed(1)}시간 일했다. ${paid.toLocaleString()}원${weekly ? ' (주휴수당 포함)' : ''}이 들어왔다.`,
    options: short > 0
      ? [{ id: 'ask', label: '사장님께 말씀드린다' }, { id: 'report', label: '고용노동부(1350)에 신고한다' }, { id: 'accept', label: '그냥 넘어간다' }]
      : [{ id: 'accept', label: '확인' }],
  };
}

/** 월급날 선택의 결과 */
export function resolvePayday(job: Job, pd: Payday, choice: Payday['options'][number]['id'], rng: Random): { extra: number; text: string } {
  const short = pd.owed - pd.paid;
  if (choice === 'accept' || short <= 0) return { extra: 0, text: short > 0 ? '말 꺼내기가 무서웠다. 그냥 넘어갔다.' : '' };
  if (choice === 'ask') {
    if (job.boss !== 'stingy' || rng.chance(0.3)) {
      job.hourly = Math.max(job.hourly, MIN_WAGE);
      return { extra: short, text: '사장님: "아 그랬나? 미안 미안, 바로 넣어 줄게."' };
    }
    job.standing -= 15;
    return { extra: 0, text: '사장님: "다들 이렇게 받고 일해. 싫으면 그만두든가."' };
  }
  // 신고: 대부분 받아 낸다. 대신 그 가게는 사실상 끝이다
  job.fired = true;
  job.hourly = Math.max(job.hourly, MIN_WAGE);
  return { extra: short, text: '노동청에 진정을 넣었다. 몇 주 뒤 체불된 돈이 들어왔다. 사장님은 "너 같은 애는 처음 본다"며 그만 나오라고 했다.' };
}
