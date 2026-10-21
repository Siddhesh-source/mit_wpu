# Sign in place: real forms, real signatures, verifiable

## The story (FF 180, VIT Pune)

Siddhesh's group (TY-AIDS-B-G15) has to submit **FF No. 180, Project Registration & Progress Review**. Today that means printing 8 pages, finding the guide (Prof. Dr. Minal Barhate) and then the Head of Department, getting wet signatures in three boxes at the bottom of page 1, and keeping a paper copy nobody can verify.

With CampusSign:

1. **Faculty store their signature once.** On the dashboard, *My signature*: draw it, type it in a handwriting style, or upload a photo of it (the white background is removed). Prof. Barhate and Dr. Dongre each have one.
2. **The student uploads the form exactly as the university issues it** (or generates a blank VIT form from the template library) and picks who signs, in order: *Prof. Dr. Minal Barhate, signs as Guide*, then *Head of Department*.
3. **The student marks where each person signs.** A PDF editor shows every page; the student drops signature boxes for each signer. **Find sign spots** reads the form's own text ("Guide", "Project Coordinator", "Head of Department", "Signature of Guide:") and places boxes for the matching signers automatically.
4. **The guide gets it first.** Her review card shows the document with *her* boxes highlighted. She approves with her PIN; her stored signature is captured at that moment (later changes to her saved signature never alter what she signed).
5. **Then the HoD, Dr. Shital Parag Dongre.** Same, her boxes only. The student watches signatures appear in the boxes on the request page as each person signs.
6. **The signed copy is the original form**, page for page, with each signature placed exactly in its box and a small caption under it ("Digitally signed by Prof. Dr. Minal Barhate, Guide · 21 Oct 2026, 2:05 pm IST"), a one-line footer on every page (request ID, "verify at …"), and one appended **certificate page**: who signed what and when, the SHA-256 of the original upload, and the signed QR.
7. **Anyone can verify it.** Upload the signed PDF on Verify: the file's hash matches the record on chain → *Verified*. Change one byte → *Tampered*.

## What makes it different

- **Your form, not ours.** No retyping into a web form; the university's own format stays untouched, signatures land where the form asks for them.
- **The form knows where to sign.** Find sign spots reads the form; templates come with spots pre-placed.
- **A signature that proves itself.** Every stamp is tied to a PIN-confirmed approval, an Ed25519 server signature, and a hash on chain. A scanned wet signature proves nothing; this one is checkable by anyone in seconds.
- **Captured at signing time.** The signature image used is the one the person had when they approved, stored with that approval.
- **Order and delegation still work.** Signers sign one after another; a delegate signs "on behalf of" and the caption says so.

## Any PDF, not just templates

Templates are a shortcut. The same pipeline runs for **every PDF**:

- **Student, one click:** upload any PDF, pick who signs; each signer gets a box straight away (**Place signature
  boxes** puts it where the form names them, otherwise in a row at the foot of the last page). Drag to adjust, tap the
  page to add more.
- **Faculty, one click:** their box says **Sign here**; one click opens the PIN. If the document has no box for them
  (any request with a PDF attached: custom requests, event permission, bonafide…), they tap where they sign and
  approve; their box is saved with the approval.
- **Every role-based chain too:** parallel signers on one step (HoD ‖ Security) each get their own box and their
  own signature.
- **The signed copy is always the same shape:** the original PDF with signatures in their boxes, captions, footer,
  certificate page; verified on chain. A signer with no box signs on the certificate page only.

## Rules

- Signers: 1 to 6 people, in order, each with a "signs as" label (Guide, Project Coordinator, Head of Department, Class Teacher, Mentor, …). Two signers cannot share a designation in one request (send separately).
- One PDF is the document being signed; other files may ride along as attachments.
- A signer who has boxes on the document cannot approve until they have saved a signature; the review card offers to add one right there.
- Return / reject work as before (comment required). On resubmit, everyone signs again (any change to the document affects every signature).
- Signature images: PNG, transparent background, at most 300 KB, stored per user; a copy is kept per approval.
- Placement is stored as fractions of the page (top-left origin), so it survives any page size.

## VIT Pune template library

Blank forms generated in the VIT format (header, format number, tables), pre-filled from the student's profile where possible, with sign spots already placed:

| Template | Format | Sign spots |
| --- | --- | --- |
| Project Registration & Progress Review | FF No. 180 | Guide, Project Coordinator, Head of Department (page 1); Guide (review schedule, page 2) |
| Leave / On-duty application | Student leave | Class Teacher, Head of Department |
| Internship No Objection Certificate | NOC | Training & Placement Coordinator, Head of Department |
| Industrial visit consent | IV consent | Faculty in-charge, Head of Department, Dean Student Affairs |

The student fills a short form (title, dates, project details), CampusSign generates the PDF into their documents, and the send page opens with the boxes already placed. Each template's spot labels match the signer labels, so assigning signers is one tap each.

## People (AIDS department)

- **Prof. Dr. Minal Barhate**, Faculty (Guide), with a stored signature.
- **Dr. Shital Parag Dongre**, Head of Department, with a stored signature.

## Done when

- A faculty member can draw, type or upload a signature and see it on the dashboard.
- A student can upload FF 180, add Barhate (Guide) and Dongre (Head of Department), place boxes (or find them), and send.
- Barhate signs, then Dongre; the request page shows signatures in the boxes.
- The downloaded PDF is the original 8 pages with signatures in the boxes, captions, footers, plus the certificate page; uploading it on Verify says Verified.
- The template library generates the four forms with spots pre-placed.
