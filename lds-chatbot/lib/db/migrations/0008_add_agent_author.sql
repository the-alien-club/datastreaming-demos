-- Add optional display author to agents. When set, the card and public
-- library show this value instead of the creator's account username.
ALTER TABLE "agents" ADD COLUMN "author" text;
