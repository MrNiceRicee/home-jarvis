import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'

import type { DetectedDevice, IntegrationsResponse } from '../types'

import { AdditionalDeviceRow } from '../components/IntegrationForm'
import { ModulePanel } from '../components/ModulePanel'
import { ScanLog } from '../components/ScanLog'
import { ConsolePanelLabel } from '../components/ui/console-panel'
import { useScanStream } from '../hooks/useScanStream'
import { api } from '../lib/api'
import { useDeviceStore } from '../stores/device-store'

interface IntegrationSearchParams {
	oauth?: string
	brand?: string
	error?: string
}

export const Route = createFileRoute('/integrations')({
	component: Integrations,
	validateSearch: (search: Record<string, unknown>): IntegrationSearchParams => ({
		oauth: typeof search.oauth === 'string' ? search.oauth : undefined,
		brand: typeof search.brand === 'string' ? search.brand : undefined,
		error: typeof search.error === 'string' ? search.error : undefined,
	}),
})

function extractErrorMessage(value: unknown, fallback: string): string {
	if (typeof value === 'object' && value !== null && 'message' in value) {
		return (value as { message: string }).message
	}
	if (typeof value === 'object' && value !== null && 'error' in value) {
		return (value as { error: string }).error
	}
	return fallback
}

async function fetchIntegrations(): Promise<IntegrationsResponse> {
	const { data, error } = await api.api.integrations.get()
	if (error)
		throw new Error(extractErrorMessage(error.value, 'Failed to fetch integrations'))
	return data ?? { configured: [], available: [] }
}

function Integrations() {
	const queryClient = useQueryClient()
	const navigate = useNavigate()
	const { oauth, brand: oauthBrand, error: oauthError } = Route.useSearch()
	const oauthHandled = useRef(false)

	// handle OAuth return — show toast and clean up URL params
	useEffect(() => {
		if (!oauth || oauthHandled.current) return
		oauthHandled.current = true

		if (oauth === 'success') {
			toast.success(`${oauthBrand ?? 'Integration'} connected successfully`)
			void queryClient.invalidateQueries({ queryKey: ['integrations'] })
		} else if (oauth === 'error') {
			const messages: Record<string, string> = {
				access_denied: 'Authorization was denied',
				invalid_state: 'Invalid or expired authorization link',
				brand_mismatch: 'Authorization mismatch — please try again',
				missing_code: 'No authorization code received',
				exchange_failed: 'Token exchange failed — please try again',
				code_expired: 'Authorization code expired — please try again',
			}
			toast.error(messages[oauthError ?? ''] ?? 'Authorization failed')
		}

		void navigate({ to: '/integrations', search: {}, replace: true })
	}, [oauth, oauthBrand, oauthError, queryClient, navigate])

	const { data, isLoading, isError, error } = useQuery({
		queryKey: ['integrations'],
		queryFn: fetchIntegrations,
	})

	const scan = useScanStream()

	// auto-scan on first visit
	useEffect(() => {
		if (scan.status === 'idle') scan.startScan()
		// eslint-disable-next-line react-hooks/exhaustive-deps -- only on mount
	}, [])

	const addMutation = useMutation({
		mutationFn: async ({ brand, config }: { brand: string; config: Record<string, string> }) => {
			const { error } = await api.api.integrations.post({ brand, config })
			if (error) throw new Error(extractErrorMessage(error.value, 'Failed to connect'))
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
			if (error)
				throw new Error(extractErrorMessage(error.value, 'Failed to add device'))
			return data
		},
	})

	// error/connecting state for discovery-only connect
	const [failedBrand, setFailedBrand] = useState<{ brand: string; message: string } | null>(null)
	const [connectingBrand, setConnectingBrand] = useState<string | null>(null)

	const existingDevices = useDeviceStore((s) => s.devices)

	if (isLoading) {
		return (
			<div className="flex items-center justify-center py-24">
				<span className="font-ioskeley text-xs text-stone-400 animate-pulse tracking-widest">
					LOADING...
				</span>
			</div>
		)
	}

	if (isError) {
		return (
			<div className="flex flex-col items-center justify-center py-24 text-center">
				<p className="text-sm font-medium text-red-600 mb-1">Failed to load integrations</p>
				<p className="text-xs text-stone-400">{error?.message ?? 'Unknown error'}</p>
			</div>
		)
	}

	const configuredBrands = new Set(data?.configured?.map((i) => i.brand) ?? [])
	const existingIps = new Set(
		existingDevices.map((d) => d.externalId.replace(/:\d+$/, '')),
	)

	function isAlreadyAdded(d: DetectedDevice) {
		const ip = d.details.ip ?? d.details.bridgeIp
		return ip ? existingIps.has(ip) : false
	}

	function isBridgeHub(d: DetectedDevice) {
		return d.brand === 'hue' && d.details.bridgeIp != null
	}

	const additionalDevices = scan.devices.filter(
		(d) => configuredBrands.has(d.brand) && !isAlreadyAdded(d) && !isBridgeHub(d),
	)

	const brandDisplayName = (brand: string) =>
		data?.available?.find((m) => m.brand === brand)?.displayName ?? brand

	const deviceCountByBrand = new Map<string, number>()
	for (const d of existingDevices) {
		const count = deviceCountByBrand.get(d.brand) ?? 0
		deviceCountByBrand.set(d.brand, count + 1)
	}

	const connectedModules = (data?.available ?? []).filter((m) => configuredBrands.has(m.brand))
	const availableModules = (data?.available ?? []).filter((m) => !configuredBrands.has(m.brand))

	async function handleSubmit(brand: string, config: Record<string, string>) {
		setConnectingBrand(brand)
		try {
			await addMutation.mutateAsync({ brand, config })
			setConnectingBrand(null)
			setFailedBrand(null)
		} catch (e) {
			setConnectingBrand(null)
			setFailedBrand({ brand, message: (e as Error).message })
		}
	}

	async function handleRemove(brand: string) {
		await removeMutation.mutateAsync(brand)
	}

	function handleRescan() {
		setFailedBrand(null)
		scan.startScan()
	}

	function handleRetry(brand: string) {
		setFailedBrand(null)
		void handleSubmit(brand, {})
	}

	const scanning = scan.status === 'scanning'

	return (
		<div>
			{/* header */}
			<div className="mb-8">
				<h1 className="font-michroma text-sm font-semibold text-stone-800 tracking-[0.15em] uppercase">
					Integrations
				</h1>
			</div>

			{/* scan section */}
			<section className="mb-8">
				<ConsolePanelLabel>Network Scan</ConsolePanelLabel>
				<ScanLog
					brands={scan.brands}
					brandResults={scan.brandResults}
					scanning={scanning}
					done={scan.status === 'done'}
					error={scan.error}
					brandDisplayName={brandDisplayName}
					onRescan={handleRescan}
				/>
			</section>

			{/* additional devices from connected brands */}
			{additionalDevices.length > 0 && (
				<section className="mb-8">
					<ConsolePanelLabel>Additional Devices</ConsolePanelLabel>
					<div>
						{additionalDevices.map((detected, i) => (
							<AdditionalDeviceRow
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
				</section>
			)}

			{/* module rack */}
			<section>
				<ConsolePanelLabel>Integrations</ConsolePanelLabel>
				<div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
					{connectedModules.map((meta, i) => {
						const integration = data?.configured?.find((c) => c.brand === meta.brand)
						if (!integration) return null
						return (
							<ModulePanel
								key={meta.brand}
								index={i}
								state="connected"
								integration={integration}
								deviceCount={deviceCountByBrand.get(meta.brand) ?? 0}
								meta={meta}
								onRemove={() => void handleRemove(meta.brand)}
							/>
						)
					})}
					{availableModules.map((meta, i) => {
						const idx = connectedModules.length + i
						if (failedBrand?.brand === meta.brand) {
							return (
								<ModulePanel
									key={meta.brand}
									index={idx}
									state="error"
									meta={meta}
									errorMessage={failedBrand.message}
									onRetry={() => handleRetry(meta.brand)}
								/>
							)
						}
						if (connectingBrand === meta.brand) {
							return (
								<ModulePanel
									key={meta.brand}
									index={idx}
									state="connecting"
									meta={meta}
								/>
							)
						}
						return (
							<ModulePanel
								key={meta.brand}
								index={idx}
								state="available"
								meta={meta}
								onSubmit={handleSubmit}
							/>
						)
					})}
				</div>
			</section>

		</div>
	)
}
