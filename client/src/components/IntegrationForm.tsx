import { useEffect, useState } from 'react'
import { Form, Heading } from 'react-aria-components'

import { api } from '../lib/api'
import { toErrorMessage } from '../lib/error-utils'
import type { CredentialField, DetectedDevice, IntegrationMeta } from '../types'
import { RaisedButton } from './ui/button'
import { RaisedInput } from './ui/input'
import { TerminalButton } from './ui/terminal-button'

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
			if (error) {
				const val = error.value
				const msg =
					typeof val === 'object' && val != null && 'error' in val && typeof val.error === 'string'
						? val.error
						: 'Link failed'
				throw new Error(msg)
			}
			if (data && typeof data === 'object' && 'apiKey' in data && typeof data.apiKey === 'string') {
				setValues((v) => ({ ...v, apiKey: data.apiKey }))
			}
		} catch (e) {
			setHueLinkError(toErrorMessage(e))
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
			setError(toErrorMessage(e))
			setLoading(false)
		}
	}

	if (meta.oauthFlow) {
		return (
			<div>
				<Heading
					slot="title"
					className="font-michroma text-2xs text-stone-800 tracking-[0.15em] uppercase mb-1"
					style={{ textShadow: '0 -1px 0 rgba(0,0,0,0.15), 0 1px 0 rgba(255,255,255,0.4)' }}
				>
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
			<Heading
				slot="title"
				className="font-michroma text-2xs text-stone-800 tracking-[0.15em] uppercase mb-4"
				style={{ textShadow: '0 -1px 0 rgba(0,0,0,0.15), 0 1px 0 rgba(255,255,255,0.4)' }}
			>
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
					{hueLinkError && (
						<p className="font-ioskeley text-2xs text-red-700 mt-1">{hueLinkError}</p>
					)}
					{values.apiKey && (
						<p className="font-ioskeley text-2xs text-emerald-700 mt-1">bridge linked</p>
					)}
				</div>
			)}

			{error && (
				<div
					className="mb-4 p-3 rounded-lg font-ioskeley text-xs text-red-400"
					style={{
						background: 'rgba(239, 68, 68, 0.08)',
						border: '1px solid rgba(239, 68, 68, 0.15)',
					}}
				>
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
