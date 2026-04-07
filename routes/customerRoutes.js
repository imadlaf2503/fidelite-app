const express = require('express');
const router = express.Router();
const customerController = require('../controllers/customerController');

router.get('/my-card/:id', customerController.getCard);
router.get('/signup/:slug', customerController.getSignupForm);

module.exports = router;