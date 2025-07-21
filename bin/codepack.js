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

program
  .version(packageJson.version)
  .description('Compress entire codebases into AI-friendly single files with 9 output formats')
  .argument('[input]', 'Input directory path (optional, defaults to current directory)')
  .option('-i, --input <path>', 'Input directory path (alternative to positional argument)')
  .option('-o, --output <file>', 'Output file path', 'codepack-output.md')
  .option('-e, --exclude <patterns>', 'Exclude patterns (comma-separated)', 'node_modules,dist,build,.git')
  .option('-c, --compact', 'Compact mode - minimize output size')
  .option('-s, --smart', 'Smart AI-optimized mode with context preservation')
  .option('-m, --max-size <kb>', 'Maximum file size in KB (default: 500)', '500')
  .option('-v, --verbose', 'Verbose output')
  .option('--no-respect-gitignore', 'Do not respect .gitignore patterns')
  .option('-f, --format <type>', 'Output format: markdown|json|yaml|toml|msgpack|mdyaml|dsl|jsonld|mdopt', 'markdown')
  .option('--all-formats', 'Generate all output formats (overrides -f and -o options)')
  .option('-d, --dry-run', 'Preview what would be compressed without creating output file')
  .action((inputArg, options) => {
    // Use positional argument if provided, otherwise fall back to --input option or current directory
    if (inputArg) {
      options.input = inputArg;
    } else if (!options.input) {
      options.input = '.';
    }
    
    const codePack = new CodePack(options);
    codePack.compress();
  });

program.parse(process.argv);