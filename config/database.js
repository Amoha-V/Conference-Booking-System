const { Pool } = require('pg');
require('dotenv').config();

// Create PostgreSQL connection pool
const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'conference_booking',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD,
  max: 20, // Maximum number of connections in the pool
  idleTimeoutMillis: 30000, // How long a client is allowed to remain idle
  connectionTimeoutMillis: 2000, // How long to wait for a connection
});

// Test database connection
pool.on('connect', () => {
  console.log('✅ Connected to PostgreSQL database');
});

pool.on('error', (err) => {
  console.error('❌ Unexpected error on idle client', err);
  process.exit(-1);
});

// Helper function to execute queries
const query = async (text, params) => {
  const start = Date.now();
  try {
    const res = await pool.query(text, params);
    const duration = Date.now() - start;
    console.log('📊 Query executed:', { text, duration, rows: res.rowCount });
    return res;
  } catch (error) {
    console.error('❌ Database query error:', error);
    throw error;
  }
};

// Helper function to get a client from the pool for transactions
const getClient = async () => {
  const client = await pool.connect();
  const query = client.query;
  const release = client.release;
  
  // Set a timeout for transactions
  const timeout = setTimeout(() => {
    console.error('❌ A client has been checked out for more than 5 seconds!');
  }, 5000);
  
  // Monkey patch the release method to clear our timeout
  client.release = () => {
    clearTimeout(timeout);
    client.release = release;
    return release.apply(client);
  };
  
  return client;
};

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('🔄 Gracefully closing database connections...');
  await pool.end();
  console.log('✅ Database connections closed');
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('🔄 Gracefully closing database connections...');
  await pool.end();
  console.log('✅ Database connections closed');
  process.exit(0);
});

module.exports = {
  pool,
  query,
  getClient
};