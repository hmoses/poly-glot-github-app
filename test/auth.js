const crypto = require('crypto');
const jwt = require('jsonwebtoken');

const SESSION_DURATION = 60 * 60 * 24;
const MAX_LOGIN_ATTEMPTS = 5;
const LOCKOUT_DURATION = 15 * 60;

function hashPassword(password, salt) {
  return crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha512').toString('hex');
}

function generateSalt() {
  return crypto.randomBytes(32).toString('hex');
}

function validatePassword(password) {
  if (password.length < 8) return { valid: false, reason: 'too_short' };
  if (!/[A-Z]/.test(password)) return { valid: false, reason: 'no_uppercase' };
  if (!/[0-9]/.test(password)) return { valid: false, reason: 'no_number' };
  if (!/[^A-Za-z0-9]/.test(password)) return { valid: false, reason: 'no_special' };
  return { valid: true };
}

function createToken(userId, role, secret) {
  return jwt.sign(
    { sub: userId, role, iat: Math.floor(Date.now() / 1000) },
    secret,
    { expiresIn: SESSION_DURATION, algorithm: 'HS256' }
  );
}

function verifyToken(token, secret) {
  try {
    return { valid: true, payload: jwt.verify(token, secret) };
  } catch (err) {
    return { valid: false, error: err.message };
  }
}

function isAccountLocked(loginAttempts, lastAttemptTime) {
  if (loginAttempts < MAX_LOGIN_ATTEMPTS) return false;
  const elapsed = (Date.now() - lastAttemptTime) / 1000;
  return elapsed < LOCKOUT_DURATION;
}

function sanitizeUser(user) {
  const { password, salt, resetToken, ...safe } = user;
  return safe;
}

module.exports = {
  hashPassword,
  generateSalt,
  validatePassword,
  createToken,
  verifyToken,
  isAccountLocked,
  sanitizeUser
};
