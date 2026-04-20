import 'reflect-metadata';
import { Pool } from 'pg';
import dotenv from 'dotenv';
import path from 'path';

// Load environment variables from .env file
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const pool = new Pool({
  host: '127.0.0.1',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
  database: process.env.DB_DB || 'itrade',
});

async function makeAdmin(email: string) {
  try {
    const res = await pool.query(
      'UPDATE "user" SET role = $1 WHERE email = $2 RETURNING *',
      ['admin', email],
    );

    if (res.rowCount === 0) {
      console.error(`User with email ${email} not found.`);
    } else {
      console.log(`Successfully promoted ${email} to admin.`);
      console.log(res.rows[0]);
    }
  } catch (error) {
    console.error('Error updating user role:', error);
  } finally {
    await pool.end();
  }
}

const email = process.argv[2];
if (!email) {
  console.error('Please provide an email address.');
  process.exit(1);
}

makeAdmin(email);
