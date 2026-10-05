import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    // rowCalc.ts/aggregate.ts import computeChannel from
    // ../../supabase/functions/_shared/calcEngine.ts (outside this project's
    // root) so the two never drift apart — allow the dev server to read it.
    fs: { allow: ['..'] },
  },
})
