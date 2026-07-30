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
  /** Soft bonus framing for gift cards (demo). */
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

export type CoachPath = {
  id: 'wait' | 'bank' | 'gift_card'
  label: string
  draw: number
  fee: number
  net: number
  /** Runway + net draw − must-pays after this path. */
  cushion: number
  recommended: boolean
  why: string
}

export type RunwayLane = {
  label: string
  earned: number
  covers: boolean
  gap: number
  rentTransit: number
  otherMustPays: number
  mustPays: number
}

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
  rentTransit: number
  ewaAvailable: number
  safeToSpendTonight: number
  /** Always two lanes: work-all vs skip (active or preview day). */
  runway: { workAll: RunwayLane; ifSkip: RunwayLane; skipDay: Weekday }
  /** Always three paths scored; one marked recommended. */
  coachPaths: CoachPath[]
}

export type Inputs = {
  hourlyRate: number
  shifts: Record<Weekday, ShiftDay>
  skipDay: Weekday | null
  /** Day used for "what if I skip?" when skip toggle is off (default Thu). */
  previewSkipDay: Weekday
  bills: Bill[]
  daysUntilPayday: number
  ewa: EwaDefaults
  alreadyDrawn: number
  /** Mid-week fraction of planned runway treated as already earned for EWA. */
  earnedToDateFraction: number
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
): { total: number; items: Bill[]; rentTransit: number; other: number } {
  const items = bills.filter(
    (b) => b.amount > 0 && b.dueInDays <= daysUntilPayday,
  )
  let rentTransit = 0
  let other = 0
  for (const b of items) {
    const name = b.name.toLowerCase()
    if (
      name.includes('rent') ||
      name.includes('transit') ||
      name.includes('gas') ||
      name.includes('bus')
    ) {
      rentTransit += b.amount
    } else {
      other += b.amount
    }
  }
  return {
    total: items.reduce((s, b) => s + b.amount, 0),
    items,
    rentTransit,
    other,
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

function lane(
  label: string,
  earned: number,
  mustPays: number,
  rentTransit: number,
  other: number,
): RunwayLane {
  const gap = Math.max(0, mustPays - earned)
  return {
    label,
    earned,
    covers: earned + 0.009 >= mustPays,
    gap,
    rentTransit,
    otherMustPays: other,
    mustPays,
  }
}

function buildCoachPaths(
  runwayBase: number,
  mustPays: number,
  available: number,
  ewa: EwaDefaults,
  covers: boolean,
  gap: number,
  bufferTarget: number,
): { paths: CoachPath[]; kind: DecisionKind; draw: number; fee: number; path: Decision['payoutPath'] } {
  const need = !covers
    ? Math.min(available, Math.ceil(gap + bufferTarget))
    : 0

  const waitCushion = runwayBase - mustPays
  const bankDraw = need
  const bankFee = need > 0 ? ewa.bankFee : 0
  const bankNet = Math.max(0, bankDraw - bankFee)
  const giftDraw = need
  const giftFee = need > 0 ? ewa.giftCardFee : 0
  const giftNet = Math.max(0, giftDraw - giftFee)
  const giftBonus = giftDraw * ewa.giftCardBonusPct

  const wait: CoachPath = {
    id: 'wait',
    label: 'Wait',
    draw: 0,
    fee: 0,
    net: 0,
    cushion: waitCushion,
    recommended: false,
    why: covers
      ? 'Float covers must-pays — keep EWA dry.'
      : `Short $${gap.toFixed(0)} with no draw — only if you can move a bill or work the skip day.`,
  }

  const bank: CoachPath = {
    id: 'bank',
    label: 'Bank transfer',
    draw: bankDraw,
    fee: bankFee,
    net: bankNet,
    cushion: runwayBase + bankNet - mustPays,
    recommended: false,
    why:
      need > 0
        ? `Instant cash to bank; flat fee $${ewa.bankFee}. Cap $${ewa.dailyCap}/day · ${Math.round(ewa.maxFraction * 100)}% of earned.`
        : 'No draw needed.',
  }

  const gift: CoachPath = {
    id: 'gift_card',
    label: 'Gift-card path',
    draw: giftDraw,
    fee: giftFee,
    net: giftNet,
    cushion: runwayBase + giftNet - mustPays,
    recommended: false,
    why:
      need > 0
        ? `Avoid $${ewa.bankFee} bank fee${ewa.giftCardBonusPct > 0 ? ` · ~${Math.round(ewa.giftCardBonusPct * 100)}% bonus at retailers` : ''}. Best when the fee eats the draw.`
        : 'No draw needed.',
  }

  let kind: DecisionKind = 'wait'
  let draw = 0
  let fee = 0
  let path: Decision['payoutPath'] = 'none'

  if (covers && waitCushion >= bufferTarget) {
    wait.recommended = true
    kind = 'wait'
  } else if (!covers && available >= 20 && need > 0) {
    // Prefer gift card when bank fee is a meaningful bite of the need.
    const feeHurts = ewa.bankFee >= 3 && ewa.bankFee / need >= 0.03
    const smallNeed = need <= 100
    if (feeHurts || smallNeed) {
      gift.recommended = true
      kind = 'gift_card'
      draw = giftDraw
      fee = giftFee
      path = 'gift_card'
      gift.why += ` Recommended: save $${ewa.bankFee} vs bank${giftBonus > 0 ? ` (+~$${giftBonus.toFixed(0)} bonus)` : ''}.`
    } else {
      bank.recommended = true
      kind = 'cautious_draw'
      draw = bankDraw
      fee = bankFee
      path = 'bank'
      bank.why += ' Recommended: need is large enough that fee is small relative to cash.'
    }
  } else if (covers) {
    wait.recommended = true
    kind = 'wait'
  } else {
    wait.recommended = true
    kind = 'wait'
    wait.why = `EWA available only $${available.toFixed(0)} — not enough to close a $${gap.toFixed(0)} gap. Work the day or move a bill.`
  }

  return { paths: [wait, bank, gift], kind, draw, fee, path }
}

/**
 * Core decision: rent runway under a skip-day, then safe-to-draw path.
 * Grounded only in the numbers the worker entered — no hallucinated income.
 */
export function decide(inputs: Inputs): Decision {
  const skipForCompare = inputs.skipDay ?? inputs.previewSkipDay
  const skipLabel =
    WEEKDAYS.find((d) => d.id === skipForCompare)?.label ?? 'that day'

  const { total, ifSkip, skipAmount } = weekEarnings(
    inputs.hourlyRate,
    inputs.shifts,
    skipForCompare,
  )
  const { total: mustPays, rentTransit, other } = mustPaysBeforePayday(
    inputs.bills,
    inputs.daysUntilPayday,
  )

  const workAll = lane('Work every shift', total, mustPays, rentTransit, other)
  const ifSkipLane = lane(
    `If you skip ${skipLabel}`,
    ifSkip,
    mustPays,
    rentTransit,
    other,
  )

  // Active runway: skipped day counts only when toggle is on.
  const active = inputs.skipDay ? ifSkipLane : workAll
  const runwayBase = active.earned
  const gap = active.gap
  const covers = active.covers

  const earnedToDate = runwayBase * inputs.earnedToDateFraction
  const available = ewaAvailable(earnedToDate, inputs.alreadyDrawn, inputs.ewa)
  const bufferTarget = Math.max(25, mustPays * 0.05)
  const afterMust = runwayBase - mustPays
  const safeTonight = Math.max(0, afterMust - bufferTarget)

  const coach = buildCoachPaths(
    runwayBase,
    mustPays,
    available,
    inputs.ewa,
    covers,
    gap,
    bufferTarget,
  )

  let kind = coach.kind
  let recommendedDraw = coach.draw
  let payoutPath = coach.path
  let fee = coach.fee

  const netAfterFee = Math.max(0, recommendedDraw - fee)
  const remainingAfterDraw = runwayBase + netAfterFee - mustPays

  let title: string
  let summary: string
  let speakText: string

  if (inputs.skipDay && !covers) {
    title = `Skipping ${skipLabel} breaks the runway`
    summary = `Without ${skipLabel}'s $${skipAmount.toFixed(0)}, you have $${ifSkip.toFixed(0)} against $${mustPays.toFixed(0)} must-pays (rent+transit $${rentTransit.toFixed(0)}). Short $${gap.toFixed(0)}.`
    if (kind === 'cautious_draw' || kind === 'gift_card') {
      summary += ` Coach: ${payoutPath === 'gift_card' ? 'gift-card' : 'bank'} draw $${recommendedDraw.toFixed(0)} (fee $${fee}).`
      speakText = `If you skip ${skipLabel}, you fall short of rent and transit by about ${gap.toFixed(0)} dollars. I recommend a ${recommendedDraw.toFixed(0)} dollar ${payoutPath === 'gift_card' ? 'gift card' : 'bank'} draw. Fee ${fee} dollars.`
    } else {
      summary += ` EWA available $${available.toFixed(0)} — not enough alone. Work ${skipLabel} or move a bill.`
      speakText = `If you skip ${skipLabel}, you cannot cover must-pays. Short about ${gap.toFixed(0)} dollars. Best move: work ${skipLabel} or move a bill.`
    }
  } else if (inputs.skipDay && covers) {
    title = `You can skip ${skipLabel}`
    summary = `Even without $${skipAmount.toFixed(0)} from ${skipLabel}, $${ifSkip.toFixed(0)} covers $${mustPays.toFixed(0)} (rent+transit $${rentTransit.toFixed(0)}). Safe tonight ≈ $${safeTonight.toFixed(0)}.`
    speakText = `Yes — you can skip ${skipLabel} and still cover rent and transit. Safe to spend tonight about ${safeTonight.toFixed(0)} dollars. Wait on earned wage access.`
    kind = 'wait'
    recommendedDraw = 0
    payoutPath = 'none'
    fee = 0
    for (const p of coach.paths) p.recommended = p.id === 'wait'
  } else if (!inputs.skipDay && !ifSkipLane.covers) {
    title = `Work ${skipLabel} — skip breaks rent runway`
    summary = `Working all shifts: $${total.toFixed(0)} covers $${mustPays.toFixed(0)}. If you skip ${skipLabel}, you drop to $${ifSkip.toFixed(0)} — short $${ifSkipLane.gap.toFixed(0)} for rent+transit ($${rentTransit.toFixed(0)}) and other must-pays.`
    speakText = `Keep ${skipLabel} on the schedule. Skipping would leave you short about ${ifSkipLane.gap.toFixed(0)} dollars before payday. Your float holds if you work it.`
    kind = 'wait'
    recommendedDraw = 0
    payoutPath = 'none'
    fee = 0
    for (const p of coach.paths) p.recommended = p.id === 'wait'
  } else if (kind === 'gift_card') {
    title = 'Gift-card path beats the bank fee'
    summary = `Must-pays $${mustPays.toFixed(0)} vs earned $${runwayBase.toFixed(0)}. Draw $${recommendedDraw.toFixed(0)} via gift card (fee $${fee}) instead of paying $${inputs.ewa.bankFee} to the bank.`
    speakText = `Take about ${recommendedDraw.toFixed(0)} dollars on the gift card path to avoid the ${inputs.ewa.bankFee} dollar bank fee. Then stop drawing.`
  } else if (kind === 'cautious_draw') {
    title = 'Cautious bank draw — then stop'
    summary = `Must-pays $${mustPays.toFixed(0)} vs earned $${runwayBase.toFixed(0)}. Draw up to $${recommendedDraw.toFixed(0)} (fee $${fee}); cushion after ≈ $${remainingAfterDraw.toFixed(0)}.`
    speakText = `Cautious draw of ${recommendedDraw.toFixed(0)} dollars to your bank. Fee ${fee} dollars. Do not draw again this period if you can help it.`
  } else {
    title = 'Must-pays on track'
    summary = `Nothing needs fixing right now. Earned $${runwayBase.toFixed(0)} covers $${mustPays.toFixed(0)} (rent+transit $${rentTransit.toFixed(0)}). Safe tonight ≈ $${safeTonight.toFixed(0)}. Flip the skip lever to pressure-test a day off.`
    speakText = `Your float holds. Safe to spend tonight about ${safeTonight.toFixed(0)} dollars. Wait on earned wage access. Try the skip lever if you want a day off.`
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
    rentTransit,
    ewaAvailable: available,
    safeToSpendTonight: safeTonight,
    runway: { workAll, ifSkip: ifSkipLane, skipDay: skipForCompare },
    coachPaths: coach.paths,
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
    // Calm entry: float holds; what-if lever flips Thursday on.
    skipDay: null,
    previewSkipDay: 'thu',
    bills: [
      { id: 'rent', name: 'Rent (portion due)', amount: 650, dueInDays: 3 },
      { id: 'transit', name: 'Transit / gas', amount: 85, dueInDays: 1 },
      { id: 'phone', name: 'Phone', amount: 40, dueInDays: 2 },
      { id: 'groceries', name: 'Groceries (must)', amount: 50, dueInDays: 2 },
    ],
    daysUntilPayday: 4,
    ewa: { ...DEFAULT_EWA },
    alreadyDrawn: 0,
    earnedToDateFraction: 0.6,
  }
}
