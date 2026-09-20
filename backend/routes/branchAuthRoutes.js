const express = require('express');
const router = express.Router();
const { login, getMe } = require('../controllers/authController');
const { protect } = require('../middleware/auth');
const { authRateLimiter } = require('../middleware/rateLimiter');

// Public: Login
router.post('/login', authRateLimiter, login);

// Private: Get current session and effective permissions
router.get('/me', protect, getMe);

module.exports = router;
