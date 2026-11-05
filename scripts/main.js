// Entry point for all content scripts: picks the site definition for the
// current host from KIT_SITES (sites.js) and runs it if enabled.

(async function () {
    const hostname = window.location.hostname;
    const entry = Object.entries(KIT_SITES).find(([, site]) => site.hosts.includes(hostname));
    if (!entry) return;

    const [siteKey, site] = entry;

    const allowed = await shouldRun(siteKey);
    if (allowed) {
        startSite(site, siteKey);
    }
})();
