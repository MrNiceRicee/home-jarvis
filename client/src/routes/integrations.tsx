import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { useEffect } from 'react'

import type { IntegrationsResponse } from '../types'

import { IntegrationCard, QuickConnectCard } from '../components/IntegrationForm'
import { useScanStream } from '../hooks/useScanStream'
import { api } from '../lib/api'

export const Route = createFileRoute('/integrations')({ component: Integrations })

async function fetchIntegrations(): Promise<IntegrationsResponse> {
	const { data, error } = await api.api.integrations.get()
	if (error) throw new Error((error.value as { message?: string })?.message ?? 'Failed to fetch integrations')
	return data ?? { configured: [], available: [] }
}

function Integrations() {
	const queryClient = useQueryClient()

	const { data, isLoading, isError, error } = useQuery({
		queryKey: ['integrations'],
		queryFn: fetchIntegrations,
	})

	const scan = useScanStream()

	// auto-scan on first mount
	useEffect(() => {
		if (scan.status === 'idle') scan.startScan()
		// eslint-disable-next-line react-hooks/exhaustive-deps -- only on mount
	}, [])

	const addMutation = useMutation({
		mutationFn: async ({ brand, config }: { brand: string; config: Record<string, string> }) => {
			const { error } = await api.api.integrations.post({ brand, config })
			if (error) throw new Error((error.value as { error?: string })?.error ?? 'Failed to connect')
		},
		onSuccess: () => {
			void queryClient.invalidateQueries({ queryKey: ['integrations'] })
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
	const unconnectedScanned = scan.devices.filter((d) => !configuredBrands.has(d.brand))
	const scanning = scan.status === 'scanning'
	const completedBrandSet = new Set(scan.brandResults.map((r) => r.brand))

	// map brand key → display name from available integrations
	const brandDisplayName = (brand: string) =>
		data?.available?.find((m) => m.brand === brand)?.displayName ?? brand

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
					<h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
						Detected on Your Network
					</h2>
					<button
						type="button"
						onClick={scan.startScan}
						disabled={scanning}
						className="text-xs text-gray-400 hover:text-gray-600 disabled:opacity-40 transition-colors"
					>
						{scanning ? 'Scanning…' : 'Scan again'}
					</button>
				</div>

				{/* per-brand scan progress */}
				{scanning && scan.brands.length > 0 && (
					<div className="flex flex-wrap gap-2 mb-3">
						{scan.brands.map((brand) => {
							const result = scan.brandResults.find((r) => r.brand === brand)
							const done = completedBrandSet.has(brand)
							return (
								<span
									key={brand}
									className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${
										result?.error
											? 'bg-red-50 text-red-600'
											: done
												? 'bg-emerald-50 text-emerald-700'
												: 'bg-amber-50 text-amber-600 animate-pulse'
									}`}
								>
									{brandDisplayName(brand)}
									{!done && ' …'}
									{done && !result?.error && ` · ${result?.count ?? 0}`}
									{result?.error && ' · error'}
								</span>
							)
						})}
					</div>
				)}

				{/* done summary */}
				{scan.status === 'done' && scan.brandResults.length > 0 && (
					<div className="flex flex-wrap gap-2 mb-3">
						{scan.brandResults.map((r) => (
							<span
								key={r.brand}
								className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${
									r.error ? 'bg-red-50 text-red-600' : r.count > 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-500'
								}`}
							>
								{brandDisplayName(r.brand)} · {r.error ? 'error' : `${r.count} found`}
							</span>
						))}
					</div>
				)}

				{!scanning && unconnectedScanned.length === 0 && scan.status !== 'idle' && (
					<p className="text-xs text-gray-400">No new devices detected. Make sure your hubs are powered on.</p>
				)}

				<div className="space-y-2">
					{unconnectedScanned.map((detected, i) => {
						const meta = data?.available?.find((m) => m.brand === detected.brand)
						if (!meta) return null
						return (
							<QuickConnectCard
								key={`${detected.brand}-${detected.details.ip ?? detected.details.bridgeIp ?? i}`}
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
