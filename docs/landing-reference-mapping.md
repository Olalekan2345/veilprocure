# Landing page — reference mapping

Reference: the owner's ~37 s screen recording of **NIA Pearl** (`https://nia-pearl.vercel.app`), supplied as `reference_contact_sheet_1.jpg` (02–18 s) and `reference_contact_sheet_2.jpg` (20–34 s). The recording was scrolled by hand, so timestamps are positions on the page, not animation timings. VeilProcure takes the reference's **typography, composition and scroll-storytelling grammar**; it does not reuse NIA's mascot, illustrations, copy, code or section layouts.

## Verified from the live reference (2026-11-10)

| Property | How it was established | Used in VeilProcure |
|---|---|---|
| Typeface | Site CSS: `font-family: var(--font-manrope)`, `@font-face` Manrope (variable 200–800) + JetBrains Mono | Manrope via `next/font/google` (SIL OFL) for the public site; JetBrains Mono already in the app |
| Headline tracking | CSS `letter-spacing: -.04em` | `-0.055em` (h1), `-0.05em` (h2) at weight 800 |
| Overlines | CSS `letter-spacing: .12em/.14em`, uppercase | 11 px, `0.16em`, with a mono section number and rule |
| Easing | CSS `cubic-bezier(.65,0,.35,1)`, `(.3,.7,.4,1)` | Same two curves as `--ease-vp` / `--ease-vp-out`, plus a spring for cards |
| Motion library | Bundles reference `whileInView` / `useScroll` (Motion for React); no GSAP | CSS transitions + one small IntersectionObserver script (no animation library) |

## Section mapping

| Ref. | What the reference shows | VeilProcure section | Differentiation |
|---|---|---|---|
| 02 s | Two-column hero: giant stacked headline with an underlined final word; character card with floating chat chips | **01 Hero** — "Better sourcing. / Less exposure." with a drawn mint underline; right: original CSS/SVG *workflow illustration* (confidential request card, three sealed proposals, wallet-approval badge, closing padlock) | No mascot or imagery; labelled "Workflow illustration"; no names, amounts or hashes (placeholder dots) |
| 04–06 s | Centred huge statement that darkens on scroll; faint peripheral questions | **02 Problem** — "Comparing suppliers shouldn't mean exposing your process." word-by-word grey→ink reveal; struck-through chips "Leaked quotes", "Unclear criteria", "Uncontrolled payments" | Original statement; grey start colour keeps 3.3:1 contrast (large text) |
| 08 s | Split: heavy headline left with coloured second line, image right, small segmented progress | **03 Sealed by deadline** — "Every offer counts. None is opened early." + disclosure summary; right: request lifecycle panel with Draft → Published → Bidding → Closed segments filling in view | Panel shows real platform fields (frozen rules, chain-time deadline, salted invite leaves) |
| 10–12 s | Quote card with example chat | **04 Bids** — interactive *Before deadline / After close* illustration of the buyer's protected inbox | User-driven toggle; states what is hidden vs visible; links to the trust-boundary FAQ |
| 14 s | Two panels joined by a glowing core | **05 AI** — Sealed offers → **Verified AI** (glowing core, animated dashed connectors) → Human approval | Text describes the implemented attestation flow; links to `docs/AI_VERIFICATION.md` |
| 16–20 s | Floating product cards with chips, staggered | **06 Evidence** — four offset cards: Policy hash, Submission commitment, Eligibility rule, Approval required | Capability descriptions only; no live records |
| 22–24 s | Navy band with feature modules | **07 Control** — night-green band "AI can recommend. / Only you authorize." with three modules and a mint line sweep | NEAR-green palette instead of navy/purple |
| (18 s, 2-up) | Category cards | **08 Roles** — For buyers / For suppliers cards with real routes | Every button resolves (anchors or sign-in) |
| 26–30 s | Phone mock-up with orbiting product cards | **09 Workspace** — desktop window mock-up (real nav labels) with four orbiting cards and light parallax | "Illustration … not live data"; skeleton bars, no figures |
| 28–30 s | "Four steps." numbered rail | **10 How it works** — four-point rail that fills as the visitor scrolls; vertical on mobile | Each step links to the relevant section or sign-in |
| — | — | **11 FAQ** — six accordion answers grounded in the implementation (server can decrypt, testnet only, unaudited, retry on failed transfer) | Native `<details>`; works without JavaScript |
| 34 s | Giant closing line + two CTAs, light footer | **12 Closing** — "Better procurement starts with a private conversation." + footer with real repo, docs and contract links | Testnet and non-affiliation notices in the footer |

Navigation (00): sticky light bar that gains a border/shadow after scrolling; approved VP logo; native `<dialog>` mobile sheet (focus contained, Escape closes, focus returns).
