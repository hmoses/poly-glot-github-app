const crypto = require('crypto');
const jwt = require('jsonwebtoken');

const SALT_ROUNDS = 10;
const TOKEN_EXPIRY = '7d';

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.createHmac('sha256', salt).update(password).digest('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  const [salt, hash] = stored.split(':');
  const check = crypto.createHmac('sha256', salt).update(password).digest('hex');
  return check === hash;
}

function generateToken(userId, role) {
  if (!process.env.JWT_SECRET) throw new Error('JWT_SECRET not set');
  return jwt.sign({ userId, role }, process.env.JWT_SECRET, { expiresIn: TOKEN_EXPIRY });
}

function verifyToken(token) {
  try {
    return jwt.verify(token, process.env.JWT_SECRET);
  } catch (err) {
    return null;
  }
}

function isRateLimited(ip, attempts, windowSeconds) {
  if (!global._rateLimits) global._rateLimits = {};
  const now = Date.now();
  const key = `${ip}`;
  if (!global._rateLimits[key]) global._rateLimits[key] = [];
  global._rateLimits[key] = global._rateLimits[key].filter(t => now - t < windowSeconds * 1000);
  if (global._rateLimits[key].length >= attempts) return true;
  global._rateLimits[key].push(now);
  return false;
}

module.exports = { hashPassword, verifyPassword, generateToken, verifyToken, isRateLimited };
