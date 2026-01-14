// This runs ONLY on https://portal.wiwi.kit.edu/*

shouldRun('wiwi_portal').then((allowed) => {
    if (!allowed) return;

    const step1_Selector = 'a[href^="/account/login"]';
    const step2_Selector = 'a[href^="/api/account/login-oidc"]';
    const logoutSelector = 'a[href="/account/logout"]';
    const loginPageUrl = "https://portal.wiwi.kit.edu/account/login";

    if (window.location.href.startsWith(loginPageUrl)) {
        // On the login page, wait for the OIDC link
        waitForElement(step2_Selector, (link) => {
            link.click();
        });
    } else {
        // We are on a general page.
        // We wait for either the logout button (meaning we are done)
        // or the login button (meaning we need to start).
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

            if (attempts++ > 15) { // Stop checking after ~3 seconds
                clearInterval(check);
            }
        }, 200);
    }
});