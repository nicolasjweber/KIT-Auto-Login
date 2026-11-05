// Runs in the page's MAIN world on https://fels.scc.kit.edu/*, https://login.bwidm.de/*
// and https://bwidm.scc.kit.edu/* so it can use the page's PrimeFaces object.
//
// It does nothing until the isolated content script (which can read the extension
// settings) signals that auto-login is enabled for this site.

(function () {
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
})();
