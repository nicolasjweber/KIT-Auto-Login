/**
 * Automatically generates:
 *   - `assets/screenshot_light.png` & `assets/screenshot_dark.png` (tall README / AMO screenshots)
 *   - `assets/screenshot_cws_light.png` & `assets/screenshot_cws_dark.png` (1280x800 Chrome Web Store promo screenshots)
 *
 * Works with zero npm dependencies by driving a local Chrome/Chromium installation.
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

function buildRenderHtml(isDark, extraCss = '', activeTabUrl = '') {
    const optionsHtml = fs.readFileSync(path.join(repoRoot, 'options', 'options.html'), 'utf8');
    const sitesUrl = 'file:///' + path.join(repoRoot, 'scripts', 'sites.js').replace(/\\/g, '/');
    const optionsJsUrl = 'file:///' + path.join(repoRoot, 'options', 'options.js').replace(/\\/g, '/');
    const iconsBaseUrl = 'file:///' + path.join(repoRoot, 'icons', 'sites').replace(/\\/g, '/');

    const tabsResult = activeTabUrl ? JSON.stringify([{ id: 1, url: activeTabUrl }]) : '[]';

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
      query: () => Promise.resolve(${tabsResult}),
      onActivated: { addListener: () => {} },
      onUpdated: { addListener: () => {} },
    },
  };
</script>`;

    return optionsHtml
        .replace(
            '<head>',
            `<head>${mockScript}<style>html, body { scrollbar-width: none; } ::-webkit-scrollbar { display: none; } ${extraCss}</style>`
        )
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

function buildChromeWebStoreHtml(isDark, lightPopupFileUrl, darkPopupFileUrl) {
    const iconSvgUrl = 'file:///' + path.join(repoRoot, 'icons', 'icon.svg').replace(/\\/g, '/');
    const primaryPopupUrl = isDark ? darkPopupFileUrl : lightPopupFileUrl;
    const secondaryPopupUrl = isDark ? lightPopupFileUrl : darkPopupFileUrl;

    const bg = isDark ? '#16181a' : '#f1f3f5';
    const textColor = isDark ? '#f1f3f5' : '#18181b';
    const subColor = isDark ? '#a1a1aa' : '#52525b';

    return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body {
    width: 1280px;
    height: 800px;
    overflow: hidden;
    font-family: 'Segoe UI', system-ui, -apple-system, sans-serif;
    background: ${bg};
    color: ${textColor};
  }
  .canvas {
    width: 1280px;
    height: 800px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 76px;
    gap: 48px;
  }
  .left {
    flex: 0 0 430px;
    display: flex;
    flex-direction: column;
    gap: 24px;
  }
  .brand {
    display: flex;
    align-items: center;
    gap: 18px;
  }
  .brand img {
    width: 64px;
    height: 64px;
    border-radius: 14px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, ${isDark ? '0.35' : '0.08'});
  }
  h1 {
    font-size: 40px;
    font-weight: 700;
    letter-spacing: -0.02em;
    line-height: 1.1;
  }
  h1 span {
    color: #009682;
  }
  .subtitle {
    font-size: 20px;
    line-height: 1.55;
    color: ${subColor};
    font-weight: 400;
  }
  .right {
    position: relative;
    flex: 1;
    height: 700px;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .popup-frame {
    width: 440px;
    height: 680px;
    border-radius: 14px;
    overflow: hidden;
    border: 1px solid ${isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.1)'};
    box-shadow: 0 18px 44px rgba(0, 0, 0, ${isDark ? '0.5' : '0.12'});
    position: relative;
  }
  .popup-frame.primary {
    z-index: 2;
    transform: translate(-55px, 0);
    background: ${isDark ? '#121212' : '#f8f9fa'};
  }
  .popup-frame.secondary {
    position: absolute;
    right: 0;
    top: 32px;
    width: 390px;
    height: 620px;
    z-index: 1;
    opacity: 0.92;
    transform: translate(15px, 10px) scale(0.94);
    background: ${isDark ? '#f8f9fa' : '#121212'};
  }
  iframe {
    width: 500px;
    height: 775px;
    border: none;
    transform: scale(0.88);
    transform-origin: top left;
    pointer-events: none;
  }
  .popup-frame.secondary iframe {
    height: 800px;
    transform: scale(0.78);
  }
</style>
</head>
<body>
  <div class="canvas">
    <div class="left">
      <div class="brand">
        <img src="${iconSvgUrl}" alt="KIT Auto-Login">
        <h1>KIT <span>Auto-Login</span></h1>
      </div>
      <p class="subtitle">
        Zero-click login for KIT services. Automatically clicks through the login pages for ILIAS, Campus Management, GitLab, WiWi Portal, and other portals.
      </p>
    </div>
    <div class="right">
      <div class="popup-frame primary">
        <iframe src="${primaryPopupUrl}"></iframe>
      </div>
      <div class="popup-frame secondary">
        <iframe src="${secondaryPopupUrl}"></iframe>
      </div>
    </div>
  </div>
</body>
</html>`;
}

function buildSmallPromoHtml(isDark) {
    const iconSvgUrl = 'file:///' + path.join(repoRoot, 'icons', 'icon.svg').replace(/\\/g, '/');
    const bgColor = isDark ? '#16181a' : '#f1f3f5';
    const textColor = isDark ? '#f1f3f5' : '#18181b';
    const subtextColor = isDark ? '#a1a1aa' : '#52525b';
    return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body {
    width: 440px;
    height: 280px;
    overflow: hidden;
    font-family: 'Segoe UI', system-ui, -apple-system, sans-serif;
    background: ${bgColor};
    color: ${textColor};
  }
  .canvas {
    width: 440px;
    height: 280px;
    display: flex;
    flex-direction: column;
    justify-content: center;
    padding: 36px 40px;
    gap: 18px;
  }
  .brand {
    display: flex;
    align-items: center;
    gap: 16px;
  }
  .brand img {
    width: 58px;
    height: 58px;
    border-radius: 14px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, ${isDark ? '0.35' : '0.1'});
  }
  h1 {
    font-size: 31px;
    font-weight: 700;
    letter-spacing: -0.02em;
    line-height: 1.1;
  }
  h1 span {
    color: #009682;
  }
  p {
    font-size: 16px;
    line-height: 1.45;
    color: ${subtextColor};
  }
</style>
</head>
<body>
  <div class="canvas">
    <div class="brand">
      <img src="${iconSvgUrl}" alt="KIT Auto-Login">
      <h1>KIT <span>Auto-Login</span></h1>
    </div>
    <p>
      Zero-click login for ILIAS, Campus Management, GitLab, WiWi Portal, and other KIT services.
    </p>
  </div>
</body>
</html>`;
}

function buildMarqueePromoHtml(isDark, lightPopupFileUrl, darkPopupFileUrl) {
    const iconSvgUrl = 'file:///' + path.join(repoRoot, 'icons', 'icon.svg').replace(/\\/g, '/');
    const bgColor = isDark ? '#16181a' : '#f1f3f5';
    const textColor = isDark ? '#f1f3f5' : '#18181b';
    const subtextColor = isDark ? '#a1a1aa' : '#52525b';
    const primaryPopupUrl = isDark ? darkPopupFileUrl : lightPopupFileUrl;
    const secondaryPopupUrl = isDark ? lightPopupFileUrl : darkPopupFileUrl;
    return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body {
    width: 1400px;
    height: 560px;
    overflow: hidden;
    font-family: 'Segoe UI', system-ui, -apple-system, sans-serif;
    background: ${bgColor};
    color: ${textColor};
  }
  .canvas {
    width: 1400px;
    height: 560px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 96px;
    gap: 56px;
  }
  .left {
    flex: 0 0 500px;
    display: flex;
    flex-direction: column;
    gap: 24px;
  }
  .brand {
    display: flex;
    align-items: center;
    gap: 20px;
  }
  .brand img {
    width: 72px;
    height: 72px;
    border-radius: 16px;
    box-shadow: 0 4px 16px rgba(0, 0, 0, ${isDark ? '0.35' : '0.1'});
  }
  h1 {
    font-size: 46px;
    font-weight: 700;
    letter-spacing: -0.02em;
    line-height: 1.1;
  }
  h1 span {
    color: #009682;
  }
  .subtitle {
    font-size: 21px;
    line-height: 1.55;
    color: ${subtextColor};
  }
  .right {
    position: relative;
    flex: 1;
    height: 560px;
    display: flex;
    align-items: flex-start;
    justify-content: center;
    padding-top: 42px;
  }
  .popup-frame {
    width: 420px;
    height: 560px;
    border-radius: 14px;
    overflow: hidden;
    border: 1px solid ${isDark ? 'rgba(255, 255, 255, 0.12)' : 'rgba(0, 0, 0, 0.1)'};
    box-shadow: 0 20px 50px rgba(0, 0, 0, ${isDark ? '0.55' : '0.14'});
    position: relative;
  }
  .popup-frame.primary {
    z-index: 2;
    transform: translate(-65px, 0);
    background: ${isDark ? '#121212' : '#f8f9fa'};
  }
  .popup-frame.secondary {
    position: absolute;
    right: 10px;
    top: 76px;
    width: 380px;
    height: 520px;
    z-index: 1;
    opacity: 0.94;
    transform: translate(10px, 0) scale(0.94);
    background: ${isDark ? '#f8f9fa' : '#121212'};
  }
  iframe {
    width: 500px;
    height: 700px;
    border: none;
    transform: scale(0.84);
    transform-origin: top left;
    pointer-events: none;
  }
  .popup-frame.secondary iframe {
    transform: scale(0.76);
  }
</style>
</head>
<body>
  <div class="canvas">
    <div class="left">
      <div class="brand">
        <img src="${iconSvgUrl}" alt="KIT Auto-Login">
        <h1>KIT <span>Auto-Login</span></h1>
      </div>
      <p class="subtitle">
        Zero-click login for KIT services. Automatically clicks through the login pages for ILIAS, Campus Management, GitLab, WiWi Portal, and other portals.
      </p>
    </div>
    <div class="right">
      <div class="popup-frame primary">
        <iframe src="${primaryPopupUrl}"></iframe>
      </div>
      <div class="popup-frame secondary">
        <iframe src="${secondaryPopupUrl}"></iframe>
      </div>
    </div>
  </div>
</body>
</html>`;
}

function runChrome(chromeBin, args) {
    execFileSync(chromeBin, args, { stdio: 'ignore' });
}

function main() {
    const chromeBin = findChromeBinary();
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kal-screenshots-'));
    const profileDir = path.join(tmpDir, 'profile');

    try {
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

        // 1. Tall README / AMO screenshots (1000x3014)
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

        // 2. Chrome Web Store 1280x800 landscape screenshots
        const cwsPopupLightPath = path.join(tmpDir, 'cws_popup_light.html');
        const cwsPopupDarkPath = path.join(tmpDir, 'cws_popup_dark.html');
        fs.writeFileSync(cwsPopupLightPath, buildRenderHtml(false, '', 'https://ilias.studium.kit.edu/'), 'utf8');
        fs.writeFileSync(cwsPopupDarkPath, buildRenderHtml(true, '', 'https://ilias.studium.kit.edu/'), 'utf8');

        const lightPopupFileUrl = 'file:///' + cwsPopupLightPath.replace(/\\/g, '/');
        const darkPopupFileUrl = 'file:///' + cwsPopupDarkPath.replace(/\\/g, '/');

        for (const mode of ['light', 'dark']) {
            const isDark = mode === 'dark';
            const cwsHtmlPath = path.join(tmpDir, `cws_${mode}.html`);
            const cwsFileUrl = 'file:///' + cwsHtmlPath.replace(/\\/g, '/');
            const outPath = path.join(repoRoot, 'assets', `screenshot_cws_${mode}.png`);

            fs.writeFileSync(
                cwsHtmlPath,
                buildChromeWebStoreHtml(isDark, lightPopupFileUrl, darkPopupFileUrl),
                'utf8'
            );

            runChrome(chromeBin, [
                '--headless=new',
                '--no-sandbox',
                '--disable-gpu',
                '--no-first-run',
                '--hide-scrollbars',
                `--user-data-dir=${profileDir}`,
                '--allow-file-access-from-files',
                '--force-device-scale-factor=1',
                '--window-size=1280,800',
                '--virtual-time-budget=1500',
                `--screenshot=${outPath}`,
                cwsFileUrl,
            ]);

            console.log(`Updated assets/screenshot_cws_${mode}.png (1280x800px)`);
        }

        // 3. Chrome Web Store promo tiles: Small (440x280) and Marquee (1400x560)
        const promoTiles = [
            {
                name: 'promo_small_light.png',
                width: 440,
                height: 280,
                html: buildSmallPromoHtml(false),
            },
            {
                name: 'promo_small_dark.png',
                width: 440,
                height: 280,
                html: buildSmallPromoHtml(true),
            },
            {
                name: 'promo_marquee_light.png',
                width: 1400,
                height: 560,
                html: buildMarqueePromoHtml(false, lightPopupFileUrl, darkPopupFileUrl),
            },
            {
                name: 'promo_marquee_dark.png',
                width: 1400,
                height: 560,
                html: buildMarqueePromoHtml(true, lightPopupFileUrl, darkPopupFileUrl),
            },
        ];

        for (const tile of promoTiles) {
            const tileHtmlPath = path.join(tmpDir, `${tile.name}.html`);
            const tileFileUrl = 'file:///' + tileHtmlPath.replace(/\\/g, '/');
            const outPath = path.join(repoRoot, 'assets', tile.name);

            fs.writeFileSync(tileHtmlPath, tile.html, 'utf8');

            runChrome(chromeBin, [
                '--headless=new',
                '--no-sandbox',
                '--disable-gpu',
                '--no-first-run',
                '--hide-scrollbars',
                `--user-data-dir=${profileDir}`,
                '--allow-file-access-from-files',
                '--force-device-scale-factor=1',
                `--window-size=${tile.width},${tile.height}`,
                '--virtual-time-budget=1500',
                `--screenshot=${outPath}`,
                tileFileUrl,
            ]);

            console.log(`Updated assets/${tile.name} (${tile.width}x${tile.height}px)`);
        }
    } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
    }
}

main();
