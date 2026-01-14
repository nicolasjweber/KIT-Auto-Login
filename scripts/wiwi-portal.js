// This runs ONLY on https://portal.wiwi.kit.edu/*

const step1_Selector = 'a[href^="/account/login"]';
const step2_Selector = 'a[href^="/api/account/login-oidc"]';
const logoutSelector = 'a[href="/account/logout"]';

const checkLoop = setInterval(() => {

    if (document.querySelector(logoutSelector)) {
        clearInterval(checkLoop);
        return;
    }

    // Check for the OIDC button (Step 2)
    if (clickIfPresent(step2_Selector)) {
        clearInterval(checkLoop);
        return;
    }

    // Check for the initial Login button (Step 1)
    if (clickIfPresent(step1_Selector)) {
        clearInterval(checkLoop);
        return;
    }

}, 500);