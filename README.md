# UK Number Validator

A library for validating UK phone numbers.

## Features

- Validates UK mobile and landline numbers
- Supports various UK number formats
- Lightweight and fast

## Installation

```bash
npm install uk-number-validator
```

## Usage

```javascript
const { validateUKNumber } = require('uk-number-validator');

// Validate a UK number
const isValid = validateUKNumber('+44 20 7946 0958');
console.log(isValid); // true
```

## License

MIT
