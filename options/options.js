const sites = {
  "idp": { label: "Shibboleth Identity Provider", url: "https://idp.scc.kit.edu" },
  "ilias": { label: "ILIAS", url: "https://ilias.studium.kit.edu" },
  "campus": { label: "Campus Management", url: "https://campus.studium.kit.edu" },
  "campus_plus": { label: "Campus Plus Portal", url: "https://plus.campus.kit.edu" },
  "wiwi_portal": { label: "WiWi Portal", url: "https://portal.wiwi.kit.edu" },
  "scc": { label: "SCC Self-Service", url: "https://my.scc.kit.edu" },
  "bwjupyter": { label: "bwJupyter", url: "https://hub.bwjupyter.de" },
  "bwsyncandshare": { label: "bwSync&Share", url: "https://bwsyncandshare.kit.edu" },
  "gitlab": { label: "GitLab", url: "https://gitlab.kit.edu" },
  "bewerbung": { label: "Bewerbungsportal", url: "https://bewerbung.studium.kit.edu" },
  "lecture_translator": { label: "Lecture Translator", url: "https://lecture-translator.kit.edu" },
  "fels": { label: "Federated Login Service (FeLS)", url: "https://fels.scc.kit.edu" },
  "bwidm": { label: "bwIDM", url: "https://login.bwidm.de" },
  "koala": { label: "KOALA", url: "https://koala.kit.edu" },
};

// Default settings (all enabled)
const defaultSettings = {};
Object.keys(sites).forEach(key => defaultSettings[key] = true);

function getStorage() {
  return (typeof browser !== 'undefined' ? browser : chrome).storage;
}

function saveOptions() {
  const settings = {};
  for (const key of Object.keys(sites)) {
    const checkbox = document.getElementById(key);
    if (checkbox) {
      settings[key] = checkbox.checked;
    }
  }

  const storage = getStorage();
  const data = { siteSettings: settings };
  
  // Try promise-based first (Firefox / Modern Chrome)
  const result = storage.local.set(data);
  if (result && typeof result.then === 'function') {
      result.then(showStatus);
  } else {
      // Callback based
      showStatus();
  }
}

function showStatus() {
    const status = document.getElementById('status');
    status.classList.add('show');
    setTimeout(() => {
      status.classList.remove('show');
    }, 2000);
}

// Utility to set all site checkboxes to a value and save
function setAllSites(value) {
  for (const key of Object.keys(sites)) {
    const checkbox = document.getElementById(key);
    if (checkbox) checkbox.checked = value;
  }
  saveOptions();
}

function enableAll() { setAllSites(true); }
function disableAll() { setAllSites(false); }

function toggleDarkMode() {
  const isDark = document.body.classList.toggle('dark-mode');
  const btn = document.getElementById('toggle-dark-mode');
  if (btn) {
    btn.textContent = isDark ? '☀️' : '🌙';
  }
  
  const storage = getStorage();
  const data = { darkMode: isDark };
  const result = storage.local.set(data);
  if (result && typeof result.then === 'function') {
      result.then(showStatus);
  } else {
      showStatus();
  }
}

function restoreOptions() {
  const container = document.getElementById('options-container');
  const storage = getStorage();

  const render = (result) => {
    const settings = (result && result.siteSettings) ? result.siteSettings : defaultSettings;
    
    // Clear container
    while (container.firstChild) {
      container.removeChild(container.firstChild);
    }

    for (const [key, siteInfo] of Object.entries(sites)) {
        const div = document.createElement('div');
        div.className = 'option-card';
        
        // Label
        const labelEl = document.createElement('a'); // Changed to 'a' tag
        labelEl.className = 'option-label';
        
        // Icon
        const icon = document.createElement('img');
        const hostname = new URL(siteInfo.url).hostname;
        // Use DuckDuckGo's favicon service which often provides better quality/larger icons than Google
        icon.src = `https://icons.duckduckgo.com/ip3/${hostname}.ico`;
        icon.className = 'site-icon';
        labelEl.appendChild(icon);
        
        const textNode = document.createTextNode(siteInfo.label);
        labelEl.appendChild(textNode);

        labelEl.href = siteInfo.url;
        labelEl.target = '_blank';

        // Switch container
        const switchLabel = document.createElement('label');
        switchLabel.className = 'switch';

        // Checkbox
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.id = key;
        checkbox.checked = settings.hasOwnProperty(key) ? settings[key] : true;
        checkbox.addEventListener('change', saveOptions);

        // Slider span
        const slider = document.createElement('span');
        slider.className = 'slider';

        switchLabel.appendChild(checkbox);
        switchLabel.appendChild(slider);
        
        div.appendChild(labelEl);
        div.appendChild(switchLabel);
        container.appendChild(div);
      }
  };

  const result = storage.local.get(['siteSettings', 'darkMode']);
  if (result && typeof result.then === 'function') {
      result.then((res) => {
          render(res);
          applyDarkMode(res.darkMode);
      });
  } else {
      // Older Chrome callback
      storage.local.get(['siteSettings', 'darkMode'], (res) => {
          render(res);
          applyDarkMode(res.darkMode);
      });
  }
}

function applyDarkMode(isDark) {
  // Default to system preference if not set
  if (isDark === undefined) {
    isDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  }
  
  if (isDark) {
    document.body.classList.add('dark-mode');
  } else {
    document.body.classList.remove('dark-mode');
  }
  
  const btn = document.getElementById('toggle-dark-mode');
  if (btn) {
    btn.textContent = isDark ? '☀️' : '🌙';
  }
}

/**
 * Collects all unique match-pattern origins declared in content_scripts.
 * This avoids duplicating URLs — the manifest is the single source of truth.
 */
function getAllOrigins() {
  const api = (typeof browser !== 'undefined' ? browser : chrome);
  const manifest = api.runtime.getManifest();
  const origins = new Set();
  for (const cs of manifest.content_scripts || []) {
    for (const match of cs.matches || []) {
      origins.add(match);
    }
  }
  return Array.from(origins);
}

/**
 * Checks whether all required host permissions are granted.
 * Shows or hides the permissions banner accordingly.
 */
async function checkPermissions() {
  const api = (typeof browser !== 'undefined' ? browser : chrome);
  const banner = document.getElementById('permissions-banner');
  if (!banner) return;

  try {
    const origins = getAllOrigins();
    const result = api.permissions.contains({ origins });

    // Handle both promise-based (Firefox) and callback-based (older Chrome) APIs
    const granted = (result && typeof result.then === 'function')
      ? await result
      : await new Promise(resolve => api.permissions.contains({ origins }, resolve));

    banner.style.display = granted ? 'none' : 'flex';
  } catch (e) {
    console.warn('Could not check permissions:', e);
    banner.style.display = 'none'; // hide if API unavailable
  }
}

/**
 * Requests all required host permissions. Must be called from a user gesture.
 */
async function requestPermissions() {
  const api = (typeof browser !== 'undefined' ? browser : chrome);

  try {
    const origins = getAllOrigins();

    api.permissions.request({ origins });

    // Close the popup immediately so the browser's permission prompt is visible behind it
    window.close();
  } catch (e) {
    console.error('Permission request failed:', e);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  restoreOptions();
  checkPermissions();
  
  // Display version
  const manifest = (typeof browser !== 'undefined' ? browser : chrome).runtime.getManifest();
  const verEl = document.getElementById('version');
  if (verEl) verEl.textContent = `v${manifest.version}`;

  const btnEnable = document.getElementById('enable-all');
  if (btnEnable) btnEnable.addEventListener('click', enableAll);
  const btnDisable = document.getElementById('disable-all');
  if (btnDisable) btnDisable.addEventListener('click', disableAll);
  const btnToggleDark = document.getElementById('toggle-dark-mode');
  if (btnToggleDark) btnToggleDark.addEventListener('click', toggleDarkMode);
  const btnGrant = document.getElementById('grant-permissions');
  if (btnGrant) btnGrant.addEventListener('click', requestPermissions);
});