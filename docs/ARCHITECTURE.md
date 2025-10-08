# RAG Pipeline Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                          CONFIGURATION                              │
│                                                                     │
│  ┌──────────────────────────┐    ┌──────────────────────────────┐ │
│  │ extraction.config.js     │    │ Python Settings              │ │
│  ├──────────────────────────┤    │ (Hardcoded in Source)        │ │
│  │ • Repository paths       │    ├──────────────────────────────┤ │
│  │ • File patterns          │    │ • Chunk types (all types)    │ │
│  │ • Include/exclude dirs   │    │ • ChromaDB settings          │ │
│  │ • Aggregation patterns   │    │ • Query parameters           │ │
│  │ • Detection threshold    │    │ • Collection name            │ │
│  │ • Logging level          │    │ • Embedding model            │ │
│  └──────────────────────────┘    └──────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────┘
                               ▼
┌─────────────────────────────────────────────────────────────────────┐
│                        EXTRACTION PIPELINE                          │
│                    (scripts/code_extractor.js)                      │
│                                                                     │
│  Step 1: Load Config                                               │
│  ┌───────────────────────────────────────────────────────────────┐ │
│  │ const CONFIG = require("../config/extraction.config.js")      │ │
│  └───────────────────────────────────────────────────────────────┘ │
│                               ▼                                     │
│  Step 2: Scan Files (config-driven)                               │
│  ┌───────────────────────────────────────────────────────────────┐ │
│  │ • Root: CONFIG.repository.root                                │ │
│  │ • Extensions: CONFIG.files.include → "js,jsx,ts,tsx"         │ │
│  │ • Exclude: CONFIG.files.exclude → node_modules, tests, etc.  │ │
│  │ • IncludeOnly: CONFIG.files.includeOnly → filter by pattern  │ │
│  └───────────────────────────────────────────────────────────────┘ │
│                               ▼                                     │
│  Step 3: Smart Aggregation (config-driven)                        │
│  ┌───────────────────────────────────────────────────────────────┐ │
│  │ • Enabled: CONFIG.aggregation.enabled                         │ │
│  │ • Component: CONFIG.aggregation.patterns.component            │ │
│  │ • Interface: CONFIG.aggregation.patterns.interface            │ │
│  │ • Style: CONFIG.aggregation.patterns.style                    │ │
│  │ • Index: CONFIG.aggregation.patterns.index                    │ │
│  └───────────────────────────────────────────────────────────────┘ │
│                               ▼                                     │
│  Step 4: Component Detection (config-driven)                      │
│  ┌───────────────────────────────────────────────────────────────┐ │
│  │ • Threshold: CONFIG.detection.componentDetectionThreshold     │ │
│  │ • Component dirs: CONFIG.detection.componentDirs              │ │
│  │ • Hooks: CONFIG.detection.hooks                               │ │
│  └───────────────────────────────────────────────────────────────┘ │
│                               ▼                                     │
│  Step 5: Extract Component Data                                   │
│  ┌───────────────────────────────────────────────────────────────┐ │
│  │ • Props extraction                                            │ │
│  │ • Interface extraction                                        │ │
│  │ • Style extraction                                            │ │
│  │ • Description generation                                      │ │
│  └───────────────────────────────────────────────────────────────┘ │
│                               ▼                                     │
│  Output: build-index/component_docs.json                          │
└─────────────────────────────────────────────────────────────────────┘
                               ▼
┌─────────────────────────────────────────────────────────────────────┐
│                         CHUNKING PIPELINE                           │
│                      (ingest_components.py)                         │
│                                                                     │
│  Step 1: Load Components                                           │
│  ┌───────────────────────────────────────────────────────────────┐ │
│  │ • Read component_docs.json                                    │ │
│  └───────────────────────────────────────────────────────────────┘ │
│                               ▼                                     │
│  Step 2: Create Chunks                                             │
│  ┌───────────────────────────────────────────────────────────────┐ │
│  │ • Create basic_info chunk                                     │ │
│  │ • Create complete_component chunk                             │ │
│  │ • Create component_source chunk                               │ │
│  │ • Create interfaces chunk                                     │ │
│  │ • Create code snippet chunks                                  │ │
│  └───────────────────────────────────────────────────────────────┘ │
│                               ▼                                     │
│  Step 3: Save Chunks                                               │
│  ┌───────────────────────────────────────────────────────────────┐ │
│  │ • Write chunks to component_chunks.json                       │ │
│  └───────────────────────────────────────────────────────────────┘ │
│                               ▼                                     │
│  Output: build-index/component_chunks.json                        │
└─────────────────────────────────────────────────────────────────────┘
                               ▼
┌─────────────────────────────────────────────────────────────────────┐
│                        INDEXING PIPELINE                            │
│                      (index_components.py)                          │
│                                                                     │
│  Step 1: Load Hardcoded Settings                                   │
│  ┌───────────────────────────────────────────────────────────────┐ │
│  │ • Collection: "component_chunks" (hardcoded)                  │ │
│  │ • Model: "all-MiniLM-L6-v2" (hardcoded)                       │ │
│  │ • Distance: "cosine" (hardcoded)                              │ │
│  └───────────────────────────────────────────────────────────────┘ │
│                               ▼                                     │
│  Step 2: Initialize ChromaDB                                       │
│  ┌───────────────────────────────────────────────────────────────┐ │
│  │ • Persist directory: "./build-index/chromadb"                 │ │
│  │ • Embedding function: SentenceTransformerEmbeddingFunction   │ │
│  └───────────────────────────────────────────────────────────────┘ │
│                               ▼                                     │
│  Step 3: Index Documents                                           │
│  ┌───────────────────────────────────────────────────────────────┐ │
│  │ • Batch size: 100 (hardcoded)                                 │ │
│  │ • Metadata fields: All component metadata                     │ │
│  └───────────────────────────────────────────────────────────────┘ │
│                               ▼                                     │
│  Output: build-index/chromadb/ (vector database)                  │
└─────────────────────────────────────────────────────────────────────┘
                               ▼
┌─────────────────────────────────────────────────────────────────────┐
│                          QUERY PIPELINE                             │
│                        (query_cli.py)                               │
│                                                                     │
│  Step 1: Search ChromaDB                                           │
│  ┌───────────────────────────────────────────────────────────────┐ │
│  │ • Uses hardcoded search parameters                            │ │
│  │ • Returns top N most similar results                          │ │
│  └───────────────────────────────────────────────────────────────┘ │
│                               ▼                                     │
│  Step 2: Rank Results                                              │
│  ┌───────────────────────────────────────────────────────────────┐ │
│  │ • Sort by similarity score                                    │ │
│  └───────────────────────────────────────────────────────────────┘ │
│                               ▼                                     │
│  Output: Ranked search results with metadata                      │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 🎯 Configuration Flow

### 1. **User Updates Config**
```
config/extraction.config.js → Change repository.root to "my-app/src"
```

**Note:** Python settings (chunking, indexing, querying) are hardcoded in source files:
- `core/ingest_components.py` - Chunking logic (all chunk types always created)
- `core/index_components.py` - ChromaDB settings (collection, model, distance)
- `core/query_cli.py` - Query parameters (n_results, thresholds)

### 2. **Scripts Load Config**
```
code_extractor.js → const CONFIG = require("../config/extraction.config.js")
```

### 3. **Behavior Changes**
```
✅ Extraction happens from "my-app/src" (configurable)
✅ Python pipeline uses hardcoded settings
```

---

## 📂 File Structure

```
poc_rag_builder/
├── config/
│   ├── extraction.config.js     ← JavaScript extraction config
│   └── README.md                ← Configuration guide
│
├── scripts/
│   └── code_extractor.js        ← Uses extraction.config.js
│
├── core/
│   ├── ingest_components.py     ← Hardcoded chunking logic
│   ├── index_components.py      ← Hardcoded ChromaDB settings
│   └── query_cli.py             ← Hardcoded query parameters
│
├── build-index/
│   ├── component_docs.json      ← Extracted components
│   ├── component_chunks.json    ← Generated chunks
│   └── chromadb/                ← Vector database
│
└── web-extensions/              ← Source code (configurable via extraction.config.js)
```

---

## 🔄 Data Flow

```
┌──────────────┐
│  Source Code │ (CONFIG.repository.root from extraction.config.js)
└──────┬───────┘
       │
       ├─► Scan files (CONFIG.files.include/exclude)
       │
       ├─► Smart aggregation (CONFIG.aggregation.patterns)
       │
       ├─► Detect components (CONFIG.detection.componentDetectionThreshold)
       │
       ▼
┌──────────────────┐
│ component_docs   │
│ .json            │
└──────┬───────────┘
       │
       ├─► Create chunks (all chunk types - hardcoded in ingest_components.py)
       │
       ▼
┌──────────────────┐
│ component_chunks │
│ .json            │
└──────┬───────────┘
       │
       ├─► Batch indexing (batch_size=100 - hardcoded in index_components.py)
       │
       ├─► Embed text (all-MiniLM-L6-v2 - hardcoded in index_components.py)
       │
       ▼
┌──────────────────┐
│  ChromaDB        │ (vector database)
└──────┬───────────┘
       │
       ├─► Search and rank by similarity (hardcoded in query_cli.py)
       │
       ▼
┌──────────────────┐
│  Search Results  │
└──────────────────┘
```

---

## 🎯 Architecture Benefits

### ✅ **Extraction Flexibility**
Change component extraction behavior via `extraction.config.js` without code changes

### ✅ **Pipeline Consistency**
Python pipeline uses stable, hardcoded settings ensuring consistent behavior

### ✅ **Maintainability**
Extraction settings in config file, pipeline settings in source code - clear separation

### ✅ **Testability**
Easy to create test extraction configs with limited scope

### ✅ **Documentation**
Config files are self-documenting with inline comments

### ✅ **Collaboration**
Non-developers can adjust settings without touching code

### ✅ **Experimentation**
Quick iteration on extraction/chunking strategies

---

## 🚀 Example Workflows

### Workflow 1: New Project Setup
```bash
1. Edit config/extraction.config.js
   - Set repository.root to your project
   - Adjust file patterns if needed

2. Run extraction
   node scripts/code_extractor.js

3. Check results
   cat build-index/component_docs.json | jq 'length'

4. Iterate on config until satisfied
```

### Workflow 2: Performance Tuning
```bash
1. Edit config/extraction.config.js
   - Add more exclude patterns
   - Set includeOnly to limit scope

2. Edit Python source files (if needed)
   - core/index_components.py: Adjust batch_size
   - core/ingest_components.py: Modify chunking logic

3. Run full pipeline
   python3 core/build_index.py --clean

4. Measure performance improvement
```

### Workflow 3: Quality Improvement
```bash
1. Edit config/extraction.config.js
   - Increase componentDetectionThreshold to 5

2. Edit Python source files (if needed)
   - core/ingest_components.py: Adjust chunk validation
   - core/index_components.py: Modify indexing logic

3. Run and verify
   python3 core/build_index.py
```

---

This architecture makes your RAG system **production-ready**, **maintainable**, and **adaptable** to any codebase! 🎉
