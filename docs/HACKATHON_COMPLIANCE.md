# Hackathon compliance checklist

Source: https://nearhackathon.com/HACKATHON.md (read 2026-10-29). Re-read immediately before submitting.

| Requirement | Status |
|---|---|
| Work inside the window (from 2026-10-19) | Repository started empty on 2026-10-29; no baseline code |
| Baseline marking (`pre-hackathon` / `hackathon-submission` tags + README diff link) | `pre-hackathon` tags the empty initial commit; `hackathon-submission` to be added at submission |
| Public repository by 2026-11-14T23:59Z | Private at github.com/Olalekan2345/veilprocure; making it public is the owner's step (`gh repo edit Olalekan2345/veilprocure --visibility public --accept-visibility-change-consequences`) |
| LICENSE | MIT (`LICENSE`), confirmed by the owner |
| README "do X → see Y" | `README.md`, `docs/JUDGE_WALKTHROUGH.md` |
| Libraries / AI-generated code listed | README "Attribution" |
| Testnet-only eligibility | Yes — no mainnet-only integration used (NEAR Intents not integrated) |
| X demo post with video/screenshots, "built at NEAR HACKATHON" | Pending — the human publishes it |
| Tracks | `business` (primary). `privacy` — live attested AI demonstrated locally on 2026-10-30 (docs/AI_VERIFICATION.md); `security`/`realworld` only if justified by the final build |
| Submission | One-time `POST https://nearhackathon.com/api/applications` (2026-11-01 → 2026-11-14). The agent will show the exact JSON and wait for explicit approval. Never submitted automatically |

## Payload fields the human must supply (never invented)

`projectName`, `leadName`, `email`, `size` (`1`, `2 - 4`, `4 - 6`, `6 - 8`, `8+`), `tracks`, `nearAddress` (mainnet prize-payout account, lowercase), `projectUrl` (public repo), `demoUrl` (public X post), `idea` (20–2000 chars), `consent: true` after the human confirms verbatim: “I agree that the organizers may use these details to review our submission and contact us about this hackathon.” `requestId` is a UUID generated once and reused on retries.
