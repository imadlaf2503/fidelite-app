const express = require('express');
const router = express.Router();
const businessController = require('../controllers/businessController');
const authMiddleware = require('../middleware/authMiddleware'); 

// --- PAGES PUBLIQUES (SANS LOGIN) ---
router.get('/login/:slug', businessController.getLogin);

// --- PAGES PROTÉGÉES (AVEC AUTH) ---
router.get('/:slug', authMiddleware, businessController.getDashboard);
router.get('/prepare-scan/:slug', authMiddleware, businessController.getPrepareScan);
router.get('/scanner/:slug', authMiddleware, businessController.getScannerPage);
router.get('/:slug/logout', businessController.logout);

// --- API ACTIONS PROTÉGÉES ---
router.post('/api/scan/:id', authMiddleware, businessController.handleScan);
router.post('/api/reset-points/:id', authMiddleware, businessController.resetPoints);
router.post('/api/update-password/:slug', authMiddleware, businessController.updatePassword);

module.exports = router;