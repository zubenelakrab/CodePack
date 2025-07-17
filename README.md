# CodePack

Compress entire codebases into AI-friendly single files optimized for ChatGPT, Claude, and other AI tools. Transform complex projects into digestible markdown files that preserve context while minimizing token usage.

## 🚀 Features

- 📦 **Multi-mode compression**: Normal, Compact, and Smart AI-optimized modes
- 🧠 **AI-specific optimizations**: Intelligent file grouping and context preservation
- 🔍 **Automatic technology detection**: Identifies frameworks, patterns, and architectures
- 📊 **Project analysis**: Architecture detection (React, Node.js, Python, etc.)
- 🌳 **Visual directory structure**: Clean tree representation
- 🚫 **Smart exclusions**: Automatic filtering of dependencies, virtual environments, and build artifacts
- 🎯 **Syntax highlighting**: Language-specific code blocks for better AI comprehension
- ⚡ **Size optimization**: Up to 64% file size reduction with context preservation
- 🛡️ **Safe minification**: Removes only redundant elements (comments, logs, whitespace)

## 📦 Installation

```bash
npm install -g codepack
```

## 🎯 Usage

### Basic Usage
```bash
# Compress current directory (normal mode)
codepack

# Compress specific directory
codepack -i /path/to/project

# Custom output file
codepack -o my-project-analysis.md
```

### Compression Modes

```bash
# Normal mode - Full context with descriptions
codepack -o normal.md

# Compact mode - 64% smaller, removes extras
codepack -c -o compact.md  

# Smart mode - AI-optimized, grouped by purpose, 57% smaller
codepack -s -o smart.md
```

### Advanced Options
```bash
# Exclude specific patterns
codepack -e "node_modules,dist,*.log,custom-folder"

# Verbose output with detailed file processing
codepack -v

# Combine options
codepack -s -v -i ../my-project -o optimized-output.md
```

## ⚙️ Command Line Options

| Option | Description | Default |
|--------|-------------|---------|
| `-i, --input <path>` | Input directory path | Current directory |
| `-o, --output <file>` | Output file path | `codepack-output.md` |
| `-e, --exclude <patterns>` | Exclude patterns (comma-separated) | `node_modules,dist,build,.git,venv` |
| `-c, --compact` | Compact mode - minimize output size | `false` |
| `-s, --smart` | Smart AI-optimized mode with intelligent grouping | `false` |
| `-v, --verbose` | Verbose output with processing details | `false` |
| `-h, --help` | Show help | - |

## 🎨 Compression Modes Comparison

### Normal Mode
- **Use case**: Full documentation and analysis
- **Size**: Baseline (100%)
- **Features**: Complete project overview, file descriptions, directory tree
- **Best for**: Comprehensive code reviews, documentation

### Compact Mode (-c)
- **Use case**: Token-limited AI interactions
- **Size**: ~36% of normal (64% reduction)
- **Features**: Minimal headers, removes tree structure, compact format
- **Best for**: Large codebases with token constraints

### Smart Mode (-s)
- **Use case**: AI analysis with preserved context
- **Size**: ~43% of normal (57% reduction)
- **Features**: Intelligent file grouping, minified code, architecture detection
- **Best for**: AI code analysis, maintaining project structure understanding

## 🚫 Automatic Exclusions

CodePack intelligently excludes:

- **Dependencies**: `node_modules`, `vendor`, `target`
- **Virtual Environments**: `venv`, `env`, `.venv`, `virtualenv`
- **Build Artifacts**: `dist`, `build`, `.next`, `coverage`
- **Cache Files**: `__pycache__`, `.cache`, `*.pyc`
- **Version Control**: `.git`, `.svn`
- **Logs & Temp**: `*.log`, `*.tmp`, `.DS_Store`
- **Package Locks**: `package-lock.json`, `yarn.lock`
- **Large Files**: Files >100KB automatically excluded

## 💡 Use Cases

### For Developers
- **Code reviews**: Share entire projects with team members
- **Documentation**: Generate comprehensive project overviews
- **AI assistance**: Get help with large codebases from AI tools
- **Project handoffs**: Transfer knowledge between developers

### For AI Analysis
- **Bug hunting**: Analyze entire codebase for issues
- **Architecture review**: Understand project structure and patterns
- **Refactoring suggestions**: Get recommendations for improvements
- **Learning**: Study well-structured projects

## 📝 License

MIT License - see [LICENSE](LICENSE) file for details.

---

**Made with ❤️ for developers and AI enthusiasts**