# Feature: Waitlist & Onboarding Flow

## 1. Purpose
The waitlist page exists to capture email registrations and build an audience prior to the full public launch of ProsperPath. It acts as the primary top-of-funnel entry point.

## 2. Core Functionality
- Provides a premium, scroll-animated landing page showcasing the platform's value propositions.
- Captures user emails via a top/bottom form.
- Integrates with Cloudflare Workers to validate submissions, rate limit, and push contacts securely to Brevo (Sendinblue).
- Triggers a fire-and-forget branded welcome email upon successful registration.

## 3. Detailed Logic
- **Client-Side:** Form submission prevents default HTTP POST. Validates email locally, disables button (shows "Joining..."), and sends a JSON payload `{email, website}` to `/api/waitlist`.
- **Server-Side (Worker):** 
  - IP-based rate limiting (5 requests / 60s).
  - Honeypot check: If the hidden `website` field is populated, the server silently returns a mock success response to trick the bot.
  - Validates email regex.
  - POSTs email to Brevo Contacts API (`https://api.brevo.com/v3/contacts`) as an upsert (`updateEnabled: true`).
  - On success, fires an asynchronous request to the Brevo SMTP API (`https://api.brevo.com/v3/smtp/email`) to send the welcome email.

## 4. User Flow
1. User lands on `waitlist.html`.
2. Reads value propositions and launch roadmap phases.
3. Enters email address into the form and submits.
4. Button enters loading state.
5. On success, the entire form is replaced with an elegant, stable inline success panel ("You're on the list ✓"). No page redirects occur.

## 5. Inputs / Outputs
- **Inputs:** `email` (string), `website` (hidden honeypot string).
- **Outputs (API Response):** JSON `{ ok: boolean, status: string, message?: string }`.

## 6. Edge Cases
- **Rate Limiting:** Hits in-memory IP rate limit -> UI button resets, displays "Too many attempts — please wait."
- **Bot Submissions:** Caught by honeypot -> Discarded serverside without hitting Brevo, but client sees success to prevent brute force retries.
- **Network/API Failures:** Server errors or unreachable endpoints -> UI displays "Could not connect" or "Something went wrong" and re-enables the form after 4 seconds.
- **Duplicate Submissions:** Brevo handles this gracefully via `updateEnabled: true`; user receives standard success UI. Welcome emails log any errors asynchronously without blocking the user flow.

## 7. Dependencies
- **Frontend:** `waitlist.html`, `waitlist.css` (standalone).
- **Backend:** `worker/src/waitlist.js` (Cloudflare Worker).
- **External Services:** Brevo v3 API (Contacts and SMTP). Requires `BREVO_API_KEY`, `BREVO_WAITLIST_LIST_ID`, `BREVO_SENDER_EMAIL`.

## 8. UI / UX Behavior
- Relies heavily on scroll-reveal (`IntersectionObserver`) for smooth, cascading fades.
- Forms use pure CSS transitions for hover and active states (gold/dark aesthetics).
- Explicit `aria-` labels for screen readers.

## 9. Future Improvements
- Automate transitioning verified waitlist emails into beta user accounts once the platform launches (Phase 02).
- Add custom fields in Brevo (e.g., "Trading Experience level") if form fields expand.

## 10. System Role
Acts as the standalone gateway for marketing efforts before the core platform features are globally accessible.

## Confidence Level
- High (explicitly observed via frontend and worker source code).
