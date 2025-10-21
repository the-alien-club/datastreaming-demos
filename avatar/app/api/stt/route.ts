import { NextRequest, NextResponse } from "next/server";

const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;

export async function POST(request: NextRequest) {
  try {
    if (!ELEVENLABS_API_KEY) {
      return NextResponse.json(
        { error: "ElevenLabs API key not configured" },
        { status: 500 }
      );
    }

    const formData = await request.formData();
    const audioFile = formData.get("audio") as Blob;

    if (!audioFile) {
      return NextResponse.json(
        { error: "No audio file provided" },
        { status: 400 }
      );
    }

    console.log("Received audio file:", audioFile.type, audioFile.size, "bytes");

    // Convert to format 11Labs expects
    const audioBuffer = await audioFile.arrayBuffer();

    // Determine file extension based on MIME type
    let filename = "recording.webm";
    let mimeType = audioFile.type || "audio/webm";

    if (mimeType.includes("mp4")) {
      filename = "recording.mp4";
    } else if (mimeType.includes("mpeg") || mimeType.includes("mp3")) {
      filename = "recording.mp3";
    } else if (mimeType.includes("wav")) {
      filename = "recording.wav";
    }

    const audioBlob = new Blob([audioBuffer], { type: mimeType });

    // Create form data for 11Labs with proper file structure
    // Note: 11Labs expects the parameter name to be "file" not "audio"
    const elevenLabsFormData = new FormData();
    elevenLabsFormData.append("file", audioBlob, filename);
    elevenLabsFormData.append("model_id", "scribe_v1");

    console.log("Sending to 11Labs:", filename, mimeType, audioBlob.size, "bytes");

    // Call 11Labs Speech-to-Text API
    const response = await fetch(
      "https://api.elevenlabs.io/v1/speech-to-text",
      {
        method: "POST",
        headers: {
          "xi-api-key": ELEVENLABS_API_KEY,
        },
        body: elevenLabsFormData,
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error("ElevenLabs API error:", response.status, errorText);
      return NextResponse.json(
        { error: `Speech-to-text conversion failed: ${errorText}` },
        { status: response.status }
      );
    }

    const data = await response.json();
    console.log("11Labs STT response:", data);

    // 11Labs returns the transcription directly as text or in a text field
    const transcribedText = data.text || data;

    return NextResponse.json({ text: transcribedText });
  } catch (error) {
    console.error("STT error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
