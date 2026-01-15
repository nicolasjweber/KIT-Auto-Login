# KIT Auto-Login

## Features

- Automatic login for various KIT services
- Works with Password Managers
- Enable or disable the extension for each supported site individually

## Installation

### Firefox
[Get it on AMO](https://addons.mozilla.org/de/firefox/addon/kit-auto-login/)

### Chromium
Support is upcoming. Manual installation should be possible for now.

### iOS (Safari)
Basic passkey-based support for iOS has been added recently.
- If you didn't already, register a passkey for your account at [SCC Self-Service](http://my.scc.kit.edu/)
- Install the app [Userscripts](https://apps.apple.com/de/app/userscripts/id1463298887) from the App Store
- Activate the extension in the iOS Settings app
- Copy `kit_auto_login_userscript.js` into the Userscripts directory on your iOS device
- For each site where you want to use the auto-login, you need to manually allow Userscripts to run by pressing the extension button in Safari and granting access.

## Prerequisites
This extension clicks the buttons, but it **does not store your passwords or cookies**. For fully automatic login, ensure your browser or password manager is configured to autofill your KIT username and password.

The iOS version works via Passkeys (because there seems to be no way of automatically filling in passwords without additional button presses), so make sure to register a Passkey for your account first.


## Supported Sites

- KIT Shibboleth Identity Provider (idp.scc.kit.edu)
- ILIAS (ilias.studium.kit.edu)
- Campus Management (campus.studium.kit.edu)
- Campus Plus (plus.campus.kit.edu)
- SCC Self-Service Portal (my.scc.kit.edu)
- WiWi Portal (portal.wiwi.kit.edu) [WIP]
- Lecture Translator (lecture-translator.kit.edu)
- Bewerbungsportal (bewerbung.studium.kit.edu)
- GitLab (gitlab.kit.edu)

You can enable or disable specific sites in the extension settings.

## Contributing

Please feel free to open a pull request or open an issue to report a bug.



## Credits

- Icon from [Feather Icons](https://github.com/feathericons/feather)
- Original by [philippweinmann](https://github.com/philippweinmann/iliasLogin)
- ILIAS v7.x fix by [BenedictLoe](https://github.com/BenedictLoe/iliasLogin_7)
