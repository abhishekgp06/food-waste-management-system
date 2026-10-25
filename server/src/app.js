import express from 'express';
import cors from 'cors';
import helmet from 'helmet';

const app = express();

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
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'UP',
    service: 'food-waste-management-api',
    academicYear: '2026-2027',
    institution: 'The National Institute of Engineering, Mysuru',
    timestamp: new Date().toISOString()
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
      requestId: `req_${Date.now()}`
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
      requestId: `req_${Date.now()}`,
      ...(isProduction ? {} : { stack: err.stack })
    }
  });
});

export default app;
