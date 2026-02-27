import * as esbuild from 'esbuild';
import { execSync } from 'child_process';
import { readFileSync, mkdirSync, rmSync } from 'fs';

const pkg = JSON.parse(readFileSync('./package.json', 'utf-8'));
const isWatch = process.argv.includes('--watch');

const baseConfig = {
  entryPoints: ['index.ts'],
  bundle: true,
  external: ['zod'],
  sourcemap: true,
  platform: 'neutral',
  target: 'es2020',
};

const builds = [
  // ESM build
  {
    ...baseConfig,
    format: 'esm',
    outfile: 'dist/index.js',
  },
  // CJS build
  {
    ...baseConfig,
    format: 'cjs',
    outfile: 'dist/index.cjs',
  },
];

function generateDts() {
  try {
    console.log('Generating TypeScript declarations...');
    execSync('npx dts-bundle-generator -o dist/index.d.ts index.ts --external-types zod', {
      stdio: 'inherit'
    });
  } catch (error) {
    console.error('Failed to generate declarations:', error.message);
    process.exit(1);
  }
}

async function buildAll() {
  try {
    // Clean dist directory
    rmSync('dist', { recursive: true, force: true });
    mkdirSync('dist', { recursive: true });

    if (isWatch) {
      const contexts = await Promise.all(
        builds.map(config => esbuild.context(config))
      );
      
      // Build once first
      await Promise.all(contexts.map(ctx => ctx.rebuild()));
      generateDts();
      console.log('Initial build complete!');
      
      // Watch for changes
      await Promise.all(contexts.map(ctx => ctx.watch()));
      console.log('Watching for changes...');
      
      // Watch TypeScript files and regenerate declarations
      const dtsContext = await esbuild.context({
        entryPoints: ['index.ts'],
        bundle: false,
        write: false,
        plugins: [{
          name: 'dts-watcher',
          setup(build) {
            build.onEnd(() => {
              generateDts();
              console.log('Declarations updated!');
            });
          },
        }],
      });
      await dtsContext.watch();
      
    } else {
      await Promise.all(builds.map(config => esbuild.build(config)));
      generateDts();
      console.log('Build complete!');
    }
  } catch (error) {
    console.error('Build failed:', error);
    process.exit(1);
  }
}

buildAll();
