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

async function getSiteSettings() {
    const syncArea = api.storage.sync || api.storage.local;
    const localArea = api.storage.local;
    const keys = ['siteSettings', 'siteSortOrder'];

    const syncData = (await syncArea.get(keys)) || {};
    if (syncData.siteSettings || syncData.siteSortOrder) {
        return syncData.siteSettings || {};
    }

    if (localArea && localArea !== syncArea) {
        const localData = (await localArea.get(keys)) || {};
        if (localData.siteSettings || localData.siteSortOrder) {
            await syncArea.set(localData);
            return localData.siteSettings || {};
        }
    }
    return {};
}

function getSessionArea() {
    return api.storage.session || api.storage.local;
}

async function getTriggeredTabs() {
    const data = await getSessionArea().get([TAB_TRIGGERED_STORAGE_KEY]);
    return data?.[TAB_TRIGGERED_STORAGE_KEY] || {};
}

async function markTabTriggered(tabId, siteKey) {
    if (typeof tabId !== 'number') return;
    const map = await getTriggeredTabs();
    const prev = map[tabId] || { count: 0 };
    map[tabId] = {
        count: (prev.count || 0) + 1,
        siteKey: siteKey || prev.siteKey || '',
        updatedAt: Date.now(),
    };
    await getSessionArea().set({ [TAB_TRIGGERED_STORAGE_KEY]: map });
}

async function clearTabTriggered(tabId) {
    if (typeof tabId !== 'number') return;
    const map = await getTriggeredTabs();
    if (tabId in map) {
        delete map[tabId];
        await getSessionArea().set({ [TAB_TRIGGERED_STORAGE_KEY]: map });
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
    try {
        await api.action.setBadgeText({ tabId, text });
        if (text && color) {
            await api.action.setBadgeBackgroundColor({ tabId, color });
            if (typeof api.action.setBadgeTextColor === 'function') {
                await api.action.setBadgeTextColor({ tabId, color: '#ffffff' });
            }
        }
        await api.action.setTitle({
            tabId,
            title: title || 'KIT Auto-Login',
        });
    } catch (e) {
        // Tab may have closed before badge update completed
    }
}

async function updateBadgeForTab(tabId, url) {
    if (typeof tabId !== 'number') return;

    let tabUrl = url;
    if (!tabUrl) {
        try {
            const tab = await api.tabs.get(tabId);
            tabUrl = tab?.url;
        } catch (e) {
            return;
        }
    }

    const match = findSiteByUrl(tabUrl);
    const triggeredMap = await getTriggeredTabs();
    const triggered = triggeredMap[tabId];

    if (match) {
        const settings = await getSiteSettings();
        const enabled = match.siteKey in settings ? !!settings[match.siteKey] : true;

        if (enabled) {
            const hasPerm = await api.permissions.contains({ origins: getSiteOrigins(match.site) });
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

    if (details?.reason === 'install') {
        const allGranted = await api.permissions.contains({ origins: getAllOrigins() });
        if (!allGranted) {
            const url = api.runtime.getURL('options/options.html?onboarding=1');
            await api.tabs.create({ url });
        }
    }
});

api.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message?.type !== 'kit-auto-login:triggered') return false;

    (async () => {
        const tabId = sender?.tab?.id;
        if (typeof tabId === 'number') {
            await markTabTriggered(tabId, message.siteKey);
            await updateBadgeForTab(tabId, sender.tab.url);
        }
        sendResponse({ ok: true });
    })();
    return true;
});

api.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
    if (changeInfo.status === 'complete' || changeInfo.url) {
        await updateBadgeForTab(tabId, changeInfo.url || tab?.url);
    }
});

api.tabs.onActivated.addListener(async (activeInfo) => {
    if (typeof activeInfo?.tabId === 'number') {
        await updateBadgeForTab(activeInfo.tabId);
    }
});

api.tabs.onRemoved.addListener(async (tabId) => {
    await clearTabTriggered(tabId);
});

api.permissions.onAdded.addListener(() => refreshActiveTabsBadges());
api.permissions.onRemoved.addListener(() => refreshActiveTabsBadges());
api.storage.onChanged.addListener(() => refreshActiveTabsBadges());
