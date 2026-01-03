# fnmap

[![npm version](https://img.shields.io/npm/v/@didnhdj/fnmap.svg)](https://www.npmjs.com/package/@didnhdj/fnmap)
[![npm downloads](https://img.shields.io/npm/dm/@didnhdj/fnmap.svg)](https://www.npmjs.com/package/@didnhdj/fnmap)

> AI code indexing tool for analyzing JS/TS code structure and generating structured code maps

[中文文档](./README_CN.md)

## Features

- 🚀 **Fast Analysis**: Quickly analyze JavaScript/TypeScript code structure using AST
- 📊 **Structured Output**: Generate `.fnmap` index files with imports, functions, classes, and constants
- 🔗 **Call Graph**: Track function call relationships and dependencies
- 🎯 **Git Integration**: Process only changed files for efficient workflows
- ⚙️ **Flexible Configuration**: Support for multiple configuration methods
- 🔌 **Pre-commit Hook**: Integrate seamlessly with git hooks
- 📦 **Programmatic API**: Use as a library to process code strings directly
- 🎨 **Smart Filtering**: Automatically skip type definition files and type-only files
- 🌍 **Cross-Platform**: Normalized path handling for Windows, macOS, and Linux

## Installation

```bash
npm install -g @didnhdj/fnmap
```

Or use in your project:

```bash
npm install --save-dev @didnhdj/fnmap
```

## Quick Start

### Initialize Configuration

```bash
fnmap --init
```

This interactive command will:
1. Create a `.fnmaprc` configuration file in your project root
2. Add fnmap-generated files to `.gitignore` (optional)
3. Automatically append fnmap format documentation to:
   - `CLAUDE.md` (project-level instructions for Claude AI)
   - `~/.claude/CLAUDE.md` (user-level global instructions)
   - `AGENTS.md` (project-level agent instructions)
   - Or any custom file path you specify

The appended documentation helps AI assistants (like Claude) understand the `.fnmap` format, enabling them to:
- Quickly navigate your codebase using the index
- Locate functions and classes by line number
- Understand code structure and call graphs
- Make more informed code suggestions

### Basic Usage

```bash
# Process files based on configuration
fnmap

# Process specific directory
fnmap --dir src

# Process specific files
fnmap --files index.js,utils.js

# Process git changed files
fnmap --changed

# Process git staged files (for pre-commit hook)
fnmap --staged

# Show detailed processing logs
fnmap --log --dir src

# Clear generated files
fnmap --clear
```

## Configuration

fnmap supports multiple configuration methods (in priority order):

1. `.fnmaprc` - JSON configuration file
2. `.fnmaprc.json` - JSON configuration file
3. `package.json#fnmap` - fnmap field in package.json

### Configuration Example

**.fnmaprc**
```json
{
  "enable": true,
  "include": [
    "src/**/*.js",
    "src/**/*.ts",
    "src/**/*.jsx",
    "src/**/*.tsx"
  ],
  "exclude": [
    "node_modules",
    "dist",
    "build"
  ]
}
```

**package.json**
```json
{
  "fnmap": {
    "enable": true,
    "include": ["src/**/*.js", "src/**/*.ts"],
    "exclude": ["dist"]
  }
}
```

## Output Files

### .fnmap Index File

The `.fnmap` file contains structured information about your code:

```
@FNMAP src/
#utils.js Utility functions
  <fs:readFileSync,writeFileSync
  <path:join,resolve
  readConfig(filePath) 10-25 Read configuration file
  parseData(data) 27-40 Parse data →JSON.parse
  saveFile(path,content) 42-50 Save file →fs.writeFileSync,path.join
@FNMAP
```

**Format Description:**
- `#filename` - File name and description
- `<module:members` - Imported modules and members
- `functionName(params) startLine-endLine description →calls` - Function information with call graph
- `ClassName:SuperClass startLine-endLine` - Class information
- `  .methodName(params) line description →calls` - Instance method
- `  +methodName(params) line description →calls` - Static method
- `$constName line description` - Constant definition (`$` prefix)
- `>export1,export2,default` - Exports (`>` prefix, supports `default`, `type:Name`)

## CLI Options

```
Usage: fnmap [options] [files...]

Options:
  -v, --version          Show version number
  -f, --files <files>    Process specified files (comma-separated)
  -d, --dir <dir>        Process all code files in directory
  -p, --project <dir>    Specify project root directory (default: current directory)
  -c, --changed          Process only git changed files (staged + modified + untracked)
  -s, --staged           Process only git staged files (for pre-commit hook)
  -m, --mermaid [mode]   Generate Mermaid call graph (file=file-level, project=project-level)
  -l, --log              Show detailed processing logs
  --init                 Create default config file and setup project (interactive)
  --clear                Clear generated files (.fnmap, *.fnmap, *.mermaid)
  -h, --help             Display help information
```

## Programmatic API

fnmap can be used as a library in your Node.js applications.

### Processing Code Strings

```typescript
import { processCode } from '@didnhdj/fnmap';

const code = `
  export function hello(name) {
    console.log('Hello, ' + name);
  }
`;

const result = processCode(code, { filePath: 'example.js' });

if (result.success) {
  console.log('Functions:', result.info.functions);
  console.log('Imports:', result.info.imports);
  console.log('Call Graph:', result.info.callGraph);
} else {
  console.error('Parse error:', result.error);
}
```

### Processing Files

```typescript
import { processFile } from '@didnhdj/fnmap';

const result = processFile('./src/utils.js');

if (result.success) {
  console.log('Analysis result:', result.info);
}
```

### API Types

```typescript
// Process result type
type ProcessResult = ProcessSuccess | ProcessFailure;

interface ProcessSuccess {
  success: true;
  info: FileInfo;
}

interface ProcessFailure {
  success: false;
  error: string;
  errorType: ErrorType;
  loc?: { line: number; column: number };
}

// File info structure
interface FileInfo {
  imports: ImportInfo[];
  functions: FunctionInfo[];
  classes: ClassInfo[];
  constants: ConstantInfo[];
  callGraph: CallGraph;
  isPureTypeFile: boolean;  // Whether file only contains type definitions
}
```

## Use Cases

### 1. AI Assistant Integration

fnmap is designed to help AI coding assistants understand your codebase better:

```bash
# Initialize and setup AI documentation
fnmap --init

# Generate code index for your project
fnmap --dir src
```

The `.fnmap` files help AI assistants:
- Navigate large codebases efficiently
- Find specific functions/classes by name and line number
- Understand module dependencies and call graphs
- Provide context-aware code suggestions

**Recommended workflow with Claude Code or similar AI tools:**
1. Run `fnmap --init` to add format documentation to `CLAUDE.md`
2. Generate index files with `fnmap --dir src`
3. AI assistants will automatically read `.fnmap` files for context
4. Update index when code changes with `fnmap --changed`

### 2. Pre-commit Hook

Add to `.husky/pre-commit` or `.git/hooks/pre-commit`:

```bash
#!/bin/sh
fnmap --staged
git add .fnmap
```

This automatically updates the `.fnmap` index when committing code.

### 3. CI/CD Integration

```yaml
# .github/workflows/ci.yml
- name: Generate Code Index
  run: |
    npm install -g @didnhdj/fnmap
    fnmap --dir src
    git diff --exit-code .fnmap || echo "Code index updated"
```

### 4. Code Review

```bash
# Generate index for changed files
fnmap --changed

# Show detailed logs during analysis
fnmap --log --changed
```

## Supported File Types

- `.js` - JavaScript
- `.ts` - TypeScript
- `.jsx` - React JSX
- `.tsx` - React TypeScript
- `.mjs` - ES Modules

**Auto-filtered files:**
- `.d.ts`, `.d.tsx`, `.d.mts` - Type definition files
- Files containing only `type` or `interface` declarations (pure type files)

## Limitations

To ensure performance and safety, fnmap has the following default limits:
- **File Size**: Maximum 10MB per file
- **Directory Depth**: Maximum recursion depth of 50 levels

## How It Works

1. **AST Parsing**: Uses `@babel/parser` to parse code into Abstract Syntax Tree
2. **Structure Analysis**: Traverses AST to extract imports, functions, classes, constants
3. **Call Graph**: Tracks function call relationships and dependencies
4. **Index Generation**: Generates compact `.fnmap` files with structured information

## Examples

### Example 1: Analyze Single File

```bash
fnmap --files src/utils.js
```

Output:
```
==================================================
fnmap - AI Code Indexing Tool
==================================================

Analyzing: src/utils.js
✓ Imports: 3, Functions: 5, Classes: 0, Constants: 2

Generating .fnmap index...
✓ src/utils.fnmap

==================================================
Complete! Analyzed: 1, Failed: 0
==================================================
```

### Example 2: Analyze Directory

```bash
fnmap --dir src
```

Generates:
- `src/.fnmap` - Code index for all files in src directory

### Example 3: Git Workflow

```bash
# Make changes to code
git add .

# Generate index for staged files
fnmap --staged

# Add updated index
git add .fnmap

# Commit
git commit -m "Update feature"
```

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

MIT

## Related Projects

- [@babel/parser](https://babeljs.io/docs/en/babel-parser) - JavaScript parser
- [@babel/traverse](https://babeljs.io/docs/en/babel-traverse) - AST traversal
- [Mermaid](https://mermaid-js.github.io/) - Diagram generation

## Support

- 🐛 [Report Issues](https://github.com/gqfx/fnmap/issues)
- 💡 [Feature Requests](https://github.com/gqfx/fnmap/issues)
- 📖 [Documentation](https://github.com/gqfx/fnmap)
