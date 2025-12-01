#!/usr/bin/env node
/**
 * Test script to verify citation data extraction from OpenAIRE API
 *
 * This script tests that:
 * 1. Citation counts are extracted from Graph API V2 responses
 * 2. Quality metrics (influence, popularity, impulse) are populated
 * 3. Highly cited papers return real citation data, not zeros
 */

import { OpenAIREClient } from './dist/api/openaire-client.js';

const client = new OpenAIREClient();

console.log('='.repeat(80));
console.log('Testing Citation Data Extraction from OpenAIRE Graph API V2');
console.log('='.repeat(80));
console.log();

// Test 1: Search for highly cited quantum computing papers
async function testHighlyCitedSearch() {
  console.log('Test 1: Search for highly cited quantum computing papers (C1 class)');
  console.log('-'.repeat(80));

  try {
    const results = await client.searchResearchProducts({
      query: 'quantum computing',
      citationCountClass: ['C1'], // Top 0.01% most cited
      sortBy: 'citationCount DESC',
      pageSize: 5,
      useGraphV2: true, // Ensure we use Graph API V2
    });

    console.log(`Found ${results.total} papers in C1 class (top 0.01% most cited)`);
    console.log(`Returning top ${results.results.length} results:\n`);

    for (const paper of results.results) {
      console.log(`Title: ${paper.title.substring(0, 80)}...`);
      console.log(`  DOI: ${paper.doi || 'N/A'}`);
      console.log(`  Citations: ${paper.citations}`);
      console.log(`  Year: ${paper.publicationDate.substring(0, 4)}`);

      if (paper.metrics) {
        console.log(`  Metrics:`);
        console.log(`    - Influence: ${paper.metrics.influence}`);
        console.log(`    - Popularity: ${paper.metrics.popularity}`);
        console.log(`    - Impulse: ${paper.metrics.impulse}`);
      }
      console.log();
    }

    // Check if citations are actually populated
    const hasRealCitations = results.results.some(p => p.citations > 0);
    const hasMetrics = results.results.some(p => p.metrics !== undefined);

    console.log('Validation:');
    console.log(`  ✓ Papers with citations > 0: ${hasRealCitations ? 'YES' : 'NO (BUG!)'}`);
    console.log(`  ✓ Papers with metrics: ${hasMetrics ? 'YES' : 'NO'}`);
    console.log();

    return hasRealCitations;
  } catch (error) {
    console.error('Test 1 failed:', error.message);
    return false;
  }
}

// Test 2: Get a specific paper by DOI (if known to be highly cited)
async function testSpecificPaper() {
  console.log('Test 2: Get specific paper by DOI');
  console.log('-'.repeat(80));

  try {
    // First, get a DOI from search results
    const searchResults = await client.searchResearchProducts({
      query: 'quantum',
      citationCountClass: ['C1'],
      pageSize: 1,
      useGraphV2: true,
    });

    if (searchResults.results.length === 0 || !searchResults.results[0].doi) {
      console.log('No paper with DOI found in search results. Skipping test.');
      return true;
    }

    const doi = searchResults.results[0].doi;
    console.log(`Fetching paper with DOI: ${doi}\n`);

    const paper = await client.getResearchProduct(doi);

    console.log(`Title: ${paper.title}`);
    console.log(`Citations: ${paper.citations}`);
    console.log(`Year: ${paper.publicationDate.substring(0, 4)}`);

    if (paper.metrics) {
      console.log(`Metrics:`);
      console.log(`  - Influence: ${paper.metrics.influence}`);
      console.log(`  - Popularity: ${paper.metrics.popularity}`);
      console.log(`  - Impulse: ${paper.metrics.impulse}`);
    }
    console.log();

    const hasRealCitations = paper.citations > 0;
    console.log('Validation:');
    console.log(`  ✓ Citations > 0: ${hasRealCitations ? 'YES' : 'NO (BUG!)'}`);
    console.log(`  ✓ Has metrics: ${paper.metrics !== undefined ? 'YES' : 'NO'}`);
    console.log();

    return hasRealCitations;
  } catch (error) {
    console.error('Test 2 failed:', error.message);
    return false;
  }
}

// Test 3: Compare citation classes
async function testCitationClasses() {
  console.log('Test 3: Compare papers across citation classes');
  console.log('-'.repeat(80));

  try {
    const classes = ['C1', 'C2', 'C3'];
    const classNames = {
      'C1': 'top 0.01%',
      'C2': 'top 0.1%',
      'C3': 'top 1%',
    };

    for (const citClass of classes) {
      const results = await client.searchResearchProducts({
        query: 'machine learning',
        citationCountClass: [citClass],
        sortBy: 'citationCount DESC',
        pageSize: 3,
        useGraphV2: true,
      });

      console.log(`\nClass ${citClass} (${classNames[citClass]}):`);

      if (results.results.length > 0) {
        const avgCitations = results.results.reduce((sum, p) => sum + p.citations, 0) / results.results.length;
        const maxCitations = Math.max(...results.results.map(p => p.citations));
        const minCitations = Math.min(...results.results.map(p => p.citations));

        console.log(`  Total papers: ${results.total}`);
        console.log(`  Sample size: ${results.results.length}`);
        console.log(`  Citation range: ${minCitations} - ${maxCitations}`);
        console.log(`  Average citations: ${avgCitations.toFixed(1)}`);
      } else {
        console.log('  No results found');
      }
    }

    console.log();
    return true;
  } catch (error) {
    console.error('Test 3 failed:', error.message);
    return false;
  }
}

// Run all tests
async function runTests() {
  const test1Pass = await testHighlyCitedSearch();
  const test2Pass = await testSpecificPaper();
  const test3Pass = await testCitationClasses();

  console.log('='.repeat(80));
  console.log('TEST SUMMARY');
  console.log('='.repeat(80));
  console.log(`Test 1 (Highly cited search): ${test1Pass ? '✓ PASS' : '✗ FAIL'}`);
  console.log(`Test 2 (Specific paper DOI): ${test2Pass ? '✓ PASS' : '✗ FAIL'}`);
  console.log(`Test 3 (Citation classes): ${test3Pass ? '✓ PASS' : '✗ FAIL'}`);
  console.log();

  if (test1Pass && test2Pass && test3Pass) {
    console.log('🎉 All tests passed! Citation data extraction is working correctly.');
  } else {
    console.log('❌ Some tests failed. Citation data may not be extracted properly.');
  }
  console.log('='.repeat(80));
}

runTests().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
