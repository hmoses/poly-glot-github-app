// Undocumented auth module — no JSDoc
const crypto = require('crypto');

function hashPassword(password, salt) {
  return crypto.pbkdf2Sync(password, salt, 10000, 64, 'sha512').toString('hex');
}

function verifyPassword(password, hash, salt) {
  const incoming = hashPassword(password, salt);
  return crypto.timingSafeEqual(Buffer.from(incoming), Buffer.from(hash));
}

function generateToken(userId, secret) {
  const payload = { userId, iat: Date.now(), exp: Date.now() + 3600000 };
  const data = JSON.stringify(payload);
  const sig = crypto.createHmac('sha256', secret).update(data).digest('hex');
  return Buffer.from(data).toString('base64') + '.' + sig;
}

function validateToken(token, secret) {
  const [dataB64, sig] = token.split('.');
  if (!dataB64 || !sig) return null;
  const data = Buffer.from(dataB64, 'base64').toString();
  const expected = crypto.createHmac('sha256', secret).update(data).digest('hex');
  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  const payload = JSON.parse(data);
  if (payload.exp < Date.now()) return null;
  return payload;
}

module.exports = { hashPassword, verifyPassword, generateToken, validateToken };
