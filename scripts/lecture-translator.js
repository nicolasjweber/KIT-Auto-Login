// This runs ONLY on lt2srv.iar.kit.edu and lecture-translator.kit.edu

const isDexAuth = window.location.href.includes("/dex/auth");
const hasLogoutBtn = document.querySelector('a[href="/logout"]');

if (isDexAuth) {
    // Intermediate auth page
    clickIfPresent('a[href^="/dex/auth/shib"]');
} else if (!hasLogoutBtn) {
    // Main page, logged out
    clickIfPresent('img[alt="Login"]');
}