# VeilProcure explainer — narration script

Final film: 177.9 s. Voice: Kokoro `af_heart` (open-source neural text-to-speech, Apache-2.0, generated locally; a synthetic voice, not a human narrator). 28 lines, 390 words, 145.8 s of speech. "Veil Procure" is written as two words only so the voice pronounces it; captions read "VeilProcure".


## S1 — Hook — the procurement problem (illustration)

**0:00.50 – 0:07.75** · Quotes scattered across e-mail. Comparisons in spreadsheets. Decisions nobody can explain. And payment on trust.

**0:08.15 – 0:12.21** · VeilProcure turns that into one confidential workflow, on NEAR.


## S2 — Why it matters — the public site

**0:12.70 – 0:16.11** · Picture a small studio hiring an accessibility auditor.

**0:16.51 – 0:23.23** · It wants competing quotes kept apart, rules everyone sees up front, and payment only when the work is delivered.

**0:23.63 – 0:26.91** · Here is that whole journey, recorded live on NEAR testnet.


## S3 — Buyer set-up: sign-in, organisation, dashboard, wallet

**0:27.30 – 0:34.08** · Sign in with a one-time e-mail link, create your organisation, and bind your NEAR wallet with a signed message.

**0:35.40 – 0:39.85** · VeilProcure never holds your keys: every on-chain step is signed by you.


## S4 — The request: scope, rules, suppliers, publish on NEAR

**0:40.90 – 0:43.61** · Describe the work, the deliverables and the budget.

**0:45.30 – 0:49.64** · Set hard requirements every quote must pass, and the weights that rank the rest.

**0:50.50 – 0:52.79** · Invite suppliers, and set a deadline.

**0:53.10 – 1:00.35** · Publishing freezes these rules and anchors their hash on NEAR testnet, so the criteria can't quietly change later.


## S5 — Suppliers quote under seal

**1:00.80 – 1:05.36** · Each supplier gets a private invitation that only their e-mail can accept.

**1:05.70 – 1:14.04** · They quote price, delivery and approach, attach a proposal, and seal the bid: a salted fingerprint of the quote is recorded on chain.

**1:15.90 – 1:21.23** · Until the deadline, the buyer sees nothing, and competitors can't even open the request.


## S6 — Deadline, close and integrity check

**1:21.90 – 1:25.10** · After the chain-time deadline, the buyer closes bidding.

**1:27.10 – 1:32.96** · Every opened quote is recomputed against its fingerprint, so any change since sealing would be detected.

**1:33.50 – 1:39.49** · That proves integrity, not secrecy: quotes are encrypted at rest, and the platform holds the key.


## S7 — Evaluation: published rules, then private AI

**1:40.10 – 1:46.31** · First, the published rules: ineligible quotes are flagged, and eligible ones are ranked by the weights.

**1:46.70 – 1:49.73** · Then, if you ask, a private AI reviews the quotes.

**1:49.90 – 1:58.86** · Nothing is sent until the model's hardware attestation is verified through NEAR AI Cloud, and the signed response is checked on return.

**2:00.50 – 2:04.61** · The notes are advisory: the AI cannot award or move money.


## S8 — Award and testnet escrow funding

**2:05.10 – 2:12.91** · The buyer awards the top quote and funds the escrow with exactly that amount: 1.2 testnet NEAR, from their own wallet.

**2:15.70 – 2:21.73** · The contract now holds the funds. It can only pay the awarded supplier, or return them to the buyer.


## S9 — Delivery, release and spending controls

**2:24.30 – 2:27.90** · The supplier accepts, delivers, and anchors evidence of the work.

**2:33.10 – 2:40.13** · The buyer approves, and the contract pays the supplier: a real transaction anyone can verify on NEAR testnet.

**2:42.10 – 2:47.22** · A release by anyone else, or a second payout, is rejected by the contract itself.


## S10 — Records and close

**2:47.50 – 2:50.30** · And every step lands in a hash-chained audit trail.

**2:52.30 – 2:57.52** · VeilProcure. Private bids. Intelligent decisions. Payments under your control.
