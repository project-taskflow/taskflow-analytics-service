require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');

const analyticsRoutes = require('./routes/analytics');

const app = express();
const PORT = process.env.PORT || 3005;

app.use(helmet());
app.use(cors({ origin: process.env.ALLOWED_ORIGINS?.split(',') || '*' }));
app.use(morgan('combined'));
app.use(express.json({ limit: '10kb' }));

app.use('/analytics', analyticsRoutes);
app.get('/health', (req, res) => res.json({ status: 'ok', service: 'analytics-service' }));

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Internal server error' });
});

mongoose
  .connect(process.env.MONGODB_URI)
  .then(() => {
    console.log('Analytics Service connected to MongoDB');
    app.listen(PORT, () => console.log(`Analytics Service running on port ${PORT}`));
  })
  .catch((err) => { console.error('MongoDB error:', err); process.exit(1); });
