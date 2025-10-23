"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Settings } from "lucide-react";

export interface AvatarSettings {
  systemPrompt: string;
  llmModel: string;
  voiceModel: string;
  maxTokens: number;
  temperature: number;
  searchK: number;
}

interface SettingsDialogProps {
  settings: AvatarSettings;
  onSave: (settings: AvatarSettings) => void;
  defaultSettings: AvatarSettings;
}

export function SettingsDialog({ settings, onSave, defaultSettings }: SettingsDialogProps) {
  const [open, setOpen] = useState(false);
  const [localSettings, setLocalSettings] = useState(settings);

  const handleSave = () => {
    onSave(localSettings);
    setOpen(false);
  };

  const handleReset = () => {
    setLocalSettings(defaultSettings);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="icon" title="Settings">
          <Settings className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Avatar Settings</DialogTitle>
          <DialogDescription>
            Customize the AI model parameters and system prompt
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* System Prompt */}
          <div className="space-y-2">
            <Label htmlFor="systemPrompt">System Prompt</Label>
            <Textarea
              id="systemPrompt"
              value={localSettings.systemPrompt}
              onChange={(e) =>
                setLocalSettings({ ...localSettings, systemPrompt: e.target.value })
              }
              rows={8}
              className="font-mono text-xs"
            />
          </div>

          {/* LLM Model */}
          <div className="space-y-2">
            <Label htmlFor="llmModel">LLM Model</Label>
            <Select
              value={localSettings.llmModel}
              onValueChange={(value) =>
                setLocalSettings({ ...localSettings, llmModel: value })
              }
            >
              <SelectTrigger id="llmModel">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="gemini-2.5-flash">Gemini 2.5 Flash</SelectItem>
                <SelectItem value="gemini-2.5-pro">Gemini 2.5 Pro</SelectItem>
                <SelectItem value="gemini-2.5-flash-lite">Gemini 2.5 Flash Lite</SelectItem>
                <SelectItem value="gemini-2.0-flash">Gemini 2.0 Flash</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Voice Model */}
          <div className="space-y-2">
            <Label htmlFor="voiceModel">Voice Model</Label>
            <Select
              value={localSettings.voiceModel}
              onValueChange={(value) =>
                setLocalSettings({ ...localSettings, voiceModel: value })
              }
            >
              <SelectTrigger id="voiceModel">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="eleven_turbo_v2_5">Eleven Turbo v2.5</SelectItem>
                <SelectItem value="eleven_multilingual_v2">Eleven Multilingual v2</SelectItem>
                <SelectItem value="eleven_flash_v2_5">Eleven Flash v2.5</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-3 gap-4">
            {/* Max Tokens */}
            <div className="space-y-2">
              <Label htmlFor="maxTokens">Max Tokens</Label>
              <Input
                id="maxTokens"
                type="number"
                value={localSettings.maxTokens}
                onChange={(e) =>
                  setLocalSettings({
                    ...localSettings,
                    maxTokens: Number.parseInt(e.target.value),
                  })
                }
                min={50}
                max={2000}
              />
            </div>

            {/* Temperature */}
            <div className="space-y-2">
              <Label htmlFor="temperature">Temperature</Label>
              <Input
                id="temperature"
                type="number"
                step="0.1"
                value={localSettings.temperature}
                onChange={(e) =>
                  setLocalSettings({
                    ...localSettings,
                    temperature: Number.parseFloat(e.target.value),
                  })
                }
                min={0}
                max={2}
              />
            </div>

            {/* Search K */}
            <div className="space-y-2">
              <Label htmlFor="searchK">Search K</Label>
              <Input
                id="searchK"
                type="number"
                value={localSettings.searchK}
                onChange={(e) =>
                  setLocalSettings({
                    ...localSettings,
                    searchK: Number.parseInt(e.target.value),
                  })
                }
                min={1}
                max={20}
              />
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={handleReset}>
            Reset to Defaults
          </Button>
          <Button onClick={handleSave}>Save Settings</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
