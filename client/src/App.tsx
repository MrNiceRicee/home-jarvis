import { BrowserRouter, Routes, Route, NavLink } from 'react-router-dom'
import Dashboard from './pages/Dashboard'
import Integrations from './pages/Integrations'
import HomeKit from './pages/HomeKit'

function Nav() {
  const linkClass = ({ isActive }: { isActive: boolean }) =>
    `px-3 py-2 rounded-md text-sm font-medium transition-colors ${
      isActive
        ? 'bg-gray-900 text-white'
        : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
    }`

  return (
    <nav className="bg-white border-b border-gray-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center h-14 gap-6">
          <span className="font-bold text-gray-900 mr-4">🏠 Home Jarvis</span>
          <NavLink to="/" end className={linkClass}>Dashboard</NavLink>
          <NavLink to="/integrations" className={linkClass}>Integrations</NavLink>
          <NavLink to="/homekit" className={linkClass}>HomeKit</NavLink>
        </div>
      </div>
    </nav>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <div className="min-h-screen bg-gray-50">
        <Nav />
        <main className="max-w-7xl mx-auto">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/integrations" element={<Integrations />} />
            <Route path="/homekit" element={<HomeKit />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  )
}
