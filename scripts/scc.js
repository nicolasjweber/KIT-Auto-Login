// This runs ONLY on https://my.scc.kit.edu/*

shouldRun('scc').then((allowed) => {
    if (!allowed) return;

    const loginStatus = 'a#logout';
    const loginSelector = 'a.loginlogout';

    if (document.querySelector(loginStatus)) return;

    clickIfPresent(loginSelector);
});
