/// Script to click through the KIT ILIAS and CAS Campus login pages

if (window.location.href.indexOf("https://idp.scc.kit.edu") > -1) {
  // we click login after the password manager has filled the username & password fields
  clickLoginWhenPopulated();
} else if (window.location.href.indexOf("https://ilias.studium.kit.edu/ilias.php") > -1 && document.querySelectorAll(".il-avatar").length == 0) {
  // ILIAS is logged out
  document.querySelector('.header-inner a[href^="https://ilias.studium.kit.edu/login.php"]').click()
} else if (window.location.href.indexOf("https://ilias.studium.kit.edu/login") > -1) {
  document.querySelector('#button_shib_login').click();
} else if (window.location.href.indexOf("https://campus.studium.kit.edu") > -1 && document.querySelectorAll('.login-status').length <= 1) {
  // CAS Campus is logged out
  document.querySelector('.login-link.ui-login').click()
  document.querySelector('.shib-login.shib-button').click()
} else if (window.location.href.indexOf("https://lt2srv.iar.kit.edu/dex/auth") > -1) {
  document.querySelector('a[href^="/dex/auth/shib"]').click()
} else if ((window.location.href.indexOf("https://lt2srv.iar.kit.edu") > -1 || window.location.href.indexOf("https://lecture-translator.kit.edu") > -1) && document.querySelectorAll('a[href="/logout"]').length == 0) {
  // Lecture Translator is logged out
  document.querySelector('img[alt="Login"]').click()
} else if (window.location.href.indexOf("https://bewerbung.studium.kit.edu") > -1 && document.querySelectorAll('button[name="generic170"]').length == 1) {
  // Bewerbungsportal is logged out
  document.querySelector('button[name="generic170"]').click()
}

function clickLoginWhenPopulated() {
  if (document.querySelector('#username').value == "" || document.querySelector('#password').value == "") {
    // fields not populated yet, so we have to wait
    setTimeout(clickLoginWhenPopulated, 50);
  } else {
    document.querySelector('#sbmt').click();
  }
}