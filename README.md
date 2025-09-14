
# UK Number Validator (Ofcom-driven)

Authoritative UK number validation against Ofcom weekly numbering CSVs (S1, S3, S5, S7, S8, S9, S10).  
Outputs `NUMBER_VALID`, `NUMBER_INVALID`, or `NUMBER_TOO_SHORT` with optional provider information.

## Quick start

### As a Library
```bash
yarn install
yarn build:all           # cleans, downloads Ofcom CSVs, compiles TS, generates prefixes.json
yarn build:all:cache     # same as above but uses cached CSV files (faster for testing)
yarn test                # runs simple checks
yarn bundle              # creates build/uk-number-validator.tar.gz
```

### As a Service
```bash
yarn install
yarn build:all:cache     # build with cached data (faster)
yarn dev                 # start the HTTP service
```

### With Docker
```bash
docker-compose up        # builds and runs the service
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
curl "http://localhost:3000/validate?number=02079460000"

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
curl -X POST http://localhost:3000/validate/batch \
  -H "Content-Type: application/json" \
  -d '{"numbers": ["02079460000", "07418534", "08001234567"]}'

# Health check
curl http://localhost:3000/health
```

### Docker Deployment

```bash
# Build and run with Docker Compose
docker-compose up

# Or build manually
docker build -t uk-number-validator .
docker run -p 3000:3000 uk-number-validator
```

## Scripts

- `src/download.ts` – downloads Ofcom CSVs and emits `prefixes.json` (`{ prefix, totalLength, status, provider }[]`).
- `src/classifyUkNumber.ts` – builds an index and classifies numbers with provider information.
- `src/test/run-tests.ts` – minimal smoke tests; extend with your own cases.

## Caching

CSV files are automatically cached in the `data/` directory to speed up development and testing:
- Use `yarn download:cache` or `yarn build:all:cache` to use cached files only
- Use `--no-fetch` flag with the download script to suppress network requests

## Notes

- Both *Allocated* and *Free for allocation* ranges are treated as **structurally diallable**.  
  Statuses like *Unavailable*, *Closed*, or *Withdrawn* are treated as invalid.
- Short codes (S10) such as `116xxx`, `118xxx`, `100`, etc., are supported.
- Re-run `yarn build:all` weekly to pick up Ofcom updates.
