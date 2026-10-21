# Design audit and improvement spec

Audit of the web app on 2026-10-21 (local production build, seeded demo; desktop 1440 and phone 390, light and dark). Screens: sign-in, public verify, staff dashboard, People, History, request page, student home, New request, Send a document, My teachers.

Surface type: **app UI (operate)**. People come to finish a task: sign, submit, check. Scanability beats expression; the brand lives in the details.

## Scores

| Category | Grade | Why |
| --- | --- | --- |
| Visual hierarchy | C | Two equal-weight CTAs on the student home; a disabled primary button is the focal point of an idle dashboard; section headings are small grey labels |
| Typography | B− | One family (Public Sans) with a clean scale, but uppercase tracked labels on every tile and headings that look like captions |
| Spacing and layout | C | Everything is a bordered rounded card (hero, tiles, side panels, cards inside cards); the request page's "Revoke approval" collides with the discussion box; page subtitles hug their titles |
| Color and contrast | B | Good token system and dark mode; zeros are painted red, orange or green, so "0 rejected" reads as an alarm |
| Interaction states | C− | No visible keyboard focus ring anywhere except the theme switch; large disabled buttons ("Nothing to review", "Send to…", "Create class") sit on screen as dead weight; several targets under 44 px |
| Responsive | B− | Layouts stack sensibly, but the phone header loses the product name and the scrolling nav row has no hint that it scrolls |
| Content | C+ | Instruction paragraphs under every heading; a Quick links card that repeats the top bar; History stat tiles repeat the filter counts; form fields with the placeholder as the only label |
| AI slop | C | Emoji in filled circles as the sign-in icons; a text arrow "↑" as the upload icon; a mosaic of identical stat cards with tracked caps labels; a uniform grid of identical request-type cards; dashed boxes everywhere |
| Motion | B | Little motion, nothing gratuitous |
| Performance feel | A | One small bundle, instant navigation |

**Design score: C+ · AI slop score: C** ("tidy template, no point of view yet").

## Findings (most severe first)

| # | Impact | Finding | Where |
| --- | --- | --- | --- |
| 1 | High | No keyboard focus indicator on buttons, links or tabs (`outline: none` from the reset, no `:focus-visible` replacement) | all pages |
| 2 | High | Emoji used as product icons (🎓 🏛️) inside filled circles; text glyph "↑" as the upload icon | sign-in, drop zones |
| 3 | High | Idle dashboard's focal point is a disabled primary button ("Nothing to review") | staff dashboard |
| 4 | High | Two CTAs of equal weight on the student home (New request / Send a document), against the one-central-CTA rule | student home |
| 5 | High | Dashboard built from stacked cards: hero card, four stat cards, three side cards, and cards nested inside the People card | staff dashboard, student home |
| 6 | Medium | "Revoke approval" sits directly under the discussion input with no separation; the signed PDF download, the main action of a signed request, is a plain text link | request page |
| 7 | Medium | Stat tiles: uppercase tracked labels, every number coloured regardless of meaning (red 0, orange 0) | dashboards, History |
| 8 | Medium | Section headings are 14 px grey, smaller than body text, and sit closer to the previous section than to their own content | all pages |
| 9 | Medium | Dead disabled buttons always visible ("Send to…" with no selection, "Create class" with an empty name) | student home, People |
| 10 | Medium | History repeats the same four counts twice (tiles and filter chips) | History |
| 11 | Medium | Quick links card duplicates the top bar (Verify, History, Profile) | staff dashboard |
| 12 | Medium | Request types are six identical cards in a grid; the type that matters most is just another box, and the chain is hidden until you open one | New request |
| 13 | Medium | Placeholder as the only label ("Note for the recipient (optional)", search fields) | Send a document |
| 14 | Medium | Phone header shows only the logo square (no product name); nav row scrolls with no edge hint | all signed-in pages, phone |
| 15 | Polish | Everyone's avatar is the same blue circle; department names truncated mid-word ("Computer Science and En…") | person blocks |
| 16 | Polish | Page subtitles 0 px below the title; inconsistent gaps between sections (24 / 32 / 40 px) | all pages |
| 17 | Polish | Dashed borders used for empty states, drop zones and the custom-request card alike, so dashed stops meaning "drop here" | several |

## Spec: how to fix it

### 1. Foundations (`index.css`, `components/ui.tsx`)

- **Focus:** `:focus-visible { outline: 2px solid rgb(var(--accent)); outline-offset: 2px; border-radius: 6px }` for every interactive element. `::selection` tinted from the accent.
- **Section heading:** one `SectionHead` style: `text-base font-semibold text-ink`, 32 px above, 12 px below. No grey caption headings.
- **Page header:** a `PageHeader` component with title (`text-2xl md:text-3xl font-bold`), optional subtitle (`mt-1 text-sm text-muted`, one sentence) and an optional action on the right; 32 px below.
- **Spacing scale:** sections 32 px apart (`gap-8`), items in a list 8 px, inside a block 12–16 px. Nothing else.
- **Radius scale:** controls 12 px (`rounded-xl`), surfaces 16 px (`rounded-2xl`); no 24 px (`rounded-3xl`) except dialogs.
- **Dashed border means "drop a file here"** and nothing else. Empty states use a quiet panel.

### 2. Icons (`components/Icon.tsx`)

- One small line-icon set drawn on a 24 px grid, 1.75 px stroke, round caps, `currentColor`, `aria-hidden`. Names: `home`, `inbox`, `users`, `history`, `shield` (verify), `scan` (gate), `plus`, `upload`, `send`, `student`, `building`, `chevron-right`, `check`, `clock`, `search`, `file`.
- Icons appear only where they help scanning: top-bar destinations (16 px), the two sign-in choices, the upload zone, empty states, and the list of request types. No icons in coloured circles; an icon sits in the text colour, or in an `accent/10` tinted square when it labels a choice.

### 3. Stat strip instead of stat cards

- Replace the four separate stat cards with one **stat strip**: a single bordered row, divided by hairlines, each cell a sentence-case label (`text-xs text-muted`), a tabular number (`text-2xl font-bold tabular-nums`) and an optional hint.
- Colour a number only when it asks for action and is non-zero (waiting > 0 → accent, needs your action / reminders > 0 → warn). Zeros are ink.

### 4. Staff dashboard

- **Idle state:** no disabled button. A single line with a green check, "All clear. Nothing is waiting for your signature.", and the stat strip.
- **Busy state:** the hero keeps **Review next (n)** as the only filled button.
- Sidebar becomes plain sections separated by hairlines (no cards): *Away from campus?* (one line + text button), *People* (two count rows that link to People), no Quick links (the top bar already has them).

### 5. Student home

- One filled CTA: **New request**. "Send a document" becomes a secondary outlined button of normal size beside it, not a twin.
- Stat strip as above.
- "Send to…" appears only when documents are selected.

### 6. Request page

- **Download signed PDF** is a filled button when the request is signed; "Signed on chain · v1 · hash" sits under it as a status line.
- Destructive actions (Revoke approval) move to their own row at the bottom of the details column, separated by a hairline and 24 px of space, never touching a form.

### 7. History

- Drop the stat cards; the filter tabs already carry the counts. Keep search and Export CSV in the header row.

### 8. New request

- A vertical list of rows instead of a card grid: icon, name, one-line description, and "Goes to: Faculty coordinator → HoD" in small muted text, with a chevron. "Write your own request" is the first row, highlighted with the accent tint (solid, not dashed).

### 9. Sign-in

- The logo mark above the product name (same as the top bar).
- The two choices use the icon set (`student`, `building`) in an accent-tinted square, with a chevron on the right; no emoji.

### 10. Forms

- Every field has a visible label above it; placeholders only show an example.

### 11. Phone

- Product name visible next to the logo at all widths.
- The nav row fades at the right edge when it overflows.
- Every tappable control at least 44 px tall on phones (nav items, theme switch, tab buttons, link buttons in lists).

### 12. People blocks

- Avatar colour derived from the person's name (six muted hues from the token palette), students and staff still distinguishable by shape: staff square-rounded, students round.
- Department on its own line, wrapping, never cut mid-word.

## Done when

- Tab through any page: every control shows a ring.
- No emoji or text glyphs as icons anywhere.
- Idle dashboard has no disabled button; each screen has exactly one filled CTA.
- No card inside a card; stat numbers are coloured only when they call for action.
- Phone: product name visible, no target under 44 px in the top bar.

## Result (after the fixes)

| Category | Before | After |
| --- | --- | --- |
| Visual hierarchy | C | B+ (one filled CTA per screen; idle dashboard is a quiet line, busy dashboard leads with Review next) |
| Typography | B− | B+ (sentence-case labels, section headings in ink at body size, tabular numbers) |
| Spacing and layout | C | B+ (stat strip and hairline-divided sections instead of card mosaics; no nested cards; shared page header) |
| Color and contrast | B | A− (numbers coloured only when they ask for action) |
| Interaction states | C− | B+ (global focus ring; no dead buttons; send button names what is missing; 44 px targets in the bar) |
| Responsive | B− | B+ (product name and profile on phones; nav row fades at the edge) |
| Content | C+ | B (Quick links and duplicate stat cards removed; visible labels; shorter helper lines) |
| AI slop | C | B+ (no emoji or glyph icons; one hand-drawn line icon set; no identical card grids) |

**Design score: C+ → B+ · AI slop: C → B+.** Fixes landed as one commit per finding (`style(design): FINDING-…`).

Left for later: the request page still opens with a "← Back" link that duplicates the top bar on desktop; the approver review card and gate screen were not restyled in this pass.
