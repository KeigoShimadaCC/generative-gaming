export interface Clock {
  now(): number;
  advance(by?: number): void;
}

export function createClock(start = 0): Clock {
  let turn = start;

  return {
    now() {
      return turn;
    },
    advance(by = 1) {
      turn += by;
    },
  };
}
