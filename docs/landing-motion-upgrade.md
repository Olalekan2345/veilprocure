# Landing page — motion and luminosity upgrade

Built 2026-11-13 from `VeilProcure_Premium_Motion_Director_Prompt.md`, `CLAUDE_CODE_PROMPT.md`, `START_HERE.md` and the supplied reference frames (two animation contact sheets and the floating product-card still). A surgical pass on the approved page: no new section, no copy, font, palette, logo, layout or order change.

## The enhanced section

**08 · Inside the workspace — "From request to receipt, in one place."** (`#journey`). It is the page's mid-point workflow showcase, between *Roles* and *How it works*, and it was the least animated part of the page: a static window of grey placeholder rows with four labels drifting slightly on scroll. Its window (≈ 980 × 405 px) already had the space for a short story, and its four existing labels — *Sealed bid*, *Comparison*, *Approval*, *Receipt* — map one-to-one onto the four beats the brief asks for.

The window now plays a 9.6-second, play-once **3D** film (`components/site/journey-film.tsx`). The stage is a real CSS 3D scene (perspective, `preserve-3d`): a central "plate" (the workspace card) sits in depth with cards orbiting it at different distances, over a secure-network backdrop of nodes, padlocks and data paths. A camera move eases the scene from a wide, tilted angle into the resting view.

| Beat | Time | What happens |
|---|---|---|
| A · The request | 0–2.5 s | The plate rises out of depth as the camera swings in. Five requirement chips (Scope, Hard requirements, Price ceiling, Bid deadline, Scoring weights) fly in from far behind, float beside the plate, then dock onto its rows; the rows fill and "Rules published" springs in; a light sheen crosses the card. |
| B · Sealed bids | 2.5–5 s | Three "Sealed quote" cards (Supplier 1–3; contents masked) arrive from deep behind with rotation, settle into a fanned, layered orbit beside the plate, their padlocks snap shut with a ring of light, and drawn light paths connect them to the request. They then merge into the plate. |
| C · Evaluation | 4.3–7 s | The plate turns into "Comparison — Checked against chain"; the rows ("Commitment verified", "Eligible", "Rule not met") slide in, each "Commitment verified" glows, a mint scan line sweeps the card, and "AI notes · advisory" lights above it on a beam. |
| D · Buyer-controlled payment | 6.9–9.6 s | "Buyer approval — Signed in your wallet" and "Escrow — Held by the contract · NEAR testnet" fly in from depth; light paths draw comparison → approval → escrow; a shield settles on the escrow card with a sheen. The sidebar moves from *Requests* to *Transactions*. |

The four existing labels light in turn at their beat. After the film, the scene keeps a subtle loop while it is on screen: cards bob a few pixels at staggered rhythms, light pulses travel along the network, padlock rings breathe, and a comet runs along the approval → escrow path. All loops stop off screen.

**Honesty.** Generic labels only — no supplier names, amounts, hashes, balances, "Paid" or "Confirmed". The escrow card says *Held by the contract*, not "released only when you approve" (the contract also lets the supplier claim after the review window). The AI label says *advisory*. The caption "Illustration of the workspace — not live data." is unchanged.

**Behaviour.** Starts when the window is a third visible; pauses off screen and resumes; plays once per visit; no scroll hijacking, pinning or spacer. The stage leans up to ±6° towards the pointer on desktop only (fine pointer, ≥ 1024 px), which gives the parallax. Under 600 px of stage width (phones and tablets) the camera is gentler, the floating chips are left out, the quotes stack in front of the plate, and approval and escrow sit side by side under it. With `prefers-reduced-motion` (or without JavaScript) the complete final frame is shown, still. The animated layer is `aria-hidden`; the figure keeps its label and caption, and the four labels stay as text.

## The finishing pass (whole page)

Layered mint light — crisp edge, restrained halo, soft bloom — on one or two focal points per viewport; glyphs are never blurred.

- **Buttons:** a specular light pass on hover, a mint edge on the dark primary and a lit top edge on mint buttons, a resting mint halo on the primary call to action, a glowing focus ring, and a press state.
- **Hero:** the underline under "Less exposure." is lit, the stage glow is slightly richer, the dark "Payment approval" card has a mint edge light, and the overline dot glows.
- **Cards:** a top hairline highlight and a tighter contact shadow under the existing depth; the evidence cards get a mint edge on hover.
- **Dark band:** the sweep line glows, the three module icons carry an edge light, and the modules light their edge on hover.
- **Security icons and dark chips** carry a faint edge light.
- **Luminosity (second pass):** stronger resting and hover halos on the primary call to action, a soft mint glow on highlighted headline words and on mint text in the dark band, glowing mint chips, a light sheen across evidence and role cards on hover, and a brighter security-seal icon.
- The hero's looping float now pauses while the hero is off screen.

## Files changed

| File | Change |
|---|---|
| `apps/web/src/components/site/journey-film.tsx` | Client component: the window, the 3D scene and network backdrop, the film (Web Animations API: 3D transforms, opacity and SVG stroke offsets), pointer parallax and the four labels. |
| `apps/web/src/app/page.tsx` | The static `#journey` figure is replaced by `<JourneyFilm />` (same heading, labels and caption). |
| `apps/web/src/components/site/site.css` | 3D scene styles (final frame as resting state, phone/tablet layout via container queries, ambient loops gated on visibility and reduced motion) and the finishing pass. Orbit labels are `position: relative` on small screens so their glow can anchor. |
| `apps/web/src/components/site/motion.tsx` | Pauses the hero's looping animations while it is off screen. |
| `tests/e2e/specs/landing.spec.ts` | Three tests: the film plays once and settles on its final frame (quotes merged; comparison, AI note, approval and escrow showing) without claiming a payment; on a phone it plays through with its final cards inside the window and no horizontal overflow; reduced motion shows the complete final frame without animating. |

No new dependency: GSAP and Framer Motion are not in the project, so the film uses the browser's own Web Animations API.

## Verification (2026-11-13, local production build)

| Check | Result |
|---|---|
| Page height, before (live site) → after | 1440 × 900: 11,330 → 11,330 px; 768 × 1024: 12,414 → 12,415 px; 390 × 844: 15,659 → 15,658 px (sub-pixel rounding). The showcase window keeps its size (360 px; 440 px on phones). |
| Section order and links | Identical at all three sizes (12 sections; every `href` the same). |
| Typography | All 267 text elements outside the showcase identical in font family, size, weight, letter-spacing, line height and colour, at 1440 px and 390 px. |
| Palette and logo | No colour token changed; mint stays `#00ec97`; the logo files are untouched. Mint is used for light and borders, never as body text on white. |
| Landing tests | `landing.spec.ts`: 17 of 17 passed against the production build, including the three showcase tests, five widths without horizontal overflow, every link and call to action, keyboard focus, mobile menu, no-JavaScript rendering and the honest-content checks. |
| Other checks | Web unit tests 9 passed; TypeScript clean. |
| JavaScript on `/` | 155 KB transferred (the live page: 159 KB). |
| Layout shift | CLS 0.0000 across load, scroll and the full film (desktop, and with 4× CPU throttling). |
| Smoothness (headless Chromium, software rendering) | Before the film 60 fps; during the film 50–53 fps with a 16.7 ms median frame and 1–4 isolated 50 ms frames per run; after it settles, with the ambient loops running, 60 fps. |
| Console | No errors at 1440, 768 and 390 px or under reduced motion. |

Screenshots in `docs/ui-review/`: `motion-before-{1440,768,390}-full.jpg` and `motion-after-{1440,768,390}-full.jpg`, `motion-journey-beats.png` (six moments), `motion-journey-mid.png` (beat B: the fanned sealed quotes), `motion-journey-final.png` (final frame), `motion-journey-phone-tablet.png`, `motion-journey-reduced.png`, `motion-hero-before-after.png`, `motion-cta-states.png`.

## How the references were used

- **Reference 1** (floating product cards): the layered-depth composition — a central device (the plate) with cards orbiting it at different depths, scales and rotations, arriving from far behind, floating, then settling; the fanned sealed quotes, the docking requirement chips and the depth entries of the approval and escrow cards. Not its pastel palette, shopping content or devices.
- **Reference 2** (security / lock network): the secure-network backdrop — nodes, padlocks and data paths with light pulses travelling along them, padlocks that snap shut, a scanning line, drawn light paths and a shield at the end of the flow. Not its blue server-rack imagery or padlock clutter.
- **Product-card still:** cards emerging at differing depths from one interface, rebuilt as procurement UI from the page's own components.

## Known limitations

- Frame pacing was measured in headless Chromium without a GPU, which is a conservative proxy; real browsers with GPU compositing should do at least as well. Safari was not tested on a device.
- The story plays once per page load and ends on a settled frame; only the subtle ambient loops continue while the section is on screen.
- On phones and tablets the requirement chips are left out and the camera move is gentler, so the scene is simpler than on desktop.
- On desktop the first sealed quote's subtitle is partly covered by the second while they orbit; the fan keeps every card's title readable.
