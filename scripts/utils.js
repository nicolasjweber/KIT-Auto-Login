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
function runSteps(site) {
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
function startSite(site) {
    const begin = () => {
        setTimeout(() => {
            if (typeof site.run === 'function') {
                site.run(site);
            } else {
                runSteps(site);
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

/**
 * Checks if the addon is enabled for the given site key.
 * @param {string} siteKey - The key identifying the site (e.g. 'ilias', 'campus').
 * @returns {Promise<boolean>} - Resolves to true if enabled, false otherwise.
 */
function shouldRun(siteKey) {
    return new Promise((resolve) => {
        // Fallback for context where chrome/browser might check failed
        const storageObj = (typeof browser !== 'undefined' ? browser : chrome).storage;
        
        if (!storageObj || !storageObj.local) {
             // If permission is missing or API unavailable, run by default
             resolve(true);
             return;
        }

        const handleResult = (result) => {
            if (chrome.runtime.lastError) {
                // If checking fails, default to enabled
                console.warn('KIT Auto-Login: Error reading settings', chrome.runtime.lastError);
                resolve(true);
                return;
            }
            const settings = (result && result.siteSettings) ? result.siteSettings : {};
            // Default to true if not present in settings
            if (settings.hasOwnProperty(siteKey)) {
                resolve(settings[siteKey]);
            } else {
                resolve(true); 
            }
        };

        try {
            const result = storageObj.local.get('siteSettings');
            if (result && typeof result.then === 'function') {
                result.then(handleResult).catch(err => resolve(true));
            } else {
                storageObj.local.get('siteSettings', handleResult);
            }
        } catch (e) {
            console.error(e);
            resolve(true);
        }
    });
}
