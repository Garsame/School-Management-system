const express = require('express');
const router = express.Router();
const {
    registerTenant,
    login,
    logout,
    getMe,
    getOwnProfile,
    updateOwnProfile,
    updateOwnAvatar,
    changeOwnPassword
} = require('../controllers/authController');
const { protect } = require('../middleware/auth');
const { authRateLimiter, registrationRateLimiter } = require('../middleware/rateLimiter');
const avatarUpload = require('../middleware/avatarUploadMiddleware');

const requireLoginRole = (role) => (req, res, next) => {
    req.body = { ...req.body, requiredRoles: [role] };
    next();
};

const uploadOwnAvatar = (req, res, next) => {
    avatarUpload.single('avatar')(req, res, (error) => {
        if (!error) return avatarUpload.validateUploadedImageSignature(req, res, next);
        const message = error.code === 'LIMIT_FILE_SIZE'
            ? 'Profile image must be 2 MB or smaller.'
            : (error.message || 'Profile image could not be uploaded.');
        return res.status(400).json({ message });
    });
};

router.post('/register-tenant', registrationRateLimiter, registerTenant);
router.post('/login', authRateLimiter, login);
router.post('/finance/login', authRateLimiter, requireLoginRole('finance_director'), login);
router.post('/logout', logout);
router.get('/me', protect, getMe);
router.get('/profile', protect, getOwnProfile);
router.put('/profile', protect, updateOwnProfile);
router.put('/profile/avatar', protect, uploadOwnAvatar, updateOwnAvatar);
router.put('/change-password', protect, changeOwnPassword);

module.exports = router;
