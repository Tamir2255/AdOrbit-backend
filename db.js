const { Pool } = require('pg');
require('dotenv').config();

// Works the same in local dev and on Render, against any managed Postgres
// provider (Supabase, Railway, etc.) — just point DATABASE_URL at it.
// SSL is required for hosted Postgres reached from an external host.
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
