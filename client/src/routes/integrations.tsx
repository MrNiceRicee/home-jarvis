import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'

import type { DetectedDevice, IntegrationsResponse } from '../types'

import { IntegrationCard, QuickConnectCard } from '../components/IntegrationForm'
import { api } from '../lib/api'

export const Route = createFileRoute('/integrations')({ component: Integrations })

async function fetchIntegrations(): Promise<IntegrationsResponse> {
	const { data, error } = await api.api.integrations.get()
	if (error) throw new Error((error.value as { message?: string })?.message ?? 'Failed to fetch integrations')
	return data ?? { configured: [], available: [] }
}

async function fetchScan(): Promise<DetectedDevice[]> {
	const { data } = await api.api.scan.get()
	return Array.isArray(data) ? data : []
}

function Integrations() {
	const queryClient = useQueryClient()

	const { data, isLoading, isError, error } = useQuery({
		queryKey: ['integrations'],
		queryFn: fetchIntegrations,
	})

	const {
		data: scanned = [],
		isFetching: scanning,
		refetch: refetchScan,
	} = useQuery({
		queryKey: ['scan'],
		queryFn: fetchScan,
		staleTime: 0,
		retry: false,
	})

	const addMutation = useMutation({
		mutationFn: async ({ brand, config }: { brand: string; config: Record<string, string> }) => {
			const { error } = await api.api.integrations.post({ brand, config })
			if (error) throw new Error((error.value as { error?: string })?.error ?? 'Failed to connect')
		},
		onSuccess: () => {
			void queryClient.invalidateQueries({ queryKey: ['integrations'] })
			void queryClient.invalidateQueries({ queryKey: ['scan'] })
		},
	})

	const removeMutation = useMutation({
		mutationFn: async (brand: string) => {
			const integration = data?.configured?.find((i) => i.brand === brand)
			if (!integration) return
			await api.api.integrations({ id: integration.id }).delete()
		},
		onSuccess: () => {
			void queryClient.invalidateQueries({ queryKey: ['integrations'] })
		},
	})

	if (isLoading) {
		return (
			<div className="flex items-center justify-center py-24">
				<div className="text-sm text-gray-400">Loading…</div>
			</div>
		)
	}

	if (isError) {
		return (
			<div className="flex flex-col items-center justify-center py-24 text-center">
				<p className="text-sm font-medium text-red-600 mb-1">Failed to load integrations</p>
				<p className="text-xs text-gray-400">{error?.message ?? 'Unknown error'}</p>
				<p className="text-xs text-gray-400 mt-1">Is the server running on port 3001?</p>
			</div>
		)
	}

	const configuredBrands = new Set(data?.configured?.map((i) => i.brand) ?? [])
	const unconnectedScanned = scanned.filter((d) => !configuredBrands.has(d.brand))

	async function handleSubmit(brand: string, config: Record<string, string>) {
		await addMutation.mutateAsync({ brand, config })
	}

	async function handleRemove(brand: string) {
		await removeMutation.mutateAsync(brand)
	}

	return (
		<div>
			<div className="mb-6">
				<h1 className="text-xl font-semibold text-gray-900">Integrations</h1>
				<p className="text-sm text-gray-400 mt-0.5">Connect your smart home device accounts</p>
			</div>

			{/* ── Detected on network ─────────────────────────────────────────────── */}
			<div className="mb-6">
				<div className="flex items-center justify-between mb-2">
					<div className="flex items-center gap-2">
						<h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
							Detected on Your Network
						</h2>
						{scanning && <span className="text-xs text-amber-600 animate-pulse">Scanning…</span>}
					</div>
					<button
						type="button"
						onClick={() => { void refetchScan() }}
						disabled={scanning}
						className="text-xs text-gray-400 hover:text-gray-600 disabled:opacity-40 transition-colors"
					>
						{scanning ? 'Scanning…' : 'Scan again'}
					</button>
				</div>

				{!scanning && unconnectedScanned.length === 0 && (
					<p className="text-xs text-gray-400">No devices detected. Make sure your hubs are powered on.</p>
				)}

				<div className="space-y-2">
					{unconnectedScanned.map((detected, i) => {
						const meta = data?.available?.find((m) => m.brand === detected.brand)
						if (!meta) return null
						return (
							<QuickConnectCard
								key={`${detected.brand}-${i}`}
								detected={detected}
								meta={meta}
								onSubmit={handleSubmit}
							/>
						)
					})}
				</div>
			</div>

			{/* ── All integrations ─────────────────────────────────────────────────── */}
			<div className="space-y-3">
				{(data?.available ?? []).map((meta) => (
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
