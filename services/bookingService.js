const { query, getClient } = require('../config/database');
const { businessValidation } = require('../utils/validators');
const conferenceService = require('./conferenceService');
const userService = require('./userService');
const { v4: uuidv4 } = require('uuid');

class BookingService {

  /**
   * Book a conference for a user
   * @param {Object} bookingData - Booking details
   * @returns {Object} Result with booking ID and status
   */
  async bookConference(bookingData) {
    const client = await getClient();
    
    try {
      await client.query('BEGIN');

      const { conference_name, user_id } = bookingData;

      // Validate conference exists
      const conference = await conferenceService.getConferenceByName(conference_name);
      if (!conference) {
        await client.query('ROLLBACK');
        return {
          success: false,
          error: 'Conference not found'
        };
      }

      // Validate user exists
      const user = await userService.getUserById(user_id);
      if (!user) {
        await client.query('ROLLBACK');
        return {
          success: false,
          error: 'User not found'
        };
      }

      // Check if conference has started
      if (await conferenceService.hasConferenceStarted(conference_name)) {
        await client.query('ROLLBACK');
        return {
          success: false,
          error: 'Cannot book conference that has already started'
        };
      }

      // Check if user already has a booking for this conference
      const existingBooking = await businessValidation.hasExistingBooking(
        user_id, 
        conference_name, 
        { query: client.query.bind(client) }
      );
      if (existingBooking) {
        await client.query('ROLLBACK');
        return {
          success: false,
          error: 'User already has a booking for this conference'
        };
      }

      // Check for time conflicts with other bookings
      const hasConflict = await businessValidation.hasConflictingBooking(
        user_id,
        conference.start_time,
        conference.end_time,
        { query: client.query.bind(client) }
      );
      if (hasConflict) {
        await client.query('ROLLBACK');
        return {
          success: false,
          error: 'User has conflicting booking at this time'
        };
      }

      const bookingId = uuidv4();

      // Check if slots are available
      if (conference.available_slots > 0) {
        // Create confirmed booking
        await client.query(`
          INSERT INTO bookings (booking_id, conference_name, user_id, status)
          VALUES ($1, $2, $3, 'CONFIRMED')
        `, [bookingId, conference_name, user_id]);

        // Decrease available slots
        await client.query(`
          UPDATE conferences 
          SET available_slots = available_slots - 1
          WHERE name = $1
        `, [conference_name]);

        // Remove user from other conference waitlists (as they now have a confirmed booking)
        await this.removeUserFromAllWaitlists(client, user_id, conference_name);

        await client.query('COMMIT');

        return {
          success: true,
          booking_id: bookingId,
          status: 'CONFIRMED',
          message: 'Conference booked successfully'
        };

      } else {
        // Add to waitlist
        await client.query(`
          INSERT INTO bookings (booking_id, conference_name, user_id, status)
          VALUES ($1, $2, $3, 'WAITLISTED')
        `, [bookingId, conference_name, user_id]);

        // Get next position in waitlist
        const positionResult = await client.query(`
          SELECT COALESCE(MAX(position), 0) + 1 as next_position
          FROM waitlist
          WHERE conference_name = $1
        `, [conference_name]);

        const position = positionResult.rows[0].next_position;

        // Add to waitlist table
        await client.query(`
          INSERT INTO waitlist (conference_name, booking_id, position)
          VALUES ($1, $2, $3)
        `, [conference_name, bookingId, position]);

        await client.query('COMMIT');

        return {
          success: true,
          booking_id: bookingId,
          status: 'WAITLISTED',
          position: position,
          message: `Added to waitlist at position ${position}`
        };
      }

    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Error in bookConference:', error);
      return {
        success: false,
        error: 'Failed to book conference',
        details: error.message
      };
    } finally {
      client.release();
    }
  }

  /**
   * Get booking status by ID
   * @param {string} bookingId - Booking ID
   * @returns {Object} Booking status and details
   */
  async getBookingStatus(bookingId) {
    try {
      const result = await query(`
        SELECT 
          b.booking_id,
          b.conference_name,
          b.user_id,
          b.status,
          b.created_at,
          b.updated_at,
          b.confirm_by,
          c.location,
          c.start_time,
          c.end_time,
          c.topics,
          w.position as waitlist_position
        FROM bookings b
        JOIN conferences c ON b.conference_name = c.name
        LEFT JOIN waitlist w ON b.booking_id = w.booking_id
        WHERE b.booking_id = $1
      `, [bookingId]);

      if (result.rows.length === 0) {
        return {
          success: false,
          error: 'Booking not found'
        };
      }

      const booking = result.rows[0];
      return {
        success: true,
        data: {
          booking_id: booking.booking_id,
          conference_name: booking.conference_name,
          user_id: booking.user_id,
          status: booking.status,
          waitlist_position: booking.waitlist_position,
          conference_details: {
            location: booking.location,
            start_time: booking.start_time,
            end_time: booking.end_time,
            topics: booking.topics
          },
          created_at: booking.created_at,
          updated_at: booking.updated_at,
          confirm_by: booking.confirm_by
        }
      };

    } catch (error) {
      console.error('Error in getBookingStatus:', error);
      return {
        success: false,
        error: 'Failed to get booking status'
      };
    }
  }

  /**
   * Confirm a waitlisted booking
   * @param {string} bookingId - Booking ID
   * @returns {Object} Confirmation result
   */
  async confirmWaitlistBooking(bookingId) {
    const client = await getClient();

    try {
      await client.query('BEGIN');

      // Get booking details
      const bookingResult = await client.query(`
        SELECT b.*, c.available_slots, c.start_time
        FROM bookings b
        JOIN conferences c ON b.conference_name = c.name
        WHERE b.booking_id = $1
      `, [bookingId]);

      if (bookingResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return {
          success: false,
          error: 'Booking not found'
        };
      }

      const booking = bookingResult.rows[0];

      // Check if booking is waitlisted
      if (booking.status !== 'WAITLISTED') {
        await client.query('ROLLBACK');
        return {
          success: false,
          error: 'Booking is not in waitlisted status'
        };
      }

      // Check if conference has started
      if (new Date(booking.start_time) <= new Date()) {
        await client.query('ROLLBACK');
        return {
          success: false,
          error: 'Cannot confirm booking for conference that has already started'
        };
      }

      // Check if confirmation deadline has passed
      if (booking.confirm_by && new Date() > new Date(booking.confirm_by)) {
        await client.query('ROLLBACK');
        return {
          success: false,
          error: 'Confirmation deadline has passed'
        };
      }

      // Check if slots are still available
      if (booking.available_slots <= 0) {
        await client.query('ROLLBACK');
        return {
          success: false,
          error: 'No slots available to confirm booking'
        };
      }

      // Update booking status to confirmed
      await client.query(`
        UPDATE bookings 
        SET status = 'CONFIRMED', confirm_by = NULL
        WHERE booking_id = $1
      `, [bookingId]);

      // Decrease available slots
      await client.query(`
        UPDATE conferences 
        SET available_slots = available_slots - 1
        WHERE name = $1
      `, [booking.conference_name]);

      // Remove from waitlist
      await client.query(`
        DELETE FROM waitlist WHERE booking_id = $1
      `, [bookingId]);

      // Remove user from other conference waitlists
      await this.removeUserFromAllWaitlists(client, booking.user_id, booking.conference_name);

      // Process next person in waitlist for this conference
      await this.processNextInWaitlist(client, booking.conference_name);

      await client.query('COMMIT');

      return {
        success: true,
        message: 'Booking confirmed successfully',
        booking_id: bookingId,
        status: 'CONFIRMED'
      };

    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Error in confirmWaitlistBooking:', error);
      return {
        success: false,
        error: 'Failed to confirm booking',
        details: error.message
      };
    } finally {
      client.release();
    }
  }

  /**
   * Cancel a booking
   * @param {string} bookingId - Booking ID
   * @returns {Object} Cancellation result
   */
  async cancelBooking(bookingId) {
    const client = await getClient();

    try {
      await client.query('BEGIN');

      // Get booking details
      const bookingResult = await client.query(`
        SELECT b.*, c.start_time
        FROM bookings b
        JOIN conferences c ON b.conference_name = c.name
        WHERE b.booking_id = $1
      `, [bookingId]);

      if (bookingResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return {
          success: false,
          error: 'Booking not found'
        };
      }

      const booking = bookingResult.rows[0];

      // Check if booking is already canceled
      if (booking.status === 'CANCELED') {
        await client.query('ROLLBACK');
        return {
          success: false,
          error: 'Booking is already canceled'
        };
      }

      // Check if conference has started
      if (new Date(booking.start_time) <= new Date()) {
        await client.query('ROLLBACK');
        return {
          success: false,
          error: 'Cannot cancel booking for conference that has already started'
        };
      }

      // Update booking status to canceled
      await client.query(`
        UPDATE bookings 
        SET status = 'CANCELED'
        WHERE booking_id = $1
      `, [bookingId]);

      // If it was a confirmed booking, increase available slots and process waitlist
      if (booking.status === 'CONFIRMED') {
        await client.query(`
          UPDATE conferences 
          SET available_slots = available_slots + 1
          WHERE name = $1
        `, [booking.conference_name]);

        // Process next person in waitlist
        await this.processNextInWaitlist(client, booking.conference_name);
      }

      // If it was waitlisted, remove from waitlist and reorder positions
      if (booking.status === 'WAITLISTED') {
        await client.query(`
          DELETE FROM waitlist WHERE booking_id = $1
        `, [bookingId]);

        // Reorder waitlist positions
        await this.reorderWaitlist(client, booking.conference_name);
      }

      await client.query('COMMIT');

      return {
        success: true,
        message: 'Booking canceled successfully',
        booking_id: bookingId,
        status: 'CANCELED'
      };

    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Error in cancelBooking:', error);
      return {
        success: false,
        error: 'Failed to cancel booking',
        details: error.message
      };
    } finally {
      client.release();
    }
  }

  /**
   * Process next person in waitlist when a slot becomes available
   * @param {Object} client - Database client
   * @param {string} conferenceName - Conference name
   */
  async processNextInWaitlist(client, conferenceName) {
    try {
      // Get next person in waitlist
      const waitlistResult = await client.query(`
        SELECT w.booking_id, b.user_id
        FROM waitlist w
        JOIN bookings b ON w.booking_id = b.booking_id
        WHERE w.conference_name = $1
        ORDER BY w.position ASC
        LIMIT 1
      `, [conferenceName]);

      if (waitlistResult.rows.length > 0) {
        const nextBooking = waitlistResult.rows[0];
        const confirmBy = new Date(Date.now() + 60 * 60 * 1000); // 1 hour from now

        // Set confirmation deadline
        await client.query(`
          UPDATE bookings 
          SET confirm_by = $1
          WHERE booking_id = $2
        `, [confirmBy, nextBooking.booking_id]);

        console.log(`User ${nextBooking.user_id} has 1 hour to confirm booking ${nextBooking.booking_id}`);
      }

    } catch (error) {
      console.error('Error in processNextInWaitlist:', error);
      throw error;
    }
  }

  /**
   * Remove user from all waitlists except specified conference
   * @param {Object} client - Database client
   * @param {string} userId - User ID
   * @param {string} excludeConference - Conference to exclude
   */
  async removeUserFromAllWaitlists(client, userId, excludeConference = null) {
    try {
      let query_text = `
        DELETE FROM waitlist 
        WHERE booking_id IN (
          SELECT booking_id FROM bookings 
          WHERE user_id = $1 AND status = 'WAITLISTED'
      `;
      let params = [userId];

      if (excludeConference) {
        query_text += ' AND conference_name != $2';
        params.push(excludeConference);
      }

      query_text += ')';

      await client.query(query_text, params);

      // Also update booking status to canceled
      let booking_query = `
        UPDATE bookings 
        SET status = 'CANCELED' 
        WHERE user_id = $1 AND status = 'WAITLISTED'
      `;
      let booking_params = [userId];

      if (excludeConference) {
        booking_query += ' AND conference_name != $2';
        booking_params.push(excludeConference);
      }

      await client.query(booking_query, booking_params);

    } catch (error) {
      console.error('Error in removeUserFromAllWaitlists:', error);
      throw error;
    }
  }

  /**
   * Reorder waitlist positions after removal
   * @param {Object} client - Database client
   * @param {string} conferenceName - Conference name
   */
  async reorderWaitlist(client, conferenceName) {
    try {
      await client.query(`
        UPDATE waitlist 
        SET position = new_position
        FROM (
          SELECT booking_id, ROW_NUMBER() OVER (ORDER BY created_at) as new_position
          FROM waitlist
          WHERE conference_name = $1
        ) as reordered
        WHERE waitlist.booking_id = reordered.booking_id
          AND waitlist.conference_name = $1
      `, [conferenceName]);

    } catch (error) {
      console.error('Error in reorderWaitlist:', error);
      throw error;
    }
  }

  /**
   * Handle expired waitlist bookings (cron job)
   */
  async handleExpiredWaitlistBookings() {
    const client = await getClient();

    try {
      await client.query('BEGIN');

      // Find expired waitlist bookings
      const expiredResult = await client.query(`
        SELECT booking_id, conference_name, user_id
        FROM bookings
        WHERE status = 'WAITLISTED'
          AND confirm_by IS NOT NULL 
          AND confirm_by < $1
      `, [new Date()]);

      for (const expiredBooking of expiredResult.rows) {
        console.log(`Processing expired booking: ${expiredBooking.booking_id}`);

        // Move to end of waitlist
        const maxPositionResult = await client.query(`
          SELECT COALESCE(MAX(position), 0) as max_position
          FROM waitlist
          WHERE conference_name = $1
        `, [expiredBooking.conference_name]);

        const newPosition = maxPositionResult.rows[0].max_position + 1;

        // Update waitlist position
        await client.query(`
          UPDATE waitlist 
          SET position = $1
          WHERE booking_id = $2
        `, [newPosition, expiredBooking.booking_id]);

        // Clear confirmation deadline
        await client.query(`
          UPDATE bookings 
          SET confirm_by = NULL
          WHERE booking_id = $1
        `, [expiredBooking.booking_id]);

        // Process next person in waitlist
        await this.processNextInWaitlist(client, expiredBooking.conference_name);
      }

      await client.query('COMMIT');
      console.log(`Processed ${expiredResult.rows.length} expired waitlist bookings`);

    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Error in handleExpiredWaitlistBookings:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Auto-cancel waitlisted bookings for started conferences (cron job)
   */
  async autoCancelForStartedConferences() {
    const client = await getClient();

    try {
      await client.query('BEGIN');

      // Get started conferences
      const startedConferences = await conferenceService.getStartedConferences();

      for (const conference of startedConferences) {
        // Cancel all waitlisted bookings for this conference
        const cancelResult = await client.query(`
          UPDATE bookings 
          SET status = 'CANCELED'
          WHERE conference_name = $1 AND status = 'WAITLISTED'
          RETURNING booking_id, user_id
        `, [conference.name]);

        // Remove from waitlist table
        await client.query(`
          DELETE FROM waitlist 
          WHERE conference_name = $1
        `, [conference.name]);

        console.log(`Auto-canceled ${cancelResult.rows.length} waitlisted bookings for started conference: ${conference.name}`);
      }

      await client.query('COMMIT');

    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Error in autoCancelForStartedConferences:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get all bookings for a conference
   * @param {string} conferenceName - Conference name
   * @returns {Object} List of bookings
   */
  async getConferenceBookings(conferenceName) {
    try {
      const result = await query(`
        SELECT 
          b.booking_id,
          b.user_id,
          b.status,
          b.created_at,
          b.updated_at,
          b.confirm_by,
          w.position as waitlist_position
        FROM bookings b
        LEFT JOIN waitlist w ON b.booking_id = w.booking_id
        WHERE b.conference_name = $1
        ORDER BY 
          CASE b.status 
            WHEN 'CONFIRMED' THEN 1 
            WHEN 'WAITLISTED' THEN 2 
            WHEN 'CANCELED' THEN 3 
          END,
          w.position ASC,
          b.created_at ASC
      `, [conferenceName]);

      return {
        success: true,
        data: result.rows
      };

    } catch (error) {
      console.error('Error in getConferenceBookings:', error);
      return {
        success: false,
        error: 'Failed to get conference bookings'
      };
    }
  }

  /**
   * Get waitlist for a conference
   * @param {string} conferenceName - Conference name
   * @returns {Object} Waitlist details
   */
  async getConferenceWaitlist(conferenceName) {
    try {
      const result = await query(`
        SELECT 
          w.position,
          b.booking_id,
          b.user_id,
          b.created_at,
          b.confirm_by
        FROM waitlist w
        JOIN bookings b ON w.booking_id = b.booking_id
        WHERE w.conference_name = $1
        ORDER BY w.position ASC
      `, [conferenceName]);

      return {
        success: true,
        data: result.rows,
        count: result.rows.length
      };

    } catch (error) {
      console.error('Error in getConferenceWaitlist:', error);
      return {
        success: false,
        error: 'Failed to get conference waitlist'
      };
    }
  }

  /**
   * Get booking statistics
   * @returns {Object} Overall booking statistics
   */
  async getBookingStatistics() {
    try {
      const result = await query(`
        SELECT 
          COUNT(*) as total_bookings,
          COUNT(CASE WHEN status = 'CONFIRMED' THEN 1 END) as confirmed_bookings,
          COUNT(CASE WHEN status = 'WAITLISTED' THEN 1 END) as waitlisted_bookings,
          COUNT(CASE WHEN status = 'CANCELED' THEN 1 END) as canceled_bookings,
          COUNT(DISTINCT user_id) as unique_users,
          COUNT(DISTINCT conference_name) as conferences_with_bookings
        FROM bookings
      `);

      const conferenceStats = await query(`
        SELECT 
          COUNT(*) as total_conferences,
          SUM(total_slots) as total_capacity,
          SUM(available_slots) as available_capacity,
          SUM(total_slots - available_slots) as booked_capacity
        FROM conferences
      `);

      return {
        success: true,
        data: {
          bookings: result.rows[0],
          conferences: conferenceStats.rows[0]
        }
      };

    } catch (error) {
      console.error('Error in getBookingStatistics:', error);
      return {
        success: false,
        error: 'Failed to get booking statistics'
      };
    }
  }
}

module.exports = new BookingService();