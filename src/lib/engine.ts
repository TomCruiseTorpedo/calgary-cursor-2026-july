/** ShiftFloat decision engine — rent runway + safe-to-draw. Pure, readable, no dashboard. */

export type Weekday =
  | 'mon'
  | 'tue'
  | 'wed'
  | 'thu'
  | 'fri'
  | 'sat'
  | 'sun'

export const WEEKDAYS: { id: Weekday; label: string; short: string }[] = [
  { id: 'mon', label: 'Monday', short: 'Mon' },
  { id: 'tue', label: 'Tuesday', short: 'Tue' },
  { id: 'wed', label: 'Wednesday', short: 'Wed' },
  { id: 'thu', label: 'Thursday', short: 'Thu' },
  { id: 'fri', label: 'Friday', short: 'Fri' },
  { id: 'sat', label: 'Saturday', short: 'Sat' },
  { id: 'sun', label: 'Sunday', short: 'Sun' },
]

export type ShiftDay = {
  hours: number
  /** Tips expected to clear this week (cash + card). */
  tips: number
}

export type Bill = {
  id: string
  name: string
  amount: number
  /** Days until due from "today" in the demo week. */
  dueInDays: number
}

export type EwaDefaults = {
  /** Fraction of net earned accessible (ZayZoon-style ~50%). */
  maxFraction: number
  /** Daily access cap in dollars. */
  dailyCap: number
  /** Flat fee for instant bank transfer. */
  bankFee: number
  /** Gift-card path fee (often $0). */
  giftCardFee: number
  /** Soft bonus framing for gift cards (demo placeholder). */
  giftCardBonusPct: number
}

export const DEFAULT_EWA: EwaDefaults = {
  maxFraction: 0.5,
  dailyCap: 200,
  bankFee: 5,
  giftCardFee: 0,
  giftCardBonusPct: 0.1,
}

export type DecisionKind = 'wait' | 'cautious_draw' | 'gift_card'

export type Decision = {
  kind: DecisionKind
  title: string
  summary: string
  speakText: string
  recommendedDraw: number
  payoutPath: 'none' | 'bank' | 'gift_card'
  fee: number
  netAfterFee: number
  remainingAfterDraw: number
  runwayCoversMustPays: boolean
  gapToMustPays: number
  earnedThisWeek: number
  earnedIfSkip: number
  skipDayEarnings: number
  mustPays: number
  ewaAvailable: number
  safeToSpendTonight: number
}

export type Inputs = {
  hourlyRate: number
  shifts: Record<Weekday, ShiftDay>
  skipDay: Weekday | null
  bills: Bill[]
  /** Days until payday (end of demo week). */
  daysUntilPayday: number
  ewa: EwaDefaults
  /** Already drawn this pay period (mock). */
  alreadyDrawn: number
}

export function dayEarnings(rate: number, day: ShiftDay): number {
  return Math.max(0, day.hours) * Math.max(0, rate) + Math.max(0, day.tips)
}

export function weekEarnings(
  rate: number,
  shifts: Record<Weekday, ShiftDay>,
  skipDay: Weekday | null,
): { total: number; ifSkip: number; skipAmount: number } {
  let total = 0
  let skipAmount = 0
  for (const d of WEEKDAYS) {
    const earn = dayEarnings(rate, shifts[d.id])
    total += earn
    if (skipDay === d.id) skipAmount = earn
  }
  return { total, ifSkip: total - skipAmount, skipAmount }
}

export function mustPaysBeforePayday(
  bills: Bill[],
  daysUntilPayday: number,
): { total: number; items: Bill[] } {
  const items = bills.filter(
    (b) => b.amount > 0 && b.dueInDays <= daysUntilPayday,
  )
  return {
    total: items.reduce((s, b) => s + b.amount, 0),
    items,
  }
}

export function ewaAvailable(
  earnedToDate: number,
  alreadyDrawn: number,
  ewa: EwaDefaults,
): number {
  const byFraction = earnedToDate * ewa.maxFraction - alreadyDrawn
  return Math.max(0, Math.min(ewa.dailyCap, byFraction))
}

/**
 * Core decision: rent runway under a skip-day, then safe-to-draw path.
 * Grounded only in the numbers the worker entered — no hallucinated income.
 */
export function decide(inputs: Inputs): Decision {
  const { total, ifSkip, skipAmount } = weekEarnings(
    inputs.hourlyRate,
    inputs.shifts,
    inputs.skipDay,
  )
  const runwayBase = inputs.skipDay ? ifSkip : total
  const { total: mustPays } = mustPaysBeforePayday(
    inputs.bills,
    inputs.daysUntilPayday,
  )
  const gap = Math.max(0, mustPays - runwayBase)
  const covers = runwayBase + 0.009 >= mustPays

  // Treat "earned to date" for EWA as ~60% of planned week (mid-week demo seed).
  const earnedToDate = runwayBase * 0.6
  const available = ewaAvailable(earnedToDate, inputs.alreadyDrawn, inputs.ewa)
  const bufferTarget = Math.max(25, mustPays * 0.05)
  const afterMust = runwayBase - mustPays
  const safeTonight = Math.max(0, afterMust - bufferTarget)

  let kind: DecisionKind
  let recommendedDraw = 0
  let payoutPath: Decision['payoutPath'] = 'none'
  let fee = 0

  if (covers && safeTonight >= 25) {
    kind = 'wait'
    recommendedDraw = 0
  } else if (!covers && available >= 20) {
    // Need cash before payday — prefer gift card when fee would hurt the gap.
    const need = Math.min(available, Math.ceil(gap + bufferTarget))
    if (inputs.ewa.bankFee >= 4 && need <= 80) {
      kind = 'gift_card'
      recommendedDraw = need
      payoutPath = 'gift_card'
      fee = inputs.ewa.giftCardFee
    } else {
      kind = 'cautious_draw'
      recommendedDraw = need
      payoutPath = 'bank'
      fee = inputs.ewa.bankFee
    }
  } else if (covers && safeTonight < 25 && available >= 20) {
    // Tight but covering — small cautious draw or wait.
    kind = 'wait'
    recommendedDraw = 0
  } else {
    kind = 'wait'
    recommendedDraw = 0
  }

  // If skip breaks runway and draw still can't close gap → wait + escalate message.
  const netAfterFee = Math.max(0, recommendedDraw - fee)
  const remainingAfterDraw = runwayBase + netAfterFee - mustPays

  const skipLabel = inputs.skipDay
    ? WEEKDAYS.find((d) => d.id === inputs.skipDay)?.label ?? 'that day'
    : null

  let title: string
  let summary: string
  let speakText: string

  if (inputs.skipDay && !covers) {
    title = `Skipping ${skipLabel} breaks the runway`
    summary = `Without ${skipLabel}'s $${skipAmount.toFixed(0)}, you have $${ifSkip.toFixed(0)} against $${mustPays.toFixed(0)} in must-pays before payday — short $${gap.toFixed(0)}.`
    if (kind === 'cautious_draw' || kind === 'gift_card') {
      summary += ` A $${recommendedDraw.toFixed(0)} ${payoutPath === 'gift_card' ? 'gift-card' : 'bank'} draw (fee $${fee}) gets you closer — still plan the rest.`
      speakText = `If you skip ${skipLabel}, you fall short of rent and transit by about ${gap.toFixed(0)} dollars. I recommend a cautious ${recommendedDraw.toFixed(0)} dollar ${payoutPath === 'gift_card' ? 'gift card' : 'bank'} draw. Fee ${fee} dollars. Keep working the other shifts.`
    } else {
      summary += ` Earned-wage access available tonight: $${available.toFixed(0)} — not enough alone. Work ${skipLabel} or move a bill if you can.`
      speakText = `If you skip ${skipLabel}, you cannot cover must-pays before payday. You are short about ${gap.toFixed(0)} dollars. Available earned wage access is only ${available.toFixed(0)} dollars. Best move: work ${skipLabel} or move a bill.`
    }
  } else if (inputs.skipDay && covers) {
    title = `You can skip ${skipLabel}`
    summary = `Even without $${skipAmount.toFixed(0)} from ${skipLabel}, $${ifSkip.toFixed(0)} still covers $${mustPays.toFixed(0)} in must-pays. Safe float tonight ≈ $${safeTonight.toFixed(0)}.`
    speakText = `Yes — you can skip ${skipLabel} and still cover rent and transit. Safe to spend tonight is about ${safeTonight.toFixed(0)} dollars. Wait on earned wage access unless something unexpected hits.`
    kind = 'wait'
    recommendedDraw = 0
    payoutPath = 'none'
    fee = 0
  } else if (kind === 'gift_card') {
    title = 'Gift-card path beats the bank fee'
    summary = `Must-pays $${mustPays.toFixed(0)} vs earned $${runwayBase.toFixed(0)}. Draw $${recommendedDraw.toFixed(0)} via gift card (fee $${fee}${inputs.ewa.giftCardBonusPct > 0 ? `, ~${Math.round(inputs.ewa.giftCardBonusPct * 100)}% bonus placeholder` : ''}) instead of paying $${inputs.ewa.bankFee} to the bank.`
    speakText = `You are short before payday. Take about ${recommendedDraw.toFixed(0)} dollars on the gift card path to avoid the ${inputs.ewa.bankFee} dollar bank fee. Then stop drawing.`
  } else if (kind === 'cautious_draw') {
    title = 'Cautious draw — then stop'
    summary = `Must-pays $${mustPays.toFixed(0)} vs earned $${runwayBase.toFixed(0)}. Draw up to $${recommendedDraw.toFixed(0)} (fee $${fee}); leaves ~$${remainingAfterDraw.toFixed(0)} cushion after must-pays.`
    speakText = `Cautious draw of ${recommendedDraw.toFixed(0)} dollars to your bank. Fee ${fee} dollars. That covers the gap — do not draw again this period if you can help it.`
  } else {
    title = 'Wait — float holds'
    summary = `Earned $${runwayBase.toFixed(0)} covers $${mustPays.toFixed(0)} must-pays. Safe tonight ≈ $${safeTonight.toFixed(0)}. EWA available $${available.toFixed(0)} if something breaks.`
    speakText = `Your float holds. You can cover must-pays before payday. Safe to spend tonight about ${safeTonight.toFixed(0)} dollars. Wait on earned wage access.`
  }

  return {
    kind,
    title,
    summary,
    speakText,
    recommendedDraw: payoutPath === 'none' ? 0 : recommendedDraw,
    payoutPath,
    fee: payoutPath === 'none' ? 0 : fee,
    netAfterFee: payoutPath === 'none' ? 0 : netAfterFee,
    remainingAfterDraw,
    runwayCoversMustPays: covers,
    gapToMustPays: gap,
    earnedThisWeek: total,
    earnedIfSkip: ifSkip,
    skipDayEarnings: skipAmount,
    mustPays,
    ewaAvailable: available,
    safeToSpendTonight: safeTonight,
  }
}

export function emptyShifts(): Record<Weekday, ShiftDay> {
  return {
    mon: { hours: 0, tips: 0 },
    tue: { hours: 0, tips: 0 },
    wed: { hours: 0, tips: 0 },
    thu: { hours: 0, tips: 0 },
    fri: { hours: 0, tips: 0 },
    sat: { hours: 0, tips: 0 },
    sun: { hours: 0, tips: 0 },
  }
}

/** Seeded demo: QSR / retail week, rent + transit due before Friday payday. */
export function demoSeed(): Inputs {
  const shifts = emptyShifts()
  shifts.mon = { hours: 8, tips: 42 }
  shifts.tue = { hours: 8, tips: 38 }
  shifts.wed = { hours: 6, tips: 25 }
  shifts.thu = { hours: 8, tips: 45 }
  shifts.fri = { hours: 8, tips: 60 }
  shifts.sat = { hours: 0, tips: 0 }
  shifts.sun = { hours: 0, tips: 0 }

  return {
    hourlyRate: 18,
    shifts,
    skipDay: 'thu',
    bills: [
      { id: 'rent', name: 'Rent (portion due)', amount: 650, dueInDays: 3 },
      { id: 'transit', name: 'Transit / gas', amount: 85, dueInDays: 1 },
      { id: 'phone', name: 'Phone', amount: 40, dueInDays: 2 },
      { id: 'groceries', name: 'Groceries (must)', amount: 50, dueInDays: 2 },
    ],
    daysUntilPayday: 4,
    ewa: { ...DEFAULT_EWA },
    alreadyDrawn: 0,
  }
}
