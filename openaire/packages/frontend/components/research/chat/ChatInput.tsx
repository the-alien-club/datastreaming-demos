import React from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Send, Square } from "lucide-react";

interface ChatInputProps {
  value: string;
  onChange: (event: React.ChangeEvent<HTMLTextAreaElement>) => void;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
  onKeyDown: (event: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  isLoading?: boolean;
  onStop?: () => void;
  disabled?: boolean;
  placeholder?: string;
}

export function ChatInput({
  value,
  onChange,
  onSubmit,
  onKeyDown,
  isLoading = false,
  onStop,
  disabled = false,
  placeholder = "Ask about research papers, datasets, or trends...",
}: ChatInputProps) {
  return (
    <form onSubmit={onSubmit} className="w-full">
      <div className="flex items-end space-x-2">
        <div className="flex-1 relative">
          <Textarea
            value={value}
            onChange={onChange}
            onKeyDown={onKeyDown}
            placeholder={placeholder}
            disabled={disabled}
            className="min-h-[44px] h-[44px] resize-none py-3 flex items-center pr-12 scrollbar-none"
            rows={1}
          />
        </div>
        {isLoading ? (
          <Button
            type="button"
            variant="destructive"
            className="h-[44px]"
            onClick={onStop}
          >
            <Square className="h-4 w-4" />
          </Button>
        ) : (
          <Button
            type="submit"
            disabled={disabled || !value.trim()}
            className="h-[44px]"
          >
            <Send className="h-4 w-4" />
          </Button>
        )}
      </div>
    </form>
  );
}
