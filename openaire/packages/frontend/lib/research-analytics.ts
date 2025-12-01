// Research analytics utilities for generating charts from research data
import type { ChartData } from '@/types/chart';

export function generateResearchAnalytics(papers: any[]): ChartData[] {
  const charts: ChartData[] = [];
  if (!papers || papers.length === 0) return charts;

  const yearCounts: Record<string, number> = {};
  papers.forEach((paper) => {
    const year = new Date(paper.publicationDate).getFullYear();
    if (year >= 2015 && year <= 2025) {
      yearCounts[year] = (yearCounts[year] || 0) + 1;
    }
  });

  if (Object.keys(yearCounts).length > 1) {
    charts.push({
      chartType: 'line',
      config: {
        title: 'Publications by Year',
        description: 'Distribution of research outputs over time',
        xAxisKey: 'year',
      },
      data: Object.entries(yearCounts)
        .sort(([a], [b]) => parseInt(a) - parseInt(b))
        .map(([year, count]) => ({ year, publications: count })),
      chartConfig: {
        publications: { label: 'Publications', color: 'hsl(var(--chart-1))' },
      },
    });
  }

  const typeCounts: Record<string, number> = {};
  papers.forEach((paper) => {
    const type = paper.type || 'other';
    typeCounts[type] = (typeCounts[type] || 0) + 1;
  });

  charts.push({
    chartType: 'pie',
    config: {
      title: 'Research Product Types',
      description: 'Distribution by type',
      xAxisKey: 'segment',
      totalLabel: 'Total Products',
    },
    data: Object.entries(typeCounts).map(([type, count]) => ({
      segment: type.charAt(0).toUpperCase() + type.slice(1),
      value: count,
    })),
    chartConfig: Object.fromEntries(
      Object.keys(typeCounts).map((type, i) => [
        type,
        { label: type.charAt(0).toUpperCase() + type.slice(1), color: `hsl(var(--chart-${i + 1}))` },
      ])
    ),
  });

  const oaCounts = {
    openAccess: papers.filter((p) => p.openAccess).length,
    closed: papers.filter((p) => !p.openAccess).length,
  };

  if (oaCounts.openAccess > 0 || oaCounts.closed > 0) {
    charts.push({
      chartType: 'pie',
      config: {
        title: 'Open Access Distribution',
        description: 'Breakdown by access type',
        xAxisKey: 'segment',
        totalLabel: 'Total Papers',
      },
      data: [
        { segment: 'Open Access', value: oaCounts.openAccess },
        { segment: 'Closed Access', value: oaCounts.closed },
      ],
      chartConfig: {
        openAccess: { label: 'Open Access', color: 'hsl(142, 71%, 45%)' },
        closed: { label: 'Closed Access', color: 'hsl(0, 0%, 60%)' },
      },
    });
  }

  return charts;
}

// Generate network visualization charts from citation networks
export function generateNetworkCharts(citationNetworks: any[]): ChartData[] {
  const networkCharts: ChartData[] = [];

  console.log(`🎨 Generating network charts from ${citationNetworks.length} networks`);

  citationNetworks.forEach((network, index) => {
    if (network.nodes && network.nodes.length > 0) {
      const chart: ChartData = {
        chartType: 'network',
        config: {
          title: `Citation Network ${citationNetworks.length > 1 ? index + 1 : ''}`,
          description: `${network.nodes.length} papers, ${network.edges?.length || 0} citations`,
          footer: `Depth: ${network.metadata?.depth || 1} level${network.metadata?.depth > 1 ? 's' : ''}`
        },
        data: network.nodes,  // Nodes as data for compatibility
        chartConfig: {},
        networkData: {
          nodes: network.nodes,
          edges: network.edges || [],
          center: network.center,
          metadata: network.metadata || {
            totalNodes: network.nodes.length,
            totalEdges: network.edges?.length || 0,
            depth: 1,
            generatedAt: new Date().toISOString()
          }
        }
      };

      console.log(`📊 Network chart created:`, {
        chartType: chart.chartType,
        title: chart.config.title,
        nodeCount: chart.networkData?.nodes.length,
        edgeCount: chart.networkData?.edges.length
      });

      networkCharts.push(chart);
    }
  });

  console.log(`✅ Generated ${networkCharts.length} network charts`);

  return networkCharts;
}
