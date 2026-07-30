# ShiftFloat

Payday is Friday. Rent hits mid-week. You’re staring at Thursday’s shift — sick kid, no cover — wondering if you can take it off, and whether tapping earned wages tonight helps or just burns a fee.

**ShiftFloat** answers that for daily earners. Not another money-in / money-out budget ledger — a **what-if skip lever**, a side-by-side **rent runway**, and a **safe-to-draw coach** (wait · bank · gift-card) spoken on-device.

Built with **[Cursor](https://cursor.com)** as the agentic coding harness.

> **Prompt fit:** *Build something that goes beyond the typical budget feature of money in / money out — imagine what a worker who earns daily would actually find valuable when managing their day-to-day earnings in a budgeting tool.*

## Live demo

| Surface | URL |
|---------|-----|
| Repo | https://github.com/TomCruiseTorpedo/calgary-cursor-2026-july |
| Local | `npm install && npm run dev` → http://127.0.0.1:5173 |

## How it was built

Cursor end-to-end: pure decision engine, voice I/O, judge-facing README. On-device **Kokoro-82M** TTS (`kokoro-js`) + **Web Speech** STT. Payroll sync and real transfers are explicit placeholders — coach math is live.

## Summary for reviewers

| Criterion | How this project addresses it |
|-----------|-------------------------------|
| **Everyday pain (daily earner)** | “If I skip Thursday, do I still cover rent?” — then wait / bank / gift-card |
| **Beyond money in / out** | What-if lever + runway lanes + scored draw paths — not envelopes or category pies |
| **Cursor fit** | Mechanism in `src/lib/engine.ts`; voice in `src/lib/voice*.ts` |
| **Working demo** | Seeded QSR week opens calm; flip Skip Thursday → broken runway + Best path |
| **Quality** | Pure `decide()`; browser TTS fallback if Kokoro cold-start fails |

## What it does

1. Opens with **must-pays on track** (Safe tonight · Runway · Best path chips).
2. Flip the **what-if lever** (pick a day → Skip) — compare work-all vs skip rent runway.
3. Read the **safe-to-draw coach**: Wait / Bank / Gift-card; one **Best**; draw fees under *Draw settings*.
4. **Speak to adjust** (mic) or edit fields; **Speak decision** plays Kokoro (or browser TTS).

## Judge checklist

1. Open the app (`npm run dev` or clone the public repo).
2. Confirm calm entry: **Must-pays on track** · Safe tonight above $0 · Best path = Wait.
3. Flip **Skip Thursday** on the what-if lever → runway **Short**, title breaks, Best path updates.
4. Flip lever off → float holds again; Best stays Wait (no lying badge).
5. Open **Draw settings**, tweak Bank fee / Daily cap — coach paths recalculate.
6. Click **Speak decision**; skim `src/lib/engine.ts`.

## Architecture

```
shifts + bills + skip lever
        ↓
   engine.decide()  →  chips · status · runway · coach (UI)
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
| Skip Thursday → broken runway + coach | ![Skip Thursday breaks runway](docs/screenshots/01-skip-thursday-breaks-runway.png) |
| Clear skip → float holds | ![Float holds](docs/screenshots/02-float-holds.png) |
| Work-vs-skip runway + Wait/Bank/Gift-card coach | ![Runway and coach](docs/screenshots/03-runway-and-coach.png) |
