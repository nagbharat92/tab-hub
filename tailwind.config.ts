import type { Config } from "tailwindcss";

export default {
  darkMode: ["selector", 'html[data-theme="dark"]'],
  content: ["./entrypoints/**/*.{html,ts,tsx}", "./components/**/*.{ts,tsx}", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        background: "var(--cp-bg)",
        foreground: "var(--cp-text)",
        card: "var(--cp-surface)",
        "card-foreground": "var(--cp-text)",
        popover: "var(--cp-surface)",
        "popover-foreground": "var(--cp-text)",
        primary: "var(--cp-accent)",
        "primary-foreground": "var(--cp-accent-fg)",
        secondary: "var(--cp-surface-soft)",
        "secondary-foreground": "var(--cp-text)",
        muted: "var(--cp-surface-soft)",
        "muted-foreground": "var(--cp-text-muted)",
        accent: "var(--cp-accent-soft)",
        "accent-foreground": "var(--cp-text)",
        destructive: "var(--cp-danger)",
        "destructive-foreground": "var(--cp-accent-fg)",
        border: "var(--cp-border)",
        input: "var(--cp-border)",
        ring: "var(--cp-accent)"
      },
      fontFamily: {
        sans: ['"Segoe UI"', "Aptos", "Calibri", "-apple-system", "BlinkMacSystemFont", "sans-serif"],
        mono: ["Consolas", '"Courier New"', "Courier", "monospace"]
      },
      borderRadius: {
        lg: "0.625rem",
        md: "0.5rem",
        sm: "0.375rem",
        card: "1rem"
      }
    }
  },
  plugins: []
} satisfies Config;
