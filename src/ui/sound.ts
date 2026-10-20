/** 소리 (파일 없이 WebAudio로) — 바코드 "삑", 돈통 "철컥", 문 "딩동" */
let ctx: AudioContext | null = null;
function ac(): AudioContext | null {
  try {
    ctx ??= new AudioContext();
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

function tone(freq: number, ms: number, type: OscillatorType = 'square', vol = 0.05, at = 0) {
  const a = ac();
  if (!a) return;
  const o = a.createOscillator();
  const g = a.createGain();
  o.type = type;
  o.frequency.value = freq;
  g.gain.value = vol;
  o.connect(g).connect(a.destination);
  const t = a.currentTime + at / 1000;
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + ms / 1000);
  o.start(t);
  o.stop(t + ms / 1000 + 0.02);
}

export const sfx = {
  beep: () => tone(1880, 90),
  coin: () => (tone(1320, 60, 'triangle', 0.06), tone(1760, 80, 'triangle', 0.05, 50)),
  drawer: () => tone(180, 120, 'sawtooth', 0.04),
  good: () => (tone(880, 80, 'triangle', 0.05), tone(1320, 120, 'triangle', 0.05, 80)),
  bad: () => tone(160, 220, 'square', 0.05),
  tick: () => tone(600, 30, 'square', 0.02),
  bell: () => (tone(1046, 160, 'sine', 0.05), tone(784, 260, 'sine', 0.05, 150)),
};
