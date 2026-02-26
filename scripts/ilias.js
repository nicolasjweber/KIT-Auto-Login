// This runs ONLY on https://ilias.studium.kit.edu/* and https://koala.kit.edu/*

const siteKey = window.location.hostname.includes('ilias') ? 'ilias' : 'koala';

shouldRun(siteKey).then((allowed) => {
    if (!allowed) return;

    const isLoggedIn = document.querySelectorAll(".il-avatar").length > 0;
    const onLoginPage = window.location.href.includes("/login");

    if (!isLoggedIn) {
        if (onLoginPage || siteKey === 'koala') {
            // Step 2: On the specific login selection page
            clickIfPresent('#button_shib_login');
        } else {
            // Step 1: On the main page, but logged out
            clickIfPresent('.header-inner a[href*="login.php"]');
        }
    }
});