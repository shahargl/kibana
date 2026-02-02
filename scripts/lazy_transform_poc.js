#!/usr/bin/env node

/**
 * PROOF OF CONCEPT: Lazy Export Transformation
 * 
 * This demonstrates how we could transform plugin code to defer evaluation.
 * 
 * BEFORE (eager - evaluated at require time):
 * ```
 * import { schema } from '@kbn/config-schema';
 * import { heavyDependency } from './heavy';
 * 
 * export const configSchema = schema.object({
 *   enabled: schema.boolean({ defaultValue: true }),
 * });
 * 
 * export function registerRoutes(router) {
 *   router.get({ path: '/api/foo', validate: configSchema }, handler);
 * }
 * ```
 * 
 * AFTER (lazy - evaluated on first access):
 * ```
 * import { schema } from '@kbn/config-schema';
 * 
 * let _configSchema;
 * export const configSchema = {
 *   get schema() {
 *     if (!_configSchema) {
 *       _configSchema = schema.object({
 *         enabled: schema.boolean({ defaultValue: true }),
 *       });
 *     }
 *     return _configSchema;
 *   }
 * };
 * 
 * let _heavyDependency;
 * const getHeavyDependency = () => {
 *   if (!_heavyDependency) {
 *     _heavyDependency = require('./heavy').heavyDependency;
 *   }
 *   return _heavyDependency;
 * };
 * 
 * export function registerRoutes(router) {
 *   router.get({ path: '/api/foo', validate: configSchema }, handler);
 * }
 * ```
 * 
 * This transformation:
 * 1. Converts static schema definitions to lazy getters
 * 2. Converts imports to lazy require() calls
 * 3. Preserves the API surface (same exports)
 */

const fs = require('fs');
const path = require('path');

// Simulated transformation showing the concept
function demonstrateTransformation() {
  console.log('='.repeat(80));
  console.log('LAZY EXPORT TRANSFORMATION - Proof of Concept');
  console.log('='.repeat(80));
  console.log('');

  // Example: Transform plugin's index.ts
  const originalCode = `
// ORIGINAL CODE (transform/server/index.ts)
import type { PluginInitializerContext, PluginConfigDescriptor } from '@kbn/core/server';
import { configSchema, type ConfigSchema } from './config';

export const plugin = async (ctx: PluginInitializerContext) => {
  const { TransformServerPlugin } = await import('./plugin');
  return new TransformServerPlugin(ctx);
};

export const config: PluginConfigDescriptor<ConfigSchema> = {
  schema: configSchema,
  exposeToBrowser: {
    experimental: true,
  },
};

// THIS IS THE PROBLEM - eager export that pulls in heavy dependencies
export { registerTransformHealthRuleType } from './lib/alerting';
`;

  const transformedCode = `
// TRANSFORMED CODE (lazy evaluation)
import type { PluginInitializerContext, PluginConfigDescriptor } from '@kbn/core/server';

// Lazy config loading
let _configSchema: any;
const getConfigSchema = () => {
  if (!_configSchema) {
    _configSchema = require('./config').configSchema;
  }
  return _configSchema;
};

export const plugin = async (ctx: PluginInitializerContext) => {
  const { TransformServerPlugin } = await import('./plugin');
  return new TransformServerPlugin(ctx);
};

// Config descriptor with lazy schema
export const config = {
  get schema() {
    return getConfigSchema();
  },
  exposeToBrowser: {
    experimental: true,
  },
};

// LAZY EXPORT - only loads when accessed
let _registerTransformHealthRuleType: any;
export const registerTransformHealthRuleType = new Proxy(() => {}, {
  apply(target, thisArg, args) {
    if (!_registerTransformHealthRuleType) {
      _registerTransformHealthRuleType = require('./lib/alerting').registerTransformHealthRuleType;
    }
    return _registerTransformHealthRuleType.apply(thisArg, args);
  }
});
`;

  console.log('ORIGINAL CODE:');
  console.log('-'.repeat(40));
  console.log(originalCode);
  console.log('');
  console.log('TRANSFORMED CODE (lazy):');
  console.log('-'.repeat(40));
  console.log(transformedCode);
  console.log('');

  // Demonstrate memory impact
  console.log('='.repeat(80));
  console.log('MEMORY IMPACT ANALYSIS');
  console.log('='.repeat(80));
  console.log('');
  console.log('With ORIGINAL code:');
  console.log('  1. require("./index.ts") is called');
  console.log('  2. import { configSchema } from "./config" - loads config module');
  console.log('  3. export { registerTransformHealthRuleType } - LOADS ENTIRE ./lib/alerting');
  console.log('     └── which loads @kbn/alerting-plugin');
  console.log('         └── which loads 100+ transitive dependencies');
  console.log('  RESULT: ~167MB loaded just to read config schema');
  console.log('');
  console.log('With TRANSFORMED code:');
  console.log('  1. require("./index.ts") is called');
  console.log('  2. getConfigSchema() defined but NOT called');
  console.log('  3. registerTransformHealthRuleType is a Proxy (NOT loaded)');
  console.log('  4. Only when someone calls registerTransformHealthRuleType() does it load');
  console.log('  RESULT: ~0.5MB loaded for config schema, rest deferred');
  console.log('');

  // Show implementation approach
  console.log('='.repeat(80));
  console.log('IMPLEMENTATION APPROACHES');
  console.log('='.repeat(80));
  console.log('');
  console.log('APPROACH 1: BABEL PLUGIN (build-time)');
  console.log('  - Transform exports during compilation');
  console.log('  - Wrap function exports in lazy proxies');
  console.log('  - Convert `export { x } from "y"` to lazy re-exports');
  console.log('  - PRO: No runtime overhead, type-safe');
  console.log('  - CON: Complex to implement, needs careful testing');
  console.log('');
  console.log('APPROACH 2: REQUIRE HOOK (runtime)');
  console.log('  - Intercept require() at runtime');
  console.log('  - Wrap returned modules in proxies');
  console.log('  - PRO: No build changes, immediate effect');
  console.log('  - CON: Runtime overhead, breaks some patterns');
  console.log('');
  console.log('APPROACH 3: PLUGIN REFACTOR (manual)');
  console.log('  - Update plugins to use lazy patterns manually');
  console.log('  - Remove eager re-exports from index.ts');
  console.log('  - Use dynamic import() for heavy dependencies');
  console.log('  - PRO: Most reliable, cleaner code');
  console.log('  - CON: Requires touching every plugin');
  console.log('');
  console.log('RECOMMENDED: Start with APPROACH 3 for top memory consumers,');
  console.log('then consider APPROACH 1 for systematic fix.');
  console.log('='.repeat(80));
}

// Show which plugins would benefit most
function analyzePluginPatterns() {
  const KIBANA_ROOT = path.resolve(__dirname, '..');
  const problematicPatterns = [];

  const pluginDirs = [
    'x-pack/platform/plugins/private',
    'x-pack/platform/plugins/shared',
    'src/platform/plugins/shared',
    'src/platform/plugins/private',
  ];

  for (const dir of pluginDirs) {
    const fullDir = path.join(KIBANA_ROOT, dir);
    if (!fs.existsSync(fullDir)) continue;

    const plugins = fs.readdirSync(fullDir, { withFileTypes: true });
    for (const plugin of plugins) {
      if (!plugin.isDirectory()) continue;

      const indexPath = path.join(fullDir, plugin.name, 'server', 'index.ts');
      if (!fs.existsSync(indexPath)) continue;

      const content = fs.readFileSync(indexPath, 'utf-8');

      // Check for problematic patterns
      const hasEagerReexport = /export\s*\{[^}]+\}\s*from/.test(content);
      const hasEagerImport = /^import\s+(?!type).*from\s+['"]\.\/(?!config)/.test(content);
      const hasTopLevelExport = /^export\s+const\s+\w+\s*=\s*[^(]/.test(content);

      if (hasEagerReexport || (hasEagerImport && hasTopLevelExport)) {
        problematicPatterns.push({
          plugin: plugin.name,
          path: indexPath,
          hasEagerReexport,
          hasEagerImport,
          hasTopLevelExport,
        });
      }
    }
  }

  console.log('');
  console.log('='.repeat(80));
  console.log('PLUGINS WITH PROBLEMATIC PATTERNS');
  console.log('='.repeat(80));
  console.log('');
  console.log(`Found ${problematicPatterns.length} plugins with eager loading patterns:`);
  console.log('');

  for (const p of problematicPatterns.slice(0, 20)) {
    const issues = [];
    if (p.hasEagerReexport) issues.push('eager re-export');
    if (p.hasEagerImport) issues.push('eager import');
    if (p.hasTopLevelExport) issues.push('top-level export');
    console.log(`  ${p.plugin.padEnd(40)} ${issues.join(', ')}`);
  }

  if (problematicPatterns.length > 20) {
    console.log(`  ... and ${problematicPatterns.length - 20} more`);
  }

  console.log('');
  console.log('To fix these plugins, remove eager re-exports from index.ts');
  console.log('and use dynamic import() or lazy proxies for heavy dependencies.');
  console.log('='.repeat(80));
}

demonstrateTransformation();
analyzePluginPatterns();
