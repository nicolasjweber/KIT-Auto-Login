/**
 * Automatically generates `assets/screenshot_light.png` and `assets/screenshot_dark.png`
 * from `options/options.html` + `options/options.js` + `scripts/sites.js` using headless Chrome.
 *
 * Works with zero npm dependencies by driving a local Chrome/Chromium installation
 * (`--headless=new --screenshot --force-device-scale-factor=2`).
 *
 * Usage:
 *   node .github/scripts/update-screenshots.js
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const repoRoot = path.resolve(__dirname, '..', '..');
const manifest = JSON.parse(fs.readFileSync(path.join(repoRoot, 'manifest.json'), 'utf8'));

function findChromeBinary() {
    const candidates = [
        process.env.CHROME_PATH,
        'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
        'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
        '/usr/bin/google-chrome',
        '/usr/bin/chromium-browser',
        '/usr/bin/chromium',
        '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    ].filter(Boolean);

    for (const candidate of candidates) {
        if (fs.existsSync(candidate)) return candidate;
    }
    throw new Error('Could not find Chrome/Chromium binary. Set CHROME_PATH environment variable.');
}

function buildRenderHtml(isDark) {
    const optionsHtml = fs.readFileSync(path.join(repoRoot, 'options', 'options.html'), 'utf8');
    const sitesUrl = 'file:///' + path.join(repoRoot, 'scripts', 'sites.js').replace(/\\/g, '/');
    const optionsJsUrl = 'file:///' + path.join(repoRoot, 'options', 'options.js').replace(/\\/g, '/');
    const iconsBaseUrl = 'file:///' + path.join(repoRoot, 'icons', 'sites').replace(/\\/g, '/');

    const mockScript = `
<script>
  window.matchMedia = (q) => ({
    matches: ${isDark ? 'true' : 'false'},
    addEventListener: () => {},
  });
  window.chrome = {
    runtime: {
      getManifest: () => (${JSON.stringify({ version: manifest.version, content_scripts: manifest.content_scripts })}),
    },
    storage: {
      sync: {
        get: () => Promise.resolve({}),
        set: () => Promise.resolve(),
      },
      local: {
        get: () => Promise.resolve({}),
        set: () => Promise.resolve(),
      },
    },
    permissions: {
      contains: () => Promise.resolve(true),
      request: () => Promise.resolve(true),
      onAdded: { addListener: () => {} },
      onRemoved: { addListener: () => {} },
    },
    tabs: {
      query: () => Promise.resolve([]),
      onActivated: { addListener: () => {} },
      onUpdated: { addListener: () => {} },
    },
  };
</script>`;

    return optionsHtml
        .replace('<head>', `<head>${mockScript}<style>html, body { scrollbar-width: none; } ::-webkit-scrollbar { display: none; }</style>`)
        .replace('../scripts/sites.js', sitesUrl)
        .replace(
            '<script src="options.js"></script>',
            `<script src="${optionsJsUrl}"></script><script>
              document.addEventListener('DOMContentLoaded', () => {
                setTimeout(() => {
                  document.querySelectorAll('img.site-icon').forEach((img) => {
                    const name = img.getAttribute('src').split('/').pop();
                    img.src = '${iconsBaseUrl}/' + name;
                  });
                }, 50);
              });
            </script>`
        );
}

function runChrome(chromeBin, args) {
    execFileSync(chromeBin, args, { stdio: 'ignore' });
}

function main() {
    const chromeBin = findChromeBinary();
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kal-screenshots-'));
    const profileDir = path.join(tmpDir, 'profile');

    try {
        // Compute exact height from the number of sites (header + toolbar + 18 cards + footer)
        // First measure actual document.body.scrollHeight via --dump-dom
        const probeHtmlPath = path.join(tmpDir, 'probe.html');
        const probeFileUrl = 'file:///' + probeHtmlPath.replace(/\\/g, '/');
        const probeHtml = buildRenderHtml(false).replace(
            '</body>',
            `<script>setTimeout(() => { const c = document.querySelector('.container'); document.title = 'HEIGHT:' + Math.ceil(c.getBoundingClientRect().height); }, 300);</script></body>`
        );
        fs.writeFileSync(probeHtmlPath, probeHtml, 'utf8');

        const domDump = execFileSync(
            chromeBin,
            [
                '--headless=new',
                '--no-sandbox',
                '--disable-gpu',
                '--no-first-run',
                `--user-data-dir=${profileDir}`,
                '--allow-file-access-from-files',
                '--window-size=500,600',
                '--virtual-time-budget=1000',
                '--dump-dom',
                probeFileUrl,
            ],
            { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }
        );

        const heightMatch = domDump.match(/<title>HEIGHT:(\d+)<\/title>/);
        const cssHeight = heightMatch ? parseInt(heightMatch[1], 10) : 1480;
        const cssWidth = 500;

        for (const mode of ['light', 'dark']) {
            const isDark = mode === 'dark';
            const htmlPath = path.join(tmpDir, `options_${mode}.html`);
            const fileUrl = 'file:///' + htmlPath.replace(/\\/g, '/');
            const outPath = path.join(repoRoot, 'assets', `screenshot_${mode}.png`);

            fs.writeFileSync(htmlPath, buildRenderHtml(isDark), 'utf8');

            runChrome(chromeBin, [
                '--headless=new',
                '--no-sandbox',
                '--disable-gpu',
                '--no-first-run',
                '--hide-scrollbars',
                `--user-data-dir=${profileDir}`,
                '--allow-file-access-from-files',
                '--force-device-scale-factor=2',
                `--window-size=${cssWidth},${cssHeight}`,
                '--virtual-time-budget=1000',
                `--screenshot=${outPath}`,
                fileUrl,
            ]);

            console.log(`Updated assets/screenshot_${mode}.png (${cssWidth * 2}x${cssHeight * 2}px)`);
        }
    } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
    }
}

main();
