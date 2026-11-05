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
function runIdpLogin() {
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
        submit.click();
    });
}

/**
 * FeLS / bwIDM need access to the page's PrimeFaces object, so the actual work
 * happens in federated_login_main.js (MAIN world). This only signals it to start.
 */
function startFederatedLogin() {
    document.documentElement.dataset.kitAutoLogin = "federated";
    document.dispatchEvent(new CustomEvent("kit-auto-login:federated"));
}
