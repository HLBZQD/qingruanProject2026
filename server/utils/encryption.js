const crypto = require('crypto');

let cachedSalt = null;

function getSalt() {
  if (cachedSalt) return cachedSalt;

  // AES_SALT 必须已通过启动校验（见文件末尾），此处直接读取。
  // 不再随机生成：随机 salt 每次进程重启都会变化，会导致数据库中
  // 用旧 salt 加密的 chat_token 无法解密（GCM authTag 校验失败），
  // 表现为"无法连接医生会话"。要求运维在 .env 中固定该值。
  cachedSalt = Buffer.from(process.env.AES_SALT, 'hex');
  return cachedSalt;
}

function deriveKey(salt) {
  const secret = process.env.JWT_SECRET;
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

// 启动时校验：JWT_SECRET 与 AES_SALT 必须已设置，否则无法派生稳定的 AES-256-GCM 密钥。
// 这里 fail-fast，避免在运行时才因解密失败暴露配置问题（此前 AES_SALT 未设置时
// 会静默随机生成 salt，导致重启后历史密文不可解密）。
if (!process.env.JWT_SECRET) {
  throw new Error(
    '[encryption] JWT_SECRET 环境变量未设置，无法派生 AES-256-GCM 加密密钥。\n' +
    '请设置环境变量 JWT_SECRET 后重新启动服务。\n' +
    '示例: JWT_SECRET=<至少32字符的随机字符串> node server/index.js'
  );
}
if (!process.env.AES_SALT) {
  throw new Error(
    '[encryption] AES_SALT 环境变量未设置，无法派生稳定的 AES-256-GCM 加密密钥。\n' +
    '请在 .env 中设置固定的 AES_SALT（32 位 hex，16 字节）后重启服务。\n' +
    '生成方式: node -e "console.log(require(\'crypto\').randomBytes(16).toString(\'hex\'))"\n' +
    '注意：一旦写入不可更改，否则数据库中已加密的 chat_token 将无法解密。'
  );
}

module.exports = { encryptChatToken, decryptChatToken, deriveKey, getSalt };
