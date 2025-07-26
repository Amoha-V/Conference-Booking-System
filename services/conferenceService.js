const { query } = require('../config/database');
const { businessValidation } = require('../utils/validators');

class ConferenceService {
  
  /**
   * Add a new conference
   * @param {Object} conferenceData - Conference details
   * @returns {Object} Result with success/error status
   */
  async addConference(conferenceData) {
    try {
      const { name, location, topics, start_time, end_time, total_slots } = conferenceData;

      // Check if conference name is unique
      const isUnique = await businessValidation.isUniqueConferenceName(name, { query });
      if (!isUnique) {
        return {
          success: false,
          error: 'Conference name already exists'
        };
      }

      // Convert topics string to array and filter out empty topics
      const topicsArray = topics.split(',')
        .map(topic => topic.trim())
        .filter(topic => topic.length > 0);

      // Validate topics count
      if (topicsArray.length > 10) {
        return {
          success: false,
          error: 'Maximum 10 topics allowed per conference'
        };
      }

      if (topicsArray.length === 0) {
        return {
          success: false,
          error: 'At least one topic is required'
        };
      }

      // Insert conference into database
      const result = await query(`
        INSERT INTO conferences (name, location, topics, start_time, end_time, total_slots, available_slots)
        VALUES ($1, $2, $3, $4, $5, $6, $6)
        RETURNING *
      `, [name, location, topicsArray, start_time, end_time, total_slots]);

      const conference = result.rows[0];

      return {
        success: true,
        message: 'Conference added successfully',
        data: {
          name: conference.name,
          location: conference.location,
          topics: conference.topics,
          start_time: conference.start_time,
          end_time: conference.end_time,
          total_slots: conference.total_slots,
          available_slots: conference.available_slots,
          created_at: conference.created_at
        }
      };

    } catch (error) {
      console.error('Error in addConference:', error);
      return {
        success: false,
        error: 'Failed to add conference',
        details: error.message
      };
    }
  }

  /**
   * Get conference by name
   * @param {string} name - Conference name
   * @returns {Object} Conference data or null
   */
  async getConferenceByName(name) {
    try {
      const result = await query(
        'SELECT * FROM conferences WHERE name = $1',
        [name]
      );

      return result.rows.length > 0 ? result.rows[0] : null;
    } catch (error) {
      console.error('Error in getConferenceByName:', error);
      throw error;
    }
  }

  /**
   * Get all conferences
   * @returns {Array} List of all conferences
   */
  async getAllConferences() {
    try {
      const result = await query(`
        SELECT 
          name,
          location,
          topics,
          start_time,
          end_time,
          total_slots,
          available_slots,
          created_at
        FROM conferences 
        ORDER BY start_time ASC
      `);

      return {
        success: true,
        data: result.rows
      };
    } catch (error) {
      console.error('Error in getAllConferences:', error);
      return {
        success: false,
        error: 'Failed to fetch conferences'
      };
    }
  }

  /**
   * Update available slots for a conference
   * @param {string} conferenceName - Conference name
   * @param {number} change - Change in available slots (+1 or -1)
   * @returns {boolean} Success status
   */
  async updateAvailableSlots(conferenceName, change) {
    try {
      const result = await query(`
        UPDATE conferences 
        SET available_slots = available_slots + $1
        WHERE name = $2 
          AND available_slots + $1 >= 0 
          AND available_slots + $1 <= total_slots
        RETURNING available_slots
      `, [change, conferenceName]);

      return result.rows.length > 0;
    } catch (error) {
      console.error('Error in updateAvailableSlots:', error);
      throw error;
    }
  }

  /**
   * Search conferences by various criteria
   * @param {Object} searchCriteria - Search parameters
   * @returns {Object} Search results
   */
  async searchConferences(searchCriteria = {}) {
    try {
      const { 
        location, 
        topic, 
        start_date, 
        end_date, 
        available_only = false 
      } = searchCriteria;

      let whereConditions = [];
      let params = [];
      let paramCount = 0;

      // Build dynamic WHERE clause
      if (location) {
        paramCount++;
        whereConditions.push(`location ILIKE $${paramCount}`);
        params.push(`%${location}%`);
      }

      if (topic) {
        paramCount++;
        whereConditions.push(`$${paramCount} = ANY(topics)`);
        params.push(topic);
      }

      if (start_date) {
        paramCount++;
        whereConditions.push(`start_time >= $${paramCount}`);
        params.push(start_date);
      }

      if (end_date) {
        paramCount++;
        whereConditions.push(`start_time <= $${paramCount}`);
        params.push(end_date);
      }

      if (available_only) {
        whereConditions.push('available_slots > 0');
      }

      // Only show future conferences
      paramCount++;
      whereConditions.push(`start_time > $${paramCount}`);
      params.push(new Date());

      const whereClause = whereConditions.length > 0 
        ? `WHERE ${whereConditions.join(' AND ')}`
        : '';

      const queryText = `
        SELECT 
          name,
          location,
          topics,
          start_time,
          end_time,
          total_slots,
          available_slots,
          created_at
        FROM conferences 
        ${whereClause}
        ORDER BY start_time ASC
      `;

      const result = await query(queryText, params);

      return {
        success: true,
        data: result.rows,
        count: result.rows.length
      };

    } catch (error) {
      console.error('Error in searchConferences:', error);
      return {
        success: false,
        error: 'Failed to search conferences'
      };
    }
  }

  /**
   * Get conference statistics
   * @param {string} conferenceName - Conference name
   * @returns {Object} Conference statistics
   */
  async getConferenceStats(conferenceName) {
    try {
      const result = await query(`
        SELECT 
          c.name,
          c.total_slots,
          c.available_slots,
          c.total_slots - c.available_slots as booked_slots,
          COUNT(CASE WHEN b.status = 'CONFIRMED' THEN 1 END) as confirmed_bookings,
          COUNT(CASE WHEN b.status = 'WAITLISTED' THEN 1 END) as waitlisted_bookings,
          COUNT(CASE WHEN b.status = 'CANCELED' THEN 1 END) as canceled_bookings
        FROM conferences c
        LEFT JOIN bookings b ON c.name = b.conference_name
        WHERE c.name = $1
        GROUP BY c.name, c.total_slots, c.available_slots
      `, [conferenceName]);

      if (result.rows.length === 0) {
        return {
          success: false,
          error: 'Conference not found'
        };
      }

      return {
        success: true,
        data: result.rows[0]
      };

    } catch (error) {
      console.error('Error in getConferenceStats:', error);
      return {
        success: false,
        error: 'Failed to get conference statistics'
      };
    }
  }

  /**
   * Check if conference has started
   * @param {string} conferenceName - Conference name
   * @returns {boolean} True if conference has started
   */
  async hasConferenceStarted(conferenceName) {
    try {
      const result = await query(
        'SELECT start_time FROM conferences WHERE name = $1',
        [conferenceName]
      );

      if (result.rows.length === 0) {
        throw new Error('Conference not found');
      }

      const startTime = new Date(result.rows[0].start_time);
      return startTime <= new Date();

    } catch (error) {
      console.error('Error in hasConferenceStarted:', error);
      throw error;
    }
  }

  /**
   * Get conferences that have started (for cleanup jobs)
   * @returns {Array} List of started conferences
   */
  async getStartedConferences() {
    try {
      const result = await query(`
        SELECT name, start_time 
        FROM conferences 
        WHERE start_time <= $1
      `, [new Date()]);

      return result.rows;

    } catch (error) {
      console.error('Error in getStartedConferences:', error);
      throw error;
    }
  }
}

module.exports = new ConferenceService();