const express = require('express');
const router = express.Router();
const { doLoginOne, doLoginAll, getSessionFor, keepAlive } = require('../services/loginService');
const { listSheets, readConfPlataformas, testAuth } = require("../services/sheetsConfig"); 
const logger = require('../utils/logger');



router.get('/health', (_req, res) => res.json({ ok: true, service: 'ms-login' }));

// Forzar login de una o todas
router.post('/login', async (req, res, next) => {
  try {
    const { plataforma } = req.body || {};
    const result = plataforma ? await doLoginOne(plataforma, await require('../services/loginService').fetchConfig())
                              : await doLoginAll();
    res.json({ ok: true, result });
  } catch (e) { next(e); }
});

// Obtener sesión (cookies/token) para que ms-deposito use
router.get('/session', async (req, res, next) => {
  try {
    const { plataforma } = req.query;
    if (!plataforma) return res.status(400).json({ ok: false, error: 'plataforma requerida' });
    const s = await getSessionFor(plataforma);
    res.json(s);
  } catch (e) { next(e); }
});

// Mantener sesiones vivas (cron externo o manual)
router.post('/keepalive', async (req, res, next) => {
  try {
    const { plataforma } = req.body || {};
    const result = await keepAlive(plataforma);
    res.json({ ok: true, result });
  } catch (e) { next(e); }
});


// Test: listar pestañas
router.get("/test-sheets", async (req, res) => {
  try {
    const sheets = await listSheets();
    res.json({ ok: true, availableSheets: sheets });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Test: leer ConfPlataformas
router.get("/test-conf", async (req, res) => {
  try {
    const rows = await readConfPlataformas();
    res.json({ ok: true, rows });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.get("/test-auth", async (req, res) => {
  try {
    const token = await require("../services/sheetsConfig").testAuth();
    res.json({ ok: true, token });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});


module.exports = router;
