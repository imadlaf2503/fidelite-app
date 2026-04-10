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
// Dans router.js
router.post('/api/reset-points/:id', businessController.resetPoints);
router.post('/api/update-password/:slug', authMiddleware, businessController.updatePassword);

// Ajout du authMiddleware ici aussi pour plus de sécurité :
router.post('/api/update-points/:id', businessController.updatePoints);
// Dans router.js, enlève authMiddleware pour ces lignes aussi :
router.delete('/api/delete-customer/:id', businessController.deleteCustomer);
router.post('/api/update-customer/:id', businessController.updateCustomerInfo);

module.exports = router;