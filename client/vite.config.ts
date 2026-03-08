import tailwindcss from '@tailwindcss/vite'
import { tanstackRouter } from '@tanstack/router-vite-plugin'
import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'

export default defineConfig(({ mode }) => {
	const env = loadEnv(mode, '..', '')
	const clientPort = Number(env.CLIENT_PORT) || 5173
	const serverPort = Number(env.PORT) || 3001

	return {
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
	}
})
