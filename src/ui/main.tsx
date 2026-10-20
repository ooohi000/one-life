import 'galmuri/dist/galmuri.css';
import './styles.css';
import { createRoot } from 'react-dom/client';
import { App } from './App';

// 버튼을 마우스로 눌러도 포커스가 남지 않게 (스페이스·엔터가 게임 조작으로만 쓰이도록)
document.addEventListener('mousedown', (e) => {
  if ((e.target as HTMLElement).closest('button')) e.preventDefault();
});

// 도트 글꼴을 먼저 받아 둔다 (Phaser 글자가 기본 글꼴로 찍히지 않게)
Promise.all([document.fonts.load('8px Galmuri7'), document.fonts.load('12px Galmuri11')])
  .catch(() => undefined)
  .finally(() => createRoot(document.getElementById('root')!).render(<App />));

// 개발 중 콘솔에서 상태를 들여다보기 위해
if (import.meta.env.DEV) {
  void import('./session').then(({ session }) => Object.assign(window, { session }));
}
