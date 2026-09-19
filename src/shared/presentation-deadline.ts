type TimerHandle = ReturnType<typeof setTimeout>;

type PresentationDeadlineClock = {
  now: () => number;
  setTimer?: (callback: () => void, delayMs: number) => TimerHandle;
  clearTimer?: (timer: TimerHandle) => void;
};

/** A fractional delay or clock correction must not consume the boundary early. */
export const schedulePresentationDeadline = (
  deadline: number,
  onDeadline: () => void,
  { now, setTimer = setTimeout, clearTimer = clearTimeout }: PresentationDeadlineClock,
): (() => void) => {
  let settled = false;
  let timer: TimerHandle | null = null;
  const check = () => {
    if (settled) return;
    timer = null;
    const remaining = deadline - now();
    if (remaining > 0) {
      timer = setTimer(check, Math.max(1, Math.ceil(remaining)));
      return;
    }
    settled = true;
    onDeadline();
  };
  // Keep the first call asynchronous, including an already elapsed deadline.
  timer = setTimer(check, Math.max(1, Math.ceil(deadline - now())));
  return () => {
    if (settled) return;
    settled = true;
    if (timer !== null) clearTimer(timer);
    timer = null;
  };
};
