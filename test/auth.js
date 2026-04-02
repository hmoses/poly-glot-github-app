const crypto = require('crypto');
const jwt = require('jsonwebtoken');

const SALT_ROUNDS = 12;
const TOKEN_EXPIRY = '7d';
const MAX_LOGIN_ATTEMPTS = 5;

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.createHmac('sha256', salt).update(password).digest('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  const [salt, hash] = stored.split(':');
  const computed = crypto.createHmac('sha256', salt).update(password).digest('hex');
  return crypto.timingSafeEqual(Buffer.from(computed), Buffer.from(hash));
}

function generateToken(userId, role) {
  return jwt.sign(
    { sub: userId, role, iat: Math.floor(Date.now() / 1000) },
    process.env.JWT_SECRET,
    { expiresIn: TOKEN_EXPIRY, algorithm: 'RS256' }
  );
}

function verifyToken(token) {
  try {
    return jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['RS256'] });
  } catch (err) {
    return null;
  }
}

function checkRateLimit(attempts, lastAttempt) {
  if (attempts >= MAX_LOGIN_ATTEMPTS) {
    const cooldown = 15 * 60 * 1000;
    const elapsed = Date.now() - lastAttempt;
    if (elapsed < cooldown) {
      return { allowed: false, retryAfter: Math.ceil((cooldown - elapsed) / 1000) };
    }
  }
  return { allowed: true };
}

function extractBearerToken(authHeader) {
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
  return authHeader.slice(7).trim();
}

module.exports = {
  hashPassword,
  verifyPassword,
  generateToken,
  verifyToken,
  checkRateLimit,
  extractBearerToken
};
