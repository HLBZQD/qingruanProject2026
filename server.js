require('dotenv').config();
const { initDatabase, db } = require('./server/db/database');
initDatabase();
const app = require('./server/app');

const PORT = process.env.PORT || 3000;

const uploadRoutes = require('./server/routes/upload');
if (uploadRoutes.ensureUploadDir) {
  uploadRoutes.ensureUploadDir();
}

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/api/health`);
});
