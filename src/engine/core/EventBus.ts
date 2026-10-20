/**
 * 엔진 전체에서 쓰는 타입 안전 이벤트 버스.
 * 엔진은 React/Phaser를 모르고, 화면 쪽은 이 버스를 구독해서 엔진 변화를 받는다.
 */
export type Handler<T> = (payload: T) => void;

export class EventBus<Events extends Record<string, unknown>> {
  private handlers = new Map<keyof Events, Set<Handler<never>>>();

  /** 구독. 반환된 함수를 호출하면 구독 해제. */
  on<K extends keyof Events>(type: K, handler: Handler<Events[K]>): () => void {
    let set = this.handlers.get(type);
    if (!set) {
      set = new Set();
      this.handlers.set(type, set);
    }
    set.add(handler as Handler<never>);
    return () => set!.delete(handler as Handler<never>);
  }

  emit<K extends keyof Events>(type: K, payload: Events[K]): void {
    const set = this.handlers.get(type);
    if (!set) return;
    for (const handler of [...set]) (handler as Handler<Events[K]>)(payload);
  }
}
