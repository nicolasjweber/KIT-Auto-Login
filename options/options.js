const sites = {
  "idp": "KIT Shibboleth Identity Provider",
  "ilias": "ILIAS",
  "campus": "Campus Management",
  "campus_plus": "Campus Plus Portal",
  "wiwi_portal": "WiWi Portal [WIP]",
  "lecture_translator": "Lecture Translator",
  "gitlab": "GitLab",
  "bewerbung": "Bewerbungsportal",
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
    status.style.opacity = '1';
    setTimeout(() => {
      status.style.opacity = '0';
    }, 1500);
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

    for (const [key, label] of Object.entries(sites)) {
        const div = document.createElement('div');
        div.className = 'option-card';
        
        // Label
        const labelEl = document.createElement('div');
        labelEl.className = 'option-label';
        labelEl.textContent = label;
        labelEl.onclick = () => {
          // Toggle checkbox when clicking label area
          const cb = document.getElementById(key);
          cb.checked = !cb.checked;
          saveOptions();
        };

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
  const btnEnable = document.getElementById('enable-all');
  if (btnEnable) btnEnable.addEventListener('click', enableAll);
  const btnDisable = document.getElementById('disable-all');
  if (btnDisable) btnDisable.addEventListener('click', disableAll);
});