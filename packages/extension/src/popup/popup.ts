/**
 * OmniClip Popup Script
 *
 * Communicates with the service worker to display status
 * and handle user interactions (login, sync, logout).
 */

// ──────────────────────────────────────────────
// DOM elements
// ──────────────────────────────────────────────

const loginSection = document.getElementById('loginSection')!;
const dashboardSection = document.getElementById('dashboardSection')!;
const loginBtn = document.getElementById('loginBtn') as HTMLButtonElement;
const logoutBtn = document.getElementById('logoutBtn') as HTMLButtonElement;
const tokenInput = document.getElementById('tokenInput') as HTMLInputElement;
const serverUrlInput = document.getElementById('serverUrl') as HTMLInputElement;
const loginError = document.getElementById('loginError')!;
const platformCards = document.getElementById('platformCards')!;
const versionSpan = document.getElementById('version')!;

// ──────────────────────────────────────────────
// Init
// ──────────────────────────────────────────────

versionSpan.textContent = chrome.runtime.getManifest().version;
loadStatus();

// ──────────────────────────────────────────────
// Event listeners
// ──────────────────────────────────────────────

loginBtn.addEventListener('click', async () => {
  const token = tokenInput.value.trim();
  const backendUrl = serverUrlInput.value.trim();

  if (!token) {
    showLoginError('Please enter your access token.');
    return;
  }

  loginBtn.disabled = true;
  loginBtn.textContent = 'Signing in...';
  hideLoginError();

  try {
    const response = await chrome.runtime.sendMessage({
      type: 'POPUP_LOGIN',
      token,
      backendUrl: backendUrl || undefined,
    });

    if (response?.success) {
      loadStatus();
    } else {
      showLoginError(response?.error || 'Login failed. Please try again.');
    }
  } catch (err) {
    showLoginError('Could not connect to extension. Please reload.');
  } finally {
    loginBtn.disabled = false;
    loginBtn.textContent = 'Sign In';
  }
});

logoutBtn.addEventListener('click', async () => {
  try {
    await chrome.runtime.sendMessage({ type: 'POPUP_LOGOUT' });
    loadStatus();
  } catch {
    // Reload popup on error
    window.location.reload();
  }
});

// ──────────────────────────────────────────────
// Status loading
// ──────────────────────────────────────────────

async function loadStatus(): Promise<void> {
  try {
    const status = await chrome.runtime.sendMessage({ type: 'POPUP_GET_STATUS' });

    if (!status || status.error) {
      showLogin();
      return;
    }

    if (!status.loggedIn) {
      showLogin();
      return;
    }

    showDashboard(status.platforms);
  } catch {
    showLogin();
  }
}

function showLogin(): void {
  loginSection.classList.remove('hidden');
  dashboardSection.classList.add('hidden');
  logoutBtn.classList.add('hidden');
}

function showDashboard(platforms: Record<string, PlatformStatus>): void {
  loginSection.classList.add('hidden');
  dashboardSection.classList.remove('hidden');
  logoutBtn.classList.remove('hidden');

  renderPlatformCards(platforms);
}

function showLoginError(msg: string): void {
  loginError.textContent = msg;
  loginError.classList.remove('hidden');
}

function hideLoginError(): void {
  loginError.classList.add('hidden');
}

// ──────────────────────────────────────────────
// Platform cards rendering
// ──────────────────────────────────────────────

interface PlatformStatus {
  connectionId: string | null;
  itemsBuffered: number;
  lastSync: number;
  errorCount: number;
  status: string;
}

const PLATFORM_LABELS: Record<string, string> = {
  xiaohongshu: 'Xiaohongshu',
  twitter: 'X / Twitter',
};

function renderPlatformCards(platforms: Record<string, PlatformStatus>): void {
  platformCards.innerHTML = '';

  for (const [platform, info] of Object.entries(platforms)) {
    const card = document.createElement('div');
    card.className = 'platform-card';

    const lastSyncText = info.lastSync > 0 ? formatTimeAgo(info.lastSync) : 'Never';

    let errorHtml = '';
    if (info.status === 'error') {
      errorHtml = `<div class="error-msg">
        Sync failed ${info.errorCount} times. Check your connection or re-login to ${PLATFORM_LABELS[platform] ?? platform}.
      </div>`;
    }

    card.innerHTML = `
      <div class="platform-header">
        <span class="platform-name">${PLATFORM_LABELS[platform] ?? platform}</span>
        <span class="badge ${info.status}">${info.status}</span>
      </div>
      <div class="platform-stats">
        <span>Buffered: ${info.itemsBuffered}</span>
        <span>Last sync: ${lastSyncText}</span>
      </div>
      <button class="sync-btn" data-platform="${platform}" ${info.itemsBuffered === 0 ? 'disabled' : ''}>
        Sync Now
      </button>
      ${errorHtml}
    `;

    const syncBtn = card.querySelector('.sync-btn') as HTMLButtonElement;
    syncBtn.addEventListener('click', () => handleSyncClick(platform, syncBtn));

    platformCards.appendChild(card);
  }
}

async function handleSyncClick(platform: string, btn: HTMLButtonElement): Promise<void> {
  btn.disabled = true;
  btn.textContent = 'Syncing...';

  try {
    const result = await chrome.runtime.sendMessage({
      type: 'POPUP_MANUAL_SYNC',
      platform,
    });

    if (result?.success) {
      btn.textContent = 'Done!';
      setTimeout(() => loadStatus(), 1000);
    } else {
      btn.textContent = 'Failed';
      setTimeout(() => loadStatus(), 2000);
    }
  } catch {
    btn.textContent = 'Error';
    setTimeout(() => loadStatus(), 2000);
  }
}

// ──────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────

function formatTimeAgo(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);

  if (seconds < 60) return 'Just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}
