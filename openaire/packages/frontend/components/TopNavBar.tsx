"use client";
import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import Image from "next/image";
import { Moon, Sun, ChevronDown, LogIn, LogOut } from "lucide-react";
import { useTheme } from "next-themes";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { AVAILABLE_MODELS } from "@/constants/models";
import authClient from "@/lib/connectors/auth-client";
import HowItWorksDialog from "@/components/HowItWorksDialog";
import InstallPluginDialog from "@/components/InstallPluginDialog";

/** Resolve the effective appearance for "system" theme */
function resolvedIsDark(theme: string | undefined): boolean {
  if (theme === "dark") return true;
  if (theme === "light") return false;
  // system — check media query
  if (typeof window !== "undefined") {
    return window.matchMedia("(prefers-color-scheme: dark)").matches;
  }
  return false;
}

interface TopNavBarProps {
  selectedModel?: string;
  onModelChange?: (modelId: string) => void;
}

const TopNavBar: React.FC<TopNavBarProps> = ({ selectedModel, onModelChange }) => {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const { data: session, isPending } = authClient.useSession();

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return null;
  }

  return (
    <div className="flex items-center justify-between p-3 xl:p-4 gap-1 overflow-hidden">
      {/* Logo */}
      <div className="font-bold text-xl flex gap-2 items-center shrink-0">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={`${process.env.NEXT_PUBLIC_BASE_PATH || ""}/wordmark.svg`}
          alt="Alien Intelligence"
          width={150}
          height={24}
          className="invert dark:invert-0 h-5 xl:h-6 w-auto"
        />
      </div>

      {/* Actions — single row, wraps text labels only on large screens */}
      <div className="flex items-center gap-1 shrink-0">
        <HowItWorksDialog />
        <InstallPluginDialog />
        {selectedModel && onModelChange && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="h-8 text-xs xl:text-sm px-2 xl:px-3">
                <span className="hidden xl:inline">
                  {AVAILABLE_MODELS.find((m) => m.id === selectedModel)?.name}
                </span>
                <span className="xl:hidden">
                  {AVAILABLE_MODELS.find((m) => m.id === selectedModel)?.name?.split(" ")[0]}
                </span>
                <ChevronDown className="ml-1 h-3 w-3" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
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
        )}
        {!isPending && (
          session ? (
            <Button
              variant="outline"
              size="sm"
              className="h-8 text-sm gap-1.5"
              onClick={() => authClient.signOut()}
            >
              <LogOut className="h-3.5 w-3.5" />
              <span className="hidden xl:inline">{session.user?.name || session.user?.email || "Sign out"}</span>
            </Button>
          ) : (
            <Button
              variant="outline"
              size="sm"
              className="h-8 text-sm gap-1.5"
              onClick={() =>
                authClient.signIn.social({
                  provider: "authentik",
                  callbackURL: window.location.href,
                })
              }
            >
              <LogIn className="h-3.5 w-3.5" />
              <span className="hidden xl:inline">Sign in</span>
            </Button>
          )
        )}
        <Button
          variant="outline"
          size="icon"
          className="h-8 w-8 shrink-0"
          onClick={() => setTheme(resolvedIsDark(theme) ? "light" : "dark")}
        >
          <Sun className="h-[1.2rem] w-[1.2rem] rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
          <Moon className="absolute h-[1.2rem] w-[1.2rem] rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
          <span className="sr-only">Toggle theme</span>
        </Button>
      </div>
    </div>
  );
};

export default TopNavBar;
