/**
 * 근무 밖의 화면들: 처음, 세계 만드는 중, 알바 날 오후(오늘 소식·우산), 정산, 끝.
 */
import { useState } from 'react';
import { describeCarry } from '../../engine/carry';
import { describeWeather, OUTFIT_KO } from '../../engine/env';
import { trait } from '../../engine/traits';
import { isSchoolDay } from '../../engine/time/school';
import { isWet, session, useSession } from '../session';
import { won } from './common';

export function Title() {
  return (
    <div className="screen center">
      <div className="logo">한 번뿐인 인생</div>
      <div className="muted">서울, 고등학교 1학년 봄. 인생은 한 번뿐이고, 정답은 없다.</div>
      <button className="btn big" onClick={() => session.newLife()}>새 인생 시작</button>
      <div className="muted small">지금 할 수 있는 것: 알바 가는 길 · 편의점 근무 (첫 화면 시험판)</div>
    </div>
  );
}

export function Loading() {
  return (
    <div className="screen center">
      <div className="big">동네를 만드는 중…</div>
      <div className="muted">같은 반 120명, 그 부모들, 동네 가게와 공사장, 오늘의 날씨</div>
    </div>
  );
}

const BOSS_HINT = { kind: '사장님은 웃으면서 인사하는 사람이다', strict: '사장님은 시재 100원도 따지는 사람이다', stingy: '사장님은 "요즘 장사 안 돼"가 입버릇이다' } as const;

export function Morning() {
  const s = useSession();
  const w = s.w!;
  const me = w.player!;
  const today = w.today;
  const job = w.playerJob!;
  const wetish = isWet(today) || today.sky === 'cloudy';
  const [umbrella, setUmbrella] = useState<boolean | null>(wetish ? null : false);
  const news = w.city.log.filter((e) => e.area === me.area && e.day >= w.day - 6).slice(-3);

  return (
    <div className="screen page">
      <div className="head">
        <div className="date">{s.dateLabel()}</div>
        <div className="muted">알바 {s.workday}번째 날 · {job.store}</div>
      </div>
      <div className="cols">
        <div className="card">
          <div className="label">오늘</div>
          <div>{describeWeather(today)} · {OUTFIT_KO[today.outfit]}</div>
          {today.notes.map((n) => <div key={n} className="note">{n}</div>)}
          {news.length > 0 && <div className="label">동네</div>}
          {news.map((e, i) => <div key={i} className="note">{e.text}</div>)}
          {s.since.length > 0 && <div className="label">그동안</div>}
          {s.since.map((t, i) => <div key={i}>• {t}</div>)}
        </div>
        <div className="card">
          <div className="label">나</div>
          <div><b>{me.name}</b> · {me.cls + 1}반</div>
          <div className="muted">{me.prof.traits.map((t) => trait(t).label).join(' · ')}</div>
          <div>지갑 {won(Math.round(me.life.money))}</div>
          <div className="muted small">{w.playerCarry ? describeCarry(w.playerCarry) : ''}</div>
          <div className="label">알바</div>
          <div>시급 {won(job.hourly)}{job.contract ? '' : ' · 근로계약서 안 썼다'}</div>
          <div className="muted">{BOSS_HINT[job.boss]}</div>
          {job.warnings > 0 && <div className="warn">경고 {job.warnings}번</div>}
        </div>
      </div>
      {w.prompts.map((p) => (
        <div key={p.id} className="card prompt">
          <div>{p.text}</div>
          <div className="options">
            {p.options.map((o) => <button key={o.id} className="btn opt" onClick={() => s.answerPrompt(p, o.id)}>{o.label}</button>)}
          </div>
        </div>
      ))}
      {wetish && umbrella === null && (
        <div className="card prompt">
          <div>{isWet(today) ? '비가 온다.' : '하늘이 꾸물꾸물하다.'} 아침에 우산 챙겼나?</div>
          <div className="options">
            <button className="btn opt" onClick={() => (s.packUmbrella(true), setUmbrella(true))}>접이식 우산 챙겼다 (가방에)</button>
            <button className="btn opt" onClick={() => (s.packUmbrella(false), setUmbrella(false))}>귀찮아서 그냥 나왔다</button>
          </div>
        </div>
      )}
      <button className="btn big" disabled={umbrella === null} onClick={() => s.go('street')}>
        {isSchoolDay(today.date) ? '학교 끝. 알바 가는 길 →' : '알바 가는 길 →'}
      </button>
    </div>
  );
}

const sat = (v: number) => (v >= 85 ? '손님들이 만족했다' : v >= 70 ? '무난했다' : v >= 50 ? '손님들 표정이 별로였다' : '불만이 많았다');

export function Report() {
  const s = useSession();
  const r = s.report!;
  const w = s.w!;
  return (
    <div className="screen page">
      <div className="head">
        <div className="date">근무 끝 — {s.dateLabel()}</div>
        <div className="muted">{(r.minutes / 60).toFixed(1)}시간 일했다</div>
      </div>
      <div className="cols">
        <div className="card">
          <div className="label">오늘 근무</div>
          <div>번 돈 <b>{won(r.wage)}</b></div>
          <div>손님 {r.customers}명 · 바로 계산 {r.servedFast}명 · 지쳐서 나감 {r.leftAngry}명</div>
          <div>거스름돈 실수 {r.changeErrors}번</div>
          <div>{sat(r.satisfaction)}</div>
          <div className="muted">{r.standingDelta >= 3 ? '사장님이 "수고했어" 하고 어깨를 두드렸다' : r.standingDelta <= -3 ? '사장님이 마감 시재를 오래 셌다' : '사장님은 별말 없었다'}</div>
          {r.ateExpired && <div>폐기 삼각김밥으로 저녁을 때웠다.</div>}
          {r.violations.length > 0 && <div className="warn">찜찜한 것: {r.violations.join(', ')}</div>}
          {r.fired && <div className="warn big">잘렸다.</div>}
        </div>
        <div className="card">
          <div className="label">마주친 사람</div>
          {r.met.length === 0 && <div className="muted">아는 사람은 안 왔다.</div>}
          {r.met.map((m, i) => (
            <div key={i}>• {m.visitor.name} — {m.note}{m.rumor ? <span className="muted"> (소문이 날 것 같다)</span> : null}</div>
          ))}
          <div className="label">기억에 남는 것</div>
          {r.events.filter((e) => e.kind !== 'task').slice(-6).map((e, i) => <div key={i} className="small">• {e.text}</div>)}
        </div>
      </div>
      {w.prompts.map((p) => (
        <div key={p.id} className="card prompt">
          <div>{p.text}</div>
          <div className="options">
            {p.options.map((o) => <button key={o.id} className="btn opt" onClick={() => s.answerPrompt(p, o.id)}>{o.label}</button>)}
          </div>
        </div>
      ))}
      <button className="btn big" onClick={() => s.afterReport()}>퇴근 → 다음 알바 날까지</button>
      <div className="muted small center-text">그 사이 며칠은 평소의 너처럼 흘러간다 (학교, 친구, 집).</div>
    </div>
  );
}

export function End() {
  const s = useSession();
  return (
    <div className="screen center">
      <div className="big">{s.endReason}</div>
      {s.since.map((t, i) => <div key={i} className="muted">• {t}</div>)}
      <div className="muted">인생은 계속되지만, 이 시험판은 여기까지.</div>
      <button className="btn big" onClick={() => s.newLife()}>새 인생</button>
    </div>
  );
}

export function Confirm() {
  const s = useSession();
  if (!s.confirm) return null;
  return (
    <div className="panel dialog">
      <div className="text">{s.confirm.text}</div>
      <div className="options">
        <button className="btn opt" onClick={() => s.answerConfirm(true)}>그래, 오늘은 안 간다</button>
        <button className="btn opt" onClick={() => s.answerConfirm(false)}>아니다, 가야지</button>
      </div>
    </div>
  );
}
