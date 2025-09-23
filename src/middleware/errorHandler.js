const logger = require('../utils/logger');

module.exports = (err, _req, res, _next) => {
  logger.error({ err }, 'Unhandled error');
  res.status(err.status || 500).json({ ok: false, error: err.message || 'Internal error' });
};
