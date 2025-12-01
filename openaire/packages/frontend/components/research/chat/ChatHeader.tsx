import React from "react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { CardTitle, CardDescription } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ChevronDown } from "lucide-react";
import { AVAILABLE_MODELS } from "@/constants/models";
import { withBasePath } from "@/lib/basePath";

interface ChatHeaderProps {
  selectedModel: string;
  onModelChange: (modelId: string) => void;
  hasMessages: boolean;
}

export function ChatHeader({
  selectedModel,
  onModelChange,
  hasMessages,
}: ChatHeaderProps) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center space-x-3">
        {hasMessages && (
          <>
            <Avatar className="w-8 h-8 border">
              <AvatarImage src={withBasePath("/ant-logo.svg")} alt="OpenAIRE Assistant" className="brightness-0 invert" />
              <AvatarFallback>OA</AvatarFallback>
            </Avatar>
            <div>
              <div className="flex items-center gap-2">
                <CardTitle className="text-lg">
                  OpenAIRE Research Intelligence
                </CardTitle>
                <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                  Multi-Agent SDK
                </Badge>
              </div>
              <CardDescription className="text-xs">
                Powered by Alien Intelligence Datastreaming
              </CardDescription>
            </div>
          </>
        )}
      </div>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" className="h-8 text-sm">
            {AVAILABLE_MODELS.find((m) => m.id === selectedModel)?.name}
            <ChevronDown className="ml-2 h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          {AVAILABLE_MODELS.map((model) => (
            <DropdownMenuItem
              key={model.id}
              onSelect={() => onModelChange(model.id)}
            >
              {model.name}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
