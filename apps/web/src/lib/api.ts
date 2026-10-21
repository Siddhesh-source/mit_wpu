const TOKEN = 'plc.token';

export const auth = {
  get token() {
    try {
      return localStorage.getItem(TOKEN);
    } catch {
      return null;
    }
  },
  set(token: string | null) {
    try {
      token ? localStorage.setItem(TOKEN, token) : localStorage.removeItem(TOKEN);
    } catch {
      /* storage blocked: session lasts until reload */
    }
  },
};

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

/** Download an authenticated file (the PDF) by fetching it as a blob. */
export async function download(path: string, filename: string) {
  const res = await fetch(path, { headers: auth.token ? { Authorization: `Bearer ${auth.token}` } : {} });
  if (!res.ok) throw new ApiError((await res.json().catch(() => ({}))).error || 'Download failed', res.status);
  const url = URL.createObjectURL(await res.blob());
  const a = Object.assign(document.createElement('a'), { href: url, download: filename });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** Upload one file as a raw body; returns the stored attachment (id, name, sha256...). */
export async function uploadFile<T>(file: File): Promise<T> {
  const res = await fetch('/api/attachments', {
    method: 'POST',
    headers: { ...(auth.token ? { Authorization: `Bearer ${auth.token}` } : {}), 'Content-Type': file.type || 'application/octet-stream', 'X-Filename': encodeURIComponent(file.name) },
    body: file,
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(body.error || (res.status === 413 ? 'File too large (max 5 MB)' : 'Upload failed'), res.status);
  return body as T;
}

export async function api<T>(path: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const headers: Record<string, string> = { ...(init.headers as Record<string, string>) };
  if (auth.token) headers.Authorization = `Bearer ${auth.token}`;
  if (init.json !== undefined) headers['Content-Type'] = 'application/json';
  const res = await fetch(path, { ...init, headers, body: init.json !== undefined ? JSON.stringify(init.json) : init.body });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(body.error || `Request failed (${res.status})`, res.status);
  return body as T;
}
