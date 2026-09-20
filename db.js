const { Pool } = require('pg');
require('dotenv').config();

// Railway's DATABASE_URL works the same in local dev and on Render.
// SSL is required for Railway's managed Postgres from an external host.
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

pool.on('connect', () => {
    console.log('Database connected successfully!');
});

pool.on('error', (err) => {
    console.error('Unexpected database connection error:', err);
});

module.exports = {
    query: (text, params) => pool.query(text, params),
    pool // Exported so routes can pull a client for explicit BEGIN/COMMIT transactions
};
