// 本地开发专用密码哈希工具。
const crypto = require('node:crypto');

const HASH_PREFIX = 'pbkdf2-sha256';
const HASH_ITERATIONS = 120000;
const HASH_KEY_LENGTH = 32;
const MIGRATED_PASSWORD = '[migrated]';

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto
    .pbkdf2Sync(password, salt, HASH_ITERATIONS, HASH_KEY_LENGTH, 'sha256')
    .toString('hex');

  return `${HASH_PREFIX}$${HASH_ITERATIONS}$${salt}$${hash}`;
}

function safeEqual(left, right) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  if (leftBuffer.length !== rightBuffer.length) return false;
  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function verifyPassword(password, passwordHash, legacyPassword) {
  if (passwordHash && passwordHash.startsWith(`${HASH_PREFIX}$`)) {
    const [, iterations, salt, expectedHash] = passwordHash.split('$');
    const actualHash = crypto
      .pbkdf2Sync(password, salt, Number(iterations), HASH_KEY_LENGTH, 'sha256')
      .toString('hex');

    return safeEqual(actualHash, expectedHash);
  }

  // Backward compatibility for existing SQLite rows and cloud test accounts.
  if (legacyPassword || passwordHash) {
    const legacyValue = legacyPassword || passwordHash;
    const isSha256 = /^[a-f0-9]{64}$/i.test(legacyValue);
    const candidate = isSha256
      ? crypto.createHash('sha256').update(password).digest('hex')
      : password;

    return safeEqual(candidate, legacyValue);
  }

  return false;
}

module.exports = {
  MIGRATED_PASSWORD,
  hashPassword,
  verifyPassword
};
