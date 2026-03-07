// shared error classes for cloud-authenticated adapters (vesync, resideo, etc.)

export class TokenExpiredError extends Error {
	constructor(message = 'Token expired') {
		super(message)
		this.name = 'TokenExpiredError'
	}
}

export class HttpError extends Error {
	status: number
	constructor(status: number, message?: string) {
		super(message ?? `HTTP ${status}`)
		this.name = 'HttpError'
		this.status = status
	}
}
