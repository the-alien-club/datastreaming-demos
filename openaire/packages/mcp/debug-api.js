#!/usr/bin/env node

/**
 * Quick debug script to test different OpenAIRE API parameter combinations
 */

async function testEndpoint(description, url) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(description);
  console.log(`URL: ${url}`);
  console.log(`${'='.repeat(60)}`);

  try {
    const response = await fetch(url);
    const data = await response.json();

    if (data.status === 'error') {
      console.log('❌ Error:', data.message);
      if (data.exception) {
        console.log('   Exception:', data.exception.substring(0, 200));
      }
    } else if (data.response) {
      console.log('✅ Success!');
      console.log('   Total results:', data.response.header.total?.$ || data.response.header.total);
      console.log('   Returned:', data.response.results?.record?.length || 0);
    }
  } catch (error) {
    console.log('❌ Request failed:', error.message);
  }
}

async function main() {
  console.log('🔍 Testing OpenAIRE API Parameter Combinations\n');

  // Test different parameter combinations
  await testEndpoint(
    'Test 1: keywords parameter',
    'https://api.openaire.eu/search/publications?keywords=machine%20learning&size=2&format=json'
  );

  await testEndpoint(
    'Test 2: title parameter',
    'https://api.openaire.eu/search/publications?title=machine%20learning&size=2&format=json'
  );

  await testEndpoint(
    'Test 3: author parameter',
    'https://api.openaire.eu/search/publications?author=einstein&size=2&format=json'
  );

  await testEndpoint(
    'Test 4: doi parameter',
    'https://api.openaire.eu/search/publications?doi=10.1038&size=2&format=json'
  );

  await testEndpoint(
    'Test 5: Multiple keywords with AND',
    'https://api.openaire.eu/search/publications?keywords=quantum%20AND%20computing&size=2&format=json'
  );

  await testEndpoint(
    'Test 6: title + OA filter',
    'https://api.openaire.eu/search/publications?title=climate%20change&OA=true&size=2&format=json'
  );

  console.log('\n✅ Tests completed!');
}

main().catch(console.error);
