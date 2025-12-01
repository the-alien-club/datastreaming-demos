#!/usr/bin/env node
/**
 * Debug script to inspect raw OpenAIRE API response
 * This will show us what fields are actually available in the API response
 */

import fetch from 'node-fetch';

const BASE_URL = 'https://api.openaire.eu';

async function debugAPIResponse() {
  console.log('Fetching raw API response from OpenAIRE Graph API V2...\n');

  const url = `${BASE_URL}/graph/v2/researchProducts?search=quantum+computing&citationCountClass=C1&page=1&pageSize=1`;

  console.log(`URL: ${url}\n`);

  try {
    const response = await fetch(url);
    const data = await response.json();

    console.log('Response structure:');
    console.log('==================\n');
    console.log(`Total results: ${data.total}`);
    console.log(`Results in response: ${data.results?.length || 0}\n`);

    if (data.results && data.results.length > 0) {
      const paper = data.results[0];

      console.log('First paper keys:');
      console.log(Object.keys(paper).join(', '));
      console.log('\n');

      console.log('Paper structure (pretty printed):');
      console.log('='.repeat(80));
      console.log(JSON.stringify(paper, null, 2).substring(0, 3000));
      console.log('='.repeat(80));
      console.log('\n');

      // Check for indicator fields
      console.log('Looking for citation/metric fields:');
      console.log('-'.repeat(80));

      if (paper.indicators) {
        console.log('✓ paper.indicators exists');
        console.log('  Keys:', Object.keys(paper.indicators).join(', '));

        if (paper.indicators.bipIndicators) {
          console.log('  ✓ paper.indicators.bipIndicators exists');
          console.log('    Keys:', Object.keys(paper.indicators.bipIndicators).join(', '));
          console.log('    Values:', JSON.stringify(paper.indicators.bipIndicators, null, 2));
        } else {
          console.log('  ✗ paper.indicators.bipIndicators NOT FOUND');
        }
      } else if (paper.indicator) {
        console.log('✓ paper.indicator exists (singular)');
        console.log('  Keys:', Object.keys(paper.indicator).join(', '));

        if (paper.indicator.bipIndicators) {
          console.log('  ✓ paper.indicator.bipIndicators exists');
          console.log('    Keys:', Object.keys(paper.indicator.bipIndicators).join(', '));
          console.log('    Values:', JSON.stringify(paper.indicator.bipIndicators, null, 2));
        } else {
          console.log('  ✗ paper.indicator.bipIndicators NOT FOUND');
        }
      } else {
        console.log('✗ Neither paper.indicators nor paper.indicator exists');
      }

      console.log('\nSearching for any citation-related fields:');
      const searchForCitations = (obj, path = '') => {
        if (typeof obj !== 'object' || obj === null) return;

        for (const [key, value] of Object.entries(obj)) {
          const fullPath = path ? `${path}.${key}` : key;

          if (key.toLowerCase().includes('cit') ||
              key.toLowerCase().includes('bip') ||
              key.toLowerCase().includes('metric') ||
              key.toLowerCase().includes('indicator') ||
              key.toLowerCase().includes('influence') ||
              key.toLowerCase().includes('popularity') ||
              key.toLowerCase().includes('impulse')) {
            console.log(`  Found: ${fullPath} = ${JSON.stringify(value).substring(0, 200)}`);
          }

          if (typeof value === 'object' && value !== null && path.split('.').length < 4) {
            searchForCitations(value, fullPath);
          }
        }
      };

      searchForCitations(paper);
    }
  } catch (error) {
    console.error('Error:', error.message);
  }
}

debugAPIResponse();
