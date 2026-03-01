import { createRootRoute, Outlet, Link } from '@tanstack/react-router'

function RootLayout() {
  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      <nav className="bg-white border-b border-gray-200 sticky top-0 z-10">
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
  )
}

function NavItem({ to, children }: { to: string; children: React.ReactNode }) {
  return (
    <Link
      to={to}
      className="px-3 py-1.5 rounded-md text-sm font-medium text-gray-500 hover:text-gray-900 hover:bg-gray-100 transition-colors [&.active]:bg-gray-900 [&.active]:text-white"
      activeOptions={to === '/' ? { exact: true } : undefined}
    >
      {children}
    </Link>
  )
}

export const Route = createRootRoute({ component: RootLayout })
