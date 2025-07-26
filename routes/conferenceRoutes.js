const express = require('express');
const router = express.Router();
const conferenceService = require('../services/conferenceService');
const { 
  conferenceValidation, 
  handleValidationErrors 
} = require('../utils/validators');

/**
 * @route POST /conferences
 * @desc Add a new conference
 * @access Public
 */
router.post('/', 
  conferenceValidation,
  handleValidationErrors,
  async (req, res) => {
    try {
      const result = await conferenceService.addConference(req.body);
      
      if (result.success) {
        res.status(201).json(result);
      } else {
        res.status(400).json(result);
      }
    } catch (error) {
      console.error('Error in POST /conferences:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error'
      });
    }
  }
);

/**
 * @route GET /conferences
 * @desc Get all conferences or search conferences
 * @access Public
 */
router.get('/', async (req, res) => {
  try {
    const { location, topic, start_date, end_date, available_only } = req.query;

    // If search parameters are provided, use search functionality
    if (location || topic || start_date || end_date || available_only) {
      const searchCriteria = {
        location,
        topic,
        start_date: start_date ? new Date(start_date) : null,
        end_date: end_date ? new Date(end_date) : null,
        available_only: available_only === 'true'
      };

      const result = await conferenceService.searchConferences(searchCriteria);
      res.json(result);
    } else {
      // Get all conferences
      const result = await conferenceService.getAllConferences();
      res.json(result);
    }
  } catch (error) {
    console.error('Error in GET /conferences:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

// IMPORTANT: Put specific routes BEFORE parameterized routes
// These routes must come before /:name to avoid conflicts

/**
 * @route GET /conferences/:name/stats
 * @desc Get conference statistics
 * @access Public
 */
router.get('/:name/stats', async (req, res) => {
  try {
    const result = await conferenceService.getConferenceStats(req.params.name);
    
    if (result.success) {
      res.json(result);
    } else {
      res.status(404).json(result);
    }
  } catch (error) {
    console.error('Error in GET /conferences/:name/stats:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

/**
 * @route GET /conferences/:name/bookings
 * @desc Get all bookings for a conference
 * @access Public
 */
router.get('/:name/bookings', async (req, res) => {
  try {
    const bookingService = require('../services/bookingService');
    const result = await bookingService.getConferenceBookings(req.params.name);
    
    if (result.success) {
      res.json(result);
    } else {
      res.status(400).json(result);
    }
  } catch (error) {
    console.error('Error in GET /conferences/:name/bookings:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

/**
 * @route GET /conferences/:name/waitlist
 * @desc Get waitlist for a conference
 * @access Public
 */
router.get('/:name/waitlist', async (req, res) => {
  try {
    const bookingService = require('../services/bookingService');
    const result = await bookingService.getConferenceWaitlist(req.params.name);
    
    if (result.success) {
      res.json(result);
    } else {
      res.status(400).json(result);
    }
  } catch (error) {
    console.error('Error in GET /conferences/:name/waitlist:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

/**
 * @route GET /conferences/:name
 * @desc Get conference by name
 * @access Public
 * IMPORTANT: This route must come LAST among GET routes
 * because it's a catch-all that matches any path
 */
router.get('/:name', async (req, res) => {
  try {
    const conference = await conferenceService.getConferenceByName(req.params.name);
    
    if (conference) {
      res.json({
        success: true,
        data: conference
      });
    } else {
      res.status(404).json({
        success: false,
        error: 'Conference not found'
      });
    }
  } catch (error) {
    console.error('Error in GET /conferences/:name:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

module.exports = router;