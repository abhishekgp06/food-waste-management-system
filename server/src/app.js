import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { testConnection } from './config/db.js';
import requestId from './middleware/requestId.js';

const app = express();

// Request correlation ID tracking (mounted early so all requests and responses receive X-Request-Id)
app.use(requestId);

// Security middleware
app.use(helmet());
app.use(cors({
  origin: process.env.CLIENT_URL || 'http://localhost:5173',
  credentials: true,
}));

// Body parsers
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Liveness & health probe
app.get('/health', async (req, res) => {
  const isDeep = req.query.deep === 'true' || req.query.check === 'db';

  if (!isDeep) {
    return res.status(200).json({
      status: 'UP',
      service: 'food-waste-management-api',
      academicYear: '2026-2027',
      institution: 'The National Institute of Engineering, Mysuru',
      timestamp: new Date().toISOString(),
      databaseEndpoint: '/health/db'
    });
  }

  const dbHealth = await testConnection();
  const statusCode = dbHealth.ok ? 200 : 503;

  return res.status(statusCode).json({
    status: dbHealth.ok ? 'UP' : 'DEGRADED',
    service: 'food-waste-management-api',
    academicYear: '2026-2027',
    institution: 'The National Institute of Engineering, Mysuru',
    timestamp: new Date().toISOString(),
    database: {
      connected: dbHealth.ok,
      latencyMs: dbHealth.latencyMs,
      ...(dbHealth.ok
        ? { version: dbHealth.version, host: dbHealth.host, port: dbHealth.port, database: dbHealth.database }
        : { error: dbHealth.error, code: dbHealth.code, host: dbHealth.host, port: dbHealth.port, database: dbHealth.database })
    }
  });
});

// Dedicated Database Health & Connectivity Probe
app.get('/health/db', async (req, res) => {
  const dbHealth = await testConnection();
  const statusCode = dbHealth.ok ? 200 : 503;

  return res.status(statusCode).json({
    status: dbHealth.ok ? 'UP' : 'DOWN',
    timestamp: new Date().toISOString(),
    database: {
      connected: dbHealth.ok,
      latencyMs: dbHealth.latencyMs,
      host: dbHealth.host,
      port: dbHealth.port,
      database: dbHealth.database,
      ...(dbHealth.ok
        ? { version: dbHealth.version, serverTime: dbHealth.timestamp }
        : { error: dbHealth.error, code: dbHealth.code })
    }
  });
});

// Root API placeholder
app.get('/api/v1', (req, res) => {
  res.status(200).json({
    message: 'Welcome to Cloud-Based Food Waste Management API (v1)',
    documentation: '/docs',
    status: 'Foundation Ready'
  });
});

// 404 Not Found Handler
app.use((req, res) => {
  res.status(404).json({
    error: {
      code: 'NOT_FOUND',
      message: `The requested resource '${req.originalUrl}' does not exist on this server.`,
      requestId: req.id || `req_${Date.now()}`
    }
  });
});

// Centralized Global Error Handler
app.use((err, req, res, next) => {
  const statusCode = err.status || 500;
  const isProduction = process.env.NODE_ENV === 'production';

  res.status(statusCode).json({
    error: {
      code: err.code || 'INTERNAL_SERVER_ERROR',
      message: isProduction && statusCode === 500
        ? 'An unexpected error occurred. Please contact the administrator.'
        : err.message || 'Internal server error',
      requestId: req.id || `req_${Date.now()}`,
      ...(isProduction ? {} : { stack: err.stack })
    }
  });
});

export default app;
