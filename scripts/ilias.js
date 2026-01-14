// This runs ONLY on https://ilias.studium.kit.edu/*

const isLoggedIn = document.querySelectorAll(".il-avatar").length > 0;
const onLoginPage = window.location.href.includes("/login");

if (!isLoggedIn) {
    if (onLoginPage) {
        // Step 2: On the specific login selection page
        clickIfPresent('#button_shib_login');
    } else {
        // Step 1: On the main page, but logged out
        clickIfPresent('.header-inner a[href*="login.php"]');
    }
}