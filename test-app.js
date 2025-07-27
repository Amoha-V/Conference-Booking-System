const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
require('dotenv').config();

const app = express();

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Test route registration one by one
console.log('Testing route registration...');

try {
  console.log('1. Registering userRoutes...');
  const userRoutes = require('./routes/userRoutes');
  app.use('/users', userRoutes);
  console.log('✓ userRoutes registered successfully');
} catch (error) {
  console.error('✗ Error registering userRoutes:', error.message);
  console.error('Stack:', error.stack);
  process.exit(1);
}

try {
  console.log('2. Registering bookingRoutes...');
  const bookingRoutes = require('./routes/bookingRoutes');
  app.use('/bookings', bookingRoutes);
  console.log('✓ bookingRoutes registered successfully');
} catch (error) {
  console.error('✗ Error registering bookingRoutes:', error.message);
  console.error('Stack:', error.stack);
  process.exit(1);
}

try {
  console.log('3. Registering conferenceRoutes...');
  const conferenceRoutes = require('./routes/conferenceRoutes');
  app.use('/conferences', conferenceRoutes);
  console.log('✓ conferenceRoutes registered successfully');
} catch (error) {
  console.error('✗ Error registering conferenceRoutes:', error.message);
  console.error('Stack:', error.stack);
  process.exit(1);
}

// Basic routes
app.get('/health', (req, res) => {
  res.json({ status: 'OK', message: 'Test server running' });
});

app.get('/', (req, res) => {
  res.json({ message: 'Test server - all routes registered successfully!' });
});

// Error handling
app.use((err, req, res, next) => {
  console.error('Global error handler:', err);
  res.status(500).json({ error: 'Internal server error' });
});

app.use('*', (req, res) => {
  res.status(404).json({ error: 'Not Found' });
});

// Start server
const PORT = process.env.PORT || 3000;

console.log('4. Starting server...');
app.listen(PORT, () => {
  console.log(`
   Test server running successfully on port ${PORT}
   All routes registered without errors
   Test: http://localhost:${PORT}/health
  
  If you see this message, the path-to-regexp error is not in route registration.
  The error might be in cron job setup or service file execution.
  `);
}).on('error', (error) => {
  console.error('✗ Server startup failed:', error.message);
  console.error('Stack:', error.stack);
});