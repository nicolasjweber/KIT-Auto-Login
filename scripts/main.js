// Entry point for all content scripts: picks the site definition for the
// current host from KIT_SITES (sites.js) and runs it if enabled.

(function () {
    const hostname = window.location.hostname;
    const entry = Object.entries(KIT_SITES).find(([, site]) => site.hosts.includes(hostname));
    if (!entry) return;

    const [siteKey, site] = entry;

    shouldRun(siteKey).then((allowed) => {
        if (allowed) startSite(site);
    });
})();
