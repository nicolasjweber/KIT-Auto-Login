// This runs ONLY on https://fels.scc.kit.edu/*, https://login.bwidm.de/* and https://bwidm.scc.kit.edu/*

const siteKey = window.location.hostname.includes('bwidm') ? 'bwidm' : 'fels';

shouldRun(siteKey).then(enabled => {
    if (!enabled) return;

    waitForElement('#searchAutocompl_input, #selectBox_filter', (inputField) => {
        if (inputField.id === 'searchAutocompl_input' && !inputField.value) {
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
        } else if (inputField.id === 'selectBox_filter') {
            const script = document.createElement('script');
            script.textContent = `
                (function() {
                    var input = document.getElementById('selectBox_filter');
                    if (!input) return;
                    
                    input.focus();
                    input.value = 'KIT';
                    
                    // Trigger PrimeFaces filter
                    input.dispatchEvent(new Event('input', { bubbles: true }));
                    input.dispatchEvent(new Event('change', { bubbles: true }));
                    input.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: 'T' }));
                    
                    // Need to wait for filter results to appear
                    setTimeout(function() {
                        var listItems = document.querySelectorAll('.ui-selectlistbox-item');
                        for (var i = 0; i < listItems.length; i++) {
                            if (listItems[i].style.display !== 'none') {
                                listItems[i].click();
                                break;
                            }
                        }
                        
                        setTimeout(function() {
                            var loginBtn = document.getElementById('login');
                            if (loginBtn) {
                                loginBtn.click();
                            } else {
                                PrimeFaces.ab({s:"login",f:"form",u:"form"});
                            }
                        }, 500);
                    }, 500);
                })();
            `;
            document.documentElement.appendChild(script);
            script.remove();
        }
    });
});
