/**
 * Structured JSON logger — stdout/stderr output compatible with OTel log collectors.
 * Drop-in replacement when @elysiajs/opentelemetry is added later.
 */

type LogLevel = 'info' | 'warn' | 'error' | 'debug'

interface LogRecord {
	timestamp: string
	level: LogLevel
	message: string
	[key: string]: unknown
}

function emit(level: LogLevel, message: string, fields?: Record<string, unknown>) {
	const record: LogRecord = {
		timestamp: new Date().toISOString(),
		level,
		message,
		...fields,
	}
	const line = JSON.stringify(record)
	if (level === 'error' || level === 'warn') {
		process.stderr.write(line + '\n')
	} else {
		process.stdout.write(line + '\n')
	}
}

export const log = {
	info: (message: string, fields?: Record<string, unknown>) => emit('info', message, fields),
	warn: (message: string, fields?: Record<string, unknown>) => emit('warn', message, fields),
	error: (message: string, fields?: Record<string, unknown>) => emit('error', message, fields),
	debug: (message: string, fields?: Record<string, unknown>) => emit('debug', message, fields),
}
