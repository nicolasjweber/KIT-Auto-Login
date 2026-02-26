// This runs ONLY on https://portal.wiwi.kit.edu/*

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
        
        // Step 2: We are on the login page, click the OIDC login button
        const step2Btn = document.querySelector(step2_Selector);
        if (step2Btn && !clickedStep2) {
            clickedStep2 = true;
            step2Btn.click();
        }

        // Step 1: We are on the main page, click the initial login button
        const step1Btn = document.querySelector(step1_Selector);
        if (step1Btn && !clickedStep1) {
            clickedStep1 = true;
            step1Btn.click();
        }
        
        return false;
    }

    if (checkDOM()) return;

    // Use a MutationObserver to watch for page changes
    const observer = new MutationObserver(() => {
        if (checkDOM()) {
            // Stop observing once logged in
            observer.disconnect();
        }
    });

    observer.observe(document.body, { childList: true, subtree: true });
});