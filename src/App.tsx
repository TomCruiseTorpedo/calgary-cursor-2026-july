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
  const [ttsDetail, setTtsDetail] = useState('')
  const [showDrawSettings, setShowDrawSettings] = useState(false)
  const recRef = useRef<SpeechRecognition | null>(null)

  const decision = useMemo(() => decide(inputs), [inputs])
  const brokenSkip =
    Boolean(inputs.skipDay) && !decision.runwayCoversMustPays
  const previewDay = inputs.previewSkipDay
  const skipLabel =
    WEEKDAYS.find((d) => d.id === previewDay)?.label ?? 'Thursday'
  const activeLane = inputs.skipDay
    ? decision.runway.ifSkip
    : decision.runway.workAll
  const bestPath =
    decision.coachPaths.find((p) => p.recommended) ?? decision.coachPaths[0]
  const floatHealthy = decision.runway.workAll.covers && !brokenSkip
  const skipEarnPreview = decision.skipDayEarnings

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

  function setPreviewDay(day: Weekday) {
    setInputs((prev) => ({
      ...prev,
      previewSkipDay: day,
      // Keep lever state; retarget which day is skipped.
      skipDay: prev.skipDay ? day : null,
    }))
  }

  function toggleSkipLever() {
    setInputs((prev) => ({
      ...prev,
      skipDay: prev.skipDay ? null : prev.previewSkipDay,
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
            Flip the what-if lever. Read the runway. Take the Best draw path —
            or wait.
          </p>
        </div>
        <div className="top-actions">
          <button type="button" className="btn btn-primary" onClick={onSpeak}>
            Speak decision
          </button>
          <button
            type="button"
            className={`btn btn-voice${listening ? ' listening' : ''}`}
            onClick={startListen}
          >
            {listening ? 'Listening…' : 'Speak to adjust'}
          </button>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => setInputs(demoSeed())}
          >
            Reset demo
          </button>
        </div>
      </header>

      {(transcript || voiceNote) && (
        <p className="voice-line" role="status">
          {transcript}
          {voiceNote ? ` · ${voiceNote}` : ''}
          {` · Voice: ${ttsStatus}`}
        </p>
      )}

      <div className="layout">
        <section
          className={`panel decision ${decision.kind}${brokenSkip ? ' broken' : ''}${floatHealthy && !inputs.skipDay ? ' healthy' : ''}`}
        >
          <div className="answer-chips" aria-label="Key answers">
            <div className="answer-chip">
              <span>Safe tonight</span>
              <strong>{money(decision.safeToSpendTonight)}</strong>
              <em>Yours after must-pays buffer</em>
            </div>
            <div
              className={`answer-chip${activeLane.covers ? ' ok' : ' alert'}`}
            >
              <span>Runway</span>
              <strong>
                {activeLane.covers
                  ? 'Covers'
                  : `Short ${money(activeLane.gap)}`}
              </strong>
              <em>
                {inputs.skipDay
                  ? `If you skip ${skipLabel}`
                  : 'Working every shift'}
              </em>
            </div>
            <div className="answer-chip best">
              <span>Best path</span>
              <strong>{bestPath.label}</strong>
              <em>
                {bestPath.id === 'wait'
                  ? 'No draw needed'
                  : `${money(bestPath.draw)} after fee`}
              </em>
            </div>
          </div>

          <div
            className={`status-card${floatHealthy && !inputs.skipDay ? ' ok' : brokenSkip ? ' alert' : ' warn'}`}
            role="status"
          >
            {floatHealthy && !inputs.skipDay ? (
              <>
                <strong>Must-pays on track</strong>
                <p>
                  Nothing needs fixing right now. Weakest link if you skip{' '}
                  {skipLabel}: short {money(decision.runway.ifSkip.gap)} before
                  payday. Ranked fixes appear the moment the lever breaks the
                  runway.
                </p>
              </>
            ) : brokenSkip ? (
              <>
                <strong>Runway broken — take Best below</strong>
                <p>
                  Skipping {skipLabel} leaves rent + transit short. Coach picks{' '}
                  {bestPath.label}.
                </p>
              </>
            ) : (
              <>
                <strong>{decision.title}</strong>
                <p>{decision.summary}</p>
              </>
            )}
          </div>

          <div className="what-if">
            <div className="what-if-head">
              <span className="section-label inline">What-if lever</span>
              <span className="lever-meta">
                {inputs.skipDay ? '1 of 1 on' : '0 of 1 on'}
              </span>
            </div>
            <div className="day-picks" role="group" aria-label="Day to skip">
              {WEEKDAYS.map((d) => (
                <button
                  key={d.id}
                  type="button"
                  className={`day-pick${previewDay === d.id ? ' selected' : ''}${inputs.skipDay === d.id ? ' live' : ''}`}
                  onClick={() => setPreviewDay(d.id)}
                  aria-pressed={previewDay === d.id}
                >
                  {d.short}
                </button>
              ))}
            </div>
            <button
              type="button"
              className={`lever${inputs.skipDay ? ' on' : ''}`}
              onClick={toggleSkipLever}
              aria-pressed={Boolean(inputs.skipDay)}
            >
              <span className="lever-switch" aria-hidden="true" />
              <span className="lever-copy">
                <strong>Skip {skipLabel}</strong>
                <em>
                  Drop that shift before payday · lose about{' '}
                  {money(skipEarnPreview)}
                  {decision.runway.ifSkip.covers
                    ? ' · still covers must-pays'
                    : ` · breaks runway by ${money(decision.runway.ifSkip.gap)}`}
                </em>
              </span>
            </button>
          </div>

          <div className="runway-compare">
            <div
              className={`runway-lane${decision.runway.workAll.covers ? ' ok' : ' alert'}${!inputs.skipDay ? ' active-lane' : ''}`}
            >
              <span className="lane-label">Work every shift</span>
              <strong>
                {money(decision.runway.workAll.earned)} /{' '}
                {money(decision.runway.workAll.mustPays)}
              </strong>
              <em>
                Rent + transit {money(decision.rentTransit)} ·{' '}
                {decision.runway.workAll.covers
                  ? 'covers'
                  : `short ${money(decision.runway.workAll.gap)}`}
              </em>
            </div>
            <div
              className={`runway-lane${decision.runway.ifSkip.covers ? ' ok' : ' alert'}${inputs.skipDay ? ' active-lane' : ''}`}
            >
              <span className="lane-label">If you skip {skipLabel}</span>
              <strong>
                {money(decision.runway.ifSkip.earned)} /{' '}
                {money(decision.runway.ifSkip.mustPays)}
              </strong>
              <em>
                Lose {money(decision.skipDayEarnings)} that day ·{' '}
                {decision.runway.ifSkip.covers
                  ? 'still covers'
                  : `short ${money(decision.runway.ifSkip.gap)}`}
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
                    : `${money(p.draw)}${p.fee > 0 ? ` · fee ${money(p.fee)}` : ' · no fee'}`}
                </strong>
                <em className="why">{p.why}</em>
                <span className="cushion">After {money(p.cushion)}</span>
              </div>
            ))}
          </div>

          <p className="placeholder-line">
            Payroll sync + sending a draw stay mocked · coach math is live
          </p>
        </section>

        <section className="panel inputs">
          <div className="row-meta simple">
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
              Already drawn $
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

          <div className="section-label">This week · hours / tips</div>
          <div className="shifts-week">
            {WEEKDAYS.map((d) => (
              <div
                key={d.id}
                className={`shift-day${inputs.skipDay === d.id ? ' skipped' : ''}${previewDay === d.id && !inputs.skipDay ? ' preview' : ''}`}
              >
                <span className="day">{d.short}</span>
                <span className="field-hint">hrs</span>
                <input
                  type="number"
                  aria-label={`${d.label} hours`}
                  min={0}
                  max={24}
                  step={0.5}
                  value={inputs.shifts[d.id].hours}
                  onChange={(e) =>
                    updateShift(d.id, 'hours', Number(e.target.value) || 0)
                  }
                />
                <span className="field-hint">tips</span>
                <input
                  type="number"
                  aria-label={`${d.label} tips`}
                  min={0}
                  step={1}
                  value={inputs.shifts[d.id].tips}
                  onChange={(e) =>
                    updateShift(d.id, 'tips', Number(e.target.value) || 0)
                  }
                />
              </div>
            ))}
          </div>

          <div className="section-label">Must-pays before payday</div>
          <div className="bills-grid">
            {inputs.bills.map((b) => (
              <div key={b.id} className="bill-chip">
                <input
                  type="text"
                  value={b.name}
                  onChange={(e) => updateBill(b.id, { name: e.target.value })}
                  className="text-input"
                  aria-label={`${b.name} name`}
                />
                <input
                  type="number"
                  min={0}
                  value={b.amount}
                  onChange={(e) =>
                    updateBill(b.id, { amount: Number(e.target.value) || 0 })
                  }
                  aria-label={`${b.name} amount`}
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
                  aria-label={`${b.name} due in days`}
                />
              </div>
            ))}
          </div>

          <details
            className="draw-settings"
            open={showDrawSettings}
            onToggle={(e) =>
              setShowDrawSettings((e.target as HTMLDetailsElement).open)
            }
          >
            <summary>Draw settings (fee · cap · gift path)</summary>
            <div className="row-meta ewa">
              <label>
                Bank fee $
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
                Daily cap $
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
                Max % earned
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
                Gift fee $
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
              <button
                type="button"
                className="btn btn-ghost btn-inline"
                onClick={preloadTts}
              >
                Preload voice
              </button>
            </div>
          </details>
        </section>
      </div>

      <p className="footer-note">
        Built with Cursor · On-device voice · Not affiliated with ZayZoon
        {ttsDetail ? ` · ${ttsDetail}` : ''}
      </p>
    </div>
  )
}
