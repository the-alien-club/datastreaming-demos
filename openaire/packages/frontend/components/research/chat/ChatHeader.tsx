import React from "react";
import { CardTitle, CardDescription } from "@/components/ui/card";

export function ChatHeader() {
  return (
    <div>
      <CardTitle className="text-lg">
        OpenAIRE Research Intelligence
      </CardTitle>
      <CardDescription className="text-xs">
        Powered by Alien Intelligence Datastreaming
      </CardDescription>
    </div>
  );
}
