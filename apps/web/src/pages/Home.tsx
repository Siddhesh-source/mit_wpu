import { Link, useNavigate } from 'react-router-dom';
import { ROLE_LABEL } from '@plc/shared';
import { useSession } from '../lib/session';

/** Role home shell: one central CTA. Real screens replace the placeholder CTA in later prompts. */
export default function Home({ cta, hint, secondary }: { cta: string; hint: string; secondary?: { to: string; label: string } }) {
  const { me, logout } = useSession();
  const nav = useNavigate();
  if (!me) return null;

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col px-4 py-6">
      <header className="flex items-center justify-between">
        <div>
          <p className="font-semibold">{me.name}</p>
          <p className="text-xs text-muted">{me.roles.map((r) => ROLE_LABEL[r]).join(' · ')}</p>
        </div>
        <button className="link" onClick={() => (logout(), nav('/login'))}>
          Switch profile
        </button>
      </header>

      <section className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
        <button className="cta w-full max-w-xs" disabled>
          {cta}
        </button>
        <p className="max-w-xs text-sm text-muted">{hint}</p>
        {secondary && (
          <Link to={secondary.to} className="link mt-4 text-base">
            {secondary.label}
          </Link>
        )}
      </section>
    </main>
  );
}
