/** Public verify page. Scanning and results arrive in prompt 5. */
export default function Verify() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-4 px-4 text-center">
      <h1 className="text-2xl font-bold md:text-4xl">Verify a document</h1>
      <button className="cta w-full max-w-xs" disabled>
        Scan QR
      </button>
      <p className="text-xs text-faint">Hash only, no personal data on chain.</p>
    </main>
  );
}
