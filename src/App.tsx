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
  const [ttsDetail, setTtsDetail] = useState(
    'Voice idle — Speak loads Kokoro on first use',
  )
  const recRef = useRef<SpeechRecognition | null>(null)

  const decision = useMemo(() => decide(inputs), [inputs])
  const brokenSkip =
    Boolean(inputs.skipDay) && !decision.runwayCoversMustPays
  const skipLabel =
    WEEKDAYS.find((d) => d.id === decision.runway.skipDay)?.label ?? 'day'

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
      previewSkipDay: day,
    }))
  }

  function patchEwa(field: keyof Inputs['ewa'], value: number) {
    setInputs((prev) => ({
      ...prev,
      ewa: { ...prev.ewa, [field]: value },
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
      else if (patch.skipDay) {
        next.skipDay = patch.skipDay
        next.previewSkipDay = patch.skipDay
      }
      if (patch.hoursForDay) {
        const { day, hours } = patch.hoursForDay
        next.shifts[day] = { ...next.shifts[day], hours }
      }
      if (patch.tipForDay) {
        const { day, tips } = patch.tipForDay
        next.shifts[day] = { ...next.shifts[day], tips }
      }
      if (patch.billAmount) {
        const byName = next.bills.findIndex(
          (b) => b.name === patch.billAmount!.name,
        )
        const idx =
          byName >= 0
            ? byName
            : next.bills.findIndex(
                (b) =>
                  b.name.toLowerCase().includes('rent') &&
                  patch.billAmount!.name.toLowerCase().includes('rent'),
              )
        if (idx >= 0) {
          next.bills[idx] = {
            ...next.bills[idx],
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
      setTranscript(
        'Speech recognition not available in this browser — type fields instead.',
      )
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

  return (
    <div className="app">
      <header className="top">
        <div className="brand-block">
          <h1 className="brand">ShiftFloat</h1>
          <span className="tag">Daily earner · not a ledger</span>
        </div>
        <div className="hero-block">
          <p className="hero-line">
            If I skip {skipLabel} — do I still cover rent?
          </p>
          <p className="sub">
            Rent runway + safe-to-draw coach (wait · bank · gift-card). Voice
            on-device.
          </p>
        </div>
        <div className="top-actions">
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => setInputs(demoSeed())}
          >
            Reset
          </button>
          <button
            type="button"
            className={`btn btn-voice${listening ? ' listening' : ''}`}
            onClick={startListen}
          >
            {listening ? 'Listening…' : 'Speak to adjust'}
          </button>
          <button type="button" className="btn btn-primary" onClick={onSpeak}>
            Speak decision
          </button>
          <button type="button" className="btn btn-ghost" onClick={preloadTts}>
            Preload
          </button>
        </div>
      </header>

      {(transcript || voiceNote) && (
        <p className="voice-line">
          {transcript}
          {voiceNote ? ` · ${voiceNote}` : ''}
          {` · TTS: ${ttsStatus}`}
        </p>
      )}

      <div className="layout">
        <section className="panel inputs">
          <div className="row-meta">
            <label>
              Rate $/hr
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
              Days to payday
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
            <label>
              Bank fee
              <input
                type="number"
                min={0}
                step={1}
                value={inputs.ewa.bankFee}
                onChange={(e) =>
                  patchEwa('bankFee', Number(e.target.value) || 0)
                }
              />
            </label>
            <label>
              Daily cap
              <input
                type="number"
                min={0}
                step={10}
                value={inputs.ewa.dailyCap}
                onChange={(e) =>
                  patchEwa('dailyCap', Number(e.target.value) || 0)
                }
              />
            </label>
            <label>
              Max %
              <input
                type="number"
                min={1}
                max={100}
                step={1}
                value={Math.round(inputs.ewa.maxFraction * 100)}
                onChange={(e) =>
                  patchEwa(
                    'maxFraction',
                    Math.min(
                      1,
                      Math.max(0, (Number(e.target.value) || 0) / 100),
                    ),
                  )
                }
              />
            </label>
            <label>
              Gift fee
              <input
                type="number"
                min={0}
                step={1}
                value={inputs.ewa.giftCardFee}
                onChange={(e) =>
                  patchEwa('giftCardFee', Number(e.target.value) || 0)
                }
              />
            </label>
            <label>
              Drawn
              <input
                type="number"
                min={0}
                step={1}
                value={inputs.alreadyDrawn}
                onChange={(e) =>
                  setInputs((p) => ({
                    ...p,
                    alreadyDrawn: Number(e.target.value) || 0,
                  }))
                }
              />
            </label>
          </div>

          <div className="section-label">Shifts · hrs / tips · skip</div>
          <div className="shifts-week">
            {WEEKDAYS.map((d) => (
              <div
                key={d.id}
                className={`shift-day${inputs.skipDay === d.id ? ' skipped' : ''}`}
              >
                <span className="day">{d.short}</span>
                <input
                  type="number"
                  aria-label={`${d.short} hours`}
                  min={0}
                  max={24}
                  step={0.5}
                  value={inputs.shifts[d.id].hours}
                  onChange={(e) =>
                    updateShift(d.id, 'hours', Number(e.target.value) || 0)
                  }
                />
                <input
                  type="number"
                  aria-label={`${d.short} tips`}
                  min={0}
                  step={1}
                  value={inputs.shifts[d.id].tips}
                  onChange={(e) =>
                    updateShift(d.id, 'tips', Number(e.target.value) || 0)
                  }
                />
                <button
                  type="button"
                  className={`skip-btn${inputs.skipDay === d.id ? ' active' : ''}`}
                  onClick={() => toggleSkip(d.id)}
                >
                  {inputs.skipDay === d.id ? 'Skip' : '·'}
                </button>
              </div>
            ))}
          </div>

          <div className="section-label">Must-pays · amount · due (days)</div>
          <div className="bills-grid">
            {inputs.bills.map((b) => (
              <div key={b.id} className="bill-chip">
                <input
                  type="text"
                  value={b.name}
                  onChange={(e) => updateBill(b.id, { name: e.target.value })}
                  className="text-input"
                  aria-label="Bill name"
                />
                <input
                  type="number"
                  min={0}
                  value={b.amount}
                  onChange={(e) =>
                    updateBill(b.id, { amount: Number(e.target.value) || 0 })
                  }
                  aria-label="Amount"
                />
                <input
                  type="number"
                  min={0}
                  value={b.dueInDays}
                  onChange={(e) =>
                    updateBill(b.id, {
                      dueInDays: Number(e.target.value) || 0,
                    })
                  }
                  aria-label="Due in days"
                />
              </div>
            ))}
          </div>
        </section>

        <section
          className={`panel decision ${decision.kind}${brokenSkip ? ' broken' : ''}`}
        >
          <div className="decision-head">
            <div>
              <p className="decision-kicker">Decision</p>
              <h2>{decision.title}</h2>
            </div>
            <div className="metrics inline">
              <div className="metric">
                <span>Safe tonight</span>
                <strong>{money(decision.safeToSpendTonight)}</strong>
              </div>
              <div className="metric">
                <span>EWA avail</span>
                <strong>{money(decision.ewaAvailable)}</strong>
              </div>
            </div>
          </div>
          <p className="summary">{decision.summary}</p>

          <div className="runway-compare">
            <div
              className={`runway-lane${decision.runway.workAll.covers ? ' ok' : ' alert'}${!inputs.skipDay ? ' active-lane' : ''}`}
            >
              <span className="lane-label">Work all</span>
              <strong>
                {money(decision.runway.workAll.earned)} /{' '}
                {money(decision.runway.workAll.mustPays)}
              </strong>
              <em>
                R+T {money(decision.rentTransit)} ·{' '}
                {decision.runway.workAll.covers
                  ? 'covers'
                  : `−${money(decision.runway.workAll.gap)}`}
              </em>
            </div>
            <div
              className={`runway-lane${decision.runway.ifSkip.covers ? ' ok' : ' alert'}${inputs.skipDay ? ' active-lane' : ''}`}
            >
              <span className="lane-label">Skip {skipLabel.slice(0, 3)}</span>
              <strong>
                {money(decision.runway.ifSkip.earned)} /{' '}
                {money(decision.runway.ifSkip.mustPays)}
              </strong>
              <em>
                Lose {money(decision.skipDayEarnings)} ·{' '}
                {decision.runway.ifSkip.covers
                  ? 'ok'
                  : `−${money(decision.runway.ifSkip.gap)}`}
              </em>
            </div>
          </div>

          <div className="coach-paths">
            {decision.coachPaths.map((p) => (
              <div
                key={p.id}
                className={`coach-path${p.recommended ? ' recommended' : ''}`}
              >
                <div className="coach-top">
                  <span>{p.label}</span>
                  {p.recommended ? (
                    <span className="rec-badge">Best</span>
                  ) : null}
                </div>
                <strong>
                  {p.id === 'wait'
                    ? 'No draw'
                    : `${money(p.draw)}${p.fee > 0 ? ` · −${money(p.fee)}` : ''}`}
                </strong>
                <em className="why">{p.why}</em>
                <span className="cushion">After {money(p.cushion)}</span>
              </div>
            ))}
          </div>

          <p className="placeholder-line">
            Payroll sync + execute draw = placeholders · coach math is live
          </p>
        </section>
      </div>

      <p className="footer-note">
        Built with Cursor · Kokoro-82M TTS · Web Speech STT · Not affiliated
        with ZayZoon
        {!transcript && !voiceNote ? ` · TTS: ${ttsStatus}` : ''}
        {ttsDetail && !transcript ? ` — ${ttsDetail}` : ''}
      </p>
    </div>
  )
}
