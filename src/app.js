require("dotenv").config();
const express = require('express');
const dotenv = require('dotenv');
const cron = require('node-cron');
const loginRoutes = require('./routes/loginRoutes');
const errorHandler = require('./middleware/errorHandler');
const logger = require('./utils/logger');
const { keepAlive } = require('./services/loginService');

dotenv.config();

const app = express();
app.use(express.json({ limit: '1mb' }));

app.use('/', loginRoutes);
app.use(errorHandler);

const PORT = process.env.PORT || 4002;
app.listen(PORT, () => {
  logger.info(`ms-login running on :${PORT}`);
});

console.log("GOOGLE_PRIVATE_KEY length:", (process.env.GOOGLE_PRIVATE_KEY || "").length);


// Cron: refrescar sesiones y leer conf periódicamente
const spec = process.env.KEEPALIVE_CRON || '*/10 * * * *';
cron.schedule(spec, async () => {
  try {
    const r = await keepAlive();
    logger.info({ r }, 'keepalive cron done');
  } catch (e) {
    logger.error({ e }, 'keepalive cron failed');
  }
});
