const crypto = require('crypto');
const jwt = require('jsonwebtoken');

function hashPassword(password, salt) {
  return crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha512').toString('hex');
}

function generateSalt() {
  return crypto.randomBytes(16).toString('hex');
}

function createToken(userId, secret, expiresIn) {
  return jwt.sign({ sub: userId, iat: Math.floor(Date.now() / 1000) }, secret, { expiresIn });
}

function verifyToken(token, secret) {
  try {
    return jwt.verify(token, secret);
  } catch (err) {
    return null;
  }
}

function isRateLimited(attempts, maxAttempts, windowMs) {
  const now = Date.now();
  const recent = attempts.filter(t => now - t < windowMs);
  return recent.length >= maxAttempts;
}

function sanitizeUser(user) {
  const { password, salt, ...safe } = user;
  return safe;
}

module.exports = { hashPassword, generateSalt, createToken, verifyToken, isRateLimited, sanitizeUser };
