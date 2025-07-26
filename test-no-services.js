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

console.log('Creating minimal routes without service calls...');

// Create simplified versions of your routes WITHOUT service imports
const userRouter = express.Router();
userRouter.get('/', (req, res) => res.json({ message: 'Users route works' }));
userRouter.get('/:userId', (req, res) => res.json({ message: `User ${req.params.userId}` }));
userRouter.post('/', (req, res) => res.json({ message: 'User created' }));

const bookingRouter = express.Router();
bookingRouter.get('/stats', (req, res) => res.json({ message: 'Booking stats' }));
bookingRouter.get('/:bookingId/status', (req, res) => res.json({ message: `Booking ${req.params.bookingId} status` }));
bookingRouter.post('/', (req, res) => res.json({ message: 'Booking created' }));

const conferenceRouter = express.Router();
conferenceRouter.get('/', (req, res) => res.json({ message: 'Conferences route works' }));
conferenceRouter.get('/:name', (req, res) => res.json({ message: `Conference ${req.params.name}` }));
conferenceRouter.get('/:name/stats', (req, res) => res.json({ message: `Conference ${req.params.name} stats` }));
conferenceRouter.post('/', (req, res) => res.json({ message: 'Conference created' }));

// Register routes
app.use('/users', userRouter);
app.use('/bookings', bookingRouter);
app.use('/conferences', conferenceRouter);

// Basic routes
app.get('/health', (req, res) => {
  res.json({ status: 'OK', message: 'Minimal server running' });
});

app.get('/', (req, res) => {
  res.json({ message: 'Minimal server without services - testing if this works!' });
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

console.log('Starting minimal server...');
app.listen(PORT, () => {
  console.log(`
  🚀 Minimal server running successfully on port ${PORT}
  📍 No service imports - just basic route handlers
  🔗 Test: http://localhost:${PORT}/health
  
  If this works, the error is in your service files!
  `);
}).on('error', (error) => {
  console.error('✗ Server startup failed:', error.message);
  console.error('Stack:', error.stack);
});