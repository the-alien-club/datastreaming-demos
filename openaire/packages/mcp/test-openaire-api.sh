#!/bin/bash

echo "Testing OpenAIRE Search API directly..."
echo ""

# Test 1: Basic search
echo "Test 1: Searching for 'machine learning' publications..."
curl -s "https://api.openaire.eu/search/publications?search=machine%20learning&pageSize=3&format=json" | head -c 1000
echo ""
echo ""

# Test 2: Search with open access filter
echo "Test 2: Searching for 'quantum computing' with open access..."
curl -s "https://api.openaire.eu/search/publications?search=quantum%20computing&openAccess=true&pageSize=3&format=json" | head -c 1000
echo ""
echo ""

# Test 3: Search all research products
echo "Test 3: Searching all research products for 'climate change'..."
curl -s "https://api.openaire.eu/search/researchProducts?search=climate%20change&pageSize=3&format=json" | head -c 1000
echo ""
echo ""

echo "OpenAIRE API tests completed!"
