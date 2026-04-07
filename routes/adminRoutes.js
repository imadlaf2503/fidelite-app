const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const multer = require('multer');
const upload = multer();

// --- NOUVELLE ROUTE CONFIG ---
router.get('/api/config', (req, res) => {
    res.json({
        url: process.env.SUPABASE_URL,
        key: process.env.SUPABASE_KEY
    });
});

// Page de login
router.get('/login', adminController.getAdminLogin);

// Redirection par défaut
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
router.post('/api/update-business/:id', upload.single('logo_file'), adminController.updateBusiness);

// Route pour loguer les tentatives (Optionnel pour voir sur Render)
router.post('/api/log-auth', (req, res) => {
    console.log(`[AUTH] Tentative de connexion pour : ${req.body.email} - Statut : ${req.body.status}`);
    res.sendStatus(200);
});

module.exports = router;