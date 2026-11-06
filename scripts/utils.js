/**
 * Shared helpers and the generic login engine.
 *
 * Content scripts listed in the same manifest entry share one global scope,
 * so everything declared here is available to sites.js and main.js.
 */

const KAL_DEFAULT_TIMEOUT_MS = 10000;   // how long to look for a login button
const KAL_CHECK_THROTTLE_MS = 100;      // min. delay between DOM checks
const KAL_CLICK_COOLDOWN_MS = 1500;     // pause after a click before trying another step

// --- Small DOM helpers -------------------------------------------------------

function isVisible(elOrSelector) {
    const el = typeof elOrSelector === 'string'
        ? document.querySelector(elOrSelector)
        : elOrSelector;
    return !!el && el.getClientRects().length > 0;
}

function isDisabled(el) {
    return !!el.disabled || el.getAttribute('aria-disabled') === 'true';
}

/**
 * Returns true if an input has a value, or if the browser marks it as autofilled.
 * Chrome's built-in password manager keeps `value` empty for scripts until the
 * user interacts with the page, but the field still matches `:autofill`.
 */
function isFilled(el) {
    if (!el) return false;
    if (el.value && el.value.length > 0) return true;

    for (const pseudo of [':autofill', ':-webkit-autofill']) {
        try {
            if (el.matches(pseudo)) return true;
        } catch (e) {
            // Pseudo-class not supported by this browser
        }
    }
    return false;
}

/**
 * Polls until `selector` is filled (by the browser or a password manager).
 * Polling is used on purpose: autofill does not cause DOM mutations.
 */
function waitForAutoFill(selector, callback, timeoutMs = KAL_DEFAULT_TIMEOUT_MS) {
    const start = Date.now();

    const check = setInterval(() => {
        const element = document.querySelector(selector);

        if (isFilled(element)) {
            clearInterval(check);
            callback(element);
        } else if (Date.now() - start >= timeoutMs) {
            clearInterval(check);
            console.log('KIT Auto-Login: Timed out, fields were not populated.');
        }
    }, 250);
}

/**
 * Waits for an element matching `selector` to appear (MutationObserver based).
 */
function waitForElement(selector, callback, timeoutMs = KAL_DEFAULT_TIMEOUT_MS) {
    const existing = document.querySelector(selector);
    if (existing) {
        callback(existing);
        return;
    }

    const observer = new MutationObserver(() => {
        const el = document.querySelector(selector);
        if (el) {
            cleanup();
            callback(el);
        }
    });
    const timer = setTimeout(() => {
        cleanup();
        console.log(`KIT Auto-Login: Gave up waiting for ${selector}`);
    }, timeoutMs);

    function cleanup() {
        observer.disconnect();
        clearTimeout(timer);
    }

    observer.observe(document.documentElement, { childList: true, subtree: true });
}

/**
 * Notifies the background script that an auto-login action was performed on this tab
 * so it can update the toolbar badge. Safe to call in environments without runtime messaging
 * (e.g. the userscript).
 */
function notifyAutoLogin(siteKey) {
    try {
        const api = typeof browser !== 'undefined' ? browser : (typeof chrome !== 'undefined' ? chrome : null);
        if (api && api.runtime && typeof api.runtime.sendMessage === 'function') {
            const p = api.runtime.sendMessage({ type: 'kit-auto-login:triggered', siteKey });
            if (p && typeof p.catch === 'function') p.catch(() => {});
        }
    } catch (e) {
        // Ignore in contexts without an extension runtime
    }
}

// --- Generic step engine -----------------------------------------------------

/**
 * Tests a step's `path` condition against `location.pathname + location.search`.
 * @param {string|RegExp|function|undefined} condition
 *   string → substring match, RegExp → test, function(path) → boolean.
 */
function matchesPath(condition) {
    if (condition === undefined || condition === null) return true;

    const path = window.location.pathname + window.location.search;
    if (typeof condition === 'string') return path.includes(condition);
    if (condition instanceof RegExp) return condition.test(path);
    if (typeof condition === 'function') return !!condition(path);
    return true;
}

function isLoggedIn(site) {
    const indicator = site.loggedIn;
    if (!indicator) return false;
    if (typeof indicator === 'function') return !!indicator();
    return !!document.querySelector(indicator);
}

function normalizeStep(step) {
    return typeof step === 'string' ? { selector: step } : step;
}

/** Finds the first usable element for a step, or null. */
function findStepElement(step) {
    const terms = step.text === undefined
        ? null
        : [].concat(step.text).map((t) => t.toLowerCase());

    for (const el of document.querySelectorAll(step.selector)) {
        if (terms) {
            const content = (el.textContent || el.value || '').toLowerCase();
            if (!terms.some((term) => content.includes(term))) continue;
        }
        if (isDisabled(el)) continue;
        if (step.visible && !isVisible(el)) continue;
        return el;
    }
    return null;
}

function performClick(el, step) {
    const target = (step.clickInner && el.querySelector(step.clickInner)) || el;

    if (step.pointerEvents) {
        // Some frameworks only react to the full mouse event sequence
        if (typeof target.focus === 'function') target.focus();
        target.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
        target.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));
    }
    target.click();
}

/**
 * Runs a declarative site definition (see sites.js for the format).
 *
 * - Stops as soon as `loggedIn` matches.
 * - Steps are tried in order; each step is clicked at most once per URL,
 *   and only one click happens per cooldown period.
 * - In `watch` mode (SPAs) the engine keeps observing and resets when the URL
 *   changes; otherwise it gives up after `timeout` ms.
 */
function runSteps(site, siteKey) {
    const steps = (site.steps || []).map(normalizeStep);
    const timeoutMs = site.watch ? Infinity : (site.timeout || KAL_DEFAULT_TIMEOUT_MS);

    let currentUrl = window.location.href;
    let clicked = new Set();
    let lastClickAt = 0;
    let pending = null;
    let stopped = false;
    let observer = null;
    let timeoutTimer = null;

    function stop() {
        stopped = true;
        if (observer) observer.disconnect();
        clearTimeout(pending);
        clearTimeout(timeoutTimer);
    }

    function schedule(delayMs = KAL_CHECK_THROTTLE_MS) {
        if (stopped || pending !== null) return;
        pending = setTimeout(() => {
            pending = null;
            check();
        }, delayMs);
    }

    function check() {
        if (stopped) return;
        if (typeof isAutoLoginPaused === 'function' && isAutoLoginPaused()) return;

        if (window.location.href !== currentUrl) {
            // SPA navigation: allow all steps again on the new route
            currentUrl = window.location.href;
            clicked = new Set();
            lastClickAt = 0;
        }

        if (isLoggedIn(site)) {
            stop();
            return;
        }

        const sinceLastClick = Date.now() - lastClickAt;
        if (sinceLastClick < KAL_CLICK_COOLDOWN_MS) {
            schedule(KAL_CLICK_COOLDOWN_MS - sinceLastClick);
            return;
        }

        for (let i = 0; i < steps.length; i++) {
            const step = steps[i];
            if (clicked.has(i) || !matchesPath(step.path)) continue;

            const el = findStepElement(step);
            if (el) {
                clicked.add(i);
                lastClickAt = Date.now();
                notifyAutoLogin(siteKey);
                performClick(el, step);
                break;
            }
        }

        if (!site.watch && clicked.size === steps.length) stop();
    }

    observer = new MutationObserver(() => schedule());
    observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true });

    if (timeoutMs !== Infinity) {
        timeoutTimer = setTimeout(stop, timeoutMs);
    }

    check();
}

/** Starts a site definition, honouring `waitForLoad` and `delay`. */
function startSite(site, siteKey) {
    const begin = () => {
        setTimeout(() => {
            if (typeof site.run === 'function') {
                site.run(site, siteKey);
            } else {
                runSteps(site, siteKey);
            }
        }, site.delay || 0);
    };

    if (site.waitForLoad && document.readyState !== 'complete') {
        window.addEventListener('load', begin, { once: true });
    } else {
        begin();
    }
}

// --- Settings ---------------------------------------------------------------

let kalPausedUntil = 0;
let kalIdpTotpClipboard = false;

function isAutoLoginPaused() {
    return kalPausedUntil > Date.now();
}

(function initPauseListener() {
    try {
        const api = typeof browser !== 'undefined' ? browser : (typeof chrome !== 'undefined' ? chrome : null);
        if (api?.storage?.onChanged) {
            api.storage.onChanged.addListener((changes) => {
                if (changes.pausedUntil) {
                    kalPausedUntil = Number(changes.pausedUntil.newValue) || 0;
                }
                if (changes.idpTotpClipboard) {
                    kalIdpTotpClipboard = !!changes.idpTotpClipboard.newValue;
                }
            });
        }
    } catch (e) {
        // Ignore in contexts without extension storage
    }
})();

/**
 * Reads text from the clipboard when the optional `clipboardRead` permission is granted.
 * Tries `navigator.clipboard.readText()`, background message fallback, and a temporary
 * off-screen `<textarea>` with `document.execCommand('paste')` (whichever the browser supports),
 * while preserving focus on `otpInput`.
 */
async function readClipboardForOtp(otpInput) {
    // 1. Direct Async Clipboard API (supported in Firefox content scripts with clipboardRead)
    try {
        if (navigator.clipboard && typeof navigator.clipboard.readText === 'function') {
            const text = await navigator.clipboard.readText();
            if (typeof text === 'string' && text.trim()) {
                return text.trim();
            }
        }
    } catch (e) {
        // Fall through to extension fallbacks
    }

    // 2. Ask background script to read clipboard (works in Firefox background context)
    try {
        const api = typeof browser !== 'undefined' ? browser : (typeof chrome !== 'undefined' ? chrome : null);
        if (api?.runtime?.sendMessage) {
            const res = await api.runtime.sendMessage({ type: 'kit-auto-login:read-clipboard' });
            if (typeof res?.text === 'string' && res.text.trim()) {
                return res.text.trim();
            }
        }
    } catch (e) {
        // Fall through to execCommand fallback
    }

    // 3. Content script `execCommand('paste')` fallback (supported in Chrome/Edge with clipboardRead)
    try {
        const ta = document.createElement('textarea');
        ta.setAttribute('aria-hidden', 'true');
        ta.tabIndex = -1;
        ta.style.cssText = 'position:fixed;top:-9999px;left:-9999px;width:1px;height:1px;opacity:0;pointer-events:none;';
        document.body.appendChild(ta);
        ta.focus({ preventScroll: true });
        const ok = document.execCommand('paste');
        const val = ok ? ta.value : '';
        ta.remove();
        if (otpInput && typeof otpInput.focus === 'function') {
            otpInput.focus({ preventScroll: true });
        }
        if (typeof val === 'string' && val.trim()) {
            return val.trim();
        }
    } catch (e) {
        // Ignore
    }

    return '';
}

/**
 * Monitors `otpInput` on the KIT Shibboleth IdP 2FA page:
 * - If the user or a password manager fills a 6-digit code directly into `otpInput`, submits immediately.
 * - If the optional "2FA from clipboard" setting (`kalIdpTotpClipboard`) is enabled, polls the clipboard
 *   for a 6-digit TOTP code (and re-checks on window focus) and fills + submits it automatically.
 */
function startIdpOtpClipboardFlow(otpInput, submitWithCode, getLastSubmittedOtp) {
    let finished = false;

    const trySubmit = (rawCode) => {
        if (finished || isAutoLoginPaused()) return false;
        const code = (rawCode || '').trim();
        if (!/^\d{6}$/.test(code)) return false;
        if (code === getLastSubmittedOtp()) return false;
        if (submitWithCode(code)) {
            finished = true;
            cleanup();
            return true;
        }
        return false;
    };

    const onInput = () => {
        trySubmit(otpInput.value);
    };
    otpInput.addEventListener('input', onInput);

    // Check if the field already has a 6-digit code on load
    if (trySubmit(otpInput.value)) return;

    let pollTimer = null;
    const checkClipboard = async () => {
        if (finished || !kalIdpTotpClipboard || isAutoLoginPaused()) return;
        const clipText = await readClipboardForOtp(otpInput);
        trySubmit(clipText);
    };

    const onFocus = () => {
        checkClipboard();
    };

    function cleanup() {
        if (pollTimer) {
            clearInterval(pollTimer);
            pollTimer = null;
        }
        window.removeEventListener('focus', onFocus);
        otpInput.removeEventListener('input', onInput);
    }

    if (kalIdpTotpClipboard) {
        checkClipboard();
        pollTimer = setInterval(checkClipboard, 400);
        window.addEventListener('focus', onFocus);
        setTimeout(() => {
            if (pollTimer) {
                clearInterval(pollTimer);
                pollTimer = null;
            }
            window.removeEventListener('focus', onFocus);
        }, KAL_DEFAULT_TIMEOUT_MS);
    }
}

/**
 * Reads keys from `storage.sync`, automatically falling back to `storage.local`
 * if `sync` is empty (and migrating existing local settings to `sync`).
 */
async function getSettingsFromStorage(keys) {
    const api = typeof browser !== 'undefined' ? browser : (typeof chrome !== 'undefined' ? chrome : null);
    const storageObj = api?.storage;
    const primary = storageObj?.sync || storageObj?.local;
    const fallback = storageObj?.local;
    if (!primary) return {};

    const syncData = (await primary.get(keys)) || {};
    if (keys.some((k) => k in syncData) || !fallback || fallback === primary) {
        return syncData;
    }

    // One-time migration from storage.local -> storage.sync
    const localData = (await fallback.get(keys)) || {};
    if (keys.some((k) => k in localData)) {
        await primary.set(localData);
        return localData;
    }

    return {};
}

/**
 * Checks if the addon is enabled for the given site key and not temporarily paused.
 * @param {string} siteKey - The key identifying the site (e.g. 'ilias', 'campus').
 * @returns {Promise<boolean>} - Resolves to true if enabled, false otherwise.
 */
async function shouldRun(siteKey) {
    try {
        const { siteSettings = {}, pausedUntil = 0, idpTotpClipboard = false } = await getSettingsFromStorage([
            'siteSettings',
            'pausedUntil',
            'idpTotpClipboard',
        ]);
        kalPausedUntil = Number(pausedUntil) || 0;
        kalIdpTotpClipboard = !!idpTotpClipboard;
        if (isAutoLoginPaused()) {
            return false;
        }
        return siteKey in siteSettings ? !!siteSettings[siteKey] : true;
    } catch (e) {
        console.error(e);
        return true;
    }
}
