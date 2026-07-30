import type { Weekday } from './engine'
import { WEEKDAYS } from './engine'

const DAY_ALIASES: Record<string, Weekday> = {
  monday: 'mon',
  mon: 'mon',
  tuesday: 'tue',
  tue: 'tue',
  tues: 'tue',
  wednesday: 'wed',
  wed: 'wed',
  thursday: 'thu',
  thu: 'thu',
  thurs: 'thu',
  friday: 'fri',
  fri: 'fri',
  saturday: 'sat',
  sat: 'sat',
  sunday: 'sun',
  sun: 'sun',
}

export type VoicePatch = {
  hourlyRate?: number
  skipDay?: Weekday | null
  clearSkip?: boolean
  hoursForDay?: { day: Weekday; hours: number }
  tipForDay?: { day: Weekday; tips: number }
  billAmount?: { name: string; amount: number }
  raw: string
}

/** Lightweight English heuristic parser — demo-grade, not NLU. */
export function parseVoiceCommand(transcript: string): VoicePatch {
  const raw = transcript.trim()
  const t = raw.toLowerCase()
  const patch: VoicePatch = { raw }

  const rate =
    t.match(/(?:\$|rate\s*|make\s*|earn\s*|at\s*)(\d+(?:\.\d+)?)\s*(?:an?\s*hour|\/\s*h|per\s*hour|bucks?\s*an?\s*hour)?/) ||
    t.match(/(\d+(?:\.\d+)?)\s*(?:an?\s*hour|dollars?\s*(?:an?\s*)?hour)/)
  if (rate) patch.hourlyRate = Number(rate[1])

  if (/\b(don'?t skip|no skip|work every|cancel skip)\b/.test(t)) {
    patch.clearSkip = true
    patch.skipDay = null
  } else {
    const skip = t.match(
      /skip(?:ping)?\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday|mon|tue|tues|wed|thu|thurs|fri|sat|sun)/,
    )
    if (skip) patch.skipDay = DAY_ALIASES[skip[1]]
  }

  const hours = t.match(
    /(?:worked|work(?:ing)?|logged)?\s*(\d+(?:\.\d+)?)\s*hours?(?:\s+on\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday|mon|tue|wed|thu|fri|sat|sun))?/,
  )
  if (hours) {
    const dayKey = hours[2] ? DAY_ALIASES[hours[2]] : 'thu'
    patch.hoursForDay = { day: dayKey, hours: Number(hours[1]) }
  }

  const tips = t.match(
    /(\d+(?:\.\d+)?)\s*(?:dollars?\s*)?tips?(?:\s+on\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday|mon|tue|wed|thu|fri|sat|sun))?/,
  )
  if (tips) {
    const dayKey = tips[2] ? DAY_ALIASES[tips[2]] : patch.hoursForDay?.day ?? 'thu'
    patch.tipForDay = { day: dayKey, tips: Number(tips[1]) }
  }

  const rent = t.match(/rent(?:'?s| is| of)?\s*\$?(\d+(?:\.\d+)?)/)
  if (rent) patch.billAmount = { name: 'Rent (portion due)', amount: Number(rent[1]) }

  const transit = t.match(
    /(?:transit|gas|bus)\s*(?:is|of|'s)?\s*\$?(\d+(?:\.\d+)?)/,
  )
  if (transit) patch.billAmount = { name: 'Transit / gas', amount: Number(transit[1]) }

  return patch
}

export function describePatch(patch: VoicePatch): string {
  const bits: string[] = []
  if (patch.hourlyRate != null) bits.push(`rate $${patch.hourlyRate}/hr`)
  if (patch.clearSkip) bits.push('cleared skip day')
  else if (patch.skipDay)
    bits.push(
      `skip ${WEEKDAYS.find((d) => d.id === patch.skipDay)?.label ?? patch.skipDay}`,
    )
  if (patch.hoursForDay)
    bits.push(`${patch.hoursForDay.hours}h on ${patch.hoursForDay.day}`)
  if (patch.tipForDay)
    bits.push(`$${patch.tipForDay.tips} tips on ${patch.tipForDay.day}`)
  if (patch.billAmount)
    bits.push(`${patch.billAmount.name} → $${patch.billAmount.amount}`)
  return bits.length ? bits.join(' · ') : 'heard you — tweak fields if needed'
}
