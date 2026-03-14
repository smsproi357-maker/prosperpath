# FULL REPO SECURITY AUDIT

Date: 2026-03-05  
Auditor: Codex (static security review)

## Scope
- Entire repository with focus on first-party runtime code:
  - `neurowealth` frontend + Node server + Cloudflare Worker
  - root scripts and native engine (`backtest_engine.cpp`)
- Dependency risk via `npm audit --json` in:
  - `neurowealth`
  - `neurowealth/worker`

## Executive Summary
- Total findings: 13
- Critical: 3
- High: 5
- Medium: 4
- Low: 1

Top risks are active secret exposure, cross-user data isolation failure in the Node Plaid server path, and multiple DOM XSS vectors sourced from AI/user-controlled content.

## Findings

### F-01: Hardcoded API secrets in client-delivered JavaScript
- Severity: Critical
- Affected files:
  - `neurowealth/clarity-box.js:9`
  - `neurowealth/clarity-box.js:10`
  - `neurowealth/backtest.js:3522`
- Evidence:
  - OpenRouter and Tavily keys are embedded directly in frontend JS (`sk-or-v1-...`, `tvly-dev-...` patterns).
  - Any site visitor can extract and abuse these keys.
- Impact:
  - Credential theft, unauthorized API usage, billing abuse, quota exhaustion, data exfiltration via key misuse.
- Recommended fix:
  - Revoke and rotate exposed keys immediately.
  - Remove all default/fallback API keys from frontend code.
  - Route calls through backend/worker with server-side secrets only.
  - Add secret scanning in CI (e.g., gitleaks/trufflehog) and pre-commit hooks.

### F-02: Sensitive environment/session files are tracked in git
- Severity: Critical
- Affected files:
  - `neurowealth/.env`
  - `neurowealth/plaid_session.json`
  - `neurowealth/worker/.dev.vars`
- Evidence:
  - `git ls-files` shows all three files are tracked.
  - `.gitignore` exists but is untracked and therefore not protecting historical commits.
- Impact:
  - Secret/token exposure through repository history and clones.
- Recommended fix:
  - Rotate all possibly exposed credentials/tokens.
  - Stop tracking these files (`git rm --cached ...`) and commit a proper `.gitignore`.
  - Purge sensitive history (BFG/filter-repo) if this repo was shared.

### F-03: Cross-user authentication/data isolation failure in Node Plaid server path
- Severity: Critical
- Affected file:
  - `neurowealth/server.js:51`
  - `neurowealth/server.js:106`
  - `neurowealth/server.js:127`
  - `neurowealth/server.js:163`
- Evidence:
  - Single global in-memory `accessToken`/`itemId` used for all requests.
  - `/api/set_access_token` overwrites global state; `/api/holdings` and `/api/transactions` read same global state.
- Impact:
  - One user's linked brokerage data can be returned to other authenticated callers.
  - Race conditions under concurrent use.
- Recommended fix:
  - Remove global token state.
  - Bind Plaid item/access token to per-user identity in secure backend storage.
  - Enforce per-user auth context for every request.

### F-04: DOM XSS via unsanitized AI response rendering in Clarity Box
- Severity: High
- Affected file:
  - `neurowealth/clarity-box.js:479`
  - `neurowealth/clarity-box.js:519`
  - `neurowealth/clarity-box.js:482`
  - `neurowealth/clarity-box.js:490`
  - `neurowealth/clarity-box.js:498`
  - `neurowealth/clarity-box.js:506`
- Evidence:
  - AI-returned fields (`framing`, `forces`, `risks`, `scenarios`, `nextSteps`) are interpolated into HTML and injected via `innerHTML` with no sanitizer.
- Impact:
  - Script execution in user origin if model output is prompt-injected/malicious.
  - Session token theft and full UI compromise.
- Recommended fix:
  - Treat model output as untrusted.
  - Sanitize with a strict allowlist sanitizer (DOMPurify configured with minimal tags) or render as text nodes.
  - Disallow inline event handlers and scripts via CSP.

### F-05: Persistent XSS in strategy lifecycle UI (user-controlled fields)
- Severity: High
- Affected file:
  - `neurowealth/strategy-lifecycle.js:587`
  - `neurowealth/strategy-lifecycle.js:639`
  - `neurowealth/strategy-lifecycle.js:648`
  - `neurowealth/strategy-lifecycle.js:651`
- Evidence:
  - `s.name`, `v.release_notes`, `tags` are interpolated into `innerHTML` without escaping.
- Impact:
  - Stored XSS if a crafted strategy name/tag/release note is saved and later viewed.
- Recommended fix:
  - Escape all user-provided fields before HTML insertion, or use DOM text nodes.
  - Centralize safe rendering helpers and ban raw template insertion for user data.

### F-06: XSS risk in backtest auto-discovery/run rendering
- Severity: High
- Affected file:
  - `neurowealth/backtest.js:3568`
  - `neurowealth/backtest.js:2621`
- Evidence:
  - `r.label` and `r.name` are written into `innerHTML`; labels originate from AI-generated content and persisted run metadata.
- Impact:
  - Stored or reflected DOM XSS path through model output/user-modified run names.
- Recommended fix:
  - Escape labels/names before insertion or render using `textContent`.
  - Validate AI JSON fields against a strict character allowlist.

### F-07: Authentication token handling is vulnerable to XSS theft and token leakage in logs
- Severity: High
- Affected files:
  - `neurowealth/google-auth.js:180`
  - `neurowealth/google-auth.js:196`
  - `neurowealth/plaid-client.js:65`
  - `neurowealth/plaid-client.js:126`
- Evidence:
  - Full Google JWT is logged (`Encoded JWT ID token: ...`).
  - Session token is stored in web storage (`sessionStorage`).
  - Token prefixes are logged in client console.
- Impact:
  - Tokens exposed to console observers/log collectors; token theft via any XSS.
- Recommended fix:
  - Remove all token logging.
  - Store session in secure `HttpOnly`, `Secure`, `SameSite=Strict` cookies with short TTL and rotation.
  - Add CSP to reduce XSS token theft risk.

### F-08: Open proxy design can be abused and has SSRF-hardening gaps
- Severity: Medium
- Affected files:
  - `neurowealth/simple-server.js:47`
  - `neurowealth/simple-server.js:63`
  - `neurowealth/worker/src/index.js:193`
- Evidence:
  - Both server and worker expose generic `/proxy?url=...` endpoints.
  - Hostname filtering blocks private hostnames but does not perform DNS/IP resolution controls against rebinding/edge cases.
  - Simple server proxy is CORS `*` (`simple-server.js:67-69`).
- Impact:
  - Abuse as public fetch relay, potential SSRF bypass scenarios, increased attack surface.
- Recommended fix:
  - Replace generic proxy with strict domain allowlist.
  - Resolve and validate final destination IP against private/reserved ranges.
  - Add request size/time limits, content-type allowlist, auth and rate limits.

### F-09: Insecure auth bypass switch in Node API path
- Severity: Medium
- Affected file:
  - `neurowealth/server.js:20`
- Evidence:
  - `ALLOW_INSECURE_LOCAL_API === 'true'` disables auth middleware completely.
- Impact:
  - Misconfiguration can expose all `/api` routes unauthenticated.
- Recommended fix:
  - Remove this bypass in non-test code, or hard-fail unless explicit `NODE_ENV=development` and localhost binding.
  - Emit startup warning and refuse to boot with insecure mode outside local dev.

### F-10: Plaintext storage of high-value Plaid access tokens
- Severity: Medium
- Affected files:
  - `neurowealth/server.js:110`
  - `neurowealth/worker/src/index.js:274`
- Evidence:
  - Node server writes Plaid `access_token` to disk JSON.
  - Worker stores Plaid access token in KV as plaintext JSON blob.
- Impact:
  - Token compromise yields direct access to connected financial data.
- Recommended fix:
  - Encrypt tokens at rest using managed KMS/secret binding.
  - Minimize token lifetime, rotate, and isolate by user.
  - Add audit logging for token reads/writes.

### F-11: Excessive error detail exposure in auth/worker responses
- Severity: Medium
- Affected file:
  - `neurowealth/worker/src/index.js:70`
  - `neurowealth/worker/src/index.js:362`
- Evidence:
  - Returns upstream Google/token validation details and serialized backend error responses to clients.
- Impact:
  - Information disclosure useful for attacker reconnaissance.
- Recommended fix:
  - Return generic client-safe errors; log detailed internals only server-side.
  - Normalize auth failure responses.

### F-12: Dependency vulnerabilities (confirmed by npm audit)
- Severity: High/Medium/Low (mixed)
- Evidence snapshot:
  - `neurowealth` audit: 5 vulnerabilities (2 high, 3 low)
    - High: `axios` DoS advisory (transitive via `plaid`), `plaid`
    - Low: `qs`/`body-parser`/`express` chain
  - `neurowealth/worker` audit: 8 vulnerabilities (2 high, 6 moderate)
    - High: `axios`/`plaid`
    - Moderate: `wrangler`/`esbuild`/`undici` chain
- Recommended fix:
  - Upgrade direct deps first (`plaid`, `express`, `body-parser`, `wrangler`) and regenerate lockfiles.
  - Re-run `npm audit` and prioritize removing high severity advisories.
  - Pin and regularly refresh dependency baselines in CI.

### F-13: Missing baseline API hardening controls (rate limiting/security headers)
- Severity: Low
- Affected files:
  - `neurowealth/server.js`
  - `neurowealth/worker/src/index.js`
- Evidence:
  - No rate limiting/throttling, no explicit security headers stack (CSP/HSTS/X-Content-Type-Options/etc.) in custom responses.
- Impact:
  - Higher blast radius for brute-force/abuse and easier client-side exploit chaining.
- Recommended fix:
  - Add rate limiting per IP/user on auth and state-modifying routes.
  - Add security headers (CSP, HSTS, X-Frame-Options, Referrer-Policy, X-Content-Type-Options).

## Category Coverage Notes
- Security vulnerabilities: multiple confirmed.
- Broken authentication: present (session model, insecure bypass switch, token exposure).
- Unsafe API usage: present (frontend secret usage, open proxy, verbose errors).
- Database query risks: no SQL/ORM query surface observed in first-party code.
- Injection vulnerabilities: multiple DOM XSS vectors confirmed.
- Logic bugs: confirmed critical cross-user token mixing in `server.js`.
- Concurrency issues: global mutable token state causes cross-request race/data bleed.
- Hidden secrets/keys: confirmed in code and tracked env/session files.
- Dependency vulnerabilities: confirmed via `npm audit` in both Node projects.
- Architectural weaknesses: token/session architecture, plaintext secret storage, limited hardening controls.

## Remediation Priority (Suggested 7-Day Plan)
1. Immediate (same day):
- Revoke/rotate exposed API keys and Plaid tokens.
- Remove hardcoded keys from frontend and disable fallback key paths.
- Disable/retire insecure Node server path with global tokens.

2. Short-term (1-3 days):
- Fix XSS sinks in `clarity-box.js`, `strategy-lifecycle.js`, `backtest.js`, `portfolio-manager.js`.
- Move auth session to HttpOnly cookies and remove token logging.
- Restrict proxy endpoints to strict allowlists.

3. Medium-term (3-7 days):
- Upgrade vulnerable dependencies and re-audit.
- Encrypt token storage at rest and add token lifecycle controls.
- Add rate limits and security headers.

## Verification Commands Used
- Secret/risk pattern scans: `rg` across first-party code (excluding `node_modules`, `.git`, `.wrangler`).
- Dependency audit:
  - `npm.cmd audit --json` in `neurowealth`
  - `npm.cmd audit --json` in `neurowealth/worker`
- Git tracking checks:
  - `git ls-files ...`

---
This report is based on static analysis only; no dynamic penetration testing or runtime exploit simulation was performed.
