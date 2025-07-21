/**
 * CodePack - Compress entire codebases into AI-friendly single files
 * 
 * @author CodePack Contributors
 * @license MIT
 */

const fs = require('fs-extra');
const path = require('path');
const glob = require('glob');
const os = require('os');
const {default: ora} = require('ora');
const ignore = require('ignore');
const yaml = require('js-yaml');
const toml = require('@iarna/toml');
const msgpack = require('msgpack5')();

/**
 * Main CodePack class for compressing codebases
 */
class CodePack {
  constructor(options = {}) {
    this.inputPath = this.validateInputPath(options.input || '.');
    this.outputPath = options.output || 'codepack-output.md';
    this.excludePatterns = options.exclude ? options.exclude.split(',') : [
      'node_modules', 'dist', 'build', '.git', '.next', 'coverage',
      'venv', 'env', '.venv', '.env', 'virtualenv',
      '__pycache__', '*.pyc', '.pytest_cache',
      'target', 'vendor', '.cargo',
      '*.log', '*.tmp', '*.cache', 'yarn.lock', 'package-lock.json',
      '.DS_Store', 'Thumbs.db'
    ];
    this.verbose = options.verbose || false;
    // Convert KB to bytes (default 500KB)
    this.maxFileSize = (parseInt(options.maxSize, 10) || 500) * 1024;
    this.compact = options.compact || false;
    this.smartCompress = options.smart || false;
    this.maxFiles = Infinity; // No file limit
    this.totalSizeLimit = 50 * 1024 * 1024; // 50MB total size limit
    this.errors = [];
    this.respectGitignore = options.respectGitignore !== false; // Default true
    this.gitignoreFilter = null;
    this.format = options.format || 'markdown'; // markdown, json, yaml, toml, msgpack, mdyaml, dsl, jsonld, mdopt
    this.allFormats = options.allFormats || false;
    this.dryRun = options.dryRun || false;
  }

  validateInputPath(inputPath) {
    try {
      const resolvedPath = path.resolve(inputPath);
      const realPath = fs.realpathSync(resolvedPath);
      
      // Check if path exists
      if (!fs.existsSync(realPath)) {
        throw new Error(`Input path does not exist: ${inputPath}`);
      }
      
      // Check if it's a directory
      const stats = fs.statSync(realPath);
      if (!stats.isDirectory()) {
        throw new Error(`Input path is not a directory: ${inputPath}`);
      }
      
      // Prevent access to system directories
      const restrictedPaths = ['/etc', '/sys', '/proc', os.homedir() + '/.ssh'];
      if (restrictedPaths.some(restricted => realPath.startsWith(restricted))) {
        throw new Error(`Access to system directory is restricted: ${inputPath}`);
      }
      
      return realPath;
    } catch (error) {
      console.error(`❌ Invalid input path: ${error.message}`);
      process.exit(1);
    }
  }

  async compress() {
    const spinner = this.verbose ? null : ora('Starting CodePack compression...').start();
    
    try {
      this.skippedFiles = [];
      
      if (spinner) spinner.text = 'Scanning files...';
      const files = await this.getFiles();
      if (spinner) spinner.succeed(`Found ${files.length} files to process`);
      else if (this.verbose) console.log(`Found ${files.length} files to process`);
      
      // Check resource limits (removed file count limit)
      // if (files.length > this.maxFiles) {
      //   throw new Error(`Too many files (${files.length}). Maximum allowed: ${this.maxFiles}. Use -e to exclude more patterns.`);
      // }
      
      if (this.allFormats) {
        await this.generateAllFormats(files);
        return;
      }

      const generateSpinner = this.verbose ? null : ora('Generating output...').start();
      const output = await this.generateOutputByFormat(files, generateSpinner);
      
      // Check output size
      const outputSize = Buffer.byteLength(output, 'utf8');
      if (outputSize > this.totalSizeLimit) {
        if (generateSpinner) generateSpinner.fail();
        throw new Error(`Output too large (${Math.round(outputSize / 1024 / 1024)}MB). Maximum: ${Math.round(this.totalSizeLimit / 1024 / 1024)}MB. Use compact (-c) or smart (-s) mode.`);
      }
      
      if (this.dryRun) {
        if (generateSpinner) generateSpinner.succeed('Dry run completed - no output written');
        console.log(`\n🗺️ Dry run results:`);
        console.log(`📊 Would compress ${files.length} files`);
        console.log(`📁 Output would be ${Math.round(outputSize / 1024)}KB`);
        console.log(`📋 Output would be written to: ${this.outputPath}`);
        if (this.format === 'json') {
          console.log(`📦 Format: JSON`);
        } else {
          console.log(`📦 Format: Markdown`);
          if (this.compact) console.log(`📉 Mode: Compact`);
          if (this.smartCompress) console.log(`🧠 Mode: Smart`);
        }
        return;
      }
      
      if (generateSpinner) generateSpinner.text = 'Writing output file...';
      await fs.ensureDir(path.dirname(this.outputPath));
      await fs.writeFile(this.outputPath, output);
      if (generateSpinner) generateSpinner.succeed('Output generated');
      
      if (!this.dryRun) {
        console.log(`✅ CodePack completed! Output saved to: ${this.outputPath}`);
        console.log(`📊 Compressed ${files.length} files (${Math.round(outputSize / 1024)}KB)`);
      }
      
      if (this.skippedFiles.length > 0) {
        const maxSizeKB = Math.round(this.maxFileSize / 1024);
        console.log(`⚠️  Skipped ${this.skippedFiles.length} large files (>${maxSizeKB}KB):`);
        this.skippedFiles.slice(0, 10).forEach(file => {
          console.log(`   - ${file.name} (${file.size}KB)`);
        });
        if (this.skippedFiles.length > 10) {
          console.log(`   ... and ${this.skippedFiles.length - 10} more`);
        }
      }
      
      if (this.errors.length > 0) {
        console.log('\n⚠️  Errors encountered:');
        this.errors.slice(0, 5).forEach(err => console.log(`   - ${err}`));
        if (this.errors.length > 5) {
          console.log(`   ... and ${this.errors.length - 5} more`);
        }
      }
      
    } catch (error) {
      if (spinner) spinner.fail('Compression failed');
      console.error('\n❌ Error during compression:', error.message);
      if (this.verbose && error.stack) {
        console.error('\nStack trace:', error.stack);
      }
      process.exit(1);
    }
  }

  async loadGitignore() {
    if (!this.respectGitignore) return null;
    
    const gitignorePath = path.join(this.inputPath, '.gitignore');
    if (!fs.existsSync(gitignorePath)) return null;
    
    try {
      const gitignoreContent = await fs.readFile(gitignorePath, 'utf8');
      const ig = ignore();
      ig.add(gitignoreContent);
      // Always ignore .git directory
      ig.add('.git');
      return ig;
    } catch (error) {
      this.errors.push(`Failed to read .gitignore: ${error.message}`);
      return null;
    }
  }

  async getFiles() {
    const globPattern = '**/*';
    
    // Load .gitignore patterns
    this.gitignoreFilter = await this.loadGitignore();
    
    // Enhanced ignore patterns - cover all levels
    const ignorePatterns = [];
    this.excludePatterns.forEach(pattern => {
      ignorePatterns.push(`${pattern}/**`);      // Top level
      ignorePatterns.push(`**/${pattern}/**`);  // Any level
      ignorePatterns.push(`**/${pattern}`);     // Exact match at any level
    });
    
    const files = await new Promise((resolve, reject) => {
      glob(globPattern, {
        cwd: this.inputPath,
        ignore: ignorePatterns,
        nodir: true,
        dot: false
      }, (err, files) => {
        if (err) reject(err);
        else resolve(files);
      });
    });

    return files.filter(file => {
      // Check .gitignore patterns
      if (this.gitignoreFilter && this.gitignoreFilter.ignores(file)) {
        if (this.verbose) console.log(`Ignoring (gitignore): ${file}`);
        return false;
      }
      
      // Additional path-based filtering for missed virtual environments
      const filePath = file.toLowerCase();
      if (filePath.includes('/venv/') || 
          filePath.includes('/env/') || 
          filePath.includes('/.venv/') ||
          filePath.includes('/virtualenv/') ||
          filePath.includes('/site-packages/') ||
          filePath.includes('/__pycache__/') ||
          filePath.includes('/node_modules/')) {
        return false;
      }
      
      const ext = path.extname(file).toLowerCase();
      const fullPath = path.join(this.inputPath, file);
      
      // Skip binary files
      if (this.isBinaryFile(ext)) return false;
      
      // Skip non-source files
      if (!this.isSourceFile(ext, file)) return false;
      
      // Skip large files
      try {
        const stats = fs.statSync(fullPath);
        if (stats.size > this.maxFileSize) {
          const sizeKB = Math.round(stats.size/1024);
          this.skippedFiles.push({ name: file, size: sizeKB });
          if (this.verbose) console.log(`Skipping large file: ${file} (${sizeKB}KB)`);
          return false;
        }
      } catch (error) {
        this.errors.push(`Cannot access file ${file}: ${error.message}`);
        if (this.verbose) console.log(`Cannot access file: ${file}`);
        return false;
      }
      
      return true;
    });
  }

  isBinaryFile(ext) {
    const binaryExtensions = [
      '.exe', '.dll', '.so', '.dylib', '.a', '.lib',
      '.jpg', '.jpeg', '.png', '.gif', '.ico', '.svg', '.webp', '.bmp',
      '.zip', '.tar', '.gz', '.rar', '.7z',
      '.pdf', '.doc', '.docx', '.xls', '.xlsx',
      '.mp3', '.mp4', '.avi', '.mov', '.wmv',
      '.ttf', '.woff', '.woff2', '.eot',
      '.bin', '.dat', '.db', '.sqlite'
    ];
    return binaryExtensions.includes(ext);
  }

  isSourceFile(ext, filename) {
    // Important config files (only essential documentation)
    const configFiles = [
      'package.json', 'tsconfig.json', 'webpack.config.js', 'babel.config.js',
      'tailwind.config.js', 'next.config.js', 'vite.config.js', 'rollup.config.js',
      'jest.config.js', 'eslint.config.js', '.eslintrc.js', '.eslintrc.json',
      'prettier.config.js', '.prettierrc', 'docker-compose.yml', 'Dockerfile',
      'README.md', 'CLAUDE.md', 'CONTRIBUTING.md', 'LICENSE', '.gitignore'
    ];
    
    // Source code extensions
    const sourceExtensions = [
      '.js', '.jsx', '.ts', '.tsx', '.vue', '.svelte',
      '.py', '.java', '.go', '.rs', '.rb', '.php',
      '.c', '.cpp', '.h', '.hpp', '.cs',
      '.html', '.css', '.scss', '.sass', '.less',
      '.json', '.xml', '.yml', '.yaml', '.toml',
      '.sql', '.graphql', '.proto',
      '.sh', '.bash', '.zsh', '.fish',
      '.txt', '.env.example'
    ];

    const baseName = path.basename(filename);
    
    // Include important config files
    if (configFiles.includes(baseName)) return true;
    
    // Include source extensions
    if (sourceExtensions.includes(ext)) return true;
    
    // Include files without extension that might be important
    if (!ext && ['Dockerfile', 'Makefile', 'Rakefile'].includes(baseName)) return true;
    
    return false;
  }

  async generateJSONOutput(files, spinner) {
    const analysis = await this.analyzeProject(files);
    const processedFiles = [];
    
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (spinner) spinner.text = `Processing files for JSON... (${i + 1}/${files.length})`;
      
      const filePath = path.join(this.inputPath, file);
      try {
        const content = await fs.readFile(filePath, 'utf8');
        const stats = fs.statSync(filePath);
        
        const fileDescription = this.getFileDescription(path.basename(file));
        const isEmptyInit = path.basename(file) === '__init__.py' && stats.size === 0;
        
        processedFiles.push({
          path: file,
          relativePath: file,
          size: stats.size,
          extension: path.extname(file),
          content: this.compact ? this.optimizeContent(content) : content,
          lastModified: stats.mtime,
          description: fileDescription,
          fileType: isEmptyInit ? 'python_package_marker' : this.getFileType(file, content),
          isEmpty: stats.size === 0,
          isPackageInit: isEmptyInit
        });
      } catch (error) {
        this.errors.push(`Cannot read file ${file}: ${error.message}`);
      }
    }
    
    // Count file types for better AI context
    const fileTypeCounts = {};
    const emptyInitFiles = [];
    processedFiles.forEach(file => {
      fileTypeCounts[file.fileType] = (fileTypeCounts[file.fileType] || 0) + 1;
      if (file.isPackageInit) {
        emptyInitFiles.push(file.path);
      }
    });

    const result = {
      metadata: {
        generatedAt: new Date().toISOString(),
        source: path.resolve(this.inputPath),
        totalFiles: files.length,
        filesWithContent: processedFiles.filter(f => !f.isEmpty).length,
        emptyPackageMarkers: emptyInitFiles.length,
        fileTypeBreakdown: fileTypeCounts,
        options: {
          compact: this.compact,
          smart: this.smartCompress,
          maxFileSize: this.maxFileSize,
          respectGitignore: this.respectGitignore
        },
        aiContext: {
          note: "Empty __init__.py files are normal Python package markers that enable imports. They are not errors or missing code.",
          emptyInitFiles: emptyInitFiles
        }
      },
      analysis,
      files: processedFiles,
      skippedFiles: this.skippedFiles,
      errors: this.errors
    };
    
    return JSON.stringify(result, null, this.compact ? 0 : 2);
  }

  async generateOutputByFormat(files, spinner) {
    switch (this.format) {
      case 'json':
        return this.generateJSONOutput(files, spinner);
      case 'yaml':
        return this.generateYAMLOutput(files, spinner);
      case 'toml':
        return this.generateTOMLOutput(files, spinner);
      case 'msgpack':
        return this.generateMessagePackOutput(files, spinner);
      case 'mdyaml':
        return this.generateMarkdownYAMLOutput(files, spinner);
      case 'dsl':
        return this.generateDSLOutput(files, spinner);
      case 'jsonld':
        return this.generateJSONLDOutput(files, spinner);
      case 'mdopt':
        return this.generateOptimizedMarkdownOutput(files, spinner);
      default:
        return this.generateOutput(files, spinner);
    }
  }

  async generateYAMLOutput(files, spinner) {
    const analysis = await this.analyzeProject(files);
    const processedFiles = [];
    
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (spinner) spinner.text = `Processing files for YAML... (${i + 1}/${files.length})`;
      
      const filePath = path.join(this.inputPath, file);
      try {
        const content = await fs.readFile(filePath, 'utf8');
        const stats = fs.statSync(filePath);
        
        const fileDescription = this.getFileDescription(path.basename(file));
        const isEmptyInit = path.basename(file) === '__init__.py' && stats.size === 0;
        
        processedFiles.push({
          path: file,
          relativePath: file,
          size: stats.size,
          extension: path.extname(file),
          content: this.compact ? this.optimizeContent(content) : content,
          lastModified: stats.mtime,
          description: fileDescription,
          fileType: isEmptyInit ? 'python_package_marker' : this.getFileType(file, content),
          isEmpty: stats.size === 0,
          isPackageInit: isEmptyInit
        });
      } catch (error) {
        this.errors.push(`Cannot read file ${file}: ${error.message}`);
      }
    }
    
    // Count file types for better AI context
    const fileTypeCounts = {};
    const emptyInitFiles = [];
    processedFiles.forEach(file => {
      fileTypeCounts[file.fileType] = (fileTypeCounts[file.fileType] || 0) + 1;
      if (file.isPackageInit) {
        emptyInitFiles.push(file.path);
      }
    });

    const yamlData = {
      metadata: {
        generatedAt: new Date().toISOString(),
        source: path.resolve(this.inputPath),
        totalFiles: files.length,
        filesWithContent: processedFiles.filter(f => !f.isEmpty).length,
        emptyPackageMarkers: emptyInitFiles.length,
        fileTypeBreakdown: fileTypeCounts,
        options: {
          compact: this.compact,
          smart: this.smartCompress,
          maxFileSize: this.maxFileSize,
          respectGitignore: this.respectGitignore
        },
        aiContext: {
          note: "Empty __init__.py files are normal Python package markers that enable imports. They are not errors or missing code.",
          emptyInitFiles: emptyInitFiles
        }
      },
      analysis,
      files: processedFiles,
      skippedFiles: this.skippedFiles,
      errors: this.errors
    };
    
    return yaml.dump(yamlData, {
      indent: this.compact ? 1 : 2,
      lineWidth: -1,
      noRefs: true,
      quotingType: '"'
    });
  }

  async generateTOMLOutput(files, spinner) {
    const analysis = await this.analyzeProject(files);
    const processedFiles = [];
    
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (spinner) spinner.text = `Processing files for TOML... (${i + 1}/${files.length})`;
      
      const filePath = path.join(this.inputPath, file);
      try {
        const content = await fs.readFile(filePath, 'utf8');
        const stats = fs.statSync(filePath);
        
        const fileDescription = this.getFileDescription(path.basename(file));
        const isEmptyInit = path.basename(file) === '__init__.py' && stats.size === 0;
        
        // TOML doesn't handle complex nested objects as well, so simplify
        processedFiles.push({
          path: file,
          size: stats.size,
          extension: path.extname(file),
          content: this.compact ? this.optimizeContent(content) : content,
          lastModified: stats.mtime.toISOString(),
          fileType: isEmptyInit ? 'python_package_marker' : this.getFileType(file, content),
          isEmpty: stats.size === 0,
          isPackageInit: isEmptyInit
        });
      } catch (error) {
        this.errors.push(`Cannot read file ${file}: ${error.message}`);
      }
    }

    const fileTypeCounts = {};
    const emptyInitFiles = [];
    processedFiles.forEach(file => {
      fileTypeCounts[file.fileType] = (fileTypeCounts[file.fileType] || 0) + 1;
      if (file.isPackageInit) {
        emptyInitFiles.push(file.path);
      }
    });

    const tomlData = {
      metadata: {
        generatedAt: new Date().toISOString(),
        source: path.resolve(this.inputPath),
        totalFiles: files.length,
        filesWithContent: processedFiles.filter(f => !f.isEmpty).length,
        emptyPackageMarkers: emptyInitFiles.length,
        compact: this.compact,
        smart: this.smartCompress,
        maxFileSize: this.maxFileSize,
        respectGitignore: this.respectGitignore
      },
      analysis: {
        architecture: analysis.architecture,
        technologies: analysis.technologies,
        patterns: analysis.patterns
      },
      aiContext: {
        note: "Empty __init__.py files are normal Python package markers that enable imports. They are not errors or missing code.",
        emptyInitFiles: emptyInitFiles
      },
      files: processedFiles
    };
    
    return toml.stringify(tomlData);
  }

  async generateMessagePackOutput(files, spinner) {
    // Generate the same data structure as JSON but encode as MessagePack, then Base64
    const jsonData = JSON.parse(await this.generateJSONOutput(files, spinner));
    const packed = msgpack.encode(jsonData);
    const base64 = packed.toString('base64');
    
    const originalSize = JSON.stringify(jsonData).length;
    const compressedSize = packed.length;
    const compressionRatio = ((1 - compressedSize / originalSize) * 100).toFixed(1);
    
    // Enhanced header with comprehensive metadata and instructions
    return `# 📦 CodePack MessagePack Archive
# 
# This file contains a complete codebase compressed using MessagePack binary format
# and encoded as Base64 for text-safe transmission and storage.
#
# ═══════════════════════════════════════════════════════════════════
# 📊 COMPRESSION STATISTICS
# ═══════════════════════════════════════════════════════════════════
# Original JSON size:  ${originalSize.toLocaleString()} bytes (${(originalSize / 1024).toFixed(1)} KB)
# Compressed size:     ${compressedSize.toLocaleString()} bytes (${(compressedSize / 1024).toFixed(1)} KB)
# Compression ratio:   ${compressionRatio}% reduction
# Encoding:           MessagePack → Base64
# Files included:     ${files.length} files
# Generated:          ${new Date().toISOString()}
#
# ═══════════════════════════════════════════════════════════════════
# 🔧 DECODING INSTRUCTIONS
# ═══════════════════════════════════════════════════════════════════
#
# JavaScript/Node.js:
# const msgpack = require('msgpack5')();
# const fs = require('fs');
# const data = fs.readFileSync('archive.txt', 'utf8');
# const base64Data = data.split('MSGPACK_BASE64_START')[1].split('MSGPACK_BASE64_END')[0].trim();
# const buffer = Buffer.from(base64Data, 'base64');
# const decoded = msgpack.decode(buffer);
# console.log(decoded);
#
# Python:
# import msgpack
# import base64
# with open('archive.txt', 'r') as f:
#     content = f.read()
# base64_data = content.split('MSGPACK_BASE64_START')[1].split('MSGPACK_BASE64_END')[0].strip()
# buffer = base64.b64decode(base64_data)
# decoded = msgpack.unpackb(buffer, raw=False)
# print(decoded)
#
# Online Decoder:
# 1. Copy the Base64 data between START/END markers
# 2. Decode Base64 to binary
# 3. Use MessagePack decoder on the binary data
#
# ═══════════════════════════════════════════════════════════════════
# 📋 DATA STRUCTURE
# ═══════════════════════════════════════════════════════════════════
# The decoded data contains:
# - metadata: Project information, file counts, AI context
# - analysis: Architecture detection, technologies, patterns
# - files: Array of file objects with path, content, metadata
# - skippedFiles: Large files that were excluded
# - errors: Any processing errors encountered
#
# ═══════════════════════════════════════════════════════════════════

MSGPACK_BASE64_START
${base64}
MSGPACK_BASE64_END

# ═══════════════════════════════════════════════════════════════════
# End of CodePack MessagePack Archive
# Generated by CodePack v${require('../package.json').version}
# ═══════════════════════════════════════════════════════════════════`;
  }

  async generateMarkdownYAMLOutput(files, spinner) {
    const analysis = await this.analyzeProject(files);
    const processedFiles = [];
    
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (spinner) spinner.text = `Processing files for MD+YAML... (${i + 1}/${files.length})`;
      
      const filePath = path.join(this.inputPath, file);
      try {
        const content = await fs.readFile(filePath, 'utf8');
        const stats = fs.statSync(filePath);
        
        const isEmptyInit = path.basename(file) === '__init__.py' && stats.size === 0;
        
        processedFiles.push({
          path: file,
          size: stats.size,
          extension: path.extname(file),
          content: this.compact ? this.optimizeContent(content) : content,
          fileType: isEmptyInit ? 'python_package_marker' : this.getFileType(file, content),
          isEmpty: stats.size === 0,
          isPackageInit: isEmptyInit
        });
      } catch (error) {
        this.errors.push(`Cannot read file ${file}: ${error.message}`);
      }
    }

    const fileTypeCounts = {};
    const emptyInitFiles = [];
    processedFiles.forEach(file => {
      fileTypeCounts[file.fileType] = (fileTypeCounts[file.fileType] || 0) + 1;
      if (file.isPackageInit) {
        emptyInitFiles.push(file.path);
      }
    });

    // YAML frontmatter
    const frontmatter = {
      metadata: {
        generatedAt: new Date().toISOString(),
        source: path.resolve(this.inputPath),
        totalFiles: files.length,
        filesWithContent: processedFiles.filter(f => !f.isEmpty).length,
        emptyPackageMarkers: emptyInitFiles.length,
        fileTypeBreakdown: fileTypeCounts
      },
      analysis,
      aiContext: {
        note: "Empty __init__.py files are normal Python package markers that enable imports. They are not errors or missing code.",
        emptyInitFiles: emptyInitFiles
      }
    };

    let output = '---\n';
    output += yaml.dump(frontmatter, { indent: 2, lineWidth: -1, noRefs: true });
    output += '---\n\n';
    
    // Markdown content
    output += '# CodePack Output\n\n';
    output += `Generated: ${new Date().toISOString()}\n`;
    output += `Source: ${path.resolve(this.inputPath)}\n`;
    output += `Files: ${files.length}\n\n`;

    // Project structure
    output += '## 📂 Structure\n\n```\n';
    output += this.generateTreeStructure(files);
    output += '```\n\n';

    // File contents
    output += '## 📄 Files\n\n';
    
    const sortedFiles = this.prioritizeFiles(files);
    for (let i = 0; i < sortedFiles.length; i++) {
      const file = sortedFiles[i];
      if (spinner) spinner.text = `Generating MD content... (${i + 1}/${sortedFiles.length})`;
      
      const filePath = path.join(this.inputPath, file);
      try {
        const content = await fs.readFile(filePath, 'utf8');
        const ext = path.extname(file).substring(1) || 'text';
        
        output += `### ${file}\n\n`;
        
        // Add file description if available
        const description = this.getFileDescription(file);
        if (description) {
          output += `*${description}*\n\n`;
        }
        
        output += `\`\`\`${ext}\n${content}\n\`\`\`\n\n`;
      } catch (error) {
        this.errors.push(`Cannot read file ${file}: ${error.message}`);
      }
    }

    return output;
  }

  async generateDSLOutput(files, spinner) {
    const analysis = await this.analyzeProject(files);
    const processedFiles = [];
    
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (spinner) spinner.text = `Processing files for DSL... (${i + 1}/${files.length})`;
      
      const filePath = path.join(this.inputPath, file);
      try {
        const content = await fs.readFile(filePath, 'utf8');
        const stats = fs.statSync(filePath);
        const isEmptyInit = path.basename(file) === '__init__.py' && stats.size === 0;
        
        processedFiles.push({
          path: file,
          size: stats.size,
          content: this.compact ? this.optimizeContent(content) : content,
          fileType: isEmptyInit ? 'python_package_marker' : this.getFileType(file, content),
          isEmpty: stats.size === 0,
          isPackageInit: isEmptyInit
        });
      } catch (error) {
        this.errors.push(`Cannot read file ${file}: ${error.message}`);
      }
    }

    const emptyInitFiles = processedFiles.filter(f => f.isPackageInit).map(f => f.path);
    
    // Custom DSL format
    let output = 'CODEPACK_DSL_V1\n';
    output += `META: files=${files.length}, tech=${analysis.technologies.join('|')}, arch=${analysis.architecture}\n`;
    output += `AI_CONTEXT: Empty __init__.py files are normal Python package markers, not errors\n`;
    if (emptyInitFiles.length > 0) {
      output += `EMPTY_INITS: ${emptyInitFiles.join('|')}\n`;
    }
    output += '\n';

    const sortedFiles = this.prioritizeFiles(files);
    for (const file of sortedFiles) {
      const fileData = processedFiles.find(f => f.path === file);
      if (!fileData) continue;

      const sizeKB = (fileData.size / 1024).toFixed(1);
      output += `FILE: ${file} [${fileData.fileType}, ${sizeKB}KB]\n`;
      
      if (fileData.content) {
        const ext = path.extname(file).substring(1) || 'text';
        output += `\`\`\`${ext}\n${fileData.content}\n\`\`\`\n`;
      }
      output += 'END\n\n';
    }

    return output;
  }

  async generateJSONLDOutput(files, spinner) {
    const analysis = await this.analyzeProject(files);
    const processedFiles = [];
    
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (spinner) spinner.text = `Processing files for JSON-LD... (${i + 1}/${files.length})`;
      
      const filePath = path.join(this.inputPath, file);
      try {
        const content = await fs.readFile(filePath, 'utf8');
        const stats = fs.statSync(filePath);
        
        const isEmptyInit = path.basename(file) === '__init__.py' && stats.size === 0;
        
        processedFiles.push({
          '@type': 'SourceFile',
          '@id': file,
          'path': file,
          'size': stats.size,
          'extension': path.extname(file),
          'content': this.compact ? this.optimizeContent(content) : content,
          'lastModified': stats.mtime,
          'fileType': isEmptyInit ? 'python_package_marker' : this.getFileType(file, content),
          'isEmpty': stats.size === 0,
          'isPackageInit': isEmptyInit,
          'description': this.getFileDescription(path.basename(file))
        });
      } catch (error) {
        this.errors.push(`Cannot read file ${file}: ${error.message}`);
      }
    }

    const fileTypeCounts = {};
    const emptyInitFiles = [];
    processedFiles.forEach(file => {
      fileTypeCounts[file.fileType] = (fileTypeCounts[file.fileType] || 0) + 1;
      if (file.isPackageInit) {
        emptyInitFiles.push(file.path);
      }
    });

    const jsonLdData = {
      '@context': {
        'CodePack': 'https://schema.codepack.ai/',
        'SourceFile': 'https://schema.codepack.ai/SourceFile',
        'ProjectMetadata': 'https://schema.codepack.ai/ProjectMetadata',
        'path': 'https://schema.codepack.ai/path',
        'content': 'https://schema.codepack.ai/content',
        'fileType': 'https://schema.codepack.ai/fileType',
        'isEmpty': 'https://schema.codepack.ai/isEmpty',
        'isPackageInit': 'https://schema.codepack.ai/isPackageInit'
      },
      '@type': 'CodePack',
      '@id': path.resolve(this.inputPath),
      'metadata': {
        '@type': 'ProjectMetadata',
        'generatedAt': new Date().toISOString(),
        'source': path.resolve(this.inputPath),
        'totalFiles': files.length,
        'filesWithContent': processedFiles.filter(f => !f.isEmpty).length,
        'emptyPackageMarkers': emptyInitFiles.length,
        'fileTypeBreakdown': fileTypeCounts,
        'options': {
          'compact': this.compact,
          'smart': this.smartCompress,
          'maxFileSize': this.maxFileSize,
          'respectGitignore': this.respectGitignore
        },
        'aiContext': {
          'note': "Empty __init__.py files are normal Python package markers that enable imports. They are not errors or missing code.",
          'emptyInitFiles': emptyInitFiles
        }
      },
      'analysis': analysis,
      'files': processedFiles,
      'skippedFiles': this.skippedFiles,
      'errors': this.errors
    };
    
    return JSON.stringify(jsonLdData, null, this.compact ? 0 : 2);
  }

  async generateOptimizedMarkdownOutput(files, spinner) {
    let output = '# CodePack\n';
    output += `Gen:${new Date().toISOString().split('T')[0]} Files:${files.length}\n\n`;

    // Ultra-compact project info
    const technologies = this.detectTechnologies(files);
    if (technologies.length > 0) {
      output += `Tech:${technologies.join(',')}\n\n`;
    }

    // Compact file tree
    output += '## Structure\n```\n';
    const tree = this.generateCompactTree(files);
    output += tree;
    output += '```\n\n';

    // Optimized file contents
    const sortedFiles = this.prioritizeFiles(files);
    
    for (let i = 0; i < sortedFiles.length; i++) {
      const file = sortedFiles[i];
      if (spinner) spinner.text = `Optimizing... (${i + 1}/${sortedFiles.length})`;
      
      const filePath = path.join(this.inputPath, file);
      try {
        let content = await fs.readFile(filePath, 'utf8');
        
        // Aggressive optimization
        content = this.optimizeContentForSize(content);
        
        const ext = path.extname(file).substring(1) || 'txt';
        const fileName = path.basename(file);
        
        // Ultra-compact format
        output += `## ${fileName}\n\`\`\`${ext}\n${content}\n\`\`\`\n`;
      } catch (error) {
        this.errors.push(`Cannot read file ${file}: ${error.message}`);
      }
    }

    return output;
  }

  generateCompactTree(files) {
    const dirs = new Set();
    files.forEach(file => {
      const parts = file.split('/');
      for (let i = 0; i < parts.length - 1; i++) {
        dirs.add(parts.slice(0, i + 1).join('/'));
      }
    });
    
    let tree = '';
    const sortedDirs = Array.from(dirs).sort();
    sortedDirs.forEach(dir => {
      const depth = dir.split('/').length - 1;
      tree += '  '.repeat(depth) + path.basename(dir) + '/\n';
    });
    
    files.forEach(file => {
      const depth = file.split('/').length - 1;
      tree += '  '.repeat(depth) + path.basename(file) + '\n';
    });
    
    return tree;
  }

  optimizeContentForSize(content) {
    return content
      .replace(/\/\*[\s\S]*?\*\//g, '') // Remove comments
      .replace(/\/\/.*$/gm, '') // Remove line comments
      .replace(/^\s*$/gm, '') // Remove empty lines
      .replace(/\n{3,}/g, '\n\n') // Max 2 newlines
      .replace(/[ \t]+$/gm, '') // Remove trailing spaces
      .replace(/\s+/g, ' ') // Collapse multiple spaces
      .trim();
  }

  async generateOutput(files, spinner) {
    if (this.smartCompress) {
      return this.generateSmartOutput(files, spinner);
    }
    
    if (this.compact) {
      return this.generateCompactOutput(files, spinner);
    }
    
    let output = '# 📦 CodePack Analysis\n\n';
    output += `**Generated:** ${new Date().toISOString()}\n`;
    output += `**Source:** ${path.resolve(this.inputPath)}\n`;
    output += `**Files:** ${files.length}\n\n`;

    // Table of Contents
    output += this.generateTableOfContents(files);

    // Quick Start Section
    output += this.generateQuickStartSection(files);

    // Project structure
    output += '## 📂 Project Structure\n\n```\n';
    output += this.generateTreeStructure(files);
    output += '```\n\n';

    // Project overview
    output += await this.generateProjectOverview(files);

    // Architecture Overview
    output += await this.generateArchitectureOverview(files);

    // File contents
    output += '## 📄 File Contents\n\n';
    
    // Prioritize important files first
    const sortedFiles = this.prioritizeFiles(files);
    
    for (let i = 0; i < sortedFiles.length; i++) {
      const file = sortedFiles[i];
      if (spinner) spinner.text = `Processing files... (${i + 1}/${sortedFiles.length})`;
      
      const filePath = path.join(this.inputPath, file);
      try {
        const content = await fs.readFile(filePath, 'utf8');
        const ext = path.extname(file).substring(1) || 'text';
        
        output += `### ${file}\n\n`;
        
        // Add file description if it's a config file
        const description = this.getFileDescription(file);
        if (description) {
          output += `*${description}*\n\n`;
        }
        
        output += `\`\`\`${ext}\n${content}\n\`\`\`\n\n`;
      } catch (error) {
        this.errors.push(`Cannot read file ${file}: ${error.message}`);
        if (this.verbose) console.log(`Cannot read file: ${file} - ${error.message}`);
      }
    }

    return output;
  }

  async generateCompactOutput(files, spinner) {
    let output = '# CodePack\n';
    output += `Generated: ${new Date().toISOString().split('T')[0]}\n`;
    output += `Files: ${files.length}\n\n`;

    // Minimal project overview
    const technologies = this.detectTechnologies(files);
    if (technologies.length > 0) {
      output += `Tech: ${technologies.join(', ')}\n\n`;
    }

    // File contents only
    const sortedFiles = this.prioritizeFiles(files);
    
    for (let i = 0; i < sortedFiles.length; i++) {
      const file = sortedFiles[i];
      if (spinner) spinner.text = `Processing files (compact)... (${i + 1}/${sortedFiles.length})`;
      
      const filePath = path.join(this.inputPath, file);
      try {
        let content = await fs.readFile(filePath, 'utf8');
        
        // Optimize content
        content = this.optimizeContent(content);
        
        const ext = path.extname(file).substring(1) || 'text';
        output += `## ${file}\n\`\`\`${ext}\n${content}\n\`\`\`\n`;
      } catch (error) {
        this.errors.push(`Cannot read file ${file}: ${error.message}`);
        if (this.verbose) console.log(`Cannot read file: ${file} - ${error.message}`);
      }
    }

    return output;
  }

  optimizeContent(content) {
    // Remove excessive whitespace while preserving code structure
    return content
      .replace(/\n\s*\n\s*\n/g, '\n\n') // Max 2 consecutive newlines
      .replace(/^\s+$/gm, '') // Remove whitespace-only lines
      .replace(/[ \t]+$/gm, '') // Remove trailing whitespace
      .replace(/\/\*[\s\S]*?\*\//g, '') // Remove multi-line comments
      .replace(/\/\/.*$/gm, '') // Remove single-line comments
      .trim();
  }

  async generateSmartOutput(files, spinner) {
    let output = '# CodePack\n';
    
    // Ultra-compact metadata
    const analysis = await this.analyzeProject(files);
    output += `${analysis.architecture} | ${analysis.technologies.join(',')} | ${files.length} files\n\n`;
    
    // Group files but ultra-compact
    const fileGroups = this.groupFilesByPurpose(files);
    
    for (const [groupName, groupFiles] of Object.entries(fileGroups)) {
      if (groupFiles.length === 0) continue;
      
      output += `## ${groupName}\n`;
      
      for (let i = 0; i < groupFiles.length; i++) {
        const file = groupFiles[i];
        if (spinner) spinner.text = `Processing ${groupName}... (${i + 1}/${groupFiles.length})`;
        
        const filePath = path.join(this.inputPath, file);
        try {
          let content = await fs.readFile(filePath, 'utf8');
          const ext = path.extname(file).substring(1) || 'text';
          
          // Aggressive smart optimization
          content = this.aggressiveSmartOptimize(content, ext);
          
          // Only filename, no path
          const fileName = path.basename(file);
          output += `### ${fileName}\n\`\`\`${ext}\n${content}\n\`\`\`\n`;
          
        } catch (error) {
          if (this.verbose) console.log(`Skipping unreadable file: ${file}`);
        }
      }
    }
    
    return output;
  }

  aggressiveSmartOptimize(content, ext) {
    // Base optimization
    content = this.optimizeContent(content);
    
    if (['js', 'jsx', 'ts', 'tsx'].includes(ext)) {
      // Compress imports to single line
      content = content.replace(/import\s*{\s*([^}]+)\s*}\s*from\s*['"]([^'"]+)['"]/g, (match, imports, from) => {
        const items = imports.split(',').map(i => i.trim()).filter(i => i);
        return `import{${items.join(',')}}from'${from}'`;
      });
      
      // Remove all whitespace around operators
      content = content
        .replace(/\s*=\s*/g, '=')
        .replace(/\s*\(\s*/g, '(')
        .replace(/\s*\)\s*/g, ')')
        .replace(/\s*{\s*/g, '{')
        .replace(/\s*}\s*/g, '}')
        .replace(/\s*,\s*/g, ',')
        .replace(/\s*;\s*/g, ';');
      
      // Minify function declarations
      content = content.replace(/function\s+(\w+)\s*\(/g, 'function $1(');
      content = content.replace(/\)\s*{\s*/g, '){');
      
      // Keep only essential newlines
      content = content.replace(/\n{2,}/g, '\n');
    }
    
    if (['css', 'scss'].includes(ext)) {
      // Minify CSS
      content = content
        .replace(/\s*{\s*/g, '{')
        .replace(/\s*}\s*/g, '}')
        .replace(/\s*:\s*/g, ':')
        .replace(/\s*;\s*/g, ';')
        .replace(/\n+/g, '');
    }
    
    return content.trim();
  }

  analyzeProject(files) {
    const analysis = {
      architecture: 'Unknown',
      technologies: [],
      patterns: [],
      mainEntities: []
    };
    
    // Detect architecture based on files
    if (files.some(f => f.includes('pages/') || f.includes('app/'))) {
      analysis.architecture = 'Next.js/React App';
    } else if (files.some(f => f.includes('src/components/'))) {
      analysis.architecture = 'React SPA';
    } else if (files.some(f => f.includes('main.py') || f.includes('app.py'))) {
      analysis.architecture = 'Python Backend';
    } else if (files.some(f => f.includes('server.js'))) {
      analysis.architecture = 'Node.js Server';
    }
    
    // Detect technologies
    analysis.technologies = this.detectTechnologies(files);
    
    // Detect common patterns
    if (files.some(f => f.includes('hooks/'))) analysis.patterns.push('Custom Hooks');
    if (files.some(f => f.includes('api/'))) analysis.patterns.push('API Routes');
    if (files.some(f => f.includes('models/'))) analysis.patterns.push('Data Models');
    if (files.some(f => f.includes('utils/'))) analysis.patterns.push('Utility Functions');
    
    return analysis;
  }

  groupFilesByPurpose(files) {
    const groups = {
      '⚙️ Configuration': [],
      '🎯 Entry Points': [],
      '🧩 Components': [],
      '🔌 API/Routes': [],
      '📊 Models/Schema': [],
      '🛠 Utilities': [],
      '🧪 Tests': [],
      '🎨 Styles': [],
      '📄 Other': []
    };
    
    files.forEach(file => {
      const baseName = path.basename(file);
      const dirName = path.dirname(file);
      
      if (this.isConfigFile(baseName)) {
        groups['⚙️ Configuration'].push(file);
      } else if (dirName.includes('test') || file.includes('.test.') || file.includes('.spec.')) {
        groups['🧪 Tests'].push(file);
      } else if (file.endsWith('.css') || file.endsWith('.scss') || file.endsWith('.sass') || file.endsWith('.less')) {
        groups['🎨 Styles'].push(file);
      } else if (baseName.includes('index.') || baseName.includes('main.') || baseName.includes('app.')) {
        groups['🎯 Entry Points'].push(file);
      } else if (dirName.includes('component')) {
        groups['🧩 Components'].push(file);
      } else if (dirName.includes('api') || dirName.includes('route')) {
        groups['🔌 API/Routes'].push(file);
      } else if (dirName.includes('model') || dirName.includes('schema')) {
        groups['📊 Models/Schema'].push(file);
      } else if (dirName.includes('util') || dirName.includes('helper')) {
        groups['🛠 Utilities'].push(file);
      } else {
        groups['📄 Other'].push(file);
      }
    });
    
    return groups;
  }

  isConfigFile(filename) {
    const configFiles = [
      'package.json', 'tsconfig.json', 'webpack.config.js',
      'babel.config.js', '.eslintrc.js', 'docker-compose.yml'
    ];
    return configFiles.includes(filename);
  }

  smartOptimizeContent(content, ext, analysis) {
    // Keep imports but compress them
    if (['js', 'jsx', 'ts', 'tsx'].includes(ext)) {
      // Group similar imports
      content = content.replace(/import\s+{([^}]+)}\s+from\s+['"]([^'"]+)['"]/g, (match, imports, from) => {
        const cleanedImports = imports.split(',').map(i => i.trim()).join(', ');
        return `import { ${cleanedImports} } from '${from}'`;
      });
    }
    
    // Remove only truly redundant comments
    content = content
      .replace(/\/\*\*\s*\n\s*\*\s*@deprecated[\s\S]*?\*\//g, '') // Remove deprecated blocks
      .replace(/\/\/\s*TODO:.*$/gm, '') // Remove TODO comments
      .replace(/\/\/\s*eslint-disable.*$/gm, '') // Remove eslint comments
      .replace(/console\.(log|debug|info)\([^)]*\);?/g, '') // Remove console logs
      .trim();
    
    return content;
  }

  getFileContextHints(file, content, ext) {
    const hints = [];
    
    // Detect main purpose
    if (content.includes('export default function') || content.includes('export default class')) {
      hints.push('Main export');
    }
    
    if (content.includes('useState') || content.includes('useEffect')) {
      hints.push('React hooks');
    }
    
    if (content.includes('async') && content.includes('await')) {
      hints.push('Async operations');
    }
    
    if (content.includes('SELECT') || content.includes('INSERT')) {
      hints.push('Database queries');
    }
    
    return hints.length > 0 ? `💡 ${hints.join(' • ')}` : null;
  }

  generateReferenceSection(analysis) {
    let output = '\n## 📖 Quick Reference\n\n';
    
    output += '### Common Patterns in this Codebase\n\n';
    output += '- **Import style**: ES6 modules\n';
    output += '- **Async handling**: async/await\n';
    output += '- **State management**: ' + (analysis.patterns.includes('Redux') ? 'Redux' : 'Local state') + '\n';
    output += '\n### File Naming Conventions\n\n';
    output += '- Components: PascalCase\n';
    output += '- Utilities: camelCase\n';
    output += '- Constants: UPPER_SNAKE_CASE\n';
    
    return output;
  }

  generateTreeStructure(files) {
    const tree = {};
    
    files.forEach(file => {
      const parts = file.split('/');
      let current = tree;
      
      parts.forEach((part, index) => {
        if (index === parts.length - 1) {
          current[part] = null;
        } else {
          current[part] = current[part] || {};
          current = current[part];
        }
      });
    });

    return this.renderTree(tree, 0);
  }

  renderTree(node, depth) {
    let result = '';
    const indent = '  '.repeat(depth);
    
    Object.keys(node).sort().forEach(key => {
      if (node[key] === null) {
        result += `${indent}📄 ${key}\n`;
      } else {
        result += `${indent}📁 ${key}/\n`;
        result += this.renderTree(node[key], depth + 1);
      }
    });
    
    return result;
  }

  async generateProjectOverview(files) {
    let overview = '## 🔍 Project Overview\n\n';
    
    // Detect technologies
    const technologies = this.detectTechnologies(files);
    if (technologies.length > 0) {
      overview += '**Technologies detected:**\n';
      technologies.forEach(tech => {
        overview += `- ${tech}\n`;
      });
      overview += '\n';
    }

    // File statistics
    const stats = this.generateFileStats(files);
    overview += '**File Statistics:**\n';
    Object.entries(stats).forEach(([ext, count]) => {
      overview += `- ${ext}: ${count} files\n`;
    });
    overview += '\n';

    return overview;
  }

  detectTechnologies(files) {
    const technologies = [];
    
    if (files.includes('package.json')) technologies.push('Node.js/JavaScript');
    if (files.some(f => f.endsWith('.ts'))) technologies.push('TypeScript');
    if (files.some(f => f.endsWith('.py'))) technologies.push('Python');
    if (files.some(f => f.endsWith('.java'))) technologies.push('Java');
    if (files.some(f => f.endsWith('.go'))) technologies.push('Go');
    if (files.some(f => f.endsWith('.rs'))) technologies.push('Rust');
    if (files.includes('Dockerfile')) technologies.push('Docker');
    if (files.some(f => f.endsWith('.yml') || f.endsWith('.yaml'))) technologies.push('YAML Configuration');
    
    return technologies;
  }

  generateFileStats(files) {
    const stats = {};
    
    files.forEach(file => {
      const ext = path.extname(file) || 'no extension';
      stats[ext] = (stats[ext] || 0) + 1;
    });
    
    return stats;
  }

  prioritizeFiles(files) {
    const priority = {
      'README.md': 1,
      'package.json': 2,
      'tsconfig.json': 3,
      'index.js': 4,
      'index.ts': 4,
      'main.js': 4,
      'main.ts': 4,
      'app.js': 4,
      'app.ts': 4
    };

    return files.sort((a, b) => {
      const aBase = path.basename(a);
      const bBase = path.basename(b);
      const aPriority = priority[aBase] || 100;
      const bPriority = priority[bBase] || 100;
      
      if (aPriority !== bPriority) {
        return aPriority - bPriority;
      }
      
      // Secondary sort by file type
      const aExt = path.extname(a);
      const bExt = path.extname(b);
      const extPriority = {
        '.json': 1, '.js': 2, '.ts': 3, '.jsx': 4, '.tsx': 5,
        '.css': 6, '.scss': 7, '.md': 8, '.txt': 9
      };
      
      const aExtPriority = extPriority[aExt] || 10;
      const bExtPriority = extPriority[bExt] || 10;
      
      if (aExtPriority !== bExtPriority) {
        return aExtPriority - bExtPriority;
      }
      
      return a.localeCompare(b);
    });
  }

  getFileType(filename, content) {
    const ext = path.extname(filename);
    const basename = path.basename(filename);
    
    // Special cases
    if (basename === '__init__.py') {
      return content.trim() ? 'python_package_init_with_code' : 'python_package_marker';
    }
    
    // Determine file type based on extension and content
    switch (ext) {
      case '.py': return 'python_source';
      case '.js': return filename.includes('.config.') || filename.includes('.test.') ? 'javascript_config' : 'javascript_source';
      case '.ts': return 'typescript_source';
      case '.tsx': return 'react_typescript_component';
      case '.jsx': return 'react_component';
      case '.json': return 'json_config';
      case '.md': return 'documentation';
      case '.yml':
      case '.yaml': return 'yaml_config';
      case '.css': return 'stylesheet';
      case '.html': return 'html_template';
      default: return 'source_code';
    }
  }

  getFileDescription(filename) {
    const descriptions = {
      'package.json': 'Project dependencies and configuration',
      'tsconfig.json': 'TypeScript configuration',
      'webpack.config.js': 'Webpack build configuration',
      'babel.config.js': 'Babel transpilation configuration',
      'tailwind.config.js': 'Tailwind CSS configuration',
      'next.config.js': 'Next.js configuration',
      'vite.config.js': 'Vite build configuration',
      'jest.config.js': 'Jest testing configuration',
      '.eslintrc.js': 'ESLint code quality configuration',
      '.eslintrc.json': 'ESLint code quality configuration',
      'prettier.config.js': 'Prettier code formatting configuration',
      '.prettierrc': 'Prettier code formatting configuration',
      'docker-compose.yml': 'Docker multi-container configuration',
      'Dockerfile': 'Docker container build instructions',
      'README.md': 'Project documentation and setup instructions',
      'CHANGELOG.md': 'Version history and changes',
      '.gitignore': 'Git ignore patterns',
      '__init__.py': 'Python package marker file (enables imports from this directory)'
    };
    
    return descriptions[path.basename(filename)];
  }

  generateTableOfContents(files) {
    let toc = '## 📋 Table of Contents\n\n';
    
    // Quick navigation links
    toc += '### 🧭 Quick Navigation\n\n';
    toc += '- [🚀 Quick Start](#-quick-start)\n';
    toc += '- [📂 Project Structure](#-project-structure)\n';
    toc += '- [🔍 Project Overview](#-project-overview)\n';
    toc += '- [🏗️ Architecture](#️-architecture-overview)\n';
    toc += '- [📄 File Contents](#-file-contents)\n\n';

    // Group files by category for navigation
    const groups = this.groupFilesByPurpose(files);
    toc += '### 📁 File Categories\n\n';
    
    Object.entries(groups).forEach(([groupName, groupFiles]) => {
      if (groupFiles.length > 0) {
        const cleanGroupName = groupName.replace(/[^a-zA-Z0-9\s]/g, '').trim().toLowerCase().replace(/\s+/g, '-');
        toc += `- [${groupName}](#${cleanGroupName}) (${groupFiles.length} files)\n`;
      }
    });
    
    toc += '\n---\n\n';
    return toc;
  }

  generateQuickStartSection(files) {
    let quickStart = '## 🚀 Quick Start\n\n';
    
    // Detect main entry points
    const entryPoints = files.filter(f => {
      const basename = path.basename(f);
      return ['index.js', 'index.ts', 'main.js', 'main.ts', 'app.js', 'app.py', 'server.js', 'package.json'].includes(basename);
    });

    if (entryPoints.length > 0) {
      quickStart += '### 🎯 Key Entry Points\n\n';
      entryPoints.forEach(file => {
        const description = this.getFileDescription(path.basename(file));
        quickStart += `- **${file}**${description ? ` - ${description}` : ''}\n`;
      });
      quickStart += '\n';
    }

    // Detect technologies and provide setup hints
    const technologies = this.detectTechnologies(files);
    if (technologies.length > 0) {
      quickStart += '### ⚡ Quick Setup\n\n';
      
      if (technologies.includes('Node.js/JavaScript')) {
        quickStart += '```bash\n# Install dependencies\nnpm install\n\n# Start development\nnpm run dev\n# or\nnpm start\n```\n\n';
      }
      
      if (technologies.includes('Python')) {
        quickStart += '```bash\n# Create virtual environment\npython -m venv venv\nsource venv/bin/activate  # or venv\\Scripts\\activate on Windows\n\n# Install dependencies\npip install -r requirements.txt\n\n# Run application\npython main.py\n# or\npython app.py\n```\n\n';
      }
      
      if (technologies.includes('Docker')) {
        quickStart += '```bash\n# Build and run with Docker\ndocker-compose up --build\n# or\ndocker build -t app .\ndocker run -p 8080:8080 app\n```\n\n';
      }
    }

    quickStart += '---\n\n';
    return quickStart;
  }

  async generateArchitectureOverview(files) {
    let arch = '## 🏗️ Architecture Overview\n\n';
    
    const analysis = await this.analyzeProject(files);
    
    // Architecture diagram (text-based)
    arch += '### 📐 System Architecture\n\n';
    arch += '```mermaid\n';
    arch += 'graph TB\n';
    
    if (analysis.architecture === 'Next.js/React App') {
      arch += '    A[Frontend - Next.js/React] --> B[API Routes]\n';
      arch += '    B --> C[Backend Services]\n';
      arch += '    C --> D[Database]\n';
      arch += '    A --> E[Components]\n';
      arch += '    A --> F[Pages/Routes]\n';
    } else if (analysis.architecture === 'Python Backend') {
      arch += '    A[Client] --> B[FastAPI/Flask]\n';
      arch += '    B --> C[Business Logic]\n';
      arch += '    C --> D[Database]\n';
      arch += '    B --> E[External APIs]\n';
    } else if (analysis.architecture === 'Node.js Server') {
      arch += '    A[Client] --> B[Express/Node.js]\n';
      arch += '    B --> C[Middleware]\n';
      arch += '    C --> D[Routes]\n';
      arch += '    D --> E[Database]\n';
    } else {
      arch += '    A[Application] --> B[Core Logic]\n';
      arch += '    B --> C[Data Layer]\n';
      arch += '    A --> D[User Interface]\n';
    }
    
    arch += '```\n\n';

    // Key architectural patterns
    if (analysis.patterns.length > 0) {
      arch += '### 🎨 Design Patterns\n\n';
      analysis.patterns.forEach(pattern => {
        arch += `- **${pattern}**\n`;
      });
      arch += '\n';
    }

    // Technology stack
    arch += '### 🛠️ Technology Stack\n\n';
    if (analysis.technologies.length > 0) {
      analysis.technologies.forEach(tech => {
        arch += `- ${tech}\n`;
      });
    } else {
      arch += '- Technologies detected automatically\n';
    }
    
    arch += '\n---\n\n';
    return arch;
  }

  async generateAllFormats(files) {
    const formats = [
      { name: 'markdown', ext: 'md', description: 'Enhanced Markdown with TOC and diagrams' },
      { name: 'json', ext: 'json', description: 'Structured JSON with AI context' },
      { name: 'yaml', ext: 'yaml', description: 'Human-readable YAML format' },
      { name: 'toml', ext: 'toml', description: 'Compact TOML configuration format' },
      { name: 'msgpack', ext: 'msgpack.txt', description: 'MessagePack binary archive (Base64)' },
      { name: 'mdyaml', ext: 'frontmatter.md', description: 'Markdown with YAML frontmatter' },
      { name: 'dsl', ext: 'dsl.txt', description: 'Ultra-compact domain-specific language' },
      { name: 'jsonld', ext: 'jsonld.json', description: 'JSON-LD with semantic context' },
      { name: 'mdopt', ext: 'optimized.md', description: 'Optimized compressed Markdown' }
    ];

    console.log(`🚀 Generating all ${formats.length} output formats...`);
    
    const baseOutputPath = this.outputPath.replace(/\.[^/.]+$/, ''); // Remove extension
    const results = [];
    let totalOutputSize = 0;

    for (let i = 0; i < formats.length; i++) {
      const format = formats[i];
      const spinner = this.verbose ? null : ora(`Generating ${format.name} format... (${i + 1}/${formats.length})`).start();
      
      try {
        // Generate output for this format
        const originalFormat = this.format;
        this.format = format.name;
        const output = await this.generateOutputByFormat(files, spinner);
        this.format = originalFormat; // Restore original format
        
        // Determine output filename
        const outputPath = `${baseOutputPath}.${format.ext}`;
        
        // Check size and write file
        const outputSize = Buffer.byteLength(output, 'utf8');
        totalOutputSize += outputSize;
        
        if (this.dryRun) {
          if (spinner) spinner.succeed(`${format.name} - Would generate ${Math.round(outputSize / 1024)}KB`);
          results.push({ 
            format: format.name, 
            path: outputPath, 
            size: outputSize, 
            description: format.description,
            status: 'dry-run' 
          });
        } else {
          await fs.ensureDir(path.dirname(outputPath));
          await fs.writeFile(outputPath, output);
          
          if (spinner) spinner.succeed(`${format.name} - Generated ${Math.round(outputSize / 1024)}KB`);
          else if (this.verbose) console.log(`✅ ${format.name}: ${outputPath} (${Math.round(outputSize / 1024)}KB)`);
          
          results.push({ 
            format: format.name, 
            path: outputPath, 
            size: outputSize, 
            description: format.description,
            status: 'completed' 
          });
        }
      } catch (error) {
        if (spinner) spinner.fail(`${format.name} - Failed: ${error.message}`);
        else console.error(`❌ ${format.name}: ${error.message}`);
        
        results.push({ 
          format: format.name, 
          error: error.message, 
          description: format.description,
          status: 'failed' 
        });
      }
    }

    // Summary
    console.log('\n' + '='.repeat(60));
    console.log('📋 ALL FORMATS GENERATION SUMMARY');
    console.log('='.repeat(60));
    
    const successful = results.filter(r => r.status === 'completed' || r.status === 'dry-run');
    const failed = results.filter(r => r.status === 'failed');
    
    console.log(`✅ Successful: ${successful.length}/${formats.length}`);
    console.log(`❌ Failed: ${failed.length}/${formats.length}`);
    console.log(`📊 Total size: ${Math.round(totalOutputSize / 1024)}KB`);
    
    if (this.dryRun) {
      console.log(`\n🗺️ Dry run - no files written`);
    } else {
      console.log(`\n📁 Files generated:`);
    }
    
    // Detailed results
    successful.forEach(result => {
      const sizeStr = result.size ? `(${Math.round(result.size / 1024)}KB)` : '';
      const statusIcon = result.status === 'dry-run' ? '🗺️' : '✅';
      console.log(`  ${statusIcon} ${result.format.padEnd(10)} - ${result.path} ${sizeStr}`);
      console.log(`     ${result.description}`);
    });
    
    if (failed.length > 0) {
      console.log(`\n❌ Failed formats:`);
      failed.forEach(result => {
        console.log(`  ❌ ${result.format.padEnd(10)} - ${result.error}`);
      });
    }
    
    // Format comparison table
    if (successful.length > 1 && !this.dryRun) {
      console.log('\n📊 SIZE COMPARISON:');
      console.log('Format     Size (KB)  Ratio   Description');
      console.log('-'.repeat(70));
      
      const sortedResults = successful
        .filter(r => r.size)
        .sort((a, b) => a.size - b.size);
      
      const smallest = sortedResults[0]?.size || 1;
      
      sortedResults.forEach(result => {
        const sizeKB = Math.round(result.size / 1024);
        const ratio = (result.size / smallest).toFixed(1);
        console.log(`${result.format.padEnd(10)} ${sizeKB.toString().padStart(6)}KB  ${ratio.padStart(5)}x  ${result.description}`);
      });
    }
    
    console.log('\n🎉 All formats generation completed!');
    
    if (this.skippedFiles.length > 0) {
      const maxSizeKB = Math.round(this.maxFileSize / 1024);
      console.log(`\n⚠️  Skipped ${this.skippedFiles.length} large files (>${maxSizeKB}KB):`);
      this.skippedFiles.slice(0, 5).forEach(file => {
        console.log(`   - ${file.name} (${file.size}KB)`);
      });
      if (this.skippedFiles.length > 5) {
        console.log(`   ... and ${this.skippedFiles.length - 5} more`);
      }
    }
    
    if (this.errors.length > 0) {
      console.log('\n⚠️  Errors encountered:');
      this.errors.slice(0, 3).forEach(err => console.log(`   - ${err}`));
      if (this.errors.length > 3) {
        console.log(`   ... and ${this.errors.length - 3} more`);
      }
    }
  }
}

module.exports = CodePack;