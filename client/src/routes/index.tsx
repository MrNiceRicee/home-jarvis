import { createFileRoute } from '@tanstack/react-router'
import { useDeviceStream } from '../hooks/useDeviceStream'
import { DeviceCard } from '../components/DeviceCard'
import { Link } from '@tanstack/react-router'
import type { Device, DeviceState } from '../types'

export const Route = createFileRoute('/')({ component: Dashboard })

function Dashboard() {
  const { devices, status } = useDeviceStream()

  // Group by brand
  const grouped = devices.reduce<Record<string, Device[]>>((acc, d) => {
    ;(acc[d.brand] ??= []).push(d)
    return acc
  }, {})

  async function handleHomekitToggle(deviceId: string, enabled: boolean) {
    await fetch(`/api/devices/${deviceId}/homekit`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled }),
    })
  }

  async function handleStateChange(deviceId: string, state: Partial<DeviceState>) {
    await fetch(`/api/devices/${deviceId}/state`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(state),
    })
  }

  if (devices.length === 0 && status === 'connected') {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <span className="text-5xl mb-4">🏠</span>
        <h2 className="text-lg font-semibold text-gray-900 mb-1">No devices yet</h2>
        <p className="text-sm text-gray-500 mb-6">Add an integration to start discovering your smart home devices.</p>
        <Link
          to="/integrations"
          className="px-4 py-2 bg-gray-900 text-white text-sm rounded-lg hover:bg-gray-700 transition-colors"
        >
          Add Integration →
        </Link>
      </div>
    )
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Dashboard</h1>
          <p className="text-sm text-gray-400 mt-0.5">{devices.length} device{devices.length !== 1 ? 's' : ''}</p>
        </div>
        <StreamStatusBadge status={status} />
      </div>

      {Object.entries(grouped).map(([brand, brandDevices]) => (
        <section key={brand} className="mb-8">
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">{brand}</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {brandDevices.map(device => (
              <DeviceCard
                key={device.id}
                device={device}
                onHomekitToggle={handleHomekitToggle}
                onStateChange={handleStateChange}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}

function StreamStatusBadge({ status }: { status: string }) {
  if (status === 'connected') return null
  return (
    <span className={`flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full
      ${status === 'reconnecting' ? 'bg-amber-50 text-amber-700' : 'bg-gray-100 text-gray-500'}`}
    >
      <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" />
      {status === 'reconnecting' ? 'Reconnecting…' : 'Connecting…'}
    </span>
  )
}
