const crypto = require('crypto');
const jwt = require('jsonwebtoken');

function hashPassword(password, salt) {
  const iterations = 10000;
  const keylen = 64;
  const digest = 'sha512';
  return crypto.pbkdf2Sync(password, salt, iterations, keylen, digest).toString('hex');
}

function generateSalt() {
  return crypto.randomBytes(16).toString('hex');
}

function verifyPassword(password, hash, salt) {
  const newHash = hashPassword(password, salt);
  return crypto.timingSafeEqual(Buffer.from(newHash), Buffer.from(hash));
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

function isRateLimited(ip, attempts, windowMs, store) {
  const key = `ratelimit:${ip}`;
  const now = Date.now();
  const windowStart = now - windowMs;
  const recentAttempts = (store[key] || []).filter(t => t > windowStart);
  store[key] = [...recentAttempts, now];
  return recentAttempts.length >= attempts;
}

module.exports = { hashPassword, generateSalt, verifyPassword, createToken, verifyToken, isRateLimited };
