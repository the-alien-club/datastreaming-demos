import React from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ChartLine } from "lucide-react";
import { ChartRenderer } from "@/components/ChartRenderer";
import type { Message } from "@/types/research";

interface VisualizationsPanelProps {
  messages: Message[];
}

export function VisualizationsPanel({ messages }: VisualizationsPanelProps) {
  const charts = messages.flatMap((m) => m.charts || []);
  const hasCharts = charts.length > 0;

  console.log('[VisualizationsPanel] Messages:', messages.length);
  console.log('[VisualizationsPanel] Charts:', charts.length);
  if (hasCharts) {
    console.log('[VisualizationsPanel] Chart types:', charts.map(c => c.chartType));
    charts.forEach((chart, idx) => {
      if (chart.chartType === 'network') {
        console.log(`[VisualizationsPanel] Network chart ${idx}:`, {
          hasNetworkData: !!chart.networkData,
          nodeCount: chart.networkData?.nodes?.length,
          edgeCount: chart.networkData?.edges?.length
        });
      }
    });
  }

  if (!hasCharts) {
    return (
      <Card className="flex-1 flex flex-col h-full overflow-hidden">
        <CardContent className="flex-1 flex flex-col items-center justify-center">
          <div className="flex flex-col items-center gap-4 text-center">
            <ChartLine className="w-12 h-12 text-muted-foreground" />
            <div className="space-y-2">
              <CardTitle className="text-lg">Research Analytics</CardTitle>
              <CardDescription className="text-base">
                Visualizations will appear here when you search
              </CardDescription>
              <div className="flex flex-wrap justify-center gap-2 mt-4">
                <Badge variant="outline">Publication Trends</Badge>
                <Badge variant="outline">Citation Analysis</Badge>
                <Badge variant="outline">Open Access Stats</Badge>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="flex-1 flex flex-col h-full overflow-hidden">
      <CardHeader className="py-3 px-4 shrink-0">
        <CardTitle className="text-lg flex items-center gap-2">
          <ChartLine className="w-5 h-5" />
          Research Analytics
        </CardTitle>
      </CardHeader>
      <CardContent className="flex-1 overflow-y-auto min-h-0 snap-y snap-mandatory">
        <div className="min-h-full flex flex-col">
          {messages
            .flatMap((m) => m.charts || [])
            .map((chart, index) => (
              <div
                key={`chart-${index}`}
                className="w-full min-h-full flex-shrink-0 snap-start snap-always"
              >
                <div className="w-full h-full p-6 flex flex-col">
                  <div className="w-[90%] flex-1 mx-auto">
                    <ChartRenderer data={chart} />
                  </div>
                </div>
              </div>
            ))}
        </div>
      </CardContent>
    </Card>
  );
}
