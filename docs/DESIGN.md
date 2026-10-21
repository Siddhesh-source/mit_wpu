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
| Login | /login | Profile card → PIN pad | `pages/Login.tsx` |
| Student home | /student | New request (+ my requests list with "With: role (since)") | `pages/StudentHome.tsx` |
| New request | /student/new | Type tile → form → Submit for approval | `pages/NewRequest.tsx` |
| Request page | /requests/:id | Returned: Edit and resubmit · Approved: Download PDF (enabled in prompt 4) | `pages/RequestPage.tsx` |
| Amend | /requests/:id/amend | Prefilled form, changed fields tagged, reason, live "Goes back to: … · Kept: …" preview → Send amendment | `pages/AmendPage.tsx` |
| Approver inbox | /inbox | Review next (n) → phone card: Approve / Return / Reject → sheet with comment + PIN; auto-advances; "All clear" at zero | `pages/Inbox.tsx` |
| Gate | /gate | Scan pass (prompt 9); secondary link to inbox, since Security is also an approver | `pages/Home.tsx` |
| Admin | /admin | All requests (prompt 10) | `pages/Home.tsx` |
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
