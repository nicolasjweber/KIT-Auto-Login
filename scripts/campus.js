// This runs ONLY on https://campus.studium.kit.edu/*

const loginSelector = '.login-link.ui-login';
const loginStatus = document.querySelector(loginSelector);

if (loginStatus) {
    // Try the main login link
    const clickedMain = clickIfPresent(loginSelector);
    
    // Fallback: big login button
    if (!clickedMain) {
        clickIfPresent('.shib-login.shib-button');
    }
}