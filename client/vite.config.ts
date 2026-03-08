import tailwindcss from '@tailwindcss/vite'
import { tanstackRouter } from '@tanstack/router-vite-plugin'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

const clientPort = Number(process.env.CLIENT_PORT) || 5173
const serverPort = Number(process.env.PORT) || 3001

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
		port: clientPort,
		proxy: {
			'/api': { target: `http://localhost:${serverPort}`, changeOrigin: true },
		},
	},
})
