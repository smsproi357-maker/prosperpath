# Feature: Google Authentication

## 1. Purpose
Provides secure, JWT-based sign-in for users via Google Identity Services, allowing them to authenticate, save preferences, and sync cross-device data (like watchlists).

## 2. Core Functionality
- Renders the native Google Sign-In button on the client side.
- Handles the OAuth credential callback and passes the JWT to a backend server for verification.
- Initializes and manages a local session (`localStorage`/`sessionStorage`).
- Provides user profile UI rendering and a secure Sign Out mechanic.

## 3. Detailed Logic
- **Initialization:** `initGoogleAuth()` sets up Google Identity Services with `auto_select: false`.
- **Credential Response:** On successful Google login, the client receives an encoded JWT and sends a POST request to `${WORKER_API_URL}/auth/google` to verify the token signature server-side.
- **Session Setup:** Upon successful backend verification, the client stores `auth_token` and the user's basic profile details (name, picture) in `sessionStorage` and `localStorage`.
- **Data Sync:** Triggers `loadUserData()` immediately after login. Fetches cloud data (like watchlists) and preferentially overwrites local storage data.

## 4. User Flow
1. User clicks the "Sign in with Google" pill button in the app navigation.
2. A Google account selection modal securely overlays the page.
3. User selects their profile; Google directly returns the JWT token.
4. The token is verified by the backend.
5. The button transforms into a personalized UI pill (User's avatar and first name).
6. Expanding/clicking the pill provides a "Sign Out" option.

## 5. Inputs / Outputs
- **Inputs:** Google JWT credential response.
- **Outputs (from Backend verification):** User Object (Name, Email, Picture) and a session App Token (`session_token`).
- **Outputs (from User Data Sync):** User-specific synced settings (`watchlist`, etc.).

## 6. Edge Cases
- **Invalid Token / Network Drop:** `fetch` to verification endpoint fails -> Catch block fires a generic browser `alert()` and aborts session creation.
- **Stale Local Storage:** Upon load, if tokens exist in `localStorage` but fail backend validation (implicit from `loadUserData`), the system can gracefully clear invalid credentials.
- **Cross-Tab Synchronization:** Signing out clears standard storage areas to prevent data leakage. However, it requires a hard page reload `window.location.reload()` to immediately purge memory states from charts/UI.

## 7. Dependencies
- **External Script:** `https://accounts.google.com/gsi/client`.
- **Config:** `GOOGLE_CLIENT_ID` and backend route (`/api/auth/google`).
- **Data Sync Endpoints:** `/api/user/data`.

## 8. UI / UX Behavior
- **Logged Out:** Standard Google-branded pill button.
- **Roll Down Animation:** A hidden settings dropdown that features a smooth vertical roll-down and opacity fade when active.
- **Logged In:** Custom UI pill with avatar and custom hover states (turns red indicating it's a "Sign Out" action on hover).

## 9. Future Improvements
- Refactor the generic `alert()` on login failure to use a styled, in-app toast notification.
- Implement robust JWT refresh logic so users aren't abruptly logged out when token lifetimes expire.

## 10. System Role
Core authentication backbone that locks/unlocks premium personalized features across the application.

## Confidence Level
- High (explicitly observed via client-side logic).
