# ShiftFloat — agent notes

## What this is

Voice-capable **decision tool** for daily earners: what-if skip lever → rent runway compare → safe-to-draw coach (wait / bank / gift-card). Not a money-in/out budget dashboard.

## File map

| Path | Role |
|------|------|
| `src/lib/engine.ts` | Core math + decision card copy |
| `src/lib/voiceParse.ts` | English heuristic STT → field patches |
| `src/lib/voice.ts` | Kokoro-82M TTS + Web Speech STT + browser fallback |
| `src/App.tsx` | Single-screen UI |
| `src/index.css` | Visual system |

## Commands

```bash
npm install
npm run dev
npm run build
```

## Conventions

- Keep the **decision panel** primary (chips → status → lever → runway → coach). Do not grow a chart dashboard.
- Demo opens **calm** (skip off); pressure-test via the what-if lever.
- Payroll sync + execute-draw are **placeholders** by design for the demo.
- Public docs / commits: Cursor-only attribution. No other harness names, no peer-project names, no `Co-authored-by` trailers.
- English only for voice.

## Event prompt (verbatim)

Build something that goes beyond the typical budget feature of money in / money out — imagine what a worker who earns daily would actually find valuable when managing their day-to-day earnings in a budgeting tool.
