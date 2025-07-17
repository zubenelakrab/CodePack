/**
 * CodePack - Compress entire codebases into AI-friendly single files
 * 
 * @author CodePack Contributors
 * @license MIT
 * @version 1.0.0
 */

const fs = require('fs-extra');
const path = require('path');
const glob = require('glob');

/**
 * Main CodePack class for compressing codebases
 */
class CodePack {
  constructor(options = {}) {
    this.inputPath = options.input || '.';
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
    this.maxFileSize = 100000; // 100KB max per file
    this.compact = options.compact || false; // New: compact mode
    this.smartCompress = options.smart || false; // Smart AI compression
  }

  async compress() {
    try {
      if (this.verbose) console.log('Starting CodePack compression...');
      
      this.skippedFiles = [];
      const files = await this.getFiles();
      const output = await this.generateOutput(files);
      
      await fs.writeFile(this.outputPath, output);
      
      console.log(`✅ CodePack completed! Output saved to: ${this.outputPath}`);
      console.log(`📊 Compressed ${files.length} files`);
      
      if (this.skippedFiles.length > 0) {
        console.log(`⚠️  Skipped ${this.skippedFiles.length} large files (>100KB):`);
        this.skippedFiles.forEach(file => {
          console.log(`   - ${file.name} (${file.size}KB)`);
        });
      }
      
    } catch (error) {
      console.error('❌ Error during compression:', error.message);
      process.exit(1);
    }
  }

  async getFiles() {
    const globPattern = '**/*';
    
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
      } catch (e) {
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
      'README.md', 'LICENSE', '.gitignore'
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

  async generateOutput(files) {
    if (this.smartCompress) {
      return this.generateSmartOutput(files);
    }
    
    if (this.compact) {
      return this.generateCompactOutput(files);
    }
    
    let output = '# CodePack Output\n\n';
    output += `**Generated:** ${new Date().toISOString()}\n`;
    output += `**Source:** ${path.resolve(this.inputPath)}\n`;
    output += `**Files:** ${files.length}\n\n`;

    // Project structure
    output += '## 📂 Structure\n\n```\n';
    output += this.generateTreeStructure(files);
    output += '```\n\n';

    // Project overview
    output += await this.generateProjectOverview(files);

    // File contents
    output += '## 📄 Files\n\n';
    
    // Prioritize important files first
    const sortedFiles = this.prioritizeFiles(files);
    
    for (const file of sortedFiles) {
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
        if (this.verbose) console.log(`Skipping unreadable file: ${file}`);
      }
    }

    return output;
  }

  async generateCompactOutput(files) {
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
    
    for (const file of sortedFiles) {
      const filePath = path.join(this.inputPath, file);
      try {
        let content = await fs.readFile(filePath, 'utf8');
        
        // Optimize content
        content = this.optimizeContent(content);
        
        const ext = path.extname(file).substring(1) || 'text';
        output += `## ${file}\n\`\`\`${ext}\n${content}\n\`\`\`\n`;
      } catch (error) {
        if (this.verbose) console.log(`Skipping unreadable file: ${file}`);
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

  async generateSmartOutput(files) {
    let output = '# CodePack\n';
    
    // Ultra-compact metadata
    const analysis = await this.analyzeProject(files);
    output += `${analysis.architecture} | ${analysis.technologies.join(',')} | ${files.length} files\n\n`;
    
    // Group files but ultra-compact
    const fileGroups = this.groupFilesByPurpose(files);
    
    for (const [groupName, groupFiles] of Object.entries(fileGroups)) {
      if (groupFiles.length === 0) continue;
      
      output += `## ${groupName}\n`;
      
      for (const file of groupFiles) {
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
      } else if (dirName.includes('test') || file.includes('.test.') || file.includes('.spec.')) {
        groups['🧪 Tests'].push(file);
      } else if (file.endsWith('.css') || file.endsWith('.scss')) {
        groups['🎨 Styles'].push(file);
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
      '.gitignore': 'Git ignore patterns'
    };
    
    return descriptions[path.basename(filename)];
  }
}

module.exports = CodePack;