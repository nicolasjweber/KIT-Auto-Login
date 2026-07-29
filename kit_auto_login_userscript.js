// ==UserScript==
// @name        KIT Auto-Login
// @version     2026.3.3
// @description Automatically clicks through various KIT login pages (ILIAS, CAS Campus and other services).
// @author      nicolasjweber
// @match       https://idp.scc.kit.edu/*
// @match       https://ilias.studium.kit.edu/*
// @match       https://ilias-medien.bibliothek.kit.edu/*
// @match       https://koala.kit.edu/*
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

    // 2. ILIAS & Koala
    if (matchDomain('ilias.studium.kit.edu') || matchDomain('koala.kit.edu')) {
        const siteKey = matchDomain('koala.kit.edu') ? 'koala' : 'ilias';
        shouldRun(siteKey).then((allowed) => {
            if (!allowed) return;

            const isLoggedIn = document.querySelectorAll(".il-avatar").length > 0;
            const onLoginPage = href.includes("/login");
            if (!isLoggedIn) {
                if (onLoginPage || siteKey === 'koala') {
                    clickIfPresent('#button_shib_login');
                } else {
                    clickIfPresent('.header-inner a[href*="login.php"]');
                }
            }
        });
    }

    // 2.5 ILIAS Medienportal
    if (matchDomain('ilias-medien.bibliothek.kit.edu')) {
        shouldRun('ilias_medien').then((allowed) => {
            if (!allowed) return;

            if (href.includes("/login")) {
                clickIfPresent('a.login-button[href*="/auth"]');
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

            let clickedStep1 = false;
            let clickedStep2 = false;

            function checkDOM() {
                if (document.querySelector(logoutSelector)) {
                    return true; 
                }
                
                const step2Btn = document.querySelector(step2_Selector);
                if (step2Btn && !clickedStep2) {
                    clickedStep2 = true;
                    step2Btn.click();
                }

                const step1Btn = document.querySelector(step1_Selector);
                if (step1Btn && !clickedStep1) {
                    clickedStep1 = true;
                    step1Btn.click();
                }
                return false;
            }

            if (checkDOM()) return;

            const observer = new MutationObserver(() => {
                if (checkDOM()) {
                    observer.disconnect();
                }
            });

            observer.observe(document.body, { childList: true, subtree: true });
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

    // 10. Federated Login (FeLS & bwIDM)
    if (matchDomain('fels.scc.kit.edu') || matchDomain('login.bwidm.de') || matchDomain('bwidm.scc.kit.edu')) {
        const siteKey = (matchDomain('login.bwidm.de') || matchDomain('bwidm.scc.kit.edu')) ? 'bwidm' : 'fels';
        shouldRun(siteKey).then((allowed) => {
            if (!allowed) return;

            waitForElement('#searchAutocompl_input, #selectBox_filter', (inputField) => {
                if (inputField.id === 'searchAutocompl_input' && !inputField.value) {
                    const script = document.createElement('script');
                    script.textContent = `
                        (function() {
                            var input = document.getElementById('searchAutocompl_input');
                            if (!input) return;
                            
                            input.focus();
                            input.value = 'KIT';
                            
                            // Trigger PrimeFaces autocomplete search
                            var widget = PrimeFaces.getWidgetById('searchAutocompl');
                            if (widget && widget.search) {
                                widget.search('KIT');
                            } else {
                                // Fallback
                                input.dispatchEvent(new Event('input', { bubbles: true }));
                                input.dispatchEvent(new Event('change', { bubbles: true }));
                                PrimeFaces.ab({s:"searchAutocompl",e:"change",f:"form",p:"searchAutocompl",u:"infoPnl"});
                            }
                            
                            // Need to wait for autocomplete results to appear
                            setTimeout(function() {
                                input.dispatchEvent(new KeyboardEvent('keydown', {
                                    bubbles: true, cancelable: true, key: 'Enter', keyCode: 13, which: 13
                                }));
                                
                                setTimeout(function() {
                                    PrimeFaces.ab({s:"login",f:"form",u:"form"});
                                }, 500);
                            }, 500);
                        })();
                    `;
                    document.documentElement.appendChild(script);
                    script.remove();
                } else if (inputField.id === 'selectBox_filter') {
                    const script = document.createElement('script');
                    script.textContent = `
                        (function() {
                            var input = document.getElementById('selectBox_filter');
                            if (!input) return;
                            
                            input.focus();
                            input.value = 'KIT';
                            
                            // Trigger PrimeFaces filter
                            input.dispatchEvent(new Event('input', { bubbles: true }));
                            input.dispatchEvent(new Event('change', { bubbles: true }));
                            input.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: 'T' }));
                            
                            // Need to wait for filter results to appear
                            setTimeout(function() {
                                var listItems = document.querySelectorAll('.ui-selectlistbox-item');
                                for (var i = 0; i < listItems.length; i++) {
                                    if (listItems[i].style.display !== 'none') {
                                        listItems[i].click();
                                        break;
                                    }
                                }
                                
                                setTimeout(function() {
                                    var loginBtn = document.getElementById('login');
                                    if (loginBtn) {
                                        loginBtn.click();
                                    } else {
                                        PrimeFaces.ab({s:"login",f:"form",u:"form"});
                                    }
                                }, 500);
                            }, 500);
                        })();
                    `;
                    document.documentElement.appendChild(script);
                    script.remove();
                }
            });
        });
    }

    // 10.1 KI Toolbox
    if (matchDomain('ki-toolbox.scc.kit.edu')) {
        shouldRun('ki_toolbox').then((allowed) => {
            if (!allowed) return;

            const runWhenPageLoaded = (callback) => {
                if (document.readyState === 'complete') {
                    callback();
                    return;
                }

                window.addEventListener('load', callback, { once: true });
            };

            runWhenPageLoaded(() => {
                setTimeout(() => {
                    const sidebar = document.querySelector('#sidebar');
                    if (sidebar && sidebar.getClientRects().length > 0) return;

                    if (href.includes('/auth')) {
                        waitForElementByText('button', 'Continue with KIT-Account', (button) => {
                            button.click();
                        });
                    }
                }, 1000);
            });
        });
    }

    // 11. bwJupyter
    if (matchDomain('hub.bwjupyter.de')) {
        shouldRun('bwjupyter').then((allowed) => {
            if (!allowed) return;
            clickIfPresent('a[href^="/hub/oauth_login"]');
        });
    }

    // 12. bwSync&Share
    if (matchDomain('bwsyncandshare.kit.edu')) {
        shouldRun('bwsyncandshare').then((allowed) => {
            if (!allowed) return;
            clickIfPresent('a[href*="/apps/user_saml/saml/login"]');
        });
    }

    // 13. Hochschulsport
    if (matchDomain('mein-hochschul.sport.kit.edu')) {
        shouldRun('hochschulsport').then((allowed) => {
            if (!allowed) return;

            let clicked = false;

            setTimeout(() => {
                setInterval(() => {
                    if (!window.location.pathname.includes('login')) {
                        clicked = false; // Reset if we navigate away inside the SPA
                        return;
                    }

                    if (clicked) return;

                    // Try the explicit test-id first, fallback to checking button text if it changes layout
                    const buttons = Array.from(document.querySelectorAll('[data-test-id="saml-login-button"], .btn-primary'));
                    const btn = buttons.find(b => {
                        const text = (b.value || b.textContent || b.innerText || '').toLowerCase();
                        return b.hasAttribute('data-test-id') || text.includes('log') || text.includes('anmeld');
                    });

                    // Ensure the button is actually rendered, visible, and not disabled
                    if (btn && btn.offsetParent !== null && !btn.disabled && !btn.dataset.autoClicked) {
                        btn.dataset.autoClicked = 'true';
                        clicked = true;

                        if (typeof btn.focus === 'function') btn.focus();
                        btn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
                        btn.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));
                        btn.click();
                    }
                }, 500);
            }, 800); // Initial delay to ensure page frameworks have bound their events
        });
    }

    // 14. SignMeUp
    if (matchDomain('signmeup.studium.kit.edu')) {
        shouldRun('signmeup').then((allowed) => {
            if (!allowed) return;

            const logoutSelector = 'a[href="/user/logout"]';
            const step1_Selector = 'a[href="/user/login"]';
            const step2_Selector = 'a[href="/api/user/oidc-login"]';

            let clickedStep1 = false;
            let clickedStep2 = false;

            function checkDOM() {
                if (document.querySelector(logoutSelector)) {
                    return true; 
                }
                
                const step2Btn = document.querySelector(step2_Selector);
                if (step2Btn && !clickedStep2) {
                    clickedStep2 = true;
                    const btn = step2Btn.querySelector('button') || step2Btn;
                    btn.click();
                }

                const step1Btn = document.querySelector(step1_Selector);
                if (step1Btn && !clickedStep1) {
                    clickedStep1 = true;
                    const btn = step1Btn.querySelector('button') || step1Btn;
                    btn.click();
                }
                return false;
            }

            if (checkDOM()) return;

            const observer = new MutationObserver(() => {
                if (checkDOM()) {
                    observer.disconnect();
                }
            });

            observer.observe(document.body, { childList: true, subtree: true });
        });
    }

})();
