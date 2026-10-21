# Deploy on AWS (free tier)

One small EC2 instance runs everything: Caddy (automatic HTTPS) → the PaperLess Campus API, which also serves the web app → SQLite on the instance disk → the blockchain (Polygon Amoy testnet, or a local chain on the same instance). No load balancer, no RDS and no NAT gateway: those are where free-tier bills come from.

```
phone / laptop ──https──► Caddy :443 ──► API + web app :4000 ──► SQLite + PDFs (EBS)
                                              │
                                              └──► Polygon Amoy RPC (or local chain :8545)
```

HTTPS is required, not optional: phone browsers only allow the camera (QR scanning) and offline mode (the gate) on https.

## 1. Pick the account plan and the instance

AWS changed its free tier on 15 July 2025. Check the console's "Free tier eligible" label before launching, because AWS adjusts these lists.

| Your AWS account | What you get | Instance to use |
| --- | --- | --- |
| Created **on or after 15 Jul 2025** | Up to $200 in credits (Free plan or Paid plan); eligible types include t3.micro, t3.small, t4g.micro, **t4g.small** | **t4g.small** (2 vCPU Arm, 2 GB). Room for the local chain too |
| Created **before 15 Jul 2025** (legacy free tier) | 750 hours/month of t2.micro or t3.micro for 12 months | **t3.micro** (1 GB) + swap, with **CHAIN_MODE=amoy** (no local chain) |

Region: **ap-south-1 (Mumbai)**, which is nearest for Indian campuses.

Credits are spent by anything not covered for free, including the public IPv4 address (about $0.005/hour, ~$3.6/month). On the Free plan that comes out of the credits; set a budget alert anyway (step 7).

## 2. Launch

1. EC2 → Launch instance: **Ubuntu Server 24.04 LTS** (arm64 for t4g, x86_64 for t3), the instance type above, a key pair.
2. Storage: **20 GB gp3** (inside the 30 GB free EBS allowance).
3. Security group, inbound: **22** from *your IP only*, **80** and **443** from anywhere. Nothing else; port 4000 and 8545 stay private.
4. Allocate an **Elastic IP** and associate it, so the address survives stop/start.

## 3. A free https name

Caddy gets a Let's Encrypt certificate automatically; it only needs a name pointing at the Elastic IP.

- **DuckDNS** (free): create `yourname.duckdns.org` → set it to the Elastic IP.
- Or, with no sign-up: `<ip-with-dashes>.sslip.io` (e.g. `13-233-10-20.sslip.io`). Works, but shares Let's Encrypt rate limits with everyone using sslip.io.
- A real domain works the same way (A record → Elastic IP).

## 4. Install (one command)

SSH in (or use EC2 Instance Connect), then:

```bash
curl -fsSLO https://raw.githubusercontent.com/<owner>/<repo>/<branch>/deploy/bootstrap.sh
sudo DOMAIN=yourname.duckdns.org REPO=https://github.com/<owner>/<repo>.git BRANCH=<branch> bash bootstrap.sh
```

`deploy/bootstrap.sh` does all of this:

- 2 GB swap (so `npm ci` and the build fit in 1–2 GB of RAM), swappiness 10.
- Node 20, Caddy, sqlite3, unattended security updates.
- A locked-down `paperless` system user; code in `/opt/paperless`; data in `/var/lib/paperless`.
- `.env` with a random `JWT_SECRET`, `NODE_ENV=production`, `TRUST_PROXY=1`, `PUBLIC_BASE_URL=https://<DOMAIN>` (printed into every QR).
- `npm ci && npm run build`.
- systemd services `paperless` (API + web app, memory-capped, hardened) and `paperless-chain` (local chain, only if `CHAIN_MODE=local`). Both restart on failure and on boot.
- Caddy with automatic HTTPS, zstd/gzip compression and HSTS (`deploy/Caddyfile`).
- A nightly backup at 02:30 (`deploy/backup.sh`).

Then load the demo starting point:

```bash
sudo -u paperless bash -c 'cd /opt/paperless && set -a && . ./.env && npm run seed:demo'
```

Open `https://yourname.duckdns.org` and sign in with any profile, PIN 1234.

## 5. Choose the chain

| | `CHAIN_MODE=amoy` (recommended in the cloud) | `CHAIN_MODE=local` |
| --- | --- | --- |
| What | Polygon Amoy public testnet | Hardhat node on the same instance |
| Proof | Public: every seal has a polygonscan link | Only visible through the app |
| RAM | Nothing extra | ~250–400 MB extra (use t4g.small) |
| Setup | A test wallet with free test POL from a faucet | None |
| If it restarts | n/a | The API redeploys the contract and replays every seal and revocation automatically |

For Amoy: create a **new wallet used only for this** (never a real-money key), fund it from a Polygon Amoy faucet, then edit `/opt/paperless/.env`:

```
CHAIN_MODE=amoy
AMOY_PRIVATE_KEY=0x...
```

```bash
sudo systemctl disable --now paperless-chain
sudo systemctl restart paperless
curl -s https://yourname.duckdns.org/api/health   # shows network "amoy" and the contract address
```

The first seal deploys the contract and remembers its address in the database. If the RPC is down, seals and revocations queue and are retried every 5 seconds; verify never claims "Verified" before a seal is on chain.

## 5b. Email (AWS SES)

Notifications are logged (Admin → Emails) until you switch on SES: verify a sender, give the instance an IAM role allowed to `ses:SendEmail`, set `EMAIL_PROVIDER=ses` and `EMAIL_FROM` in `.env`, restart. Step by step, including the sandbox and `EMAIL_REDIRECT_ALL` for demos: `docs/EMAIL_SES.md`.

## 6. Day to day

| Task | Command |
| --- | --- |
| Logs | `journalctl -u paperless -f` |
| Health | `curl -s https://<DOMAIN>/api/health` |
| Update to the latest code | `sudo bash /opt/paperless/deploy/update.sh` |
| Reset the demo | Admin → Reset demo, or the seed command above |
| Restart | `sudo systemctl restart paperless` |

## 7. Cost guard rails (do these once)

- **Billing → Budgets**: a $1 monthly cost budget with an email alert. On the Free plan, also watch the credits balance.
- **Billing → Free tier**: see usage against the free allowances.
- Stop the instance when it is not needed for a while (the Elastic IP is still billed while the instance is stopped, so release it if you stop for weeks).
- Avoid: load balancers, NAT gateways, RDS, extra Elastic IPs, and large EBS snapshots; none are needed here.

## 8. Backups

`deploy/backup.sh` runs nightly: a consistent SQLite copy (`sqlite3 .backup`) and a tarball of the sealed PDFs in `/var/backups/paperless`, kept 14 days.

- Off-instance copy: create an S3 bucket, attach an instance role allowing `s3:PutObject` on it, install the AWS CLI, and add `BACKUP_S3_BUCKET=<bucket>` to `/etc/environment`. The script then uploads each night.
- Or use **EC2 → Lifecycle Manager** for a daily snapshot of the 20 GB volume, keeping a few days.

Restore: stop `paperless`, copy a backup over `/var/lib/paperless/app.sqlite`, untar the storage, start again. The chain does not need restoring: hashes already on chain stay valid.

## Why this setup is cheap and fast

- **One process serves everything**: the API serves the built web app on the same port; no separate web server, CDN or container runtime.
- **Caddy** handles TLS, renewals, HTTP/2 and compression with a 6-line config.
- **SQLite on local disk**: no database server, no network hop, backups are one file.
- **Long cache on hashed assets** (`immutable`, one year) and no-cache on `index.html` and `sw.js`, so phones download the app once and updates still arrive.
- **Service worker** keeps the app shell on the phone; the gate keeps working with no network.
- **Memory caps and swap** keep a micro instance stable; the server runs without an npm wrapper process.
- **Amoy instead of a local node** in the cloud removes the biggest memory user.

## Security checklist

- SSH only from your IP (or EC2 Instance Connect); no password logins.
- `.env` is `chmod 600`, owned by the service user; `JWT_SECRET` is random; the API refuses to start in production without it.
- Services run as an unprivileged user with `ProtectSystem=strict`, `NoNewPrivileges`, private /tmp.
- Only 80/443 are public; the API and chain listen on localhost.
- Unattended security updates are on.
- The demo PIN (1234) is for demos only: change PINs (or put real sign-in in front) before real use.

## Live deployment (ap-south-1)

Created entirely with the AWS CLI; the instance installs itself on first boot (user data runs `deploy/bootstrap.sh`, switches email to SES and seeds the demo; log in `/var/log/paperless-setup.log`).

| Resource | Value |
| --- | --- |
| URL | https://13-205-194-159.sslip.io |
| Instance | `i-0f226b2f18ae18e70`, t4g.micro (Arm, 1 GB + 2 GB swap), Ubuntu 24.04, CPU credits **standard**, IMDSv2 only |
| Disk | 12 GB gp3, deleted with the instance |
| Elastic IP | 13.205.194.159 (`eipalloc-0ab7268f5d10f2afa`) |
| Security group | `sg-0049400ba7c62bb38` (`paperless-sg`): 80/443 public, 22 from the admin IP only |
| SSH key pair | `paperless-key` (private key `~/.ssh/paperless-key` on the admin machine) |
| IAM | role + instance profile `paperless-ec2`, inline policy `ses-send` (`ses:SendEmail`, `ses:SendRawEmail` only) |
| SES | identity `csiddhesh3011@gmail.com` (sandbox; `EMAIL_REDIRECT_ALL` sends every notification there) |
| Chain | `CHAIN_MODE=local` (Hardhat on the instance) |

SSH: `ssh -i ~/.ssh/paperless-key ubuntu@13.205.194.159`. If your IP changes, update the port-22 rule:
`aws ec2 authorize-security-group-ingress --group-id sg-0049400ba7c62bb38 --protocol tcp --port 22 --cidr <your-ip>/32`.

Cost (from Free plan credits, Mumbai prices): instance ~$6/month, public IPv4 ~$3.6/month, disk ~$1/month, SES $0.10 per 1,000 emails. Nothing else is billed: no load balancer, NAT, RDS, snapshots or CloudWatch extras. Standard CPU credits mean bursts are throttled, never charged.

Teardown (stops all charges):

```bash
aws ec2 terminate-instances --instance-ids i-0f226b2f18ae18e70
aws ec2 wait instance-terminated --instance-ids i-0f226b2f18ae18e70
aws ec2 release-address --allocation-id eipalloc-0ab7268f5d10f2afa
aws ec2 delete-security-group --group-id sg-0049400ba7c62bb38
aws ec2 delete-key-pair --key-name paperless-key
aws iam remove-role-from-instance-profile --instance-profile-name paperless-ec2 --role-name paperless-ec2
aws iam delete-instance-profile --instance-profile-name paperless-ec2
aws iam delete-role-policy --role-name paperless-ec2 --policy-name ses-send
aws iam delete-role --role-name paperless-ec2
aws sesv2 delete-email-identity --email-identity csiddhesh3011@gmail.com --region ap-south-1
```
