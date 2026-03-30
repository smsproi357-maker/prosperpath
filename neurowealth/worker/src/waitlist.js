/**
 * worker/src/waitlist.js
 *
 * Cloudflare Worker handler for POST /api/waitlist.
 * Mirrors waitlist-brevo-service.js (local server) but uses Worker env bindings.
 *
 * Secrets required (set via `wrangler secret put`):
 *   BREVO_API_KEY
 *   BREVO_SENDER_EMAIL
 *
 * Plain vars (set in wrangler.toml [vars]):
 *   BREVO_WAITLIST_LIST_ID  (integer as string, e.g. "2")
 *   BREVO_SENDER_NAME       (defaults to "ProsperPath")
 */

const BREVO_CONTACTS_URL = 'https://api.brevo.com/v3/contacts';
const BREVO_EMAIL_URL    = 'https://api.brevo.com/v3/smtp/email';
const EMAIL_RE           = /^[^\s@]{1,64}@[^\s@]{1,255}\.[^\s@]{2,}$/;

// ─── In-memory rate limiter ───────────────────────────────────────────────────
// Workers are single-threaded per-isolate; this map resets between cold starts.
// Good enough for a low-traffic waitlist form.
const _rateMap = new Map();
const RATE_LIMIT  = 5;
const RATE_WINDOW = 60_000; // 60 s

function _rateCheck(ip) {
    const now   = Date.now();
    const entry = _rateMap.get(ip);
    if (!entry || now - entry.ts > RATE_WINDOW) {
        _rateMap.set(ip, { ts: now, count: 1 });
        return true;
    }
    if (entry.count >= RATE_LIMIT) return false;
    entry.count++;
    return true;
}

// ─── Welcome email copy ───────────────────────────────────────────────────────
const WELCOME = {
    subject: "You're on the ProsperPath early access list",
    html: `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>You're on the list</title></head>
<body style="margin:0;padding:0;background:#050506;font-family:'Inter',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#050506;padding:48px 24px;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;">
        <tr><td style="padding-bottom:40px;"><span style="font-family:Georgia,serif;font-size:18px;font-weight:700;color:#f4f4f5;">ProsperPath</span></td></tr>
        <tr><td style="padding-bottom:36px;"><div style="width:40px;height:1px;background:#F5C842;opacity:0.6;"></div></td></tr>
        <tr><td style="padding-bottom:24px;"><p style="margin:0;font-family:Georgia,serif;font-size:26px;font-weight:400;color:#f4f4f5;line-height:1.3;">You're on the list.</p></td></tr>
        <tr><td style="padding-bottom:20px;"><p style="margin:0;font-size:15px;line-height:1.75;color:#a1a1aa;">Thanks for joining the ProsperPath early access waitlist.</p></td></tr>
        <tr><td style="padding-bottom:20px;"><p style="margin:0;font-size:15px;line-height:1.75;color:#a1a1aa;">ProsperPath is being built for people who want to understand how markets actually work — clearly, structurally, and without the noise.</p></td></tr>
        <tr><td style="padding-bottom:40px;"><p style="margin:0;font-size:15px;line-height:1.75;color:#a1a1aa;">You'll be among the first to hear when early access opens.</p></td></tr>
        <tr><td style="padding-bottom:6px;"><p style="margin:0;font-size:14px;color:#52525b;">Until then,</p></td></tr>
        <tr><td style="padding-bottom:40px;"><p style="margin:0;font-size:14px;color:#71717a;">ProsperPath</p></td></tr>
        <tr><td style="padding-bottom:24px;"><div style="width:100%;height:1px;background:rgba(255,255,255,0.07);"></div></td></tr>
        <tr><td>
          <p style="margin:0 0 8px;font-family:Georgia,serif;font-size:13px;font-style:italic;color:#52525b;">Understanding compounds.</p>
          <p style="margin:0;font-size:12px;color:#3f3f46;">You're receiving this because you joined the ProsperPath waitlist. You can unsubscribe at any time.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`,
    text: `You're on the list.

Thanks for joining the ProsperPath early access waitlist.

ProsperPath is being built for people who want to understand how markets actually work — clearly, structurally, and without the noise.

You'll be among the first to hear when early access opens.

Until then,
ProsperPath

Understanding compounds.

---
You're receiving this because you joined the ProsperPath waitlist.`,
};

// ─── Send welcome email (fire-and-forget) ─────────────────────────────────────
async function sendWelcomeEmail(email, env) {
    const apiKey    = env.BREVO_API_KEY;
    const fromEmail = env.BREVO_SENDER_EMAIL;
    const fromName  = env.BREVO_SENDER_NAME || 'ProsperPath';

    // [DIAG] Env var presence for email step
    console.info('[waitlist][diag] sendWelcomeEmail env check:'
        + ` BREVO_API_KEY=${apiKey ? 'PRESENT' : 'MISSING'}`
        + ` BREVO_SENDER_EMAIL=${fromEmail ? 'PRESENT' : 'MISSING'}`
        + ` BREVO_SENDER_NAME=${env.BREVO_SENDER_NAME ? 'PRESENT' : 'using-default'}`);

    if (!apiKey || !fromEmail) {
        console.warn('[waitlist][diag] Welcome email SKIPPED — BREVO_API_KEY or BREVO_SENDER_EMAIL not set.');
        return;
    }

    console.info(`[waitlist][diag] Welcome email send attempt started for: ${email}`);
    try {
        const res = await fetch(BREVO_EMAIL_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Accept': 'application/json', 'api-key': apiKey },
            body: JSON.stringify({
                sender:      { name: fromName, email: fromEmail },
                to:          [{ email }],
                subject:     WELCOME.subject,
                htmlContent: WELCOME.html,
                textContent: WELCOME.text,
            }),
        });
        console.info(`[waitlist][diag] Welcome email Brevo response status: HTTP ${res.status}`);
        if (res.ok) {
            console.info(`[waitlist] Welcome email sent successfully to: ${email}`);
        } else {
            const body = await res.text().catch(() => '');
            console.error(`[waitlist][diag] FAILURE: Welcome email send failed — HTTP ${res.status}. Brevo response: ${body.slice(0, 300)}`);
        }
    } catch (e) {
        console.error(`[waitlist][diag] FAILURE: Welcome email network/fetch error — ${e.name}: ${e.message}`);
    }
}

// ─── Main handler ─────────────────────────────────────────────────────────────
export async function handleWaitlist(request, env, corsHeaders) {
    // [DIAG] Log env var presence on every request — never log values
    console.info('[waitlist][diag] Request received. Env var audit:'
        + ` BREVO_API_KEY=${env.BREVO_API_KEY ? 'PRESENT' : 'MISSING'}`
        + ` BREVO_WAITLIST_LIST_ID=${env.BREVO_WAITLIST_LIST_ID ? 'PRESENT' : 'MISSING'}`
        + ` BREVO_SENDER_EMAIL=${env.BREVO_SENDER_EMAIL ? 'PRESENT' : 'MISSING'}`
        + ` BREVO_SENDER_NAME=${env.BREVO_SENDER_NAME ? 'PRESENT' : 'MISSING'}`);

    // Rate limit
    const ip = request.headers.get('CF-Connecting-IP') || request.headers.get('X-Forwarded-For') || 'unknown';
    if (!_rateCheck(ip.split(',')[0].trim())) {
        console.warn(`[waitlist][diag] Rate limit hit for IP: ${ip.split(',')[0].trim()}`);
        return new Response(
            JSON.stringify({ ok: false, status: 'rate_limited', message: 'Too many requests. Please wait a moment.' }),
            { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }

    // Parse body
    let body = {};
    try { body = await request.json(); } catch (e) {
        console.warn(`[waitlist][diag] Failed to parse request body: ${e.message}`);
    }

    // Honeypot
    if (body.website) {
        console.info('[waitlist][diag] Honeypot triggered — silently discarding.');
        return new Response(
            JSON.stringify({ ok: true, status: 'added' }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }

    // Validate email
    const email = (body.email || '').toString().trim().toLowerCase();
    if (!email) {
        console.info('[waitlist][diag] Email validation failed: empty email.');
        return new Response(
            JSON.stringify({ ok: false, status: 'invalid', message: 'Email address is required.' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }
    if (!EMAIL_RE.test(email)) {
        console.info('[waitlist][diag] Email validation failed: invalid format.');
        return new Response(
            JSON.stringify({ ok: false, status: 'invalid', message: 'Please enter a valid email address.' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }
    console.info('[waitlist][diag] Email validation passed.');

    // Guard: Brevo config
    const apiKey  = env.BREVO_API_KEY;
    const rawListId = env.BREVO_WAITLIST_LIST_ID || '';
    const listId  = parseInt(rawListId, 10);
    if (!apiKey) {
        console.error('[waitlist][diag] FAILURE: BREVO_API_KEY is MISSING — cannot call Brevo API.');
        return new Response(
            JSON.stringify({ ok: false, status: 'error', message: 'Waitlist service unavailable.' }),
            { status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }
    if (!rawListId || isNaN(listId) || listId <= 0) {
        console.error(`[waitlist][diag] FAILURE: BREVO_WAITLIST_LIST_ID is MISSING or invalid (raw value type: ${typeof rawListId}, isNaN: ${isNaN(listId)}).`);
        return new Response(
            JSON.stringify({ ok: false, status: 'error', message: 'Waitlist service unavailable.' }),
            { status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }
    console.info(`[waitlist][diag] Brevo config valid. Parsed listId: ${listId}.`);

    // Add to Brevo list (upsert)
    console.info('[waitlist][diag] Brevo contact add attempt started.');
    try {
        const res = await fetch(BREVO_CONTACTS_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Accept': 'application/json', 'api-key': apiKey },
            body: JSON.stringify({ email, listIds: [listId], updateEnabled: true }),
        });

        console.info(`[waitlist][diag] Brevo contact API response status: HTTP ${res.status}`);

        if (res.status === 201 || res.status === 204) {
            console.info(`[waitlist] Contact added/updated successfully: ${email}`);
            // Fire-and-forget welcome email using ctx.waitUntil if available
            console.info('[waitlist][diag] Welcome email send attempt started.');
            const emailPromise = sendWelcomeEmail(email, env);
            if (typeof env.__ctx?.waitUntil === 'function') {
                env.__ctx.waitUntil(emailPromise);
            } else {
                emailPromise.catch(() => {});
            }
            return new Response(
                JSON.stringify({ ok: true, status: 'added' }),
                { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        const errBody = await res.text().catch(() => '');
        console.error(`[waitlist][diag] FAILURE: Brevo contact API returned unexpected HTTP ${res.status}. Response snippet: ${errBody.slice(0, 300)}`);
        return new Response(
            JSON.stringify({ ok: false, status: 'error', message: 'Something went wrong. Please try again.' }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );

    } catch (e) {
        console.error(`[waitlist][diag] FAILURE: Brevo contact fetch threw an error — ${e.name}: ${e.message}`);
        return new Response(
            JSON.stringify({ ok: false, status: 'error', message: 'Something went wrong. Please try again.' }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }
}
