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
			<Label className="text-xs font-medium text-gray-600">{label}</Label>
			<AriaInput
				type={type}
				placeholder={placeholder}
				className={[
					'w-full px-3 py-2 text-sm rounded-lg',
					'bg-linear-to-b from-gray-50/80 to-white',
					'border border-gray-200/80',
					'shadow-[var(--shadow-inset)]',
					'placeholder:text-gray-300',
					'focus:outline-none focus:ring-2 focus:ring-gray-800 focus:border-transparent',
					'transition',
				].join(' ')}
			/>
			{hint && <span className="text-xs text-gray-400">{hint}</span>}
			<FieldError className="text-xs text-red-600" />
		</TextField>
	)
}
