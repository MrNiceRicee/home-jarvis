import boundaries from 'eslint-plugin-boundaries'
import { defineConfig, globalIgnores } from 'eslint/config'
import globals from 'globals'

import { baseConfig } from '../eslint.config.base.ts'

/**
 * Server layer architecture:
 *
 *   routes → integrations → lib
 *            integrations → db
 *   discovery → lib
 *   db (leaf)
 *   lib (leaf)
 */
export default defineConfig([
	// Don't lint the ESLint config itself (meta file, not source code)
	globalIgnores(['dist', 'eslint.config.ts']),
	...baseConfig,
	{
		files: ['**/*.ts'],
		languageOptions: {
			globals: globals.node,
			parserOptions: {
				tsconfigRootDir: import.meta.dirname,
			},
		},
	},
	{
		files: ['src/**/*.ts'],
		plugins: { boundaries },
		settings: {
			'boundaries/elements': [
				{ type: 'routes', pattern: 'src/routes/*' },
				{ type: 'integrations', pattern: 'src/integrations/**/*' },
				{ type: 'discovery', pattern: 'src/discovery/*' },
				{ type: 'db', pattern: 'src/db/*' },
				{ type: 'lib', pattern: 'src/lib/*' },
			],
		},
		rules: {
			'boundaries/element-types': [
				'error',
				{
					default: 'disallow',
					rules: [
						// Routes may use integrations and lib
						{ from: 'routes', allow: ['integrations', 'lib'] },
						// Integrations may use db and lib
						{ from: 'integrations', allow: ['db', 'lib'] },
						// Discovery is standalone (only lib)
						{ from: 'discovery', allow: ['lib'] },
						// Leaves have no internal imports
						{ from: 'db', allow: [] },
						{ from: 'lib', allow: [] },
					],
				},
			],
		},
	},
])
