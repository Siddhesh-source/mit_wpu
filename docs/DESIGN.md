# Design

Follows the built deck, theme "Public Record" (`out/source/kit.py`, previews in `out/previews/`). Tokens live in `apps/web/tailwind.config.js`.

| Token | Value | Use |
| --- | --- | --- |
| bg | #FFFFFF | Page |
| panel | #F4F6F8 | Cards |
| rule | #E1E4E8 | Borders, timeline track |
| ink | #101418 | Primary text |
| muted / faint | #5A6370 / #6B7480 | Secondary text / captions |
| accent | #1D4F91 | Primary CTA, links, pending step rings |
| ok / ok-bg | #1E7A4C / #E8F3EC | Approve, Verified, sealed tick |
| bad / bad-bg | #B42318 / #FBEAE8 | Reject, Tampered, Revoked |
| warn / warn-bg | #B54708 / #FEF0C7 | Superseded, Returned, not today (added, not in deck) |

Fonts: Public Sans 400/600/700; IBM Plex Mono for IDs and hashes.

Motifs: horizontal step track with hollow accent rings and a filled green tick at the end (slide 4); vertical role chain with Security branching in parallel (slide 7); phone card with green Approve + outlined Return (slide 7).

## Rule: one central CTA per screen

Mobile-first and responsive. `Page` takes `wide`: phone = one `max-w-md` column; desktop (`md`+) = header bar (product name, person, Switch profile) and either a `max-w-xl` column (forms, single-CTA screens) or a `max-w-5xl` two-column layout (student home: CTA panel | my requests; request page and approver review: details/card | approval chain at `lg`+). Type picker is 3 across; the PIN sheet becomes a centred dialog. Otherwise: big tap targets, no nested menus, no modals except a bottom confirm sheet. Shared classes: `.cta` (primary button), `.link`.

| Screen | Route | Central CTA | File |
| --- | --- | --- | --- |
| Sign up / log in | /login | Two big choices (Student · Staff / administrator) → Sign up / Log in tabs; optional staff details folded under "More details" | `pages/Login.tsx` |
| Profile | /profile (click your name) | Save profile | `pages/Profile.tsx` |
| Send a document | /student/send | Recipient (blocks; All · Staff · Students; search; your teachers first) · documents (library + drop zone) · what is it (suggestion chips) → **Send to <name>** | `pages/SendDocument.tsx` |
| Student workspace | /student | **New request** + **Send a document**; sidebar My documents (drag and drop, select, "Send n to…"); My teachers as blocks with **Send document**; Add a teacher (search as you type, results as blocks with + Add); "n waiting for your signature"; My requests. On phones: actions, teachers, documents, search, requests | `pages/StudentHome.tsx` |
| New request | /student/new | Type tile → form → Submit for approval | `pages/NewRequest.tsx` |
| Request page | /requests/:id | Returned: Edit and resubmit · Approved: Download PDF (enabled in prompt 4) | `pages/RequestPage.tsx` |
| Amend | /requests/:id/amend | Prefilled form, changed fields tagged, reason, live "Goes back to: … · Kept: …" preview → Send amendment | `pages/AmendPage.tsx` |
| Approver inbox | /inbox | Review next (n) → phone card: Approve / Return / Reject → sheet with comment + PIN; auto-advances; "All clear" at zero | `pages/Inbox.tsx` |
| Gate | /gate | Scan pass (big) · Scan from photo · sync bar "Revocation list synced HH:MM · n entries" + Sync now · "How offline checks work" sheet · link to Approvals. Result: full-screen VALID / NOT TODAY / SUPERSEDED / REVOKED / INVALID + Scan next | `pages/Gate.tsx` |
| Admin | /admin | All requests (id, title, type, student, version, who has it, status) + Reset demo | `pages/Admin.tsx` |
| Verify (public) | /verify | Scan QR (live camera) · secondary: Upload PDF, Scan from photo. Opening `/verify#p=…` (phone camera app) runs the check directly. One full-screen verdict + details card + Check another | `pages/Verify.tsx` |

## Components (`apps/web/src/components`)

- `ui.tsx`: `Page` (header with name/back + Switch profile), `StatusPill`, `PinPad`, `Sheet` (the only overlay), `toast`/`Toaster`, `Tick`, `Cross`.
- `Timeline.tsx`: vertical role chain; same `stepNo` side by side labelled "In parallel". Dots: pending = hollow accent ring, waiting/cancelled = grey ring, approved = filled green tick, carried = outlined green tick, rejected = red cross, returned = amber.
- `FormFields.tsx`: `FormFields` (inputs from the type's field defs), `FieldList` (read-only two-column).

## Live updates

`useLive(url)` in `lib/hooks.ts` refetches every 5 s while the tab is visible and on focus, so the student timeline, request list and approver inbox update on their own without a refresh.

## Verify verdicts (`pages/Verify.tsx`, `lib/verify.ts`)

| Check | Verdict | Tone |
| --- | --- | --- |
| QR signature fails | Invalid QR | red |
| Live status Active | Verified | green |
| Live status Superseded | Superseded by vN (+ "Check vN") | amber |
| Live status Revoked | Revoked | red |
| Anchor pending | Sealing in progress | grey |
| Uploaded file hash unknown | Tampered | red |
| QR ref unknown | Not found | red |
| QR signature fine, server unreachable | Signature valid (never "Verified") | amber |

Camera note: browsers allow live camera only on https or localhost. On plain http over LAN, use the phone camera app (opens the link) or "Scan from photo" (jsQR on an image). The QR reader is `components/QrScanner.tsx` (jsQR, no other dependency).

## Amendment UI

- Sealed request (student): Download PDF (primary) + **Amend** (outlined), hidden once the event date has passed.
- Amending: amber banner "Amendment vN in review · reason; v(N-1) stays valid", the field list shows old values struck through and new ones in bold, Download v(N-1) PDF stays available.
- Returned amendment: amber banner with the approver's comment; the earlier version is still valid.
- Approver card: amber "Amendment to vN: reason" + the same struck-through diff.
- Timeline: carried approvals show an outlined green tick and "Carried from vN".

## Versions and revocation UI

- Request page: **Versions** strip "v1 Superseded → v2 Active" (`components/VersionStrip.tsx`) when there is more than one version; tap a version to see each role, person, "signed vN (carried)" and time, plus that version's hash and PDF download.
- HoD / Dean SA on a sealed or amending request: red text link **Revoke approval** (never a primary CTA) → sheet with a required reason and PIN. Toast reminds them to have Security sync the gate list.
- Revoked request: red banner "Revoked by HoD (name) on date: reason"; Amend disappears; the PDF is still downloadable as a record.
- Verify page adds **Expired** (amber) and shows "Cancelled by the HoD on date" for Revoked; Verified shows "Valid from <date> (that day only)" for a future event.

## Operations UI

- **Attachments:** "+ Add a file" (dashed) on new request, resubmit and amend; files upload immediately and show name, size, Remove. Read-only lists (request page, approver card) download with auth and show the first 8 hex of the SHA-256.
- **Approver inbox:** under the central CTA, "Approve several" (checkbox list + sticky green "Approve selected (n)" → one PIN) and "Away? Set a delegate" (sheet: colleague, from, to; current delegations with End). The card shows "You are signing for X, who is away", and Overdue / Escalated badges.
- **Timeline:** "Prof. Joshi for Prof. Kulkarni"; amber **Overdue** / red **Escalated** chips on pending steps.
- **Admin:** tabs Requests · Impact · Audit log · Emails, plus "Run deadline check" and "Reset demo".
- **Impact** (`components/ImpactDashboard.tsx`, per the dataviz skill): one hero number (approvals digitised and sealed), four stat tiles (sheets, CO2e, trees, average time to sealed; estimates labelled), one single-series horizontal bar chart of average wait per role in the deck accent (validated), values at the bar tip in ink, hover tooltip, "Show table" view, assumptions line.

## Return, reopen and discussion UI

- Returned (student): amber box with the approver's comment, or "Reopened by X (role): reason"; **Edit and resubmit**. The edit form shows a live "Goes back to: … · Kept: …" line before sending.
- Rejected: red box with the reason. For the rejecting approver, HoD or Dean: **Reopen for changes** (outlined) → sheet with the reason and PIN. The student sees "Disagree? Ask in the discussion below".
- **Discussion** (`components/Discussion.tsx`) under the request details on every request page: chat-style bubbles (own messages right, in the accent), author and role, time, a one-line box with **Send**. Refreshes every 6 s. The approver card links to it ("Discussion (n)" / "Ask the student").
- Timeline: approvals kept across a return read "Approved before the changes · still valid".

## Accounts and workspace components

- `components/PersonBlock.tsx`: avatar (accent for staff, green for students), name, designation · title, department, action slot. Used for teachers, search results, recipients and connection requests.
- `components/DocumentLibrary.tsx`: drop zone (drag over highlights), click to pick, list with select checkbox, size, "sent n×", remove.
- Header: your name links to the profile; "Log out" replaces "Switch profile".
- Inbox (staff): "Students who want to add you" blocks with Accept / Decline under the central CTA. Students reach the inbox from "waiting for your signature".
