// This runs ONLY on https://gitlab.kit.edu/*

shouldRun('gitlab').then((allowed) => {
    if (!allowed) return;

    const loginSelector = 'button[type=submit]';
    const loginStatus = document.querySelector('a[href*="/sign_out"]');

    if (loginStatus) return;
    
    waitForElement(loginSelector, (link) => {
        link.click();
    });
});

