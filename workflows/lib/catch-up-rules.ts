/** The first weekday after `now`, at 09:00 local time. */
export function nextWeekdayAt9(now: Date): Date {
  const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 9);
  while (next.getDay() === 0 || next.getDay() === 6) next.setDate(next.getDate() + 1);
  return next;
}

/** The four choices of the question, in order. */
export function choiceLabels(looksDone: number, waiting: number, untilDay: string): string[] {
  return [
    `Settle the ${looksDone} look-done threads, snooze the rest to ${untilDay}`,
    `Settle the ${looksDone} look-done threads only`,
    `Snooze all ${looksDone + waiting} threads to ${untilDay}`,
    "Do nothing",
  ];
}

/** The thread ids to settle and to snooze for the choice at `choiceIndex` of `choiceLabels`. */
export function pick(
  choiceIndex: number,
  looksDoneIds: string[],
  waitingIds: string[],
): { settle: string[]; snooze: string[] } {
  switch (choiceIndex) {
    case 0:
      return { settle: looksDoneIds, snooze: waitingIds };
    case 1:
      return { settle: looksDoneIds, snooze: [] };
    case 2:
      return { settle: [], snooze: [...looksDoneIds, ...waitingIds] };
    default:
      return { settle: [], snooze: [] };
  }
}
