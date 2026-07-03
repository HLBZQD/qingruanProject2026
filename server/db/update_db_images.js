const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });

const dbType = process.env.DB_TYPE || 'sqlite';

const statements = [
  {
    sql: "UPDATE diabetes_types SET image = '/static/images/diabetes/t1.png' WHERE name = '1型糖尿病'",
    label: '1型糖尿病',
  },
  {
    sql: "UPDATE diabetes_types SET image = '/static/images/diabetes/t2.png' WHERE name = '2型糖尿病'",
    label: '2型糖尿病',
  },
  {
    sql: "UPDATE diabetes_types SET image = '/static/images/diabetes/t3.png' WHERE name = '妊娠期糖尿病'",
    label: '妊娠期糖尿病',
  },
  {
    sql: "UPDATE diabetes_types SET image = '/static/images/diabetes/t4.png' WHERE name = '其他特殊类型糖尿病'",
    label: '其他特殊类型糖尿病',
  },
  {
    sql: "UPDATE articles SET cover = '/static/images/articles/diet.png' WHERE title = '糖尿病患者的饮食指南'",
    label: '饮食指南',
  },
  {
    sql: "UPDATE articles SET cover = '/static/images/articles/exercise.png' WHERE (title = '适合糖尿病建议' OR title = '适合糖尿病患者的运动建议')",
    label: '运动建议',
  },
  {
    sql: "UPDATE articles SET cover = '/static/images/articles/monitor.png' WHERE title = '如何正确监测血糖水平'",
    label: '监测血糖',
  },
];

async function runKingbase() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('DATABASE_URL 未配置，无法连接 Kingbase');
    process.exit(1);
  }

  const pg = require('pg');
  pg.types.setTypeParser(1114, (val) => String(val));
  pg.types.setTypeParser(1184, (val) => String(val));

  const pool = new pg.Pool({
    connectionString: url,
    max: 1,
    connectionTimeoutMillis: 5000,
  });

  try {
    console.log('Connected to Kingbase:', url.replace(/\/\/.*@/, '//***@'));

    for (const stmt of statements) {
      const result = await pool.query(stmt.sql);
      console.log(`${stmt.label} updated: ${result.rowCount}`);
    }

    console.log('Database image paths updated successfully!');
  } catch (err) {
    console.error('Error updating database:', err.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

function runSqlite() {
  const dbPath = process.env.DB_PATH || path.join(__dirname, '..', '..', 'data', 'database.sqlite');
  console.log('Target database path:', dbPath);

  if (!fs.existsSync(dbPath)) {
    console.error('Database file does not exist. Skipping update.');
    process.exit(0);
  }

  try {
    const Database = require('better-sqlite3');
    const db = new Database(dbPath);

    console.log('Updating diabetes_types cover image paths...');

    for (const stmt of statements) {
      const result = db.prepare(stmt.sql).run();
      console.log(`${stmt.label} updated: ${result.changes}`);
    }

    db.close();
    console.log('Database image paths updated successfully!');
  } catch (err) {
    console.error('Error updating database:', err.message);
    process.exit(1);
  }
}

if (dbType === 'kingbase') {
  runKingbase();
} else {
  runSqlite();
}
