import { useEffect, useState } from 'react'
import {
	Button,
	Form,
	Input,
	Label,
	TextField,
	FieldError,
	Dialog,
	DialogTrigger,
	Modal,
	ModalOverlay,
	Heading,
} from 'react-aria-components'

import type { IntegrationMeta, CredentialField, DetectedDevice } from '../types'

import { api } from '../lib/api'

const BRAND_ICON: Record<string, string> = {
	hue: '💡',
	govee: '🌈',
	vesync: '💨',
	lg: '📺',
	ge: '🏠',
	aqara: '🔗',
	smartthings: '⚡',
	resideo: '🌡️',
}

interface IntegrationFormProps {
	meta: IntegrationMeta
	isConfigured: boolean
	onSubmit: (brand: string, config: Record<string, string>) => Promise<void>
	onRemove: (brand: string) => Promise<void>
}

export function IntegrationCard({ meta, isConfigured, onSubmit, onRemove }: Readonly<IntegrationFormProps>) {
	return (
		<div
			className={`bg-white rounded-xl border transition-all ${isConfigured ? 'border-emerald-200 shadow-sm' : 'border-gray-200'}`}
		>
			<div className="p-4 flex items-center justify-between gap-3">
				<div className="flex items-center gap-3 min-w-0">
					<span className="text-2xl">{BRAND_ICON[meta.brand] ?? '📦'}</span>
					<div className="min-w-0">
						<p className="text-sm font-semibold text-gray-900">{meta.displayName}</p>
						<p className="text-xs text-gray-400 mt-0.5">
							{isConfigured ? '✓ Connected' : 'Not connected'}
						</p>
					</div>
				</div>
				<div className="flex items-center gap-2 shrink-0">
					{isConfigured && (
						<DialogTrigger>
							<Button className="text-xs text-red-500 hover:text-red-700 px-2 py-1 rounded-md hover:bg-red-50 transition-colors cursor-default pressed:bg-red-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500">
								Remove
							</Button>
							<ModalOverlay className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center entering:animate-in entering:fade-in exiting:animate-out exiting:fade-out">
								<Modal className="bg-white rounded-2xl shadow-xl w-full max-w-sm mx-4 entering:animate-in entering:zoom-in-95 exiting:animate-out exiting:zoom-out-95">
									<Dialog className="p-6 outline-none">
										{({ close }) => (
											<>
												<Heading
													slot="title"
													className="text-base font-semibold text-gray-900 mb-2"
												>
													Remove {meta.displayName}?
												</Heading>
												<p className="text-sm text-gray-500 mb-5">
													All devices from this integration will be removed from the portal. HomeKit
													accessories will be unexposed.
												</p>
												<div className="flex gap-2 justify-end">
													<Button
														onPress={close}
														className="px-3 py-1.5 text-sm rounded-lg bg-gray-100 text-gray-700 hover:bg-gray-200 cursor-default pressed:bg-gray-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-400"
													>
														Cancel
													</Button>
													<Button
														onPress={async () => {
															await onRemove(meta.brand)
															close()
														}}
														className="px-3 py-1.5 text-sm rounded-lg bg-red-600 text-white hover:bg-red-700 cursor-default pressed:bg-red-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500"
													>
														Remove
													</Button>
												</div>
											</>
										)}
									</Dialog>
								</Modal>
							</ModalOverlay>
						</DialogTrigger>
					)}
					<DialogTrigger>
						<Button className="text-xs font-medium px-3 py-1.5 rounded-lg bg-gray-900 text-white hover:bg-gray-700 cursor-default pressed:bg-black transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-500">
							{isConfigured ? 'Edit' : 'Connect'}
						</Button>
						<ModalOverlay className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center entering:animate-in entering:fade-in exiting:animate-out exiting:fade-out">
							<Modal className="bg-white rounded-2xl shadow-xl w-full max-w-md mx-4 entering:animate-in entering:zoom-in-95 exiting:animate-out exiting:zoom-out-95">
								<Dialog className="p-6 outline-none">
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
								</Dialog>
							</Modal>
						</ModalOverlay>
					</DialogTrigger>
				</div>
			</div>
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
		<div className="bg-amber-50 rounded-xl border border-amber-200 p-4 flex items-center justify-between gap-3">
			<div className="flex items-center gap-3 min-w-0">
				<span className="text-2xl">{BRAND_ICON[detected.brand] ?? '📦'}</span>
				<div className="min-w-0">
					<p className="text-sm font-semibold text-gray-900">{detected.label}</p>
					<p className="text-xs text-amber-700 mt-0.5">{VIA_LABEL[detected.via]}</p>
				</div>
			</div>
			<DialogTrigger>
				<Button className="text-xs font-medium px-3 py-1.5 rounded-lg bg-amber-600 text-white hover:bg-amber-700 cursor-default pressed:bg-amber-800 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 shrink-0">
					Quick Connect
				</Button>
				<ModalOverlay className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center entering:animate-in entering:fade-in exiting:animate-out exiting:fade-out">
					<Modal className="bg-white rounded-2xl shadow-xl w-full max-w-md mx-4 entering:animate-in entering:zoom-in-95 exiting:animate-out exiting:zoom-out-95">
						<Dialog className="p-6 outline-none">
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
						</Dialog>
					</Modal>
				</ModalOverlay>
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

function IntegrationFormInner({ meta, prefill, onSubmit, onCancel }: Readonly<InnerProps>) {
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
				<Heading slot="title" className="text-base font-semibold text-gray-900 mb-1">
					{meta.displayName}
				</Heading>
				<p className="text-sm text-gray-500 mb-5">
					Uses OAuth 2.0 — you'll be redirected to LG to authorize.
				</p>
				<div className="flex gap-2 justify-end">
					<Button
						onPress={onCancel}
						className="px-3 py-1.5 text-sm rounded-lg bg-gray-100 text-gray-700 hover:bg-gray-200 cursor-default pressed:bg-gray-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-400"
					>
						Cancel
					</Button>
					<Button
						onPress={() => (window.location.href = '/api/integrations/lg/oauth/start')}
						className="px-3 py-1.5 text-sm rounded-lg bg-gray-900 text-white hover:bg-gray-700 cursor-default pressed:bg-black focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-500"
					>
						Authorize with LG →
					</Button>
				</div>
			</div>
		)
	}

	return (
		<Form onSubmit={handleSubmit}>
			<Heading slot="title" className="text-base font-semibold text-gray-900 mb-4">
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
					<Button
						onPress={handleLinkHueBridge}
						isDisabled={linkingHue || !values.bridgeIp}
						type="button"
						className="w-full py-2 text-sm rounded-lg bg-orange-50 text-orange-700 border border-orange-200 hover:bg-orange-100 cursor-default pressed:bg-orange-200 disabled:opacity-40 focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-400 transition-colors"
					>
						{linkingHue ? 'Waiting for button press…' : '🔗 Press Bridge Button & Link'}
					</Button>
					{hueLinkError && <p className="text-xs text-red-600 mt-1">{hueLinkError}</p>}
					{values.apiKey && (
						<p className="text-xs text-emerald-600 mt-1">✓ Bridge linked successfully</p>
					)}
				</div>
			)}

			{error && (
				<div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
					{error}
				</div>
			)}

			<div className="flex gap-2 justify-end">
				<Button
					type="button"
					onPress={onCancel}
					className="px-3 py-1.5 text-sm rounded-lg bg-gray-100 text-gray-700 hover:bg-gray-200 cursor-default pressed:bg-gray-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-400"
				>
					Cancel
				</Button>
				<Button
					type="submit"
					isDisabled={loading}
					className="px-3 py-1.5 text-sm rounded-lg bg-gray-900 text-white hover:bg-gray-700 cursor-default pressed:bg-black disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-500"
				>
					{loading ? 'Connecting…' : 'Connect'}
				</Button>
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
		<TextField value={value} onChange={onChange} className="flex flex-col gap-1">
			<Label className="text-xs font-medium text-gray-700">{field.label}</Label>
			<Input
				type={field.type}
				placeholder={field.placeholder}
				className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 bg-white placeholder:text-gray-300 focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent transition"
			/>
			{field.hint && <span className="text-xs text-gray-400">{field.hint}</span>}
			<FieldError className="text-xs text-red-600" />
		</TextField>
	)
}
