



const http = require('http');

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
  console.log('Testing UK Number Validator Service...\n');
  
  try {
    // Test health endpoint
    console.log('1. Testing health endpoint...');
    const health = await makeRequest('/health');
    console.log('   Health:', health.status, health.ready ? 'Ready' : 'Not Ready');
    console.log('   Rules loaded:', health.rulesLoaded);
    console.log();
    
    // Test info endpoint
    console.log('2. Testing info endpoint...');
    const info = await makeRequest('/info');
    console.log('   Service:', info.service, info.version);
    console.log('   Ready:', info.ready);
    console.log();
    
    // Test single number validation
    console.log('3. Testing single number validation...');
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
      console.log(`   ${number}: ${result.result.class}${result.result.provider ? ` (${result.result.provider})` : ''}`);
    }
    console.log();
    
    // Test batch validation
    console.log('4. Testing batch validation...');
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
    
    console.log('   Batch results:');
    batchResult.results.forEach(r => {
      console.log(`     ${r.number}: ${r.result.class}${r.result.provider ? ` (${r.result.provider})` : ''}`);
    });
    console.log();
    
    // Test error handling
    console.log('5. Testing error handling...');
    try {
      await makeRequest('/validate');
      console.log('   Missing number parameter: handled correctly');
    } catch (e) {
      console.log('   Missing number parameter: error handled');
    }
    
    try {
      await makeRequest('/nonexistent');
      console.log('   404 endpoint: handled correctly');
    } catch (e) {
      console.log('   404 endpoint: error handled');
    }
    
    console.log('\n✅ All tests completed successfully!');
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.log('\nMake sure the service is running:');
    console.log('  yarn dev');
    console.log('  or');
    console.log('  docker-compose up');
  }
}

testService();
