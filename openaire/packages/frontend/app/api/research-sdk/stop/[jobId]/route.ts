import { NextRequest } from 'next/server';
import { jobStore } from '@/lib/job-store';

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const { jobId } = await params;
  const job = jobStore.get(jobId);

  if (!job) {
    return new Response(
      JSON.stringify({ error: 'Job not found' }),
      { status: 404 }
    );
  }

  if (job.status === 'running' || job.status === 'pending') {
    jobStore.setStatus(jobId, 'complete');
    jobStore.addMessage(jobId, {
      type: 'complete',
      content: 'Research stopped by user.',
      timestamp: Date.now(),
    });
    console.log(`[${jobId}] Stopped by user`);
  }

  return new Response(
    JSON.stringify({ status: 'stopped' }),
    { headers: { 'Content-Type': 'application/json' } }
  );
}
