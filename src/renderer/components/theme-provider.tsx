import React, {createContext, useEffect, useState} from "react"

type Theme = "dark" | "light" | "system"

type ThemeProviderProps = {
    children: React.ReactNode
    defaultTheme?: Theme
    storageKey?: string
}

type ThemeProviderState = {
    theme: Theme
    setTheme: (theme: Theme) => void
}

const initialState: ThemeProviderState = {
    theme: "light",
    setTheme: () => null,
}

const ThemeProviderContext = createContext<ThemeProviderState>(initialState)

export function useTheme() {
    return React.useContext(ThemeProviderContext)
}

// Nib's editorial look is light-only. The storage key is intentionally NOT the
// old "vite-ui-theme" — that key may still hold a stale "dark"/"system" value
// from the MoIcons-era build, which would override the light palette.
export function ThemeProvider({
                                  children,
                                  defaultTheme = "light",
                                  storageKey = "nib-ui-theme",
                                  ...props
                              }: ThemeProviderProps) {
    const [theme, setThemeState] = useState<Theme>(
        () => (localStorage.getItem(storageKey) as Theme) || defaultTheme
    )

    useEffect(() => {
        const root = window.document.documentElement

        root.classList.remove("light", "dark")

        if (theme === "system") {
            const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)")
            const systemTheme = mediaQuery.matches ? "dark" : "light"
            
            root.classList.add(systemTheme)

            const listener = (e: MediaQueryListEvent) => {
                root.classList.remove("light", "dark")
                root.classList.add(e.matches ? "dark" : "light")
            }

            mediaQuery.addEventListener("change", listener)
            return () => mediaQuery.removeEventListener("change", listener)
        }

        root.classList.add(theme)
    }, [theme])

    const value = {
        theme,
        setTheme: (newTheme: Theme) => {
            localStorage.setItem(storageKey, newTheme)
            setThemeState(newTheme)
        },
    }

    return (
        <ThemeProviderContext.Provider {...props} value={value}>
            {children}
        </ThemeProviderContext.Provider>
    )
}
