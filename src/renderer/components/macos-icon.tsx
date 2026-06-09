import { ImageIcon } from "lucide-react"
import type { IconState } from "@/components/icon-types"
import { cn } from "@/lib/utils"

/**
 * 16:9 illustration preview. Replaces the icon app's squircle preview.
 * The export name is kept as `MacOSIcon` so callers don't change.
 */
export function MacOSIcon({
  state,
  selected,
  onSelect,
  variants,
  baseIconSrc,
}: {
  state: IconState
  selected: number | null
  onSelect: (i: number) => void
  variants: (string | null)[]
  baseIconSrc?: string | null
}) {
  // Refine: one large confirmed illustration.
  if (state === "refine") {
    return (
      <div className="w-full max-w-[560px]">
        <Frame>
          {baseIconSrc ? (
            <img src={baseIconSrc} alt="Illustration" className="w-full h-full object-contain" draggable={false} />
          ) : null}
        </Frame>
      </div>
    )
  }

  // Generated: up to three selectable variants.
  if (state === "generated") {
    const present = variants.map((v, i) => ({ v, i })).filter((x) => x.v !== null)
    return (
      <div className="flex flex-wrap items-center justify-center gap-4 w-full max-w-[680px]">
        {present.map(({ v, i }) => {
          const isSelected = selected === i
          return (
            <button
              key={i}
              type="button"
              onClick={() => onSelect(i)}
              className={cn(
                "group relative w-[200px] rounded-xl transition-all duration-150 focus:outline-none",
                isSelected ? "ring-2 ring-primary" : "ring-1 ring-border hover:ring-foreground/40"
              )}
            >
              <Frame small>
                <img src={v as string} alt={`Variant ${i + 1}`} className="w-full h-full object-contain" draggable={false} />
              </Frame>
            </button>
          )
        })}
      </div>
    )
  }

  // Idle / generating: placeholder.
  return (
    <div className="w-full max-w-[560px]">
      <Frame placeholder>
        {state === "generating" ? (
          <div className="absolute inset-0 animate-pulse bg-linear-to-br from-secondary/40 via-secondary/20 to-secondary/40" />
        ) : (
          <div className="flex flex-col items-center gap-2 text-muted-foreground">
            <ImageIcon className="w-8 h-8" strokeWidth={1.5} />
            <span className="text-xs">Your illustration will appear here</span>
          </div>
        )}
      </Frame>
    </div>
  )
}

/** White 16:9 card. Illustrations are white-background, so a white frame reads in any theme. */
function Frame({
  children,
  small = false,
  placeholder = false,
}: {
  children?: React.ReactNode
  small?: boolean
  placeholder?: boolean
}) {
  return (
    <div
      className={cn(
        "relative aspect-[16/9] w-full overflow-hidden rounded-xl flex items-center justify-center",
        placeholder ? "border border-dashed border-border bg-secondary/20" : "bg-white",
        small ? "" : "shadow-sm"
      )}
    >
      {children}
    </div>
  )
}
