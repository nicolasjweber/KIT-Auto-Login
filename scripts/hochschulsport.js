// This runs ONLY on https://mein-hochschul.sport.kit.edu/pages/login

shouldRun('hochschulsport').then((allowed) => {
    if (!allowed) return;

    setInterval(() => {
        const btn = document.querySelector('.btn-primary:nth-of-type(1)');
        
        // Ensure the button is actually rendered, visible, and not disabled
        if (btn && btn.offsetParent !== null && !btn.disabled) {
            
            if (typeof btn.focus === 'function') btn.focus();
            btn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
            btn.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));
            btn.click();
        }
    }, 500);
});
