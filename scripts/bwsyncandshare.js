// This runs ONLY on https://bwsyncandshare.kit.edu/*

shouldRun('bwsyncandshare').then((allowed) => {
    if (!allowed) return;

    clickIfPresent('a[href*="/apps/user_saml/saml/login"]');
});
