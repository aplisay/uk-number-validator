#!/bin/bash

# Performance test script for UK number validator
# Fetches http://localhost:3000/validate?number=02079460000 1000 times and times it

URL="http://localhost:${PORT:-8080}/validate?number=02079460000"
ITERATIONS=1000

echo "Starting performance test..."
echo "URL: $URL"
echo "Iterations: $ITERATIONS"
echo ""

# Check if curl is available
if ! command -v curl &> /dev/null; then
    echo "Error: curl is not installed"
    exit 1
fi

# Start timing
start_time=$(date +%s.%N)

echo "Running tests..."
success_count=0
error_count=0

for i in $(seq 1 $ITERATIONS); do
    # Make the request and capture the response
    response=$(curl -s -w "%{http_code}" -o /dev/null "$URL" 2>/dev/null)
    
    if [ "$response" = "200" ]; then
        ((success_count++))
    else
        ((error_count++))
        echo "Request $i failed with status: $response"
    fi
    
    # Progress indicator
    if [ $((i % 100)) -eq 0 ]; then
        echo "Completed $i/$ITERATIONS requests..."
    fi
done

# End timing
end_time=$(date +%s.%N)
duration=$(echo "$end_time - $start_time" | bc -l)

# Calculate statistics
success_rate=$(echo "scale=2; $success_count * 100 / $ITERATIONS" | bc -l)
requests_per_second=$(echo "scale=2; $ITERATIONS / $duration" | bc -l)

echo ""
echo "============================================================"
echo "PERFORMANCE TEST RESULTS"
echo "============================================================"
echo "Total Requests: $ITERATIONS"
echo "Successful Requests: $success_count"
echo "Failed Requests: $error_count"
echo "Success Rate: ${success_rate}%"
echo "Total Duration: ${duration}s"
echo "Requests Per Second: $requests_per_second"
echo "============================================================"
