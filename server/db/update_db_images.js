const path = require('path');
const fs = require('fs');

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
  const updateType1 = db.prepare("UPDATE diabetes_types SET image = '/static/images/diabetes/t1.png' WHERE name = '1型糖尿病'");
  const res1 = updateType1.run();
  console.log('1型糖尿病 updated:', res1.changes);

  const updateType2 = db.prepare("UPDATE diabetes_types SET image = '/static/images/diabetes/t2.png' WHERE name = '2型糖尿病'");
  const res2 = updateType2.run();
  console.log('2型糖尿病 updated:', res2.changes);

  const updateType3 = db.prepare("UPDATE diabetes_types SET image = '/static/images/diabetes/t3.png' WHERE name = '妊娠期糖尿病'");
  const res3 = updateType3.run();
  console.log('妊娠期糖尿病 updated:', res3.changes);

  const updateType4 = db.prepare("UPDATE diabetes_types SET image = '/static/images/diabetes/t4.png' WHERE name = '其他特殊类型糖尿病'");
  const res4 = updateType4.run();
  console.log('其他特殊类型糖尿病 updated:', res4.changes);

  console.log('Updating articles cover image paths...');
  const updateDiet = db.prepare("UPDATE articles SET cover = '/static/images/articles/diet.png' WHERE title = '糖尿病患者的饮食指南'");
  const resDiet = updateDiet.run();
  console.log('饮食指南 updated:', resDiet.changes);

  const updateExercise = db.prepare("UPDATE articles SET cover = '/static/images/articles/exercise.png' WHERE title = '适合糖尿病建议' OR title = '适合糖尿病患者的运动建议'");
  const resExercise = updateExercise.run();
  console.log('运动建议 updated:', resExercise.changes);

  const updateMonitor = db.prepare("UPDATE articles SET cover = '/static/images/articles/monitor.png' WHERE title = '如何正确监测血糖水平'");
  const resMonitor = updateMonitor.run();
  console.log('监测血糖 updated:', resMonitor.changes);

  db.close();
  console.log('Database image paths updated successfully!');
} catch (err) {
  console.error('Error updating database:', err);
  process.exit(1);
}
