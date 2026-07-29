// This runs ONLY on https://ki-toolbox.scc.kit.edu/*

function isSidebarVisible() {
    const sidebar = document.querySelector('#sidebar');
    return !!sidebar && sidebar.getClientRects().length > 0;
}

function runWhenPageLoaded(callback) {
    if (document.readyState === 'complete') {
        callback();
        return;
    }

    window.addEventListener('load', callback, { once: true });
}

shouldRun('ki_toolbox').then((allowed) => {
    if (!allowed) return;

    runWhenPageLoaded(() => {
        setTimeout(() => {
            if (isSidebarVisible()) return;

            if (window.location.pathname.includes('/auth')) {
                waitForElementByText('button', 'Continue with KIT-Account', (button) => {
                    button.click();
                });
            }
        }, 1000);
    });
});