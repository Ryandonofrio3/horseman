import { Button } from "@/components/ui/button";
import {
  Download,
  Github,
  Command,
  ArrowRight,
} from "lucide-react";

export default function Home() {
  return (
    <main className="relative min-h-screen overflow-hidden">
      {/* Subtle gradient */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-[30%] left-[30%] h-[600px] w-[600px] rounded-full bg-amber-500/[0.02] blur-[100px]" />
      </div>

      {/* Nav */}
      <nav className="relative z-10 flex items-center justify-between px-6 py-6 md:px-12 lg:px-20">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-amber-500">
            <Command className="h-4 w-4 text-black" />
          </div>
          <span className="font-medium">Horseman</span>
        </div>
        <a
          href="https://github.com/yourusername/horseman"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
        >
          <Github className="h-4 w-4" />
          <span className="hidden sm:inline">Source</span>
        </a>
      </nav>

      {/* Hero */}
      <section className="relative z-10 px-6 pt-20 md:px-12 md:pt-28 lg:px-20 lg:pt-36">
        <div className="mx-auto max-w-4xl">
          {/* Badge */}
          <div className="animate-fade-up opacity-0">
            <span className="inline-block rounded-full border border-border px-3 py-1 text-xs text-muted-foreground">
              macOS only, for now
            </span>
          </div>

          {/* Headline */}
          <h1 className="animate-fade-up opacity-0 delay-100 mt-6 font-serif text-4xl leading-[1.15] tracking-tight md:text-6xl lg:text-7xl">
            A GUI for<br />Claude Code
          </h1>

          {/* Subheadline */}
          <p className="animate-fade-up opacity-0 delay-200 mt-6 max-w-lg text-base text-muted-foreground md:text-lg">
            Horseman wraps the Claude CLI in a native app. You get tabs,
            a sidebar, permission cards you can actually read, and your
            sessions stick around between restarts.
          </p>

          {/* CTAs */}
          <div className="animate-fade-up opacity-0 delay-300 mt-8 flex flex-wrap gap-3">
            <Button
              size="lg"
              className="group h-11 gap-2 bg-foreground px-5 text-background hover:bg-foreground/90"
            >
              <Download className="h-4 w-4" />
              Download .dmg
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </Button>
            <Button
              variant="outline"
              size="lg"
              className="h-11 gap-2 px-5"
            >
              <Github className="h-4 w-4" />
              View on GitHub
            </Button>
          </div>

          <p className="animate-fade-up opacity-0 delay-400 mt-3 text-xs text-muted-foreground">
            v0.1.0 · macOS 12+. Not signed yet, so you&apos;ll need to right-click → Open.
          </p>
        </div>

        {/* Screenshot placeholder */}
        <div className="animate-fade-up opacity-0 delay-500 mx-auto mt-16 max-w-4xl">
          <div className="overflow-hidden rounded-lg border border-border bg-card">
            {/* Window chrome */}
            <div className="flex h-9 items-center gap-2 border-b border-border bg-muted/30 px-3">
              <div className="h-2.5 w-2.5 rounded-full bg-[#ff5f57]" />
              <div className="h-2.5 w-2.5 rounded-full bg-[#febc2e]" />
              <div className="h-2.5 w-2.5 rounded-full bg-[#28c840]" />
              <span className="ml-3 text-[11px] text-muted-foreground">Horseman</span>
            </div>

            {/* App mockup */}
            <div className="aspect-[16/10] bg-background p-4">
              <div className="flex h-full gap-3">
                {/* Sidebar */}
                <div className="w-48 rounded border border-border/50 bg-muted/20 p-2">
                  <div className="mb-3 h-7 rounded bg-muted/50" />
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-2 rounded bg-amber-500/10 px-2 py-1">
                      <div className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                      <div className="h-1.5 w-20 rounded bg-amber-500/40" />
                    </div>
                    <div className="flex items-center gap-2 px-2 py-1 opacity-40">
                      <div className="h-1.5 w-1.5 rounded-full bg-muted-foreground" />
                      <div className="h-1.5 w-16 rounded bg-muted" />
                    </div>
                    <div className="flex items-center gap-2 px-2 py-1 opacity-40">
                      <div className="h-1.5 w-1.5 rounded-full bg-muted-foreground" />
                      <div className="h-1.5 w-24 rounded bg-muted" />
                    </div>
                  </div>
                </div>

                {/* Chat area */}
                <div className="flex-1 rounded border border-border/50 bg-muted/10 p-3">
                  <div className="space-y-3">
                    <div className="flex justify-end">
                      <div className="rounded bg-muted/30 px-3 py-1.5">
                        <div className="h-1.5 w-32 rounded bg-muted-foreground/20" />
                      </div>
                    </div>
                    <div className="flex justify-start">
                      <div className="max-w-[70%] space-y-1.5 rounded border border-border/30 bg-card px-3 py-2">
                        <div className="h-1.5 w-full rounded bg-muted-foreground/15" />
                        <div className="h-1.5 w-[85%] rounded bg-muted-foreground/15" />
                        <div className="mt-2 rounded border border-border/30 bg-muted/20 p-1.5">
                          <div className="h-1.5 w-24 rounded bg-amber-500/25" />
                          <div className="mt-1 h-1.5 w-36 rounded bg-muted-foreground/10" />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <p className="mt-2 text-center text-xs text-muted-foreground">
            Actual screenshot coming soon. This is a placeholder.
          </p>
        </div>
      </section>

      {/* What it does */}
      <section className="relative z-10 px-6 py-20 md:px-12 md:py-28 lg:px-20">
        <div className="mx-auto max-w-4xl">
          <h2 className="font-serif text-2xl md:text-3xl">
            What you get
          </h2>

          <div className="mt-8 grid gap-px overflow-hidden rounded-lg border border-border bg-border md:grid-cols-2">
            <div className="bg-card p-5">
              <h3 className="font-medium">Tabs</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Run multiple Claude sessions at once. Switch between them without losing context.
              </p>
            </div>

            <div className="bg-card p-5">
              <h3 className="font-medium">Session history</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Your old sessions show up in the sidebar. Click one to pick up where you left off.
              </p>
            </div>

            <div className="bg-card p-5">
              <h3 className="font-medium">Permission cards</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                When Claude wants to edit a file or run a command, you see the full diff or command before approving.
              </p>
            </div>

            <div className="bg-card p-5">
              <h3 className="font-medium">Cost tracking</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Each session shows input/output tokens and estimated cost. No surprises on your bill.
              </p>
            </div>

            <div className="bg-card p-5">
              <h3 className="font-medium">Streaming responses</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Text appears as Claude generates it. Tool calls show progress while they run.
              </p>
            </div>

            <div className="bg-card p-5">
              <h3 className="font-medium">Slash commands</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                /compact, /clear, etc. work like they do in the CLI. Output shows inline.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Technical details */}
      <section className="relative z-10 border-t border-border px-6 py-16 md:px-12 lg:px-20">
        <div className="mx-auto max-w-4xl">
          <h2 className="font-serif text-xl md:text-2xl">How it works</h2>
          <p className="mt-3 max-w-2xl text-sm text-muted-foreground">
            Horseman spawns Claude Code as a subprocess and parses its JSON output.
            Your API key and settings come from your existing Claude config.
            The app doesn&apos;t phone home or store anything outside your machine.
          </p>
          <div className="mt-6 flex flex-wrap gap-2 text-xs text-muted-foreground">
            <span className="rounded border border-border px-2 py-1">Tauri v2</span>
            <span className="rounded border border-border px-2 py-1">React 19</span>
            <span className="rounded border border-border px-2 py-1">Rust backend</span>
            <span className="rounded border border-border px-2 py-1">~15MB binary</span>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="relative z-10 border-t border-border px-6 py-16 md:px-12 lg:px-20">
        <div className="mx-auto max-w-4xl">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="font-serif text-xl md:text-2xl">Try it out</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Free and open source. Bug reports welcome.
              </p>
            </div>
            <Button
              size="lg"
              className="group h-11 gap-2 bg-amber-500 px-5 text-black hover:bg-amber-400"
            >
              <Download className="h-4 w-4" />
              Download
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </Button>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="relative z-10 border-t border-border px-6 py-6 md:px-12 lg:px-20">
        <div className="mx-auto flex max-w-4xl flex-col items-center justify-between gap-3 text-xs text-muted-foreground sm:flex-row">
          <div className="flex items-center gap-2">
            <div className="flex h-5 w-5 items-center justify-center rounded bg-amber-500">
              <Command className="h-3 w-3 text-black" />
            </div>
            <span>Horseman</span>
          </div>
          <div className="flex gap-4">
            <a href="https://github.com/yourusername/horseman" className="hover:text-foreground">GitHub</a>
            <a href="https://github.com/yourusername/horseman/releases" className="hover:text-foreground">Releases</a>
            <a href="https://github.com/yourusername/horseman/issues" className="hover:text-foreground">Issues</a>
          </div>
        </div>
      </footer>
    </main>
  );
}
