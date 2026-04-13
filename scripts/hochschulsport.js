// This runs on all https://mein-hochschul.sport.kit.edu/* pages
// but only activates on the /login path (SPA safeguard)

shouldRun('hochschulsport').then((allowed) => {
    if (!allowed) return;

    let clicked = false;

    // Small initial delay to help SPAs initialize 
    setTimeout(() => {
        setInterval(() => {
            if (!window.location.pathname.includes('login')) {
                clicked = false; // Reset if we navigate away inside the SPA
                return;
            }

            if (clicked) return;

            // Try the explicit test-id first, fallback to checking button text if it changes layout
            const buttons = Array.from(document.querySelectorAll('[data-test-id="saml-login-button"], .btn-primary'));
            const btn = buttons.find(b => {
                const text = (b.value || b.textContent || b.innerText || '').toLowerCase();
                return b.hasAttribute('data-test-id') || text.includes('log') || text.includes('anmeld');
            });
            
            // Ensure the button is actually rendered, visible, and not disabled
            if (btn && btn.offsetParent !== null && !btn.disabled && !btn.dataset.autoClicked) {
                btn.dataset.autoClicked = 'true';
                clicked = true;

                if (typeof btn.focus === 'function') btn.focus();
                btn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
                btn.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));
                btn.click();
            }
        }, 500);
    }, 800);
});
