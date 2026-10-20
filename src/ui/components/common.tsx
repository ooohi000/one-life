import { useMemo } from 'react';
import { ART } from '../game/art';
import { drawProduct, toDataUrl } from '../game/pixel';

const cache = new Map<string, string>();
export function ProductIcon({ id, size = 40, dim = false }: { id: string; size?: number; dim?: boolean }) {
  const src = useMemo(() => {
    let u = cache.get(id) ?? ART.get(`items/${id}`);
    if (!u) {
      u = toDataUrl(drawProduct(id), 4);
      cache.set(id, u);
    }
    return u;
  }, [id]);
  return <img className={`px${dim ? ' dim' : ''}`} src={src} width={size} height={size} alt={id} />;
}

export const won = (n: number) => `${n.toLocaleString()}원`;
