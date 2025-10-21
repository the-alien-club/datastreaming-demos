"use client";

import Link from "next/link";
import Image from "next/image";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { Persona } from "@/lib/types";

interface PersonaCardProps {
  persona: Persona;
}

export function PersonaCard({ persona }: PersonaCardProps) {
  const initials = persona.name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase();

  const content = (
    <Card
      className={`transition-all h-full ${
        persona.disabled
          ? "opacity-60 cursor-not-allowed"
          : "hover:shadow-xl hover:scale-[1.02] cursor-pointer hover:border-primary/50"
      }`}
    >
      <CardHeader className="pb-3">
        <div className="flex flex-col items-center gap-4 text-center">
          <Avatar className="h-32 w-32 border-4 border-primary/10 shadow-lg">
            {persona.avatar && (
              <AvatarImage src={`/${persona.avatar}`} alt={persona.name} />
            )}
            <AvatarFallback className="text-4xl font-bold bg-linear-to-br from-primary/20 to-primary/5">
              {initials}
            </AvatarFallback>
          </Avatar>
          <div className="space-y-1">
            <CardTitle className="text-xl">{persona.name}</CardTitle>
            {persona.disabled && (
              <Badge variant="secondary" className="mt-2">
                Coming Soon
              </Badge>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="text-center pb-6">
        <CardDescription className="text-sm">
          {persona.disabled
            ? "This persona will be available soon"
            : "Click to start a voice conversation"}
        </CardDescription>
      </CardContent>
    </Card>
  );

  if (persona.disabled) {
    return content;
  }

  return <Link href={`/chat/${persona.id}`} className="block h-full">{content}</Link>;
}
