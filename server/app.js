const express = require('express');
const cors = require('cors');
const path = require('path');
const apiRoutes = require('./routes/index');
const { errorHandler } = require('./middleware/errorHandler');

const app = express();

app.use(cors());
app.use(express.json());
app.use('/api', apiRoutes);
app.use('/static', express.static(path.join(__dirname, '..', 'static')));

app.use(errorHandler);

module.exports = app;
