const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const multer = require('multer');
const upload = multer()
// Page de login (Accessible via /admin/login)
router.get('/login', adminController.getAdminLogin);

// --- REDIRECTION PAR DÉFAUT ---
// Si on tape juste /admin, on va vers l'inventaire
router.get('/', (req, res) => {
    const token = req.query.auth;
    res.redirect(`/admin/inventory${token ? '?auth=' + token : ''}`);
});

// Pages
router.get('/inventory', adminController.getInventory);
router.get('/create', adminController.getCreateForm);
router.get('/logs', adminController.getLogs);
router.get('/edit/:id', adminController.getEditBusiness); 
// API Actions
router.post('/api/creer-commerce', upload.single('logo_file'), adminController.createBusiness);
router.post('/api/valider-paiement/:id', adminController.validatePayment);
router.post('/api/toggle-maintenance/:id', adminController.toggleMaintenance);
// routes/adminRoutes.js
router.post('/api/update-business/:id', upload.single('logo_file'), adminController.updateBusiness);

module.exports = router;