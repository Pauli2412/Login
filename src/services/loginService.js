// src/services/loginService.js
const { launchBrowser } = require('./browser');
const { readConfPlataformas } = require('./sheetsConfig');
const { setSession, getSession } = require('./sessionStore');
const Aguante = require('./platform/aguante');
const Playbet = require('./platform/playbet');
const Ganamos = require('./platform/ganamos');
const Buffalo = require('./platform/buffalo');
const logger = require('../utils/logger');

const ADAPTERS = {
  aguante: new Aguante(),
  playbet: new Playbet(),
  ganamos: new Ganamos(),
  buffalo: new Buffalo(),
};

async function fetchConfig() {
  const conf = await readConfPlataformas();

  return conf.reduce((acc, c) => {
    // 🔑 convertir todas las claves a minúscula
    const normalized = Object.fromEntries(
      Object.entries(c).map(([k, v]) => [k.toLowerCase(), v])
    );

    const key = (normalized.plataforma || "").toLowerCase();
    if (!key) return acc;

    acc[key] = {
      urlLogin: normalized.urllogin || "",
      user: normalized.user || "",
      pass: normalized.pass || "",
    };
    return acc;
  }, {});
}

async function doLoginOne(platformKey, confByPlatform) {
  const key = platformKey.toLowerCase();
  const adapter = ADAPTERS[key];
  if (!adapter) throw new Error(`Plataforma no soportada: ${platformKey}`);

  const creds = confByPlatform[key];
  if (!creds || !creds.urlLogin || !creds.user || !creds.pass) {
    throw new Error(`Faltan credenciales/URL para ${platformKey} en ConfPlataformas`);
  }

  // Solo Ganamos usa proxy
  const useProxy = key === 'ganamos';

  const { browser, page } = await launchBrowser({ forceProxy: useProxy });

  try {
    await adapter.login(page, creds);
    const ok = await adapter.isLogged(page);
    if (!ok) throw new Error(`Login fallido en ${platformKey}`);

    const cookies = await page.cookies();
    const token = await page.evaluate(
      () => localStorage.getItem('authToken') || sessionStorage.getItem('authToken')
    );

    setSession(platformKey, { cookies, token });
    return { ok: true };
  } finally {
    await browser.close().catch(() => {});
  }
}


async function doLoginAll() {
  const confByPlatform = await fetchConfig();
  const keys = Object.keys(ADAPTERS);
  const results = {};
  for (const k of keys) {
    try {
      results[k] = await doLoginOne(k, confByPlatform);
    } catch (e) {
      results[k] = { ok: false, error: e.message };
    }
  }
  return results;
}

async function getSessionFor(platformKey) {
  const s = getSession(platformKey);
  if (!s) return { ok: false, error: 'No session' };
  return { ok: true, ...s };
}

async function keepAlive(platformKey) {
  const conf = await fetchConfig();
  if (platformKey) {
    const r = await doLoginOne(platformKey, conf);
    return { [platformKey.toLowerCase()]: r };
  }
  return await doLoginAll();
}

/**
 * Realiza un depósito de fichas en una plataforma
 * @param {string} plataforma - Nombre de la plataforma (ej: "Playbet")
 * @param {string} usuario - Usuario a acreditar
 * @param {number} monto - Cantidad de fichas
 */
async function depositar(plataforma, usuario, monto) {
  const PlatformClass = platformMap[plataforma];
  if (!PlatformClass) {
    throw new Error(`Plataforma desconocida: ${plataforma}`);
  }

  const platform = new PlatformClass();
  return platform.depositar(usuario, monto);
}

module.exports = { fetchConfig, doLoginOne, doLoginAll, getSessionFor, keepAlive, depositar };
