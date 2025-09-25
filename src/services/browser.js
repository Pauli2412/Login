// src/services/browser.js
const path = require("path");
const puppeteer = require('puppeteer-extra');
const Stealth = require('puppeteer-extra-plugin-stealth');
const fs = require("fs");

const domainPath = path.resolve(__dirname, "domain.json");
const fullDomainJson = JSON.parse(fs.readFileSync(domainPath, "utf8"));

puppeteer.use(Stealth());

function unquote(v) {
  if (!v) return '';
  const s = String(v).trim();
  return s.replace(/^['"]|['"]$/g, '');
}

function getEnv(key, def = '') {
  return unquote(process.env[key] ?? def);
}

function buildProxyArg({ forceProxy = false } = {}) {
  const proto = getEnv('PROXY_PROTOCOL');
  const host = getEnv('PROXY_HOST');
  const port = getEnv('PROXY_PORT');
  if (forceProxy && host && port) {
    return `--proxy-server=${proto}://${host}:${port}`;
  }
  return null;
}

async function launchBrowser({ forceProxy = false } = {}) {
  const baseArgs = getEnv('PUPPETEER_ARGS')
    .split(',')
    .map(a => a.trim())
    .filter(Boolean);

  const proxyArg = buildProxyArg({ forceProxy });
  const args = proxyArg ? [...baseArgs, proxyArg] : baseArgs;

  console.log(proxyArg ? `🌐 Proxy detectado: ${proxyArg}` : '🚀 Sin proxy (conexión directa)');

  const browser = await puppeteer.launch({
    headless: getEnv('PUPPETEER_HEADLESS').toLowerCase() !== 'false',
    args: [
      ...args,
      '--disable-http2',
      '--disable-gpu',
      '--disable-features=IsolateOrigins,site-per-process',
      '--disable-web-security',
      '--enable-features=NetworkService,NetworkServiceInProcess',
      '--window-size=1366,768'
    ],
    ignoreHTTPSErrors: true,
  });

  const page = await newPage(browser);
  return { browser, page };
}

function preview(obj, max = 300) {
  try {
    const json = JSON.stringify(obj);
    return json.length > max ? json.slice(0, max) + '…' : json;
  } catch {
    return '[unserializable]';
  }
}

async function newPage(browser) {
  const page = await browser.newPage();

  // Proxy auth si aplica
  const user = getEnv('PROXY_USER');
  const pass = getEnv('PROXY_PASS');
  if (user && pass) {
    await page.authenticate({ username: user, password: pass });
  }

  await page.setUserAgent(
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123 Safari/537.36'
  );

  await page.setExtraHTTPHeaders({
    'Accept-Language': 'es-ES,es;q=0.9,en;q=0.8',
    'Upgrade-Insecure-Requests': '1',
  });

  await page.evaluateOnNewDocument(() => {
    Object.defineProperty(navigator, 'language', { get: () => 'es-ES' });
    Object.defineProperty(navigator, 'languages', { get: () => ['es-ES', 'es'] });
  });

  await page.setViewport({ width: 1366, height: 768, deviceScaleFactor: 1 });

  // 🚨 Interceptamos requests
  await page.setRequestInterception(true);
  page.on('request', (req) => {
    const url = req.url();

    if (url.includes("assets/domain.json")) {
      try {
        // Hostname de la página que hizo la request (no del recurso)
        const frameUrl = req.frame()?.url() || '';
        const hostname = frameUrl ? new URL(frameUrl).hostname : 'desconocido';
        const match = fullDomainJson.find(d => d.hostName === hostname);

        // Angular espera un array SIEMPRE
        const payload = match ? [match] : fullDomainJson;

        // 🧭 LOG DETALLADO
        console.log(
          `[domain.json] host="${hostname}" match=${!!match} ` +
          `items=${Array.isArray(payload) ? payload.length : 'N/A'} ` +
          `preview=${preview(Array.isArray(payload) ? payload[0] : payload)}`
        );

        return req.respond({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(payload),
        });
      } catch (e) {
        console.error("❌ Error preparando domain.json:", e);
        return req.respond({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(fullDomainJson),
        });
      }
    }

    const rtype = req.resourceType();
    if (rtype === 'image' || rtype === 'media' || rtype === 'font') return req.abort();
    req.continue();
  });

  return page;
}

module.exports = { launchBrowser, newPage };
