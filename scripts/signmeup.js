// This runs on https://signmeup.studium.kit.edu/*

shouldRun('signmeup').then((allowed) => {
    if (!allowed) return;

    const logoutSelector = 'a[href="/user/settings"]';
    const step1_Selector = 'a[href="/user/login"]';
    const step2_Selector = 'a[href="/api/user/oidc-login"]';

    let clickedStep1 = false;
    let clickedStep2 = false;

    function checkDOM() {
        if (document.querySelector(logoutSelector)) {
            return true; 
        }
        
        const step2Btn = document.querySelector(step2_Selector);
        if (step2Btn && !clickedStep2) {
            clickedStep2 = true;
            const btn = step2Btn.querySelector('button') || step2Btn;
            btn.click();
        }

        const step1Btn = document.querySelector(step1_Selector);
        if (step1Btn && !clickedStep1) {
            clickedStep1 = true;
            const btn = step1Btn.querySelector('button') || step1Btn;
            btn.click();
        }
        return false;
    }

    if (checkDOM()) return;

    const observer = new MutationObserver(() => {
        if (checkDOM()) {
            observer.disconnect();
        }
    });

    observer.observe(document.body, { childList: true, subtree: true });
});