const crypto = require('crypto');
const jwt = require('jsonwebtoken');

const SALT_ROUNDS = 10;
const TOKEN_EXPIRY = '24h';
const MAX_LOGIN_ATTEMPTS = 5;
const LOCKOUT_DURATION = 15 * 60 * 1000;

const loginAttempts = new Map();

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha512').toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  const [salt, hash] = stored.split(':');
  const verify = crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha512').toString('hex');
  return crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(verify));
}

function generateToken(userId, role) {
  return jwt.sign({ userId, role, iat: Date.now() }, process.env.JWT_SECRET, { expiresIn: TOKEN_EXPIRY });
}

function verifyToken(token) {
  try {
    return jwt.verify(token, process.env.JWT_SECRET);
  } catch (err) {
    return null;
  }
}

function checkRateLimit(ip) {
  const attempts = loginAttempts.get(ip) || { count: 0, lastAttempt: 0 };
  if (Date.now() - attempts.lastAttempt > LOCKOUT_DURATION) {
    loginAttempts.delete(ip);
    return false;
  }
  return attempts.count >= MAX_LOGIN_ATTEMPTS;
}

function recordLoginAttempt(ip, success) {
  if (success) {
    loginAttempts.delete(ip);
    return;
  }
  const attempts = loginAttempts.get(ip) || { count: 0, lastAttempt: 0 };
  attempts.count++;
  attempts.lastAttempt = Date.now();
  loginAttempts.set(ip, attempts);
}

function authenticateUser(email, password, ip) {
  if (checkRateLimit(ip)) {
    throw new Error('Too many login attempts. Try again in 15 minutes.');
  }
  const user = getUserByEmail(email);
  if (!user || !verifyPassword(password, user.passwordHash)) {
    recordLoginAttempt(ip, false);
    throw new Error('Invalid credentials');
  }
  recordLoginAttempt(ip, true);
  return { token: generateToken(user.id, user.role), user: { id: user.id, email: user.email, role: user.role } };
}

module.exports = { hashPassword, verifyPassword, generateToken, verifyToken, checkRateLimit, recordLoginAttempt, authenticateUser };
