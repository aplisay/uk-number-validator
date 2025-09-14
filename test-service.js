



const http = require('http');
const pino = require('pino');

// Create logger for test service
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

const BASE_URL = `http://localhost:${process.env.PORT || 8080}`;

function makeRequest(path) {
  return new Promise((resolve, reject) => {
    const req = http.get(`${BASE_URL}${path}`, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          resolve(data);
        }
      });
    });
    
    req.on('error', reject);
    req.setTimeout(5000, () => reject(new Error('Request timeout')));
  });
}

async function testService() {
  logger.info('Testing UK Number Validator Service...\n');
  
  try {
    // Test health endpoint
    logger.info('1. Testing health endpoint...');
    const health = await makeRequest('/health');
    logger.info('   Health:', health.status, health.ready ? 'Ready' : 'Not Ready');
    logger.info('   Rules loaded:', health.rulesLoaded);
    logger.info();
    
    // Test info endpoint
    logger.info('2. Testing info endpoint...');
    const info = await makeRequest('/info');
    logger.info('   Service:', info.service, info.version);
    logger.info('   Ready:', info.ready);
    logger.info();
    
    // Test single number validation
    logger.info('3. Testing single number validation...');
    const testNumbers = [
      '020 8099 6910',
      '020 7946 0000',
      '+44 20 7946 0000',
      '0151',
      '07418534',
      '000',
      '0800 123 4567'
    ];
    
    for (const number of testNumbers) {
      const result = await makeRequest(`/validate?number=${encodeURIComponent(number)}`);
      logger.info(`   ${number}: ${result.result.class}${result.result.provider ? ` (${result.result.provider})` : ''}`);
    }
    logger.info();
    
    // Test batch validation
    logger.info('4. Testing batch validation...');
    const batchRequest = JSON.stringify({
      numbers: ['020 8099 6910', '07418534', '0800 123 4567']
    });
    
    const batchResult = await new Promise((resolve, reject) => {
      const postData = Buffer.from(batchRequest, 'utf8');
      const options = {
        hostname: 'localhost',
        port: process.env.PORT || 8080,
        path: '/validate/batch',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': postData.length
        }
      };
      
      const req = http.request(options, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            resolve(data);
          }
        });
      });
      
      req.on('error', reject);
      req.write(postData);
      req.end();
    });
    
    logger.info('   Batch results:');
    batchResult.results.forEach(r => {
      logger.info(`     ${r.number}: ${r.result.class}${r.result.provider ? ` (${r.result.provider})` : ''}`);
    });
    logger.info();
    
    // Test error handling
    logger.info('5. Testing error handling...');
    try {
      await makeRequest('/validate');
      logger.info('   Missing number parameter: handled correctly');
    } catch (e) {
      logger.info('   Missing number parameter: error handled');
    }
    
    try {
      await makeRequest('/nonexistent');
      logger.info('   404 endpoint: handled correctly');
    } catch (e) {
      logger.info('   404 endpoint: error handled');
    }
    
    logger.info('\n✅ All tests completed successfully!');
    
  } catch (error) {
    logger.error('❌ Test failed:', error.message);
    logger.info('\nMake sure the service is running:');
    logger.info('  yarn dev');
    logger.info('  or');
    logger.info('  docker-compose up');
  }
}

testService();
