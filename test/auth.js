const crypto = require('crypto');

function hashPassword(password, salt) {
  const iterations = 100000;
  const keylen = 64;
  const digest = 'sha512';
  return crypto.pbkdf2Sync(password, salt, iterations, keylen, digest).toString('hex');
}

function generateSalt() {
  return crypto.randomBytes(16).toString('hex');
}

function verifyPassword(password, salt, hash) {
  const computed = hashPassword(password, salt);
  return crypto.timingSafeEqual(Buffer.from(computed), Buffer.from(hash));
}

function generateToken(userId, secret) {
  const payload = JSON.stringify({ userId, iat: Date.now(), exp: Date.now() + 3600000 });
  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(payload);
  return Buffer.from(payload).toString('base64') + '.' + hmac.digest('hex');
}

function validateToken(token, secret) {
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const payload = parts[0];
  const sig = parts[1];
  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(Buffer.from(payload, 'base64').toString());
  const expected = hmac.digest('hex');
  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  const data = JSON.parse(Buffer.from(payload, 'base64').toString());
  if (data.exp < Date.now()) return null;
  return data;
}

module.exports = { hashPassword, generateSalt, verifyPassword, generateToken, validateToken };
