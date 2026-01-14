// This runs ONLY on bewerbung.studium.kit.edu

shouldRun('bewerbung').then((allowed) => {
    if (!allowed) return;

    // Since the login button has a (potentially changing) generic selector name, we use text matching
    const loginLabels = [
        "Mit KIT-Account anmelden", 
        "Login with KIT account"
    ];

    waitForElementByText('button', loginLabels, (button) => {
        button.click();
    });
});