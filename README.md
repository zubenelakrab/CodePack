# CodePack

Compress entire codebases into AI-friendly single files with **9 output formats** optimized for ChatGPT, Claude, and other AI tools. Transform complex projects into digestible files that preserve context while minimizing token usage.

## 🆕 What's New in v1.1.2

- **🔒 Privacy Enhancement** - Removed internal evolution ID from output
- **🎯 `--all-formats` command** - Generate all 9 formats with a single command
- **📊 9 output formats** - Markdown, JSON, YAML, TOML, MessagePack, JSON-LD, DSL, and more
- **📋 Enhanced Markdown** - Table of contents, quick start guides, architecture diagrams
- **🔧 Improved CLI** - Positional arguments, better help, no file limits
- **📈 Larger file support** - Default 500KB limit (vs 100KB)
- **🚀 Better performance** - Optimized for large enterprise codebases

## 🚀 Features

### 📦 **9 AI-Readable Output Formats**
- **Enhanced Markdown** - TOC, quick start, Mermaid diagrams
- **JSON** - Structured data with AI context  
- **YAML** - Human-readable with comments
- **TOML** - Compact configuration format
- **MessagePack** - Binary compression with decoding instructions
- **Markdown+YAML** - Frontmatter with structured metadata
- **Custom DSL** - Ultra-compact domain-specific language
- **JSON-LD** - Semantic web format with linked data
- **Optimized Markdown** - Maximum compression while readable

### 🧠 **AI-Specific Optimizations**
- 🎯 **Intelligent file grouping** and context preservation
- 🔍 **Automatic technology detection** (React, Node.js, Python, etc.)
- 📊 **Project analysis** with architecture detection
- 🌳 **Visual directory structure** with tree representation
- 🚫 **Smart exclusions** (dependencies, build artifacts, virtual environments)
- 🛡️ **Safe minification** (removes only redundant elements)

### ⚡ **Performance & Scalability**
- 🚀 **No file count limits** - Handle enterprise codebases
- 📈 **500KB default file limit** (configurable)
- 🔄 **Progress indicators** with real-time feedback
- 📊 **Size comparison** across all formats
- 🎨 **Multiple compression modes** (Normal, Compact, Smart)

## 📦 Installation

```bash
npm install -g @zubenelakrab/codepack
```

## 🎯 Usage

### ⚡ Generate All Formats (New!)

```bash
# Generate all 9 formats at once - RECOMMENDED!
codepack --all-formats /path/to/project -o my-project

# Creates 9 files:
# my-project.md                  (Enhanced Markdown)
# my-project.json                (Structured JSON)  
# my-project.yaml                (Human-readable YAML)
# my-project.toml                (Compact TOML)
# my-project.msgpack.txt         (MessagePack archive)
# my-project.frontmatter.md      (Markdown + YAML)
# my-project.dsl.txt             (Ultra-compact DSL)
# my-project.jsonld.json         (Semantic JSON-LD)
# my-project.optimized.md        (Most compressed)
```

### 📝 Single Format Usage

```bash
# Basic usage with positional argument
codepack /path/to/project -o output.md

# Or with --input flag
codepack -i /path/to/project -o output.md

# Specific format
codepack -f yaml -o project.yaml
codepack -f json -o project.json
codepack -f toml -o project.toml
```

### 🎨 Compression Modes

```bash
# Normal mode - Full context with descriptions  
codepack -o normal.md

# Compact mode - Smaller, removes extras
codepack -c -o compact.md  

# Smart mode - AI-optimized, grouped by purpose
codepack -s -o smart.md
```

### 🔧 Advanced Options

```bash
# Exclude specific patterns
codepack -e "node_modules,dist,*.log,custom-folder" -o clean.md

# Custom file size limit (1MB)
codepack -m 1000 -o large-files.md

# Verbose output with detailed processing
codepack -v -o detailed.md

# Dry run - preview without creating files
codepack --all-formats --dry-run -o preview

# Combine options
codepack --all-formats -e "node_modules,dist,build" -m 1000 -v -o enterprise-app
```

## 📊 Output Formats Comparison

| Format | Extension | Size | Best For |
|--------|-----------|------|----------|
| **mdopt** | `.optimized.md` | Smallest | Maximum compression |
| **dsl** | `.dsl.txt` | Very small | Ultra-compact structure |
| **markdown** | `.md` | Medium | Enhanced readability + TOC |
| **mdyaml** | `.frontmatter.md` | Medium | Structured metadata |
| **toml** | `.toml` | Medium | Configuration-style data |
| **json** | `.json` | Medium | Structured data exchange |
| **jsonld** | `.jsonld.json` | Medium | Semantic web applications |
| **yaml** | `.yaml` | Large | Human-readable config |
| **msgpack** | `.msgpack.txt` | Largest | Binary compression + portability |

## ⚙️ Command Line Options

| Option | Description | Default |
|--------|-------------|---------|
| `[input]` | Input directory path (positional) | Current directory |
| `-i, --input <path>` | Input directory path (alternative) | `.` |
| `-o, --output <file>` | Output file path | `codepack-output.md` |
| `-f, --format <type>` | Output format | `markdown` |
| `--all-formats` | **Generate all 9 formats** | `false` |
| `-e, --exclude <patterns>` | Exclude patterns (comma-separated) | Standard exclusions |
| `-c, --compact` | Compact mode - minimize output size | `false` |
| `-s, --smart` | Smart AI-optimized mode | `false` |
| `-m, --max-size <kb>` | Maximum file size in KB | `500` |
| `-v, --verbose` | Verbose output with progress details | `false` |
| `-d, --dry-run` | Preview without creating files | `false` |
| `--no-respect-gitignore` | Ignore .gitignore patterns | Respects by default |

## 🚫 Smart Exclusions

CodePack automatically excludes:

- **Dependencies**: `node_modules`, `vendor`, `target`
- **Virtual Environments**: `venv`, `env`, `.venv`, `virtualenv` 
- **Build Artifacts**: `dist`, `build`, `.next`, `coverage`
- **Cache Files**: `__pycache__`, `.cache`, `*.pyc`
- **Version Control**: `.git`, `.svn`
- **Logs & Temp**: `*.log`, `*.tmp`, `.DS_Store`
- **Package Locks**: `package-lock.json`, `yarn.lock`
- **Large Files**: Files >500KB (configurable)

## 💡 Use Cases

### 👩‍💻 For Developers
- **📋 Code reviews** - Share complete projects with team members
- **📚 Documentation** - Generate comprehensive project overviews  
- **🤖 AI assistance** - Get help with large codebases from AI tools
- **🔄 Project handoffs** - Transfer knowledge between developers

### 🧠 For AI Analysis  
- **🐛 Bug hunting** - Analyze entire codebase for issues
- **🏗️ Architecture review** - Understand project structure and patterns
- **♻️ Refactoring suggestions** - Get recommendations for improvements
- **📖 Learning** - Study well-structured projects

### 🎯 Format-Specific Use Cases
- **Markdown** - Best for human review and AI chat uploads
- **JSON/YAML** - API integrations and data processing
- **TOML** - Configuration management and DevOps
- **MessagePack** - Efficient storage and transmission
- **JSON-LD** - Semantic analysis and knowledge graphs
- **DSL** - Minimalist representation for token-limited scenarios

## 📈 Example: Enterprise Frontend Analysis

```bash
# Analyze a large Angular/React frontend
codepack --all-formats /path/to/frontend-app -o frontend-analysis

# Output:
# ✅ Found 2,800 files to process
# ✅ Generated 9 formats (8-19MB each)
# ✅ Most compressed: frontend-analysis.optimized.md (8.6MB)
# ✅ Best for AI: frontend-analysis.md (13.7MB)
# ⚠️  Skipped 4 large files (>500KB): libraries, assets
```

## 🔗 Real-World Examples

```bash
# React/Next.js application
codepack --all-formats -e "node_modules,.next,out,build" -o react-app

# Python Django project  
codepack --all-formats -e "venv,__pycache__,migrations,static" -o django-app

# Node.js API server
codepack --all-formats -e "node_modules,logs,uploads,tmp" -o api-server

# Angular enterprise app
codepack --all-formats -e "node_modules,dist,.angular,coverage" -o ng-enterprise
```

## 🆚 Migration from v1.0.x

```bash
# OLD (v1.0.x) - Single format
codepack -i /project -o output.md

# NEW (v1.1.0) - All formats
codepack --all-formats /project -o output

# Benefits of upgrading:
# ✅ 9x more output formats  
# ✅ No file count limits
# ✅ 5x larger file size support
# ✅ Enhanced Markdown with TOC + diagrams
# ✅ Better CLI with positional arguments
```

## 📝 License

MIT License - see [LICENSE](LICENSE) file for details.

---

**Made with ❤️ for developers and AI enthusiasts**

*Generate comprehensive codebase documentation in 9 formats with a single command!*