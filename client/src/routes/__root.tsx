import { TanStackDevtools } from '@tanstack/react-devtools'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ReactQueryDevtoolsPanel } from '@tanstack/react-query-devtools'
import { createRootRoute, Outlet, Link } from '@tanstack/react-router'
import { TanStackRouterDevtoolsPanel } from '@tanstack/react-router-devtools'
import { Toaster } from 'sonner'

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
			<div className="min-h-screen bg-[#f5f3f0] text-gray-900">
				<nav
					className="sticky top-0 z-10 border-b border-white/40"
					style={{
						background: 'linear-gradient(to bottom, rgba(255,255,255,0.95), rgba(245,243,240,0.9))',
						boxShadow: '0 1px 3px rgba(0,0,0,0.04), 0 4px 12px rgba(0,0,0,0.03), inset 0 -1px 0 rgba(0,0,0,0.04)',
						backdropFilter: 'blur(12px)',
					}}
				>
					<div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
						<div className="flex items-center h-14 gap-1">
							<span className="font-semibold text-gray-900 mr-5 text-sm tracking-tight">
								Home Jarvis
							</span>
							<NavItem to="/">Dashboard</NavItem>
							<NavItem to="/integrations">Integrations</NavItem>
							<NavItem to="/homekit">HomeKit</NavItem>
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
		</QueryClientProvider>
	)
}

function NavItem({ to, children }: Readonly<{ to: string; children: React.ReactNode }>) {
	return (
		<Link
			to={to}
			className={cn(
				'px-3 py-1.5 rounded-lg text-sm font-medium transition-all',
				'text-gray-500 hover:text-gray-900',
				'[&.active]:bg-white [&.active]:text-gray-900 [&.active]:shadow-[0_1px_3px_rgba(0,0,0,0.06),0_2px_8px_rgba(0,0,0,0.04),inset_0_1px_0_rgba(255,255,255,0.8)]',
			)}
			activeOptions={to === '/' ? { exact: true } : undefined}
		>
			{children}
		</Link>
	)
}

export const Route = createRootRoute({ component: RootLayout })
