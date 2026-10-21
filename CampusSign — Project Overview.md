# CampusSign — Project Overview

Oct 20, 2026 · @Jayesh

**One line:** CampusSign turns every signature-chasing paper form in an Indian university into a role-routed digital approval that is signed in one tap and verifiable forever on a blockchain.

**Tagline:** *No queues. No paper. No forged signatures.*

**Elevator pitch (30 seconds):** A typical student needs a faculty or HoD signature on roughly 15 different paper forms a year, from event permissions to bonafide certificates to no-dues clearances. Each one means waiting outside cabins, printing, re-printing and losing days. CampusSign lets a student pick a request type, upload the document once, and the platform routes it automatically to the right mentor, HoD, Dean or Registrar based on their role. Approvers sign from their phone; every approval is hashed onto a blockchain so anyone, from a placement cell to another college, can verify it in seconds. We start with one university and grow into an inter-college trust network.

**Context:** prepared as our idea submission for the no-code and AI hackathon at MIT-WPU, Pune. Everything below describes the product itself.

## 1. Problem statement

Indian universities still run approvals on wet-ink signatures, so 4.5 crore students and 17.32 lakh teachers spend time every week moving paper instead of learning and teaching. AISHE 2023-24, released in July 2026, counts [4.50 crore enrolled students and 17.32 lakh teachers](https://www.civilsdaily.com/news/aishe-2023-24-indias-higher-education-enrolment-reaches-4-5-crore/) across [1,289 universities and 48,246 colleges](https://www.freepressjournal.in/analysis/the-aishe-report-institutional-network-of-higher-education).

**The core problem:** a student needs a faculty, HoD, Dean or Registrar signature on around 15 kinds of paper forms in a year. Each one is printed, carried from cabin to cabin, signed, sometimes rejected for a typo, reprinted and carried again.

| Common paper form | Typical signers | What goes wrong today |
| --- | --- | --- |
| Event / club permission | Faculty coordinator, HoD, Dean Student Affairs, Security | 3 to 4 cabins visited in sequence; one absent signer stalls the event |
| On-duty (OD) / leave application | Mentor, class teacher, HoD | Attendance lost while the slip is pending |
| Bonafide / character certificate | Class teacher, HoD, Registrar office | Repeat visits; scholarship and visa deadlines missed |
| Internship / industrial-visit NOC | Guide, T&P officer, HoD | Offer letters expire while waiting |
| No-dues clearance | Library, labs, hostel, accounts, HoD | 6 to 10 signatures on one sheet, highest friction of all |
| Scholarship and fee-concession forms | Class teacher, HoD, accounts | Physical copies get lost; resubmission needed |
| Attendance condonation / exam form | Subject teachers, HoD, exam cell | Last-minute rush before exams |
| Letter of recommendation | Faculty, HoD | No tracking; student cannot see status |
| Project / research approvals | Guide, review committee, HoD | Version confusion across printed drafts |
| Hostel gate pass / late entry | Warden, parent consent | Manual registers, easy to forge |

**Why it hurts everyone:**

- **Students** lose class hours waiting outside cabins and have zero visibility on where their form is stuck.
- **Faculty** spend repetitive minutes signing near-identical forms, and are interrupted during lectures, research and evaluation.
- **Administration** has no audit trail, no analytics and no way to tell a genuine signature from a forged one.
- **The environment** pays for printing, photocopies and reprints of documents that are thrown away after one use.
- **Third parties** (companies, scholarship bodies, other universities) cannot verify a signed letter without calling the college.

**The trust gap:** a wet-ink signature gives a recruiter no way to tell a genuine NOC or LOR from a fake one. AuthBridge's 2025 background-verification report found [5% of education checks flagged discrepancies](https://cxotoday.com/press-release/authbridge-exposes-indias-hiring-red-flags/), mainly fake certificates and degrees from blacklisted institutions.

**Size of the waste (estimate to validate):** 4.5 crore students × \~15 forms a year ≈ **67 crore signature-dependent paper approvals every year**. At an assumed 3 sheets per approval (form, copies, attachments, reprints) that is roughly 200 crore sheets of paper. Both multipliers are our assumptions; a quick classmate survey (see Open questions) turns them into evidence.

**Why now:** India already has the digital rails (DigiLocker, Aadhaar eSign, APAAR ID, a national blockchain framework). What is missing is the last mile inside the campus: the everyday approval between a student and a professor.

## 2. Solution overview

CampusSign is a role-aware approval platform: the student submits once, the system knows who must sign and in what order, and every signature is sealed on a blockchain so it can never be forged or quietly changed.

**How it works in one sentence:** pick a request type → upload or auto-fill → smart routing to the right authority → one-tap e-sign → blockchain seal + QR code → verified PDF delivered to the student.

**Core features**

1. **Request catalogue.** Ready templates for every common form (event permission, OD, bonafide, NOC, no-dues, LOR, scholarship). Admins add new ones with a no-code form builder, no developer needed.
2. **Role-mapped routing engine.** Each faculty member has a role (mentor, class teacher, HoD, Dean, Registrar, warden, T&P officer). Each request type has a chain of roles, not names, so when a HoD changes, the workflow does not break.
3. **Sequential and parallel approvals.** Event permission flows step by step; no-dues goes to library, labs, hostel and accounts at the same time and completes when all approve.
4. **One-tap signing.** Approvers sign from phone or laptop with OTP. For documents that carry legal weight (bonafide, NOC, LOR), the platform can call Aadhaar eSign, which the IT Act treats as equal to a wet-ink signature.
5. **Blockchain seal.** The final signed PDF is hashed (SHA-256) and the hash, request ID, signer roles and timestamps are written to a blockchain. A QR code on the PDF opens a public verify page.
6. **Parcel-style tracking.** Students see exactly where the request sits, who has it, and since when. Notifications go out by email and WhatsApp.
7. **Deadlines and auto-escalation.** If an approver sits on a request past its SLA (for example 48 hours), it is nudged, then escalated or routed to a delegate.
8. **Delegation.** A faculty member on leave assigns a delegate for a date range, so nothing waits for someone who is away.
9. **Admin analytics.** Turnaround time per department, bottleneck approvers, paper saved and requests per month.

**The AI layer (what makes it smart, not just digital)**

- **Auto-classify and auto-route:** a student uploads a letter or types "need permission for robotics fest on 5 Nov"; AI detects the request type and fills the form.
- **Completeness check:** AI flags a missing attachment or wrong date before submission, so approvers never reject for silly errors.
- **Approver summary:** each request arrives with a 2-line AI summary and risk flags, so a HoD can approve 20 requests in minutes.
- **Ask-my-status assistant:** a chatbot answers "where is my NOC?" in English, Hindi or Marathi.
- **Smart drafting:** AI drafts bonafide certificates, NOCs and LOR outlines from templates for faculty to edit and sign.

**The network effect:** every participating college runs a node on a shared, permissioned chain. A certificate signed at one college can be verified instantly by another college, a company or a scholarship body, which is the seed of a national academic trust network.

## 3. Users and the before-vs-after journey

Four user groups touch every approval; each gets a view built for its job.

| User | Their pain today | What CampusSign gives them |
| --- | --- | --- |
| Student (Riya, 2nd-year CSE, organising a tech fest) | 3 days chasing 4 signatures; misses 2 lectures | Submits in 2 minutes, tracks live, gets a QR-verified PDF |
| Faculty / HoD (Prof. Kulkarni) | Interrupted 10+ times a day to sign slips | Batch-approves from phone with AI summaries |
| Admin / Registrar office | Physical files, no audit trail, forged signatures | Dashboard, full audit log, tamper-proof records |
| External verifier (company, scholarship body, other college) | Calls or emails the college to confirm a letter | Scans QR, sees blockchain proof in seconds |

**Riya's event permission, before and after**

| Step | Before (paper) | After (CampusSign) |
| --- | --- | --- |
| Prepare | Type, print, reprint after format errors | Pick "Event permission", AI pre-fills details |
| Faculty coordinator | Wait outside cabin | Notified instantly, approves on phone |
| HoD | Absent today, come back tomorrow | Auto-routed to delegate after SLA |
| Dean Student Affairs | Another queue, another day | Parallel step, approved in hours |
| Proof | Photocopy kept in a file | Blockchain-sealed PDF with QR |
| Elapsed time | 2 to 4 days (typical, to validate) | Same day (target) |

## 4. System architecture

The system is six thin layers: users see a simple app, AI and a rules engine do the routing, and only a fingerprint of each signed document goes on chain.

&#91;embedded content: system architecture · 6 layers + external rails\]

The trust layer is highlighted because it is the differentiator: anyone can check a document without calling the college.

**Request lifecycle (state machine):** Draft → Submitted → In review (step 1…n) → Approved, Rejected, or Returned for changes → Sealed on chain → Verified on scan. A returned request goes back to the student with the approver's comment, not to the bin.

**How role-mapped routing works**

1. The admin defines roles once (Mentor, Class Teacher, HoD, Dean SA, Registrar, Warden, Librarian, T&P Officer) and maps each faculty member to roles per department.
2. Each request type stores a chain of roles, for example *Event permission = Faculty coordinator → HoD → Dean SA*, with flags for parallel steps and SLA hours.
3. On submission the engine resolves each role to a real person using the student's department, class and division, so routing is always correct even as staff change.
4. Delegation and escalation rules re-resolve the role if a person is on leave or misses the SLA.

**What goes on chain and what stays off chain**

| Stored on chain (public, permanent) | Stored off chain (private, encrypted) |
| --- | --- |
| SHA-256 hash of the final signed PDF | The PDF itself and attachments |
| Request ID and request type | Student name, roll number, Aadhaar-linked data |
| Signer roles and timestamps | Comments, AI summaries, audit details |
| Issuing college ID (node) | Contact details |

No personal data ever touches the chain, which keeps us aligned with India's data protection law and keeps blockchain costs near zero. Verification simply re-hashes the PDF a verifier holds and checks it against the chain: any edit, even one character, changes the hash and fails.

**Inter-college network:** in the pilot, one university writes to a public EVM testnet. At scale, colleges join a permissioned consortium chain, each running a validator node, which mirrors the model India's National Blockchain Framework already uses for government certificates.

## 5. Tech stack (no-code + AI first)

Every layer is built with no-code or AI-prompted tools, so a small team can ship a working MVP in days and a college IT cell can maintain it without hiring developers.

| Layer | Primary tool | Backup | Why this choice |
| --- | --- | --- | --- |
| App front end (student, faculty, admin, verify page) | Lovable (prompt-to-app builder) | Softr or Glide | Builds a responsive web app from plain-English prompts; native Supabase connection |
| Database, login, file storage | Supabase (Postgres + Auth + Storage) | Airtable | Row-level security means a student sees only their own requests; free tier is enough for a pilot |
| Workflow and routing engine | n8n | Make or Zapier | Visual workflows for routing, SLA timers, escalation; open source and self-hostable in India |
| AI layer | Gemini or Claude API inside n8n AI nodes | OpenAI API | Classification, form auto-fill, completeness checks, approver summaries |
| Indian-language assistant | Sarvam AI models | Gemini multilingual | Hindi and Marathi chat and voice for students and staff |
| PDF generation | Google Docs templates via n8n | PDFMonkey | Turns approved data into a formatted letter with signature block and QR |
| E-signature (MVP) | OTP-verified click-sign + signature image | Drawn signature pad | Fast and enough for internal approvals |
| E-signature (production) | Aadhaar eSign through a licensed provider (e.g. Leegality, Digio) | DSC tokens for Registrar | Legally equal to wet ink under the IT Act |
| Blockchain (MVP) | Polygon Amoy testnet + a small DocumentRegistry contract (Remix / thirdweb) | Ethereum Sepolia | Free test tokens, \~2-second blocks, public explorer for live proof |
| Blockchain (scale) | Permissioned consortium chain (Hyperledger Besu / Fabric) or NBF Vishvasya APIs | — | Colleges as validator nodes; no crypto fees; government-aligned |
| Notifications | Email (Gmail node) + WhatsApp Cloud API | Telegram bot | Where Indian students and faculty actually read messages |
| Analytics | Supabase dashboard / Looker Studio | Google Sheets | Turnaround time, bottlenecks, paper saved |

**Integration roadmap (post-hackathon):** DigiLocker to push issued certificates into the student's locker, APAAR / ABC ID as the student identity key, and an API bridge to Samarth eGov or existing college ERPs so student and staff records are not entered twice.

**Why no-code is a feature, not a shortcut:** most Indian colleges have a small IT cell. A system they can change themselves (add a form, change an approval chain) in minutes is far more likely to be adopted than custom code that needs a vendor.

## 6. Methodology

We follow a design-thinking loop (empathise → define → prototype → test) and build in thin vertical slices, so a working end-to-end flow exists from the first iteration and every later iteration only adds depth.

**Phase 1: Discovery**

- Quick survey of 30 to 50 students and 5 faculty: forms per semester, hours spent, reprints, missed deadlines.
- Collect 5 real paper forms from our college (event permission, OD, bonafide, NOC, no-dues) and map their exact signer chains.
- Define 3 user journeys: student submits, HoD batch-approves, recruiter verifies by QR.

**Phase 2: Build the MVP in thin slices**

1. **Data and identity:** Supabase tables for users, roles, role assignments, request types, approval steps, requests, approvals and an audit log; institutional login.
2. **Core flow:** submit, track and approve screens; an n8n workflow resolves each role to a person and moves the request step by step.
3. **AI layer:** request classifier and auto-fill, completeness check, 2-line approver summary.
4. **Trust layer:** generate the signed PDF, hash it, anchor the hash on chain, stamp a QR code, publish the verify page.
5. **Operations:** notifications, SLA escalation, delegation, and an admin dashboard with turnaround and paper-saved counters.

**Phase 3: Pilot and measure.** One department for one semester, with a paper fallback. We track turnaround time, approvals per faculty per week, reprints avoided and sheets saved against a pre-pilot baseline.

**Phase 4: Scale.** University-wide rollout with Aadhaar eSign and DigiLocker, then partner colleges join as nodes on the consortium chain.

**Key AI prompts (our prompt strategy)**

- *App builder:* "Build a mobile-first web app called CampusSign with three roles: student, approver, admin. Students pick a request type, fill a form, upload a PDF and see a timeline of approval steps. Approvers see an inbox with Approve, Reject and Return buttons and a comment box. Use Supabase auth and the tables I describe."
- *Classifier:* "You are a university approvals assistant. From the student's text, return JSON with request\_type (one of: event\_permission, on\_duty, bonafide, internship\_noc, no\_dues, lor), event\_date, venue, purpose, and missing\_fields. Do not invent values."
- *Approver summary:* "Summarise this request for a busy HoD in at most 2 lines. Then list any risk flags (date clash, missing attachment, unusual request). Be factual."
- *Verifier explainer:* "Given this blockchain record and document hash comparison, explain in one sentence to a non-technical recruiter whether the document is genuine."

**Prompt guardrails:** every prompt returns structured JSON and is told never to invent values. AI only assists; a human approver makes every decision.

## 7. Impact and benefits

For one 10,000-student university, we estimate 1.5 lakh approvals a year moved off paper, about 4.5 lakh sheets saved and over 1 lakh student-hours given back. Every multiplier below is an explicit assumption that the pilot will measure.

| Metric (per 10,000-student university, per year) | Assumption | Estimate |
| --- | --- | --- |
| Paper approvals digitised | 15 forms per student | 1,50,000 approvals |
| Paper saved | 3 sheets per approval | \~4,50,000 sheets (\~900 reams) |
| Student time returned | \~45 min chasing per form | \~1,12,000 student-hours |
| Faculty time returned | \~2 min per paper sign vs \~20 sec digital, \~2 signers per form | \~8,000 faculty-hours |
| Turnaround per request | 2 to 4 days today | Same day (target) |
| Forged or altered approvals | Unknown and undetectable today | Detectable in seconds (hash mismatch) |

**Benefits by stakeholder**

- **Students:** no queues, live status, approvals that arrive in time for events, internships and scholarships, and a permanent verifiable record of every approval.
- **Faculty:** batch approvals from anywhere, AI summaries instead of reading every page, fewer interruptions during class and research.
- **Administration:** a complete audit trail, bottleneck analytics, accreditation-ready evidence for NAAC and NIRF documentation, and lower printing costs.
- **Employers and other colleges:** instant, zero-call verification of NOCs, LORs and certificates.
- **Environment:** fewer trees, less toner and less waste, a direct contribution to Mission LiFE and campus sustainability goals.

**Policy alignment:** Digital India, NEP 2020's push for technology in educational planning and administration, the National Blockchain Framework (launched in [September 2024 with a ₹64.76 crore budget](https://www.civilsdaily.com/?p=783300)), and the APAAR / ABC push for a single digital academic identity.

**National scale (long term):** applied to all [4.5 crore students](https://www.civilsdaily.com/news/aishe-2023-24-indias-higher-education-enrolment-reaches-4-5-crore/), the same assumptions point to \~67 crore approvals and \~200 crore sheets a year.

## 8. Environmental impact and SDGs

Removing the paper trail cuts at least 5.7 tonnes of CO2e a year at one 10,000-student university and at least 25,400 tonnes a year across Indian higher education, along with lakhs of trees and crores of litres of water. These use the sheet counts from section 7 and published paper-footprint factors.

| Footprint avoided per year | Factor per A4 sheet | One 10,000-student university (4.5 lakh sheets) | All Indian higher education (\~200 crore sheets) |
| --- | --- | --- | --- |
| CO2e, paper production only (conservative) | [12.7 g](https://www.papercut.com/help/manuals/ng-mf/common/sys-environmental-impact/) | \~5.7 tonnes | \~25,400 tonnes |
| CO2e, full life cycle incl. landfill | [\~40 g](https://helpcenter-nddorbix.ndd.tech/en/faq/Current/how-is-the-environmental-impact-indicator-calculat) | \~18 tonnes | \~81,000 tonnes |
| Trees | 8,333 sheets per tree | \~54 trees | \~2.4 lakh trees |
| Water | \~0.4 litres | \~1.8 lakh litres | \~80 crore litres |
| Energy to make the paper | 48 Wh | \~21,600 kWh | \~9.6 crore kWh |

These exclude toner, printer electricity and photocopies, so they understate the saving. The platform's own server and AI energy per approval will be measured in the pilot and reported net.

**SDG mapping**

| SDG | Target | What CampusSign changes |
| --- | --- | --- |
| 4 Quality Education | 4.3 equal access to quality tertiary education | Students spend class time learning, not queuing; remote and differently-abled students get equal access to approvals |
| 9 Industry, Innovation and Infrastructure | 9.c access to ICT | Shared digital approval infrastructure any college can join |
| 12 Responsible Consumption and Production | 12.5 substantially reduce waste generation | Single-use paper forms, copies and reprints eliminated at the source |
| 13 Climate Action | 13.3 climate education and awareness | Live "CO2 saved" counter on every campus dashboard turns each approval into climate awareness |
| 15 Life on Land | 15.2 halt deforestation | Lakhs of trees not cut every year at national scale |
| 16 Peace, Justice and Strong Institutions | 16.6 effective, accountable, transparent institutions | Every decision timestamped, attributable and tamper-proof |

**Fit with India's commitments:** Mission LiFE's call for mindful use of resources, India's net-zero by 2070 target, and green-campus and e-governance practices that institutions already report for accreditation. Every campus that adopts the platform adds to one shared, measurable total, which is how a small daily habit becomes a national climate contribution.

## 9. Feasibility and viability

Every part of this already works in India today: the law accepts e-signatures, the government already uses blockchain for certificates, and the tools we need have free tiers. What has been missing is a product that stitches them together for the everyday campus approval.

**Technical feasibility**

- All components are mature, hosted services with free or low-cost tiers; the thin-slice MVP plan in section 6 shows the core loop takes days, not months, to build.
- Blockchain cost stays flat at scale: instead of one transaction per document, we can batch an hour's hashes into a single Merkle root, so one write covers thousands of approvals.
- Government precedent: India's National Blockchain Framework already stores academic and government certificates, with [34 crore documents verified as of October 2025](https://www.shankariasparliament.com/current-affairs/mains-analysis/national-blockchain-framework-strengthening-governance-through-blockchain-technology), including CBSE certificates.

**Legal feasibility**

- Under the IT Act, 2000, [Section 5 gives recognised electronic signatures the same validity as wet-ink signatures](https://www.leegality.com/legalprimer/aadhaar-esign-enforceability), and Aadhaar eSign is a notified technique in the Second Schedule.
- [The Bharatiya Sakshya Adhiniyam, 2023 gives electronic records the same legal status as paper (Section 61)](https://www.gktoday.in/legal-validity-of-electronic-documents-and-digital-signatures/), so our signed PDFs and audit logs are admissible.
- Internal approvals (OD, event permission) need only institutional policy; we use OTP sign-off there and Aadhaar eSign for externally used documents.

**Operational feasibility**

- Faculty learn nothing new beyond an inbox and an Approve button; onboarding is a CSV upload of staff and roles.
- The admin changes forms and chains in a no-code builder, without a vendor.
- Paper fallback stays available during the pilot so nobody is blocked.

**Economic viability (assumptions to validate)**

| Item | Per 10,000-student university, per year |
| --- | --- |
| Printing cost avoided (4.5 lakh sheets at ₹1 to ₹2 per printed page) | ₹4.5 to ₹9 lakh |
| Our price at ₹50 per student per year | ₹5 lakh |
| Running cost (database, automation server, AI calls, eSign at cost) | Low single-digit lakhs, falling with scale |

The platform roughly pays for itself on paper and printing alone, before counting thousands of faculty and student hours.

**Business model**

1. **Freemium pilot:** free for one department for a semester.
2. **Campus SaaS:** per-student annual subscription, always free for students themselves.
3. **Verification network:** colleges pay a small membership to join the consortium chain as a node.
4. **Verify API:** employers and background-verification firms pay per bulk verification, which also makes the network self-funding.

**Go-to-market:** home university first, then the Pune private-university cluster, then state universities through integration with Samarth eGov, which already runs in [38 central and 13 state universities](https://kashmirlife.net/all-jk-universities-to-fully-adopt-samarth-e-gov-portal-this-year-291817/) (figure as reported in that article).

## 10. Competitive landscape and differentiation

No existing tool combines campus role-mapped routing, AI assistance and public blockchain verification for everyday approvals; each alternative solves one slice.

| Alternative | What it does well | What it misses for this problem |
| --- | --- | --- |
| Paper + wet-ink signatures | Familiar, no setup | Slow, untrackable, forgeable, wasteful |
| Google Forms + email | Free, quick to set up | No role routing, no real signature, no audit trail, no verification |
| College ERPs and Samarth eGov | Admissions, fees, HR, exams at scale | Heavy rollouts; everyday ad-hoc approvals and third-party verification are not their focus |
| Generic e-sign (DocuSign, Leegality, Zoho Sign) | Legally valid signing | No knowledge of campus roles or hierarchy; per-document pricing; no inter-college network |
| DigiLocker / NAD / APAAR | Final degrees and marksheets, national identity | Do not cover the dozens of in-semester approvals that come before a degree |
| NBF Certificate Chain | Government-grade certificate verification | Built for issued certificates, not for multi-step campus workflows |

**Our edge**

- **Role-mapped:** routes by role, not by name.
- **AI-assisted:** fewer errors, faster approvals.
- **Tamper-proof:** hash on chain, QR verify.
- **No-code maintainable:** colleges change it themselves.
- **Network-ready:** every college becomes a node.

**Positioning:** we are complementary, not competing. CampusSign is the everyday approvals layer that can later push final documents into DigiLocker and sync records with Samarth or any ERP.

## 11. Security, privacy and risks

The biggest risks are adoption and data protection, not technology; both are handled by design choices rather than promises.

**Security and privacy by design**

- **No personal data on chain:** only hashes, roles and timestamps; PDFs stay in encrypted storage.
- **Least-privilege access:** row-level security, so each user sees only what their role allows; every view and action is logged.
- **DPDP-ready:** India's DPDP Rules, 2025 were notified in November 2025 and their [core operational duties apply from May 2027](https://www.tcsa.in/resources/dpdp-rules-2025-implementation-roadmap). We build consent notices, purpose limitation, data-retention windows, breach alerts and a grievance contact in from day one, and host data in India.
- **AI guardrails:** AI drafts and summarises but never approves; a human signs every decision, and prompts forbid inventing facts.
- **Strong sign-in:** OTP or institutional SSO for approvers; Aadhaar eSign for legally significant documents.

**Risk register**

| Risk | Likelihood | Mitigation |
| --- | --- | --- |
| Faculty resist a new tool | Medium | Mobile inbox, one-tap approve, AI summaries; champion faculty in the pilot department |
| Administration insists on wet ink for some forms | Medium | Start with internal forms; use Aadhaar eSign where legal weight is needed; keep paper fallback in the pilot |
| Students without smartphones or data | Low | Works on any browser; campus kiosks; WhatsApp status updates |
| Blockchain seen as hype | Medium | Show the hash check failing on a tampered PDF; explain zero personal data on chain |
| Public testnet downtime | Low | Queue-and-retry anchoring; production runs on the permissioned consortium chain |
| Vendor or tool lock-in | Low | Open-source n8n and Postgres; standard EVM contract; data export anytime |
| AI misclassifies a request | Medium | Student confirms the detected type before submitting; admins can reroute72 |

## 12. Roadmap and future scope

We start with one department and earn each next step with measured results; the MVP is phase one, and the same engine later extends beyond education.

&#91;embedded content: roadmap · 4 phases, 3 gates\]

Each gate is a measurable target, so judges and administrators can hold us to it.

**College adoption plan**

1. **Anchor:** one department, a nodal faculty champion, and its 10 most-used forms mapped to role chains.
2. **Onboard in a day:** staff and roles by CSV upload, students log in with college email, paper fallback kept for one semester.
3. **Prove it:** publish pilot metrics (turnaround, sheets saved, CO2e avoided) to the IQAC and management.
4. **Accreditation pull:** NAAC asks institutions to show [e-governance across administration, finance and accounts, student admission and support, and examination](https://srmuniversity.ac.in/aqar/criteria6_2_3.php) (metric 6.2.3), so every digitised approval doubles as accreditation evidence.
5. **Spread:** university-wide rollout, then affiliated and partner colleges join the verification network as nodes.

**Future scope: beyond education**

Any institution where a request climbs a ladder of signatures has the same problem. In October 2025 alone, Special Campaign 5.0 across central ministries [weeded out about 19.21 lakh physical files and earned ₹387.4 crore from scrap](https://www.policyedge.in/p/government-concludes-special-campaign), which shows both the scale of paper bureaucracy and the official push to end it.

&#91;embedded content: future scope · 6 sectors on one engine\]

The engine stays the same in every sector; only the form templates and role chains change.

**Why it transfers**

- Every hierarchy has the same three parts: roles, an ordered chain of sign-offs, and a need for proof.
- Regulated sectors already accept Aadhaar eSign and DSC, so the legal layer carries over unchanged.
- The no-code builder lets each sector configure its own forms and chains without new code.
- The verification network gains value with every new issuer, from colleges to hospitals to municipal offices.

**Frequently asked questions**

- *Why blockchain and not just a database?* A database owner can silently edit records; a hash on a shared chain lets outsiders verify without trusting the college server, and it scales into a multi-college network.
- *Is an e-signature legally valid?* Yes for recognised e-signatures under the IT Act; we use OTP sign-off internally and Aadhaar eSign for external documents.
- *What about privacy?* No personal data on chain; DPDP-aligned consent and retention.
- *How is this different from an ERP?* ERPs run admissions and fees; we fix the everyday approvals and make them verifiable outside the campus, and we can plug into any ERP.

**Next steps**

- [ ] Survey 50 students and 5 faculty to replace the assumed multipliers with measured ones.
- [ ] Secure a pilot department and a nodal faculty champion.
- [ ] Map the 10 most-used forms and their exact signer chains.

## Sources

- [AISHE 2023-24 highlights: enrolment and teachers (CivilsDaily)](https://www.civilsdaily.com/news/aishe-2023-24-indias-higher-education-enrolment-reaches-4-5-crore/)
- [AISHE 2023-24 institutional network (Free Press Journal)](https://www.freepressjournal.in/analysis/the-aishe-report-institutional-network-of-higher-education)
- [AuthBridge Workforce Fraud Files 2025 (CXOToday)](https://cxotoday.com/press-release/authbridge-exposes-indias-hiring-red-flags/)
- [Aadhaar eSign legal validity under the IT Act (Leegality)](https://www.leegality.com/legalprimer/aadhaar-esign-enforceability)
- [Electronic records under the Bharatiya Sakshya Adhiniyam, 2023 (GKToday)](https://www.gktoday.in/legal-validity-of-electronic-documents-and-digital-signatures/)
- [National Blockchain Framework components and budget (CivilsDaily)](https://www.civilsdaily.com/?p=783300)
- [National Blockchain Framework: 34 crore documents verified (Shankar IAS)](https://www.shankariasparliament.com/current-affairs/mains-analysis/national-blockchain-framework-strengthening-governance-through-blockchain-technology)
- [Samarth eGov adoption (Kashmir Life)](https://kashmirlife.net/all-jk-universities-to-fully-adopt-samarth-e-gov-portal-this-year-291817/)
- [DPDP Rules 2025 implementation timeline (TCSA)](https://www.tcsa.in/resources/dpdp-rules-2025-implementation-roadmap)
- [Paper footprint factors: CO2e, trees, energy (PaperCut, from the Environmental Paper Network calculator)](https://www.papercut.com/help/manuals/ng-mf/common/sys-environmental-impact/)
- [Full life-cycle CO2e and water per page (NDD, from the Environmental Paper Network calculator)](https://helpcenter-nddorbix.ndd.tech/en/faq/Current/how-is-the-environmental-impact-indicator-calculat)
- [NAAC metric 6.2.3 on e-governance (SRM University AQAR)](https://srmuniversity.ac.in/aqar/criteria6_2_3.php)
- [Special Campaign 5.0 results (The Policy Edge)](https://www.policyedge.in/p/government-concludes-special-campaign)
