#!/usr/bin/env node

/**
 * CodePack CLI - Command line interface for codebase compression
 * 
 * @author CodePack Contributors
 * @license MIT
 */

const { program } = require('commander');
const CodePack = require('../src/index');
const packageJson = require('../package.json');

const DEFAULT_INPUT_PATH = '.';
const DEFAULT_OUTPUT_FILE = 'codepack-output.md';
const DEFAULT_EXCLUDE_PATTERNS = 'node_modules,dist,build,.git';
const DEFAULT_MAX_FILE_SIZE = '500';
const DEFAULT_FORMAT = 'markdown';

function resolveInputPath(inputArg, options) {
  if (inputArg) {
    options.input = inputArg;
  } else if (!options.input) {
    options.input = DEFAULT_INPUT_PATH;
  }
  return options;
}

async function executeCodePackCompression(options) {
  try {
    const codePack = new CodePack(options);
    await codePack.compress();
  } catch (error) {
    console.error('CodePack compression failed:', error.message);
    process.exit(1);
  }
}

program
  .version(packageJson.version)
  .description('Compress entire codebases into AI-friendly single files with 9 output formats')
  .argument('[input]', 'Input directory path (optional, defaults to current directory)')
  .option('-i, --input <path>', 'Input directory path (alternative to positional argument)')
  .option('-o, --output <file>', 'Output file path', DEFAULT_OUTPUT_FILE)
  .option('-e, --exclude <patterns>', 'Exclude patterns (comma-separated)', DEFAULT_EXCLUDE_PATTERNS)
  .option('-c, --compact', 'Compact mode - minimize output size')
  .option('-s, --smart', 'Smart AI-optimized mode with context preservation')
  .option('-m, --max-size <kb>', 'Maximum file size in KB (default: 500)', DEFAULT_MAX_FILE_SIZE)
  .option('-v, --verbose', 'Verbose output')
  .option('--no-respect-gitignore', 'Do not respect .gitignore patterns')  
  .option('-f, --format <type>', 'Output format: markdown|json|yaml|toml|msgpack|mdyaml|dsl|jsonld|mdopt', DEFAULT_FORMAT)
  .option('--all-formats', 'Generate all output formats (overrides -f and -o options)')
  .option('-d, --dry-run', 'Preview what would be compressed without creating output file')
  .action(async (inputArg, options) => {
    const resolvedOptions = resolveInputPath(inputArg, options);
    await executeCodePackCompression(resolvedOptions);
  });

program.parse(process.argv);