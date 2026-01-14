// This runs ONLY on https://plus.campus.kit.edu/*

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