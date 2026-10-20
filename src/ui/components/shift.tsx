/**
 * 근무 중 손이 하는 일 (React): 계산대(바코드·거스름돈), 진열·폐기·청소(타이밍), 양심 선택, 상단·하단 정보.
 */
import { useEffect, useRef, useState } from 'react';
import type { Task } from '../../engine/work';
import { hhmm, session, useSession } from '../session';
import { sfx } from '../sound';
import { ProductIcon, won } from './common';

// ───────── 상단·하단 ─────────

const bossMood = (st: number) => (st >= 30 ? '사장님이 요즘 너를 믿는 눈치다' : st >= 5 ? '사장님 기분 괜찮음' : st > -20 ? '사장님 표정이 애매하다' : '사장님이 못마땅해한다');

export function ShiftTop() {
  const s = useSession();
  const sh = s.shift;
  if (!sh) return null;
  const left = sh.end - sh.minute;
  const earned = Math.round((sh.job.hourly * sh.report.minutes) / 60);
  return (
    <div className="bar top">
      <span className="clock">{hhmm(sh.minute)}</span>
      <span className="muted">퇴근까지 {Math.floor(left / 60)}시간 {left % 60}분</span>
      <span>줄 <b className={sh.queue.length >= 3 ? 'warn' : ''}>{sh.queue.length}</b>명</span>
      <span>오늘 번 돈 {won(earned)}</span>
      <span className="muted">{bossMood(sh.job.standing)}</span>
      <button className={`btn small${s.fast ? ' on' : ''}`} onClick={() => s.setFast(!s.fast)} title="손이 알아서 한다. 양심 문제는 여전히 네가 고른다">
        {s.fast ? '▶ 직접 하기' : '▶▶ 손에 맡기기'}
      </button>
    </div>
  );
}

const KIND_COLOR: Record<string, string> = { customer: '#cfe3ff', task: '#ffe08a', dilemma: '#ffb3b3', boss: '#b3ffcc', people: '#ffd1f0', trouble: '#ff8a8a' };

export function ShiftBottom() {
  const s = useSession();
  const sh = s.shift;
  if (!sh) return null;
  const todo = sh.tasks.filter((t) => t.kind !== 'checkout');
  const ev = sh.report.events.slice(-5);
  return (
    <div className="bar bottom">
      <div className="todo">
        <div className="label">할 일</div>
        {sh.queue.length > 0 && <div>• 계산 대기 {sh.queue.length}명</div>}
        {todo.map((t) => <div key={t.id}>• {t.label}</div>)}
        {!sh.queue.length && !todo.length && <div className="muted">한가하다. 폰 보면 사장님이 CCTV로 본다.</div>}
      </div>
      <div className="feed">
        {ev.map((e, i) => (
          <div key={sh.report.events.length - 5 + i} style={{ color: KIND_COLOR[e.kind] }}>
            <span className="muted">{hhmm(e.minute)}</span> {e.text}
          </div>
        ))}
      </div>
      <div className="keys muted">이동 ←↑↓→/WASD · 일하기 E/Space</div>
    </div>
  );
}

// ───────── 계산대 ─────────

const BILLS = [50000, 10000, 5000, 1000, 500, 100];

export function Checkout({ task }: { task: Task }) {
  const s = useSession();
  const c = task.customer!;
  // 미성년자가 든 담배·술은 계산대에서 따로 말한다 (신분증 문제는 계산 뒤에 묻는다)
  const [list] = useState(() => c.items.filter((p) => !(p.adult && c.minor)));
  const total = list.reduce((a, p) => a + p.price, 0);
  const fullTotal = c.items.reduce((a, p) => a + p.price, 0);
  const card = c.pays === fullTotal;
  const [scanned, setScanned] = useState(0);
  const [given, setGiven] = useState<number[]>([]);
  const [gone, setGone] = useState(false);
  const started = useRef(performance.now());
  const phase = scanned < list.length ? 'scan' : 'pay';
  const givenSum = given.reduce((a, b) => a + b, 0);

  const alive = !!s.shift?.tasks.some((t) => t.id === task.id);
  useEffect(() => {
    if (!alive && !gone) {
      setGone(true);
      sfx.bad();
      const id = setTimeout(() => s.cancelActivity(), 1300);
      return () => clearTimeout(id);
    }
  }, [alive, gone, s]);

  const finish = () => {
    const sec = (performance.now() - started.current) / 1000;
    const expected = 1.6 + list.length * 0.7 + (card ? 0.8 : 3.5);
    const quality = Math.max(0, Math.min(1, 1.2 - 0.5 * (sec / expected)));
    const changeError = card ? 0 : givenSum - (c.pays - total);
    if (changeError === 0) sfx.good();
    else sfx.bad();
    s.complete({ quality, changeError });
  };

  const scan = () => {
    if (phase !== 'scan') return;
    sfx.beep();
    setScanned((n) => n + 1);
  };
  const give = (v: number) => {
    sfx.coin();
    setGiven((g) => [...g, v]);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (gone) return;
      if (e.code === 'Space' || e.code === 'KeyE') {
        e.preventDefault();
        if (phase === 'scan') scan();
      } else if (e.code === 'Enter' && phase === 'pay') finish();
      else if (e.code === 'Backspace') setGiven((g) => g.slice(0, -1));
      else if (phase === 'pay' && !card && /^Digit[1-6]$/.test(e.code)) give(BILLS[Number(e.code.slice(5)) - 1]!);
      else if (e.code === 'Escape') s.cancelActivity();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  return (
    <div className="panel checkout">
      <div className="who">{c.label}</div>
      {gone ? (
        <div className="big warn">손님이 기다리다 지쳐서 나갔다…</div>
      ) : (
        <>
          <div className="items">
            {list.map((p, i) => (
              <button key={i} className={`item${i < scanned ? ' done' : ''}`} onClick={() => i === scanned && scan()}>
                <ProductIcon id={p.id} dim={i >= scanned} />
                <span>{p.name}</span>
                {i < scanned && <span className="price">{won(p.price)}</span>}
              </button>
            ))}
          </div>
          <div className="pos">
            <span>합계</span>
            <b>{phase === 'pay' ? won(total) : '—'}</b>
          </div>
          {phase === 'scan' ? (
            <div className="hint">[Space] 바코드 찍기 ({scanned}/{list.length})</div>
          ) : card ? (
            <>
              <div className="hint">손님이 카드를 내민다.</div>
              <button className="btn" onClick={finish}>[Enter] 카드 결제</button>
            </>
          ) : (
            <>
              <div className="hint">손님이 <b>{won(c.pays)}</b>을 냈다. 거스름돈을 내준다.</div>
              <div className="cash">
                {BILLS.map((b, i) => (
                  <button key={b} className={`bill ${b >= 1000 ? 'paper' : 'coin'}`} onClick={() => give(b)}>
                    <small>{i + 1}</small> {b >= 10000 ? `${b / 10000}만` : b.toLocaleString()}
                  </button>
                ))}
              </div>
              <div className="given">
                내줄 돈: <b>{won(givenSum)}</b>
                <button className="btn small" onClick={() => setGiven((g) => g.slice(0, -1))}>⌫ 하나 빼기</button>
              </div>
              <button className="btn" onClick={finish}>[Enter] 건네기</button>
            </>
          )}
        </>
      )}
    </div>
  );
}

// ───────── 진열·폐기·청소 ─────────

const TIMING = {
  restock: { title: '진열하기', how: '초록 칸에 맞춰 [Space] — 줄을 맞춰 앞으로 당겨 놓는다', hits: 3, speed: 1.25, zone: 0.22 },
  discard: { title: '폐기하기', how: '초록 칸에 맞춰 [Space] — 유통기한 확인하고 빼낸다', hits: 2, speed: 1.0, zone: 0.26 },
  clean: { title: '닦기', how: '[Space] 연타! 끈적한 국물을 박박 닦는다', hits: 0, speed: 0, zone: 0 },
} as const;

export function Timing({ taskId, kind }: { taskId: string; kind: keyof typeof TIMING }) {
  const s = useSession();
  const cfg = TIMING[kind];
  const [pos, setPos] = useState(0);
  const [scores, setScores] = useState<number[]>([]);
  const [scrub, setScrub] = useState(0);
  const t0 = useRef(performance.now());
  const done = useRef(false);
  const task = s.shift?.tasks.find((t) => t.id === taskId);

  useEffect(() => {
    if (kind === 'clean') return;
    let raf = 0;
    const loop = (now: number) => {
      const t = ((now - t0.current) / 1000) * cfg.speed;
      setPos(1 - Math.abs(((t % 2) + 2) % 2 - 1)); // 0→1→0 왕복
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [kind, cfg.speed]);

  // 닦기는 가만히 있으면 다시 끈적해진다
  useEffect(() => {
    if (kind !== 'clean') return;
    const id = setInterval(() => setScrub((v) => Math.max(0, v - 0.02)), 100);
    return () => clearInterval(id);
  }, [kind]);

  const finish = (q: number) => {
    if (done.current) return;
    done.current = true;
    if (q >= 0.5) sfx.good();
    else sfx.bad();
    setTimeout(() => s.complete({ quality: q }), 250);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Escape') return s.cancelActivity();
      if (e.code !== 'Space' && e.code !== 'KeyE') return;
      e.preventDefault();
      if (e.repeat || done.current) return;
      if (kind === 'clean') {
        sfx.tick();
        const v = scrub + 0.09;
        setScrub(v);
        if (v >= 1) {
          const sec = (performance.now() - t0.current) / 1000;
          finish(Math.max(0, Math.min(1, 1.3 - sec / 6)));
        }
        return;
      }
      const off = Math.abs(pos - 0.5);
      const sc = off <= cfg.zone / 2 ? 1 - off / (cfg.zone / 2) * 0.3 : Math.max(0, 0.5 - (off - cfg.zone / 2) * 2);
      sc >= 0.7 ? sfx.beep() : sfx.drawer();
      const next = [...scores, sc];
      setScores(next);
      if (next.length >= cfg.hits) finish(next.reduce((a, b) => a + b, 0) / next.length);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  return (
    <div className="panel timing">
      <div className="who">{cfg.title} — {task?.label ?? ''}</div>
      <div className="hint">{cfg.how}</div>
      {kind === 'clean' ? (
        <div className="meter"><div className="fill" style={{ width: `${Math.min(1, scrub) * 100}%` }} /></div>
      ) : (
        <>
          <div className="meter">
            <div className="zone" style={{ left: `${(0.5 - cfg.zone / 2) * 100}%`, width: `${cfg.zone * 100}%` }} />
            <div className="cursor" style={{ left: `${pos * 100}%` }} />
          </div>
          <div className="dots">
            {Array.from({ length: cfg.hits }, (_, i) => (
              <span key={i} className={i < scores.length ? (scores[i]! >= 0.7 ? 'ok' : 'meh') : ''}>■</span>
            ))}
          </div>
        </>
      )}
      <div className="muted small">[Esc] 그만두기</div>
    </div>
  );
}

// ───────── 양심 선택 ─────────

export function DilemmaBox() {
  const s = useSession();
  const d = s.shift?.dilemma;
  useEffect(() => {
    if (d) sfx.bell();
  }, [d?.id]);
  useEffect(() => {
    if (!d) return;
    const onKey = (e: KeyboardEvent) => {
      const n = Number(e.key);
      if (n >= 1 && n <= d.options.length) s.decide(d.options[n - 1]!.id);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });
  if (!d) return null;
  return (
    <div className="panel dialog">
      <div className="text">{d.text}</div>
      <div className="options">
        {d.options.map((o, i) => (
          <button key={o.id} className="btn opt" onClick={() => s.decide(o.id)}>
            <small>{i + 1}</small> {o.label}
          </button>
        ))}
      </div>
      <div className="muted small">시계가 멈춰 있다. 천천히 골라도 된다.</div>
    </div>
  );
}

export function Hands() {
  const s = useSession();
  const a = s.activity;
  if (!a || !s.shift) return null;
  const t = s.shift.tasks.find((x) => x.id === a.taskId);
  if (a.kind === 'checkout') return t ? <Checkout key={a.taskId} task={t} /> : <GoneNote />;
  return <Timing key={a.taskId} taskId={a.taskId} kind={a.taskKind} />;
}

function GoneNote() {
  const s = useSession();
  useEffect(() => {
    const id = setTimeout(() => s.cancelActivity(), 1200);
    return () => clearTimeout(id);
  }, [s]);
  return <div className="panel checkout"><div className="big warn">손님이 나가 버렸다…</div></div>;
}
