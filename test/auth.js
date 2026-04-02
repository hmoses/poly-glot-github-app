const crypto = require('crypto');
const jwt = require('jsonwebtoken');

const SALT_ROUNDS = 12;
const TOKEN_EXPIRY = '7d';

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.createHmac('sha256', salt).update(password).digest('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  const [salt, hash] = stored.split(':');
  const attempt = crypto.createHmac('sha256', salt).update(password).digest('hex');
  return crypto.timingSafeEqual(Buffer.from(attempt), Buffer.from(hash));
}

function generateToken(userId, role) {
  return jwt.sign({ sub: userId, role, iat: Math.floor(Date.now() / 1000) }, process.env.JWT_SECRET, { expiresIn: TOKEN_EXPIRY });
}

function verifyToken(token) {
  try {
    return jwt.verify(token, process.env.JWT_SECRET);
  } catch (err) {
    return null;
  }
}

function isRateLimited(ip, attempts, windowSeconds) {
  const key = `ratelimit:${ip}`;
  const now = Date.now();
  const window = windowSeconds * 1000;
  if (!isRateLimited._store) isRateLimited._store = {};
  const store = isRateLimited._store;
  if (!store[key]) store[key] = [];
  store[key] = store[key].filter(t => now - t < window);
  if (store[key].length >= attempts) return true;
  store[key].push(now);
  return false;
}

module.exports = { hashPassword, verifyPassword, generateToken, verifyToken, isRateLimited };
