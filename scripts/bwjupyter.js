// This runs ONLY on https://hub.bwjupyter.de/*

shouldRun('bwjupyter').then((allowed) => {
    if (!allowed) return;

    clickIfPresent('a[href^="/hub/oauth_login"]');
});
