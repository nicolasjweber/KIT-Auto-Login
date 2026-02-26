const sites = {
  "idp": { label: "Shibboleth Identity Provider", url: "https://idp.scc.kit.edu" },
  "ilias": { label: "ILIAS", url: "https://ilias.studium.kit.edu" },
  "campus": { label: "Campus Management", url: "https://campus.studium.kit.edu" },
  "campus_plus": { label: "Campus Plus Portal", url: "https://plus.campus.kit.edu" },
  "wiwi_portal": { label: "WiWi Portal [WIP]", url: "https://portal.wiwi.kit.edu" },
  "scc": { label: "SCC Self-Service Portal", url: "https://my.scc.kit.edu" },
  "lecture_translator": { label: "Lecture Translator", url: "https://lecture-translator.kit.edu" },
  "gitlab": { label: "GitLab", url: "https://gitlab.kit.edu" },
  "bewerbung": { label: "Bewerbungsportal", url: "https://bewerbung.studium.kit.edu" },
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

  const result = storage.local.get('siteSettings');
  if (result && typeof result.then === 'function') {
      result.then(render);
  } else {
      // Older Chrome callback
      storage.local.get('siteSettings', render);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  restoreOptions();
  
  // Display version
  const manifest = (typeof browser !== 'undefined' ? browser : chrome).runtime.getManifest();
  const verEl = document.getElementById('version');
  if (verEl) verEl.textContent = `v${manifest.version}`;

  const btnEnable = document.getElementById('enable-all');
  if (btnEnable) btnEnable.addEventListener('click', enableAll);
  const btnDisable = document.getElementById('disable-all');
  if (btnDisable) btnDisable.addEventListener('click', disableAll);
});