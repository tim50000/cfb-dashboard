import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Change this to your actual repo name:
const repo = 'cfb-dashboard'

export default defineConfig({
  plugins: [react()],
  base: `/${repo}/`,
})
