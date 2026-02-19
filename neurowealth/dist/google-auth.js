// -------------------- Google Authentication Logic --------------------

// Toggles the Auth Dropdown Menu
function toggleAuthMenu() {
    const wrapper = document.getElementById('auth-wrapper');
    if (wrapper) wrapper.classList.toggle('active');
}


// Configuration
const GOOGLE_CLIENT_ID = '994032112748-0bsoc6g5726fda4r02p2k4tjs72prn5f.apps.googleusercontent.com'; // Set by user
const WORKER_API_URL = window.WORKER_API_URL || 'https://neurowealth-worker.smsproi357.workers.dev/api';

// Global User State
window.currentUser = null;

// Initialize Google Identity Services
function initGoogleAuth() {
    google.accounts.id.initialize({
        client_id: GOOGLE_CLIENT_ID,
        callback: handleCredentialResponse,
        auto_select: false, // Don't auto-sign in to avoid annoyance
        cancel_on_tap_outside: true
    });

    renderLoginButton();
}

// Render the Sign-In / User Profile Button
function renderLoginButton() {
    const container = document.getElementById('auth-container');
    const wrapper = document.getElementById('auth-wrapper');
    if (!container || !wrapper) return;

    // Inject custom styles if not present
    if (!document.getElementById('google-auth-styles')) {
        const style = document.createElement('style');
        style.id = 'google-auth-styles';
        style.textContent = `
            .user-profile {
                display: flex;
                align-items: center;
                gap: 12px;
                padding: 10px 16px;
                border-radius: var(--radius-lg, 12px);
                background: rgba(255, 255, 255, 0.05);
                border: 1px solid var(--color-border);
                cursor: pointer;
                transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
                width: 100%;
            }
            .user-profile:hover {
                background: rgba(255, 107, 107, 0.1);
                border-color: var(--color-danger);
            }
            .user-info {
                display: flex;
                flex-direction: column;
                line-height: 1.2;
            }
            .user-name {
                font-size: 0.85rem;
                font-weight: 600;
                color: var(--color-text-primary);
            }
            .user-status {
                font-size: 0.7rem;
                color: var(--color-danger);
                font-weight: 700;
                text-transform: uppercase;
            }
            .user-pic {
                width: 28px;
                height: 28px;
                border-radius: 50%;
                border: 1.5px solid var(--color-accent);
            }
            
            /* Vertical "Roll Down" Animation */
            .auth-rolldown-container {
                position: absolute;
                top: calc(100% + 10px);
                right: 0;
                width: 220px;
                height: 0;
                opacity: 0;
                overflow: hidden;
                background: var(--color-surface, #141d2b);
                border: 1px solid var(--color-border);
                border-radius: var(--radius-lg, 12px);
                box-shadow: var(--shadow-xl);
                transition: height 0.8s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.4s ease, transform 0.6s ease;
                transform: translateY(-10px);
                z-index: 1000;
                padding: 0;
                display: flex;
                flex-direction: column;
                justify-content: center;
                pointer-events: none;
            }
            
            .auth-rolldown-container.active {
                height: 70px; /* Specific height for one item */
                opacity: 1;
                transform: translateY(0);
                padding: 10px;
                pointer-events: all;
            }

            /* Settings Button Styling */
            .settings-icon-btn {
                width: 40px;
                height: 40px;
                display: flex;
                align-items: center;
                justify-content: center;
                background: rgba(255, 255, 255, 0.05);
                border: 1px solid var(--color-border);
                border-radius: var(--radius-lg, 12px);
                color: var(--color-text-primary);
                font-size: 1.2rem;
                transition: all 0.3s ease;
                cursor: pointer;
            }
            .settings-icon-btn:hover {
                background: rgba(0, 212, 170, 0.1);
                border-color: var(--color-accent);
                transform: rotate(45deg);
            }
        `;
        document.head.appendChild(style);

        // --- Logic: Slow Roll Down for Guest on Load ---
        setTimeout(() => {
            if (!window.currentUser) {
                const wrapper = document.getElementById('auth-wrapper');
                if (wrapper) wrapper.classList.add('active');
            }
        }, 1200);
    }

    if (window.currentUser) {
        // Logged In State: Hidden by default, appears as "Sign Out" when manually toggled
        container.innerHTML = `
            <div class="user-profile" title="Signed in as ${window.currentUser.name}">
                <img src="${window.currentUser.picture}" alt="User" class="user-pic">
                <div class="user-info">
                    <span class="user-name">${window.currentUser.name.split(' ')[0]}</span>
                    <span class="user-status">Sign Out</span>
                </div>
            </div>
        `;

        container.querySelector('.user-profile').onclick = handleSignOut;

        // Ensure menu hides instantly after login if it was open
        wrapper.classList.remove('active');
    } else {
        // Logged Out State - Native Google Button
        const btnDiv = document.createElement('div');
        container.innerHTML = '';
        container.appendChild(btnDiv);

        google.accounts.id.renderButton(
            btnDiv,
            {
                theme: 'filled_black',
                size: 'large',
                shape: 'pill',
                width: 200,
                text: 'signin_with'
            }
        );
    }
}


// Handle Login Success
async function handleCredentialResponse(response) {
    console.log("Encoded JWT ID token: " + response.credential);

    // Verify with Backend
    try {
        const verifyResponse = await fetch(`${WORKER_API_URL}/auth/google`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token: response.credential })
        });

        if (!verifyResponse.ok) throw new Error('Auth Verification Failed');

        const userData = await verifyResponse.json();

        // Save Session
        window.currentUser = userData.user;
        localStorage.setItem('auth_token', userData.session_token);
        localStorage.setItem('user_profile', JSON.stringify(userData.user));

        // Note: For simplicity, we might just store the User info returned from verification
        // decodeJwt is simple enough to do client side for display, but verifying signature requires backend.
        // Let's assume backend returns the user profile.

        console.log('Logged in as:', window.currentUser.name);

        renderLoginButton();

        // Trigger generic "Login Success" event for other scripts to listen to
        window.dispatchEvent(new Event('auth-login-success'));

        // Load User Data (Watchlist, etc.)
        await loadUserData();

    } catch (e) {
        console.error('Login Failed:', e);
        alert('Login failed. Please try again.');
    }
}

// Handle Sign Out
function handleSignOut() {
    window.currentUser = null;
    localStorage.removeItem('auth_token');
    localStorage.removeItem('user_profile');
    google.accounts.id.disableAutoSelect(); // Prevent auto-relogin

    renderLoginButton();
    window.location.reload(); // Simplest way to reset app state (charts, etc)
}


// -------------------- Data Sync Logic --------------------

async function loadUserData() {
    if (!window.currentUser) return;

    try {
        const token = localStorage.getItem('auth_token');
        const res = await fetch(`${WORKER_API_URL}/user/data`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (res.ok) {
            const cloudData = await res.json();

            // Merge or Replace Watchlist? 
            // Strategy: Cloud wins. 
            if (cloudData.watchlist) {
                localStorage.setItem('user_watchlist', JSON.stringify(cloudData.watchlist));
                // Update UI if needed
                // Currently Watchlist is read from localStorage on render, so reload might be needed or re-render
            }

            console.log('User data synced from cloud.');
        }
    } catch (e) {
        console.warn('Sync Error:', e);
    }
}

// Helper: JWT Decode (for immediate UI feedback before backend verify if desired, optional)
function parseJwt(token) {
    try {
        var base64Url = token.split('.')[1];
        var base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
        var jsonPayload = decodeURIComponent(window.atob(base64).split('').map(function (c) {
            return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
        }).join(''));
        return JSON.parse(jsonPayload);
    } catch (e) {
        return null;
    }
}

// Auto-Load on startup if token exists
// (This requires validating token validity, typically done by trying to fetch user data)
window.addEventListener('load', async () => {
    const token = localStorage.getItem('auth_token');
    const profile = localStorage.getItem('user_profile');

    if (token && profile) {
        try {
            window.currentUser = JSON.parse(profile);
            console.log('Restoring session for:', window.currentUser.name);

            // Re-render immediately to show signed-in state
            renderLoginButton();

            // Validate token and sync data in background
            await loadUserData();
        } catch (e) {
            console.error('Failed to restore session:', e);
            localStorage.removeItem('auth_token');
            localStorage.removeItem('user_profile');
        }
    }
});
