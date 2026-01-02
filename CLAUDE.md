# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

fnmap is an AI code indexing tool that analyzes JavaScript/TypeScript code structure using Babel AST and generates `.fnmap` index files. These files help AI assistants quickly understand code structure without reading entire files.

## Development Commands

```bash
npm run build        # Build with Vite + TypeScript declarations
npm run typecheck    # Type check without emitting
npm test             # Run all tests with vitest
npm run test:watch   # Run tests in watch mode
npm run test:coverage # Run tests with coverage report
```

Run a single test file:
```bash
npx vitest run test/analyzer.test.ts
```

## Architecture

```
src/
├── index.ts          # Entry point, exports main()
├── main.ts           # CLI orchestration, processes files and generates output
├── analyzer/         # AST parsing with @babel/parser, extracts imports/functions/classes/constants
├── cli/              # Commander.js CLI setup and logger utilities
├── config/           # Configuration loading (.fnmaprc, .fnmaprc.json, package.json#fnmap)
├── constants/        # Default config, file size limits, supported extensions
├── generator/        # Output generators (fnmap index files, Mermaid diagrams)
├── processor/        # File processing orchestration, coordinates analyzer
├── scanner/          # Directory scanning, git integration (changed/staged files)
├── types/            # TypeScript type definitions and type guards
└── validation/       # File path and config validation
```

### Data Flow

1. **CLI** (`cli/`) parses arguments →
2. **Config** (`config/`) loads and merges configuration →
3. **Scanner** (`scanner/`) finds files (directory scan or git diff) →
4. **Processor** (`processor/`) reads files and calls analyzer →
5. **Analyzer** (`analyzer/`) parses AST, extracts code structure →
6. **Generator** (`generator/`) writes `.fnmap` files and optional Mermaid diagrams

### Key Types (in `types/index.ts`)

- `FileInfo`: Contains imports, functions, classes, constants, and call graph
- `FnmapConfig`: Configuration with include/exclude patterns
- `ProcessResult`: Union type for success/failure results with type guards

## .fnmap File Format

The `.fnmap` files use a compact format for AI consumption:

```
#filename.js description
  <module:members              # imports
  funcName(params) 10-20 desc →callee1,callee2  # function with call graph
  ClassName:SuperClass 30-100  # class with inheritance
    .method(params) 35 →callee # instance method
    +staticMethod(params) 40   # static method
  CONST_NAME 5                 # constant
```

## Testing

Tests are in `test/` directory with fixtures in `test/fixtures/`. Each module has corresponding test file (e.g., `analyzer.test.ts`, `processor.test.ts`).

## Build Output

Vite builds to CommonJS format in `dist/`. The CLI binary is `dist/index.js` with shebang for direct execution.
