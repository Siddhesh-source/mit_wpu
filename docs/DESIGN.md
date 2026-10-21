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
| Approver inbox | /inbox | Review next (n) → phone card: Approve / Return / Reject → sheet with comment + PIN; auto-advances; "All clear" at zero | `pages/Inbox.tsx` |
| Gate | /gate | Scan pass (prompt 9); secondary link to inbox, since Security is also an approver | `pages/Home.tsx` |
| Admin | /admin | All requests (prompt 10) | `pages/Home.tsx` |
| Verify (public) | /verify | Scan QR (prompt 5) | `pages/Verify.tsx` |

## Components (`apps/web/src/components`)

- `ui.tsx`: `Page` (header with name/back + Switch profile), `StatusPill`, `PinPad`, `Sheet` (the only overlay), `toast`/`Toaster`, `Tick`, `Cross`.
- `Timeline.tsx`: vertical role chain; same `stepNo` side by side labelled "In parallel". Dots: pending = hollow accent ring, waiting/cancelled = grey ring, approved = filled green tick, carried = outlined green tick, rejected = red cross, returned = amber.
- `FormFields.tsx`: `FormFields` (inputs from the type's field defs), `FieldList` (read-only two-column).

## Live updates

`useLive(url)` in `lib/hooks.ts` refetches every 5 s while the tab is visible and on focus, so the student timeline, request list and approver inbox update on their own without a refresh.
