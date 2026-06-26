const bcrypt = require('bcryptjs');
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

let db;

function initDatabase() {
  const dbPath = process.env.DB_PATH || './data/database.sqlite';
  const dataDir = path.dirname(path.resolve(dbPath));

  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  const database = new Database(dbPath);
  database.pragma('foreign_keys = ON');
  database.pragma('journal_mode = WAL');
  database.pragma('busy_timeout = 5000');

  const initSql = fs.readFileSync(path.join(__dirname, 'init.sql'), 'utf-8');
  database.exec(initSql);

  const row = database.prepare('SELECT COUNT(*) AS count FROM users').get();
  if (row.count === 0) {
    let seedSql = fs.readFileSync(path.join(__dirname, 'seed.sql'), 'utf-8');
    const hash = bcrypt.hashSync('admin123', 10);
    seedSql = seedSql.replace('$2a$10$PLACEHOLDER_BCRYPT_HASH_GOES_HERE', hash);
    database.exec(seedSql);
    console.log('Database seeded with initial data.');
  }

  module.exports.db = database;
}

module.exports = { db: null, initDatabase };
