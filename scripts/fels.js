// This runs ONLY on https://fels.scc.kit.edu/*

shouldRun('fels').then(enabled => {
    if (!enabled) return;

    waitForElement('#searchAutocompl_input', (inputField) => {
        if (!inputField.value) {
            const script = document.createElement('script');
            script.textContent = `
                (function() {
                    var input = document.getElementById('searchAutocompl_input');
                    if (!input) return;
                    
                    input.focus();
                    input.value = 'KIT';
                    
                    // Trigger PrimeFaces autocomplete search
                    var widget = PrimeFaces.getWidgetById('searchAutocompl');
                    if (widget && widget.search) {
                        widget.search('KIT');
                    } else {
                        // Fallback
                        input.dispatchEvent(new Event('input', { bubbles: true }));
                        input.dispatchEvent(new Event('change', { bubbles: true }));
                        PrimeFaces.ab({s:"searchAutocompl",e:"change",f:"form",p:"searchAutocompl",u:"infoPnl"});
                    }
                    
                    // Need to wait for autocomplete results to appear
                    setTimeout(function() {
                        input.dispatchEvent(new KeyboardEvent('keydown', {
                            bubbles: true, cancelable: true, key: 'Enter', keyCode: 13, which: 13
                        }));
                        
                        setTimeout(function() {
                            PrimeFaces.ab({s:"login",f:"form",u:"form"});
                        }, 500);
                    }, 500);
                })();
            `;
            document.documentElement.appendChild(script);
            script.remove();
        }
    });
});
