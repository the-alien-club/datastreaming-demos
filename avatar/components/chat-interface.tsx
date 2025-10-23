"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { MessageList } from "./message-list";
import { VoiceRecorder, type VoiceRecorderHandle } from "./voice-recorder";
import { ConversationSidebar } from "./conversation-sidebar";
import { SettingsDialog, type AvatarSettings } from "./settings-dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Trash2, Pause, Play, Home } from "lucide-react";
import Link from "next/link";
import type { Message, Persona, ChatHistory, Conversation } from "@/lib/types";
import {
  getConversationsByPersona,
  getConversationMessages,
  saveConversationMessages,
  deleteConversation,
  createConversation,
} from "@/lib/storage";

interface ChatInterfaceProps {
  persona: Persona;
  conversationId: string;
}

export function ChatInterface({ persona, conversationId }: ChatInterfaceProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [autoRestart, setAutoRestart] = useState(true);

  // Default settings from persona
  const defaultSettings: AvatarSettings = {
    systemPrompt: persona.context,
    llmModel: "gemini-2.5-flash",
    voiceModel: "eleven_turbo_v2_5",
    maxTokens: 2048,
    temperature: 0.7,
    searchK: 20,
  };

  const [settings, setSettings] = useState<AvatarSettings>(defaultSettings);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const voiceRecorderRef = useRef<VoiceRecorderHandle>(null);
  const router = useRouter();

  // Load conversations list
  useEffect(() => {
    const convos = getConversationsByPersona(persona.id);
    setConversations(convos);
  }, [persona.id, conversationId]);

  // Load current conversation messages
  useEffect(() => {
    const saved = getConversationMessages(conversationId);
    setMessages(saved);
  }, [conversationId]);

  // Save conversation whenever messages change
  useEffect(() => {
    if (messages.length > 0) {
      saveConversationMessages(conversationId, messages, persona.id);
      // Refresh conversations list to update metadata
      setConversations(getConversationsByPersona(persona.id));
    }
  }, [messages, conversationId, persona.id]);

  const handleTranscript = async (text: string) => {
    // Add user message
    const userMessage: Message = {
      role: "user",
      content: text,
      timestamp: Date.now(),
    };
    setMessages((prev) => [...prev, userMessage]);

    // Prepare chat history for backend (filter out any messages with null/empty content)
    const chatHistory: ChatHistory[] = messages
      .filter((msg) => msg.content && msg.content.trim().length > 0)
      .map((msg) => ({
        role: msg.role,
        content: msg.content,
      }));

    // Call backend via API route
    setIsLoading(true);
    try {
      console.log("[ChatInterface] Sending request with:", {
        userMessage: text,
        datasetId: persona.datasetId,
        searchDatasetIds: persona.searchDatasetIds,
        personaName: persona.name,
      });

      const apiResponse = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          userMessage: text,
          chatHistory,
          personaContext: settings.systemPrompt,
          datasetId: persona.datasetId,
          searchDatasetIds: persona.searchDatasetIds,
          llmModel: settings.llmModel,
          voiceModel: settings.voiceModel,
          maxTokens: settings.maxTokens,
          temperature: settings.temperature,
          searchK: settings.searchK,
        }),
      });

      if (!apiResponse.ok) {
        const errorData = await apiResponse.json();
        throw new Error(errorData.error || "Failed to get response");
      }

      const response = await apiResponse.json();
      console.log("Chat API response:", response);

      // Add assistant message
      const assistantMessage: Message = {
        role: "assistant",
        content: response.output.text,
        timestamp: Date.now(),
        audioUrl: response.output.audio,
      };
      setMessages((prev) => [...prev, assistantMessage]);

      // Play audio if available
      if (response.output.audio) {
        playAudio(response.output.audio);
      }
    } catch (error) {
      console.error("Error sending message:", error);
      alert(`Failed to get response: ${error instanceof Error ? error.message : "Please try again."}`);
    } finally {
      setIsLoading(false);
    }
  };

  const playAudio = (audioData: string) => {
    try {
      setIsSpeaking(true);

      // Assume audioData is base64 encoded audio
      const audio = new Audio(`data:audio/mp3;base64,${audioData}`);
      audioRef.current = audio;

      audio.onended = () => {
        setIsSpeaking(false);
        console.log("Audio finished playing");

        // Only restart if auto-restart is enabled
        if (autoRestart) {
          console.log("Auto-restarting recording...");
          setTimeout(() => {
            voiceRecorderRef.current?.startRecording();
          }, 500);
        }
      };

      audio.onerror = () => {
        setIsSpeaking(false);
        console.error("Error playing audio");
      };

      audio.play();
    } catch (error) {
      console.error("Error playing audio:", error);
      setIsSpeaking(false);
    }
  };

  const handleNewConversation = () => {
    const newConv = createConversation(persona.id);
    router.push(`/chat/${persona.id}/${newConv.id}`);
  };

  const handleSelectConversation = (convId: string) => {
    router.push(`/chat/${persona.id}/${convId}`);
  };

  const handleDeleteConversation = (convId: string) => {
    deleteConversation(convId);
    setConversations(getConversationsByPersona(persona.id));

    // If we deleted the current conversation, create a new one
    if (convId === conversationId) {
      handleNewConversation();
    }
  };

  const handleClearChat = () => {
    if (confirm("Are you sure you want to clear this conversation?")) {
      deleteConversation(conversationId);
      setMessages([]);
      // Refresh conversations list
      setConversations(getConversationsByPersona(persona.id));
    }
  };

  return (
    <div className="flex flex-col h-screen max-w-5xl mx-auto overflow-hidden bg-background">
      {/* Header */}
      <div className="flex-shrink-0 border-b bg-card/50 backdrop-blur-sm p-5 flex items-center justify-between shadow-sm">
        {/* Left: Home Button */}
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            asChild
            title="Back to home"
          >
            <Link href="/">
              <Home className="h-4 w-4" />
            </Link>
          </Button>
        </div>

        {/* Center: Persona Name */}
        <div className="flex-1 flex justify-center">
          <div className="text-center">
            <h1 className="text-2xl font-bold tracking-tight">{persona.name}</h1>
            <div className="flex items-center justify-center gap-2 mt-1">
              {isSpeaking && (
                <div className="flex items-center gap-2">
                  <div className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
                  <p className="text-sm text-muted-foreground">Speaking...</p>
                </div>
              )}
              {!autoRestart && !isSpeaking && (
                <div className="flex items-center gap-2">
                  <div className="h-2 w-2 rounded-full bg-yellow-500" />
                  <p className="text-sm text-yellow-600">Paused</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right: Conversation, Settings, Pause, Clear Buttons */}
        <div className="flex items-center gap-2">
          <ConversationSidebar
            conversations={conversations}
            currentConversationId={conversationId}
            onSelectConversation={handleSelectConversation}
            onNewConversation={handleNewConversation}
            onDeleteConversation={handleDeleteConversation}
          />
          <SettingsDialog
            settings={settings}
            onSave={setSettings}
            defaultSettings={defaultSettings}
          />
          <Button
            variant="outline"
            size="icon"
            onClick={() => {
              setAutoRestart(!autoRestart);
              // If pausing, also stop current recording
              if (autoRestart) {
                voiceRecorderRef.current?.stopRecording();
                // Stop audio playback if playing
                if (audioRef.current) {
                  audioRef.current.pause();
                  audioRef.current.currentTime = 0;
                  setIsSpeaking(false);
                }
              }
            }}
            title={autoRestart ? "Pause conversation" : "Resume conversation"}
          >
            {autoRestart ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
          </Button>
          <Button
            variant="outline"
            size="icon"
            onClick={handleClearChat}
            disabled={messages.length === 0}
            title="Clear conversation"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Voice Recorder - Hidden when loading or speaking */}
      <div className={`flex-shrink-0 border-b p-8 flex justify-center bg-gradient-to-b from-muted/20 to-transparent transition-all duration-300 ${isLoading || isSpeaking ? 'hidden' : ''
        }`}>
        <VoiceRecorder
          ref={voiceRecorderRef}
          onTranscript={handleTranscript}
          disabled={isLoading || isSpeaking}
        />
      </div>

      {/* Persona Avatar Section - Hidden when NOT thinking or speaking */}
      <div className={`flex-shrink-0 border-b py-12 px-6 flex flex-col items-center gap-6 bg-gradient-to-b from-primary/5 to-transparent transition-all duration-300 ${!(isLoading || isSpeaking) ? 'hidden' : ''
        }`}>
        {/* Large Persona Avatar */}
        <Avatar className="h-32 w-32 border-4 border-primary/20 shadow-2xl">
          {persona.avatar && (
            <AvatarImage src={`/${persona.avatar}`} alt={persona.name} />
          )}
          <AvatarFallback className="text-4xl font-bold bg-gradient-to-br from-primary/20 to-primary/5">
            {persona.name.split(" ").map(n => n[0]).join("").toUpperCase()}
          </AvatarFallback>
        </Avatar>

        {/* Thinking Animation */}
        {isLoading && (
          <>
            <div className="flex items-center gap-2">
              <div className="h-3 w-3 rounded-full bg-primary animate-bounce [animation-delay:-0.3s]"></div>
              <div className="h-3 w-3 rounded-full bg-primary animate-bounce [animation-delay:-0.15s]"></div>
              <div className="h-3 w-3 rounded-full bg-primary animate-bounce"></div>
            </div>
            <p className="text-base text-muted-foreground animate-pulse font-medium">
              {persona.name} is thinking...
            </p>
          </>
        )}

        {/* Speaking Animation */}
        {isSpeaking && (
          <div className="flex flex-col items-center gap-3">
            <div className="flex items-center gap-1">
              <div className="h-8 w-1 rounded-full bg-primary/80 animate-pulse [animation-duration:0.6s]" style={{ animationDelay: '0s' }}></div>
              <div className="h-12 w-1 rounded-full bg-primary animate-pulse [animation-duration:0.5s]" style={{ animationDelay: '0.1s' }}></div>
              <div className="h-6 w-1 rounded-full bg-primary/80 animate-pulse [animation-duration:0.7s]" style={{ animationDelay: '0.2s' }}></div>
              <div className="h-10 w-1 rounded-full bg-primary animate-pulse [animation-duration:0.6s]" style={{ animationDelay: '0.3s' }}></div>
              <div className="h-8 w-1 rounded-full bg-primary/80 animate-pulse [animation-duration:0.5s]" style={{ animationDelay: '0.4s' }}></div>
            </div>
            <p className="text-base text-muted-foreground font-medium">
              {persona.name} is speaking...
            </p>
          </div>
        )}
      </div>

      {/* Messages - flex-1 with min-h-0 to enable scrolling */}
      <div className="flex-1 min-h-0 bg-gradient-to-b from-transparent to-muted/10">
        <MessageList messages={messages} personaName={persona.name} personaAvatar={persona.avatar} />
      </div>
    </div>
  );
}
