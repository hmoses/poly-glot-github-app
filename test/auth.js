const crypto = require('crypto');
const jwt = require('jsonwebtoken');

function hashPassword(password, salt) {
  if (!salt) salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha512').toString('hex');
  return { hash, salt };
}

function verifyPassword(password, hash, salt) {
  const result = hashPassword(password, salt);
  return result.hash === hash;
}

function generateToken(userId, role, secret, expiresIn) {
  if (!expiresIn) expiresIn = '24h';
  return jwt.sign({ userId, role, iat: Math.floor(Date.now() / 1000) }, secret, { expiresIn });
}

function verifyToken(token, secret) {
  try {
    return { valid: true, payload: jwt.verify(token, secret) };
  } catch (err) {
    if (err.name === 'TokenExpiredError') return { valid: false, reason: 'expired' };
    if (err.name === 'JsonWebTokenError') return { valid: false, reason: 'invalid' };
    return { valid: false, reason: 'unknown' };
  }
}

function rateLimit(attempts, windowMs, maxAttempts) {
  const now = Date.now();
  const windowStart = now - windowMs;
  const recentAttempts = attempts.filter(ts => ts > windowStart);
  return recentAttempts.length >= maxAttempts;
}

module.exports = { hashPassword, verifyPassword, generateToken, verifyToken, rateLimit };
