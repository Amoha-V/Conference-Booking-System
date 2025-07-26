const express = require('express');
const app = express();

// Test each route file individually
try {
  console.log('Testing userRoutes...');
  const userRoutes = require('./routes/userRoutes');
  console.log('✓ userRoutes OK');
} catch (e) {
  console.error('✗ userRoutes failed:', e.message);
}

try {
  console.log('Testing bookingRoutes...');
  const bookingRoutes = require('./routes/bookingRoutes');
  console.log('✓ bookingRoutes OK');
} catch (e) {
  console.error('✗ bookingRoutes failed:', e.message);
}

try {
  console.log('Testing conferenceRoutes...');
  const conferenceRoutes = require('./routes/conferenceRoutes');
  console.log('✓ conferenceRoutes OK');
} catch (e) {
  console.error('✗ conferenceRoutes failed:', e.message);
}