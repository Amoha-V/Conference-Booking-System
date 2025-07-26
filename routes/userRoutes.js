const express = require('express');
const router = express.Router();
const userService = require('../services/userService');
const { 
  userValidation, 
  handleValidationErrors 
} = require('../utils/validators');

/**
 * @route POST /users
 * @desc Add a new user
 * @access Public
 */
router.post('/', 
  userValidation,
  handleValidationErrors,
  async (req, res) => {
    try {
      const result = await userService.addUser(req.body);
      
      if (result.success) {
        res.status(201).json(result);
      } else {
        res.status(400).json(result);
      }
    } catch (error) {
      console.error('Error in POST /users:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error'
      });
    }
  }
);

/**
 * @route GET /users
 * @desc Get all users
 * @access Public
 */
router.get('/', async (req, res) => {
  try {
    const result = await userService.getAllUsers();
    res.json(result);
  } catch (error) {
    console.error('Error in GET /users:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

/**
 * @route GET /users/:userId
 * @desc Get user by ID
 * @access Public
 */
router.get('/:userId', async (req, res) => {
  try {
    const user = await userService.getUserById(req.params.userId);
    
    if (user) {
      res.json({
        success: true,
        data: user
      });
    } else {
      res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }
  } catch (error) {
    console.error('Error in GET /users/:userId:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

/**
 * @route PUT /users/:userId/topics
 * @desc Update user's interested topics
 * @access Public
 */
router.put('/:userId/topics', async (req, res) => {
  try {
    const { interested_topics } = req.body;
    
    if (!interested_topics) {
      return res.status(400).json({
        success: false,
        error: 'interested_topics is required'
      });
    }

    const result = await userService.updateUserTopics(req.params.userId, interested_topics);
    
    if (result.success) {
      res.json(result);
    } else {
      res.status(400).json(result);
    }
  } catch (error) {
    console.error('Error in PUT /users/:userId/topics:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

/**
 * @route GET /users/:userId/bookings
 * @desc Get user's booking history
 * @access Public
 */
router.get('/:userId/bookings', async (req, res) => {
  try {
    const result = await userService.getUserBookings(req.params.userId);
    
    if (result.success) {
      res.json(result);
    } else {
      res.status(400).json(result);
    }
  } catch (error) {
    console.error('Error in GET /users/:userId/bookings:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

/**
 * @route GET /users/:userId/recommendations
 * @desc Get recommended conferences for user
 * @access Public
 */
router.get('/:userId/recommendations', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 10;
    const result = await userService.getRecommendedConferences(req.params.userId, limit);
    
    if (result.success) {
      res.json(result);
    } else {
      res.status(400).json(result);
    }
  } catch (error) {
    console.error('Error in GET /users/:userId/recommendations:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

/**
 * @route GET /users/:userId/stats
 * @desc Get user statistics
 * @access Public
 */
router.get('/:userId/stats', async (req, res) => {
  try {
    const result = await userService.getUserStats(req.params.userId);
    
    if (result.success) {
      res.json(result);
    } else {
      res.status(404).json(result);
    }
  } catch (error) {
    console.error('Error in GET /users/:userId/stats:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

/**
 * @route DELETE /users/:userId
 * @desc Delete user and all associated bookings
 * @access Public
 */
router.delete('/:userId', async (req, res) => {
  try {
    const result = await userService.deleteUser(req.params.userId);
    
    if (result.success) {
      res.json(result);
    } else {
      res.status(400).json(result);
    }
  } catch (error) {
    console.error('Error in DELETE /users/:userId:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

module.exports = router;