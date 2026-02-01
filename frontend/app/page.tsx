"use client";

import Link from "next/link";
import { ArrowRight, Radio, GitPullRequest, Brain, Globe, Sparkles, BookOpen, Zap, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-black text-white overflow-hidden">
      {/* Animated background */}
      <div className="fixed inset-0 -z-10">
        {/* Gradient orbs */}
        <div className="absolute top-1/4 left-1/4 w-[600px] h-[600px] bg-emerald-500/20 rounded-full blur-[120px] animate-pulse" />
        <div className="absolute bottom-1/4 right-1/4 w-[500px] h-[500px] bg-cyan-500/15 rounded-full blur-[100px] animate-pulse" style={{ animationDelay: "1s" }} />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-emerald-600/10 rounded-full blur-[150px]" />
        {/* Grid overlay */}
        <div
          className="absolute inset-0 opacity-[0.02]"
          style={{
            backgroundImage: `linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)`,
            backgroundSize: '60px 60px'
          }}
        />
      </div>

      {/* Nav */}
      <nav className="relative z-10 max-w-6xl mx-auto px-6 py-6 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <img src="/darwin-logo.png" alt="Darwin Logo" className="h-7 w-auto" />
          <span className="text-xl font-bold">Darwin</span>
        </div>
        <div className="flex items-center gap-4">
          <a
            href="https://github.com/Raptors65/darwin"
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-white/60 hover:text-white transition-colors"
          >
            GitHub
          </a>
          <Button asChild size="sm" className="bg-white text-black hover:bg-white/90">
            <Link href="/dashboard">
              Launch Demo
            </Link>
          </Button>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative z-10 max-w-5xl mx-auto px-6 pt-20 pb-32 text-center">
        {/* Badge */}
        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-white/10 bg-white/5 backdrop-blur-sm mb-8">
          <Zap className="w-4 h-4 text-emerald-400" />
          <span className="text-sm text-white/80">Powered by Redis & Browserbase</span>
        </div>

        {/* Main headline */}
        <h1 className="text-5xl md:text-7xl font-bold tracking-tight mb-6 leading-[1.1]">
          Turn user feedback into
          <br />
          <span className="bg-gradient-to-r from-emerald-400 via-cyan-400 to-emerald-400 bg-clip-text text-transparent">
            code fixes
          </span>
        </h1>

        {/* Subheadline */}
        <p className="text-xl md:text-2xl text-white/60 max-w-2xl mx-auto mb-12 leading-relaxed">
          An AI agent that scrapes feedback, creates PRs, and{" "}
          <span className="text-white/90 font-medium">learns from code reviews</span>{" "}
          to get better over time.
        </p>

        {/* CTAs */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
          <Button asChild size="lg" className="bg-gradient-to-r from-emerald-500 to-cyan-500 hover:from-emerald-400 hover:to-cyan-400 text-black font-semibold px-8 h-14 text-lg shadow-lg shadow-emerald-500/25">
            <Link href="/dashboard" className="gap-2">
              Try the Demo
              <ArrowRight className="w-5 h-5" />
            </Link>
          </Button>
          <Button asChild variant="outline" size="lg" className="border-white/20 bg-white/5 hover:bg-white/10 text-white px-8 h-14 text-lg backdrop-blur-sm">
            <a
              href="https://github.com/Raptors65/darwin"
              target="_blank"
              rel="noopener noreferrer"
              className="gap-2"
            >
              View on GitHub
              <ChevronRight className="w-5 h-5" />
            </a>
          </Button>
        </div>

        {/* Stats or trust signals */}
        <div className="flex items-center justify-center gap-8 mt-16 text-sm text-white/40">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span>Self-improving</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" style={{ animationDelay: "0.5s" }} />
            <span>Multi-source</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" style={{ animationDelay: "1s" }} />
            <span>Autonomous</span>
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="relative z-10 border-t border-white/10">
        <div className="max-w-6xl mx-auto px-6 py-24">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">How It Works</h2>
            <p className="text-white/50 text-lg">From raw feedback to merged PR in four steps</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            {[
              { icon: Radio, step: "01", title: "Scrape", desc: "Collect feedback from Reddit, Discourse, GitHub, and any web page", color: "emerald" },
              { icon: Sparkles, step: "02", title: "Cluster", desc: "Group similar signals using semantic embeddings", color: "cyan" },
              { icon: Brain, step: "03", title: "Classify", desc: "Identify bugs, features, and UX issues automatically", color: "emerald" },
              { icon: GitPullRequest, step: "04", title: "Fix", desc: "Claude agent creates issues and pull requests", color: "cyan" },
            ].map((item, i) => (
              <div
                key={i}
                className="group relative p-6 rounded-2xl border border-white/10 bg-white/[0.02] hover:bg-white/[0.05] hover:border-white/20 transition-all duration-300"
              >
                {/* Glow on hover */}
                <div className={`absolute inset-0 rounded-2xl bg-${item.color}-500/5 opacity-0 group-hover:opacity-100 transition-opacity duration-300 blur-xl`} />

                <div className="relative">
                  <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${item.color === "emerald" ? "from-emerald-500/20 to-emerald-600/20" : "from-cyan-500/20 to-cyan-600/20"} flex items-center justify-center mb-4`}>
                    <item.icon className={`w-6 h-6 ${item.color === "emerald" ? "text-emerald-400" : "text-cyan-400"}`} />
                  </div>
                  <div className="text-xs font-mono text-white/30 mb-2">{item.step}</div>
                  <h3 className="text-xl font-semibold mb-2">{item.title}</h3>
                  <p className="text-sm text-white/50 leading-relaxed">{item.desc}</p>
                </div>

                {/* Arrow connector (hidden on mobile, last item) */}
                {i < 3 && (
                  <div className="hidden md:flex absolute -right-6 top-1/2 -translate-y-1/2 z-10 w-6 items-center justify-center">
                    <ChevronRight className="w-5 h-5 text-white/30" />
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Key Features */}
      <section className="relative z-10 border-t border-white/10">
        <div className="max-w-6xl mx-auto px-6 py-24">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">Built Different</h2>
            <p className="text-white/50 text-lg">Not just another AI coding tool</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {[
              {
                icon: Brain,
                title: "Self-Improving",
                desc: "Learns from PR reviews to get better over time. When reviewers request changes, Darwin addresses feedback and remembers the lessons for next time.",
                gradient: "from-emerald-500 to-teal-500"
              },
              {
                icon: Globe,
                title: "Multi-Source",
                desc: "Scrapes Reddit, Discourse, GitHub Issues, and any web page via Browserbase. Cast a wide net and never miss user feedback again.",
                gradient: "from-cyan-500 to-blue-500"
              },
              {
                icon: GitPullRequest,
                title: "Fully Autonomous",
                desc: "Creates GitHub issues, branches, commits, and pull requests. Addresses review feedback without human intervention until you're ready to merge.",
                gradient: "from-violet-500 to-purple-500"
              },
              {
                icon: BookOpen,
                title: "Style-Aware",
                desc: "Follows learned coding conventions extracted from past reviews. Your codebase, your rules. Darwin adapts to how your team writes code.",
                gradient: "from-orange-500 to-red-500"
              },
            ].map((item, i) => (
              <div
                key={i}
                className="group relative p-8 rounded-2xl border border-white/10 bg-white/[0.02] hover:border-white/20 transition-all duration-300 overflow-hidden"
              >
                {/* Background gradient on hover */}
                <div className={`absolute inset-0 bg-gradient-to-br ${item.gradient} opacity-0 group-hover:opacity-[0.03] transition-opacity duration-500`} />

                <div className="relative">
                  <div className={`inline-flex p-3 rounded-xl bg-gradient-to-br ${item.gradient} mb-5`}>
                    <item.icon className="w-6 h-6 text-white" />
                  </div>
                  <h3 className="text-xl font-semibold mb-3">{item.title}</h3>
                  <p className="text-white/50 leading-relaxed">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="relative z-10 border-t border-white/10">
        <div className="max-w-4xl mx-auto px-6 py-24 text-center">
          {/* Glow */}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="w-[500px] h-[300px] bg-emerald-500/10 rounded-full blur-[100px]" />
          </div>

          <div className="relative">
            <h2 className="text-4xl md:text-5xl font-bold mb-6">
              Ready to evolve your codebase?
            </h2>
            <p className="text-xl text-white/50 mb-10 max-w-xl mx-auto">
              See Darwin in action. Scrape signals, watch issues get created, and PRs appear like magic.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <Button asChild size="lg" className="bg-gradient-to-r from-emerald-500 to-cyan-500 hover:from-emerald-400 hover:to-cyan-400 text-black font-semibold px-10 h-14 text-lg shadow-lg shadow-emerald-500/25">
                <Link href="/dashboard" className="gap-2">
                  Launch Demo
                  <ArrowRight className="w-5 h-5" />
                </Link>
              </Button>
              <Button asChild variant="outline" size="lg" className="border-white/20 bg-white/5 hover:bg-white/10 text-white px-8 h-14 text-lg backdrop-blur-sm">
                <a
                  href="https://github.com/Raptors65/darwin"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  View Source Code
                </a>
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="relative z-10 border-t border-white/10 py-8">
        <div className="max-w-6xl mx-auto px-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-white/40">
          <div className="flex items-center gap-2">
            <img src="/darwin-logo.png" alt="Darwin Logo" className="h-5 w-auto" />
            <span className="font-medium text-white/60">Darwin</span>
          </div>
          <div className="flex items-center gap-6">
            <a
              href="https://github.com/Raptors65/darwin"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-white/60 transition-colors"
            >
              GitHub
            </a>
            <span>Built for WeaveHacks 3</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
