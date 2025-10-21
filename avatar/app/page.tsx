import { PersonaCard } from "@/components/persona-card";
import { personas } from "@/lib/personas";

export default function Home() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/20">
      <div className="container mx-auto px-4 py-20">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-16">
            <h1 className="text-5xl font-bold mb-4 bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent">
              Persona as a Service
            </h1>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto mb-4">
              Have voice conversations with AI personas powered by advanced voice synthesis and knowledge retrieval
            </p>
            <p className="text-sm text-muted-foreground/80">
              Powered by{" "}
              <a
                href="https://datastreaming.ai/how-it-works"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:text-primary/80 underline underline-offset-4 transition-colors"
              >
                Alien Intelligence Data Streaming
              </a>{" "}
              technology
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {personas.map((persona) => (
              <PersonaCard key={persona.id} persona={persona} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
