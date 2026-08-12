import { createHmac } from 'crypto';

const TIMEOUT_MS = 5000;
const RETRY_DELAY_MS = 500;

// Sends a completed action to RESERVATION_WEBHOOK_URL, if one is configured.
// Deliberately not awaited: a slow or dead endpoint must never delay the
// visitor's reply, so failures are logged rather than surfaced.
export function sendReservationWebhook(record) {
  const url = process.env.RESERVATION_WEBHOOK_URL;
  if (!url) return;

  const body = JSON.stringify(record);
  const headers = { 'Content-Type': 'application/json' };

  const secret = process.env.WEBHOOK_SECRET;
  if (secret) {
    const digest = createHmac('sha256', secret).update(body).digest('hex');
    headers['x-zetta-signature'] = `sha256=${digest}`;
  } else {
    console.error(
      JSON.stringify({
        level: 'warn',
        event: 'webhook_unsigned',
        message: 'RESERVATION_WEBHOOK_URL is set without WEBHOOK_SECRET',
      }),
    );
  }

  deliver(url, body, headers, record.reference);
}

// Never rejects — the caller does not await it, so a thrown error here would
// surface as an unhandled rejection.
async function deliver(url, body, headers, reference, attempt = 1) {
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers,
      body,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!response.ok) throw new Error(`responded ${response.status}`);
    console.log(
      JSON.stringify({ level: 'info', event: 'webhook_sent', reference, attempt }),
    );
  } catch (error) {
    if (attempt === 1) {
      await Bun.sleep(RETRY_DELAY_MS);
      return deliver(url, body, headers, reference, 2);
    }
    console.error(
      JSON.stringify({
        level: 'error',
        event: 'webhook_failed',
        reference,
        error: error.message,
      }),
    );
  }
}
