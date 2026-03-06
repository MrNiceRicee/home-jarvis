import { Input as AriaInput, Label, TextField, FieldError, type TextFieldProps } from 'react-aria-components'

import { cn } from '../../lib/cn'

interface RaisedInputProps extends Omit<TextFieldProps, 'className'> {
	label: string
	type?: 'text' | 'password' | 'url' | 'email'
	placeholder?: string
	hint?: string
	className?: string
}

export function RaisedInput({ label, type = 'text', placeholder, hint, className = '', ...props }: Readonly<RaisedInputProps>) {
	return (
		<TextField className={cn('flex flex-col gap-1', className)} {...props}>
			<Label className="text-xs font-medium text-stone-600">{label}</Label>
			<AriaInput
				type={type}
				placeholder={placeholder}
				className={cn(
					'w-full px-3 py-2 text-sm rounded-lg',
					'bg-linear-to-b from-stone-50/80 to-surface-warm',
					'border border-stone-200/70',
					'shadow-[var(--shadow-inset)]',
					'placeholder:text-stone-300',
					'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stone-400 focus-visible:border-transparent',
					'transition',
				)}
			/>
			{hint && <span className="text-xs text-stone-400">{hint}</span>}
			<FieldError className="text-xs text-red-600" />
		</TextField>
	)
}
