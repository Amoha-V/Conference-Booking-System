const { query } = require('../config/database');
const { v4: uuidv4 } = require('uuid');

class UserService {
  /**
   * Add a new user
   * @param {Object} userData - User data including user_id and interested_topics
   * @returns {Object} Result with success/error status
   */
  async addUser(userData) {
    try {
      const { user_id, interested_topics } = userData;

      // Convert topics string to array
      const topicsArray = interested_topics.split(',')
        .map(topic => topic.trim())
        .filter(topic => topic.length > 0);

      // Insert user into database
      const result = await query(
        `INSERT INTO users (user_id, interested_topics)
         VALUES ($1, $2)
         RETURNING *`,
        [user_id, topicsArray]
      );

      return {
        success: true,
        data: result.rows[0],
        message: 'User added successfully'
      };
    } catch (error) {
      console.error('Error in addUser:', error);
      
      if (error.code === '23505') { // Unique violation
        return {
          success: false,
          error: 'User ID already exists'
        };
      }

      return {
        success: false,
        error: 'Failed to add user',
        details: error.message
      };
    }
  }

  /**
   * Get user by ID
   * @param {string} userId - User ID to retrieve
   * @returns {Object} User data or null if not found
   */
  async getUserById(userId) {
    try {
      const result = await query(
        'SELECT * FROM users WHERE user_id = $1',
        [userId]
      );

      if (result.rows.length === 0) {
        return null;
      }

      return result.rows[0];
    } catch (error) {
      console.error('Error in getUserById:', error);
      throw error;
    }
  }

  /**
   * Get all users
   * @returns {Object} List of all users
   */
  async getAllUsers() {
    try {
      const result = await query(
        'SELECT user_id, interested_topics, created_at FROM users ORDER BY created_at DESC'
      );

      return {
        success: true,
        data: result.rows,
        count: result.rows.length
      };
    } catch (error) {
      console.error('Error in getAllUsers:', error);
      return {
        success: false,
        error: 'Failed to fetch users'
      };
    }
  }

  /**
   * Update user's interested topics
   * @param {string} userId - User ID to update
   * @param {string} interestedTopics - Comma-separated topics string
   * @returns {Object} Result with success/error status
   */
  async updateUserTopics(userId, interestedTopics) {
    try {
      const topicsArray = interestedTopics.split(',')
        .map(topic => topic.trim())
        .filter(topic => topic.length > 0);

      const result = await query(
        `UPDATE users 
         SET interested_topics = $1 
         WHERE user_id = $2
         RETURNING *`,
        [topicsArray, userId]
      );

      if (result.rows.length === 0) {
        return {
          success: false,
          error: 'User not found'
        };
      }

      return {
        success: true,
        data: result.rows[0],
        message: 'User topics updated successfully'
      };
    } catch (error) {
      console.error('Error in updateUserTopics:', error);
      return {
        success: false,
        error: 'Failed to update user topics',
        details: error.message
      };
    }
  }

  /**
   * Get user's booking history
   * @param {string} userId - User ID to retrieve bookings for
   * @returns {Object} List of user's bookings
   */
  async getUserBookings(userId) {
    try {
      const result = await query(
        `SELECT 
           b.booking_id,
           b.conference_name,
           b.status,
           b.created_at as booking_date,
           c.start_time,
           c.end_time,
           c.location,
           w.position as waitlist_position
         FROM bookings b
         JOIN conferences c ON b.conference_name = c.name
         LEFT JOIN waitlist w ON b.booking_id = w.booking_id
         WHERE b.user_id = $1
         ORDER BY c.start_time DESC`,
        [userId]
      );

      return {
        success: true,
        data: result.rows,
        count: result.rows.length
      };
    } catch (error) {
      console.error('Error in getUserBookings:', error);
      return {
        success: false,
        error: 'Failed to fetch user bookings'
      };
    }
  }

  /**
   * Get recommended conferences for user based on their interests
   * @param {string} userId - User ID to get recommendations for
   * @param {number} limit - Maximum number of recommendations to return
   * @returns {Object} List of recommended conferences
   */
  async getRecommendedConferences(userId, limit = 10) {
    try {
      // First get user's interested topics
      const user = await this.getUserById(userId);
      if (!user) {
        return {
          success: false,
          error: 'User not found'
        };
      }

      // Find conferences with matching topics that haven't started yet
      const result = await query(
        `SELECT 
           c.name,
           c.location,
           c.topics,
           c.start_time,
           c.end_time,
           c.available_slots,
           -- Calculate relevance score based on topic matches
           (
             SELECT COUNT(*) 
             FROM unnest(c.topics) AS ct
             WHERE ct = ANY($1)
           ) AS relevance_score
         FROM conferences c
         WHERE c.start_time > NOW()
           AND c.available_slots > 0
           AND c.topics && $1
         ORDER BY relevance_score DESC, c.start_time ASC
         LIMIT $2`,
        [user.interested_topics, limit]
      );

      return {
        success: true,
        data: result.rows,
        count: result.rows.length
      };
    } catch (error) {
      console.error('Error in getRecommendedConferences:', error);
      return {
        success: false,
        error: 'Failed to get recommendations'
      };
    }
  }

  /**
   * Get user statistics
   * @param {string} userId - User ID to get stats for
   * @returns {Object} User statistics
   */
  async getUserStats(userId) {
    try {
      const user = await this.getUserById(userId);
      if (!user) {
        return {
          success: false,
          error: 'User not found'
        };
      }

      const statsResult = await query(
        `SELECT 
           COUNT(*) as total_bookings,
           COUNT(CASE WHEN status = 'CONFIRMED' THEN 1 END) as confirmed_bookings,
           COUNT(CASE WHEN status = 'WAITLISTED' THEN 1 END) as waitlisted_bookings,
           COUNT(CASE WHEN status = 'CANCELED' THEN 1 END) as canceled_bookings
         FROM bookings
         WHERE user_id = $1`,
        [userId]
      );

      const upcomingResult = await query(
        `SELECT COUNT(*) as upcoming_conferences
         FROM bookings b
         JOIN conferences c ON b.conference_name = c.name
         WHERE b.user_id = $1
           AND b.status = 'CONFIRMED'
           AND c.start_time > NOW()`,
        [userId]
      );

      return {
        success: true,
        data: {
          user_id: userId,
          topics_count: user.interested_topics.length,
          ...statsResult.rows[0],
          ...upcomingResult.rows[0]
        }
      };
    } catch (error) {
      console.error('Error in getUserStats:', error);
      return {
        success: false,
        error: 'Failed to get user statistics'
      };
    }
  }

  /**
   * Delete user and all their bookings
   * @param {string} userId - User ID to delete
   * @returns {Object} Result with success/error status
   */
  async deleteUser(userId) {
    const client = await query.getClient();
    try {
      await client.query('BEGIN');

      // First delete all bookings for this user
      await client.query(
        'DELETE FROM bookings WHERE user_id = $1',
        [userId]
      );

      // Then delete the user
      const result = await client.query(
        'DELETE FROM users WHERE user_id = $1 RETURNING *',
        [userId]
      );

      if (result.rows.length === 0) {
        await client.query('ROLLBACK');
        return {
          success: false,
          error: 'User not found'
        };
      }

      await client.query('COMMIT');
      return {
        success: true,
        message: 'User deleted successfully'
      };
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Error in deleteUser:', error);
      return {
        success: false,
        error: 'Failed to delete user',
        details: error.message
      };
    } finally {
      client.release();
    }
  }
}

module.exports = new UserService();