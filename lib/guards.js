// Each guard takes { messages, ip } and returns a Response to reject the
// request, or null to let it through. They run in order, first rejection wins.
// Compose a different chain by passing one to runGuards.
//
// The two limits that are not request-shaped live where they are enforced:
// the tool-round cap and max_tokens are both in chat.js.

export const MAX_MESSAGE_CHARS = 2000;
export const MAX_HISTORY_MESSAGES = 40;
export const RATE_LIMIT_REQUESTS = 12;
export const RATE_LIMIT_WINDOW_MS = 60_000;

function reject(status, error, headers = {}) {
  return new Response(JSON.stringify({ error }), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}

export function messageLength({ messages }) {
  const longest = Math.max(
    0,
    ...messages.map((m) => (typeof m.content === 'string' ? m.content.length : 0)),
  );
  return longest > MAX_MESSAGE_CHARS
    ? reject(413, `Messages are limited to ${MAX_MESSAGE_CHARS} characters.`)
    : null;
}

export function historyLength({ messages }) {
  return messages.length > MAX_HISTORY_MESSAGES
    ? reject(413, `Conversations are limited to ${MAX_HISTORY_MESSAGES} messages. Start a new one.`)
    : null;
}

const hits = new Map();

export function rateLimit({ ip }) {
  const now = Date.now();
  const cutoff = now - RATE_LIMIT_WINDOW_MS;

  // Cheap sweep: without it the map grows one entry per IP seen, forever.
  if (hits.size > 1000) {
    for (const [key, times] of hits) {
      if (times.at(-1) < cutoff) hits.delete(key);
    }
  }

  const recent = (hits.get(ip) ?? []).filter((time) => time > cutoff);
  recent.push(now);
  hits.set(ip, recent);

  if (recent.length > RATE_LIMIT_REQUESTS) {
    const retryAfter = Math.ceil((recent[0] - cutoff) / 1000);
    return reject(429, 'Too many requests. Wait a moment and try again.', {
      'Retry-After': String(retryAfter),
    });
  }
  return null;
}

export const guards = [messageLength, historyLength, rateLimit];

export function runGuards(context, chain = guards) {
  for (const guard of chain) {
    const response = guard(context);
    if (response) return response;
  }
  return null;
}

// Test seam: the rate limiter is module-level state that would otherwise leak
// between test cases.
export function resetRateLimit() {
  hits.clear();
}
