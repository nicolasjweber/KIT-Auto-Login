// This runs ONLY on https://idp.scc.kit.edu/*

// Wait for the password field to be populated by the browser or password manager
waitForAutoFill('#password', () => {
    // Double check username just in case
    const username = document.querySelector('#username');
    if (username && username.value) {
        clickIfPresent('#sbmt');
    }
});