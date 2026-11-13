# Landing page — motion and luminosity upgrade

Built 2026-11-13 from `VeilProcure_Premium_Motion_Director_Prompt.md`, `CLAUDE_CODE_PROMPT.md`, `START_HERE.md` and the supplied reference frames (two animation contact sheets and the floating product-card still). A surgical pass on the approved page: no new section, no copy, font, palette, logo, layout or order change.

## The enhanced section

**08 · Inside the workspace — "From request to receipt, in one place."** (`#journey`). It is the page's mid-point workflow showcase, between *Roles* and *How it works*, and it was the least animated part of the page: a static window of grey placeholder rows with four labels drifting slightly on scroll. Its window (≈ 980 × 405 px) already had the space for a short story, and its four existing labels — *Sealed bid*, *Comparison*, *Approval*, *Receipt* — map one-to-one onto the four beats the brief asks for.

The window now plays a nine-second, play-once film (`components/site/journey-film.tsx`):

| Beat | Time | What happens |
|---|---|---|
| A · The request | 0–2 s | "Request for quotation" assembles at the centre, rows (Scope, Hard requirements, Price ceiling, Bid deadline, Scoring weights) settle in, one mint light edge travels round the card, and "Rules published" appears. |
| B · Sealed bids | 2–4 s | Three "Sealed quote" cards (Supplier 1–3; contents masked) arrive from depth with small rotation and scale, settle into a stack, connect to the request by drawn light paths, and their padlocks close. |
| C · Evaluation | 4–6.4 s | The quotes flow down into the comparison and fade; the existing rows ("Commitment verified", "Eligible", "Rule not met") appear in sequence, a mint scan line passes over them, and "AI notes · advisory" lights. |
| D · Buyer-controlled payment | 6.3–9 s | "Buyer approval — Signed in your wallet" and "Escrow — Held by the contract · NEAR testnet" arrive; light paths connect comparison → approval → escrow; a shield settles on the escrow card. The sidebar moves from *Requests* to *Transactions*. |

The four existing labels light in turn at their beat (2.7 s, 4.9 s, 6.9 s, 8.3 s). The film ends on a stable final frame; afterwards only a soft ambient glow breathes behind the escrow card.

**Honesty.** Generic labels only — no supplier names, amounts, hashes, balances, "Paid" or "Confirmed". The escrow card says *Held by the contract*, not "released only when you approve" (the contract also lets the supplier claim after the review window). The AI label says *advisory*. The caption "Illustration of the workspace — not live data." is unchanged.

**Behaviour.** Starts when the window is a third visible; pauses off screen and resumes; plays once per visit; no scroll hijacking, pinning or spacer. A ≤1.5° tilt follows the pointer on desktop only (fine pointer, ≥1024 px). Under 560 px of window width the beats replace one another in the same box with legible 12 px type. With `prefers-reduced-motion` (or without JavaScript) the complete final frame is shown, still. The animated layer is `aria-hidden`; the figure keeps its label and caption, and the four labels stay as text.

## The finishing pass (whole page)

Layered mint light — crisp edge, restrained halo, soft bloom — on one or two focal points per viewport; glyphs are never blurred.

- **Buttons:** a specular light pass on hover, a mint edge on the dark primary and a lit top edge on mint buttons, a resting mint halo on the primary call to action, a glowing focus ring, and a press state.
- **Hero:** the underline under "Less exposure." is lit, the stage glow is slightly richer, the dark "Payment approval" card has a mint edge light, and the overline dot glows.
- **Cards:** a top hairline highlight and a tighter contact shadow under the existing depth; the evidence cards get a mint edge on hover.
- **Dark band:** the sweep line glows, the three module icons carry an edge light, and the modules light their edge on hover.
- **Security icons and dark chips** carry a faint edge light.
- The hero's looping float now pauses while the hero is off screen.

## Files changed

| File | Change |
|---|---|
| `apps/web/src/components/site/journey-film.tsx` | New client component: the window, the film (Web Animations API: transform, opacity and SVG stroke offsets) and the four labels. |
| `apps/web/src/app/page.tsx` | The static `#journey` figure is replaced by `<JourneyFilm />` (same heading, labels and caption). |
| `apps/web/src/components/site/site.css` | Film styles (final frame as resting state, phone layout via a container query) and the finishing pass. Orbit labels are `position: relative` on small screens so their glow can anchor. |
| `apps/web/src/components/site/motion.tsx` | Pauses the hero's looping animations while it is off screen. |
| `tests/e2e/specs/landing.spec.ts` | Two tests: the film plays once and settles inside its window without claiming a payment; reduced motion shows the complete final frame without animating. |

No new dependency: GSAP and Framer Motion are not in the project, so the film uses the browser's own Web Animations API.

## Verification (2026-11-13, local)

| Check | Result |
|---|---|
| Page height, before (live site) → after (local production build) | 1440 × 900: 11,330 → 11,330 px; 768 × 1024: 12,414 → 12,415 px; 390 × 844: 15,659 → 15,658 px (sub-pixel rounding). `#journey`: 1,011 → 1,011 / 961 → 961 / 1,276 → 1,274 px. |
| Section order and links | Identical at all three sizes (12 sections; every `href` the same). |
| Typography | All 267 text elements outside the showcase identical in font family, size, weight, letter-spacing, line height and colour, at 1440 px and 390 px. |
| Palette and logo | No colour token changed; mint stays `#00ec97`; the logo files are untouched. Mint is used for light and borders, never as body text on white. |
| Landing tests | `landing.spec.ts` 16 tests: 15 passed in the full run; "reduced motion: everything is visible" timed out waiting for the development server's network-idle state during that run and passed when rerun alone (3.3 s). Includes the two new film tests, five widths without horizontal overflow, every link and call to action, keyboard focus, mobile menu, no-JavaScript rendering and the honest-content checks. |
| Other tests | `offchain.spec.ts` "public pages are honest and reachable" passed; web unit tests 9 passed; TypeScript clean. |
| JavaScript on `/` (production build) | 155 KB transferred (the live page: 159 KB), so the film adds no meaningful weight. |
| Layout shift | CLS 0.0000 across load, scroll and the full film. |
| Smoothness (headless Chromium, software rendering) | Section before the film 60 fps; during the film 55 fps, no frame over 50 ms; after it settles 61 fps (live page, same section, static: 60 fps). An earlier version ran at 33 fps because SVG drop-shadow filters on animated strokes repainted the whole stage each frame; the filters were removed. |
| Console | No errors at 1440, 768 and 390 px or under reduced motion. |

Screenshots in `docs/ui-review/`: `motion-before-{1440,768,390}-full.jpg` and `motion-after-{1440,768,390}-full.jpg`, `motion-journey-beats.png` (six moments), `motion-journey-mid.png` (beat B mid-animation), `motion-journey-final.png` (final frame), `motion-journey-phone-tablet.png`, `motion-journey-reduced.png`, `motion-hero-before-after.png`, `motion-cta-states.png`.

## How the references were used

- **Reference 1** (floating product cards): the layered-depth composition — a central object with cards arriving at different depths, scales and rotations, then settling; the stacked sealed quotes and the depth entries of the approval and escrow cards. Not its pastel palette, shopping content or devices.
- **Reference 2** (security / lock network): the protected-flow metaphor — light paths that draw between nodes, padlocks that close, a scanning line and a shield at the end of the flow. Not its blue server-rack imagery or padlock clutter.
- **Product-card still:** cards emerging at differing depths from one interface, rebuilt as procurement UI from the page's own components.

## Known limitations

- Frame pacing was measured in headless Chromium without a GPU, which is a conservative proxy; real browsers with GPU compositing should do at least as well. Safari was not tested on a device.
- The film plays once per page load (by design: a settled end frame, no perpetual loop).
- The phone layout replaces the depth stack with cross-fades in the same box, so it is simpler than desktop.
- The specular light pass on buttons is deliberately subtle.
