import {
	Input as AriaInput,
	FieldError,
	Label,
	TextField,
	type TextFieldProps,
} from 'react-aria-components'

import { cn } from '../../lib/cn'

interface RaisedInputProps extends Omit<TextFieldProps, 'className'> {
	label: string
	type?: 'text' | 'password' | 'url' | 'email'
	placeholder?: string
	hint?: string
	className?: string
}

export function RaisedInput({
	label,
	type = 'text',
	placeholder,
	hint,
	className = '',
	...props
}: Readonly<RaisedInputProps>) {
	return (
		<TextField className={cn('flex flex-col gap-1.5', className)} {...props}>
			<Label className="font-michroma text-2xs text-stone-700 tracking-[0.1em] uppercase">
				{label}
			</Label>
			<AriaInput
				type={type}
				placeholder={placeholder}
				className={cn(
					'w-full px-3 py-2 font-ioskeley text-xs rounded-lg',
					'bg-console-bg text-console-text',
					'border border-console-surface',
					'shadow-[var(--shadow-inset)]',
					'placeholder:text-console-text-dim',
					'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-console-text-muted focus-visible:border-transparent',
					'transition',
				)}
			/>
			{hint && <span className="font-ioskeley text-2xs text-stone-600">{hint}</span>}
			<FieldError className="font-ioskeley text-2xs text-red-500" />
		</TextField>
	)
}
