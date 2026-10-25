import dotenv from 'dotenv';
import app from './app.js';

// Load environment variables from .env if present
dotenv.config();

const PORT = process.env.PORT || 5000;

const server = app.listen(PORT, () => {
  console.log(`====================================================`);
  console.log(`Cloud-Based Food Waste Management System - Backend API`);
  console.log(`Institution: The National Institute of Engineering, Mysuru`);
  console.log(`Academic Year: 2026-2027`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`Listening on http://localhost:${PORT}`);
  console.log(`Health endpoint: http://localhost:${PORT}/health`);
  console.log(`====================================================`);
});

// Graceful shutdown handling
process.on('SIGTERM', () => {
  console.log('SIGTERM signal received: closing HTTP server...');
  server.close(() => {
    console.log('HTTP server closed.');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('SIGINT signal received: closing HTTP server...');
  server.close(() => {
    console.log('HTTP server closed.');
    process.exit(0);
  });
});
