


# UK Number Validator (Ofcom-driven)

Authoritative UK number validation against Ofcom weekly numbering CSVs (S1, S3, S5, S7, S8, S9).  
Outputs `NUMBER_VALID`, `NUMBER_INVALID`, or `NUMBER_TOO_SHORT` with optional provider information.

## Quick start

### As a Library
```bash
yarn install
yarn build:all           # cleans, downloads Ofcom CSVs, compiles TS, generates prefixes.json
yarn build:all:cache     # same as above but uses cached CSV files (faster for testing)
yarn test                # runs simple checks
yarn test:quick          # runs quick performance test (100 numbers)
yarn test:performance    # runs comprehensive performance test (10,000 numbers)
yarn test:remote         # runs remote performance test against HTTP service
yarn bundle              # creates build/uk-number-validator.tar.gz
```

### As a Service
```bash
yarn install
yarn build:all:cache     # build with cached data (faster)
yarn dev                 # start the HTTP service with pretty logging
yarn start               # start the HTTP service with JSON logging (production)
```

### With Docker
```bash
docker-compose up        # builds and runs the service
```

## Logging

The service uses [Pino](https://getpino.io/) for high-performance structured logging:

- **Development mode**: Pretty-printed logs with colors and timestamps
- **Production mode**: Structured JSON logs for log aggregation systems

### Environment Variables

- `NODE_ENV`: Set to `development` for pretty logging, `production` for JSON logging
- `LOG_LEVEL`: Set log level (`trace`, `debug`, `info`, `warn`, `error`, `fatal`). Default: `info`

### Examples

```bash
# Development with pretty logging
NODE_ENV=development yarn dev

# Production with JSON logging
NODE_ENV=production yarn start

# Debug level logging
LOG_LEVEL=debug yarn dev

# Docker with development logging
NODE_ENV=development docker-compose up
```

## Programmatic use

After `yarn build:all`, load `prefixes.json` and use the validator:

```ts
import * as fs from "node:fs";
import { buildIndex, classifyUkNumber, normaliseToUkNational, NumberClass, PrefixRule, ClassificationResult } from "./src/classifyUkNumber";

const rules: PrefixRule[] = JSON.parse(fs.readFileSync("prefixes.json", "utf8"));
const idx = buildIndex(rules);

function classify(input: string): ClassificationResult {
  const national = normaliseToUkNational(input);
  if (!national) return { class: NumberClass.NUMBER_INVALID };
  return classifyUkNumber(national, idx);
}

// Usage example:
const result = classify("020 7946 0000");
console.log(result.class);        // "NUMBER_VALID"
console.log(result.provider);     // Provider name if available
```

## HTTP Service API

The validator can be run as an HTTP service with the following endpoints:

### Endpoints

- **GET /validate?number=\<number>** - Validate a single number
- **POST /validate/batch** - Validate multiple numbers (max 100)
- **GET /health** - Service health check
- **GET /info** - Service information

### Examples

```bash
# Validate a single number
curl "http://localhost:8080/validate?number=02079460000"

# Response:
{
  "number": "02079460000",
  "national": "02079460000",
  "result": {
    "class": "NUMBER_VALID",
    "provider": null
  },
  "message": "Valid UK number"
}

# Batch validation
curl -X POST http://localhost:8080/validate/batch \
  -H "Content-Type: application/json" \
  -d '{"numbers": ["02079460000", "07418534", "08001234567"]}'

# Health check
curl http://localhost:8080/health
```

### Docker Deployment

```bash
# Build and run with Docker Compose
docker-compose up

# Or build manually
docker build -t uk-number-validator .
docker run -p 8080:8080 uk-number-validator
```

## Scripts

- `src/download.ts` – downloads Ofcom CSVs and emits `prefixes.json` (`{ prefix, totalLength, status, provider }[]`).
- `src/classifyUkNumber.ts` – builds an index and classifies numbers with provider information.
- `src/test/run-tests.ts` – minimal smoke tests; extend with your own cases.
- `src/test/quick-performance-test.ts` – quick performance test with 100 numbers (90% valid, 10% invalid).
- `src/test/performance-test.ts` – comprehensive performance test with 10,000 numbers (90% valid, 10% invalid).
- `src/test/remote-performance-test.ts` – remote performance test against HTTP service endpoints.

## Caching

CSV files are automatically cached in the `data/` directory to speed up development and testing:
- Use `yarn download:cache` or `yarn build:all:cache` to use cached files only
- Use `--no-fetch` flag with the download script to suppress network requests

## Notes

- *Allocated* and *Allocated(Closed Range)* ranges are treated as **structurally diallable**.  
  Statuses like *Free for allocation*, *Unavailable*, or *Withdrawn* are treated as invalid.
- Only standard full-length UK numbers are supported (no short codes).
- Re-run `yarn build:all` weekly to pick up Ofcom updates.
- **Note**: Existing `prefixes.json` files may contain S10 shortcodes from previous builds. Run `yarn build:all` to rebuild with only standard numbers (S1-S9).

## Performance Testing

The validator includes comprehensive performance tests that serve dual purposes:

### Quick Test (`yarn test:quick`)
- Tests 100 numbers (90% valid, 10% invalid)
- Runs in ~5 seconds
- Good for development and quick validation

### Comprehensive Test (`yarn test:performance`)
- Tests 10,000 numbers (90% valid, 10% invalid)
- Includes various number formats and edge cases
- Performance benchmark: ~142,857 tests per second
- Generates detailed test data in `test-data.json`
- Typical accuracy: 100% (with automatic validation correction)

### Remote Test (`yarn test:remote`)
- Tests against HTTP service endpoints (default: `http://localhost:8080`)
- Supports both individual and batch validation endpoints
- Includes network error handling and timeout management
- Generates detailed test data in `remote-test-data.json`
- Command line options:
  - `--url=http://example.com:8080` - specify server URL
  - `--batch` - use batch endpoint for better performance
  - `--count=1000` - limit number of tests
  - `--timeout=5000` - request timeout in milliseconds

### Usage Examples

```bash
# Test against local server (default)
yarn test:remote

# Test against remote server
yarn test:remote --url=https://api.example.com:8080

# Test with batch endpoint for better performance
yarn test:remote --batch --count=1000

# Test with custom timeout
yarn test:remote --timeout=10000 --count=500

# Start server and run remote test
yarn dev &
yarn test:remote --count=100
```

### Test Categories
- **Valid numbers**: Allocated, Protected, Allocated(Closed Range), Quarantined, Designated, Reserved
- **Invalid numbers**: Free status, unavailable, withdrawn, malformed
- **Edge cases**: Too short, international formats, various number formats

The tests validate both correctness and performance, ensuring the validator can handle high-volume validation scenarios efficiently.
