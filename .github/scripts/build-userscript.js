/**
 * Generates `kit_auto_login.user.js` from the extension sources (`manifest.json`,
 * `scripts/utils.js`, `scripts/sites.js`, and `scripts/federated_login_main.js`).
 *
 * Usage:
 *   node .github/scripts/build-userscript.js            # writes kit_auto_login.user.js
 *   node .github/scripts/build-userscript.js --check    # exits 1 if kit_auto_login.user.js is out of sync
 */

const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..', '..');
const checkOnly = process.argv.includes('--check');

function readNormalized(relPath) {
    return fs.readFileSync(path.join(repoRoot, relPath), 'utf8').replace(/\r\n/g, '\n');
}

const manifest = JSON.parse(readNormalized('manifest.json'));
const matches = manifest.content_scripts[0].matches;

// utils.js without the extension-only settings section
let utils = readNormalized('scripts/utils.js');
utils = utils.slice(0, utils.indexOf('// --- Settings')).trimEnd();

const sites = readNormalized('scripts/sites.js').trimEnd();

let fedMain = readNormalized('scripts/federated_login_main.js').trimEnd();
fedMain = fedMain
    .replace(/^\(function \(\) \{/m, 'function federatedLoginMain() {')
    .replace(/\}\)\(\);$/, '}');

const indent = (s) =>
    s
        .split('\n')
        .map((line) => (line ? '    ' + line : line))
        .join('\n');

const rawUrl = 'https://raw.githubusercontent.com/nicolasjweber/KIT-Auto-Login/main/kit_auto_login.user.js';

const header = [
    '// ==UserScript==',
    '// @name        KIT Auto-Login',
    `// @version     ${manifest.version}`,
    '// @description Automatically clicks through various KIT login pages (ILIAS, CAS Campus and other services).',
    '// @author      nicolasjweber',
    '// @homepageURL https://github.com/nicolasjweber/KIT-Auto-Login',
    `// @downloadURL ${rawUrl}`,
    `// @updateURL   ${rawUrl}`,
    ...matches.map((m) => `// @match       ${m}`),
    '// @run-at      document-idle',
    '// @grant       none',
    '// ==/UserScript==',
].join('\n');

const overrides = `
// --- Userscript overrides ---------------------------------------------------

// Safari / Userscript IdP login: support both Passkey login (button#passkeys_login)
// and password autofill (#password -> #sbmt) so whichever method the user uses
// completes automatically.
function runUserscriptIdpLogin(site, siteKey = 'idp') {
    const attempts = getRecentIdpAttempts();
    if (attempts.length >= IDP_MAX_ATTEMPTS) {
        console.warn('KIT Auto-Login: Automatic login failed repeatedly, please log in manually.');
        return;
    }

    // 1. Trigger Passkey login if the button is present (or appears)
    waitForElement('button#passkeys_login', (passkeyBtn) => {
        if (!isDisabled(passkeyBtn)) {
            passkeyBtn.click();
        }
    });

    // 2. Also watch for password autofill (if the user cancels passkeys or uses a password manager)
    runIdpLogin(site, siteKey);
}

KIT_SITES.idp.run = runUserscriptIdpLogin;

// Userscripts run isolated from the page, so inject the PrimeFaces logic
// (same code as scripts/federated_login_main.js in the extension)
${fedMain}

function injectFederatedLogin(site, siteKey) {
    const script = document.createElement('script');
    script.textContent = '(' + federatedLoginMain.toString() + ')();';
    document.documentElement.appendChild(script);
    script.remove();
    startFederatedLogin(site, siteKey);
}

KIT_SITES.fels.run = injectFederatedLogin;
KIT_SITES.bwidm.run = injectFederatedLogin;

// --- Entry point -------------------------------------------------------------

const entry = Object.entries(KIT_SITES).find(([, s]) => s.hosts.includes(window.location.hostname));
if (entry) startSite(entry[1], entry[0]);`;

const body = [
    '// This file mirrors the browser extension (scripts/utils.js, scripts/sites.js,',
    '// scripts/federated_login_main.js). Run `node .github/scripts/build-userscript.js`',
    '// after changing site definitions or engine logic.',
    '',
    utils,
    '',
    sites,
    overrides,
].join('\n');

const expectedLf = `${header}\n\n(function() {\n    'use strict';\n\n${indent(body)}\n\n})();\n`;
const targetPath = path.join(repoRoot, 'kit_auto_login.user.js');

if (checkOnly) {
    const currentLf = readNormalized('kit_auto_login.user.js');
    if (currentLf !== expectedLf) {
        console.error(
            '::error::kit_auto_login.user.js is out of sync with the extension sources. Run `node .github/scripts/build-userscript.js` to regenerate it.'
        );
        process.exit(1);
    }
    console.log('kit_auto_login.user.js is in sync with extension sources.');
} else {
    fs.writeFileSync(targetPath, expectedLf.replace(/\n/g, '\r\n'));
    console.log(`Generated kit_auto_login.user.js (v${manifest.version}, ${matches.length} matches)`);
}
