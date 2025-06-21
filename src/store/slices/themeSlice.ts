import { createSlice, PayloadAction } from '@reduxjs/toolkit'

export type Theme = 'light' | 'dark' | 'system'

interface ThemeState {
  theme: Theme
  isDark: boolean
}

const getInitialTheme = (): Theme => {
  // ALWAYS default to dark theme - ignore localStorage to ensure dark is always default
  return 'dark'
}

const getIsDark = (theme: Theme): boolean => {
  if (theme === 'system') {
    return typeof window !== 'undefined'
      ? window.matchMedia('(prefers-color-scheme: dark)').matches
      : true // Default to dark if no window
  }
  return theme === 'dark'
}

const initialState: ThemeState = {
  theme: 'dark', // Force dark theme always
  isDark: true,  // Force dark mode always
}

const themeSlice = createSlice({
  name: 'theme',
  initialState,
  reducers: {
    setTheme: (state, action: PayloadAction<Theme>) => {
      state.theme = action.payload
      state.isDark = getIsDark(action.payload)
      
      if (typeof window !== 'undefined') {
        localStorage.setItem('theme', action.payload)
        
        if (state.isDark) {
          document.documentElement.classList.remove('light')
        } else {
          document.documentElement.classList.add('light')
        }
      }
    },
    toggleTheme: (state) => {
      const newTheme = state.isDark ? 'light' : 'dark'
      state.theme = newTheme
      state.isDark = !state.isDark
      
      if (typeof window !== 'undefined') {
        localStorage.setItem('theme', newTheme)
        
        if (state.isDark) {
          document.documentElement.classList.remove('light')
        } else {
          document.documentElement.classList.add('light')
        }
      }
    },
    initializeTheme: (state) => {
      if (typeof window !== 'undefined') {
        const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
        
        if (state.theme === 'system') {
          state.isDark = mediaQuery.matches
        }
        
        if (state.isDark) {
          document.documentElement.classList.remove('light')
        } else {
          document.documentElement.classList.add('light')
        }
        
        // Listen for system theme changes
        const handleChange = (e: MediaQueryListEvent) => {
          if (state.theme === 'system') {
            state.isDark = e.matches
            if (e.matches) {
              document.documentElement.classList.remove('light')
            } else {
              document.documentElement.classList.add('light')
            }
          }
        }
        
        mediaQuery.addEventListener('change', handleChange)
      }
    },
  },
})

export const { setTheme, toggleTheme, initializeTheme } = themeSlice.actions
export default themeSlice.reducer