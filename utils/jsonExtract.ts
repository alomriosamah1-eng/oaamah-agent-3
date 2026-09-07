// Pure JSON extraction helper — no RN / Expo imports so it runs under Node.
// Moved verbatim from OpenCodeAgent so the strict behavior is unchanged.

/** Extracts a JSON object from a model reply that may include fences or prose. */
export function extractJson<T>(reply: string): T {
  const fenced = reply.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1] : reply;
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) {
    throw new Error('no JSON object found in reply');
  }
  return JSON.parse(candidate.slice(start, end + 1)) as T;
}