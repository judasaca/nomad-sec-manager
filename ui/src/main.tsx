import '@fontsource/titillium-web/400.css'
import '@fontsource/titillium-web/600.css'
import '@fontsource/titillium-web/700.css'
import { CssBaseline } from '@mui/material'
import { ThemeProvider } from '@mui/material/styles'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider } from '@tanstack/react-router'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { router } from './App'
import { nomadTheme } from './theme'

const queryClient = new QueryClient()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider
      theme={nomadTheme}
      defaultMode="system"
      disableTransitionOnChange
      noSsr
    >
      <CssBaseline enableColorScheme />
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </ThemeProvider>
  </StrictMode>,
)
