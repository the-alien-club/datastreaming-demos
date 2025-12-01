#!/usr/bin/env tsx
/**
 * Test the new build_subgraph_from_dois tool
 */

import { handleBuildSubgraphFromDois } from './src/tools/subgraph.js';

async function testSubgraph() {
  console.log('🧪 Testing build_subgraph_from_dois tool\n');

  // Test with some real Nature/Science papers
  const testDois = [
    '10.1038/nature12373',  // CRISPR paper
    '10.1126/science.1248469', // Related paper
    '10.1038/nbt.2647',     // Another related paper
  ];

  console.log('📋 Input DOIs:');
  testDois.forEach((doi, i) => console.log(`  ${i + 1}. ${doi}`));

  console.log('\n🔍 Building subgraph...\n');

  try {
    const response = await handleBuildSubgraphFromDois({
      dois: testDois,
      fetchMetadata: true,
      includeRelationTypes: ['Cites', 'IsCitedBy', 'References', 'IsReferencedBy']
    });

    const result = JSON.parse(response);

    if (result.success) {
      console.log('✅ Subgraph built successfully!\n');
      console.log('📊 Statistics:');
      console.log(`  Total nodes: ${result.data.statistics.totalNodes}`);
      console.log(`  Total edges: ${result.data.statistics.totalEdges}`);
      console.log(`  Isolated nodes: ${result.data.statistics.isolatedNodes}`);
      console.log(`  Connected nodes: ${result.data.statistics.totalNodes - result.data.statistics.isolatedNodes}`);

      console.log('\n🔗 Relationship types found:');
      for (const [type, count] of Object.entries(result.data.statistics.relationshipTypes)) {
        console.log(`  ${type}: ${count}`);
      }

      if (result.data.nodes.length > 0) {
        console.log('\n📄 Nodes:');
        result.data.nodes.forEach((node: any, i: number) => {
          console.log(`  ${i + 1}. [${node.id}]`);
          if (node.title) {
            console.log(`     Title: ${node.title.substring(0, 80)}${node.title.length > 80 ? '...' : ''}`);
          }
          if (node.authors && node.authors.length > 0) {
            console.log(`     Authors: ${node.authors.slice(0, 3).map((a: any) => a.name).join(', ')}`);
          }
        });
      }

      if (result.data.edges.length > 0) {
        console.log('\n🔗 Edges (internal relationships):');
        result.data.edges.forEach((edge: any, i: number) => {
          console.log(`  ${i + 1}. ${edge.source} --[${edge.relationType}]--> ${edge.target}`);
        });
      } else {
        console.log('\n⚠️  No internal relationships found between these papers');
        console.log('   (Papers may not cite each other or relationships not in ScholeXplorer)');
      }

      console.log('\n🎉 Test completed successfully!');
    } else {
      console.error('❌ Tool returned error:', result.error);
    }
  } catch (error) {
    console.error('❌ Test failed:', error);
    process.exit(1);
  }
}

testSubgraph();
