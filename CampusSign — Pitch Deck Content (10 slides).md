# CampusSign — Pitch Deck Content (10 slides)

Oct 20, 2026 · @Jayesh

## Deck at a glance

Ten slides tell one story: a familiar pain, its true size, a simple fix, proof that the fix works and is trustworthy, and why it matters beyond one campus. Every slide carries one idea, one visual and one trust cue.

**Storyline arc**

1. **Hook** (slides 1 to 3): the paper chase every judge has lived through, its scale, and the forgery risk.
2. **Fix** (slides 4 to 6): submit once, route by role, sign in one tap; how it is built with no-code and AI.
3. **Proof** (slides 7 and 8): the blockchain seal, the legal basis, and why alternatives fall short.
4. **Payoff** (slides 9 and 10): impact, carbon and SDGs, then adoption and the path beyond education.

**Design system**

| Element | Choice | Why |
| --- | --- | --- |
| Primary colour | Deep indigo #1E2A5A | Reads as institutional and trustworthy |
| Verified / eco colour | Emerald #0F9D74 | The "verified" tick and every environmental number |
| Accent | Saffron #F59E0B | One highlight per slide; an Indian cue without being loud |
| Problem / tampered | Red #DC2626 | Used only on slides 2, 3 and the tampered state on slide 7 |
| Background | Off-white #F8FAFC with slate #475569 body text | Clean, prints well, projector-safe |
| Headline font | Poppins SemiBold, 28 to 32 pt | Modern and legible from the back row |
| Body font | Inter Regular, 14 to 16 pt | Neutral and compact |
| Icons | One line-icon set only (Lucide or Phosphor, both free) | Consistent stroke weight looks professional |

**Visual rules**

- Headline = a full-sentence claim, not a topic ("Approvals take days, not minutes", never "Problem").
- At most 25 words of body text per slide; numbers set large, labels small.
- Diagrams over bullets: flows, layered blocks, before/after, matrices.
- A small source line on every slide that shows a number.
- The green tick and QR motif repeat on slides 1, 4, 7 and 10 so the "verified" idea sticks.
- The hackathon timeline stays out of the deck; only the event name and team appear on the title slide.

## Slides 1 to 3: the hook

The first three slides make judges feel the pain, then show it is national in size and a trust problem, not just an inconvenience.

### Slide 1 · Title

- **Headline:** CampusSign
- **Tagline:** Every approval. One tap. Verified forever.
- **On slide:** product name, tagline, team names, college, and the event name in small type at the foot.
- **Visual:** a paper form crowded with signatures on the left, an arrow, and a phone showing "Approved" with a green tick and a QR code on the right.
- **Trust cue:** a small green "Verified on chain" badge on the phone.
- **Say:** "Every one of us has stood outside a cabin waiting for a signature. We are here to end that."

### Slide 2 · The problem

- **Headline:** One approval. Four cabins. Three days.
- **On slide:** a journey line: Student → Faculty coordinator → HoD ("absent, come tomorrow") → Dean Student Affairs → Security. A red loop marked "typo, reprint" goes back to the start. Three callouts underneath: *lectures missed*, *faculty interrupted*, *no tracking*. A footer line: "\~15 such forms per student per year".
- **Visual:** the journey as a winding path with red clock icons at each wait.
- **Trust cue:** a real photo of your own college's no-dues sheet, names blurred. Real artefacts beat stock images.
- **Say:** walk Riya's event permission in 20 seconds; end with "and this is one of fifteen forms."

### Slide 3 · Scale and the trust gap

- **Headline:** At India's scale, the paper trail is huge and impossible to verify.
- **On slide:** three number tiles: **4.50 crore** students (AISHE 2023-24) · **\~67 crore** paper approvals a year (estimate) · **1 in 20** education checks flag a discrepancy (AuthBridge 2025). Sub-line: \~200 crore sheets and at least 25,400 tonnes of CO2e a year (estimate).
- **Visual:** three large tiles; a magnifying glass over a signature on the third tile.
- **Trust cue:** every number carries its source in a footer, and estimates are marked "est."
- **Say:** "Slow is bad. Unverifiable is worse. A wet-ink signature cannot prove itself to anyone outside the campus."

## Slides 4 to 6: the fix

These slides answer "what is it, how is it built, and why is it smart" with three diagrams and almost no bullets.

### Slide 4 · The solution

- **Headline:** Submit once. The right people sign. Anyone can verify.
- **On slide:** a 5-step horizontal flow with one icon each: **Request** (pick a form, AI pre-fills) → **Route** (by role, not name) → **Sign** (one tap, OTP or Aadhaar eSign) → **Seal** (hash on blockchain) → **Verify** (scan QR). Under it, one line: "Event permissions, OD, bonafide, NOC, no-dues, LOR and more."
- **Visual:** the flow as five rounded chips joined by arrows; the last chip in emerald with a tick.
- **Trust cue:** the green tick motif returns on "Verify".
- **Say:** "Three days becomes the same day, and the paper never exists."

### Slide 5 · Architecture and tools

- **Headline:** Six thin layers, built entirely with no-code and AI tools.
- **On slide:** a stacked block diagram, each layer with its tool chips on the right: Users · Experience (Lovable / Softr) · AI (Gemini or Claude via n8n, Sarvam for Hindi and Marathi) · Workflow and identity (n8n, Supabase Auth) · Data (Supabase Postgres + Storage) · Trust (Polygon Amoy for the MVP, permissioned consortium chain at scale). A side rail: Aadhaar eSign, DigiLocker, APAAR, WhatsApp.
- **Visual:** the layer stack with the trust layer highlighted.
- **Trust cue:** a small note "No personal data on chain" beside the trust layer.
- **Say:** "No-code is a feature: a college IT cell can add a form or change an approval chain in minutes, without a vendor."

### Slide 6 · Role routing and AI in action

- **Headline:** The system knows who must sign, in what order, and helps them decide in seconds.
- **On slide (left half):** an example chain: Event permission → Faculty coordinator → HoD → Dean SA, with Security in parallel. Tags: *SLA 48 h*, *auto-escalate*, *delegate on leave*.
- **On slide (right half):** four AI cards: **Classify and auto-fill** · **Completeness check** · **2-line approver summary** · **Status chatbot in English, Hindi, Marathi**.
- **Visual:** chain diagram on the left, a phone mock of the HoD inbox showing an AI summary on the right.
- **Trust cue:** one line "AI assists, humans decide."
- **Say:** "Roles, not names, so when a HoD changes, nothing breaks."

## Slides 7 to 10: proof and payoff

The close builds trust (law, cryptography, comparison), then lands the impact and a path far beyond one campus.

### Slide 7 · The trust layer

- **Headline:** Change one character and the proof breaks.
- **On slide:** a flow: Signed PDF → SHA-256 fingerprint → written to blockchain → QR on the PDF. Then a fork: original PDF → **Verified** (emerald tick); edited PDF → **Tampered** (red cross). A row of five trust badges: *IT Act s.5: e-sign = wet ink* · *Aadhaar eSign* · *BSA 2023 s.61: e-records = paper* · *DPDP-ready, no personal data on chain* · *Same model as India's National Blockchain Framework*.
- **Visual:** the fork is the hero image; badges sit as a strip at the foot.
- **Trust cue:** the whole slide is the trust cue; keep it calm and uncluttered.
- **Say:** "A recruiter in Bengaluru can verify a NOC from Pune in two seconds, without a phone call."

### Slide 8 · Why we win

- **Headline:** Others solve one slice; we combine all five.
- **On slide:** a matrix. Rows: Paper · Google Forms + email · College ERP / Samarth · Generic e-sign tools · **CampusSign**. Columns: Role routing · AI assist · Legal e-sign · Public verification · No-code maintainable. Ticks and crosses; our row is fully ticked and highlighted.
- **Visual:** the matrix only.
- **Trust cue:** one line "Complements DigiLocker and ERPs; does not replace them."
- **Say:** "We are the everyday approvals layer that plugs into what colleges already run."

### Slide 9 · Impact and SDGs

- **Headline:** One campus saves lakhs of sheets; India saves tens of thousands of tonnes of CO2e.
- **On slide (per 10,000-student university, per year, estimates):** 1.5 lakh approvals digitised · \~4.5 lakh sheets · \~1.1 lakh student-hours · \~8,000 faculty-hours · at least 5.7 t CO2e · \~54 trees. National line: at least 25,400 t CO2e and \~2.4 lakh trees a year. SDG tiles: 4, 9, 12, 13, 15, 16.
- **Visual:** big emerald numbers on the left, six SDG tiles on the right.
- **Trust cue:** "Assumptions: 15 forms × 3 sheets per student; footprint factors from the Environmental Paper Network calculator."
- **Say:** "Every tap is a sheet not printed. At scale that is a forest."

### Slide 10 · Roadmap and future scope

- **Headline:** From one department to every institution that runs on signatures.
- **On slide (top):** four phases with gates: MVP prototype → Department pilot (*gate: admin approves*) → University rollout (*gate: turnaround halved*) → College network (*gate: 3 partner colleges*).
- **On slide (bottom):** a hub with six spokes: Government offices · Hospitals · Banks and NBFCs · Corporates · Municipal and land · Schools and boards. One line: "Special Campaign 5.0 weeded out \~19.21 lakh government files in one month."
- **Visual:** roadmap band above, hub-and-spoke below.
- **Trust cue:** pricing line "₹50 per student per year, about what the campus already spends on the paper" and "NAAC 6.2.3 counts e-governance".
- **Close:** the tagline again, the QR of a live sealed sample document, team names.

## Trust cues and visual assets

Judges trust what looks real, sourced and consistent, so authentic photos and a live QR outweigh any stock image.

**Trust cues to place across the deck**

- A source footer on every number, with "est." on every estimate.
- Legal anchors named precisely: IT Act 2000 s.5 and s.3A, Aadhaar eSign, Bharatiya Sakshya Adhiniyam 2023 s.61, DPDP Rules 2025.
- Government precedent: the National Blockchain Framework and its certificate chain.
- A privacy line wherever blockchain appears: "hash only, no personal data on chain".
- A real, scannable QR on slides 7 and 10 that opens a sealed sample document on the verify page.
- "AI assists, humans decide" wherever AI appears.

**Asset checklist**

- [ ] Photo: students waiting outside a faculty cabin on your campus (with consent, faces optional).
- [ ] Photo: a real no-dues or event-permission sheet with signatures, names blurred.
- [ ] Screenshots: student submit screen, HoD inbox with AI summary, verify page showing Verified and Tampered.
- [ ] Phone mock-up frame for those screenshots (free mock-up generators work).
- [ ] One line-icon set for all icons (Lucide or Phosphor).
- [ ] SDG tiles 4, 9, 12, 13, 15, 16, used per the UN's SDG logo guidelines.
- [ ] Diagrams: journey path (slide 2), 5-step flow (slide 4), layer stack (slide 5), role chain (slide 6), hash fork (slide 7), comparison matrix (slide 8), roadmap + hub (slide 10). All are drawn in the companion deck preview.
- [ ] No third-party logos unless brand guidelines allow; tool names in plain text are fine.

**Build and export**

- Rebuild the slides in Google Slides, Canva or PowerPoint at 16:9 using the design system above; the deck preview in chat shows every layout.
- Export as PDF with fonts embedded and keep the file small enough to upload easily.
- Check every slide at phone size; judges often open submissions on mobile.
