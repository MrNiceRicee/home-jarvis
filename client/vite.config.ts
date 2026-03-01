import tailwindcss from '@tailwindcss/vite'
import { tanstackRouter } from '@tanstack/router-vite-plugin'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
	plugins: [
		tanstackRouter({
			routesDirectory: './src/routes',
			generatedRouteTree: './src/routeTree.gen.ts',
		}),
		react(),
		tailwindcss(),
	],
	server: {
		port: 5173,
		proxy: {
			'/api': { target: 'http://localhost:3001', changeOrigin: true },
		},
	},
})
