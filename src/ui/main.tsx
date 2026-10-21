import 'pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css';
import './styles.css';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { PhaserView } from './game/PhaserView';

/** ?view=sprite-test — 캐릭터 해상도·합성 비교 화면 (게임 흐름과 별개) */
const view = new URLSearchParams(location.search).get('view');

// 버튼을 마우스로 눌러도 포커스가 남지 않게 (스페이스·엔터가 게임 조작으로만 쓰이도록)
document.addEventListener('mousedown', (e) => {
  if ((e.target as HTMLElement).closest('button')) e.preventDefault();
});

// 글꼴을 먼저 받아 둔다 (Phaser 글자가 기본 글꼴로 찍히지 않게)
Promise.all([document.fonts.load('600 12px "Pretendard Variable"'), document.fonts.load('400 12px "Pretendard Variable"')])
  .catch(() => undefined)
  .finally(() => createRoot(document.getElementById('root')!).render(
    view === 'sprite-test' ? (
      <div className="game"><div className="stage"><PhaserView scene="sprite-test" /></div></div>
    ) : (
      <App />
    ),
  ));

// 개발 중 콘솔에서 상태를 들여다보기 위해
if (import.meta.env.DEV) {
  void import('./session').then(({ session }) => Object.assign(window, { session }));
}
