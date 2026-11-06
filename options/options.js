// Site labels and URLs come from the shared definitions in scripts/sites.js
const sites = KIT_SITES;

const defaultSortOrder = 'default';
const sortOrderStorageKey = 'siteSortOrder';
const pausedUntilStorageKey = 'pausedUntil';
const idpTotpClipboardStorageKey = 'idpTotpClipboard';
const PAUSE_DURATION_MS = 5 * 60 * 1000; // 5 minutes
const defaultSiteOrder = Object.keys(sites);
let lastCurrentTabSiteKey = null;
let currentPausedUntil = 0;
let pauseTickInterval = null;

// Default settings (all enabled)
const defaultSettings = Object.fromEntries(Object.keys(sites).map((key) => [key, true]));

function getApi() {
  return typeof browser !== 'undefined' ? browser : chrome;
}

function getSyncStorage() {
  const api = getApi();
  return api.storage.sync || api.storage.local;
}

/**
 * Reads keys from `storage.sync`, migrating from `storage.local` if `sync` is still empty.
 */
async function readSettings(keys) {
  const api = getApi();
  const syncArea = getSyncStorage();
  const localArea = api.storage.local;

  const syncData = (await syncArea.get(keys)) || {};
  if (keys.some((k) => k in syncData) || !localArea || localArea === syncArea) {
    return syncData;
  }

  const localData = (await localArea.get(keys)) || {};
  if (keys.some((k) => k in localData)) {
    await syncArea.set(localData);
    return localData;
  }

  return {};
}

function compareSitesByLabel(firstEntry, secondEntry) {
  return firstEntry[1].label.localeCompare(secondEntry[1].label, undefined, { sensitivity: 'base' });
}

function getSortedSiteEntries(sortOrder, pinnedKey = null) {
  const entries = Object.entries(sites);
  let sorted;

  if (sortOrder === 'asc') {
    sorted = [...entries].sort(compareSitesByLabel);
  } else if (sortOrder === 'desc') {
    sorted = [...entries].sort(compareSitesByLabel).reverse();
  } else {
    sorted = defaultSiteOrder.map((key) => [key, sites[key]]);
  }

  if (pinnedKey && pinnedKey in sites) {
    const idx = sorted.findIndex(([key]) => key === pinnedKey);
    if (idx > 0) {
      const [pinned] = sorted.splice(idx, 1);
      sorted.unshift(pinned);
    }
  }

  return sorted;
}

/**
 * Returns the siteKey matching the user's currently active tab, or null.
 * Uses `tabs.query({ active: true, currentWindow: true })` (which populates `tab.url`
 * for any origin with granted host permission) and falls back to `triggeredTabs`
 * in session storage.
 */
async function getActiveTabSiteKey() {
  const api = getApi();
  if (!api.tabs || typeof api.tabs.query !== 'function') return null;

  try {
    const tabs = await api.tabs.query({ active: true, currentWindow: true });
    const tab = tabs?.[0];
    if (!tab) return null;

    if (tab.url) {
      try {
        const hostname = new URL(tab.url).hostname;
        const match = Object.entries(sites).find(([, site]) =>
          (site.hosts || []).includes(hostname)
        );
        if (match) return match[0];
      } catch (e) {
        // Ignore invalid URLs
      }
    }

    if (typeof tab.id === 'number') {
      const sessionArea = api.storage.session || api.storage.local;
      const data = await sessionArea.get(['triggeredTabs']);
      const triggered = data?.triggeredTabs?.[tab.id];
      if (triggered?.siteKey && triggered.siteKey in sites) {
        return triggered.siteKey;
      }
    }
  } catch (e) {
    // Ignore tab query errors
  }

  return null;
}

async function saveSortOrder(sortOrder) {
  await getSyncStorage().set({ [sortOrderStorageKey]: sortOrder });
}

async function loadSortOrder() {
  const res = await readSettings([sortOrderStorageKey]);
  return res[sortOrderStorageKey] || defaultSortOrder;
}

function formatRemainingTime(ms) {
  const totalSec = Math.max(0, Math.ceil(ms / 1000));
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min}:${String(sec).padStart(2, '0')}`;
}

function renderPauseState() {
  const btn = document.getElementById('pause-toggle');
  const iconPause = document.getElementById('pause-icon-pause');
  const iconPlay = document.getElementById('pause-icon-play');
  if (!btn) return;

  const remainingMs = currentPausedUntil - Date.now();
  const isPaused = remainingMs > 0;

  btn.classList.toggle('active', isPaused);
  document.body.classList.toggle('is-paused', isPaused);

  if (iconPause) iconPause.style.display = isPaused ? 'none' : '';
  if (iconPlay) iconPlay.style.display = isPaused ? '' : 'none';

  if (isPaused) {
    const label = `Paused (${formatRemainingTime(remainingMs)} left) - Click to resume`;
    btn.title = label;
    btn.setAttribute('aria-label', label);
  } else {
    const label = 'Pause auto-login for 5 minutes';
    btn.title = label;
    btn.setAttribute('aria-label', label);
    if (pauseTickInterval) {
      clearInterval(pauseTickInterval);
      pauseTickInterval = null;
    }
  }
}

function syncPauseCountdown() {
  clearInterval(pauseTickInterval);
  pauseTickInterval = null;
  renderPauseState();
  if (currentPausedUntil > Date.now()) {
    pauseTickInterval = setInterval(renderPauseState, 1000);
  }
}

async function loadPauseState() {
  const res = await readSettings([pausedUntilStorageKey]);
  currentPausedUntil = Number(res[pausedUntilStorageKey]) || 0;
  syncPauseCountdown();
}

async function togglePause() {
  const wasPaused = currentPausedUntil > Date.now();
  currentPausedUntil = wasPaused ? 0 : Date.now() + PAUSE_DURATION_MS;
  await getSyncStorage().set({ [pausedUntilStorageKey]: currentPausedUntil });
  syncPauseCountdown();
  showStatus(wasPaused ? 'Auto-login resumed' : 'Paused for 5 minutes');
}

async function saveOptions() {
  const settings = {};
  for (const key of Object.keys(sites)) {
    const checkbox = document.getElementById(key);
    if (checkbox) {
      settings[key] = checkbox.checked;
    }
  }

  await getSyncStorage().set({ siteSettings: settings });
  showStatus();
  await refreshSitePermissionsUI();
}

function showStatus(message = 'Settings saved') {
  const status = document.getElementById('status');
  status.textContent = message;
  status.classList.add('show');
  setTimeout(() => {
    status.classList.remove('show');
  }, 2000);
}

// Utility to set all site checkboxes to a value and save
function setAllSites(value) {
  for (const key of Object.keys(sites)) {
    const checkbox = document.getElementById(key);
    if (checkbox) checkbox.checked = value;
  }
  saveOptions();
}

function enableAll() { setAllSites(true); }
function disableAll() { setAllSites(false); }

function getSiteOrigins(siteInfo) {
  return (siteInfo.hosts || []).map((host) => `https://${host}/*`);
}

function getAllOrigins() {
  const manifest = getApi().runtime.getManifest();
  const origins = new Set();
  for (const cs of manifest.content_scripts || []) {
    for (const match of cs.matches || []) {
      origins.add(match);
    }
  }
  return Array.from(origins);
}

function isOnboardingMode() {
  return new URLSearchParams(window.location.search).get('onboarding') === '1';
}

function requestOriginsPermission(origins) {
  getApi().permissions.request({ origins })
    .then(() => refreshSitePermissionsUI())
    .catch((err) => console.error('Permission request failed:', err));

  // When running inside the toolbar popup, close it so the browser's permission prompt is visible behind it
  if (!isOnboardingMode()) {
    window.close();
  }
}

/**
 * Updates per-site permission indicators (greyed out card + "Grant access" button)
 * and the first-install onboarding card.
 */
async function refreshSitePermissionsUI() {
  const api = getApi();
  let anyMissing = false;

  for (const [key, siteInfo] of Object.entries(sites)) {
    const card = document.querySelector(`.option-card[data-site-key="${key}"]`);
    if (!card) continue;

    const granted = await api.permissions.contains({ origins: getSiteOrigins(siteInfo) });
    if (!granted) {
      anyMissing = true;
    }

    const permBtn = card.querySelector('.site-perm-btn');
    card.classList.toggle('missing-permission', !granted);
    if (permBtn) {
      permBtn.style.display = granted ? 'none' : 'inline-flex';
    }
  }

  const onboardingCard = document.getElementById('onboarding-card');
  if (onboardingCard) {
    onboardingCard.style.display = (isOnboardingMode() && anyMissing) ? 'flex' : 'none';
  }
}

async function restoreOptions() {
  const container = document.getElementById('options-container');
  const sortSelect = document.getElementById('sort-order');
  const currentSortOrder = await loadSortOrder();

  if (sortSelect) {
    sortSelect.value = currentSortOrder;
  }

  const [
    { siteSettings = defaultSettings, [idpTotpClipboardStorageKey]: rawIdpTotpClipboard = false },
    currentTabSiteKey,
    hasClipboardPerm,
  ] = await Promise.all([
    readSettings(['siteSettings', idpTotpClipboardStorageKey]),
    getActiveTabSiteKey(),
    getApi().permissions.contains({ permissions: ['clipboardRead'] }).catch(() => false),
  ]);
  const idpTotpClipboard = Boolean(rawIdpTotpClipboard && hasClipboardPerm);
  if (rawIdpTotpClipboard && !hasClipboardPerm) {
    await getSyncStorage().set({ [idpTotpClipboardStorageKey]: false });
  }
  lastCurrentTabSiteKey = currentTabSiteKey;
  const sortedSites = getSortedSiteEntries(currentSortOrder, currentTabSiteKey);

  container.replaceChildren();

  for (const [key, siteInfo] of sortedSites) {
    const isCurrentTabSite = key === currentTabSiteKey;
    const hasSubOption = key === 'idp';
    const div = document.createElement('div');
    div.className = [
      'option-card',
      isCurrentTabSite ? 'current-site' : '',
      hasSubOption ? 'has-suboption' : '',
    ].filter(Boolean).join(' ');
    div.dataset.siteKey = key;

    // Label
    const labelEl = document.createElement('a');
    labelEl.className = 'option-label';

    // Bundled local favicon
    const icon = document.createElement('img');
    icon.src = `../icons/sites/${key}.ico`;
    icon.alt = '';
    icon.className = 'site-icon';
    labelEl.appendChild(icon);

    const textNode = document.createTextNode(siteInfo.label);
    labelEl.appendChild(textNode);

    labelEl.href = siteInfo.url;
    labelEl.target = '_blank';
    labelEl.rel = 'noopener noreferrer';

    // Right-side actions (per-site permission button + switch)
    const actionsEl = document.createElement('div');
    actionsEl.className = 'option-actions';

    const permBtn = document.createElement('button');
    permBtn.type = 'button';
    permBtn.className = 'site-perm-btn';
    permBtn.textContent = '\u26A0\uFE0F Grant access';
    permBtn.title = `Host permission missing for ${siteInfo.label}. Click to grant access.`;
    permBtn.style.display = 'none';
    permBtn.addEventListener('click', () => {
      requestOriginsPermission(getSiteOrigins(siteInfo));
    });

    // Switch container
    const switchLabel = document.createElement('label');
    switchLabel.className = 'switch';

    // Checkbox
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.id = key;
    checkbox.checked = key in siteSettings ? siteSettings[key] : true;
    checkbox.addEventListener('change', saveOptions);

    // Slider span
    const slider = document.createElement('span');
    slider.className = 'slider';

    switchLabel.appendChild(checkbox);
    switchLabel.appendChild(slider);

    actionsEl.appendChild(permBtn);
    actionsEl.appendChild(switchLabel);

    if (hasSubOption) {
      const mainRow = document.createElement('div');
      mainRow.className = 'option-main-row';
      mainRow.appendChild(labelEl);
      mainRow.appendChild(actionsEl);
      div.appendChild(mainRow);

      const subRow = document.createElement('div');
      subRow.className = 'option-sub-row';

      const subLabel = document.createElement('label');
      subLabel.className = 'option-sub-label';
      subLabel.htmlFor = 'idp-totp-clipboard';
      subLabel.textContent = 'Autofill 2FA code from clipboard';
      subLabel.title = 'Automatically read 6-digit TOTP code from clipboard on the KIT IdP 2FA page and submit';

      const subSwitch = document.createElement('label');
      subSwitch.className = 'switch switch-sm';

      const subCheckbox = document.createElement('input');
      subCheckbox.type = 'checkbox';
      subCheckbox.id = 'idp-totp-clipboard';
      subCheckbox.checked = idpTotpClipboard;
      subCheckbox.addEventListener('change', () => {
        if (subCheckbox.checked) {
          // Save optimistic state first in case the popup closes when showing the browser permission prompt
          getSyncStorage().set({ [idpTotpClipboardStorageKey]: true });
          getApi().permissions.request({ permissions: ['clipboardRead'] })
            .then(async (granted) => {
              subCheckbox.checked = !!granted;
              await getSyncStorage().set({ [idpTotpClipboardStorageKey]: !!granted });
              showStatus(granted ? '2FA from clipboard enabled' : 'Clipboard permission denied');
            })
            .catch(async (err) => {
              console.error('Clipboard permission request failed:', err);
              subCheckbox.checked = false;
              await getSyncStorage().set({ [idpTotpClipboardStorageKey]: false });
            });
        } else {
          getSyncStorage().set({ [idpTotpClipboardStorageKey]: false })
            .then(() => showStatus());
        }
      });

      const subSlider = document.createElement('span');
      subSlider.className = 'slider';

      subSwitch.appendChild(subCheckbox);
      subSwitch.appendChild(subSlider);

      subRow.appendChild(subLabel);
      subRow.appendChild(subSwitch);
      div.appendChild(subRow);
    } else {
      div.appendChild(labelEl);
      div.appendChild(actionsEl);
    }
    container.appendChild(div);
  }

  await refreshSitePermissionsUI();
}

function applyDarkMode(isDark) {
  document.body.classList.toggle('dark-mode', isDark);
}

function syncWithBrowserTheme() {
  if (!window.matchMedia) return;

  const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
  applyDarkMode(mediaQuery.matches);
  mediaQuery.addEventListener('change', (event) => applyDarkMode(event.matches));
}

document.addEventListener('DOMContentLoaded', () => {
  syncWithBrowserTheme();
  restoreOptions();
  loadPauseState();

  const api = getApi();
  const manifest = api.runtime.getManifest();
  const verEl = document.getElementById('version');
  if (verEl) verEl.textContent = `v${manifest.version}`;

  document.getElementById('enable-all')?.addEventListener('click', enableAll);
  document.getElementById('disable-all')?.addEventListener('click', disableAll);
  document.getElementById('pause-toggle')?.addEventListener('click', togglePause);
  document.getElementById('grant-all-permissions')?.addEventListener('click', () => {
    requestOriginsPermission(getAllOrigins());
  });

  const sortSelect = document.getElementById('sort-order');
  if (sortSelect) {
    sortSelect.addEventListener('change', async () => {
      await saveSortOrder(sortSelect.value);
      await restoreOptions();
    });
  }

  api.permissions.onAdded.addListener(() => refreshSitePermissionsUI());
  api.permissions.onRemoved.addListener(() => refreshSitePermissionsUI());

  if (api.tabs) {
    const syncActiveTabHighlight = async () => {
      const activeKey = await getActiveTabSiteKey();
      if (activeKey !== lastCurrentTabSiteKey) {
        await restoreOptions();
      }
    };
    api.tabs.onActivated?.addListener(syncActiveTabHighlight);
    api.tabs.onUpdated?.addListener((tabId, changeInfo) => {
      if (changeInfo.url || changeInfo.status === 'complete') {
        syncActiveTabHighlight();
      }
    });
  }
});
