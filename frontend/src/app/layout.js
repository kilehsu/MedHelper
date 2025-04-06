import { Inter } from 'next/font/google'
import './globals.css'

const inter = Inter({ subsets: ['latin'] })

export const metadata = {
  title: 'MediMinder - Medicine Tracking Dashboard',
  description: 'Track and manage your medications with ease',
}

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className={inter.className}>{children}
        
      </body>
    </html>
  )
}
