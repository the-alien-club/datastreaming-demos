"use client";

import type { Auth } from "@/lib/auth";
import { createAuthClient } from "better-auth/react";
import { genericOAuthClient } from "better-auth/client/plugins";

const authClient = createAuthClient({
  plugins: [genericOAuthClient()],
});

export default authClient;
