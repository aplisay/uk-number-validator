#!/usr/bin/env node

const http = require('http');
const { performance } = require('perf_hooks');

const URL = 'http://localhost:3000/validate?number=02079460000';
const ITERATIONS = 1000;

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
  console.log(`Starting performance test...`);
  console.log(`URL: ${URL}`);
  console.log(`Iterations: ${ITERATIONS}`);
  console.log(`\nRunning tests...\n`);
  
  const results = [];
  const startTime = performance.now();
  
  for (let i = 0; i < ITERATIONS; i++) {
    try {
      const result = await makeRequest();
      results.push(result);
      
      // Progress indicator
      if ((i + 1) % 100 === 0) {
        console.log(`Completed ${i + 1}/${ITERATIONS} requests...`);
      }
    } catch (error) {
      results.push(error);
      console.error(`Request ${i + 1} failed:`, error.error || error.message);
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
  console.log('\n' + '='.repeat(60));
  console.log('PERFORMANCE TEST RESULTS');
  console.log('='.repeat(60));
  console.log(`Total Requests: ${stats.totalRequests}`);
  console.log(`Successful Requests: ${stats.successfulRequests}`);
  console.log(`Failed Requests: ${stats.failedRequests}`);
  console.log(`Success Rate: ${stats.successRate.toFixed(2)}%`);
  console.log(`Total Duration: ${stats.totalDuration.toFixed(2)}ms`);
  console.log(`Average Request Time: ${stats.averageRequestTime.toFixed(2)}ms`);
  console.log(`Min Request Time: ${stats.minRequestTime.toFixed(2)}ms`);
  console.log(`Max Request Time: ${stats.maxRequestTime.toFixed(2)}ms`);
  console.log(`Requests Per Second: ${stats.requestsPerSecond.toFixed(2)}`);
  console.log('\nResponse Time Percentiles:');
  console.log(`  50th percentile (median): ${getPercentile(durations, 50).toFixed(2)}ms`);
  console.log(`  90th percentile: ${getPercentile(durations, 90).toFixed(2)}ms`);
  console.log(`  95th percentile: ${getPercentile(durations, 95).toFixed(2)}ms`);
  console.log(`  99th percentile: ${getPercentile(durations, 99).toFixed(2)}ms`);
  
  if (failedRequests.length > 0) {
    console.log('\nFailed Requests:');
    const errorCounts = {};
    failedRequests.forEach(req => {
      const error = req.error || 'Unknown error';
      errorCounts[error] = (errorCounts[error] || 0) + 1;
    });
    
    Object.entries(errorCounts).forEach(([error, count]) => {
      console.log(`  ${error}: ${count} times`);
    });
  }
  
  console.log('\n' + '='.repeat(60));
}

// Handle process termination gracefully
process.on('SIGINT', () => {
  console.log('\nTest interrupted by user');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\nTest terminated');
  process.exit(0);
});

// Run the test
runPerformanceTest().catch(error => {
  console.error('Test failed:', error);
  process.exit(1);
});
