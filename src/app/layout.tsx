import { ClerkProvider } from '@clerk/nextjs'
import { dark } from '@clerk/themes'
import type { Metadata } from 'next'
import { ThemeProvider } from 'next-themes'
import './globals.css'

export const metadata: Metadata = {
  title: 'Kernel MCP Server',
  description: 'A Model Context Protocol (MCP) server that provides AI assistants with secure access to Kernel platform tools and browser automation capabilities.',
  keywords: [
    'MCP',
    'Model Context Protocol',
    'Kernel',
    'browser automation',
    'AI assistants',
    'cloud deployment',
    'web automation',
    'Chromium',
    'headless browser'
  ],
  icons: {
    icon: '/favicon.svg',
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}): React.ReactElement {
  return (
    <ClerkProvider
      appearance={{
        baseTheme: dark,
      }}
    >
      <html lang="en" suppressHydrationWarning>
        <body className="font-mono">
          <ThemeProvider
            attribute="class"
            defaultTheme="dark"
            disableTransitionOnChange
            enableSystem
          >
            <main>{children}</main>
          </ThemeProvider>
        </body>
      </html>
    </ClerkProvider>
  )
} 