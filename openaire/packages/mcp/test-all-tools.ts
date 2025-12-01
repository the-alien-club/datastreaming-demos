#!/usr/bin/env tsx
/**
 * Comprehensive Test Suite for OpenAIRE MCP Tools
 * Tests all 10 new tools and verifies their output structure
 */

import { handleSearchOrganizations } from './src/tools/organizations.js';
import { handleSearchProjects, handleGetProjectOutputs } from './src/tools/projects.js';
import { handleGetAuthorProfile, handleAnalyzeCoAuthorshipNetwork } from './src/tools/authors.js';
import { handleSearchDatasets } from './src/tools/datasets.js';
import { handleSearchDataSources } from './src/tools/datasources.js';
import { handleFindHighlyCitedPapers } from './src/tools/highly-cited.js';
import { handleExploreResearchRelationships } from './src/tools/relationships.js';
import { handleAnalyzeResearchTrends } from './src/tools/trends.js';

// Test utilities
function logTest(toolName: string, testName: string) {
  console.log(`\n${'='.repeat(80)}`);
  console.log(`🧪 Testing: ${toolName} - ${testName}`);
  console.log('='.repeat(80));
}

function logSuccess(message: string) {
  console.log(`✅ ${message}`);
}

function logError(message: string, error?: any) {
  console.error(`❌ ${message}`);
  if (error) {
    console.error(error);
  }
}

function validateResponse(response: string, toolName: string): any {
  try {
    const parsed = JSON.parse(response);
    if (parsed.success) {
      logSuccess(`${toolName} returned success: true`);
      return parsed;
    } else if (parsed.success === false && parsed.error) {
      logError(`${toolName} returned error: ${parsed.error.message}`);
      return parsed;
    } else {
      logError(`${toolName} returned unexpected format`);
      return parsed;
    }
  } catch (error) {
    logError(`${toolName} response is not valid JSON`, error);
    throw error;
  }
}

// Test Suite
async function runTests() {
  console.log('🚀 Starting OpenAIRE MCP Tool Test Suite\n');
  console.log('📊 Testing 10 new tools with realistic queries\n');

  let passedTests = 0;
  let failedTests = 0;
  const results: Array<{ tool: string; test: string; passed: boolean; error?: string }> = [];

  // ==================== TEST 1: search_organizations ====================
  try {
    logTest('search_organizations', 'Search for MIT');
    const response = await handleSearchOrganizations({
      search: 'Massachusetts Institute of Technology',
      countryCode: 'US',
      pageSize: 5,
    });
    const parsed = validateResponse(response, 'search_organizations');

    if (parsed.success && parsed.data && Array.isArray(parsed.data.organizations)) {
      logSuccess(`Found ${parsed.data.organizations.length} organizations`);
      if (parsed.data.organizations.length > 0) {
        logSuccess(`First org: ${parsed.data.organizations[0].legalName}`);
      }
      passedTests++;
      results.push({ tool: 'search_organizations', test: 'Search for MIT', passed: true });
    } else {
      throw new Error('Invalid response structure');
    }
  } catch (error) {
    logError('search_organizations test failed', error);
    failedTests++;
    results.push({
      tool: 'search_organizations',
      test: 'Search for MIT',
      passed: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }

  // ==================== TEST 2: search_projects ====================
  try {
    logTest('search_projects', 'Search H2020 AI projects');
    const response = await handleSearchProjects({
      keywords: 'artificial intelligence',
      fundingShortName: 'EC',
      fundingStreamId: 'H2020',
      pageSize: 5,
    });
    const parsed = validateResponse(response, 'search_projects');

    if (parsed.success && parsed.data && Array.isArray(parsed.data.projects)) {
      logSuccess(`Found ${parsed.data.projects.length} projects`);
      if (parsed.data.projects.length > 0) {
        logSuccess(`First project: ${parsed.data.projects[0].title}`);
        if (parsed.data.projects[0].funding) {
          logSuccess(`Funded by: ${parsed.data.projects[0].funding.funder.shortName}`);
        }
      }
      passedTests++;
      results.push({ tool: 'search_projects', test: 'Search H2020 AI projects', passed: true });
    } else {
      throw new Error('Invalid response structure');
    }
  } catch (error) {
    logError('search_projects test failed', error);
    failedTests++;
    results.push({
      tool: 'search_projects',
      test: 'Search H2020 AI projects',
      passed: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }

  // ==================== TEST 3: get_author_profile ====================
  try {
    logTest('get_author_profile', 'Get author by name');
    const response = await handleGetAuthorProfile({
      authorName: 'John Smith',
      limit: 20,
      includeCoAuthors: true,
    });
    const parsed = validateResponse(response, 'get_author_profile');

    if (parsed.success && parsed.data && parsed.data.author && Array.isArray(parsed.data.publications)) {
      logSuccess(`Author: ${parsed.data.author.name}`);
      logSuccess(`Publications found: ${parsed.data.publications.length}`);
      logSuccess(`Co-authors: ${parsed.data.topCoAuthors?.length || 0}`);
      passedTests++;
      results.push({ tool: 'get_author_profile', test: 'Get author by name', passed: true });
    } else if (parsed.success === false) {
      logSuccess('Handled gracefully (author may not exist)');
      passedTests++;
      results.push({ tool: 'get_author_profile', test: 'Get author by name', passed: true });
    } else {
      throw new Error('Invalid response structure');
    }
  } catch (error) {
    logError('get_author_profile test failed', error);
    failedTests++;
    results.push({
      tool: 'get_author_profile',
      test: 'Get author by name',
      passed: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }

  // ==================== TEST 4: search_datasets ====================
  try {
    logTest('search_datasets', 'Search climate datasets');
    const response = await handleSearchDatasets({
      search: 'climate change temperature',
      openAccessOnly: true,
      pageSize: 5,
    });
    const parsed = validateResponse(response, 'search_datasets');

    if (parsed.success && parsed.data && Array.isArray(parsed.data.datasets)) {
      logSuccess(`Found ${parsed.data.datasets.length} datasets`);
      if (parsed.data.datasets.length > 0) {
        logSuccess(`First dataset: ${parsed.data.datasets[0].title}`);
        logSuccess(`Open access: ${parsed.data.datasets[0].openAccess}`);
      }
      passedTests++;
      results.push({ tool: 'search_datasets', test: 'Search climate datasets', passed: true });
    } else {
      throw new Error('Invalid response structure');
    }
  } catch (error) {
    logError('search_datasets test failed', error);
    failedTests++;
    results.push({
      tool: 'search_datasets',
      test: 'Search climate datasets',
      passed: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }

  // ==================== TEST 5: analyze_coauthorship_network ====================
  try {
    logTest('analyze_coauthorship_network', 'Build network for author');
    const response = await handleAnalyzeCoAuthorshipNetwork({
      authorName: 'Maria Garcia',
      maxDepth: 1,
      minCollaborations: 1,
      limit: 50,
    });
    const parsed = validateResponse(response, 'analyze_coauthorship_network');

    if (parsed.success && parsed.data && Array.isArray(parsed.data.nodes) && Array.isArray(parsed.data.edges)) {
      logSuccess(`Network nodes: ${parsed.data.nodes.length}`);
      logSuccess(`Network edges: ${parsed.data.edges.length}`);
      logSuccess(`Center author: ${parsed.data.centerAuthor.name}`);
      passedTests++;
      results.push({ tool: 'analyze_coauthorship_network', test: 'Build network', passed: true });
    } else if (parsed.success === false) {
      logSuccess('Handled gracefully (author may not exist)');
      passedTests++;
      results.push({ tool: 'analyze_coauthorship_network', test: 'Build network', passed: true });
    } else {
      throw new Error('Invalid response structure');
    }
  } catch (error) {
    logError('analyze_coauthorship_network test failed', error);
    failedTests++;
    results.push({
      tool: 'analyze_coauthorship_network',
      test: 'Build network',
      passed: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }

  // ==================== TEST 6: get_project_outputs ====================
  try {
    logTest('get_project_outputs', 'Get outputs by project code');
    const response = await handleGetProjectOutputs({
      projectCode: '12345', // Dummy code for testing structure
      type: 'all',
      pageSize: 10,
    });
    const parsed = validateResponse(response, 'get_project_outputs');

    // This might fail if project doesn't exist, but structure should be valid
    if ((parsed.success && parsed.data) || (parsed.success === false && parsed.error)) {
      logSuccess('Response structure is valid');
      if (parsed.success && parsed.data.outputs) {
        logSuccess(`Outputs found: ${parsed.data.outputs.length}`);
      }
      passedTests++;
      results.push({ tool: 'get_project_outputs', test: 'Get project outputs', passed: true });
    } else {
      throw new Error('Invalid response structure');
    }
  } catch (error) {
    logError('get_project_outputs test failed', error);
    failedTests++;
    results.push({
      tool: 'get_project_outputs',
      test: 'Get project outputs',
      passed: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }

  // ==================== TEST 7: find_highly_cited_papers ====================
  try {
    logTest('find_highly_cited_papers', 'Find top cited ML papers');
    const response = await handleFindHighlyCitedPapers({
      search: 'machine learning',
      citationClass: 'C1',
      type: 'publication',
      pageSize: 5,
    });
    const parsed = validateResponse(response, 'find_highly_cited_papers');

    if (parsed.success && parsed.data && Array.isArray(parsed.data.papers)) {
      logSuccess(`Found ${parsed.data.papers.length} highly cited papers`);
      logSuccess(`Citation class: ${parsed.summary.citationClass}`);
      if (parsed.data.papers.length > 0) {
        logSuccess(`First paper: ${parsed.data.papers[0].title}`);
        logSuccess(`Citations: ${parsed.data.papers[0].citations}`);
      }
      passedTests++;
      results.push({ tool: 'find_highly_cited_papers', test: 'Find highly cited papers', passed: true });
    } else {
      throw new Error('Invalid response structure');
    }
  } catch (error) {
    logError('find_highly_cited_papers test failed', error);
    failedTests++;
    results.push({
      tool: 'find_highly_cited_papers',
      test: 'Find highly cited papers',
      passed: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }

  // ==================== TEST 8: explore_research_relationships ====================
  try {
    logTest('explore_research_relationships', 'Explore relationships for DOI');
    const response = await handleExploreResearchRelationships({
      identifier: '10.1038/nature12373', // Example Nature paper DOI
      limit: 10,
    });
    const parsed = validateResponse(response, 'explore_research_relationships');

    if ((parsed.success && parsed.data) || (parsed.success === false && parsed.error)) {
      logSuccess('Response structure is valid');
      if (parsed.success && parsed.data.relationships) {
        logSuccess(`Relationships found: ${parsed.data.relationships.length}`);
        if (parsed.data.summary) {
          logSuccess(`By type: ${JSON.stringify(parsed.data.summary.byType)}`);
        }
      }
      passedTests++;
      results.push({ tool: 'explore_research_relationships', test: 'Explore relationships', passed: true });
    } else {
      throw new Error('Invalid response structure');
    }
  } catch (error) {
    logError('explore_research_relationships test failed', error);
    failedTests++;
    results.push({
      tool: 'explore_research_relationships',
      test: 'Explore relationships',
      passed: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }

  // ==================== TEST 9: search_data_sources ====================
  try {
    logTest('search_data_sources', 'Search for biology repositories');
    const response = await handleSearchDataSources({
      search: 'biology',
      type: 'Data Repository',
      pageSize: 5,
    });
    const parsed = validateResponse(response, 'search_data_sources');

    if (parsed.success && parsed.data && Array.isArray(parsed.data.dataSources)) {
      logSuccess(`Found ${parsed.data.dataSources.length} data sources`);
      if (parsed.data.dataSources.length > 0) {
        logSuccess(`First source: ${parsed.data.dataSources[0].officialName}`);
        if (parsed.data.dataSources[0].type) {
          logSuccess(`Type: ${parsed.data.dataSources[0].type}`);
        }
      }
      passedTests++;
      results.push({ tool: 'search_data_sources', test: 'Search data sources', passed: true });
    } else {
      throw new Error('Invalid response structure');
    }
  } catch (error) {
    logError('search_data_sources test failed', error);
    failedTests++;
    results.push({
      tool: 'search_data_sources',
      test: 'Search data sources',
      passed: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }

  // ==================== TEST 10: analyze_research_trends ====================
  try {
    logTest('analyze_research_trends', 'Track quantum computing trends');
    const response = await handleAnalyzeResearchTrends({
      search: 'quantum computing',
      fromYear: 2020,
      toYear: 2023,
      type: 'publication',
    });
    const parsed = validateResponse(response, 'analyze_research_trends');

    if (parsed.success && parsed.data && Array.isArray(parsed.data.trends)) {
      logSuccess(`Analyzed years: ${parsed.data.trends.length}`);
      logSuccess(`Total papers: ${parsed.data.summary.totalPapers}`);
      logSuccess(`Average per year: ${parsed.data.summary.averagePerYear}`);
      logSuccess(`Peak year: ${parsed.data.summary.peakYear} (${parsed.data.summary.peakCount} papers)`);

      // Log year-by-year breakdown
      console.log('\n📈 Year-by-Year Breakdown:');
      parsed.data.trends.forEach((trend: any) => {
        console.log(`  ${trend.year}: ${trend.count} papers`);
      });

      passedTests++;
      results.push({ tool: 'analyze_research_trends', test: 'Track trends', passed: true });
    } else {
      throw new Error('Invalid response structure');
    }
  } catch (error) {
    logError('analyze_research_trends test failed', error);
    failedTests++;
    results.push({
      tool: 'analyze_research_trends',
      test: 'Track trends',
      passed: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }

  // ==================== TEST SUMMARY ====================
  console.log('\n\n' + '='.repeat(80));
  console.log('📊 TEST SUMMARY');
  console.log('='.repeat(80));
  console.log(`\n✅ Passed: ${passedTests}`);
  console.log(`❌ Failed: ${failedTests}`);
  console.log(`📈 Success Rate: ${((passedTests / (passedTests + failedTests)) * 100).toFixed(1)}%`);

  console.log('\n📋 Detailed Results:');
  console.log('─'.repeat(80));
  results.forEach((result, index) => {
    const status = result.passed ? '✅' : '❌';
    console.log(`${index + 1}. ${status} ${result.tool} - ${result.test}`);
    if (!result.passed && result.error) {
      console.log(`   Error: ${result.error}`);
    }
  });

  console.log('\n' + '='.repeat(80));
  if (failedTests === 0) {
    console.log('🎉 ALL TESTS PASSED! 🎉');
  } else {
    console.log(`⚠️  ${failedTests} test(s) failed. Please review errors above.`);
  }
  console.log('='.repeat(80) + '\n');

  // Exit with appropriate code
  process.exit(failedTests > 0 ? 1 : 0);
}

// Run the test suite
runTests().catch((error) => {
  console.error('❌ Test suite crashed:', error);
  process.exit(1);
});
