import { Link } from 'react-router-dom';
import { Page } from '../components/ui';

/** Role home shell: one central CTA. Real screens replace the placeholder CTA in later prompts. */
export default function Home({ cta, hint, secondary }: { cta: string; hint: string; secondary?: { to: string; label: string } }) {
  return (
    <Page>
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
    </Page>
  );
}
