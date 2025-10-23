import { NextRequest, NextResponse } from "next/server";
import { runAvatarFlow } from "@/lib/flows/avatar";

const BACKEND_URL = process.env.BACKEND_API_URL || "http://localhost:3333";
const BACKEND_TOKEN = process.env.BACKEND_API_TOKEN || "";

interface SSEMessage {
  type: "init" | "update" | "done";
  status: string;
  result?: any;
}

async function streamJob(jobId: number): Promise<any> {
  const streamUrl = `${BACKEND_URL}/jobs/${jobId}/stream`;

  console.log(`[Chat API] Streaming job ${jobId} from ${streamUrl}`);

  const response = await fetch(streamUrl, {
    headers: {
      Authorization: `Bearer ${BACKEND_TOKEN}`,
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to stream job: ${response.statusText}`);
  }

  const reader = response.body?.getReader();
  const decoder = new TextDecoder();

  if (!reader) throw new Error("No response body");

  let buffer = "";
  let finalResult: any = null;

  while (true) {
    const { done, value } = await reader.read();

    if (done) break;

    buffer += decoder.decode(value, { stream: true });

    // Process complete SSE messages (separated by \n\n)
    const messages = buffer.split("\n\n");
    buffer = messages.pop() || ""; // Keep incomplete message in buffer

    for (const message of messages) {
      if (!message.trim()) continue;

      // Parse SSE format: "data: {...}\n"
      const dataMatch = message.match(/^data: (.+)$/m);
      if (!dataMatch) continue;

      try {
        const data: SSEMessage = JSON.parse(dataMatch[1]);
        console.log(`[Chat API] SSE event: ${data.type}, status: ${data.status}`);

        if (data.type === "done") {
          finalResult = data.result;
          console.log("[Chat API] Job completed with status:", data.status);

          // Log full result if failed
          if (data.status === "failed") {
            console.error("[Chat API] Job failed! Full result:", JSON.stringify(data.result, null, 2));
          }
          break;
        }
      } catch (error) {
        console.error("Failed to parse SSE message:", error);
      }
    }

    if (finalResult) break;
  }

  return finalResult;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const {
      userMessage,
      chatHistory,
      personaContext,
      datasetId,
      searchDatasetIds,
      llmModel,
      voiceModel,
      maxTokens,
      temperature,
      searchK,
    } = body;

    console.log("[Chat API] Request params:", {
      userMessage,
      datasetId,
      searchDatasetIds,
      llmModel,
      voiceModel,
      maxTokens,
      temperature,
      searchK,
    });

    if (!userMessage || !personaContext || !datasetId) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    // Filter chat history to ensure no null/empty content
    const cleanedChatHistory = (chatHistory || []).filter(
      (msg: any) => msg.content && typeof msg.content === "string" && msg.content.trim().length > 0
    );

    console.log("[Chat API] Cleaned chat history length:", cleanedChatHistory.length);

    // Call the avatar flow to start the job
    const jobResponse = await runAvatarFlow({
      userMessage,
      chatHistory: cleanedChatHistory,
      personaContext,
      datasetId,
      searchDatasetIds: searchDatasetIds || null,
      llmModel: llmModel || "gemini-2.5-flash",
      voiceModel: voiceModel || "eleven_turbo_v2_5",
      maxTokens: maxTokens || 300,
      temperature: temperature !== undefined ? temperature : 0.7,
      searchK: searchK || 5,
    });

    console.log("[Chat API] Sending to backend with settings:", {
      llmModel: llmModel || "gemini-2.5-flash",
      voiceModel: voiceModel || "eleven_turbo_v2_5",
      maxTokens: maxTokens || 300,
      temperature: temperature !== undefined ? temperature : 0.7,
      searchK: searchK || 5,
    });

    console.log("Job created:", jobResponse);

    if (!jobResponse.success || !jobResponse.data?.id) {
      throw new Error("Failed to create job");
    }

    // Stream the job until completion
    const result = await streamJob(jobResponse.data.id);

    if (!result) {
      throw new Error("Job failed - no result returned. Check server logs for details.");
    }

    console.log("Final result:", JSON.stringify(result, null, 2));

    // Parse the avatar result from results.avatar[0]
    const avatarResult = result?.results?.avatar?.[0];
    console.log("Avatar result:", JSON.stringify(avatarResult, null, 2));

    if (!avatarResult) {
      throw new Error("No avatar result found in response. Job may have failed.");
    }

    // Return in expected format (using correct field names from backend)
    return NextResponse.json({
      output: {
        text: avatarResult.text_response || "",
        audio: avatarResult.audio_base64 || null,
      },
    });
  } catch (error) {
    console.error("Chat API error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}
