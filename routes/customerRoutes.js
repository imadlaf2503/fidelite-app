const express = require('express');
const router = express.Router();
const customerController = require('../controllers/customerController');

router.get('/my-card/:id', customerController.getCard);
router.get('/signup/:slug', customerController.getSignupForm);
router.get('/manifest.json', customerController.getManifest);
router.post('/api/register-customer/:slug', customerController.registerCustomer);

module.exports = router;