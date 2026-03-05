// validates that a string is an RFC1918 private IP address
// rejects hostnames, loopback, link-local, and non-IP strings

const IPV4_REGEX = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/

export function isPrivateIp(ip: string): boolean {
	const match = IPV4_REGEX.exec(ip)
	if (!match) return false

	const a = Number(match[1])
	const b = Number(match[2])
	const c = Number(match[3])
	const d = Number(match[4])

	// reject out-of-range octets
	if (a > 255 || b > 255 || c > 255 || d > 255) return false

	// reject loopback (127.x.x.x)
	if (a === 127) return false

	// reject link-local (169.254.x.x)
	if (a === 169 && b === 254) return false

	// 10.0.0.0/8
	if (a === 10) return true

	// 172.16.0.0/12 (172.16.x.x – 172.31.x.x)
	if (a === 172 && b >= 16 && b <= 31) return true

	// 192.168.0.0/16
	if (a === 192 && b === 168) return true

	return false
}
