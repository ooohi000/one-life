import Phaser from 'phaser';
import { useEffect, useRef } from 'react';
import { ZOOM } from './art';
import { StoreScene, storeLayout } from './StoreScene';
import { StreetScene, streetLayout } from './StreetScene';

/** 장면 하나를 띄우는 캔버스. 장면이 바뀌면 게임을 새로 만든다 (상태는 엔진·세션에 있으니 잃을 게 없다) */
export function PhaserView({ scene }: { scene: 'street' | 'store' }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const size = scene === 'street' ? streetLayout().view : storeLayout();
    const game = new Phaser.Game({
      type: Phaser.AUTO,
      parent: ref.current!,
      width: size.w * ZOOM,
      height: size.h * ZOOM,
      pixelArt: true,
      backgroundColor: '#1b1b1b',
      scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
      scene: [scene === 'street' ? StreetScene : StoreScene],
      banner: false,
    });
    return () => game.destroy(true);
  }, [scene]);
  return <div className="phaser" ref={ref} />;
}
