#!/usr/bin/env node

/**
 * CodePack CLI - Command line interface for codebase compression
 * 
 * @author CodePack Contributors
 * @license MIT
 */

const { program } = require('commander');
const CodePack = require('../src/index');

program
  .version('1.0.22')
  .description('Compress entire codebases into AI-friendly single files')
  .option('-i, --input <path>', 'Input directory path', '.')
  .option('-o, --output <file>', 'Output file path', 'codepack-output.md')
  .option('-e, --exclude <patterns>', 'Exclude patterns (comma-separated)', 'node_modules,dist,build,.git')
  .option('-c, --compact', 'Compact mode - minimize output size')
  .option('-s, --smart', 'Smart AI-optimized mode with context preservation')
  .option('-v, --verbose', 'Verbose output')
  .action((options) => {
    const codePack = new CodePack(options);
    codePack.compress();
  });

program.parse(process.argv);