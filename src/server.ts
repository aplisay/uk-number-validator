import express from 'express';
import cors from 'cors';
import { buildIndex, classifyUkNumber, normaliseToUkNational, NumberClass, PrefixRule, ClassificationResult } from './classifyUkNumber';
import * as fs from 'node:fs';
import * as path from 'node:path';
import logger from './logger';

const app = express();
const PORT = process.env.PORT || 8080;

// Middleware
app.use(cors());
app.use(express.json());

// Global variables for the validator
let rules: PrefixRule[] = [];
let index: any = null;
let isReady = false;

// Load and initialize the validator
async function initializeValidator() {
  try {
    logger.info('Loading UK number validation data...');
    const rulesPath = path.resolve(process.cwd(), 'prefixes.json');
    
    if (!fs.existsSync(rulesPath)) {
      throw new Error('prefixes.json not found. Please run the build process first.');
    }
    
    rules = JSON.parse(fs.readFileSync(rulesPath, 'utf8'));
    logger.info({ rulesCount: rules.length }, `Loaded ${rules.length} validation rules`);
    
    logger.info('Building validation index...');
    const startTime = Date.now();
    index = buildIndex(rules);
    const buildTime = Date.now() - startTime;
    logger.info({ buildTime }, `Index built in ${buildTime}ms`);
    
    isReady = true;
    logger.info('UK Number Validator service is ready!');
  } catch (error) {
    logger.error({ error }, 'Failed to initialize validator');
    process.exit(1);
  }
}

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    ready: isReady,
    rulesLoaded: rules.length,
    timestamp: new Date().toISOString()
  });
});

// Main validation endpoint
app.get('/validate', (req, res) => {
  if (!isReady) {
    return res.status(503).json({
      error: 'Service not ready',
      message: 'Validator is still initializing'
    });
  }

  const { number } = req.query;
  
  if (!number || typeof number !== 'string') {
    return res.status(400).json({
      error: 'Invalid request',
      message: 'Please provide a number in the query string (e.g., ?number=02079460000)'
    });
  }

  try {
    const national = normaliseToUkNational(number);
    if (!national) {
      return res.json({
        number: number,
        national: null,
        result: {
          class: NumberClass.NUMBER_INVALID,
          provider: null
        },
        message: 'Invalid number format'
      });
    }

    const result = classifyUkNumber(national, index);
    
    res.json({
      number: number,
      national: national,
      result: result,
      message: getResultMessage(result)
    });
  } catch (error) {
    logger.error({ error, number }, 'Validation error');
    res.status(500).json({
      error: 'Validation failed',
      message: 'An error occurred during validation'
    });
  }
});

// Batch validation endpoint
app.post('/validate/batch', (req, res) => {
  if (!isReady) {
    return res.status(503).json({
      error: 'Service not ready',
      message: 'Validator is still initializing'
    });
  }

  const { numbers } = req.body;
  
  if (!Array.isArray(numbers)) {
    return res.status(400).json({
      error: 'Invalid request',
      message: 'Please provide an array of numbers in the request body'
    });
  }

  if (numbers.length > 100) {
    return res.status(400).json({
      error: 'Request too large',
      message: 'Maximum 100 numbers per batch request'
    });
  }

  try {
    const results = numbers.map((number: string) => {
      const national = normaliseToUkNational(number);
      if (!national) {
        return {
          number: number,
          national: null,
          result: {
            class: NumberClass.NUMBER_INVALID,
            provider: null
          },
          message: 'Invalid number format'
        };
      }

      const result = classifyUkNumber(national, index);
      return {
        number: number,
        national: national,
        result: result,
        message: getResultMessage(result)
      };
    });

    res.json({
      results: results,
      count: results.length
    });
  } catch (error) {
    logger.error({ error, numbersCount: numbers.length }, 'Batch validation error');
    res.status(500).json({
      error: 'Batch validation failed',
      message: 'An error occurred during batch validation'
    });
  }
});

// Service info endpoint
app.get('/info', (req, res) => {
  res.json({
    service: 'UK Number Validator',
    version: '1.0.0',
    description: 'Authoritative UK number validation against Ofcom data',
    endpoints: {
      'GET /validate?number=<number>': 'Validate a single number',
      'POST /validate/batch': 'Validate multiple numbers (max 100)',
      'GET /health': 'Service health check',
      'GET /info': 'Service information'
    },
    ready: isReady,
    rulesLoaded: rules.length
  });
});

// Helper function to generate user-friendly messages
function getResultMessage(result: ClassificationResult): string {
  switch (result.class) {
    case NumberClass.NUMBER_VALID:
      return result.provider 
        ? `Valid UK number (${result.provider})`
        : 'Valid UK number';
    case NumberClass.NUMBER_TOO_SHORT:
      return result.provider
        ? `Number too short (${result.provider})`
        : 'Number too short';
    case NumberClass.NUMBER_INVALID:
      return 'Invalid UK number';
    default:
      return 'Unknown validation result';
  }
}

// Error handling middleware
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  logger.error({ error: err, url: req.url, method: req.method }, 'Unhandled error');
  res.status(500).json({
    error: 'Internal server error',
    message: 'An unexpected error occurred'
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: 'Not found',
    message: 'Endpoint not found. Try GET /info for available endpoints.'
  });
});

// Start the server
async function startServer() {
  await initializeValidator();
  
  app.listen(PORT, () => {
    logger.info({ port: PORT }, `UK Number Validator service running on port ${PORT}`);
    logger.info({ healthUrl: `http://localhost:${PORT}/health` }, `Health check: http://localhost:${PORT}/health`);
    logger.info({ validateUrl: `http://localhost:${PORT}/validate?number=02079460000` }, `Validate number: http://localhost:${PORT}/validate?number=02079460000`);
    logger.info({ infoUrl: `http://localhost:${PORT}/info` }, `Service info: http://localhost:${PORT}/info`);
  });
}

// Handle graceful shutdown
process.on('SIGTERM', () => {
  logger.info('Received SIGTERM, shutting down gracefully...');
  process.exit(0);
});

process.on('SIGINT', () => {
  logger.info('Received SIGINT, shutting down gracefully...');
  process.exit(0);
});

startServer().catch((error) => logger.error({ error }, 'Failed to start server'));
