const express = require('express');
const router = express.Router();
const { 
    getPublicStats, 
    getPublicPlans, 
    getPublicSchools,
    getPublicPlatformSettings, 
    getPublicPlatformStats 
} = require('../controllers/platformController');

router.get('/stats', getPublicStats);
router.get('/platform-stats', getPublicPlatformStats);
router.get('/plans', getPublicPlans);
router.get('/schools', getPublicSchools);
router.get('/platform-settings', getPublicPlatformSettings);
router.get('/settings', getPublicPlatformSettings);

module.exports = router;
