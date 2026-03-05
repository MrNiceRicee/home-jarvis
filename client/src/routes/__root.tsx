import { TanStackDevtools } from '@tanstack/react-devtools'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ReactQueryDevtoolsPanel } from '@tanstack/react-query-devtools'
import { createRootRoute, Outlet, Link } from '@tanstack/react-router'
import { TanStackRouterDevtoolsPanel } from '@tanstack/react-router-devtools'
import { Toaster } from 'sonner'

import { useDeviceStream } from '../hooks/useDeviceStream'
import { cn } from '../lib/cn'

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
	// SSE device stream runs app-wide so ['devices'] cache is always populated
	useDeviceStream()

	return (
		<>
			<div className="min-h-screen bg-[#f5f2ec] text-stone-900">
				<nav
					className="sticky top-0 z-10 border-b border-[rgba(168,151,125,0.12)]"
					style={{
						background: 'linear-gradient(to bottom, rgba(255,253,248,0.95), rgba(245,242,236,0.9))',
						boxShadow: '0 1px 3px rgba(120,90,50,0.03), 0 4px 12px rgba(120,90,50,0.02), inset 0 -1px 0 rgba(120,90,50,0.04)',
						backdropFilter: 'blur(12px)',
					}}
				>
					<div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
						<div className="flex items-center h-14 gap-1">
							<span className="font-semibold text-stone-800 mr-5 text-sm tracking-tight">
								Home Jarvis
							</span>
							<NavItem to="/">Dashboard</NavItem>
							<NavItem to="/integrations">Integrations</NavItem>
							<NavItem to="/matter">Matter</NavItem>
						</div>
					</div>
				</nav>
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

function NavItem({ to, children }: Readonly<{ to: string; children: React.ReactNode }>) {
	return (
		<Link
			to={to}
			className={cn(
				'px-3 py-1.5 rounded-lg text-sm font-medium transition-all',
				'text-stone-500 hover:text-stone-800',
				'[&.active]:bg-surface-warm [&.active]:text-stone-800 [&.active]:shadow-[0_1px_3px_rgba(120,90,50,0.05),0_2px_8px_rgba(120,90,50,0.03),inset_0_1px_0_rgba(255,253,245,0.8)]',
			)}
			activeOptions={to === '/' ? { exact: true } : undefined}
		>
			{children}
		</Link>
	)
}

export const Route = createRootRoute({ component: RootLayout })
