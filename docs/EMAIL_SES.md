# Email notifications (and switching on AWS SES)

The app already sends notifications; by default it only **logs** them (console + **Admin → Emails**). Switching to real email is configuration only: no code changes.

## What gets sent

| When | To | Subject starts with |
| --- | --- | --- |
| A step opens (submit, next step, resubmit) | The approver(s) now holding it (or their delegate) | "Approval needed:" |
| An amendment needs re-approval | Only the affected approvers | "Amendment to approve:" |
| Returned / rejected | Student | "Returned for changes:" / "Rejected:" |
| Amendment returned / rejected | Student (earlier version still valid) | "Amendment returned:" |
| Sealed on chain (first time only) | Student, with the link to the PDF | "Approved and sealed:" |
| Revoked | Student | "Approval revoked:" |
| Revoked | **Security of that department** (closes the offline gap: "sync the gate list now") | "Gate: pass revoked" |
| Past the step deadline (SLA) | The approver | "Reminder:" |
| Past twice the deadline | The approver and the next authority (coordinator → HoD, HoD → Dean, Dean → Admin) | "Escalated:" |
| Someone sets you as their delegate | The delegate | "You are covering for" |

## How it works

- Every event writes rows to the `outbox` table **in the same database transaction** as the change, so a notification is never lost and never sent for a change that failed.
- A background loop (every 5 s) delivers pending rows with the configured mailer and marks them `sent` (SES), `logged` (log mode) or retries up to 5 times before `failed`.
- Code: `apps/api/src/notify.ts`. Tests: `apps/api/test/operations.test.ts` ("email notifications", including the exact SES request).

## Settings (`.env`)

| Variable | Default | Meaning |
| --- | --- | --- |
| `EMAIL_PROVIDER` | `log` | `log` (no real email), `ses` (AWS SES) or `off` |
| `EMAIL_FROM` | `PaperLess Campus <no-reply@campus.example>` | Sender; must be a verified SES identity |
| `SES_REGION` | `ap-south-1` | SES region (falls back to `AWS_REGION`) |
| `EMAIL_REDIRECT_ALL` | empty | If set, **every** email goes to this one address (SES sandbox, demos) |

Demo profiles have placeholder addresses (`riya@campus.example`, …). For real use, put real addresses in `users.email` (for example `sqlite3 /var/lib/paperless/app.sqlite "UPDATE users SET email='hod@yourcollege.edu' WHERE id='u_kulkarni'"`), or keep `EMAIL_REDIRECT_ALL` during a demo.

## Turning on AWS SES (about 15 minutes)

1. **Pick the region** `ap-south-1` (Mumbai) in the SES console, the same region as the EC2 instance.
2. **Verify a sender identity** (SES → Identities → Create identity):
   - Quickest: **Email address** (e.g. your own Gmail). Click the link SES emails you. Use it as `EMAIL_FROM`.
   - Better: **Domain** you own. SES gives three DKIM CNAME records; add them at your DNS provider. (DuckDNS cannot hold CNAME records, so use a real domain or an email identity.)
3. **Sandbox vs production.** New SES accounts start in the sandbox: you can only send **to verified addresses**, up to 200 emails/day. For a demo: verify one inbox you control and set `EMAIL_REDIRECT_ALL` to it, so every notification lands there. For real use: SES → Account dashboard → **Request production access** (describe: transactional approval notifications to staff and students, no marketing).
4. **Give the instance permission** (no access keys on the server): IAM → Roles → Create role → *AWS service: EC2* → attach this inline policy, then EC2 → the instance → Actions → Security → **Modify IAM role** → pick it.

   ```json
   {
     "Version": "2012-10-17",
     "Statement": [
       {
         "Effect": "Allow",
         "Action": ["ses:SendEmail", "ses:SendRawEmail"],
         "Resource": "arn:aws:ses:ap-south-1:<ACCOUNT_ID>:identity/*"
       }
     ]
   }
   ```

   The AWS SDK picks up the instance role automatically. (Running elsewhere: set `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` for an IAM user with the same policy.)
5. **Configure and restart:**

   ```bash
   sudo nano /opt/paperless/.env
   # EMAIL_PROVIDER=ses
   # EMAIL_FROM=PaperLess Campus <you@yourdomain.com>
   # SES_REGION=ap-south-1
   # EMAIL_REDIRECT_ALL=you@yourdomain.com      # while in the sandbox
   sudo systemctl restart paperless
   journalctl -u paperless -n 5   # "email: ses"
   ```
6. **Test:** submit a request as Riya → Admin → Emails shows **sent**, and the email arrives. A **failed** row shows the SES error in the database (`outbox.last_error`), e.g. an unverified sender or a missing permission.

## Cost

SES charges per message sent (about $0.10 per 1,000 at the time of writing; check the SES pricing page for your region and any free-tier allowance on your account). A campus pilot sends a few hundred emails a month, so it fits inside free-tier credits. Set an AWS Budget alert as in `docs/DEPLOY_AWS.md`.

## Later

- Bounce and complaint handling: an SES configuration set → SNS topic → mark addresses as undeliverable.
- WhatsApp notifications (from the overview) can reuse the same outbox with a second mailer.
