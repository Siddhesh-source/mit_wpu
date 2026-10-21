import { useEffect, useState } from 'react';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import type { SigningInfo } from '@plc/shared';
import { PdfSigner, SIGNER_COLORS } from './PdfSigner';
import { Icon } from './Icon';
import { fetchBytes, openPdf } from '../lib/pdf';

/**
 * The document being signed in place: the PDF with each signer's boxes; boxes already signed show the signature that
 * was captured. `highlight` (a step) dims everyone else's boxes, for the signer reviewing it.
 */
export function SignedDocument({ requestId, signing, highlight }: { requestId: string; signing: SigningInfo; highlight?: number | null }) {
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const [error, setError] = useState('');
  const [images, setImages] = useState<Record<number, string>>({});
  const signedKey = signing.signers.map((s) => (s.signed ? s.step : 0)).join(',');

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

  // Captured signatures for the steps already signed (fetched with auth, shown as object URLs).
  useEffect(() => {
    let live = true;
    const urls: string[] = [];
    Promise.all(
      signing.signers
        .filter((s) => s.signed)
        .map(async (s) => {
          const blob = new Blob([await fetchBytes(`/api/requests/${requestId}/signatures/${s.step}`)], { type: 'image/png' });
          const url = URL.createObjectURL(blob);
          urls.push(url);
          return [s.step, url] as const;
        }),
    )
      .then((pairs) => live && setImages(Object.fromEntries(pairs)))
      .catch(() => undefined);
    return () => {
      live = false;
      urls.forEach((u) => URL.revokeObjectURL(u));
    };
  }, [requestId, signedKey]);

  return (
    <div>
      <ul className="mb-3 flex flex-wrap gap-x-4 gap-y-1.5 text-xs">
        {signing.signers.map((s) => (
          <li key={s.step} className={`flex items-center gap-1.5 ${highlight != null && s.step !== highlight ? 'opacity-60' : ''}`}>
            <span className="h-2.5 w-2.5 rounded-sm" style={{ background: SIGNER_COLORS[(s.step - 1) % 6] }} />
            <span className="font-semibold">{s.label}</span>
            <span className="text-muted">{s.name}</span>
            {s.signed ? (
              <span className="inline-flex items-center gap-0.5 font-semibold text-ok">
                <Icon name="check" className="h-3.5 w-3.5" /> signed
              </span>
            ) : (
              <span className="text-faint">{signing.fields.filter((f) => f.step === s.step).length} box(es)</span>
            )}
          </li>
        ))}
      </ul>
      {error ? <p className="text-sm text-bad">{error}</p> : <PdfSigner pdf={pdf} fields={signing.fields} signers={signing.signers} mode="view" highlight={highlight} images={images} />}
    </div>
  );
}
