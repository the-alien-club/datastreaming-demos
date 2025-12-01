#!/usr/bin/env node

/**
 * Test script for MCP server
 * This simulates an MCP client making tool calls to the server
 */

import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Test cases
const tests = [
  {
    name: 'Search for machine learning papers',
    request: {
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: {
        name: 'search_research_products',
        arguments: {
          query: 'machine learning',
          limit: 3,
        },
      },
    },
  },
  {
    name: 'Search for open access quantum computing papers',
    request: {
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/call',
      params: {
        name: 'search_research_products',
        arguments: {
          query: 'quantum computing',
          openAccess: true,
          limit: 3,
        },
      },
    },
  },
  {
    name: 'List available tools',
    request: {
      jsonrpc: '2.0',
      id: 3,
      method: 'tools/list',
      params: {},
    },
  },
];

async function runTest(test) {
  return new Promise((resolve, reject) => {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`Test: ${test.name}`);
    console.log(`${'='.repeat(60)}\n`);

    const serverPath = join(__dirname, 'dist', 'index.js');
    const server = spawn('node', [serverPath], {
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let output = '';
    let errorOutput = '';
    let timeoutId;

    server.stdout.on('data', (data) => {
      output += data.toString();
    });

    server.stderr.on('data', (data) => {
      errorOutput += data.toString();
    });

    server.on('close', (code) => {
      clearTimeout(timeoutId);

      if (code !== 0 && code !== null) {
        console.error(`❌ Server exited with code ${code}`);
        if (errorOutput) {
          console.error('Error output:', errorOutput);
        }
        resolve({ success: false, error: `Exit code ${code}` });
        return;
      }

      // Parse JSONRPC responses (line-delimited)
      const lines = output.split('\n').filter((line) => line.trim());

      for (const line of lines) {
        try {
          const response = JSON.parse(line);

          if (response.result) {
            console.log('✅ Success!');
            console.log('Response preview:');

            // Pretty print first part of response
            const resultStr = JSON.stringify(response.result, null, 2);
            const preview = resultStr.length > 500
              ? resultStr.substring(0, 500) + '...\n[truncated]'
              : resultStr;
            console.log(preview);

            resolve({ success: true, response: response.result });
            return;
          } else if (response.error) {
            console.error('❌ Error response:', response.error);
            resolve({ success: false, error: response.error });
            return;
          }
        } catch (e) {
          // Skip non-JSON lines (logs, etc.)
        }
      }

      if (output.length === 0 && errorOutput.length > 0) {
        console.error('❌ No output, only errors:', errorOutput);
        resolve({ success: false, error: errorOutput });
      } else {
        console.warn('⚠️ No valid JSONRPC response found');
        console.log('Output:', output);
        resolve({ success: false, error: 'No valid response' });
      }
    });

    // Send request to server
    server.stdin.write(JSON.stringify(test.request) + '\n');
    server.stdin.end();

    // Timeout after 30 seconds
    timeoutId = setTimeout(() => {
      server.kill();
      console.error('❌ Test timeout');
      resolve({ success: false, error: 'Timeout' });
    }, 30000);
  });
}

async function main() {
  console.log('🚀 Testing OpenAIRE MCP Server\n');

  let passed = 0;
  let failed = 0;

  for (const test of tests) {
    const result = await runTest(test);
    if (result.success) {
      passed++;
    } else {
      failed++;
    }

    // Wait a bit between tests
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  console.log(`\n${'='.repeat(60)}`);
  console.log('Test Summary');
  console.log(`${'='.repeat(60)}`);
  console.log(`✅ Passed: ${passed}`);
  console.log(`❌ Failed: ${failed}`);
  console.log(`Total: ${tests.length}`);

  process.exit(failed > 0 ? 1 : 0);
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
