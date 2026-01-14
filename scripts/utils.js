/**
 * Waits for an element to satisfy a condition (like having a value)
 * and then performs an action. Useful for waiting on Password Managers.
 */
function waitForAutoFill(selector, callback, maxRetries = 20) {
    let attempts = 0;
    
    const check = setInterval(() => {
        const element = document.querySelector(selector);
        attempts++;

        if (element && element.value && element.value.length > 0) {
            clearInterval(check);
            callback(element);
        } 
        
        if (attempts >= maxRetries) {
            clearInterval(check);
            console.log("Auto-login timed out: Fields were not populated.");
        }
    }, 500);
}

function clickIfPresent(selector) {
    const el = document.querySelector(selector);

    if (el) {
        el.click(); 
        return true;
    }

    return false;
}

/**
 * Waits for an element to appear in the DOM, then runs the callback.
 * 
 * @param {string} selector - The CSS selector to wait for.
 * @param {function} callback - The function to run when the element is found.
 * @param {number} maxRetries - How many times to check (default 20 = 10 seconds).
 */
function waitForElement(selector, callback, maxRetries = 20) {
    let attempts = 0;
    
    const check = setInterval(() => {
        const element = document.querySelector(selector);
        attempts++;

        if (element) {
            clearInterval(check);
            callback(element);
        }
        
        if (attempts >= maxRetries) {
            clearInterval(check);
            console.log(`Give up waiting for: ${selector}`);
        }
    }, 500);
}

/**
 * Waits for an element of a specific tag containing specific text.
 * 
 * @param {string} tag - The HTML tag (e.g., 'button').
 * @param {string|string[]} textOrArray - A string or array of strings to look for.
 * @param {function} callback - Function to run when found.
 */
function waitForElementByText(tag, textOrArray, callback, maxRetries = 20) {
    let attempts = 0;
    
    // Ensure we always have an array for easier logic below
    const searchTerms = Array.isArray(textOrArray) ? textOrArray : [textOrArray];

    const check = setInterval(() => {
        attempts++;
        const allElements = document.querySelectorAll(tag);
        
        const found = Array.from(allElements).find(el => 
            searchTerms.some(term => el.textContent.includes(term))
        );

        if (found) {
            clearInterval(check);
            callback(found);
        }
        
        if (attempts >= maxRetries) {
            clearInterval(check);
            console.log(`Give up waiting for ${tag} with text: ${searchTerms.join(" OR ")}`);
        }
    }, 500);
}

/**
 * Checks if the addon is enabled for the given site key.
 * @param {string} siteKey - The key identifying the site (e.g. 'ilias', 'campus').
 * @returns {Promise<boolean>} - Resolves to true if enabled, false otherwise.
 */
function shouldRun(siteKey) {
    return new Promise((resolve) => {
        // Fallback for context where chrome/browser might check failed
        const storageObj = (typeof browser !== 'undefined' ? browser : chrome).storage;
        
        if (!storageObj || !storageObj.local) {
             // If permission is missing or API unavailable, run by default
             resolve(true);
             return;
        }

        const handleResult = (result) => {
            if (chrome.runtime.lastError) {
                // If checking fails, default to enabled
                console.warn('KIT Auto-Login: Error reading settings', chrome.runtime.lastError);
                resolve(true);
                return;
            }
            const settings = (result && result.siteSettings) ? result.siteSettings : {};
            // Default to true if not present in settings
            if (settings.hasOwnProperty(siteKey)) {
                resolve(settings[siteKey]);
            } else {
                resolve(true); 
            }
        };

        try {
            const result = storageObj.local.get('siteSettings');
            if (result && typeof result.then === 'function') {
                result.then(handleResult).catch(err => resolve(true));
            } else {
                storageObj.local.get('siteSettings', handleResult);
            }
        } catch (e) {
            console.error(e);
            resolve(true);
        }
    });
}