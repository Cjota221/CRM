import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // WhatsApp Dark Theme (padrão)
        wa: {
          bg: {
            DEFAULT: '#111b21',
            panel: '#202c33',
            conversation: '#0b141a',
            input: '#2a3942',
            hover: '#2a3942',
          },
          bubble: {
            in: '#202c33',
            out: '#005c4b',
          },
          text: {
            primary: '#e9edef',
            secondary: '#8696a0',
            bubble: '#ffffff',
            time: '#ffffff99',
          },
          accent: {
            green: '#00a884',
            blue: '#53bdeb',
            teal: '#00a884',
          },
          border: {
            DEFAULT: '#222d34',
            strong: '#3b4a54',
          },
        },
        // CRM Brand Colors
        crm: {
          primary: '#1e3a5f',
          secondary: '#2563eb',
          success: '#059669',
          warning: '#d97706',
          danger: '#dc2626',
        },
      },
      fontFamily: {
        sans: ['Inter', 'Segoe UI', 'Helvetica Neue', 'sans-serif'],
      },
      boxShadow: {
        'wa': '0 1px 0.5px rgba(11, 20, 26, 0.13)',
        'wa-md': '0 2px 5px rgba(11, 20, 26, 0.26)',
      },
      animation: {
        'pulse-slow': 'pulse 3s ease-in-out infinite',
        'slide-in-right': 'slideInRight 0.3s ease-out',
        'slide-out-right': 'slideOutRight 0.3s ease-out',
      },
      keyframes: {
        slideInRight: {
          '0%': { transform: 'translateX(100%)' },
          '100%': { transform: 'translateX(0)' },
        },
        slideOutRight: {
          '0%': { transform: 'translateX(0)' },
          '100%': { transform: 'translateX(100%)' },
        },
      },
    },
  },
  plugins: [],
};

export default config;
