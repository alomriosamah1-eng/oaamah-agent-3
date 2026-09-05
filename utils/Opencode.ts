import { fetch as expoFetch } from 'expo/fetch';
import { keyStorage, storage } from '@/utils/Storage';

// The app connects to the opencode server automatically.
// Candidates are tried in order: a stored override (if any), the mDNS
// hostname advertised by `opencode serve --mdns` (opencode.local), then
// localhost for running opencode on the same machine.
export const DEFAULT_OPENCODE_URL = 'http://opencode.local:4096';

export interface OpencodeCreds {
  username?: string;
  password?: string;
}

let resolvedBase: string | null = null;

const getServerUrl = async (): Promise<string | null> => {
  const stored = (await storage.getString('serverUrl'))?.trim();
  return stored && stored !== '' ? stored.replace(/\/+$/, '') : null;
};

const serverCandidates = async (): Promise<string[]> => {
  const stored = await getServerUrl();
  const list: Array<string> = [];
  if (stored) list.push(stored);
  list.push(
    // mDNS advertised by `npm run server` (opencode serve --mdns): works on
    // devices on the same Wi-Fi as the machine hosting the project.
    DEFAULT_OPENCODE_URL,
    // Same machine running the project.
    'http://localhost:4096',
    // Android emulator host loopback.
    'http://10.0.2.2:4096'
  );
  return list.filter((v, i) => list.indexOf(v) === i);
};

// Find the running opencode server and cache it for the rest of the session.
export const resolveServer = async (signal?: AbortSignal): Promise<string> => {
  if (resolvedBase) return resolvedBase;
  for (const base of await serverCandidates()) {
    try {
      const res = await expoFetch(`${base}/global/health`, {
        headers: await buildHeaders(),
        signal,
      });
      if (res.ok) {
        resolvedBase = base;
        return base;
      }
    } catch {
      // try the next candidate
    }
  }
  throw new Error('Could not find an opencode server on this network');
};

export const resetServerCache = () => {
  resolvedBase = null;
};

export const getServerCreds = async (): Promise<OpencodeCreds> => {
  const [username, password] = await Promise.all([
    keyStorage.getString('serverUser'),
    keyStorage.getString('serverPass'),
  ]);
  return { username: username?.trim() || undefined, password: password || undefined };
};

export const getSelectedModel = async (): Promise<ModelSelect | undefined> => {
  const [modelID, providerID] = await Promise.all([
    storage.getString('modelID'),
    storage.getString('modelProvider'),
  ]);
  if (modelID && modelID.trim() !== '' && providerID && providerID.trim() !== '') {
    return { id: modelID, providerID };
  }
  return undefined;
};

function toBase64(input: string): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let output = '';
  let i = 0;
  const bytes = new TextEncoder().encode(input);
  while (i < bytes.length) {
    const b1 = bytes[i++];
    const b2 = i < bytes.length ? bytes[i++] : NaN;
    const b3 = i < bytes.length ? bytes[i++] : NaN;
    const enc1 = b1 >> 2;
    const enc2 = ((b1 & 3) << 4) | (isNaN(b2) ? 0 : b2 >> 4);
    const enc3 = isNaN(b2) ? 64 : ((b2 & 15) << 2) | (isNaN(b3) ? 0 : b3 >> 6);
    const enc4 = isNaN(b3) ? 64 : b3 & 63;
    output += chars.charAt(enc1) + chars.charAt(enc2) + chars.charAt(enc3) + chars.charAt(enc4);
  }
  return output;
}

async function buildHeaders(extra: Record<string, string> = {}) {
  const base: Record<string, string> = { 'Content-Type': 'application/json', ...extra };
  const { username, password } = await getServerCreds();
  if (username || password) {
    base.Authorization = `Basic ${toBase64(`${username ?? 'opencode'}:${password ?? ''}`)}`;
  }
  return base;
}

async function parseError(res: { status: number; text: () => Promise<string> }, fallback: string) {
  try {
    const text = (await res.text()) || '';
    let detail = text;
    try {
      const json = JSON.parse(text);
      detail = json?.data?.message ?? json?.message ?? json?.error ?? text;
    } catch {
      // keep raw text
    }
    const trimmed = detail.trim().slice(0, 200);
    return trimmed ? `${fallback} (${res.status}): ${trimmed}` : `${fallback} (${res.status})`;
  } catch {
    return `${fallback} (${res.status})`;
  }
}

export interface HealthResult {
  healthy: boolean;
  version?: string;
}

export const checkServer = async (signal?: AbortSignal): Promise<HealthResult> => {
  const base = await resolveServer(signal);
  const res = await expoFetch(`${base}/global/health`, { headers: await buildHeaders(), signal });
  if (!res.ok) throw new Error(await parseError(res, 'opencode server unreachable'));
  const json: any = await res.json();
  return { healthy: !!json?.healthy, version: json?.version };
};

export interface OpencodeSession {
  id: string;
  [key: string]: any;
}

export interface ModelSelect {
  id: string;
  providerID: string;
}

export interface ModelInfo {
  id: string;
  providerID: string;
  name?: string;
  status?: string;
  enabled?: boolean;
}

// List the real models the opencode server can use.
// Primary source: GET /api/model. Fallback: models declared in GET /global/config.
export const getModels = async (signal?: AbortSignal): Promise<ModelInfo[]> => {
  const list: ModelInfo[] = [];
  try {
    const base = await resolveServer(signal);
    const res = await expoFetch(`${base}/api/model`, { headers: await buildHeaders(), signal });
    if (!res.ok) throw new Error(await parseError(res, 'opencode models error'));
    const json: any = await res.json();
    const data: Array<any> = Array.isArray(json?.data) ? json.data : [];
    for (const item of data) {
      if (!item || typeof item.id !== 'string' || typeof item.providerID !== 'string') continue;
      list.push({
        id: item.id,
        providerID: item.providerID,
        name: typeof item.name === 'string' ? item.name : undefined,
        status: typeof item.status === 'string' ? item.status : undefined,
        enabled: item.enabled === true,
      });
    }
  } catch {
    // fall through to the config-based fallback
  }

  if (list.length === 0) {
    try {
      const base = await resolveServer(signal);
      const res = await expoFetch(`${base}/global/config`, { headers: await buildHeaders(), signal });
      if (!res.ok) return list;
      const cfg: any = await res.json();
      const providers = cfg?.provider ?? {};
      for (const providerID of Object.keys(providers)) {
        const models = providers[providerID]?.models ?? {};
        for (const id of Object.keys(models)) {
          const m = models[id] ?? {};
          list.push({
            id,
            providerID,
            name: typeof m.name === 'string' ? m.name : undefined,
            status: typeof m.status === 'string' ? m.status : undefined,
          });
        }
      }
    } catch {
      // server unreachable
    }
  }

  return list;
};

export const createSession = async (
  opts: { title?: string; model?: ModelSelect; signal?: AbortSignal } = {}
): Promise<OpencodeSession> => {
  const base = await resolveServer(opts.signal);
  const res = await expoFetch(`${base}/session`, {
    method: 'POST',
    headers: await buildHeaders(),
    signal: opts.signal,
    body: JSON.stringify({
      title: opts.title ?? 'Osamah agent chat',
      ...(opts.model ? { model: { id: opts.model.id, providerID: opts.model.providerID } } : {}),
    }),
  });
  if (!res.ok) throw new Error(await parseError(res, 'opencode session error'));
  return res.json();
};

// Send a single user message and wait for the assistant reply.
export const sendMessage = async (
  sessionId: string,
  text: string,
  opts: { signal?: AbortSignal; model?: ModelSelect } = {}
): Promise<string> => {
  const base = await resolveServer(opts.signal);
  const res = await expoFetch(`${base}/session/${sessionId}/message`, {
    method: 'POST',
    headers: await buildHeaders(),
    signal: opts.signal,
    body: JSON.stringify({
      parts: [{ type: 'text', text }],
      ...(opts.model
        ? { model: { providerID: opts.model.providerID, modelID: opts.model.id } }
        : {}),
    }),
  });
  if (!res.ok) throw new Error(await parseError(res, 'opencode message error'));
  const json: any = await res.json();
  const textParts = ((json?.parts ?? []) as Array<any>)
    .filter((p) => (p as any)?.type === 'text' && typeof (p as any).text === 'string')
    .map((p) => (p as any).text)
    .join('\n');
  return textParts.trim();
};

export const abortSession = async (sessionId: string) => {
  try {
    const base = await resolveServer();
    await expoFetch(`${base}/session/${sessionId}/abort`, {
      method: 'POST',
      headers: await buildHeaders(),
    });
  } catch {
    // best effort
  }
};

// Build a plain-text prompt that replays the local chat history so the
// stateless opencode call still has full conversation context.
export function buildHistoryPrompt(
  messages: Array<{ role: number; content: string }>,
  newMessage: string
): string {
  const head = messages.length > 1 ? messages.slice(0, -1) : [];
  const lines: string[] = [];
  if (head.length > 0) {
    lines.push('Previous conversation:');
    for (const m of head) {
      if (!m.content || !m.content.trim()) continue;
      lines.push(`${m.role === 0 ? 'User' : 'Assistant'}: ${m.content}`);
    }
    lines.push('');
    lines.push('New message:');
  }
  lines.push(newMessage);
  return lines.join('\n');
}