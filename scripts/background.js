/**
 * Background service worker / background script for KIT Auto-Login.
 *
 * Responsibilities:
 *   1. Open onboarding page on fresh install if any required host permissions are missing.
 *   2. Migrate settings from storage.local to storage.sync if needed.
 *   3. Update the toolbar badge per tab:
 *      - "!" (amber) when a supported & enabled KIT site is missing host permission.
 *      - "✓" (KIT green) when auto-login was triggered on that tab.
 */

if (typeof importScripts === 'function') {
    importScripts('sites.js');
}

const api = typeof browser !== 'undefined' ? browser : chrome;
const TAB_TRIGGERED_STORAGE_KEY = 'triggeredTabs';

const BADGE_COLOR_SUCCESS = '#009682'; // KIT Green
const BADGE_COLOR_WARNING = '#f59e0b'; // Amber warning

// --- Storage helpers (sync with local fallback + session for tab state) ------

function storageGet(area, keys) {
    return new Promise((resolve) => {
        if (!area) {
            resolve({});
            return;
        }
        try {
            const res = area.get(keys);
            if (res && typeof res.then === 'function') {
                res.then((data) => resolve(data || {})).catch(() => resolve({}));
            } else {
                area.get(keys, (data) => resolve(data || {}));
            }
        } catch (e) {
            resolve({});
        }
    });
}

function storageSet(area, data) {
    return new Promise((resolve) => {
        if (!area) {
            resolve();
            return;
        }
        try {
            const res = area.set(data);
            if (res && typeof res.then === 'function') {
                res.then(resolve).catch(resolve);
            } else {
                area.set(data, () => resolve());
            }
        } catch (e) {
            resolve();
        }
    });
}

async function getSiteSettings() {
    const syncArea = api.storage && (api.storage.sync || api.storage.local);
    const localArea = api.storage && api.storage.local;
    const keys = ['siteSettings', 'siteSortOrder'];

    const syncData = await storageGet(syncArea, keys);
    if (syncData && (syncData.siteSettings || syncData.siteSortOrder)) {
        return syncData.siteSettings || {};
    }

    if (localArea && localArea !== syncArea) {
        const localData = await storageGet(localArea, keys);
        if (localData && (localData.siteSettings || localData.siteSortOrder)) {
            await storageSet(syncArea, localData);
            return localData.siteSettings || {};
        }
    }
    return {};
}

function getSessionArea() {
    return (api.storage && (api.storage.session || api.storage.local)) || null;
}

async function getTriggeredTabs() {
    const area = getSessionArea();
    const data = await storageGet(area, [TAB_TRIGGERED_STORAGE_KEY]);
    return (data && data[TAB_TRIGGERED_STORAGE_KEY]) || {};
}

async function markTabTriggered(tabId, siteKey) {
    if (typeof tabId !== 'number') return;
    const area = getSessionArea();
    const map = await getTriggeredTabs();
    const prev = map[tabId] || { count: 0 };
    map[tabId] = {
        count: (prev.count || 0) + 1,
        siteKey: siteKey || prev.siteKey || '',
        updatedAt: Date.now(),
    };
    await storageSet(area, { [TAB_TRIGGERED_STORAGE_KEY]: map });
}

async function clearTabTriggered(tabId) {
    if (typeof tabId !== 'number') return;
    const area = getSessionArea();
    const map = await getTriggeredTabs();
    if (Object.prototype.hasOwnProperty.call(map, tabId)) {
        delete map[tabId];
        await storageSet(area, { [TAB_TRIGGERED_STORAGE_KEY]: map });
    }
}

// --- Permissions helpers -----------------------------------------------------

function getAllOrigins() {
    const manifest = api.runtime.getManifest();
    const origins = new Set();
    for (const cs of manifest.content_scripts || []) {
        for (const match of cs.matches || []) {
            origins.add(match);
        }
    }
    return Array.from(origins);
}

function getSiteOrigins(site) {
    return (site.hosts || []).map((host) => `https://${host}/*`);
}

function permissionsContains(origins) {
    return new Promise((resolve) => {
        if (!api.permissions || typeof api.permissions.contains !== 'function') {
            resolve(true);
            return;
        }
        try {
            const res = api.permissions.contains({ origins });
            if (res && typeof res.then === 'function') {
                res.then((granted) => resolve(!!granted)).catch(() => resolve(true));
            } else {
                api.permissions.contains({ origins }, (granted) => resolve(!!granted));
            }
        } catch (e) {
            resolve(true);
        }
    });
}

function findSiteByUrl(url) {
    if (!url) return null;
    try {
        const parsed = new URL(url);
        if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return null;
        const entry = Object.entries(KIT_SITES).find(([, site]) =>
            (site.hosts || []).includes(parsed.hostname)
        );
        return entry ? { siteKey: entry[0], site: entry[1] } : null;
    } catch (e) {
        return null;
    }
}

// --- Toolbar badge management ------------------------------------------------

async function setBadge(tabId, text, color, title) {
    if (!api.action) return;
    try {
        await api.action.setBadgeText({ tabId, text });
        if (text && color) {
            await api.action.setBadgeBackgroundColor({ tabId, color });
            if (typeof api.action.setBadgeTextColor === 'function') {
                await api.action.setBadgeTextColor({ tabId, color: '#ffffff' });
            }
        }
        if (typeof api.action.setTitle === 'function') {
            await api.action.setTitle({
                tabId,
                title: title || 'KIT Auto-Login',
            });
        }
    } catch (e) {
        // Tab may have closed before badge update completed
    }
}

async function updateBadgeForTab(tabId, url) {
    if (typeof tabId !== 'number') return;

    let tabUrl = url;
    if (!tabUrl && api.tabs && typeof api.tabs.get === 'function') {
        try {
            const tab = await api.tabs.get(tabId);
            tabUrl = tab && tab.url;
        } catch (e) {
            return;
        }
    }

    const match = findSiteByUrl(tabUrl);
    const triggeredMap = await getTriggeredTabs();
    const triggered = triggeredMap[tabId];

    if (match) {
        const settings = await getSiteSettings();
        const enabled = Object.prototype.hasOwnProperty.call(settings, match.siteKey)
            ? !!settings[match.siteKey]
            : true;

        if (enabled) {
            const origins = getSiteOrigins(match.site);
            const hasPerm = await permissionsContains(origins);
            if (!hasPerm) {
                await setBadge(
                    tabId,
                    '!',
                    BADGE_COLOR_WARNING,
                    `KIT Auto-Login: Permission missing for ${match.site.label}`
                );
                return;
            }
        }
    }

    if (triggered && triggered.count > 0) {
        await setBadge(
            tabId,
            '\u2713',
            BADGE_COLOR_SUCCESS,
            'KIT Auto-Login: Login automated on this tab'
        );
        return;
    }

    await setBadge(tabId, '', null, 'KIT Auto-Login');
}

async function refreshActiveTabsBadges() {
    if (!api.tabs || typeof api.tabs.query !== 'function') return;
    try {
        const tabs = await api.tabs.query({ active: true });
        for (const tab of tabs || []) {
            if (typeof tab.id === 'number') {
                await updateBadgeForTab(tab.id, tab.url);
            }
        }
    } catch (e) {
        // Ignore query errors
    }
}

// --- Event listeners (registered synchronously at top level) -----------------

api.runtime.onInstalled.addListener(async (details) => {
    // Ensure any existing local settings are migrated to sync storage
    await getSiteSettings();

    if (details && details.reason === 'install') {
        const origins = getAllOrigins();
        const allGranted = await permissionsContains(origins);
        if (!allGranted && api.tabs && typeof api.tabs.create === 'function') {
            const url = api.runtime.getURL('options/options.html?onboarding=1');
            await api.tabs.create({ url });
        }
    }
});

api.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (!message || message.type !== 'kit-auto-login:triggered') return false;

    (async () => {
        const tabId = sender && sender.tab && sender.tab.id;
        if (typeof tabId === 'number') {
            await markTabTriggered(tabId, message.siteKey);
            await updateBadgeForTab(tabId, sender.tab.url);
        }
        sendResponse({ ok: true });
    })();
    return true;
});

if (api.tabs) {
    api.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
        if (changeInfo.status === 'complete' || changeInfo.url) {
            await updateBadgeForTab(tabId, changeInfo.url || (tab && tab.url));
        }
    });

    api.tabs.onActivated.addListener(async (activeInfo) => {
        if (activeInfo && typeof activeInfo.tabId === 'number') {
            await updateBadgeForTab(activeInfo.tabId);
        }
    });

    api.tabs.onRemoved.addListener(async (tabId) => {
        await clearTabTriggered(tabId);
    });
}

if (api.permissions && api.permissions.onAdded) {
    api.permissions.onAdded.addListener(() => {
        refreshActiveTabsBadges();
    });
}

if (api.permissions && api.permissions.onRemoved) {
    api.permissions.onRemoved.addListener(() => {
        refreshActiveTabsBadges();
    });
}

if (api.storage && api.storage.onChanged) {
    api.storage.onChanged.addListener(() => {
        refreshActiveTabsBadges();
    });
}
