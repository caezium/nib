import { useState } from "react"
import { Check, Copy, ExternalLink, FileText, Sparkles, Terminal, X } from "lucide-react"
import { ipc } from "@/gen/ipc"
import { cn } from "@/lib/utils"

const INSTALL_CMD = "npx skills add caezium/nib --skill nib"
const REPO_URL = "https://github.com/caezium/nib"

const AGENT_PROMPTS = [
  'Use nib to illustrate: "small habits compound into a big result"',
  "Use nib to illustrate this post: <paste a URL>",
  'Use nib: set my avatar to avatar.png, then illustrate "<your idea>" in woodcut',
]

export function AboutModal({ onClose }: { onClose: () => void }) {
  const [copied, setCopied] = useState(false)

  const copyCmd = () => {
    navigator.clipboard
      .writeText(INSTALL_CMD)
      .then(() => {
        setCopied(true)
        setTimeout(() => setCopied(false), 1500)
      })
      .catch(() => {})
  }
  const openRepo = () => ipc.app.OpenExternalUrl({ url: REPO_URL }).catch(() => {})

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="about-title"
      onClick={onClose}
    >
      <div
        className="relative w-[480px] max-w-[calc(100vw-32px)] rounded-xl border border-border bg-background shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 pt-4 pb-2">
          <h2 id="about-title" className="font-medium text-foreground">
            More ways to use Nib
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="flex items-center justify-center h-8 w-8 rounded-md text-muted-foreground hover:text-foreground hover:bg-foreground/5 transition-colors"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-4 pb-4 space-y-3">
          {/* Headline feature: the agent skill. */}
          <div className="rounded-xl border border-primary/40 bg-primary/5 p-3.5">
            <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <Terminal className="w-4 h-4 text-primary" />
              Plug Nib into your AI agent — no app needed
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed mt-1.5">
              Nib also ships as an agent skill. Install it in Claude Code, Codex, Cursor, or
              Gemini and generate illustrations right in your chat.
            </p>
            <button
              type="button"
              onClick={copyCmd}
              className="mt-2.5 w-full flex items-center justify-between gap-2 rounded-lg bg-secondary/60 hover:bg-secondary border border-border px-3 h-9 text-left transition-colors"
            >
              <code className="font-mono text-xs text-foreground truncate">{INSTALL_CMD}</code>
              <span className="flex items-center gap-1 text-[11px] text-muted-foreground shrink-0">
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                {copied ? "Copied" : "Copy"}
              </span>
            </button>
            <p className="text-[11px] text-muted-foreground mt-2">
              Uses your OpenRouter key · works the same as this app.
            </p>

            <p className="text-[11px] font-medium text-foreground/80 mt-3 mb-1.5">
              Then try a prompt:
            </p>
            <div className="space-y-1.5">
              {AGENT_PROMPTS.map((p, i) => (
                <CopyRow key={i} text={p} />
              ))}
            </div>
          </div>

          {/* Other features. */}
          <Feature
            icon={<FileText className="w-4 h-4" />}
            title="Illustrate a whole article"
            desc="Switch to Article mode, paste a post, and Nib picks the moments worth illustrating and generates a matching set."
          />
          <Feature
            icon={<Sparkles className="w-4 h-4" />}
            title="Seven print looks, one character"
            desc="Marker, Riso, Blueprint, Woodcut, Pixel, Clay, Gouache — your avatar stays on-model across every style and every image."
          />
        </div>

        <div className="flex items-center justify-between gap-3 px-4 pb-4">
          <span className="text-xs text-muted-foreground">Open source · MIT</span>
          <button
            type="button"
            onClick={openRepo}
            className="flex items-center gap-1.5 h-8 px-3 rounded-lg text-xs font-medium bg-secondary/60 text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            View on GitHub
          </button>
        </div>
      </div>
    </div>
  )
}

/** A copyable prompt row. */
function CopyRow({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  const copy = () => {
    navigator.clipboard
      .writeText(text)
      .then(() => {
        setCopied(true)
        setTimeout(() => setCopied(false), 1500)
      })
      .catch(() => {})
  }
  return (
    <button
      type="button"
      onClick={copy}
      className="w-full flex items-center justify-between gap-2 rounded-lg bg-secondary/50 hover:bg-secondary border border-border px-2.5 py-2 text-left transition-colors"
    >
      <code className="font-mono text-[11px] text-foreground/90 truncate">{text}</code>
      <span className="shrink-0 text-muted-foreground">
        {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
      </span>
    </button>
  )
}

function Feature({
  icon,
  title,
  desc,
}: {
  icon: React.ReactNode
  title: string
  desc: string
}) {
  return (
    <div className={cn("rounded-xl border border-border bg-secondary/30 p-3.5")}>
      <div className="flex items-center gap-2 text-sm font-medium text-foreground">
        <span className="text-muted-foreground">{icon}</span>
        {title}
      </div>
      <p className="text-xs text-muted-foreground leading-relaxed mt-1.5">{desc}</p>
    </div>
  )
}
