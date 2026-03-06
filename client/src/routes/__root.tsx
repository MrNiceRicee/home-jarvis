import { TanStackDevtools } from '@tanstack/react-devtools'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ReactQueryDevtoolsPanel } from '@tanstack/react-query-devtools'
import { createRootRoute, Outlet } from '@tanstack/react-router'
import { TanStackRouterDevtoolsPanel } from '@tanstack/react-router-devtools'
import { Toaster } from 'sonner'

import { Navbar } from '../components/Navbar'
import { useDeviceStream } from '../hooks/useDeviceStream'

const queryClient = new QueryClient({
	defaultOptions: {
		queries: {
			staleTime: 30_000,
			retry: 1,
		},
	},
})

function RootLayout() {
	return (
		<QueryClientProvider client={queryClient}>
			<AppShell />
		</QueryClientProvider>
	)
}

function AppShell() {
	useDeviceStream()

	return (
		<>
			<div className="min-h-screen bg-[#f5f2ec] text-stone-900">
				<Navbar />
				<main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
					<Outlet />
				</main>
			</div>
			<Toaster richColors position="bottom-right" />
			<TanStackDevtools
				plugins={[
					{ name: 'TanStack Query', render: <ReactQueryDevtoolsPanel /> },
					{ name: 'TanStack Router', render: <TanStackRouterDevtoolsPanel /> },
				]}
			/>
		</>
	)
}

export const Route = createRootRoute({ component: RootLayout })
