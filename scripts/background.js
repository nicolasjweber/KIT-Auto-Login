/**
 * Background service worker / background script for KIT Auto-Login.
 *
 * Responsibilities:
 *   1. Open onboarding page on fresh install if any required host permissions are missing.
 *   2. Migrate settings from storage.local to storage.sync if needed.
 *   3. Update the toolbar badge:
 *      - "!" (amber) globally when any enabled KIT site is missing host permission.
 *      - "✓" (KIT green) on a tab when auto-login was triggered on that tab.
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

async function findMissingEnabledSite() {
    const settings = await getSiteSettings();
    for (const [key, site] of Object.entries(KIT_SITES)) {
        const enabled = key in settings ? !!settings[key] : true;
        if (!enabled) continue;
        const hasPerm = await api.permissions.contains({ origins: getSiteOrigins(site) });
        if (!hasPerm) {
            return site;
        }
    }
    return null;
}

// --- Toolbar badge management ------------------------------------------------

async function setTabBadge(tabId, text, color, title) {
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

async function updateGlobalPermissionBadge() {
    try {
        const missingSite = await findMissingEnabledSite();
        if (missingSite) {
            await api.action.setBadgeText({ text: '!' });
            await api.action.setBadgeBackgroundColor({ color: BADGE_COLOR_WARNING });
            if (typeof api.action.setBadgeTextColor === 'function') {
                await api.action.setBadgeTextColor({ color: '#ffffff' });
            }
            await api.action.setTitle({
                title: `KIT Auto-Login: Permission missing for ${missingSite.label}`,
            });
        } else {
            await api.action.setBadgeText({ text: '' });
            await api.action.setTitle({ title: 'KIT Auto-Login' });
        }
    } catch (e) {
        // Ignore badge errors
    }
}

// --- Event listeners (registered synchronously at top level) -----------------

api.runtime.onInstalled.addListener(async (details) => {
    // Ensure any existing local settings are migrated to sync storage
    await getSiteSettings();
    await updateGlobalPermissionBadge();

    if (details?.reason === 'install') {
        const allGranted = await api.permissions.contains({ origins: getAllOrigins() });
        if (!allGranted) {
            const url = api.runtime.getURL('options/options.html?onboarding=1');
            await api.tabs.create({ url });
        }
    }
});

if (api.runtime.onStartup) {
    api.runtime.onStartup.addListener(() => {
        updateGlobalPermissionBadge();
    });
}

api.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message?.type !== 'kit-auto-login:triggered') return false;

    (async () => {
        const tabId = sender?.tab?.id;
        if (typeof tabId === 'number') {
            await markTabTriggered(tabId, message.siteKey);
            await setTabBadge(
                tabId,
                '\u2713',
                BADGE_COLOR_SUCCESS,
                'KIT Auto-Login: Login automated on this tab'
            );
        }
        sendResponse({ ok: true });
    })();
    return true;
});

api.tabs.onRemoved.addListener(async (tabId) => {
    await clearTabTriggered(tabId);
});

api.permissions.onAdded.addListener(() => updateGlobalPermissionBadge());
api.permissions.onRemoved.addListener(() => updateGlobalPermissionBadge());
api.storage.onChanged.addListener(() => updateGlobalPermissionBadge());
