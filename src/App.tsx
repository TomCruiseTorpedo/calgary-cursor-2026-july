import { useMemo, useRef, useState } from 'react'
import {
  WEEKDAYS,
  decide,
  demoSeed,
  type Bill,
  type Inputs,
  type Weekday,
} from './lib/engine'
import { describePatch, parseVoiceCommand } from './lib/voiceParse'
import {
  ensureKokoro,
  getSpeechRecognition,
  speakDecision,
  type TtsStatus,
} from './lib/voice'

function money(n: number): string {
  return n.toLocaleString('en-CA', {
    style: 'currency',
    currency: 'CAD',
    maximumFractionDigits: 0,
  })
}

export default function App() {
  const [inputs, setInputs] = useState<Inputs>(() => demoSeed())
  const [listening, setListening] = useState(false)
  const [transcript, setTranscript] = useState('')
  const [voiceNote, setVoiceNote] = useState('')
  const [ttsStatus, setTtsStatus] = useState<TtsStatus>('idle')
  const [ttsDetail, setTtsDetail] = useState('Voice idle — Speak loads Kokoro on first use')
  const recRef = useRef<SpeechRecognition | null>(null)

  const decision = useMemo(() => decide(inputs), [inputs])
  const brokenSkip =
    Boolean(inputs.skipDay) && !decision.runwayCoversMustPays

  function updateShift(day: Weekday, field: 'hours' | 'tips', value: number) {
    setInputs((prev) => ({
      ...prev,
      shifts: {
        ...prev.shifts,
        [day]: { ...prev.shifts[day], [field]: Math.max(0, value) },
      },
    }))
  }

  function updateBill(id: string, patch: Partial<Bill>) {
    setInputs((prev) => ({
      ...prev,
      bills: prev.bills.map((b) => (b.id === id ? { ...b, ...patch } : b)),
    }))
  }

  function toggleSkip(day: Weekday) {
    setInputs((prev) => ({
      ...prev,
      skipDay: prev.skipDay === day ? null : day,
    }))
  }

  function applyVoice(text: string) {
    const patch = parseVoiceCommand(text)
    setVoiceNote(describePatch(patch))
    setInputs((prev) => {
      const next: Inputs = {
        ...prev,
        shifts: { ...prev.shifts },
        bills: prev.bills.map((b) => ({ ...b })),
        ewa: { ...prev.ewa },
      }
      if (patch.hourlyRate != null) next.hourlyRate = patch.hourlyRate
      if (patch.clearSkip) next.skipDay = null
      else if (patch.skipDay) next.skipDay = patch.skipDay
      if (patch.hoursForDay) {
        const { day, hours } = patch.hoursForDay
        next.shifts[day] = { ...next.shifts[day], hours }
      }
      if (patch.tipForDay) {
        const { day, tips } = patch.tipForDay
        next.shifts[day] = { ...next.shifts[day], tips }
      }
      if (patch.billAmount) {
        const idx = next.bills.findIndex(
          (b) =>
            b.name.toLowerCase().includes('rent') &&
            patch.billAmount!.name.toLowerCase().includes('rent'),
        )
        const byName = next.bills.findIndex(
          (b) => b.name === patch.billAmount!.name,
        )
        const target = byName >= 0 ? byName : idx
        if (target >= 0) {
          next.bills[target] = {
            ...next.bills[target],
            amount: patch.billAmount.amount,
          }
        }
      }
      return next
    })
  }

  function startListen() {
    const rec = getSpeechRecognition()
    if (!rec) {
      setTranscript('Speech recognition not available in this browser — type fields instead.')
      return
    }
    recRef.current = rec
    setListening(true)
    setTranscript('Listening…')
    rec.onresult = (ev) => {
      const text = ev.results[0]?.[0]?.transcript ?? ''
      setTranscript(text)
      applyVoice(text)
    }
    rec.onerror = () => {
      setListening(false)
      setTranscript('Mic error — try again or edit fields.')
    }
    rec.onend = () => setListening(false)
    rec.start()
  }

  async function onSpeak() {
    setTtsStatus('loading')
    await speakDecision(decision.speakText, (s, detail) => {
      setTtsStatus(s)
      if (detail) setTtsDetail(detail)
    })
  }

  async function preloadTts() {
    await ensureKokoro((s, detail) => {
      setTtsStatus(s)
      if (detail) setTtsDetail(detail)
    })
  }

  const pathLabel =
    decision.payoutPath === 'gift_card'
      ? 'Gift-card path'
      : decision.payoutPath === 'bank'
        ? 'Bank transfer'
        : 'No draw'

  return (
    <div className="app">
      <header className="brand-bar">
        <h1 className="brand">ShiftFloat</h1>
        <span className="tag">Daily earner · not a ledger</span>
      </header>

      <p className="hero-line">
        If I skip Thursday — do I still cover rent?
      </p>
      <p className="sub">
        Log the week you actually work. Toggle a skip day. Get a runway answer
        and a safe-to-draw call (wait / cautious bank / gift-card) — grounded in
        your numbers, spoken aloud on-device.
      </p>

      <div className="layout">
        <section className="panel">
          <h2>This week’s shifts</h2>
          <div className="field-row">
            <label>
              Hourly rate (CAD)
              <input
                type="number"
                min={0}
                step={0.5}
                value={inputs.hourlyRate}
                onChange={(e) =>
                  setInputs((p) => ({
                    ...p,
                    hourlyRate: Number(e.target.value) || 0,
                  }))
                }
              />
            </label>
            <label>
              Days until payday
              <input
                type="number"
                min={0}
                max={14}
                value={inputs.daysUntilPayday}
                onChange={(e) =>
                  setInputs((p) => ({
                    ...p,
                    daysUntilPayday: Number(e.target.value) || 0,
                  }))
                }
              />
            </label>
          </div>

          <div className="shifts">
            {WEEKDAYS.map((d) => (
              <div
                key={d.id}
                className={`shift-row${inputs.skipDay === d.id ? ' skipped' : ''}`}
              >
                <span className="day">{d.short}</span>
                <label>
                  Hours
                  <input
                    type="number"
                    min={0}
                    max={24}
                    step={0.5}
                    value={inputs.shifts[d.id].hours}
                    onChange={(e) =>
                      updateShift(d.id, 'hours', Number(e.target.value) || 0)
                    }
                  />
                </label>
                <label>
                  Tips
                  <input
                    type="number"
                    min={0}
                    step={1}
                    value={inputs.shifts[d.id].tips}
                    onChange={(e) =>
                      updateShift(d.id, 'tips', Number(e.target.value) || 0)
                    }
                  />
                </label>
                <button
                  type="button"
                  className={`skip-btn${inputs.skipDay === d.id ? ' active' : ''}`}
                  onClick={() => toggleSkip(d.id)}
                >
                  {inputs.skipDay === d.id ? 'Skipping' : 'Skip?'}
                </button>
              </div>
            ))}
          </div>

          <h2>Must-pays before payday</h2>
          <div className="bills">
            {inputs.bills.map((b) => (
              <div key={b.id} className="bill-row">
                <label>
                  Bill
                  <input
                    type="text"
                    value={b.name}
                    onChange={(e) => updateBill(b.id, { name: e.target.value })}
                    style={{
                      background: 'var(--bg0)',
                      border: '1px solid var(--line)',
                      borderRadius: 10,
                      color: 'var(--ink)',
                      padding: '0.55rem 0.65rem',
                      fontFamily: 'var(--mono)',
                    }}
                  />
                </label>
                <label>
                  Amount
                  <input
                    type="number"
                    min={0}
                    value={b.amount}
                    onChange={(e) =>
                      updateBill(b.id, { amount: Number(e.target.value) || 0 })
                    }
                  />
                </label>
                <label>
                  Due in days
                  <input
                    type="number"
                    min={0}
                    value={b.dueInDays}
                    onChange={(e) =>
                      updateBill(b.id, {
                        dueInDays: Number(e.target.value) || 0,
                      })
                    }
                  />
                </label>
              </div>
            ))}
          </div>

          <div className="actions">
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => setInputs(demoSeed())}
            >
              Reset demo week
            </button>
            <button
              type="button"
              className={`btn btn-voice${listening ? ' listening' : ''}`}
              onClick={startListen}
            >
              {listening ? 'Listening…' : 'Speak to adjust'}
            </button>
          </div>
          {transcript ? <div className="transcript">{transcript}</div> : null}
          {voiceNote ? (
            <p className="voice-status">Parsed: {voiceNote}</p>
          ) : null}
        </section>

        <section
          className={`panel decision ${decision.kind}${brokenSkip ? ' broken' : ''}`}
        >
          <p className="decision-kicker">Decision card</p>
          <h2>{decision.title}</h2>
          <p>{decision.summary}</p>

          <div className="path-chip">
            <span>{pathLabel}</span>
            {decision.recommendedDraw > 0 ? (
              <strong>
                {money(decision.recommendedDraw)}
                {decision.fee > 0 ? ` · fee ${money(decision.fee)}` : ' · no fee'}
              </strong>
            ) : (
              <strong>Hold EWA</strong>
            )}
          </div>

          <div className="metrics">
            <div className={`metric ${decision.runwayCoversMustPays ? 'ok' : 'alert'}`}>
              <span>Runway vs must-pays</span>
              <strong>
                {money(inputs.skipDay ? decision.earnedIfSkip : decision.earnedThisWeek)}{' '}
                / {money(decision.mustPays)}
              </strong>
            </div>
            <div className={`metric ${decision.gapToMustPays > 0 ? 'alert' : 'ok'}`}>
              <span>Gap if skip</span>
              <strong>
                {decision.gapToMustPays > 0
                  ? money(decision.gapToMustPays)
                  : 'Covered'}
              </strong>
            </div>
            <div className="metric">
              <span>Safe tonight</span>
              <strong>{money(decision.safeToSpendTonight)}</strong>
            </div>
            <div className="metric">
              <span>EWA available (mock)</span>
              <strong>{money(decision.ewaAvailable)}</strong>
            </div>
          </div>

          <div className="actions">
            <button type="button" className="btn btn-primary" onClick={onSpeak}>
              Speak decision
            </button>
            <button type="button" className="btn btn-ghost" onClick={preloadTts}>
              Preload Kokoro
            </button>
          </div>
          <p className="voice-status">
            TTS: {ttsStatus}
            {ttsDetail ? ` — ${ttsDetail}` : ''}
          </p>

          <div className="placeholder">
            <h3>Payroll sync (placeholder)</h3>
            <p>
              Shape only — real ZayZoon / ADP hours would land here. Demo uses
              manual + voice-entered shifts.
            </p>
          </div>
          <div className="placeholder">
            <h3>Instant draw (placeholder)</h3>
            <p>
              Recommendation is real math; executing a transfer is mocked. Cap
              50% / $200 day mirrors typical EWA rails.
            </p>
          </div>
        </section>
      </div>

      <p className="footer-note">
        Built with Cursor · On-device TTS via Kokoro-82M (kokoro-js) · STT via
        Web Speech API · English only · Not affiliated with ZayZoon
      </p>
    </div>
  )
}
