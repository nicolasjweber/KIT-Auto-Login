<p align="center">
  <img src="icons/icon.svg" alt="KIT Auto-Login Icon" width="128"></img>

</p>

<h1 align="center">KIT Auto-Login</h1>

- **Automatic Login:** Zero-click login for various KIT services
- Works seamlessly with your existing password manager
- Enable or disable the extension for each supported site individually

## Installation

<div align="center">
<a href="https://addons.mozilla.org/de/firefox/addon/kit-auto-login/"><img src="assets/badge_firefox_amo.svg" alt="Get the Add-on for Firefox" height="58" /></a>
<a href="https://chromewebstore.google.com/detail/kit-auto-login/ldnjffkimlpofjanbfdipcannfaloabd"><img src="assets/badge_chrome_web_store.png" alt="Available in the Chrome Web Store" height="58" /></a>
<a href="https://apps.apple.com/de/app/userscripts/id1463298887"><img src="assets/badge_app_store.png" alt="Download on the App Store" height="58" /></a>
</div>

</br>
<details>
<summary>Safari (iOS & macOS) Instructions</summary>

Safari on iOS and macOS is supported through a more basic userscript version of this add-on. It utilizes Passkeys rather than passwords, offering enhanced security at the expense of longer wait times and requiring you to select the Passkey manually during login.

1. If you haven't already, register a passkey for your account at the [SCC Self-Service Portal](http://my.scc.kit.edu/).
2. Install the Userscripts app from the App Store.
3. Activate the Userscripts Safari extension in the Settings app.
   * **iOS 26:** `Settings` → `Safari` → `Extensions` → `Userscripts` → `Allow Extension`
4. Copy `kit_auto_login_userscript.js` into the Userscripts directory on your device.
   * **iOS 26:** `Files` → `On My iPhone` → `Userscripts`
5. For each site where you want to use auto-login, manually allow Userscripts to run by pressing the extension button in Safari (on the left of the current URL) and granting access.
   * **Action:** `Userscripts` → `Always Allow`

</details>

## Prerequisites

This extension automates the clicking of login buttons, but it **does not store your passwords, passkeys, or cookies**. 

- **Firefox & Chromium:** For fully automatic login, ensure your password manager (or browser) is configured to autofill your KIT username and password.
- **Safari:** The Safari version works via Passkeys (as there is currently no way to automatically fill in passwords without additional button presses anyway). Make sure to register a Passkey for your account first.
- If the extension isn't working, verify in your browser extension settings that it has been granted permission to read and change data on the supported KIT websites.

## Screenshot & Supported Sites

<p>
  <img src="assets/screenshot.png" alt="Screenshot of the KIT Auto-Login options page showing supported sites" width="350" />
  <img src="assets/screenshot_dark.png" alt="Screenshot of the KIT Auto-Login options page showing supported sites" width="350" />
</p>

Tip: Click on any site in the list to quickly jump to the respective KIT portal.

## Contributing

Contributions are welcome! Please feel free to open a pull request or open an issue to report a bug.

## Disclaimer

This extension is an independent, open-source project and is **not** affiliated with, endorsed by, or officially connected to the Karlsruhe Institute of Technology (KIT) in any way.

## Credits

- Original idea and extension by [philippweinmann](https://github.com/philippweinmann/iliasLogin)
- ILIAS v7.x fix by [BenedictLoe](https://github.com/BenedictLoe/iliasLogin_7)