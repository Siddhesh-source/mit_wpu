import { useState, type FormEvent } from 'react';
import type { RequestComment } from '@plc/shared';
import { api } from '../lib/api';
import { fmtDate, useLive } from '../lib/hooks';
import { useSession } from '../lib/session';
import { toast } from './ui';

/** Questions and replies on a request, between the student and the people on its chain. */
export function Discussion({ requestId }: { requestId: string }) {
  const { me } = useSession();
  const { data: thread, reload } = useLive<RequestComment[]>(`/api/requests/${requestId}/comments`, 6000);
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);

  async function send(e: FormEvent) {
    e.preventDefault();
    if (!body.trim()) return;
    setBusy(true);
    try {
      await api(`/api/requests/${requestId}/comments`, { method: 'POST', json: { body } });
      setBody('');
      reload();
    } catch (err) {
      toast((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="mt-8">
      <h2 className="mb-3 text-base font-semibold">Discussion{thread?.length ? ` (${thread.length})` : ''}</h2>
      {thread && thread.length === 0 && <p className="mb-3 text-sm text-faint">Ask a question or explain a change. Everyone on this request can read it.</p>}
      <ul className="mb-3 flex flex-col gap-2">
        {thread?.map((c) => {
          const mine = c.author.id === me?.id;
          return (
            <li key={c.id} className={`max-w-[90%] rounded-2xl px-4 py-2.5 text-sm ${mine ? 'self-end bg-accent text-white' : 'self-start bg-panel'}`}>
              <p className={`mb-0.5 text-xs ${mine ? 'text-white/80' : 'text-muted'}`}>
                {mine ? 'You' : `${c.author.name} · ${c.author.roleLabel}`} · {fmtDate(c.at)}
              </p>
              <p className="whitespace-pre-wrap">{c.body}</p>
            </li>
          );
        })}
      </ul>
      <form onSubmit={send} className="flex items-end gap-2">
        <textarea
          rows={1}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Write a message"
          className="min-h-[2.75rem] flex-1 resize-none rounded-xl border border-rule px-3 py-2.5 text-sm outline-none focus:border-accent"
        />
        <button className="min-h-[2.75rem] rounded-xl bg-accent px-4 text-sm font-semibold text-white disabled:opacity-40" disabled={busy || !body.trim()}>
          Send
        </button>
      </form>
    </section>
  );
}
