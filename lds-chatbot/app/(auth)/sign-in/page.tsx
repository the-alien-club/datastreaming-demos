"use client"

import { authClient } from "@/lib/auth-client"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

export default function SignInPage() {
  const handleSignIn = () => {
    authClient.signIn.oauth2({
      providerId: "authentik",
      callbackURL: "/agents",
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
