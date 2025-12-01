'use client';

import React, { useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { forceCollide } from 'd3-force';
import { ChartData } from '@/types/chart';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';

// Dynamically import ForceGraph2D to avoid SSR issues
const ForceGraph2D = dynamic(() => import('react-force-graph-2d'), {
  ssr: false,
  loading: () => <div className="flex items-center justify-center h-[600px]">Loading graph...</div>
});

interface CitationNetworkGraphProps {
  data: ChartData;
}

interface GraphNode {
  id: string;
  name: string;
  val: number;
  type: string;
  year: number;
  citations: number;
  level: number;
  openAccess: boolean;
  color: string;
  layer: number;
  fx?: number; // Fixed x position (optional)
  fy?: number; // Fixed y position (optional)
}

interface GraphLink {
  source: string;
  target: string;
  type: string;
  color: string;
}

export function CitationNetworkGraph({ data }: CitationNetworkGraphProps) {
  const graphRef = useRef<any>();
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });
  const containerRef = useRef<HTMLDivElement>(null);

  console.log('[CitationNetworkGraph] Component mounted/updated', {
    hasNetworkData: !!data.networkData,
    nodeCount: data.networkData?.nodes?.length,
    edgeCount: data.networkData?.edges?.length,
    title: data.config.title
  });

  // Update dimensions on resize
  useEffect(() => {
    const updateDimensions = () => {
      if (containerRef.current) {
        const width = containerRef.current.offsetWidth;
        const height = Math.min(600, window.innerHeight * 0.7);
        setDimensions({ width, height });
      }
    };

    updateDimensions();
    window.addEventListener('resize', updateDimensions);
    return () => window.removeEventListener('resize', updateDimensions);
  }, []);

  // Configure custom forces for better layer spreading
  useEffect(() => {
    if (graphRef.current) {
      // Increase charge (repulsion) force to spread nodes within layers
      graphRef.current.d3Force('charge')?.strength(-400);

      // Add collision force to prevent overlap
      graphRef.current.d3Force('collision', forceCollide().radius((node: any) => node.val + 15));

      // Weaker link force to allow more spreading
      graphRef.current.d3Force('link')?.distance(120);
    }
  }, [data.networkData]);

  if (!data.networkData) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{data.config.title}</CardTitle>
          <CardDescription>No network data available</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const { nodes, edges, center } = data.networkData;

  // Determine which papers cite vs are cited by the center
  const citingPapers = new Set<string>();
  const citedPapers = new Set<string>();

  edges.forEach((edge) => {
    if (edge.target === center) {
      citingPapers.add(edge.source); // Papers that cite the center
    } else if (edge.source === center) {
      citedPapers.add(edge.target); // Papers cited by the center
    }
  });

  // Color scheme based on node layer
  const getNodeColor = (nodeId: string): string => {
    if (nodeId === center) return '#ef4444'; // Red for center node
    if (citingPapers.has(nodeId)) return '#10b981'; // Green for papers citing center
    if (citedPapers.has(nodeId)) return '#3b82f6'; // Blue for papers cited by center
    return '#8b5cf6'; // Purple for second-degree
  };

  // Determine Y position for hierarchical layout
  const getNodeLayer = (nodeId: string): number => {
    if (nodeId === center) return 0; // Middle layer
    if (citingPapers.has(nodeId)) return -1; // Top layer (citing)
    if (citedPapers.has(nodeId)) return 1; // Bottom layer (cited)
    return 2; // Further layers
  };

  // Transform nodes for force graph
  const graphNodes: GraphNode[] = nodes.map((node) => ({
    id: node.id,
    name: node.title,
    val: Math.max(3, Math.log(node.citations + 1) * 1.5), // Smaller node size
    type: node.type,
    year: node.year,
    citations: node.citations,
    level: node.level,
    openAccess: node.openAccess,
    color: getNodeColor(node.id),
    layer: getNodeLayer(node.id) // Add layer info
  }));

  // Transform edges for force graph
  const graphLinks: GraphLink[] = edges.map((edge) => ({
    source: edge.source,
    target: edge.target,
    type: edge.type,
    color: edge.type === 'cites' ? '#94a3b8' : '#cbd5e1'
  }));

  const graphData = {
    nodes: graphNodes,
    links: graphLinks
  };

  return (
    <Card ref={containerRef}>
      <CardHeader>
        <CardTitle>{data.config.title}</CardTitle>
        <CardDescription>{data.config.description}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="relative" style={{ height: dimensions.height }}>
          <ForceGraph2D
            ref={graphRef}
            graphData={graphData}
            width={dimensions.width}
            height={dimensions.height}
            nodeLabel={(node: any) => `
              <div style="background: rgba(0,0,0,0.9); color: white; padding: 8px; border-radius: 4px; max-width: 300px;">
                <div style="font-weight: bold; margin-bottom: 4px;">${node.name}</div>
                <div style="font-size: 12px; opacity: 0.8;">
                  ${node.year} | ${node.type}<br/>
                  Citations: ${node.citations}<br/>
                  ${node.openAccess ? '🔓 Open Access' : '🔒 Closed Access'}
                </div>
              </div>
            `}
            nodeColor={(node: any) => node.color}
            nodeRelSize={3}
            nodeVal={(node: any) => node.val}
            linkColor={(link: any) => link.color}
            linkWidth={1.5}
            linkDirectionalArrowLength={3}
            linkDirectionalArrowRelPos={1}
            linkCurvature={0.25}
            enableNodeDrag={true}
            enableZoomInteraction={true}
            enablePanInteraction={true}
            cooldownTicks={200}
            d3VelocityDecay={0.2}
            d3AlphaDecay={0.02}
            // Hierarchical DAG layout: top-down, 3 layers
            dagMode="td"
            dagLevelDistance={200}
            onEngineStop={() => {
              // Zoom to fit after layout stabilizes
              if (graphRef.current) {
                graphRef.current.zoomToFit(400, 50);
              }
            }}
          />
        </div>

        {/* Legend */}
        <div className="mt-4 flex flex-wrap gap-4 text-sm">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-green-500"></div>
            <span>Citing papers (top layer)</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-red-500"></div>
            <span>Center paper (middle layer)</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-blue-500"></div>
            <span>Cited papers (bottom layer)</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-purple-500"></div>
            <span>Extended network</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">
              Hierarchical 3-layer layout | Node size = citation count | Drag to explore
            </span>
          </div>
        </div>
      </CardContent>
      {data.config.footer && (
        <CardFooter>
          <p className="text-sm text-muted-foreground">{data.config.footer}</p>
        </CardFooter>
      )}
    </Card>
  );
}
