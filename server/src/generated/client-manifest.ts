// Stub for development — overwritten by `bun run gen:client` during production build.
// In dev, the client is served by Vite on port 5173.
export type ClientAsset = { content: string; contentType: string; binary: boolean }
export const clientAssets: Record<string, ClientAsset> = {}
export const hasClientAssets = false
