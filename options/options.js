// Site labels and URLs come from the shared definitions in scripts/sites.js
const sites = KIT_SITES;

const defaultSortOrder = 'default';
const sortOrderStorageKey = 'siteSortOrder';
const defaultSiteOrder = Object.keys(sites);

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

function getSortedSiteEntries(sortOrder) {
  const entries = Object.entries(sites);

  if (sortOrder === 'asc') {
    return [...entries].sort(compareSitesByLabel);
  }

  if (sortOrder === 'desc') {
    return [...entries].sort(compareSitesByLabel).reverse();
  }

  return defaultSiteOrder.map((key) => [key, sites[key]]);
}

async function saveSortOrder(sortOrder) {
  await getSyncStorage().set({ [sortOrderStorageKey]: sortOrder });
}

async function loadSortOrder() {
  const res = await readSettings([sortOrderStorageKey]);
  return res[sortOrderStorageKey] || defaultSortOrder;
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

function showStatus() {
  const status = document.getElementById('status');
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

  const { siteSettings = defaultSettings } = await readSettings(['siteSettings']);
  const sortedSites = getSortedSiteEntries(currentSortOrder);

  container.replaceChildren();

  for (const [key, siteInfo] of sortedSites) {
    const div = document.createElement('div');
    div.className = 'option-card';
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

    div.appendChild(labelEl);
    div.appendChild(actionsEl);
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

  const api = getApi();
  const manifest = api.runtime.getManifest();
  const verEl = document.getElementById('version');
  if (verEl) verEl.textContent = `v${manifest.version}`;

  document.getElementById('enable-all')?.addEventListener('click', enableAll);
  document.getElementById('disable-all')?.addEventListener('click', disableAll);
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
});
