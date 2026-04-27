"use client"

import { authClient } from "@/lib/auth-client"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { OAUTH_PROVIDER_ID } from "@/lib/constants"

export default function SignInPage() {
  const handleSignIn = () => {
    // basePath is prepended in the auth callback handler — better-auth treats
    // `callbackURL` as path-relative to the configured baseURL.
    const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? ""
    authClient.signIn.oauth2({
      providerId: OAUTH_PROVIDER_ID,
      callbackURL: `${basePath}/agents`,
    })
  }

  return (
    <div className="flex min-h-dvh items-center justify-center">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">LDS Chatbot</CardTitle>
          <CardDescription>
            Sign in to create and chat with AI agents
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={handleSignIn} className="w-full" size="lg">
            Sign in with Authentik
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
