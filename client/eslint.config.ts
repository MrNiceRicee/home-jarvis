import boundaries from 'eslint-plugin-boundaries'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'
import globals from 'globals'

import { baseConfig } from '../eslint.config.base.ts'

/**
 * Client layer architecture:
 *
 *   routes → components → lib
 *            components → hooks
 *   routes → hooks → lib
 *   lib (leaf — imports from workspace packages only, never server/src)
 *   hooks (leaf — no component imports)
 */
export default defineConfig([
	// Don't lint the ESLint config itself (meta file, not source code)
	globalIgnores(['dist', 'src/routeTree.gen.ts', 'eslint.config.ts']),
	...baseConfig,
	{
		files: ['**/*.{ts,tsx}'],
		plugins: {
			'react-hooks': reactHooks,
			'react-refresh': reactRefresh,
		},
		languageOptions: {
			globals: globals.browser,
			parserOptions: {
				tsconfigRootDir: import.meta.dirname,
			},
		},
		rules: {
			...reactHooks.configs.recommended.rules,
			'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
			// React Compiler rules — downgrade to warn until compiler is adopted
			'react-hooks/immutability': 'warn',
			'react-hooks/set-state-in-effect': 'warn',
			'react-hooks/purity': 'warn',
			'react-hooks/preserve-manual-memoization': 'warn',
		},
	},
	{
		files: ['src/**/*.{ts,tsx}'],
		plugins: { boundaries },
		settings: {
			'boundaries/elements': [
				{ type: 'routes', pattern: 'src/routes/**/*' },
				{ type: 'components', pattern: 'src/components/*' },
				{ type: 'hooks', pattern: 'src/hooks/*' },
				{ type: 'lib', pattern: 'src/lib/*' },
			],
			// Enforce that types flow from the server workspace package,
			// never by reaching into server/src directly.
			// Entry files (main.tsx, App.tsx) and shared types (types.ts) are excluded.
			'boundaries/ignore': ['src/main.tsx', 'src/App.tsx', 'src/types.ts'],
		},
		rules: {
			'boundaries/element-types': [
				'error',
				{
					default: 'disallow',
					rules: [
						// Routes may use everything
						{ from: 'routes', allow: ['components', 'hooks', 'lib'] },
						// Components may use hooks and lib
						{ from: 'components', allow: ['hooks', 'lib'] },
						// Hooks may only use lib
						{ from: 'hooks', allow: ['lib'] },
						// Lib is a leaf (workspace imports like home-jarvis-server are external, not elements)
						{ from: 'lib', allow: [] },
					],
				},
			],
		},
	},
])
