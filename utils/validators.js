const { body, param, validationResult } = require('express-validator');

// Helper function to check if string contains only alphanumeric characters and spaces
const isAlphanumericWithSpaces = (str) => {
  return /^[a-zA-Z0-9\s]+$/.test(str);
};

// Helper function to validate topics string (comma-separated)
const validateTopicsString = (topicsString) => {
  if (!topicsString || typeof topicsString !== 'string') {
    return false;
  }

  const topics = topicsString.split(',').map(topic => topic.trim());
  
  // Check max 10 topics for conferences, 50 for users
  if (topics.length > 50) {
    return false;
  }

  // Check each topic is alphanumeric with spaces
  return topics.every(topic => 
    topic.length > 0 && 
    topic.length <= 100 && 
    isAlphanumericWithSpaces(topic)
  );
};

// Helper function to check time overlap
const hasTimeOverlap = (start1, end1, start2, end2) => {
  return start1 < end2 && start2 < end1;
};

// Helper function to validate date format and constraints
const validateDateTime = (dateString) => {
  const date = new Date(dateString);
  return !isNaN(date.getTime()) && date > new Date();
};

// Conference validation rules
const conferenceValidation = [
  body('name')
    .trim()
    .isLength({ min: 1, max: 255 })
    .withMessage('Conference name must be between 1 and 255 characters')
    .custom((value) => {
      if (!isAlphanumericWithSpaces(value)) {
        throw new Error('Conference name must contain only alphanumeric characters and spaces');
      }
      return true;
    }),

  body('location')
    .trim()
    .isLength({ min: 1, max: 255 })
    .withMessage('Location must be between 1 and 255 characters')
    .custom((value) => {
      if (!isAlphanumericWithSpaces(value)) {
        throw new Error('Location must contain only alphanumeric characters and spaces');
      }
      return true;
    }),

  body('topics')
    .custom((value) => {
      if (!validateTopicsString(value)) {
        throw new Error('Topics must be comma-separated alphanumeric strings (max 10 topics)');
      }
      const topics = value.split(',').map(t => t.trim());
      if (topics.length > 10) {
        throw new Error('Maximum 10 topics allowed for conferences');
      }
      return true;
    }),

  body('start_time')
    .isISO8601()
    .withMessage('Start time must be a valid ISO 8601 date')
    .custom((value) => {
      const startTime = new Date(value);
      if (startTime <= new Date()) {
        throw new Error('Start time must be in the future');
      }
      return true;
    }),

  body('end_time')
    .isISO8601()
    .withMessage('End time must be a valid ISO 8601 date')
    .custom((value, { req }) => {
      const endTime = new Date(value);
      const startTime = new Date(req.body.start_time);
      
      if (endTime <= startTime) {
        throw new Error('End time must be after start time');
      }
      
      const durationHours = (endTime - startTime) / (1000 * 60 * 60);
      if (durationHours > 12) {
        throw new Error('Conference duration cannot exceed 12 hours');
      }
      
      return true;
    }),

  body('total_slots')
    .isInt({ min: 1 })
    .withMessage('Total slots must be a positive integer')
];

// User validation rules
const userValidation = [
  body('user_id')
    .trim()
    .isLength({ min: 1, max: 255 })
    .withMessage('User ID must be between 1 and 255 characters')
    .custom((value) => {
      if (!isAlphanumericWithSpaces(value)) {
        throw new Error('User ID must contain only alphanumeric characters and spaces');
      }
      return true;
    }),

  body('interested_topics')
    .custom((value) => {
      if (!validateTopicsString(value)) {
        throw new Error('Interested topics must be comma-separated alphanumeric strings');
      }
      const topics = value.split(',').map(t => t.trim());
      if (topics.length > 50) {
        throw new Error('Maximum 50 interested topics allowed');
      }
      return true;
    })
];

// Booking validation rules
const bookingValidation = [
  body('conference_name')
    .trim()
    .isLength({ min: 1, max: 255 })
    .withMessage('Conference name is required'),

  body('user_id')
    .trim()
    .isLength({ min: 1, max: 255 })
    .withMessage('User ID is required')
];

// Fixed parameter validations - ensure proper syntax
const bookingIdValidation = [
  param('bookingId')
    .notEmpty()
    .withMessage('Booking ID is required')
    .isLength({ min: 1, max: 255 })
    .withMessage('Booking ID must be between 1 and 255 characters')
];

const userIdValidation = [
  param('userId')
    .notEmpty()
    .withMessage('User ID is required')
    .isLength({ min: 1, max: 255 })
    .withMessage('User ID must be between 1 and 255 characters')
];

const conferenceNameValidation = [
  param('name')
    .notEmpty()
    .withMessage('Conference name is required')
    .isLength({ min: 1, max: 255 })
    .withMessage('Conference name must be between 1 and 255 characters')
];

// Middleware to handle validation errors
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const errorMessages = errors.array().map(error => ({
      field: error.path || error.param,
      message: error.msg,
      value: error.value
    }));
    
    return res.status(400).json({
      error: 'Validation failed',
      details: errorMessages
    });
  }
  next();
};

// Custom validation functions for business logic
const businessValidation = {
  // Check if conference name is unique
  isUniqueConferenceName: async (name, db) => {
    const result = await db.query('SELECT name FROM conferences WHERE name = $1', [name]);
    return result.rows.length === 0;
  },

  // Check if user ID is unique
  isUniqueUserId: async (userId, db) => {
    const result = await db.query('SELECT user_id FROM users WHERE user_id = $1', [userId]);
    return result.rows.length === 0;
  },

  // Check if user has conflicting bookings
  hasConflictingBooking: async (userId, startTime, endTime, db, excludeConference = null) => {
    let query = `
      SELECT b.booking_id, c.name, c.start_time, c.end_time
      FROM bookings b
      JOIN conferences c ON b.conference_name = c.name
      WHERE b.user_id = $1 
        AND b.status IN ('CONFIRMED', 'WAITLISTED')
        AND c.start_time < $3 
        AND c.end_time > $2
    `;
    const params = [userId, startTime, endTime];

    if (excludeConference) {
      query += ' AND c.name != $4';
      params.push(excludeConference);
    }

    const result = await db.query(query, params);
    return result.rows.length > 0;
  },

  // Check if user already booked this conference
  hasExistingBooking: async (userId, conferenceName, db) => {
    const result = await db.query(
      'SELECT booking_id FROM bookings WHERE user_id = $1 AND conference_name = $2 AND status != \'CANCELED\'',
      [userId, conferenceName]
    );
    return result.rows.length > 0;
  }
};

module.exports = {
  conferenceValidation,
  userValidation,
  bookingValidation,
  bookingIdValidation,
  userIdValidation,
  conferenceNameValidation,
  handleValidationErrors,
  businessValidation,
  isAlphanumericWithSpaces,
  validateTopicsString,
  hasTimeOverlap,
  validateDateTime
};