import js from '@eslint/js'
import sonarjs from 'eslint-plugin-sonarjs'
import tseslint from 'typescript-eslint'

// Spread into defineConfig() in each package's eslint.config.ts
export const baseConfig = [
	js.configs.recommended,
	...tseslint.configs.recommended,
	sonarjs.configs.recommended,
	{
		languageOptions: {
			parserOptions: {
				// Type-aware linting: uses the nearest tsconfig.json for each file
				projectService: true,
			},
		},
		rules: {
			// --- File size ---
			'max-lines': ['error', { max: 500, skipBlankLines: true, skipComments: true }],

			// --- Complexity (strict) ---
			'sonarjs/cognitive-complexity': ['error', 15],

			// --- Sonarjs: downgrade style preferences to warn ---
			'sonarjs/no-small-switch': 'warn',
			'sonarjs/no-nested-conditional': 'warn',
			'sonarjs/no-nested-assignment': 'warn',
			'sonarjs/no-nested-functions': 'warn',
			// Hardcoded IPs are sometimes intentional (mDNS, etc)
			'sonarjs/no-hardcoded-ip': 'warn',
			// TODO comments are normal during development
			'sonarjs/todo-tag': 'off',
			// Props read-only is a style preference in React
			'sonarjs/prefer-read-only-props': 'warn',
			// Catch deprecated APIs — use error to prevent new usages creeping in
			'sonarjs/deprecation': 'error',

			// --- TypeScript ---
			'@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
			// Always use `import type` for type-only imports — makes type deps explicit
			'@typescript-eslint/consistent-type-imports': [
				'error',
				{ prefer: 'type-imports', fixStyle: 'inline-type-imports' },
			],

			// --- Type-aware rules (require projectService) ---
			// Catch unhandled promises — most common async bug
			'@typescript-eslint/no-floating-promises': 'error',
			// Catch `await nonPromise`
			'@typescript-eslint/await-thenable': 'error',
			// Remove redundant type casts (`as string` when already `string`)
			'@typescript-eslint/no-unnecessary-type-assertion': 'error',
			// Prefer `??` over `||` for nullish checks (avoids 0/"" being falsy)
			'@typescript-eslint/prefer-nullish-coalescing': 'error',
			// Prefer `a?.b?.c` over `a && a.b && a.b.c`
			'@typescript-eslint/prefer-optional-chain': 'error',

			// --- Core ---
			// allow empty catch blocks (catch {} is a valid intentional swallow pattern)
			'no-empty': ['error', { allowEmptyCatch: true }],
		},
	},
]
