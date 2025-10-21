"use client";

import { useState, useRef, useEffect, forwardRef, useImperativeHandle } from "react";
import { Button } from "@/components/ui/button";
import { Mic, Loader2 } from "lucide-react";

interface VoiceRecorderProps {
  onTranscript: (text: string) => void;
  disabled?: boolean;
}

export interface VoiceRecorderHandle {
  startRecording: () => void;
  stopRecording: () => void;
}

export const VoiceRecorder = forwardRef<VoiceRecorderHandle, VoiceRecorderProps>(
  function VoiceRecorder({ onTranscript, disabled }, ref) {
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0);
  const [silenceCountdown, setSilenceCountdown] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const silenceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const silenceStartTimeRef = useRef<number>(0);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const isSpeakingRef = useRef<boolean>(false);
  const isListeningRef = useRef<boolean>(false);

  // Expose startRecording and stopRecording to parent via ref
  useImperativeHandle(ref, () => ({
    startRecording,
    stopRecording,
  }));

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (silenceTimerRef.current) {
        clearTimeout(silenceTimerRef.current);
      }
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
    };
  }, []);

  const detectVoice = () => {
    if (!analyserRef.current) {
      console.error("Analyser not available");
      return;
    }

    const analyser = analyserRef.current;
    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    let frameCount = 0;

    console.log("Starting voice detection loop, bufferLength:", bufferLength);

    const checkAudio = () => {
      if (!isListeningRef.current) {
        console.log("Stopping voice detection - isListening is false");
        return;
      }

      analyser.getByteFrequencyData(dataArray);

      // Also try time domain data
      const timeDataArray = new Uint8Array(bufferLength);
      analyser.getByteTimeDomainData(timeDataArray);

      // Calculate average volume from frequency data
      const sum = dataArray.reduce((a, b) => a + b, 0);
      const average = sum / bufferLength;
      const max = Math.max(...dataArray);

      // Calculate RMS from time domain data
      const timeSum = timeDataArray.reduce((acc, val) => acc + Math.abs(val - 128), 0);
      const timeAverage = timeSum / bufferLength;

      const threshold = 15; // Adjust this value for sensitivity

      // Log every 30 frames (~every 0.5 seconds)
      if (frameCount % 30 === 0) {
        console.log("Audio stats - FreqAvg:", average.toFixed(2), "FreqMax:", max, "TimeAvg:", timeAverage.toFixed(2), "First 10 values:", Array.from(dataArray.slice(0, 10)));
      }
      frameCount++;

      // Use the higher of the two measurements
      const effectiveLevel = Math.max(average, timeAverage);

      // Update audio level for visualization
      setAudioLevel(Math.round(effectiveLevel));

      if (effectiveLevel > threshold) {
        // Voice detected
        if (!isSpeakingRef.current) {
          console.log("Voice detected, started speaking");
          isSpeakingRef.current = true;
          setIsSpeaking(true);
        }

        // Clear silence timer
        if (silenceTimerRef.current) {
          clearTimeout(silenceTimerRef.current);
          silenceTimerRef.current = null;
          silenceStartTimeRef.current = 0;
          setSilenceCountdown(0);
        }
      } else if (isSpeakingRef.current) {
        // Silence detected after speaking
        if (!silenceTimerRef.current) {
          silenceStartTimeRef.current = Date.now();
          silenceTimerRef.current = setTimeout(() => {
            console.log("Silence detected, stopping recording");
            stopRecording();
          }, 1500); // Stop after 1.5 seconds of silence
        } else {
          // Update countdown
          const elapsed = Date.now() - silenceStartTimeRef.current;
          const remaining = Math.max(0, 1.5 - elapsed / 1000);
          setSilenceCountdown(remaining);
        }
      }

      requestAnimationFrame(checkAudio);
    };

    checkAudio();
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      console.log("Stream active:", stream.active);
      console.log("Audio tracks:", stream.getAudioTracks().length);
      console.log("Track enabled:", stream.getAudioTracks()[0]?.enabled);

      // Set up audio analysis for voice detection
      const audioContext = new AudioContext();
      audioContextRef.current = audioContext;
      console.log("AudioContext state (before resume):", audioContext.state);

      // Resume AudioContext if suspended (required by browsers)
      if (audioContext.state === "suspended") {
        await audioContext.resume();
        console.log("AudioContext state (after resume):", audioContext.state);
      }

      const source = audioContext.createMediaStreamSource(stream);
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 2048; // Increased for better resolution
      analyser.smoothingTimeConstant = 0.8;
      analyserRef.current = analyser;
      source.connect(analyser);

      console.log("Analyser connected, fftSize:", analyser.fftSize);
      console.log("FrequencyBinCount:", analyser.frequencyBinCount);

      // Try to use a more compatible format
      let mimeType = "audio/webm;codecs=opus";
      if (!MediaRecorder.isTypeSupported(mimeType)) {
        mimeType = "audio/webm";
      }
      if (!MediaRecorder.isTypeSupported(mimeType)) {
        mimeType = "audio/mp4";
      }

      console.log("Using MIME type:", mimeType);

      const mediaRecorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(chunksRef.current, { type: mimeType });
        console.log("Audio blob created:", audioBlob.size, "bytes, type:", audioBlob.type);
        console.log("isSpeakingRef at onstop:", isSpeakingRef.current);

        // Only send if we actually recorded something (detected speech)
        if (isSpeakingRef.current && audioBlob.size > 0) {
          console.log("Sending audio to STT");
          await sendToSTT(audioBlob);
        } else {
          console.log("Not sending - no speech detected or empty blob");
        }

        // Reset the speaking flag after checking
        isSpeakingRef.current = false;

        stream.getTracks().forEach((track) => track.stop());
        if (audioContextRef.current) {
          audioContextRef.current.close();
        }
      };

      mediaRecorder.start();
      setIsListening(true);
      isListeningRef.current = true; // Set ref for detection loop
      setIsSpeaking(false);
      isSpeakingRef.current = false;
      setAudioLevel(0);
      setSilenceCountdown(0);

      // Start voice detection
      detectVoice();
    } catch (error) {
      console.error("Error starting recording:", error);
      alert("Could not access microphone. Please check permissions.");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isListeningRef.current) {
      console.log("Stopping recording, isSpeaking was:", isSpeakingRef.current);

      // Stop the recorder (this will trigger onstop event)
      mediaRecorderRef.current.stop();

      // Update UI state immediately
      setIsListening(false);
      isListeningRef.current = false;
      setIsSpeaking(false);
      setAudioLevel(0);
      setSilenceCountdown(0);
      silenceStartTimeRef.current = 0;

      // Clear silence timer
      if (silenceTimerRef.current) {
        clearTimeout(silenceTimerRef.current);
        silenceTimerRef.current = null;
      }

      // Note: Don't reset isSpeakingRef here - let onstop handler check it first
    }
  };

  const sendToSTT = async (audioBlob: Blob) => {
    setIsProcessing(true);
    try {
      const formData = new FormData();
      formData.append("audio", audioBlob);

      const response = await fetch("/api/stt", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json();
        console.error("STT API error:", response.status, errorData);
        throw new Error(`STT failed: ${errorData.error || "Unknown error"}`);
      }

      const data = await response.json();
      console.log("STT response:", data);
      onTranscript(data.text);
    } catch (error) {
      console.error("Error transcribing audio:", error);
      alert(`Could not transcribe audio: ${error instanceof Error ? error.message : "Please try again."}`);
    } finally {
      setIsProcessing(false);
    }
  };

  const threshold = 15;

  return (
    <div className="flex flex-col items-center gap-4 w-full max-w-lg">
      {/* Debug Info */}
      {isListening && (
        <div className="w-full bg-card border rounded-xl p-5 space-y-3 shadow-sm">
          <div className="flex justify-between items-center">
            <span className="text-sm font-medium text-muted-foreground">Audio Level</span>
            <span className={`text-sm font-bold tabular-nums ${audioLevel > threshold ? "text-green-500" : "text-muted-foreground"}`}>
              {audioLevel} / {threshold}
            </span>
          </div>
          <div className="w-full bg-muted/50 rounded-full h-3 overflow-hidden shadow-inner">
            <div
              className={`h-full transition-all duration-100 rounded-full ${
                audioLevel > threshold ? "bg-green-500 shadow-lg shadow-green-500/50" : "bg-muted-foreground/50"
              }`}
              style={{ width: `${Math.min(100, (audioLevel / 50) * 100)}%` }}
            />
          </div>
          <div className="flex justify-between items-center pt-2 border-t">
            <span className="text-sm font-medium text-muted-foreground">Status</span>
            <span className={`text-sm font-bold ${isSpeaking ? "text-green-500" : "text-yellow-500"}`}>
              {isSpeaking ? "VOICE DETECTED" : "WAITING"}
            </span>
          </div>
          {silenceCountdown > 0 && (
            <div className="flex justify-between items-center pt-2 border-t">
              <span className="text-sm font-medium text-muted-foreground">Auto-stop</span>
              <span className="text-sm font-bold text-red-500 tabular-nums">
                {silenceCountdown.toFixed(1)}s
              </span>
            </div>
          )}
        </div>
      )}

      {/* Mic Button */}
      <Button
        size="lg"
        onClick={isListening ? stopRecording : startRecording}
        disabled={disabled || isProcessing}
        className={`rounded-full h-20 w-20 shadow-lg transition-all duration-300 ${
          isSpeaking ? "bg-red-500 hover:bg-red-600 scale-110 shadow-red-500/50" : "shadow-primary/20"
        }`}
      >
        {isProcessing ? (
          <Loader2 className="h-8 w-8 animate-spin" />
        ) : (
          <Mic className="h-8 w-8" />
        )}
      </Button>

      {/* Status Text */}
      <div className="text-center min-h-[3rem] flex items-center justify-center">
        {isProcessing && (
          <p className="text-sm text-muted-foreground font-medium">Processing audio...</p>
        )}
        {isListening && !isProcessing && (
          <p className="text-base font-semibold">
            {isSpeaking ? "🎤 Listening..." : "👂 Start speaking..."}
          </p>
        )}
        {!isListening && !isProcessing && (
          <p className="text-sm text-muted-foreground">Click to start recording</p>
        )}
      </div>
    </div>
  );
});
