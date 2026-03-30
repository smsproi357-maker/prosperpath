'use strict';

/**
 * waitlist-brevo-service.js
 *
 * Isolated Brevo integration for the ProsperPath waitlist.
 * Scope: email capture + welcome email only.
 * No coupling to auth, accounts, or other systems.
 *
 * Uses the Brevo API v3 directly via fetch (no SDK dependency).
 * Secret key is read from process.env at call-time — never bundled client-side.
 */

const BREVO_CONTACTS_URL = 'https://api.brevo.com/v3/contacts';
const BREVO_EMAIL_URL    = 'https://api.brevo.com/v3/smtp/email';

// ─────────────────────────────────────────────────────────────────────────────
// Welcome email copy — calm, premium, clarity-first.
// Edit this object to update subject/body without touching logic.
// ─────────────────────────────────────────────────────────────────────────────
const WELCOME_EMAIL = {
    subject: "You're on the ProsperPath early access list",
    htmlBody: `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>You're on the list</title>
</head>
<body style="margin:0;padding:0;background:#050506;font-family:'Inter',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#050506;padding:48px 24px;">
    <tr>
      <td align="center">
        <table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;">

          <!-- Logo -->
          <tr>
            <td style="padding-bottom:40px;">
              <span style="font-family:Georgia,serif;font-size:18px;font-weight:700;color:#f4f4f5;">
                ProsperPath
              </span>
            </td>
          </tr>

          <!-- Divider -->
          <tr>
            <td style="padding-bottom:36px;">
              <div style="width:40px;height:1px;background:#F5C842;opacity:0.6;"></div>
            </td>
          </tr>

          <!-- Headline -->
          <tr>
            <td style="padding-bottom:24px;">
              <p style="margin:0;font-family:Georgia,serif;font-size:26px;font-weight:400;color:#f4f4f5;line-height:1.3;">
                You're on the list.
              </p>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding-bottom:20px;">
              <p style="margin:0;font-size:15px;line-height:1.75;color:#a1a1aa;">
                Thanks for joining the ProsperPath early access waitlist.
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding-bottom:20px;">
              <p style="margin:0;font-size:15px;line-height:1.75;color:#a1a1aa;">
                ProsperPath is being built for people who want to understand how markets
                actually work — clearly, structurally, and without the noise.
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding-bottom:40px;">
              <p style="margin:0;font-size:15px;line-height:1.75;color:#a1a1aa;">
                You'll be among the first to hear when early access opens.
              </p>
            </td>
          </tr>

          <!-- Sign-off -->
          <tr>
            <td style="padding-bottom:6px;">
              <p style="margin:0;font-size:14px;color:#52525b;">Until then,</p>
            </td>
          </tr>
          <tr>
            <td style="padding-bottom:40px;">
              <p style="margin:0;font-size:14px;color:#71717a;">ProsperPath</p>
            </td>
          </tr>

          <!-- Footer divider -->
          <tr>
            <td style="padding-bottom:24px;">
              <div style="width:100%;height:1px;background:rgba(255,255,255,0.07);"></div>
            </td>
          </tr>

          <!-- Tagline + unsubscribe -->
          <tr>
            <td>
              <p style="margin:0 0 8px;font-family:Georgia,serif;font-size:13px;font-style:italic;color:#52525b;">
                Understanding compounds.
              </p>
              <p style="margin:0;font-size:12px;color:#3f3f46;">
                You're receiving this because you joined the ProsperPath waitlist.
                You can unsubscribe at any time.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`,
    textBody: `You're on the list.

Thanks for joining the ProsperPath early access waitlist.

ProsperPath is being built for people who want to understand how markets actually work — clearly, structurally, and without the noise.

You'll be among the first to hear when early access opens.

Until then,
ProsperPath

Understanding compounds.

---
You're receiving this because you joined the ProsperPath waitlist.`,
};

// ─────────────────────────────────────────────────────────────────────────────

/**
 * Send a welcome email to the new waitlist member.
 * Called fire-and-forget after a successful upsert — a failed email must never
 * block or reverse the contact creation success response.
 *
 * Requires BREVO_SENDER_EMAIL and BREVO_SENDER_NAME in .env.
 * If not configured, the email is skipped gracefully (logged only).
 *
 * @param {string} email - Already-validated, lowercased email address.
 */
async function sendWelcomeEmail(email) {
    const apiKey     = process.env.BREVO_API_KEY;
    const fromEmail  = process.env.BREVO_SENDER_EMAIL;
    const fromName   = process.env.BREVO_SENDER_NAME || 'ProsperPath';

    // [DIAG] Env var presence for email step — never log secret values
    console.info('[waitlist-brevo][diag] sendWelcomeEmail env check:'
        + ` BREVO_API_KEY=${apiKey ? 'PRESENT' : 'MISSING'}`
        + ` BREVO_SENDER_EMAIL=${fromEmail ? 'PRESENT' : 'MISSING'}`
        + ` BREVO_SENDER_NAME=${process.env.BREVO_SENDER_NAME ? 'PRESENT' : 'using-default'}`);

    if (!apiKey || !fromEmail) {
        console.warn('[waitlist-brevo][diag] Welcome email SKIPPED — BREVO_API_KEY or BREVO_SENDER_EMAIL not set.');
        return;
    }

    const payload = {
        sender:    { name: fromName, email: fromEmail },
        to:        [{ email }],
        subject:   WELCOME_EMAIL.subject,
        htmlContent: WELCOME_EMAIL.htmlBody,
        textContent: WELCOME_EMAIL.textBody,
    };

    console.info(`[waitlist-brevo][diag] Welcome email send attempt started for: ${email}`);
    try {
        const response = await fetch(BREVO_EMAIL_URL, {
            method:  'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept':       'application/json',
                'api-key':      apiKey,
            },
            body: JSON.stringify(payload),
        });

        console.info(`[waitlist-brevo][diag] Welcome email Brevo response status: HTTP ${response.status}`);
        if (response.ok) {
            console.info(`[waitlist-brevo] Welcome email sent successfully to: ${email}`);
        } else {
            let errBody = '';
            try { errBody = await response.text(); } catch { /* ignore */ }
            console.error(`[waitlist-brevo][diag] FAILURE: Welcome email send failed — HTTP ${response.status}. Brevo response: ${errBody.slice(0, 300)}`);
        }
    } catch (err) {
        console.error(`[waitlist-brevo][diag] FAILURE: Welcome email network/fetch error — ${err.name}: ${err.message}`);
    }
}

/**
 * Add an email to the Brevo waitlist contact list, then send a welcome email.
 *
 * Uses `updateEnabled: true` (upsert) so re-submitting an existing email
 * does not throw an error. All successful upserts return { status: 'added' }.
 *
 * @param {string} email - Already-validated, trimmed, lowercased email address.
 * @returns {Promise<{ ok: boolean, status: 'added'|'error', message?: string }>}
 */
async function addToBrevoWaitlist(email) {
    const apiKey     = process.env.BREVO_API_KEY;
    const rawListId  = process.env.BREVO_WAITLIST_LIST_ID || '';
    const listId     = parseInt(rawListId, 10);

    // [DIAG] Log env var presence — never log secret values
    console.info('[waitlist-brevo][diag] addToBrevoWaitlist env audit:'
        + ` BREVO_API_KEY=${apiKey ? 'PRESENT' : 'MISSING'}`
        + ` BREVO_WAITLIST_LIST_ID=${rawListId ? 'PRESENT' : 'MISSING'}`
        + ` BREVO_SENDER_EMAIL=${process.env.BREVO_SENDER_EMAIL ? 'PRESENT' : 'MISSING'}`
        + ` BREVO_SENDER_NAME=${process.env.BREVO_SENDER_NAME ? 'PRESENT' : 'MISSING'}`);

    if (!apiKey) {
        console.error('[waitlist-brevo][diag] FAILURE: BREVO_API_KEY is MISSING — cannot call Brevo API.');
        return { ok: false, status: 'error', message: 'Waitlist service unavailable.' };
    }
    if (!rawListId || isNaN(listId) || listId <= 0) {
        console.error(`[waitlist-brevo][diag] FAILURE: BREVO_WAITLIST_LIST_ID is MISSING or invalid (raw: "${rawListId}", parsed: ${listId}).`);
        return { ok: false, status: 'error', message: 'Waitlist service unavailable.' };
    }
    console.info(`[waitlist-brevo][diag] Brevo config valid. Parsed listId: ${listId}.`);

    const payload = {
        email,
        listIds:       [listId],
        updateEnabled: true,
    };

    console.info('[waitlist-brevo][diag] Brevo contact add attempt started.');
    try {
        const response = await fetch(BREVO_CONTACTS_URL, {
            method:  'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept':       'application/json',
                'api-key':      apiKey,
            },
            body: JSON.stringify(payload),
        });

        console.info(`[waitlist-brevo][diag] Brevo contact API response status: HTTP ${response.status}`);

        if (response.status === 201 || response.status === 204) {
            console.info(`[waitlist-brevo] Contact added/updated successfully: ${email}`);

            // Fire welcome email — non-blocking, failure does not affect response.
            console.info('[waitlist-brevo][diag] Welcome email send attempt started.');
            sendWelcomeEmail(email).catch(() => { /* already logged inside */ });

            return { ok: true, status: 'added' };
        }

        let errBody = '';
        try { errBody = await response.text(); } catch { /* ignore */ }
        console.error(`[waitlist-brevo][diag] FAILURE: Brevo contact API returned unexpected HTTP ${response.status}. Response snippet: ${errBody.slice(0, 300)}`);
        return { ok: false, status: 'error', message: 'Something went wrong. Please try again.' };

    } catch (err) {
        console.error(`[waitlist-brevo][diag] FAILURE: Brevo contact fetch threw an error — ${err.name}: ${err.message}`);
        return { ok: false, status: 'error', message: 'Something went wrong. Please try again.' };
    }
}

module.exports = { addToBrevoWaitlist };

