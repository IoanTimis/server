const express = require('express');
const { requestResetController, confirmResetController } = require('../controllers/PasswordReset.js');

const router = express.Router();

// Debug middleware: logs method and path for visibility during testing
router.use((req, _res, next) => {
	console.log(`[password routes] ${req.method} ${req.originalUrl}`);
	next();
});

// Quick connectivity check
router.get('/ping', (_req, res) => res.json({ ok: true }));

router.post('/request', requestResetController);
router.post('/confirm', confirmResetController);

module.exports = router;
