import { useEffect, useState } from 'react'
import {
	DialogTrigger,
	Form,
	Heading,
} from 'react-aria-components'

import type { IntegrationMeta, CredentialField, DetectedDevice } from '../types'

import { api } from '../lib/api'
import { cn } from '../lib/cn'
import { BRAND_ICON, FALLBACK_ICON } from '../lib/device-constants'
import { RaisedButton } from './ui/button'
import { TerminalButton } from './ui/terminal-button'

function BrandIcon({ brand }: Readonly<{ brand: string }>) {
	const Icon = BRAND_ICON[brand] ?? FALLBACK_ICON
	return <Icon size={24} weight="thin" className="text-stone-500 shrink-0" />
}
import { Card } from './ui/card'
import { RaisedInput } from './ui/input'
import { RaisedModal } from './ui/modal'


// brands that support local network scanning
const SCANNABLE_BRANDS = new Set(['hue', 'aqara', 'elgato'])

function formatDeviceCount(count: number) {
	const plural = count !== 1 ? 's' : ''
	return `${count} device${plural} found on network`
}

interface IntegrationFormProps {
	meta: IntegrationMeta
	isConfigured: boolean
	onSubmit: (brand: string, config: Record<string, string>) => Promise<void>
	onRemove: (brand: string) => Promise<void>
}

export function IntegrationCard({ meta, isConfigured, onSubmit, onRemove }: Readonly<IntegrationFormProps>) {
	const [scanResult, setScanResult] = useState<{ count: number; error?: string } | null>(null)
	const [scanning, setScanning] = useState(false)

	async function handleBrandScan() {
		setScanning(true)
		setScanResult(null)
		try {
			const { data, error } = await api.api.scan({ brand: meta.brand }).get()
			if (error) {
				setScanResult({ count: 0, error: (error.value as { error?: string })?.error ?? 'Scan failed' })
			} else {
				const devices = Array.isArray(data) ? data : []
				setScanResult({ count: devices.length })
			}
		} catch {
			setScanResult({ count: 0, error: 'Scan failed' })
		} finally {
			setScanning(false)
		}
	}

	const canScan = isConfigured && SCANNABLE_BRANDS.has(meta.brand)

	return (
		<Card className={isConfigured ? '!border-emerald-200' : ''}>
			<div className="p-4 flex items-center justify-between gap-3">
				<div className="flex items-center gap-3 min-w-0">
					<BrandIcon brand={meta.brand} />
					<div className="min-w-0">
						<p className="text-sm font-semibold text-stone-900">{meta.displayName}</p>
						<p className="text-xs text-stone-400 mt-0.5">
							{isConfigured ? '✓ Connected' : 'Not connected'}
						</p>
					</div>
				</div>
				<div className="flex items-center gap-2 shrink-0">
					{canScan && (
						<RaisedButton
							variant="ghost"
							size="sm"
							onPress={handleBrandScan}
							isDisabled={scanning}
						>
							{scanning ? 'Scanning...' : 'Scan'}
						</RaisedButton>
					)}
					{isConfigured && (
						<DialogTrigger>
							<RaisedButton variant="ghost" size="sm" className="text-red-500 hover:text-red-700 hover:bg-red-50">
								Remove
							</RaisedButton>
							<RaisedModal className="max-w-sm">
								{({ close }) => (
									<>
										<Heading
											slot="title"
											className="text-base font-semibold text-stone-900 mb-2"
										>
											Remove {meta.displayName}?
										</Heading>
										<p className="text-sm text-stone-500 mb-5">
											All devices from this integration will be removed from the portal. Matter
											accessories will be unexposed.
										</p>
										<div className="flex gap-2 justify-end">
											<RaisedButton variant="raised" size="md" onPress={close}>
												Cancel
											</RaisedButton>
											<RaisedButton
												variant="danger"
												size="md"
												onPress={async () => {
													await onRemove(meta.brand)
													close()
												}}
											>
												Remove
											</RaisedButton>
										</div>
									</>
								)}
							</RaisedModal>
						</DialogTrigger>
					)}
					{meta.discoveryOnly ? (
						!isConfigured && (
							<RaisedButton
								variant="primary"
								size="sm"
								onPress={() => void onSubmit(meta.brand, {})}
							>
								Connect
							</RaisedButton>
						)
					) : (
						<DialogTrigger>
							<RaisedButton variant="primary" size="sm">
								{isConfigured ? 'Edit' : 'Connect'}
							</RaisedButton>
							<RaisedModal>
								{({ close }) => (
									<IntegrationFormInner
										meta={meta}
										onSubmit={async (config) => {
											await onSubmit(meta.brand, config)
											close()
										}}
										onCancel={close}
									/>
								)}
							</RaisedModal>
						</DialogTrigger>
					)}
				</div>
			</div>
			{/* inline scan result */}
			{scanResult && (
				<div className={cn('px-4 pb-3 text-xs', scanResult.error ? 'text-red-600' : 'text-emerald-700')}>
					{scanResult.error
						? `Scan error: ${scanResult.error}`
						: formatDeviceCount(scanResult.count)}
				</div>
			)}
		</Card>
	)
}

// ─── Additional Device row (terminal-style for mission control aesthetic) ─────

interface AdditionalDeviceProps {
	detected: DetectedDevice
	brandDisplayName: string
	onAdd: () => void
	isAdding: boolean
	error?: boolean
	onRetry?: () => void
}

export function AdditionalDeviceRow({
	detected,
	onAdd,
	isAdding,
	error,
	onRetry,
}: Readonly<AdditionalDeviceProps>) {
	return (
		<div className="flex items-center justify-between py-2 border-b border-stone-200/40">
			<span className="font-ioskeley text-xs text-stone-700 truncate">
				<span className="text-stone-400 mr-1.5">*</span>
				{detected.label}
			</span>
			<span className="shrink-0 ml-3">
				{error ? (
					<span className="flex items-center gap-2">
						<span className="font-ioskeley text-2xs text-red-400">ERROR</span>
						{onRetry && <TerminalButton label="RETRY" onPress={onRetry} />}
					</span>
				) : (
					<TerminalButton label="ADD" onPress={onAdd} isDisabled={isAdding} />
				)}
			</span>
		</div>
	)
}

// ─── Quick Connect card (for auto-detected devices) ───────────────────────────

interface QuickConnectProps {
	detected: DetectedDevice
	meta: IntegrationMeta
	onSubmit: (brand: string, config: Record<string, string>) => Promise<void>
}

export function QuickConnectCard({ detected, meta, onSubmit }: Readonly<QuickConnectProps>) {
	const VIA_LABEL: Record<DetectedDevice['via'], string> = {
		upnp: 'found via local network',
		mdns: 'found via mDNS',
		udp: 'found via LAN',
	}

	return (
		<div
			className="rounded-xl border border-amber-200/80 p-4 flex items-center justify-between gap-3"
			style={{
				background: 'linear-gradient(to bottom, rgba(255,251,235,0.9), rgba(254,243,199,0.5))',
				boxShadow: '0 1px 3px rgba(217,119,6,0.06), 0 4px 12px rgba(217,119,6,0.04), inset 0 1px 0 rgba(255,255,255,0.7)',
			}}
		>
			<div className="flex items-center gap-3 min-w-0">
				<BrandIcon brand={detected.brand} />
				<div className="min-w-0">
					<p className="text-sm font-semibold text-stone-900">{detected.label}</p>
					<p className="text-xs text-amber-700 mt-0.5">{VIA_LABEL[detected.via]}</p>
				</div>
			</div>
			<DialogTrigger>
				<RaisedButton variant="amber" size="sm" className="shrink-0">
					Quick Connect
				</RaisedButton>
				<RaisedModal>
					{({ close }) => (
						<IntegrationFormInner
							meta={meta}
							prefill={detected.details}
							onSubmit={async (config) => {
								await onSubmit(meta.brand, config)
								close()
							}}
							onCancel={close}
						/>
					)}
				</RaisedModal>
			</DialogTrigger>
		</div>
	)
}

// ─── Inner form ───────────────────────────────────────────────────────────────

interface InnerProps {
	meta: IntegrationMeta
	prefill?: Record<string, string>
	onSubmit: (config: Record<string, string>) => Promise<void>
	onCancel: () => void
}

export function IntegrationFormInner({ meta, prefill, onSubmit, onCancel }: Readonly<InnerProps>) {
	const [values, setValues] = useState<Record<string, string>>(() =>
		Object.fromEntries(meta.fields.map((f) => [f.key, prefill?.[f.key] ?? ''])),
	)
	const [loading, setLoading] = useState(false)
	const [error, setError] = useState<string | null>(null)
	// Hue-specific state
	const [linkingHue, setLinkingHue] = useState(false)
	const [hueLinkError, setHueLinkError] = useState<string | null>(null)

	// Auto-discover Hue bridge IP when the form opens (if not already prefilled)
	useEffect(() => {
		if (meta.brand !== 'hue' || values.bridgeIp) return
		void api.api.integrations.hue['discover-bridges'].get().then(({ data: bridges }) => {
			const ip = Array.isArray(bridges) ? bridges[0]?.internalipaddress : undefined
			if (ip) setValues((v) => ({ ...v, bridgeIp: ip }))
		})
		// eslint-disable-next-line react-hooks/exhaustive-deps -- intentional mount-only: bridge discovery runs once when the form opens
	}, [])

	async function handleLinkHueBridge() {
		if (!values.bridgeIp) {
			setHueLinkError('Enter the bridge IP first')
			return
		}
		setLinkingHue(true)
		setHueLinkError(null)
		try {
			const { data, error } = await api.api.integrations.hue.link.post({
				bridgeIp: values.bridgeIp,
			})
			if (error) throw new Error((error.value as { error?: string })?.error ?? 'Link failed')
			setValues((v) => ({ ...v, apiKey: (data as { apiKey: string }).apiKey }))
		} catch (e) {
			setHueLinkError((e as Error).message)
		} finally {
			setLinkingHue(false)
		}
	}

	async function handleSubmit(e: React.SyntheticEvent) {
		e.preventDefault()
		setLoading(true)
		setError(null)
		try {
			await onSubmit(values)
		} catch (e) {
			setError((e as Error).message)
			setLoading(false)
		}
	}

	if (meta.oauthFlow) {
		return (
			<div>
				<Heading slot="title" className="font-michroma text-2xs text-stone-800 tracking-[0.15em] uppercase mb-1" style={{ textShadow: '0 -1px 0 rgba(0,0,0,0.15), 0 1px 0 rgba(255,255,255,0.4)' }}>
					{meta.displayName}
				</Heading>
				<p className="font-ioskeley text-xs text-stone-600 mb-5">
					Uses OAuth 2.0 — you'll be redirected to {meta.displayName} to authorize.
				</p>
				<div className="flex gap-2 justify-end">
					<RaisedButton variant="raised" onPress={onCancel}>
						Cancel
					</RaisedButton>
					<RaisedButton
						variant="primary"
						onPress={() => (window.location.href = `/api/integrations/${meta.brand}/oauth/start`)}
					>
						Authorize with {meta.displayName}
					</RaisedButton>
				</div>
			</div>
		)
	}

	return (
		<Form onSubmit={handleSubmit}>
			<Heading slot="title" className="font-michroma text-2xs text-stone-800 tracking-[0.15em] uppercase mb-4" style={{ textShadow: '0 -1px 0 rgba(0,0,0,0.15), 0 1px 0 rgba(255,255,255,0.4)' }}>
				Connect {meta.displayName}
			</Heading>

			<div className="space-y-3 mb-4">
				{meta.fields.map((field) => (
					<CredentialFieldInput
						key={field.key}
						field={field}
						value={values[field.key] ?? ''}
						onChange={(v) => setValues((prev) => ({ ...prev, [field.key]: v }))}
					/>
				))}
			</div>

			{/* Hue-specific: link bridge button */}
			{meta.brand === 'hue' && (
				<div className="mb-4">
					<RaisedButton
						variant="raised"
						onPress={handleLinkHueBridge}
						isDisabled={linkingHue || !values.bridgeIp}
						className="w-full"
					>
						{linkingHue ? 'Waiting for button press...' : 'Press Bridge Button & Link'}
					</RaisedButton>
					{hueLinkError && <p className="font-ioskeley text-2xs text-red-700 mt-1">{hueLinkError}</p>}
					{values.apiKey && (
						<p className="font-ioskeley text-2xs text-emerald-700 mt-1">bridge linked</p>
					)}
				</div>
			)}

			{error && (
				<div className="mb-4 p-3 rounded-lg font-ioskeley text-xs text-red-400" style={{ background: 'rgba(239, 68, 68, 0.08)', border: '1px solid rgba(239, 68, 68, 0.15)' }}>
					{error}
				</div>
			)}

			<div className="flex gap-2 justify-end">
				<RaisedButton variant="raised" onPress={onCancel}>
					Cancel
				</RaisedButton>
				<RaisedButton variant="primary" type="submit" isDisabled={loading}>
					{loading ? 'Connecting...' : 'Connect'}
				</RaisedButton>
			</div>
		</Form>
	)
}

function CredentialFieldInput({
	field,
	value,
	onChange,
}: Readonly<{
	field: CredentialField
	value: string
	onChange: (v: string) => void
}>) {
	return (
		<RaisedInput
			value={value}
			onChange={onChange}
			label={field.label}
			type={field.type}
			placeholder={field.placeholder}
			hint={field.hint}
		/>
	)
}
