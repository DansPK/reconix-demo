/* A box for one value that callbacks share without re-rendering (the reply being streamed, so
   Stop, New chat and opening another conversation can abort it). */
export interface Slot<T> {
  get: () => T | null;
  set: (value: T | null) => void;
}

export function createSlot<T>(): Slot<T> {
  let value: T | null = null;
  return {
    get: () => value,
    set: (next) => {
      value = next;
    },
  };
}
