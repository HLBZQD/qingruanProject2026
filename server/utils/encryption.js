const crypto = require('crypto');

let cachedSalt = null;

function getSalt() {
  if (cachedSalt) return cachedSalt;

  if (process.env.AES_SALT) {
    cachedSalt = Buffer.from(process.env.AES_SALT, 'hex');
    return cachedSalt;
  }

  cachedSalt = crypto.randomBytes(16);
  console.warn(
    '[encryption] AES_SALT 未设置，已自动生成 salt。请将以下值写入 .env 文件中的 AES_SALT= 环境变量以确保持久化：',
    cachedSalt.toString('hex')
  );
  return cachedSalt;
}

function deriveKey(salt) {
  const secret = process.env.JWT_SECRET || 'default_secret_change_me';
  return crypto.scryptSync(secret, salt, 32);
}

function encryptChatToken(plainToken) {
  const salt = getSalt();
  const key = deriveKey(salt);
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(Buffer.from('chat_token', 'utf-8'));

  let encrypted = cipher.update(plainToken, 'utf-8');
  encrypted = Buffer.concat([encrypted, cipher.final()]);
  const authTag = cipher.getAuthTag();

  return iv.toString('base64') + ':' + authTag.toString('base64') + ':' + encrypted.toString('base64');
}

function decryptChatToken(encryptedToken) {
  const parts = encryptedToken.split(':');
  if (parts.length !== 3) {
    throw new Error('Invalid encrypted token format');
  }

  const iv = Buffer.from(parts[0], 'base64');
  const authTag = Buffer.from(parts[1], 'base64');
  const ciphertext = Buffer.from(parts[2], 'base64');

  const salt = getSalt();
  const key = deriveKey(salt);

  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAAD(Buffer.from('chat_token', 'utf-8'));
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(ciphertext, undefined, 'utf-8');
  decrypted += decipher.final('utf-8');

  return decrypted;
}

module.exports = { encryptChatToken, decryptChatToken, deriveKey, getSalt };
