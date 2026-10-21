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

Mobile-first, `max-w-md` column, big tap targets, no nested menus, no modals except a bottom confirm sheet. Shared classes: `.cta` (primary button), `.link`.

| Screen | Route | Central CTA |
| --- | --- | --- |
| Login | /login | Profile card → PIN pad |
| Student home | /student | New request |
| Approver inbox | /inbox | Review next (n) |
| Gate | /gate | Scan pass |
| Admin | /admin | All requests |
| Verify (public) | /verify | Scan QR |
