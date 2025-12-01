// Poll for job status and progress
import { NextRequest } from 'next/server';
import { jobStore } from '@/lib/job-store';

export const runtime = 'nodejs';

export async function GET(
  req: NextRequest,
  { params }: { params: { jobId: string } }
) {
  try {
    const { jobId } = params;
    const job = jobStore.get(jobId);

    if (!job) {
      const stats = jobStore.getStats();
      console.log(`Job not found. Store stats:`, stats);
      return new Response(
        JSON.stringify({ error: 'Job not found', jobId, storeStats: stats }),
        { status: 404 }
      );
    }

    return new Response(
      JSON.stringify(job),
      {
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache',
        },
      }
    );
  } catch (error) {
    console.error('Status endpoint error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown' }),
      { status: 500 }
    );
  }
}
