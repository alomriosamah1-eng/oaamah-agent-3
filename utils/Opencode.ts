import Constants from 'expo-constants';
import { fetch as expoFetch } from 'expo/fetch';
import { keyStorage, storage } from '@/utils/Storage';

// The app connects to the opencode server automatically.
// Candidates are tried in order: a stored override (if any), the Metro host
// (Expo Go / dev — the machine serving the bundle is also where `opencode
// serve` runs, so its host is auto-discovered on the same Wi-Fi), the mDNS
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
  // Native release owns this endpoint; never let a stale saved URL mask it.
  list.push('http://127.0.0.1:4096');
  const extra = Constants.expoConfig?.extra as { opencodeUrl?: string } | undefined;
  const publicServer = (process.env.EXPO_PUBLIC_OPENCODE_URL ?? extra?.opencodeUrl ?? '').trim().replace(/\/+$/, '');
  if (publicServer) list.push(publicServer);
  // A newly supplied Expo URL must win over a stale persisted tunnel URL.
  // The stored override remains a fallback for offline/local configurations.
  if (stored) list.push(stored);
  // Metro host: "192.168.1.50:8081" → "http://192.168.1.50:4096". Expo Go
  // reliably exposes it as `expoConfig.hostUri`; `expoGoConfig.debuggerHost`
  // is the classic fallback for older manifests.
  const hostUri =
    (Constants.expoConfig?.hostUri ?? '').trim() ||
    ((Constants.expoGoConfig as { debuggerHost?: string | null } | null)?.debuggerHost ?? '').trim();
  const host = hostUri.split(':')[0];
  if (host) list.push(`http://${host}:4096`);
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

// Stream an assistant reply as it is written. The message POST resolves only
// when the reply is complete, while `GET /event` (SSE) carries incremental
// `message.part.updated` frames whose assistant `text` part grows until
// completion. We emit the FULL assistant text on every growth (set-semantics,
// so UIs that replace their bubble content stream correctly) and never surface
// the user-message echo or the English `reasoning`/`step-*` working parts.
export const streamMessage = async (
  sessionId: string,
  text: string,
  opts: { signal?: AbortSignal; onDelta?: (delta: string) => void } = {}
): Promise<string> => {
  const base = await resolveServer(opts.signal);
  const ctrl = new AbortController();
  opts.signal?.addEventListener('abort', () => ctrl.abort(), { once: true });

  let assistantID: string | null = null;
  let shown = '';
  let streamError: unknown = null;

  const eventRes = await expoFetch(`${base}/event`, {
    headers: { Accept: 'text/event-stream' },
    signal: ctrl.signal,
  }).catch(() => null);

  const pumpEvents = (async () => {
    if (!eventRes || !eventRes.ok || !eventRes.body) return;
    const reader = eventRes.body.getReader();
    const decoder = new TextDecoder();
    let buf = '';
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        let idx: number;
        while ((idx = buf.indexOf('\n\n')) !== -1) {
          const frame = buf.slice(0, idx);
          buf = buf.slice(idx + 2);
          const dataLine = frame.split('\n').find((l) => l.startsWith('data:'));
          if (!dataLine) continue;
          let event: any;
          try {
            event = JSON.parse(dataLine.slice(5).trim());
          } catch {
            continue;
          }
          const props = event?.properties;
          if (props?.sessionID !== sessionId) continue;
          if (event.type === 'message.updated') {
            if (props?.info?.role === 'assistant' && !assistantID) {
              assistantID = props.info.id;
            }
          } else if (event.type === 'message.part.updated') {
            const part = props?.part;
            // Only the assistant's growing text part is shown; the user echo,
            // reasoning and step bookkeeping are debug-noise for the UI.
            if (
              assistantID &&
              part?.messageID === assistantID &&
              part?.type === 'text' &&
              typeof part.text === 'string' &&
              part.text.length > shown.length
            ) {
              shown = part.text;
              opts.onDelta?.(shown);
            }
          } else if (event.type === 'session.error') {
            streamError = props?.error ?? 'opencode session error';
          }
        }
      }
    } catch {
      // connection closed (also happens on abort)
    }
  })();

  try {
    const res = await expoFetch(`${base}/session/${sessionId}/message`, {
      method: 'POST',
      headers: await buildHeaders(),
      signal: ctrl.signal,
      body: JSON.stringify({ parts: [{ type: 'text', text }] }),
    });
    if (!res.ok) throw new Error(await parseError(res, 'opencode message error'));
    if (streamError) throw new Error(String(streamError));
    const json: any = await res.json();
    const textParts = ((json?.parts ?? []) as Array<any>)
      .filter((p) => (p as any)?.type === 'text' && typeof (p as any).text === 'string')
      .map((p) => (p as any).text)
      .join('\n');
    const reply = textParts.trim();
    if (!reply) throw new Error('empty opencode server reply');
    if (reply.length > shown.length) {
      shown = reply;
      opts.onDelta?.(shown);
    }
    return reply;
  } finally {
    ctrl.abort();
  }
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
