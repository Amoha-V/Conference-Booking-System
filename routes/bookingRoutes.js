const express = require('express');
const router = express.Router();
const bookingService = require('../services/bookingService');
const {
  bookingValidation,
  bookingIdValidation,
  handleValidationErrors
} = require('../utils/validators');

/**
 * @route GET /bookings/stats
 */
router.get('/stats', async (req, res) => {
  try {
    const result = await bookingService.getBookingStatistics();
    res.status(result.success ? 200 : 400).json(result);
  } catch (error) {
    console.error('GET /bookings/stats:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

/**
 * @route POST /bookings
 */
router.post(
  '/',
  bookingValidation,
  handleValidationErrors,
  async (req, res) => {
    try {
      const result = await bookingService.bookConference(req.body);
      res.status(result.status === 'CONFIRMED' ? 201 : 200).json(result);
    } catch (error) {
      console.error('POST /bookings:', error);
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  }
);

/**
 * @route GET /bookings/:bookingId/status
 */
router.get(
  '/:bookingId/status',
  bookingIdValidation,
  handleValidationErrors,
  async (req, res) => {
    try {
      const result = await bookingService.getBookingStatus(req.params.bookingId);
      res.status(result.success ? 200 : 404).json(result);
    } catch (error) {
      console.error('GET /bookings/:bookingId/status:', error);
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  }
);

/**
 * @route PUT /bookings/:bookingId/confirm
 */
router.put(
  '/:bookingId/confirm',
  bookingIdValidation,
  handleValidationErrors,
  async (req, res) => {
    try {
      const result = await bookingService.confirmWaitlistBooking(req.params.bookingId);
      res.status(result.success ? 200 : 400).json(result);
    } catch (error) {
      console.error('PUT /bookings/:bookingId/confirm:', error);
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  }
);

/**
 * @route DELETE /bookings/:bookingId
 */
router.delete(
  '/:bookingId',
  bookingIdValidation,
  handleValidationErrors,
  async (req, res) => {
    try {
      const result = await bookingService.cancelBooking(req.params.bookingId);
      res.status(result.success ? 200 : 400).json(result);
    } catch (error) {
      console.error('DELETE /bookings/:bookingId:', error);
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  }
);

module.exports = router;
