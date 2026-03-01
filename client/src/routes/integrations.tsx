import { createFileRoute } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { IntegrationCard } from '../components/IntegrationForm'
import type { IntegrationsResponse } from '../types'

export const Route = createFileRoute('/integrations')({ component: Integrations })

function Integrations() {
  const [data, setData] = useState<IntegrationsResponse | null>(null)
  const [loading, setLoading] = useState(true)

  async function load() {
    const res = await fetch('/api/integrations')
    setData(await res.json() as IntegrationsResponse)
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  async function handleSubmit(brand: string, config: Record<string, string>) {
    const res = await fetch('/api/integrations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ brand, config }),
    })
    if (!res.ok) {
      const err = await res.json() as { error: string }
      throw new Error(err.error)
    }
    await load()
  }

  async function handleRemove(brand: string) {
    const integration = data?.configured.find(i => i.brand === brand)
    if (!integration) return
    await fetch(`/api/integrations/${integration.id}`, { method: 'DELETE' })
    await load()
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="text-sm text-gray-400">Loading…</div>
      </div>
    )
  }

  const configuredBrands = new Set(data?.configured.map(i => i.brand) ?? [])

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-gray-900">Integrations</h1>
        <p className="text-sm text-gray-400 mt-0.5">Connect your smart home device accounts</p>
      </div>

      <div className="space-y-3">
        {(data?.available ?? []).map(meta => (
          <IntegrationCard
            key={meta.brand}
            meta={meta}
            isConfigured={configuredBrands.has(meta.brand)}
            onSubmit={handleSubmit}
            onRemove={handleRemove}
          />
        ))}
      </div>
    </div>
  )
}
