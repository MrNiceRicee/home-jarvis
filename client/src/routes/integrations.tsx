import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { useEffect } from 'react'

import type { DetectedDevice, Device, IntegrationsResponse } from '../types'

import { AdditionalDeviceCard, IntegrationCard, QuickConnectCard } from '../components/IntegrationForm'
import { useScanStream } from '../hooks/useScanStream'
import { api } from '../lib/api'
import { cn } from '../lib/cn'

export const Route = createFileRoute('/integrations')({ component: Integrations })

function scanPillClass(error: string | undefined, done: boolean) {
	if (error) return 'bg-red-50 text-red-600'
	if (done) return 'bg-emerald-50 text-emerald-700'
	return 'bg-amber-50 text-amber-600 animate-pulse'
}

function resultPillClass(r: { error?: string; count: number }) {
	if (r.error) return 'bg-red-50 text-red-600'
	if (r.count > 0) return 'bg-emerald-50 text-emerald-700'
	return 'bg-stone-100 text-stone-500'
}

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

	// auto-scan on first visit (skip if we already have results from a previous scan)
	useEffect(() => {
		if (scan.status === 'idle') scan.startScan()
		// eslint-disable-next-line react-hooks/exhaustive-deps -- only on mount, skip if cache has data
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

	const addDeviceMutation = useMutation({
		mutationFn: async ({ brand, ip }: { brand: string; ip: string }) => {
			const { data, error } = await api.api.devices['add-from-scan'].post({ brand, ip })
			if (error) throw new Error((error.value as { error?: string })?.error ?? 'Failed to add device')
			return data
		},
		onSuccess: (data) => {
			if (!data?.devices?.length) return
			// merge newly-added devices into SSE cache so they appear on dashboard
			// and get filtered out of "Additional devices found"
			queryClient.setQueryData(['devices'], (prev: Device[] = []) => {
				const existingIds = new Set(prev.map((d) => d.id))
				const newDevices = (data.devices as Device[]).filter((d) => !existingIds.has(d.id))
				return [...prev, ...newDevices]
			})
		},
	})

	// reactively subscribe to SSE device cache so filtering re-renders when snapshot arrives
	const { data: existingDevices = [] } = useQuery<Device[]>({
		queryKey: ['devices'],
		queryFn: () => [], // SSE populates this — never fetched
		staleTime: Infinity,
		gcTime: Infinity,
	})

	if (isLoading) {
		return (
			<div className="flex items-center justify-center py-24">
				<div className="text-sm text-stone-400">Loading…</div>
			</div>
		)
	}

	if (isError) {
		return (
			<div className="flex flex-col items-center justify-center py-24 text-center">
				<p className="text-sm font-medium text-red-600 mb-1">Failed to load integrations</p>
				<p className="text-xs text-stone-400">{error?.message ?? 'Unknown error'}</p>
				<p className="text-xs text-stone-400 mt-1">Is the server running on port 3001?</p>
			</div>
		)
	}

	const configuredBrands = new Set(data?.configured?.map((i) => i.brand) ?? [])
	const existingIps = new Set(
		existingDevices.map((d) => d.externalId.replace(/:\d+$/, '')), // strip port suffix e.g. "192.168.1.28:0" → "192.168.1.28"
	)

	// check if a detected device matches one already in the system
	function isAlreadyAdded(d: DetectedDevice) {
		const ip = d.details.ip ?? d.details.bridgeIp
		return ip ? existingIps.has(ip) : false
	}

	// hue scan returns the bridge hub, not individual devices — filter it out when already connected
	function isBridgeHub(d: DetectedDevice) {
		return d.brand === 'hue' && d.details.bridgeIp != null
	}

	// devices from brands not yet connected — show as Quick Connect
	const newBrandDevices = scan.devices.filter((d) => !configuredBrands.has(d.brand))
	// devices from already-connected brands, excluding already-added ones and bridge hubs
	const additionalDevices = scan.devices.filter(
		(d) => configuredBrands.has(d.brand) && !isAlreadyAdded(d) && !isBridgeHub(d),
	)
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
				<h1 className="text-xl font-semibold text-stone-900">Integrations</h1>
				<p className="text-sm text-stone-400 mt-0.5">Connect your smart home device accounts</p>
			</div>

			{/* ── Detected on network ─────────────────────────────────────────────── */}
			<div className="mb-6">
				<div className="flex items-center justify-between mb-2">
					<h2 className="text-xs font-semibold text-stone-500 uppercase tracking-wide">
						Detected on Your Network
					</h2>
					<button
						type="button"
						onClick={scan.startScan}
						disabled={scanning}
						className="text-xs text-stone-400 hover:text-stone-600 disabled:opacity-40 transition-colors"
					>
						{scanning ? 'Scanning...' : 'Scan again'}
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
									className={cn('inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium', scanPillClass(result?.error, done))}
								>
									{brandDisplayName(brand)}
									{!done && ' ...'}
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
								className={cn('inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium', resultPillClass(r))}
							>
								{brandDisplayName(r.brand)} · {r.error ? 'error' : `${r.count} found`}
							</span>
						))}
					</div>
				)}

				{!scanning && newBrandDevices.length === 0 && additionalDevices.length === 0 && scan.status !== 'idle' && (
					<p className="text-xs text-stone-400">No new devices detected. Make sure your hubs are powered on.</p>
				)}

				<div className="space-y-2">
					{newBrandDevices.map((detected, i) => {
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

			{/* ── Additional devices for connected brands ─────────────────────── */}
			{additionalDevices.length > 0 && (
				<div className="mb-6">
					<div className="flex items-center justify-between mb-2">
						<h2 className="text-xs font-semibold text-stone-500 uppercase tracking-wide">
							Additional Devices Found
						</h2>
						<span className="text-xs text-stone-400">
							{additionalDevices.length} device{additionalDevices.length !== 1 ? 's' : ''} from connected brands
						</span>
					</div>
					<div className="space-y-2">
						{additionalDevices.map((detected, i) => (
							<AdditionalDeviceCard
								key={`additional-${detected.brand}-${detected.details.ip ?? detected.details.bridgeIp ?? i}`}
								detected={detected}
								brandDisplayName={brandDisplayName(detected.brand)}
								onAdd={() => {
									const ip = detected.details.ip ?? detected.details.bridgeIp
									if (ip) addDeviceMutation.mutate({ brand: detected.brand, ip })
								}}
								isAdding={addDeviceMutation.isPending}
							/>
						))}
					</div>
				</div>
			)}

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
