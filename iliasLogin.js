/// Script to click through the KIT ILIAS and CAS Campus login pages

// Original by phillip > https://addons.mozilla.org/de/firefox/addon/iliaslogin/
// Fix for ILIAS v7.x by BenedictLoe > https://github.com/BenedictLoe/iliasLogin_7

if (window.location.href.indexOf("https://idp.scc.kit.edu") > -1) {
  // we wait a few milliseconds to make sure the username and password fields have been populated by the password manager before clicking
  setTimeout(function () { document.getElementById('sbmt').click(); }, 50);
} else if (window.location.href.toLowerCase().indexOf("https://ilias.studium.kit.edu/ilias.php") > -1 && document.getElementsByClassName("il-avatar").length == 0) {
  // ILIAS is logged out
  document.querySelector('.header-inner a[href^="https://ilias.studium.kit.edu/login.php"]').click()
} else if (window.location.href.indexOf("https://ilias.studium.kit.edu/login") > -1) {
  document.querySelector('#button_shib_login').click();
} else if (window.location.href.indexOf("https://campus.studium.kit.edu") > -1 && document.querySelectorAll('.login-status').length <= 1) {
  // CAS Campus is logged out
  document.querySelector('.login-link.ui-login').click()
} 