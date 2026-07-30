# ShiftFloat

Payday is Friday. Rent hits Wednesday. You’re staring at Thursday’s shift wondering if you can take it off for a sick kid — and whether tapping earned wages tonight helps or just burns a fee.

**ShiftFloat** answers that. Not with another money-in / money-out ledger — with a **rent runway** under a skip-day and a **safe-to-draw** call (wait · cautious bank · gift-card path), spoken on-device.

Built with **[Cursor](https://cursor.com)** as the agentic coding harness.

## Live demo

| Surface | URL |
|---------|-----|
| Local | `npm run dev` → http://localhost:5173 |
| Production | _pending `vercel deploy --prod` (approve when ready)_ |

## How it was built

Cursor end-to-end: decision engine, voice I/O, judge-facing README. On-device **Kokoro-82M** TTS (`kokoro-js`) + **Web Speech** STT (English). Payroll sync and real transfers are shaped as placeholders.

## Summary for reviewers

| Criterion | How this project addresses it |
|-----------|-------------------------------|
| **Everyday pain (daily earner)** | “If I skip Thursday, do I still cover rent + transit?” — then whether to draw EWA |
| **Beyond money in / out** | Decision card + skip-day runway, not envelopes or category pie charts |
| **Cursor fit** | Readable mechanism in `src/lib/engine.ts`; voice loop in `src/lib/voice*.ts` |
| **Working demo** | Seeded QSR week; toggle Skip on Thursday; Speak decision |
| **Quality** | Pure decision function; browser TTS fallback if Kokoro cold-start fails |

## What it does

1. Load the seeded week (hours, tips, must-pays before payday).
2. Toggle **Skip?** on a day — runway recalculates instantly.
3. Read the **decision card**: cover / gap, safe tonight, EWA available, recommended path.
4. **Speak to adjust** (mic) or edit fields; **Speak decision** plays Kokoro (or browser TTS).

## Judge checklist

1. Open the app (local or live URL).
2. Confirm the decision card shows a **broken runway** with Thursday skipped (demo default).
3. Clear Thursday skip — card should flip toward **Wait — float holds** (or much tighter gap).
4. Click **Speak decision** — hear the recommendation (first Kokoro load may take a moment).
5. Optional: **Speak to adjust** — e.g. “skip Friday” or “rent is 650”.
6. Skim `src/lib/engine.ts` for the mechanism.

## Architecture

```
shifts + bills + skip day
        ↓
   engine.decide()  →  decision card (UI)
        ↓
   Kokoro / speechSynthesis  →  spoken recommendation
```

Stack: Vite · React · TypeScript · kokoro-js (Kokoro-82M ONNX) · Web Speech API.

## Verify locally

```bash
npm install
npm run dev
```

Optional: `npm run build && npm run preview`.

No API keys. First **Speak decision** may download Kokoro weights from Hugging Face into the browser cache.

## Screenshots

| | |
|--|--|
| Skip Thursday → broken runway + cautious draw | ![Skip Thursday breaks runway](docs/screenshots/01-skip-thursday-breaks-runway.png) |
| Clear skip → float holds | ![Float holds](docs/screenshots/02-float-holds.png) |
