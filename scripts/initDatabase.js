const { query } = require('../config/database');

const createTables = async () => {
  try {
    console.log(' Creating database tables...');

    // Create conferences table
    await query(`
      CREATE TABLE IF NOT EXISTS conferences (
        name VARCHAR(255) PRIMARY KEY,
        location VARCHAR(255) NOT NULL,
        topics TEXT[] NOT NULL,
        start_time TIMESTAMP WITH TIME ZONE NOT NULL,
        end_time TIMESTAMP WITH TIME ZONE NOT NULL,
        total_slots INTEGER NOT NULL CHECK (total_slots > 0),
        available_slots INTEGER NOT NULL CHECK (available_slots >= 0),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT valid_time_range CHECK (end_time > start_time),
        CONSTRAINT valid_duration CHECK (end_time <= start_time + INTERVAL '12 hours'),
        CONSTRAINT available_slots_valid CHECK (available_slots <= total_slots)
      )
    `);
    console.log(' Conferences table created');

    // Create users table
    await query(`
      CREATE TABLE IF NOT EXISTS users (
        user_id VARCHAR(255) PRIMARY KEY,
        interested_topics TEXT[] NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT max_topics CHECK (array_length(interested_topics, 1) <= 50)
      )
    `);
    console.log(' Users table created');

    // Create bookings table
    await query(`
      CREATE TABLE IF NOT EXISTS bookings (
        booking_id UUID PRIMARY KEY,
        conference_name VARCHAR(255) NOT NULL REFERENCES conferences(name) ON DELETE CASCADE,
        user_id VARCHAR(255) NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
        status VARCHAR(20) NOT NULL CHECK (status IN ('CONFIRMED', 'WAITLISTED', 'CANCELED')),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        confirm_by TIMESTAMP WITH TIME ZONE,
        UNIQUE(conference_name, user_id)
      )
    `);
    console.log(' Bookings table created');

    // Create waitlist table for maintaining order
    await query(`
      CREATE TABLE IF NOT EXISTS waitlist (
        id SERIAL PRIMARY KEY,
        conference_name VARCHAR(255) NOT NULL REFERENCES conferences(name) ON DELETE CASCADE,
        booking_id UUID NOT NULL REFERENCES bookings(booking_id) ON DELETE CASCADE,
        position INTEGER NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(conference_name, booking_id),
        UNIQUE(conference_name, position)
      )
    `);
    console.log(' Waitlist table created');

    // Create indexes for better performance
    await query(`
      CREATE INDEX IF NOT EXISTS idx_conferences_start_time ON conferences(start_time);
    `);
    
    await query(`
      CREATE INDEX IF NOT EXISTS idx_bookings_user_id ON bookings(user_id);
    `);
    
    await query(`
      CREATE INDEX IF NOT EXISTS idx_bookings_conference_name ON bookings(conference_name);
    `);
    
    await query(`
      CREATE INDEX IF NOT EXISTS idx_bookings_status ON bookings(status);
    `);
    
    await query(`
      CREATE INDEX IF NOT EXISTS idx_waitlist_conference_position ON waitlist(conference_name, position);
    `);
    
    console.log('Indexes created');

    // Create updated_at trigger function
    await query(`
      CREATE OR REPLACE FUNCTION update_updated_at_column()
      RETURNS TRIGGER AS $$
      BEGIN
        NEW.updated_at = CURRENT_TIMESTAMP;
        RETURN NEW;
      END;
      $$ language 'plpgsql';
    `);

    // Create triggers for updated_at
    await query(`
      DROP TRIGGER IF EXISTS update_conferences_updated_at ON conferences;
      CREATE TRIGGER update_conferences_updated_at 
        BEFORE UPDATE ON conferences 
        FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    `);

    await query(`
      DROP TRIGGER IF EXISTS update_users_updated_at ON users;
      CREATE TRIGGER update_users_updated_at 
        BEFORE UPDATE ON users 
        FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    `);

    await query(`
      DROP TRIGGER IF EXISTS update_bookings_updated_at ON bookings;
      CREATE TRIGGER update_bookings_updated_at 
        BEFORE UPDATE ON bookings 
        FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    `);

    console.log(' Triggers created');

    console.log('Database initialization completed successfully!');
    
    // Display table information
    const tablesResult = await query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      ORDER BY table_name;
    `);
    
    console.log('\n Created tables:');
    tablesResult.rows.forEach(row => {
      console.log(`  - ${row.table_name}`);
    });

  } catch (error) {
    console.error(' Error creating tables:', error);
    throw error;
  }
};

// Run the initialization if this file is executed directly
if (require.main === module) {
  createTables()
    .then(() => {
      console.log(' Database setup complete');
      process.exit(0);
    })
    .catch((error) => {
      console.error(' Database setup failed:', error);
      process.exit(1);
    });
}

module.exports = { createTables };