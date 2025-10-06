# Configuration-Driven RAG Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                         USER CONFIGURATION                          │
│                                                                     │
│  ┌──────────────────────────┐    ┌──────────────────────────────┐ │
│  │ extraction.config.js     │    │ chunking.config.py           │ │
│  ├──────────────────────────┤    ├──────────────────────────────┤ │
│  │ • Repository paths       │    │ • Chunk types               │ │
│  │ • File patterns          │    │ • Chunk sizes               │ │
│  │ • Include/exclude dirs   │    │ • ChromaDB settings         │ │
│  │ • Aggregation patterns   │    │ • Query behavior            │ │
│  │ • Detection threshold    │    │ • Validation rules          │ │
│  │ • Logging level          │    │ • Filters                   │ │
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
│  │ • Threshold: CONFIG.detection.confidenceThreshold             │ │
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
│  Step 1: Load Config                                               │
│  ┌───────────────────────────────────────────────────────────────┐ │
│  │ from config.chunking_config import CHUNKING_CONFIG            │ │
│  └───────────────────────────────────────────────────────────────┘ │
│                               ▼                                     │
│  Step 2: Load Components                                           │
│  ┌───────────────────────────────────────────────────────────────┐ │
│  │ • Read component_docs.json                                    │ │
│  │ • Apply FILE_FILTERS.component_types filter                   │ │
│  │ • Apply FILE_FILTERS.include_directories filter               │ │
│  └───────────────────────────────────────────────────────────────┘ │
│                               ▼                                     │
│  Step 3: Create Chunks (config-driven)                            │
│  ┌───────────────────────────────────────────────────────────────┐ │
│  │ IF CHUNKING_CONFIG.chunk_types.basic_info:                    │ │
│  │   → Create basic_info chunk                                   │ │
│  │ IF CHUNKING_CONFIG.chunk_types.complete_component:            │ │
│  │   → Create complete_component chunk                           │ │
│  │ IF CHUNKING_CONFIG.chunk_types.component_source:              │ │
│  │   → Create component_source chunk                             │ │
│  │ IF CHUNKING_CONFIG.chunk_types.interfaces:                    │ │
│  │   → Create interfaces chunk                                   │ │
│  │ IF CHUNKING_CONFIG.chunk_types.code_snippets:                 │ │
│  │   → Create code snippet chunks                                │ │
│  └───────────────────────────────────────────────────────────────┘ │
│                               ▼                                     │
│  Step 4: Validate Chunks                                           │
│  ┌───────────────────────────────────────────────────────────────┐ │
│  │ • Check min/max sizes from VALIDATION_CONFIG                  │ │
│  │ • Check for duplicates if enabled                             │ │
│  │ • Validate metadata if enabled                                │ │
│  └───────────────────────────────────────────────────────────────┘ │
│                               ▼                                     │
│  Output: build-index/component_chunks.json                        │
└─────────────────────────────────────────────────────────────────────┘
                               ▼
┌─────────────────────────────────────────────────────────────────────┐
│                        INDEXING PIPELINE                            │
│                       (pipeline_cli.py)                             │
│                                                                     │
│  Step 1: Load Config                                               │
│  ┌───────────────────────────────────────────────────────────────┐ │
│  │ from config.chunking_config import INDEXING_CONFIG            │ │
│  └───────────────────────────────────────────────────────────────┘ │
│                               ▼                                     │
│  Step 2: Initialize ChromaDB                                       │
│  ┌───────────────────────────────────────────────────────────────┐ │
│  │ • Collection: INDEXING_CONFIG.chromadb.collection_name        │ │
│  │ • Directory: INDEXING_CONFIG.chromadb.persist_directory       │ │
│  │ • Embedding: INDEXING_CONFIG.chromadb.embedding_function      │ │
│  └───────────────────────────────────────────────────────────────┘ │
│                               ▼                                     │
│  Step 3: Index Documents                                           │
│  ┌───────────────────────────────────────────────────────────────┐ │
│  │ • Batch size: INDEXING_CONFIG.batch_size                      │ │
│  │ • Metadata fields: INDEXING_CONFIG.index_metadata             │ │
│  │ • Clear first: INDEXING_CONFIG.clear_before_index             │ │
│  └───────────────────────────────────────────────────────────────┘ │
│                               ▼                                     │
│  Output: build-index/chromadb/ (vector database)                  │
└─────────────────────────────────────────────────────────────────────┘
                               ▼
┌─────────────────────────────────────────────────────────────────────┐
│                          QUERY PIPELINE                             │
│                        (query_cli.py)                               │
│                                                                     │
│  Step 1: Load Config                                               │
│  ┌───────────────────────────────────────────────────────────────┐ │
│  │ from config.chunking_config import QUERY_CONFIG               │ │
│  └───────────────────────────────────────────────────────────────┘ │
│                               ▼                                     │
│  Step 2: Search ChromaDB                                           │
│  ┌───────────────────────────────────────────────────────────────┐ │
│  │ • N results: QUERY_CONFIG.default_n_results                   │ │
│  │ • Threshold: QUERY_CONFIG.similarity_threshold                │ │
│  │ • Filter by: QUERY_CONFIG.filter_by                           │ │
│  └───────────────────────────────────────────────────────────────┘ │
│                               ▼                                     │
│  Step 3: Rank Results                                              │
│  ┌───────────────────────────────────────────────────────────────┐ │
│  │ • Apply boost scores: QUERY_CONFIG.boost_scores               │ │
│  │ • Sort by similarity * boost                                  │ │
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
config/chunking.config.py   → Disable code_snippets
```

### 2. **Scripts Load Config**
```
code_extractor.js → const CONFIG = require("../config/extraction.config.js")
ingest_components.py → from config.chunking_config import CHUNKING_CONFIG
```

### 3. **Behavior Changes Automatically**
```
✅ Extraction happens from "my-app/src"
✅ No code snippet chunks created
✅ No code changes required!
```

---

## 📂 File Structure

```
poc_rag_builder/
├── config/
│   ├── extraction.config.js     ← JavaScript extraction config
│   ├── chunking.config.py       ← Python chunking/indexing config
│   └── README.md                ← Configuration guide
│
├── scripts/
│   └── code_extractor.js        ← Uses extraction.config.js
│
├── ingest_components.py         ← Will use chunking.config.py
├── pipeline_cli.py              ← Will use chunking.config.py
├── query_cli.py                 ← Will use chunking.config.py
│
├── build-index/
│   ├── component_docs.json      ← Extracted components
│   ├── component_chunks.json    ← Generated chunks
│   └── chromadb/                ← Vector database
│
└── web-extensions/              ← Source code (configurable)
```

---

## 🔄 Data Flow with Config

```
┌──────────────┐
│  Source Code │ (CONFIG.repository.root)
└──────┬───────┘
       │
       ├─► Scan files (CONFIG.files.include/exclude)
       │
       ├─► Smart aggregation (CONFIG.aggregation.patterns)
       │
       ├─► Detect components (CONFIG.detection.confidenceThreshold)
       │
       ▼
┌──────────────────┐
│ component_docs   │
│ .json            │
└──────┬───────────┘
       │
       ├─► Filter files (FILE_FILTERS)
       │
       ├─► Create chunks (CHUNKING_CONFIG.chunk_types)
       │
       ├─► Validate (VALIDATION_CONFIG)
       │
       ▼
┌──────────────────┐
│ component_chunks │
│ .json            │
└──────┬───────────┘
       │
       ├─► Batch indexing (INDEXING_CONFIG.batch_size)
       │
       ├─► Embed text (INDEXING_CONFIG.embedding_function)
       │
       ▼
┌──────────────────┐
│  ChromaDB        │ (vector database)
└──────┬───────────┘
       │
       ├─► Search (QUERY_CONFIG.default_n_results)
       │
       ├─► Filter (QUERY_CONFIG.filter_by)
       │
       ├─► Rank (QUERY_CONFIG.boost_scores)
       │
       ▼
┌──────────────────┐
│  Search Results  │
└──────────────────┘
```

---

## 🎯 Benefits of Config-Driven Architecture

### ✅ **Flexibility**
Change behavior without code changes - just edit config files

### ✅ **Maintainability**
All settings in one place, easy to find and modify

### ✅ **Reusability**
Different configs for different projects/environments

### ✅ **Testability**
Easy to create test configs with limited scope

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

2. Edit config/chunking.config.py
   - Disable code_snippets
   - Increase batch_size

3. Run full pipeline
   python3 rebuild_index.py --clean

4. Measure performance improvement
```

### Workflow 3: Quality Improvement
```bash
1. Edit config/extraction.config.js
   - Increase confidenceThreshold to 5

2. Edit config/chunking.config.py
   - Increase min_component_size
   - Enable more validation checks

3. Run and verify
   python3 pipeline_cli.py --clean
```

---

This architecture makes your RAG system **production-ready**, **maintainable**, and **adaptable** to any codebase! 🎉
