shouldRun('ilias_medien').then((allowed) => {
    if (!allowed) return;

    if (window.location.href.includes("/login")) {
        clickIfPresent('a.login-button[href*="/auth"]');
    }
});