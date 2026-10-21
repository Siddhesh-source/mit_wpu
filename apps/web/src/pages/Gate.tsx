import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import type { GateCheck, SignedRevocationList } from '@plc/shared';
import { Cross, Page, Sheet, Tick } from '../components/ui';
import { QrScanner, decodeQrImage } from '../components/QrScanner';
import { cachedList, checkAtGate, syncList } from '../lib/gate';
import { issuerKey } from '../lib/verify';

const time = (iso: string) => new Date(iso).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });
const day = (unix: number) => new Date(unix * 1000).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' });

const LOOK = {
  valid: { word: 'VALID', cls: 'bg-ok text-white', icon: 'tick' },
  not_today: { word: 'NOT TODAY', cls: 'bg-warn text-white', icon: 'bang' },
  superseded: { word: 'SUPERSEDED', cls: 'bg-warn text-white', icon: 'bang' },
  revoked: { word: 'REVOKED', cls: 'bg-bad text-white', icon: 'cross' },
  invalid: { word: 'INVALID', cls: 'bg-bad text-white', icon: 'cross' },
} as const;

function Result({ g, onNext }: { g: GateCheck; onNext: () => void }) {
  const look = LOOK[g.result];
  const p = g.payload;
  const note =
    g.result === 'not_today' && p ? `Valid only on ${day(p.vf)}` :
    g.result === 'superseded' ? 'An amended version exists. Ask for the latest pass.' :
    g.result === 'revoked' ? 'This approval was cancelled. Do not allow entry.' :
    g.result === 'invalid' ? 'Not a genuine CampusSign pass.' : null;
  return (
    <div className={`fixed inset-0 z-30 flex flex-col ${look.cls}`}>
      <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 text-center">
        <span className="grid h-28 w-28 place-items-center rounded-full bg-white/20">
          {look.icon === 'tick' ? <Tick className="h-16 w-16" /> : look.icon === 'cross' ? <Cross className="h-16 w-16" /> : <span className="text-6xl font-bold">!</span>}
        </span>
        <h1 className="text-5xl font-bold tracking-tight md:text-7xl">{look.word}</h1>
        {note && <p className="text-lg font-semibold">{note}</p>}
        {p && g.result !== 'invalid' && (
          <div className="mt-2 w-full max-w-sm rounded-2xl bg-bg/95 p-5 text-left text-ink">
            <p className="text-2xl font-bold">{p.ti}</p>
            <p className="text-base">
              {p.n} · {p.d}
            </p>
            <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
              {p.ve && (
                <div>
                  <dt className="text-faint">Venue</dt>
                  <dd className="text-base font-semibold">{p.ve}</dd>
                </div>
              )}
              <div>
                <dt className="text-faint">Date</dt>
                <dd className="text-base font-semibold">{day(p.vf)}</dd>
              </div>
              <div>
                <dt className="text-faint">Version</dt>
                <dd className="font-mono font-semibold">
                  {p.rid} · v{p.v}
                </dd>
              </div>
              <div>
                <dt className="text-faint">Check</dt>
                <dd className="font-semibold">{g.source === 'online' ? 'Online check' : 'Offline check'}</dd>
              </div>
            </dl>
            {g.result === 'valid' && g.source === 'offline' && g.stale && (
              <p className="mt-3 rounded-lg bg-warn-bg px-3 py-2 text-sm font-semibold text-warn">List not synced today. Sync when you have signal.</p>
            )}
          </div>
        )}
      </div>
      <button className="m-4 rounded-2xl bg-bg py-5 text-xl font-bold text-ink" onClick={onNext}>
        Scan next
      </button>
    </div>
  );
}

export default function Gate() {
  const [list, setList] = useState<SignedRevocationList | null>(cachedList());
  const [online, setOnline] = useState(navigator.onLine);
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState('');
  const [scanning, setScanning] = useState(false);
  const [result, setResult] = useState<GateCheck | null>(null);
  const [error, setError] = useState('');
  const [help, setHelp] = useState(false);
  const photoRef = useRef<HTMLInputElement>(null);

  const sync = useCallback(async () => {
    if (!navigator.onLine) return;
    setSyncing(true);
    try {
      setList(await syncList());
      setSyncError('');
    } catch (e) {
      setSyncError((e as Error).message);
    } finally {
      setSyncing(false);
    }
  }, []);

  useEffect(() => {
    issuerKey(); // cache the public key for offline checks
    sync();
    const id = setInterval(() => navigator.onLine && sync(), 5 * 60_000);
    const up = () => (setOnline(true), sync());
    const down = () => setOnline(false);
    window.addEventListener('online', up);
    window.addEventListener('offline', down);
    return () => (clearInterval(id), window.removeEventListener('online', up), window.removeEventListener('offline', down));
  }, [sync]);

  const onScan = useCallback(async (text: string) => {
    setScanning(false);
    setResult(await checkAtGate(text));
  }, []);
  const onCamError = useCallback((m: string) => (setError(m), setScanning(false)), []);

  const issued = list ? new Date(list.list.issuedAt) : null;
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
  const fresh = !!issued && Date.now() - issued.getTime() < 12 * 3600_000 && issued.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }) === today;

  if (result) return <Result g={result} onNext={() => (setResult(null), setScanning(true))} />;

  return (
    <Page>
      <div className={`mb-2 flex items-center justify-between gap-3 rounded-xl px-3 py-2 text-sm ${fresh ? 'bg-ok-bg text-ok' : 'bg-warn-bg text-warn'}`}>
        <span>
          <span className={`mr-2 inline-block h-2 w-2 rounded-full ${online ? 'bg-ok' : 'bg-faint'}`} />
          {issued ? `Revocation list synced ${time(issued.toISOString())} · ${list!.list.entries.length} entries` : 'Revocation list not synced yet'}
          {!online && ' · offline'}
        </span>
        <button className="font-semibold underline-offset-4 hover:underline disabled:opacity-40" onClick={sync} disabled={!online || syncing}>
          {syncing ? 'Syncing…' : 'Sync now'}
        </button>
      </div>
      {syncError && <p className="text-xs text-bad">{syncError}</p>}

      {scanning ? (
        <div className="mt-6 flex flex-col gap-4">
          <QrScanner onResult={onScan} onError={onCamError} />
          <button className="link self-center text-base" onClick={() => setScanning(false)}>
            Cancel
          </button>
        </div>
      ) : (
        <section className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
          <button className="cta w-full max-w-xs py-8 text-2xl" onClick={() => (setError(''), setScanning(true))}>
            Scan pass
          </button>
          <button className="link text-base" onClick={() => photoRef.current?.click()}>
            Scan from photo
          </button>
          <p className="max-w-xs text-sm text-muted">Works offline. Valid only on the event date.</p>
          {error && <p className="max-w-xs text-sm text-bad">{error}</p>}
          <div className="mt-6 flex gap-5">
            <button className="link" onClick={() => setHelp(true)}>
              How offline checks work
            </button>
            <Link to="/inbox" className="link">
              Approvals
            </Link>
          </div>
          <input
            ref={photoRef}
            type="file"
            accept="image/*"
            capture="environment"
            hidden
            onChange={async (e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (!f) return;
              const text = await decodeQrImage(f);
              if (text) setResult(await checkAtGate(text));
              else setError('Could not read a QR code in that photo.');
            }}
          />
        </section>
      )}

      <Sheet open={help} onClose={() => setHelp(false)}>
        <h2 className="mb-3 text-lg font-bold">How offline checks work</h2>
        <ul className="flex list-disc flex-col gap-2 pl-5 text-sm">
          <li>
            The QR holds the pass details and a <b>digital signature</b>. This phone checks the signature itself, so a fake or edited pass shows INVALID
            even with no signal.
          </li>
          <li>
            A pass is valid <b>only on its event date</b>. On any other day it shows NOT TODAY, so an old or copied pass is useless.
          </li>
          <li>
            At the start of your shift, <b>Sync now</b>. The phone keeps a signed list of cancelled and replaced passes, so anything revoked or amended
            before your sync is caught offline (REVOKED / SUPERSEDED).
          </li>
          <li>
            The one gap: a pass revoked <b>after</b> your last sync can still read VALID offline. The bar at the top shows when you last synced; if it is
            amber, sync as soon as you have signal. Staff who revoke an approval also tell the gate directly.
          </li>
          <li>When there is signal, every scan also checks the live record, and the live answer wins.</li>
        </ul>
      </Sheet>
    </Page>
  );
}
