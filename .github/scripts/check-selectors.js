/**
 * Weekly Selector Health Check for KIT Auto-Login.
 *
 * Reads the declarative site definitions directly from `scripts/sites.js` and
 * verifies in headless Chromium that each public KIT portal's login button
 * (or redirect to the KIT IdP / federated login) still exists.
 *
 * Good-citizen rules:
 *   - Uses a transparent User-Agent identifying the open-source repository.
 *   - Visits each portal once sequentially with a polite pause between checks.
 *   - Never enters credentials or submits the IdP login form (#sbmt).
 *   - Treats HTTP 5xx, network timeouts, or maintenance pages as "SKIP (Unreachable)"
 *     rather than selector failures, avoiding false alarms during KIT maintenance windows.
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { chromium } = require('playwright');

const USER_AGENT =
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 KIT-Auto-Login-HealthCheck/1.0 (+https://github.com/nicolasjweber/KIT-Auto-Login)';

const POLITE_DELAY_MS = 1500;
const NAV_TIMEOUT_MS = 25000;
const SELECTOR_WAIT_MS = 10000;

// Some sites only show their login button on a specific login path rather than the root URL
const ENTRY_URL_OVERRIDES = {
    gitlab: 'https://gitlab.kit.edu/users/sign_in',
    hochschulsport: 'https://mein-hochschul.sport.kit.edu/uzh/login',
    ilias_medien: 'https://ilias-medien.bibliothek.kit.edu/login',
};

const AUTH_PROVIDER_HOSTS = new Set([
    'idp.scc.kit.edu',
    'fels.scc.kit.edu',
    'login.bwidm.de',
    'bwidm.scc.kit.edu',
]);

function loadSitesConfig() {
    const repoRoot = path.resolve(__dirname, '..', '..');
    const sitesCode = fs.readFileSync(path.join(repoRoot, 'scripts', 'sites.js'), 'utf8');
    const sandbox = {
        isVisible: () => false,
        isFilled: () => false,
        waitForAutoFill: () => {},
        notifyAutoLogin: () => {},
        document: { documentElement: { dataset: {} }, dispatchEvent: () => {} },
        CustomEvent: function () {},
        sessionStorage: { getItem: () => '[]', setItem: () => {} },
        console,
    };
    vm.runInNewContext(`${sitesCode}\nthis.KIT_SITES = KIT_SITES;`, sandbox);
    return sandbox.KIT_SITES;
}

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function serializeStep(step) {
    const s = typeof step === 'string' ? { selector: step } : step;
    return {
        selector: s.selector,
        text: s.text === undefined ? null : [].concat(s.text).map((t) => t.toLowerCase()),
        visible: !!s.visible,
        pathType:
            typeof s.path === 'string'
                ? 'string'
                : s.path instanceof RegExp
                ? 'regex'
                : typeof s.path === 'function'
                ? 'fn'
                : 'none',
        pathValue:
            typeof s.path === 'string'
                ? s.path
                : s.path instanceof RegExp
                ? s.path.source
                : typeof s.path === 'function'
                ? s.path.toString()
                : null,
        pathFlags: s.path instanceof RegExp ? s.path.flags : '',
    };
}

/**
 * Checks whether any of the site's steps match an element in the current page DOM.
 */
async function findMatchingStepInPage(page, steps) {
    const serialized = (steps || []).map(serializeStep);
    return page.evaluate((stepList) => {
        const currentPath = window.location.pathname + window.location.search;

        function pathMatches(step) {
            if (step.pathType === 'none') return true;
            if (step.pathType === 'string') return currentPath.includes(step.pathValue);
            if (step.pathType === 'regex') {
                return new RegExp(step.pathValue, step.pathFlags).test(currentPath);
            }
            // Function path condition (e.g. (p) => !p.includes("/login"))
            if (step.pathType === 'fn') {
                if (step.pathValue.includes('!p.includes')) {
                    const m = step.pathValue.match(/includes\(["']([^"']+)["']\)/);
                    if (m) return !currentPath.includes(m[1]);
                }
                return true;
            }
            return true;
        }

        for (const step of stepList) {
            if (!pathMatches(step)) continue;
            const elements = document.querySelectorAll(step.selector);
            for (const el of elements) {
                if (step.text) {
                    const content = (el.textContent || el.value || '').toLowerCase();
                    if (!step.text.some((term) => content.includes(term))) continue;
                }
                if (el.disabled || el.getAttribute('aria-disabled') === 'true') continue;
                if (step.visible && el.getClientRects().length === 0) continue;
                return { matched: true, selector: step.selector, text: step.text };
            }
        }
        return { matched: false };
    }, serialized);
}

async function checkSiteOnce(browser, siteKey, site, idpState) {
    const context = await browser.newContext({ userAgent: USER_AGENT });
    const page = await context.newPage();

    try {
        const targetUrl = ENTRY_URL_OVERRIDES[siteKey] || site.url;
        const response = await page.goto(targetUrl, {
            waitUntil: 'domcontentloaded',
            timeout: NAV_TIMEOUT_MS,
        });

        const status = response ? response.status() : 0;
        if (status >= 500 || status === 0) {
            return { status: 'skip', reason: `HTTP ${status || 'no response'}` };
        }

        // Wait briefly for SPAs or client-side redirects to settle
        await sleep(site.delay || 1200);

        const currentHost = new URL(page.url()).hostname;

        // If the portal immediately redirected to IdP or FeLS/bwIDM, record that!
        if (AUTH_PROVIDER_HOSTS.has(currentHost) && siteKey !== 'idp' && siteKey !== 'fels' && siteKey !== 'bwidm') {
            if (currentHost === 'idp.scc.kit.edu') {
                await verifyIdpSelectorsOnPage(page, idpState);
            } else {
                await verifyFederatedSelectorsOnPage(page, currentHost, idpState);
            }
            return { status: 'pass', detail: `Redirected directly to ${currentHost}` };
        }

        // Special handling for idp / fels / bwidm when visited directly:
        // Directly visiting https://idp.scc.kit.edu without a SAML request shows an informational/error page,
        // so we verify their selectors when redirected from a real SP (or via their state).
        if (siteKey === 'idp') {
            if (idpState.idpVerified) {
                return { status: 'pass', detail: idpState.idpDetail };
            }
            return { status: 'skip', reason: 'IdP requires SAML context (tested via SP redirect)' };
        }

        if (siteKey === 'fels' || siteKey === 'bwidm') {
            if (idpState.federatedVerified[siteKey]) {
                return { status: 'pass', detail: idpState.federatedVerified[siteKey] };
            }
            // Check if the input field is visible directly
            const fedMatch = await findMatchingStepInPage(page, ['#searchAutocompl_input, #selectBox_filter']);
            if (fedMatch.matched) {
                return { status: 'pass', detail: 'Found #searchAutocompl_input / #selectBox_filter' };
            }
            return { status: 'skip', reason: 'Requires OIDC/SAML session redirect (tested via SP redirect)' };
        }

        // Poll up to SELECTOR_WAIT_MS for any step selector to appear (or redirect to auth provider)
        const deadline = Date.now() + SELECTOR_WAIT_MS;
        while (Date.now() < deadline) {
            const hostNow = new URL(page.url()).hostname;
            if (AUTH_PROVIDER_HOSTS.has(hostNow)) {
                if (hostNow === 'idp.scc.kit.edu') {
                    await verifyIdpSelectorsOnPage(page, idpState);
                } else {
                    await verifyFederatedSelectorsOnPage(page, hostNow, idpState);
                }
                return { status: 'pass', detail: `Redirected to ${hostNow}` };
            }

            const result = await findMatchingStepInPage(page, site.steps);
            if (result.matched) {
                // If we haven't verified IdP yet and this is a simple link/button, try clicking it
                // to also test the redirect to idp.scc.kit.edu / fels / bwidm!
                if (!idpState.idpVerified || siteKey === 'bwsyncandshare' || siteKey === 'bwjupyter' || siteKey === 'campus') {
                    await tryFollowToAuthProvider(page, result.selector, idpState);
                }
                return {
                    status: 'pass',
                    detail: `Matched selector \`${result.selector}\`${result.text ? ` (${result.text.join('/')})` : ''}`,
                };
            }

            await sleep(500);
        }

        return {
            status: 'fail',
            reason: `None of the expected selectors appeared on ${page.url()} within ${SELECTOR_WAIT_MS / 1000}s`,
        };
    } catch (err) {
        const msg = err && err.message ? err.message : String(err);
        if (
            msg.includes('Timeout') ||
            msg.includes('ERR_NAME_NOT_RESOLVED') ||
            msg.includes('ERR_CONNECTION') ||
            msg.includes('NS_ERROR')
        ) {
            return { status: 'skip', reason: `Unreachable / timeout (${msg.split('\n')[0]})` };
        }
        return { status: 'fail', reason: msg.split('\n')[0] };
    } finally {
        await context.close();
    }
}

async function verifyIdpSelectorsOnPage(page, idpState) {
    try {
        await page.waitForSelector('#username, #password, #sbmt, button#passkeys_login', { timeout: 8000 });
        const check = await page.evaluate(() => ({
            username: !!document.querySelector('#username'),
            password: !!document.querySelector('#password'),
            sbmt: !!document.querySelector('#sbmt'),
            passkeys: !!document.querySelector('button#passkeys_login'),
        }));
        if (check.username && check.password && check.sbmt) {
            idpState.idpVerified = true;
            idpState.idpDetail = `Verified #username, #password, #sbmt${check.passkeys ? ', button#passkeys_login' : ''} on idp.scc.kit.edu`;
        }
    } catch (e) {
        // Ignore if redirect hasn't finished
    }
}

async function verifyFederatedSelectorsOnPage(page, host, idpState) {
    try {
        await page.waitForSelector('#searchAutocompl_input, #selectBox_filter', { timeout: 8000 });
        const key = host.includes('bwidm') ? 'bwidm' : 'fels';
        idpState.federatedVerified[key] = `Verified #searchAutocompl_input / #selectBox_filter on ${host}`;
    } catch (e) {
        // Ignore
    }
}

async function tryFollowToAuthProvider(page, selector, idpState) {
    try {
        await Promise.all([
            page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 8000 }).catch(() => {}),
            page.click(selector, { timeout: 3000 }).catch(() => {}),
        ]);
        const host = new URL(page.url()).hostname;
        if (host === 'idp.scc.kit.edu') {
            await verifyIdpSelectorsOnPage(page, idpState);
        } else if (AUTH_PROVIDER_HOSTS.has(host)) {
            await verifyFederatedSelectorsOnPage(page, host, idpState);
        }
    } catch (e) {
        // Best-effort follow
    }
}

async function main() {
    const sites = loadSitesConfig();
    const browser = await chromium.launch({ headless: true });

    const idpState = {
        idpVerified: false,
        idpDetail: '',
        federatedVerified: {},
    };

    // Run SPs first so redirects to idp.scc.kit.edu / fels / bwidm populate idpState
    const orderedKeys = [
        ...Object.keys(sites).filter((k) => k !== 'idp' && k !== 'fels' && k !== 'bwidm'),
        'fels',
        'bwidm',
        'idp',
    ];

    const results = [];

    try {
        for (const siteKey of orderedKeys) {
            const site = sites[siteKey];
            let res = await checkSiteOnce(browser, siteKey, site, idpState);

            // Retry once after 5s on failure in case of a transient glitch
            if (res.status === 'fail') {
                await sleep(5000);
                res = await checkSiteOnce(browser, siteKey, site, idpState);
            }

            results.push({ siteKey, label: site.label, url: site.url, ...res });
            const icon = res.status === 'pass' ? 'PASS' : res.status === 'skip' ? 'SKIP' : 'FAIL';
            console.log(`[${icon}] ${site.label} (${siteKey}): ${res.detail || res.reason}`);

            await sleep(POLITE_DELAY_MS);
        }
    } finally {
        await browser.close();
    }

    const failures = results.filter((r) => r.status === 'fail');
    const reportPath = process.env.SELECTOR_REPORT_PATH;
    if (reportPath) {
        fs.writeFileSync(reportPath, JSON.stringify({ results, failures }, null, 2));
    }

    if (failures.length > 0) {
        console.error(`\n${failures.length} site(s) failed selector health check.`);
        process.exit(1);
    }
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
