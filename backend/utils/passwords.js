const crypto = require('crypto');

const generateTemporaryPassword = () => {
    return String(crypto.randomInt(10_000_000, 100_000_000));
};

module.exports = { generateTemporaryPassword };
