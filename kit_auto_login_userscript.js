// ==UserScript==
// @name        KIT Auto-Login
// @version     9.16.3
// @description Automatically clicks through various KIT login pages (ILIAS, CAS Campus and other services).
// @author      nicolasjweber
// @match       https://idp.scc.kit.edu/*
// @match       https://ilias.studium.kit.edu/*
// @match       https://campus.studium.kit.edu/*
// @match       https://lt2srv.iar.kit.edu/*
// @match       https://lecture-translator.kit.edu/*
// @match       https://bewerbung.studium.kit.edu/*
// @match       https://plus.campus.kit.edu/*
// @match       https://portal.wiwi.kit.edu/*
// @match       https://gitlab.kit.edu/*
// @match       https://my.scc.kit.edu/*
// @run-at      document-idle
// @grant       none
// ==/UserScript==

(function() {
    'use strict';

    // --- UTILS ---

    function clickIfPresent(selector) {
        const el = document.querySelector(selector);

        if (el) {
            el.click(); 
            return true;
        }

        return false;
    }

    /**
     * Waits for an element to appear in the DOM, then runs the callback.
     */
    function waitForElement(selector, callback, maxRetries = 20) {
        let attempts = 0;
        
        const check = setInterval(() => {
            const element = document.querySelector(selector);
            attempts++;

            if (element) {
                clearInterval(check);
                callback(element);
            }
            
            if (attempts >= maxRetries) {
                clearInterval(check);
                console.log(`Give up waiting for: ${selector}`);
            }
        }, 500);
    }

    /**
     * Waits for an element of a specific tag containing specific text.
     */
    function waitForElementByText(tag, textOrArray, callback, maxRetries = 20) {
        let attempts = 0;
        const searchTerms = Array.isArray(textOrArray) ? textOrArray : [textOrArray];

        const check = setInterval(() => {
            attempts++;
            const allElements = document.querySelectorAll(tag);
            
            const found = Array.from(allElements).find(el => 
                searchTerms.some(term => el.textContent.includes(term))
            );

            if (found) {
                clearInterval(check);
                callback(found);
            }
            
            if (attempts >= maxRetries) {
                clearInterval(check);
                console.log(`Give up waiting for ${tag} with text: ${searchTerms.join(" OR ")}`);
            }
        }, 500);
    }

    /**
     * Stub for shouldRun since simple userscripts don't usually use complex async storage settings.
     * Always resolves true.
     */
    function shouldRun(siteKey) {
        return Promise.resolve(true);
    }

    // Helper to match domain
    function matchDomain(domain) {
        return hostname === domain || hostname.endsWith('.' + domain);
    }

    // --- AUTO-LOGIN ---

    const href = window.location.href;
    const hostname = window.location.hostname;

    // 1. Shibboleth Identity Provider
    if (matchDomain('idp.scc.kit.edu')) {
        shouldRun('idp').then((allowed) => {
            if (!allowed) return;
            clickIfPresent('button#passkeys_login');
        });
    }

    // 2. ILIAS
    if (matchDomain('ilias.studium.kit.edu')) {
        shouldRun('ilias').then((allowed) => {
            if (!allowed) return;
            const isLoggedIn = document.querySelectorAll(".il-avatar").length > 0;
            const onLoginPage = href.includes("/login");
            if (!isLoggedIn) {
                if (onLoginPage) {
                    clickIfPresent('#button_shib_login');
                } else {
                    clickIfPresent('.header-inner a[href*="login.php"]');
                }
            }
        });
    }

    // 3. Campus Management
    if (matchDomain('campus.studium.kit.edu')) {
        shouldRun('campus').then((allowed) => {
            if (!allowed) return;
            const loginSelector = '.login-link.ui-login';
            const loginStatus = document.querySelector(loginSelector);
            if (loginStatus) {
                const clickedMain = clickIfPresent(loginSelector);
                const clickedShib = clickIfPresent('.shib-login.shib-button');
            }
        });
    }

    // 4. Lecture Translator
    if (matchDomain('lt2srv.iar.kit.edu') || matchDomain('lecture-translator.kit.edu')) {
        shouldRun('lecture_translator').then((allowed) => {
            if (!allowed) return;
            const isDexAuth = href.includes("/dex/auth");
            const hasLogoutBtn = document.querySelector('a[href="/logout"]');
            if (isDexAuth) {
                clickIfPresent('a[href^="/dex/auth/shib"]');
            } else if (!hasLogoutBtn) {
                clickIfPresent('img[alt="Login"]');
            }
        });
    }

    // 5. Bewerbung
    if (matchDomain('bewerbung.studium.kit.edu')) {
        shouldRun('bewerbung').then((allowed) => {
            if (!allowed) return;
            const loginLabels = ["Mit KIT-Account anmelden", "Login with KIT account"];
            waitForElementByText('button', loginLabels, (button) => {
                button.click();
            });
        });
    }

    // 6. Campus Plus
    if (matchDomain('plus.campus.kit.edu')) {
        shouldRun('campus_plus').then((allowed) => {
            if (!allowed) return;
            const loginSelector = 'a[href^="/api/user/oidc-login"]';
            const logoutSelector = 'button[title="Abmelden"], button[title="Sign Out"]';
            if (!document.querySelector(logoutSelector)) {
                waitForElement(loginSelector, (link) => {
                    link.click();
                });
            }
        });
    }

    // 7. WiWi Portal
    if (matchDomain('portal.wiwi.kit.edu')) {
        shouldRun('wiwi_portal').then((allowed) => {
            if (!allowed) return;
            const step1_Selector = 'a[href^="/account/login"]';
            const step2_Selector = 'a[href^="/api/account/login-oidc"]';
            const logoutSelector = 'a[href="/account/logout"]';
            const loginPageUrl = "https://portal.wiwi.kit.edu/account/login";

            if (href.startsWith(loginPageUrl)) {
                waitForElement(step2_Selector, (link) => {
                    link.click();
                });
            } else {
                let attempts = 0;
                const check = setInterval(() => {
                    if (document.querySelector(logoutSelector)) {
                        clearInterval(check);
                        return;
                    }
                    const loginBtn = document.querySelector(step1_Selector);
                    if (loginBtn) {
                        clearInterval(check);
                        loginBtn.click();
                        return;
                    }
                    if (attempts++ > 15) { 
                        clearInterval(check);
                    }
                }, 200);
            }
        });
    }

    // 8. GitLab
    if (matchDomain('gitlab.kit.edu')) {
        shouldRun('gitlab').then((allowed) => {
            if (!allowed) return;
            const loginSelector = 'button[type=submit]';
            
            const loginStatus = document.querySelector('a[href*="/sign_out"]');
            if (loginStatus) return;
            
            waitForElement(loginSelector, (link) => {
                link.click();
            });
        });
    }

    // 9. SCC
    if (matchDomain('my.scc.kit.edu')) {
        shouldRun('scc').then((allowed) => {
            if (!allowed) return;

            const loginStatus = 'a#logout';
            const loginSelector = 'a.loginlogout';

            if (document.querySelector(loginStatus)) return;

            clickIfPresent(loginSelector);
        });
    }

})();
