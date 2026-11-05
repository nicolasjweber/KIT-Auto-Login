// ==UserScript==
// @name        KIT Auto-Login
// @version     2026.11.2
// @description Automatically clicks through various KIT login pages (ILIAS, CAS Campus and other services).
// @author      nicolasjweber
// @homepageURL https://github.com/nicolasjweber/KIT-Auto-Login
// @downloadURL https://raw.githubusercontent.com/nicolasjweber/KIT-Auto-Login/main/kit_auto_login.user.js
// @updateURL   https://raw.githubusercontent.com/nicolasjweber/KIT-Auto-Login/main/kit_auto_login.user.js
// @match       https://idp.scc.kit.edu/*
// @match       https://ilias.studium.kit.edu/*
// @match       https://koala.kit.edu/*
// @match       https://ilias-medien.bibliothek.kit.edu/*
// @match       https://campus.studium.kit.edu/*
// @match       https://lt2srv.iar.kit.edu/*
// @match       https://lecture-translator.kit.edu/*
// @match       https://bewerbung.studium.kit.edu/*
// @match       https://plus.campus.kit.edu/*
// @match       https://portal.wiwi.kit.edu/*
// @match       https://gitlab.kit.edu/*
// @match       https://my.scc.kit.edu/*
// @match       https://fels.scc.kit.edu/*
// @match       https://login.bwidm.de/*
// @match       https://bwidm.scc.kit.edu/*
// @match       https://ki-toolbox.scc.kit.edu/*
// @match       https://hub.bwjupyter.de/*
// @match       https://bwsyncandshare.kit.edu/*
// @match       https://mein-hochschul.sport.kit.edu/*
// @match       https://signmeup.studium.kit.edu/*
// @run-at      document-idle
// @grant       none
// ==/UserScript==

(function() {
    'use strict';

    // This file mirrors the browser extension (scripts/utils.js, scripts/sites.js,
    // scripts/federated_login_main.js). Run `node .github/scripts/build-userscript.js`
    // after changing site definitions or engine logic.

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

    /**
     * Declarative definitions of all supported sites.
     *
     * Used by the content scripts (main.js) and by the options page (labels/urls).
     * The order of this object is the "default" order on the options page.
     *
     * Site fields:
     *   label        Name shown on the options page.
     *   url          Link opened from the options page.
     *   hosts        Exact hostnames this definition applies to. These must also be
     *                listed in the `matches` of the content script in manifest.json.
     *   loggedIn     CSS selector or function() → boolean. If it matches, nothing is clicked.
     *   steps        Login buttons to click, tried in order. A step is a CSS selector string or:
     *                  selector       CSS selector (required)
     *                  text           string or array; element text must contain one (case-insensitive)
     *                  path           string (substring), RegExp or function(path) on pathname + search
     *                  visible        only click if the element is rendered
     *                  clickInner     CSS selector of a child to click instead (falls back to the element)
     *                  pointerEvents  send focus/mousedown/mouseup before click (for picky frameworks)
     *   watch        Keep observing for SPA navigation instead of giving up after `timeout`.
     *   timeout      Milliseconds to look for buttons (default 10000, ignored with `watch`).
     *   delay        Milliseconds to wait before starting.
     *   waitForLoad  Wait for the window `load` event before starting.
     *   run          Custom function(site) used instead of the step engine.
     */

    const KIT_SITES = {
        idp: {
            label: "Shibboleth Identity Provider",
            url: "https://idp.scc.kit.edu",
            hosts: ["idp.scc.kit.edu"],
            run: runIdpLogin,
        },
        ilias: {
            label: "ILIAS",
            url: "https://ilias.studium.kit.edu",
            hosts: ["ilias.studium.kit.edu"],
            loggedIn: ".il-avatar",
            steps: [
                // Step 2: on the login selection page
                { selector: "#button_shib_login", path: "/login" },
                // Step 1: on any other page while logged out
                { selector: '.header-inner a[href*="login.php"]', path: (p) => !p.includes("/login") },
            ],
        },
        campus: {
            label: "Campus Management",
            url: "https://campus.studium.kit.edu",
            hosts: ["campus.studium.kit.edu"],
            steps: [
                ".login-link.ui-login",
                ".shib-login.shib-button",
            ],
        },
        campus_plus: {
            label: "Campus Plus Portal",
            url: "https://plus.campus.kit.edu",
            hosts: ["plus.campus.kit.edu"],
            loggedIn: 'button[title="Abmelden"], button[title="Sign Out"]',
            steps: ['a[href^="/api/user/oidc-login"]'],
        },
        wiwi_portal: {
            label: "WiWi Portal",
            url: "https://portal.wiwi.kit.edu",
            hosts: ["portal.wiwi.kit.edu"],
            loggedIn: 'a[href="/account/logout"]',
            watch: true,
            steps: [
                'a[href^="/api/account/login-oidc"]',
                'a[href^="/account/login"]',
            ],
        },
        scc: {
            label: "SCC Self-Service",
            url: "https://my.scc.kit.edu",
            hosts: ["my.scc.kit.edu"],
            loggedIn: "a#logout",
            steps: ["a.loginlogout"],
        },
        bwjupyter: {
            label: "bwJupyter",
            url: "https://hub.bwjupyter.de",
            hosts: ["hub.bwjupyter.de"],
            steps: ['a[href^="/hub/oauth_login"]'],
        },
        bwsyncandshare: {
            label: "bwSync&Share",
            url: "https://bwsyncandshare.kit.edu",
            hosts: ["bwsyncandshare.kit.edu"],
            steps: ['a[href*="/apps/user_saml/saml/login"]'],
        },
        gitlab: {
            label: "GitLab",
            url: "https://gitlab.kit.edu",
            hosts: ["gitlab.kit.edu"],
            loggedIn: 'a[href*="/sign_out"]',
            steps: [
                // Prefer the SSO (omniauth) button, fall back to the first submit button
                { selector: 'form[action^="/users/auth/"] button[type="submit"], a[href^="/users/auth/"]', path: "/users/sign_in" },
                { selector: 'button[type="submit"]', path: "/users/sign_in" },
            ],
        },
        hochschulsport: {
            label: "Hochschulsport",
            url: "https://mein-hochschul.sport.kit.edu",
            hosts: ["mein-hochschul.sport.kit.edu"],
            watch: true,
            delay: 800, // let the SPA bind its event handlers
            steps: [
                { selector: '[data-test-id="saml-login-button"]', path: /^\/[^?]*login/, visible: true, pointerEvents: true },
                { selector: ".btn-primary", text: ["log", "anmeld"], path: /^\/[^?]*login/, visible: true, pointerEvents: true },
            ],
        },
        signmeup: {
            label: "SignMeUp",
            url: "https://signmeup.studium.kit.edu",
            hosts: ["signmeup.studium.kit.edu"],
            loggedIn: 'a[href="/user/settings"]',
            watch: true,
            steps: [
                { selector: 'a[href="/api/user/oidc-login"]', clickInner: "button" },
                { selector: 'a[href="/user/login"]', clickInner: "button" },
            ],
        },
        ki_toolbox: {
            label: "KI Toolbox",
            url: "https://ki-toolbox.scc.kit.edu/auth",
            hosts: ["ki-toolbox.scc.kit.edu"],
            loggedIn: () => isVisible("#sidebar"),
            waitForLoad: true,
            delay: 1000, // the app may briefly show /auth before restoring an existing session
            steps: [
                { selector: "button", text: "Continue with KIT-Account", path: "/auth" },
            ],
        },
        bewerbung: {
            label: "Application Portal",
            url: "https://bewerbung.studium.kit.edu",
            hosts: ["bewerbung.studium.kit.edu"],
            steps: [
                // The button has a generic (potentially changing) class name, so match by text
                { selector: "button", text: ["Mit KIT-Account anmelden", "Login with KIT account"] },
            ],
        },
        ilias_medien: {
            label: "ILIAS Medienportal",
            url: "https://ilias-medien.bibliothek.kit.edu",
            hosts: ["ilias-medien.bibliothek.kit.edu"],
            steps: [
                { selector: 'a.login-button[href*="/auth"]', path: "/login" },
            ],
        },
        lecture_translator: {
            label: "Lecture Translator",
            url: "https://lecture-translator.kit.edu",
            hosts: ["lecture-translator.kit.edu", "lt2srv.iar.kit.edu"],
            loggedIn: 'a[href="/logout"]',
            steps: [
                // Intermediate auth page
                { selector: 'a[href^="/dex/auth/shib"]', path: "/dex/auth" },
                // Main page, logged out
                { selector: 'img[alt="Login"]', path: (p) => !p.includes("/dex/auth") },
            ],
        },
        fels: {
            label: "Federated Login Service",
            url: "https://fels.scc.kit.edu",
            hosts: ["fels.scc.kit.edu"],
            run: startFederatedLogin,
        },
        bwidm: {
            label: "Federated Identity Management",
            url: "https://login.bwidm.de",
            hosts: ["login.bwidm.de", "bwidm.scc.kit.edu"],
            run: startFederatedLogin,
        },
        koala: {
            label: "KOALA",
            url: "https://koala.kit.edu",
            hosts: ["koala.kit.edu"],
            loggedIn: ".il-avatar",
            steps: ["#button_shib_login"],
        },
    };

    // --- Custom site logic -------------------------------------------------------

    const IDP_MAX_ATTEMPTS = 2;
    const IDP_ATTEMPT_WINDOW_MS = 2 * 60 * 1000;
    const IDP_ATTEMPTS_KEY = "kitAutoLogin.idpAttempts";

    function getRecentIdpAttempts() {
        try {
            const stored = JSON.parse(sessionStorage.getItem(IDP_ATTEMPTS_KEY) || "[]");
            return stored.filter((time) => Date.now() - time < IDP_ATTEMPT_WINDOW_MS);
        } catch (e) {
            return [];
        }
    }

    /**
     * Submits the IdP login form once the password manager has filled it.
     * Gives up after IDP_MAX_ATTEMPTS automatic submits within a short window
     * (per tab), so outdated stored credentials cannot cause an account lockout.
     */
    function runIdpLogin(site, siteKey = "idp") {
        const attempts = getRecentIdpAttempts();
        if (attempts.length >= IDP_MAX_ATTEMPTS) {
            console.warn("KIT Auto-Login: Automatic login failed repeatedly, please log in manually.");
            return;
        }

        waitForAutoFill("#password", () => {
            // Double check username just in case
            if (!isFilled(document.querySelector("#username"))) return;

            const submit = document.querySelector("#sbmt");
            if (!submit) return;

            attempts.push(Date.now());
            try {
                sessionStorage.setItem(IDP_ATTEMPTS_KEY, JSON.stringify(attempts));
            } catch (e) {
                // Storage unavailable; still submit
            }
            notifyAutoLogin(siteKey);
            submit.click();
        });
    }

    /**
     * FeLS / bwIDM need access to the page's PrimeFaces object, so the actual work
     * happens in federated_login_main.js (MAIN world). This only signals it to start.
     */
    function startFederatedLogin(site, siteKey = "fels") {
        notifyAutoLogin(siteKey);
        document.documentElement.dataset.kitAutoLogin = "federated";
        document.dispatchEvent(new CustomEvent("kit-auto-login:federated"));
    }

    // --- Userscript overrides ---------------------------------------------------

    // Safari / Userscript IdP login: support both Passkey login (button#passkeys_login)
    // and password autofill (#password -> #sbmt) so whichever method the user uses
    // completes automatically.
    function runUserscriptIdpLogin(site, siteKey = 'idp') {
        const attempts = getRecentIdpAttempts();
        if (attempts.length >= IDP_MAX_ATTEMPTS) {
            console.warn('KIT Auto-Login: Automatic login failed repeatedly, please log in manually.');
            return;
        }

        // 1. Trigger Passkey login if the button is present (or appears)
        waitForElement('button#passkeys_login', (passkeyBtn) => {
            if (!isDisabled(passkeyBtn)) {
                passkeyBtn.click();
            }
        });

        // 2. Also watch for password autofill (if the user cancels passkeys or uses a password manager)
        runIdpLogin(site, siteKey);
    }

    KIT_SITES.idp.run = runUserscriptIdpLogin;

    // Userscripts run isolated from the page, so inject the PrimeFaces logic
    // (same code as scripts/federated_login_main.js in the extension)
    // Runs in the page's MAIN world on https://fels.scc.kit.edu/*, https://login.bwidm.de/*
    // and https://bwidm.scc.kit.edu/* so it can use the page's PrimeFaces object.
    //
    // It does nothing until the isolated content script (which can read the extension
    // settings) signals that auto-login is enabled for this site.

    function federatedLoginMain() {
        const SIGNAL_EVENT = 'kit-auto-login:federated';
        const TIMEOUT_MS = 10000;
        let started = false;

        function waitForElement(selector, callback) {
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
            const timer = setTimeout(cleanup, TIMEOUT_MS);

            function cleanup() {
                observer.disconnect();
                clearTimeout(timer);
            }

            observer.observe(document.documentElement, { childList: true, subtree: true });
        }

        // FeLS: PrimeFaces autocomplete
        function selectViaAutocomplete(input) {
            input.focus();
            input.value = 'KIT';

            // Trigger PrimeFaces autocomplete search
            const widget = window.PrimeFaces && PrimeFaces.getWidgetById('searchAutocompl');
            if (widget && widget.search) {
                widget.search('KIT');
            } else {
                // Fallback
                input.dispatchEvent(new Event('input', { bubbles: true }));
                input.dispatchEvent(new Event('change', { bubbles: true }));
                PrimeFaces.ab({ s: "searchAutocompl", e: "change", f: "form", p: "searchAutocompl", u: "infoPnl" });
            }

            // Need to wait for autocomplete results to appear
            setTimeout(() => {
                input.dispatchEvent(new KeyboardEvent('keydown', {
                    bubbles: true, cancelable: true, key: 'Enter', keyCode: 13, which: 13
                }));

                setTimeout(() => {
                    PrimeFaces.ab({ s: "login", f: "form", u: "form" });
                }, 500);
            }, 500);
        }

        // bwIDM: PrimeFaces filtered select list
        function selectViaFilter(input) {
            input.focus();
            input.value = 'KIT';

            // Trigger PrimeFaces filter
            input.dispatchEvent(new Event('input', { bubbles: true }));
            input.dispatchEvent(new Event('change', { bubbles: true }));
            input.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: 'T' }));

            // Need to wait for filter results to appear
            setTimeout(() => {
                const listItems = document.querySelectorAll('.ui-selectlistbox-item');
                for (const item of listItems) {
                    if (item.style.display !== 'none') {
                        item.click();
                        break;
                    }
                }

                setTimeout(() => {
                    const loginBtn = document.getElementById('login');
                    if (loginBtn) {
                        loginBtn.click();
                    } else {
                        PrimeFaces.ab({ s: "login", f: "form", u: "form" });
                    }
                }, 500);
            }, 500);
        }

        function start() {
            if (started) return;
            started = true;

            waitForElement('#searchAutocompl_input, #selectBox_filter', (inputField) => {
                if (inputField.id === 'searchAutocompl_input' && !inputField.value) {
                    selectViaAutocomplete(inputField);
                } else if (inputField.id === 'selectBox_filter') {
                    selectViaFilter(inputField);
                }
            });
        }

        // The isolated script may have run before or after this one
        if (document.documentElement.dataset.kitAutoLogin === 'federated') {
            start();
        } else {
            document.addEventListener(SIGNAL_EVENT, start, { once: true });
        }
    }

    function injectFederatedLogin(site, siteKey) {
        const script = document.createElement('script');
        script.textContent = '(' + federatedLoginMain.toString() + ')();';
        document.documentElement.appendChild(script);
        script.remove();
        startFederatedLogin(site, siteKey);
    }

    KIT_SITES.fels.run = injectFederatedLogin;
    KIT_SITES.bwidm.run = injectFederatedLogin;

    // --- Entry point -------------------------------------------------------------

    const entry = Object.entries(KIT_SITES).find(([, s]) => s.hosts.includes(window.location.hostname));
    if (entry) startSite(entry[1], entry[0]);

})();
