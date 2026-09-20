const express = require('express');
const router = express.Router();

// Fail-close legacy exam route
router.use((req, res) => {
    res.status(410).json({ message: 'Legacy exam route disabled. Use role-specific exam endpoints.' });
});

module.exports = router;
