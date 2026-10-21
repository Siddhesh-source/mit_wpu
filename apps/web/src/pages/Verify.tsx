import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import type { VerifyResult } from '@plc/shared';
import { Cross, Tick } from '../components/ui';
import { QrScanner, decodeQrImage } from '../components/QrScanner';
import { checkFile, checkHash, checkQr, type Check } from '../lib/verify';
import { ThemeToggle } from '../components/ThemeToggle';
import { fmtDate } from '../lib/hooks';

type Tone = 'ok' | 'bad' | 'warn' | 'muted';

const day = (unix: number) => new Date(unix * 1000).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' });

/** One verdict per check. Never "Verified" unless the live chain status is Active. */
function verdict(c: Check): { tone: Tone; title: string; detail: string } {
  if (c.kind === 'pass' && !c.signatureOk)
    return { tone: 'bad', title: 'Invalid QR', detail: 'This code was not issued by PaperLess Campus, or it was altered.' };
  const live = c.live;
  if (!live)
    return c.kind === 'pass'
      ? { tone: 'warn', title: 'Signature valid', detail: 'Could not reach the server to check for a newer version or a revocation. Connect and try again.' }
      : { tone: 'muted', title: 'Offline', detail: 'Connect to the internet to check this file.' };
  switch (live.status) {
    case 'verified':
      return {
        tone: 'ok',
        title: 'Verified',
        detail: live.notYetValid && live.validFrom
          ? `Matches the record sealed on chain. Valid from ${day(live.validFrom)}${live.validUntil && live.validUntil - live.validFrom < 86400 * 2 ? ' (that day only)' : ''}.`
          : 'Matches the record sealed on chain.',
      };
    case 'superseded':
      return { tone: 'warn', title: `Superseded by v${live.latest?.version ?? (live.version ?? 1) + 1}`, detail: 'This version was amended. Only the latest version is valid.' };
    case 'revoked':
      return {
        tone: 'bad',
        title: 'Revoked',
        detail: live.revokedBy
          ? `Cancelled by the ${live.revokedBy.roleLabel} on ${new Date(live.revokedBy.at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}. No longer valid.`
          : 'This approval was cancelled and is no longer valid.',
      };
    case 'expired':
      return { tone: 'warn', title: 'Expired', detail: 'Genuine, but its validity window has ended.' };
    case 'pending':
      return { tone: 'muted', title: 'Sealing in progress', detail: 'Approved, but not on chain yet. Check again in a minute.' };
    default:
      return c.kind === 'file'
        ? { tone: 'bad', title: 'Tampered', detail: 'This file does not match any sealed record. It may have been edited.' }
        : { tone: 'bad', title: 'Not found', detail: 'No sealed record matches this.' };
  }
}

const TONE: Record<Tone, { box: string; dot: string }> = {
  ok: { box: 'bg-ok-bg text-ok', dot: 'bg-ok' },
  bad: { box: 'bg-bad-bg text-bad', dot: 'bg-bad' },
  warn: { box: 'bg-warn-bg text-warn', dot: 'bg-warn' },
  muted: { box: 'bg-panel text-muted', dot: 'bg-faint' },
};


function Result({ check, onAgain, onCheckLatest }: { check: Check; onAgain: () => void; onCheckLatest: (v: VerifyResult) => void }) {
  const v = verdict(check);
  const t = TONE[v.tone];
  const live = check.live;
  const pass = check.kind === 'pass' ? check.payload : null;
  return (
    <div className="flex flex-col gap-5">
      <section className={`flex flex-col items-center gap-3 rounded-3xl px-6 py-10 text-center ${t.box}`}>
        <span className={`grid h-20 w-20 place-items-center rounded-full text-white ${t.dot}`}>
          {v.tone === 'ok' ? <Tick className="h-10 w-10" /> : v.tone === 'bad' ? <Cross className="h-10 w-10" /> : <span className="text-4xl font-bold">!</span>}
        </span>
        <h1 className="text-3xl font-bold md:text-4xl">{v.title}</h1>
        <p className="max-w-sm text-sm text-ink/80">{v.detail}</p>
        {live?.status === 'superseded' && live.latest && (
          <button className="mt-2 rounded-xl bg-ink px-5 py-3 font-semibold text-bg" onClick={() => onCheckLatest(live)}>
            Check v{live.latest.version}
          </button>
        )}
      </section>

      {(pass || (live && live.requestId)) && (
        <section className="rounded-2xl border border-rule p-5">
          <p className="font-mono text-xs uppercase tracking-wide text-faint">
            {live?.typeName ?? pass?.t} · {live?.requestId ?? pass?.rid} · v{live?.version ?? pass?.v}
            {(live?.issuer ?? pass?.c) && ` · ${live?.issuer ?? pass?.c}`}
          </p>
          {pass && (
            <>
              <p className="mt-1 text-xl font-bold">{pass.ti}</p>
              <p className="text-sm text-muted">
                {pass.n} · {pass.d}
              </p>
              <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
                {pass.dt && (
                  <div>
                    <dt className="text-xs text-faint">Date</dt>
                    <dd className="font-medium">{day(pass.vf)}</dd>
                  </div>
                )}
                {pass.ve && (
                  <div>
                    <dt className="text-xs text-faint">Venue</dt>
                    <dd className="font-medium">{pass.ve}</dd>
                  </div>
                )}
                <div className="col-span-2">
                  <dt className="text-xs text-faint">Valid</dt>
                  <dd className="font-medium">{pass.dt ? `${day(pass.vf)}, 00:00 to 23:59 IST only` : `${day(pass.vf)} to ${day(pass.vu)}`}</dd>
                </div>
              </dl>
            </>
          )}
          {live?.signers && live.signers.length > 0 && (
            <ul className="mt-4 flex flex-col gap-2 border-t border-rule pt-4">
              {live.signers.map((s) => (
                <li key={s.role} className="flex items-center justify-between gap-3 text-sm">
                  <span className="flex items-center gap-2">
                    <span className="grid h-5 w-5 place-items-center rounded-full bg-ok text-white"><Tick className="h-3 w-3" /></span>
                    {s.roleLabel}
                  </span>
                  <span className="text-xs text-muted">
                    {s.carried ? `v${s.version}, carried` : `v${s.version}`} · {fmtDate(s.signedAt)}
                  </span>
                </li>
              ))}
            </ul>
          )}
          {live?.txHash && (
            <p className="mt-4 text-xs text-faint">
              On chain ({live.network}) ·{' '}
              {live.txUrl ? (
                <a href={live.txUrl} target="_blank" rel="noreferrer" className="link font-mono text-xs">
                  view transaction
                </a>
              ) : (
                <span className="font-mono">{live.txHash.slice(0, 18)}…</span>
              )}
            </p>
          )}
        </section>
      )}

      {check.kind === 'file' && <p className="break-all text-center font-mono text-[11px] text-faint">SHA-256 {check.hash}</p>}

      <button className="cta w-full" onClick={onAgain}>
        Check another
      </button>
    </div>
  );
}

export default function Verify() {
  const [mode, setMode] = useState<'home' | 'camera'>('home');
  const [check, setCheck] = useState<Check | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const photoRef = useRef<HTMLInputElement>(null);

  const run = useCallback(async (job: () => Promise<Check | null>, notFound = 'No PaperLess Campus QR code found.') => {
    setBusy(true);
    setError('');
    try {
      const c = await job();
      if (c) setCheck(c);
      else setError(notFound);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
      setMode('home');
    }
  }, []);

  // Opening a /verify#p=... link (phone camera app) counts as a scan.
  useEffect(() => {
    const fromHash = () => window.location.hash.includes('p=') && run(() => checkQr(window.location.hash));
    fromHash();
    window.addEventListener('hashchange', fromHash);
    return () => window.removeEventListener('hashchange', fromHash);
  }, [run]);

  const onScan = useCallback((text: string) => run(() => checkQr(text)), [run]);
  const onCamError = useCallback((msg: string) => (setError(msg), setMode('home')), []);

  const again = () => {
    setCheck(null);
    setError('');
    if (window.location.hash) history.replaceState(null, '', window.location.pathname);
  };

  return (
    <div className="flex min-h-screen flex-col">
      <header className="md:border-b md:border-rule">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 pt-5 md:px-8 md:py-4">
          <Link to="/" className="text-lg font-bold">
            PaperLess Campus
          </Link>
          <span className="flex items-center gap-4 text-sm text-muted">
            Verify
            <ThemeToggle />
          </span>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-md flex-1 flex-col px-4 pb-8 pt-6 md:max-w-xl md:pt-12">
        {check ? (
          <Result
            check={check}
            onAgain={again}
            onCheckLatest={(live) => run(async () => ({ kind: 'hash', name: `v${live.latest!.version}`, hash: live.latest!.docHash, live: await checkHash(live.latest!.docHash) }))}
          />
        ) : mode === 'camera' ? (
          <div className="flex flex-col gap-4">
            <QrScanner onResult={onScan} onError={onCamError} />
            <button className="link self-center text-base" onClick={() => setMode('home')}>
              Cancel
            </button>
          </div>
        ) : (
          <section className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
            <h1 className="text-2xl font-bold md:text-4xl">Verify a document</h1>
            <p className="max-w-xs text-sm text-muted">Scan the QR on a PaperLess Campus approval, or upload the PDF.</p>
            <button className="cta mt-2 w-full max-w-xs" onClick={() => (setError(''), setMode('camera'))} disabled={busy}>
              {busy ? 'Checking…' : 'Scan QR'}
            </button>
            <div className="flex gap-5">
              <button className="link text-base" onClick={() => fileRef.current?.click()} disabled={busy}>
                Upload PDF
              </button>
              <button className="link text-base" onClick={() => photoRef.current?.click()} disabled={busy}>
                Scan from photo
              </button>
            </div>
            {error && <p className="max-w-xs text-sm text-bad">{error}</p>}
            <input
              ref={fileRef}
              type="file"
              accept="application/pdf,.pdf"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = '';
                if (f) run(() => checkFile(f));
              }}
            />
            <input
              ref={photoRef}
              type="file"
              accept="image/*"
              capture="environment"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = '';
                if (f) run(async () => {
                  const text = await decodeQrImage(f);
                  return text ? checkQr(text) : null;
                }, 'Could not read a QR code in that photo. Try again, closer and in focus.');
              }}
            />
          </section>
        )}
      </main>
      <footer className="pb-6 text-center text-xs text-faint">Hash only, no personal data on chain.</footer>
    </div>
  );
}
