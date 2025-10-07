# RAG Component Extraction Configuration Guide

This directory contains configuration for the RAG component extraction system.

## 📁 Configuration Files

### `extraction.config.js` (JavaScript/Extraction)
Controls **what components get extracted** from your codebase.

**Key Settings:**
- `repository.root` - Source code directory
- `files.include` - File extensions to process (.js, .jsx, .ts, .tsx)
- `files.exclude` - Directories to skip (node_modules, tests, etc.)
- `aggregation.patterns` - Component file naming patterns
- `detection.confidenceThreshold` - How strict component detection should be

**Note:** Python pipeline settings (chunking, indexing, querying) are **hardcoded** in the Python source files:
- `core/index_components.py` - ChromaDB settings (collection_name, model_name, distance_metric)
- `core/ingest_components.py` - Chunking logic (chunk types, processing)
- `core/query_cli.py` - Query settings (n_results, thresholds)

---

## 🚀 Quick Start Examples

### Example 1: Extract Only from `/src/components` and `/src/features`

**File:** `extraction.config.js`

```javascript
files: {
  includeOnly: [
    '**/src/components/**',
    '**/src/features/**'
  ]
}
```

### Example 2: Exclude Test Files and Stories

**File:** `extraction.config.js`

```javascript
files: {
  exclude: [
    '**/node_modules/**',
    '**/*.test.*',
    '**/*.spec.*',
    '**/*.stories.*',
    '**/__tests__/**',
    '**/test/**'
  ]
}
```

### Example 3: Change Component Naming Patterns

**File:** `extraction.config.js`

```javascript
aggregation: {
  patterns: {
    // Accept both .component.tsx and .comp.tsx
    component: /\.(component|comp)\.(tsx|jsx)$/,
    
    // Accept .types.ts, .interface.ts, or .props.ts
    interface: /\.(interface|types|props)\.(ts|tsx)$/,
    
    // Accept multiple style patterns
    style: /\.(style|styles|styled)\.(ts|tsx|js|css|scss)$/
  }
}
```

### Example 4: Enable Debug Logging

**File:** `extraction.config.js`

```javascript
logging: {
  level: 'debug',
  showDetectionDetails: true,
  showPropsDebug: true
}
```

---

## 🔧 Common Configuration Scenarios

### Scenario 1: **Large Codebase (1000+ components)**

**Goal:** Fast extraction, minimal memory usage

**extraction.config.js:**
```javascript
files: {
  includeOnly: [
    '**/src/components/**',  // Only components directory
  ],
  exclude: [
    // ... all test/build directories
    '**/deprecated/**',       // Skip deprecated code
    '**/legacy/**'
  ]
},
extraction: {
  maxSourceCodeSize: 50000,  // Limit source code size
},
advanced: {
  enableParallelProcessing: true,
  workers: 8
}
```

### Scenario 2: **Feature-Based Organization**

**Goal:** Extract features with all their files

**extraction.config.js:**
```javascript
files: {
  includeOnly: [
    '**/src/features/**',
    '**/src/shared/components/**'
  ]
},
detection: {
  componentDirs: [
    'components',
    'features',
    'shared'
  ]
}
```

### Scenario 3: **Monorepo with Multiple Apps**

**Goal:** Extract from specific apps only

**extraction.config.js:**
```javascript
repository: {
  root: "apps/web-app",  // Specific app
},
files: {
  includeOnly: [
    '**/src/**'
  ],
  exclude: [
    // Exclude other apps
    '**/apps/mobile-app/**',
    '**/apps/admin-app/**'
  ]
}
```

### Scenario 4: **High Precision RAG (Quality over Quantity)**

**Goal:** Only index high-quality, well-documented components

**extraction.config.js:**
```javascript
detection: {
  confidenceThreshold: 5,  // Higher threshold (more strict)
}
```

**Note:** Python pipeline chunking logic is hardcoded in `core/ingest_components.py`.

---

## 📊 Configuration Reference

### File Extensions

**Supported by default:**
- `.js` - JavaScript
- `.jsx` - JavaScript + JSX
- `.ts` - TypeScript
- `.tsx` - TypeScript + JSX

**To add more:**
```javascript
// extraction.config.js
files: {
  include: ["js", "jsx", "ts", "tsx", "vue", "svelte"]
}
```

### Directory Patterns

**Glob patterns supported:**
- `**/components/**` - Any `components` directory
- `src/features/**/` - Only in `src/features`
- `!**/deprecated/**` - Exclude deprecated (use in exclude array)

### Chunk Types Explained

**Note:** Chunk types are hardcoded in `core/ingest_components.py`. All types are always created.

| Chunk Type | Purpose | Size | When Used |
|------------|---------|------|-----------|
|------------|---------|------|-----------|
| `basic_info` | Component metadata | Small | Always |
| `props` | Props documentation | Small | Always |
| `complete_component` | All files combined | Large | Aggregated components |
| `component_source` | Just .component.tsx | Medium | Aggregated components |
| `interfaces` | TypeScript types | Medium | When .interface.ts exists |
| `styles` | CSS-in-JS | Medium | When .style.ts exists |
| `code_snippets` | Searchable fragments | Small | For semantic search |

---

## 🎯 Best Practices

### 1. **Start with Default Config**
Don't modify everything at once. Start with defaults and adjust as needed.

### 2. **Use `includeOnly` for Large Repos**
Narrow down extraction to relevant directories for better performance.

### 3. **Adjust `confidenceThreshold` Based on Codebase**
- **Messy codebase:** Lower threshold (2-3)
- **Clean codebase:** Higher threshold (4-5)

### 4. **Disable `code_snippets` for Speed**
Code snippets add many chunks. Disable if not using semantic search.

### 5. **Test Configuration Changes**
Run extraction on a small subset first:
```javascript
files: {
  includeOnly: ['**/src/components/Button/**']
}
```

### 6. **Monitor Chunk Counts**
Check extraction summary to ensure chunks aren't exploding:
```
📊 EXTRACTION VALIDATION SUMMARY
Total components extracted: 50
Total chunks created: 250  ← Should be reasonable
```

---

## 🔍 Troubleshooting

### Problem: Too many components extracted

**Solution:** Increase `confidenceThreshold` or use `includeOnly`
```javascript
detection: {
  confidenceThreshold: 5  // More strict
}
```

### Problem: Missing components

**Solution:** Lower `confidenceThreshold` or check `exclude` patterns
```javascript
detection: {
  confidenceThreshold: 2  // More permissive
}
```

### Problem: Chunks too large

**Solution:** Chunking logic is hardcoded in `core/ingest_components.py`. To modify chunk sizes, edit the source file directly:
- Chunk processing logic in `ingest_components.py`
- All chunk types are always created (basic_info, props, complete_component, etc.)

### Problem: Slow extraction

**Solution:** Enable parallel processing or reduce scope
```javascript
advanced: {
  enableParallelProcessing: true,
  workers: 8
}
```

---

## 📝 Next Steps

1. **Review** `extraction.config.js` and adjust for your codebase
2. **Run extraction** and check the summary
3. **Modify Python settings** directly in source files if needed:
   - `core/index_components.py` - ChromaDB collection settings
   - `core/ingest_components.py` - Chunking logic
   - `core/query_cli.py` - Query parameters
4. **Iterate** based on results

For more details, see the main README.md in the project root.
