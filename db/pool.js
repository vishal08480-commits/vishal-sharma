const mysql = require('mysql2/promise');

// Either set DATABASE_URL in .env, or the individual DB_* vars — see .env.example
const pool = process.env.DATABASE_URL
  ? mysql.createPool(process.env.DATABASE_URL)
  : mysql.createPool({
      host: process.env.DB_HOST || 'localhost',
      port: process.env.DB_PORT || 3306,
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '',
      database: process.env.DB_NAME || 'taskmanager',
      waitForConnections: true,
      connectionLimit: 10
    });

module.exports = pool;
