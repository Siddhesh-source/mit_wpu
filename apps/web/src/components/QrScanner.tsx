import { useEffect, useRef, useState } from 'react';
import jsQR from 'jsqr';

/** Live camera QR reader (needs HTTPS or localhost). Calls onResult once with the decoded text. */
export function QrScanner({ onResult, onError }: { onResult: (text: string) => void; onError: (msg: string) => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let stream: MediaStream | null = null;
    let raf = 0;
    let done = false;
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!;

    const tick = () => {
      const v = video.current;
      if (done || !v) return;
      if (v.readyState >= 2 && v.videoWidth) {
        const scale = Math.min(1, 720 / v.videoWidth);
        canvas.width = v.videoWidth * scale;
        canvas.height = v.videoHeight * scale;
        ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
        const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const code = jsQR(img.data, img.width, img.height, { inversionAttempts: 'dontInvert' });
        if (code?.data) {
          done = true;
          onResult(code.data);
          return;
        }
      }
      raf = requestAnimationFrame(tick);
    };

    (async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        onError('Live camera needs a secure (https) page. Use your phone camera app or “Scan from photo”.');
        return;
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
        if (!video.current) return;
        video.current.srcObject = stream;
        await video.current.play();
        setReady(true);
        raf = requestAnimationFrame(tick);
      } catch {
        onError('Camera blocked. Allow camera access, or use “Scan from photo”.');
      }
    })();

    return () => {
      done = true;
      cancelAnimationFrame(raf);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [onResult, onError]);

  return (
    <div className="relative mx-auto aspect-square w-full max-w-sm overflow-hidden rounded-3xl bg-black">
      <video ref={video} className="h-full w-full object-cover" playsInline muted />
      <div className="pointer-events-none absolute inset-10 rounded-2xl border-4 border-white/80" />
      {!ready && <p className="absolute inset-0 grid place-items-center text-sm text-white/80">Starting camera…</p>}
    </div>
  );
}

/** Decode a QR from a photo (works on plain http, where live camera is not allowed). */
export async function decodeQrImage(file: File): Promise<string | null> {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
  const canvas = Object.assign(document.createElement('canvas'), { width: bmp.width * scale, height: bmp.height * scale });
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
  return jsQR(img.data, img.width, img.height)?.data ?? null;
}
