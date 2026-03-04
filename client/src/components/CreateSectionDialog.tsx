import { useState } from 'react'
import { DialogTrigger, Heading } from 'react-aria-components'

import { RaisedButton } from './ui/button'
import { RaisedInput } from './ui/input'
import { RaisedModal } from './ui/modal'

interface CreateSectionDialogProps {
	onSubmit: (name: string) => Promise<void>
}

export function CreateSectionDialog({ onSubmit }: Readonly<CreateSectionDialogProps>) {
	const [name, setName] = useState('')
	const [error, setError] = useState('')
	const [submitting, setSubmitting] = useState(false)

	function validate(value: string): string {
		if (!value.trim()) return 'Name is required'
		if (value.length > 50) return 'Max 50 characters'
		if (!/^[a-zA-Z0-9 _-]+$/.test(value)) return 'Letters, numbers, spaces, hyphens only'
		return ''
	}

	return (
		<DialogTrigger>
			<RaisedButton variant="ghost" className="font-commit">
				+ Add Section
			</RaisedButton>
			<RaisedModal>
				{({ close }) => {
					async function handleSubmit() {
						const validationError = validate(name)
						if (validationError) {
							setError(validationError)
							return
						}
						setSubmitting(true)
						setError('')
						try {
							await onSubmit(name.trim())
							setName('')
							close()
						} catch (err) {
							const message = err instanceof Error ? err.message : 'Failed to create section'
							setError(message.includes('409') ? 'A section with this name already exists' : message)
						} finally {
							setSubmitting(false)
						}
					}

					return (
						<div className="space-y-4">
							<Heading slot="title" className="text-base font-commit font-medium text-stone-900">
								New Section
							</Heading>
							<RaisedInput
								label="Section name"
								placeholder="e.g. Living Room"
								value={name}
								onChange={setName}
								autoFocus
							/>
							{error && <p className="text-xs font-commit text-red-600">{error}</p>}
							<div className="flex justify-end gap-2">
								<RaisedButton variant="ghost" onPress={close}>
									Cancel
								</RaisedButton>
								<RaisedButton
									variant="primary"
									onPress={() => { void handleSubmit() }}
									isDisabled={submitting || !name.trim()}
								>
									{submitting ? 'Creating…' : 'Create'}
								</RaisedButton>
							</div>
						</div>
					)
				}}
			</RaisedModal>
		</DialogTrigger>
	)
}
