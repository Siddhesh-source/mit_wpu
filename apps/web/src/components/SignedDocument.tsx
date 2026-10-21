import { useEffect, useState } from 'react';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import type { SignField, SigningInfo } from '@plc/shared';
import { PdfSigner, SIGNER_COLORS } from './PdfSigner';
import { Icon } from './Icon';
import { fetchBytes, openPdf } from '../lib/pdf';

/**
 * The document being signed in place, for any request whose document is a PDF. Boxes already signed show the
 * captured signature. For the signer reviewing it (`me` = their position in the list): their boxes are highlighted
 * and one click on one signs; `onPlace` lets them tap the page to add boxes of their own.
 */
export function SignedDocument({
  requestId,
  signing,
  me,
  placed = [],
  onPlace,
  onSign,
}: {
  requestId: string;
  signing: SigningInfo;
  me?: number | null;
  placed?: Omit<SignField, 'step'>[];
  onPlace?: (boxes: Omit<SignField, 'step'>[]) => void;
  onSign?: () => void;
}) {
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const [error, setError] = useState('');
  const [images, setImages] = useState<Record<number, string>>({});
  const signedKey = signing.signers.map((s) => (s.signed ? s.approvalId : 0)).join(',');

  useEffect(() => {
    let live = true;
    fetchBytes(`/api/attachments/${signing.attachmentId}`)
      .then(openPdf)
      .then((p) => live && setPdf(p))
      .catch((e) => live && setError(e.message));
    return () => {
      live = false;
    };
  }, [signing.attachmentId]);

  // Captured signatures of those who already signed (fetched with auth, shown as object URLs).
  useEffect(() => {
    let live = true;
    const urls: string[] = [];
    Promise.all(
      signing.signers
        .filter((s) => s.signed)
        .map(async (s) => {
          const res = await fetchBytes(`/api/requests/${requestId}/signatures/${s.approvalId}`).catch(() => null);
          if (!res) return null;
          const url = URL.createObjectURL(new Blob([res], { type: 'image/png' }));
          urls.push(url);
          return [s.step, url] as const;
        }),
    ).then((pairs) => live && setImages(Object.fromEntries(pairs.filter(Boolean) as [number, string][])));
    return () => {
      live = false;
      urls.forEach((u) => URL.revokeObjectURL(u));
    };
  }, [requestId, signedKey]);

  const base = signing.fields;
  const mine = me ? placed.map((b) => ({ ...b, step: me })) : [];
  const fields = [...base, ...mine];
  const placing = !!(me && onPlace);

  return (
    <div>
      <ul className="mb-3 flex flex-wrap gap-x-4 gap-y-1.5 text-xs">
        {signing.signers.map((s) => (
          <li key={s.step} className={`flex items-center gap-1.5 ${me && s.step !== me ? 'opacity-60' : ''}`}>
            <span className="h-2.5 w-2.5 rounded-sm" style={{ background: SIGNER_COLORS[(s.step - 1) % 6] }} />
            <span className="font-semibold">{s.label}</span>
            <span className="text-muted">{s.name}</span>
            {s.signed ? (
              <span className="inline-flex items-center gap-0.5 font-semibold text-ok">
                <Icon name="check" className="h-3.5 w-3.5" /> signed
              </span>
            ) : (
              <span className="text-faint">{fields.filter((f) => f.step === s.step).length} box(es)</span>
            )}
          </li>
        ))}
      </ul>
      {placing && <p className="mb-2 text-xs text-muted">Tap the page where you sign to add a box; drag to move it. Tap a box marked "Sign here" to sign.</p>}
      {error ? (
        <p className="text-sm text-bad">{error}</p>
      ) : (
        <PdfSigner
          pdf={pdf}
          fields={fields}
          signers={signing.signers}
          mode={placing ? 'edit' : 'view'}
          active={placing ? me! : null}
          highlight={me}
          images={images}
          // only the boxes this signer just placed can move; everyone else's stay put
          editable={(i) => i >= base.length}
          onChange={(all) => onPlace?.(all.slice(base.length).map(({ page, x, y, w, h }) => ({ page, x, y, w, h })))}
          signStep={me}
          onSign={onSign}
        />
      )}
    </div>
  );
}

