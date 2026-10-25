import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import app from './app.js';
import { closePool } from './config/db.js';
import logger from './utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables from project root or server directory
dotenv.config({ path: path.resolve(__dirname, '../../.env') });
dotenv.config();

const PORT = process.env.PORT || 5000;

const server = app.listen(PORT, () => {
  logger.info('Cloud-Based Food Waste Management System - Backend API started', {
    institution: 'The National Institute of Engineering, Mysuru',
    academicYear: '2026-2027',
    environment: process.env.NODE_ENV || 'development',
    port: PORT,
    endpoints: {
      health: `http://localhost:${PORT}/health`,
      databaseHealth: `http://localhost:${PORT}/health/db`
    }
  });
});

// Graceful shutdown handling
const gracefulShutdown = async (signal) => {
  logger.info(`${signal} signal received: closing HTTP server and database pool...`);
  server.close(async () => {
    logger.info('HTTP server closed.');
    await closePool();
    logger.info('Graceful shutdown completed.');
    process.exit(0);
  });
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
