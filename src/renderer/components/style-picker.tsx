import { cn } from "@/lib/utils"

export interface StyleOption {
  id: string
  label: string
}

/** Horizontal chip row for choosing the rendering look. */
export function StylePicker({
  styles,
  value,
  onChange,
  disabled,
}: {
  styles: StyleOption[]
  value: string
  onChange: (id: string) => void
  disabled?: boolean
}) {
  if (styles.length === 0) return null
  return (
    <div className="flex flex-wrap items-center justify-center gap-1.5">
      {styles.map((s) => {
        const active = value === s.id
        return (
          <button
            key={s.id}
            type="button"
            disabled={disabled}
            onClick={() => onChange(s.id)}
            className={cn(
              "px-2.5 h-7 rounded-full text-xs font-medium border transition-colors disabled:opacity-50",
              active
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-secondary/40 text-muted-foreground border-border hover:text-foreground hover:bg-secondary/70"
            )}
          >
            {s.label}
          </button>
        )
      })}
    </div>
  )
}
