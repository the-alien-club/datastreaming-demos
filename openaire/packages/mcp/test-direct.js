#!/usr/bin/env node

/**
 * Direct test of OpenAIRE client without MCP layer
 */

import { OpenAIREClient } from './dist/api/openaire-client.js';

async function main() {
  console.log('🔍 Testing OpenAIRE Client Directly\n');

  const client = new OpenAIREClient();

  try {
    console.log('Test 1: Search for machine learning papers');
    const results = await client.searchResearchProducts({
      query: 'machine learning',
      limit: 3,
    });

    console.log(`✅ Success! Found ${results.total} results`);
    console.log(`Returned ${results.results.length} papers:\n`);

    results.results.forEach((paper, i) => {
      console.log(`${i + 1}. ${paper.title}`);
      console.log(`   Authors: ${paper.authors.slice(0, 3).map(a => a.name).join(', ')}`);
      console.log(`   Year: ${paper.publicationDate?.substring(0, 4)}`);
      console.log(`   DOI: ${paper.doi || 'N/A'}`);
      console.log(`   Open Access: ${paper.openAccessColor || 'No'}`);
      console.log();
    });

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    if (error.stack) {
      console.error('Stack:', error.stack);
    }
    process.exit(1);
  }

  console.log('✅ All tests passed!');
}

main();
