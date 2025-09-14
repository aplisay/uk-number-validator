#!/usr/bin/env node

const http = require('http');
const { performance } = require('perf_hooks');
const pino = require('pino');

// Create logger for performance test
const logger = pino({
  level: 'info',
  transport: {
    target: 'pino-pretty',
    options: {
      colorize: true,
      translateTime: 'SYS:standard',
      ignore: 'pid,hostname'
    }
  }
});

const URL = `http://localhost:${process.env.PORT || 8080}/validate?number=07970939456`;
const ITERATIONS = 10000;

async function makeRequest() {
  return new Promise((resolve, reject) => {
    const startTime = performance.now();
    
    const req = http.get(URL, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        const endTime = performance.now();
        const duration = endTime - startTime;
        
        resolve({
          statusCode: res.statusCode,
          duration: duration,
          data: data,
          success: res.statusCode === 200
        });
      });
    });
    
    req.on('error', (error) => {
      const endTime = performance.now();
      const duration = endTime - startTime;
      
      reject({
        error: error.message,
        duration: duration,
        success: false
      });
    });
    
    req.setTimeout(5000, () => {
      req.destroy();
      const endTime = performance.now();
      const duration = endTime - startTime;
      
      reject({
        error: 'Request timeout',
        duration: duration,
        success: false
      });
    });
  });
}

async function runPerformanceTest() {
  logger.info(`Starting performance test...`);
  logger.info(`URL: ${URL}`);
  logger.info(`Iterations: ${ITERATIONS}`);
  logger.info(`\nRunning tests...\n`);
  
  const results = [];
  const startTime = performance.now();
  
  for (let i = 0; i < ITERATIONS; i++) {
    try {
      const result = await makeRequest();
      results.push(result);
      
      // Progress indicator
      if ((i + 1) % 100 === 0) {
        logger.info(`Completed ${i + 1}/${ITERATIONS} requests...`);
      }
    } catch (error) {
      results.push(error);
      logger.error(`Request ${i + 1} failed:`, error.error || error.message);
    }
  }
  
  const endTime = performance.now();
  const totalDuration = endTime - startTime;
  
  // Calculate statistics
  const successfulRequests = results.filter(r => r.success);
  const failedRequests = results.filter(r => !r.success);
  const durations = successfulRequests.map(r => r.duration);
  
  const stats = {
    totalRequests: ITERATIONS,
    successfulRequests: successfulRequests.length,
    failedRequests: failedRequests.length,
    successRate: (successfulRequests.length / ITERATIONS) * 100,
    totalDuration: totalDuration,
    averageRequestTime: durations.length > 0 ? durations.reduce((a, b) => a + b, 0) / durations.length : 0,
    minRequestTime: durations.length > 0 ? Math.min(...durations) : 0,
    maxRequestTime: durations.length > 0 ? Math.max(...durations) : 0,
    requestsPerSecond: ITERATIONS / (totalDuration / 1000)
  };
  
  // Sort durations for percentile calculations
  durations.sort((a, b) => a - b);
  
  const getPercentile = (arr, percentile) => {
    if (arr.length === 0) return 0;
    const index = Math.ceil((percentile / 100) * arr.length) - 1;
    return arr[Math.max(0, index)];
  };
  
  // Print results
  logger.info('\n' + '='.repeat(60));
  logger.info('PERFORMANCE TEST RESULTS');
  logger.info('='.repeat(60));
  logger.info(`Total Requests: ${stats.totalRequests}`);
  logger.info(`Successful Requests: ${stats.successfulRequests}`);
  logger.info(`Failed Requests: ${stats.failedRequests}`);
  logger.info(`Success Rate: ${stats.successRate.toFixed(2)}%`);
  logger.info(`Total Duration: ${stats.totalDuration.toFixed(2)}ms`);
  logger.info(`Average Request Time: ${stats.averageRequestTime.toFixed(2)}ms`);
  logger.info(`Min Request Time: ${stats.minRequestTime.toFixed(2)}ms`);
  logger.info(`Max Request Time: ${stats.maxRequestTime.toFixed(2)}ms`);
  logger.info(`Requests Per Second: ${stats.requestsPerSecond.toFixed(2)}`);
  logger.info('\nResponse Time Percentiles:');
  logger.info(`  50th percentile (median): ${getPercentile(durations, 50).toFixed(2)}ms`);
  logger.info(`  90th percentile: ${getPercentile(durations, 90).toFixed(2)}ms`);
  logger.info(`  95th percentile: ${getPercentile(durations, 95).toFixed(2)}ms`);
  logger.info(`  99th percentile: ${getPercentile(durations, 99).toFixed(2)}ms`);
  
  if (failedRequests.length > 0) {
    logger.info('\nFailed Requests:');
    const errorCounts = {};
    failedRequests.forEach(req => {
      const error = req.error || 'Unknown error';
      errorCounts[error] = (errorCounts[error] || 0) + 1;
    });
    
    Object.entries(errorCounts).forEach(([error, count]) => {
      logger.info(`  ${error}: ${count} times`);
    });
  }
  
  logger.info('\n' + '='.repeat(60));
}

// Handle process termination gracefully
process.on('SIGINT', () => {
  logger.info('\nTest interrupted by user');
  process.exit(0);
});

process.on('SIGTERM', () => {
  logger.info('\nTest terminated');
  process.exit(0);
});

// Run the test
runPerformanceTest().catch(error => {
  logger.error('Test failed:', error);
  process.exit(1);
});
