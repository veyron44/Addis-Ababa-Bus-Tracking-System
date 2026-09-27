import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(),tailwindcss(),
     VitePWA({ registerType: 'autoUpdate', manifest: {
      name: 'Bus Tracker — Driver', 
      short_name: 'BusTracker',
      theme_color: '#6fc795',
      icons: []
    }})
  ],
})
