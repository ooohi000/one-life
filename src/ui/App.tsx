import { DilemmaBox, Hands, ShiftBottom, ShiftTop } from './components/shift';
import { Confirm, End, Loading, Morning, Report, Title } from './components/screens';
import { PhaserView } from './game/PhaserView';
import { hhmm, useSession } from './session';
import { describeWeather } from '../engine/env';

export function App() {
  const s = useSession();
  switch (s.screen) {
    case 'title':
      return <Title />;
    case 'loading':
      return <Loading />;
    case 'morning':
      return <Morning />;
    case 'report':
      return <Report />;
    case 'end':
      return <End />;
    case 'street':
      return (
        <div className="game">
          <div className="bar top">
            <span className="clock">{hhmm(s.streetMinute)}</span>
            <span>{s.dateLabel()}</span>
            <span className="muted">{describeWeather(s.w!.today)}</span>
            <span className="muted">{s.hasUmbrella() ? '가방에 우산 있음' : '우산 없음'}</span>
          </div>
          <div className="stage">
            <PhaserView scene="street" />
            <Confirm />
          </div>
          <div className="bar bottom">
            <div className="muted">초록 간판 편의점 문 앞에서 E — 출근 17:30 · 집·PC방으로 새도 된다 · 이동 ←→↑↓/WASD</div>
          </div>
        </div>
      );
    case 'shift':
      return (
        <div className="game">
          <ShiftTop />
          <div className="stage">
            <PhaserView scene="store" />
            <Hands />
            <DilemmaBox />
          </div>
          <ShiftBottom />
        </div>
      );
  }
}
