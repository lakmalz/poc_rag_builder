# Technical Documentation - RAG Component Indexing System

## Table of Contents
1. [System Overview](#system-overview)
2. [Architecture](#architecture)
3. [Core Classes](#core-classes)
4. [Data Flow](#data-flow)
5. [Configuration](#configuration)
6. [API Reference](#api-reference)

---

## System Overview

This is a Retrieval-Augmented Generation (RAG) system designed to index, search, and retrieve React components using semantic search. The system extracts React components from a codebase, chunks them into meaningful pieces, generates vector embeddings, and stores them in a vector database (ChromaDB) for fast semantic retrieval.

### Key Technologies
- **Node.js**: Component extraction (JavaScript/TypeScript parsing)
- **Python**: Chunking, indexing, and querying
- **ChromaDB**: Vector database for embeddings storage
- **Sentence Transformers**: Embedding model (all-MiniLM-L6-v2)
- **React Docgen TypeScript**: Component props extraction
- **FastAPI**: REST API server

### Use Cases
- Find similar components using natural language queries
- Discover reusable components in large codebases
- Generate component documentation automatically
- Build AI-powered code search tools

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     RAG Pipeline                            │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  1. EXTRACTION (JavaScript/Node.js)                         │
│     ┌──────────────────────────────┐                        │
│     │ RepositoryWideExtractor      │                        │
│     │ ComponentDetector            │                        │
│     │ ComponentParser              │                        │
│     └──────────────────────────────┘                        │
│                    ↓                                        │
│         component_docs.json                                 │
│                    ↓                                        │
│  2. CHUNKING (Python)                                       │
│     ┌──────────────────────────────┐                        │
│     │ ComponentChunker             │                        │
│     └──────────────────────────────┘                        │
│                    ↓                                        │
│         component_chunks.json                               │
│                    ↓                                        │
│  3. INDEXING (Python)                                       │
│     ┌──────────────────────────────┐                        │
│     │ ComponentIndexer             │                        │
│     │ EmbeddingFunction            │                        │
│     └──────────────────────────────┘                        │
│                    ↓                                        │
│         ChromaDB (Vectors + Metadata)                       │
│                    ↓                                        │
│  4. QUERYING (Python)                                       │
│     ┌──────────────────────────────┐                        │
│     │ ComponentQueryer             │                        │
│     └──────────────────────────────┘                        │
│                    ↓                                        │
│         Ranked Search Results                               │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## Core Classes

### 1. JavaScript Classes (Extraction Phase)

#### **RepositoryWideExtractor**
**Location:** `scripts/code_extractor.js`

**Purpose:** Main orchestrator for extracting React components from a codebase.

**Key Methods:**

```javascript
static extractComponents()
```
- **Description:** Entry point that orchestrates the entire extraction process
- **Process:**
  1. Loads configuration from `config/extraction.config.js`
  2. Scans repository for React/TypeScript files
  3. Groups files into component directories (smart aggregation)
  4. Processes each component group or standalone file
  5. Extracts props, interfaces, types, styles
  6. Writes output to `component_docs.json`
- **Returns:** void (writes to file)

```javascript
static groupComponentFiles(files, repoRoot)
```
- **Description:** Groups related component files into multi-file components
- **Input:** 
  - `files`: Array of file paths
  - `repoRoot`: Repository root path
- **Logic:**
  - Detects patterns: `*.component.tsx`, `*.interface.ts`, `*.style.ts`, `index.ts`
  - Groups files by directory
  - Identifies standalone files
- **Returns:** 
  ```javascript
  {
    componentGroups: Map<directory, {
      componentName, files: {component, interface, style, index}
    }>,
    standaloneFiles: Array<filePath>
  }
  ```

```javascript
static extractInterfacesFromFile(fileContent, filePath)
```
- **Description:** Extracts TypeScript interfaces, types, and enums
- **Input:** File content string
- **Uses:** Regular expressions to parse TypeScript syntax
- **Returns:**
  ```javascript
  {
    interfaces: [{name, content, raw}],
    types: [{name, definition, raw}],
    enums: [{name, values, raw}]
  }
  ```

```javascript
static extractStylesFromFile(fileContent, filePath)
```
- **Description:** Detects and extracts styling information
- **Detects:** MUI makeStyles, styled-components, emotion, CSS-in-JS
- **Returns:**
  ```javascript
  {
    type: 'mui-makestyles' | 'styled-components' | 'emotion' | 'css-in-js',
    content: string,
    classes: [],
    variables: []
  }
  ```

**Output Format (component_docs.json):**
```json
{
  "id": "ProfilePage",
  "name": "ProfilePage",
  "directory": "src/components/ProfilePage",
  "aggregationType": "multi-file",
  "files": {
    "component": "src/components/ProfilePage/ProfilePage.component.tsx",
    "interface": "src/components/ProfilePage/ProfilePage.interface.ts",
    "style": "src/components/ProfilePage/ProfilePage.style.ts",
    "index": "src/components/ProfilePage/index.ts"
  },
  "raw": {
    "component": "import React...",
    "interface": "export interface...",
    "style": "const useStyles...",
    "index": "export { default }..."
  },
  "props": {...},
  "interfaces": [...],
  "types": [...],
  "styles": {...},
  "description": "A ProfilePage component..."
}
```

---

#### **ComponentDetector**
**Location:** `scripts/extraction_classes.js`

**Purpose:** Detects whether a file contains a React component.

**Key Methods:**

```javascript
static isReactComponent(fileContent, filePath, repoRoot, debugInfo)
```
- **Description:** Determines if a file is a React component
- **Detection Criteria:**
  1. File is in configured component directories
  2. Imports React or JSX libraries
  3. Contains JSX syntax (`<`, `>`, `jsx`)
  4. Contains React component patterns (FC, forwardRef, memo)
  5. Has exports (default or named)
- **Uses:** Confidence scoring system
- **Returns:** `true` if confidence >= threshold (default: 3)

**Confidence Scoring:**
- File in component directory: +2 points
- Imports React: +2 points
- Contains JSX: +3 points
- Has component patterns: +2 points
- Has exports: +1 point
- Minimum threshold: 3 (configurable)

---

#### **ComponentParser**
**Location:** `scripts/extraction_classes.js`

**Purpose:** Extracts component metadata from parsed documentation.

**Key Methods:**

```javascript
static getComponentName(doc, filePath)
```
- **Description:** Determines the component name from file or documentation
- **Priority:**
  1. `doc.displayName`
  2. `doc.exportName`
  3. Filename (e.g., "ProfilePage" from "ProfilePage.component.tsx")
- **Returns:** String component name

---

### 2. Python Classes (Chunking, Indexing, Querying)

#### **ComponentChunker**
**Location:** `core/ingest_components.py`

**Purpose:** Breaks down extracted components into searchable chunks.

**Key Methods:**

```python
def chunk_components(self, components: List[Dict]) -> List[Dict]
```
- **Description:** Main entry point for chunking
- **Input:** List of component objects from `component_docs.json`
- **Process:**
  1. Loads components from JSON
  2. Determines aggregation type
  3. Calls appropriate chunking method
  4. Combines all chunks
- **Returns:** List of chunk dictionaries

```python
def extract_aggregated_component_chunks(self, component: Dict) -> List[Dict]
```
- **Description:** Chunks multi-file aggregated components
- **Creates 7 chunk types:**
  1. **complete_component**: All files together (for broad search)
  2. **basic_info**: Component name, description, location
  3. **props**: Props documentation
  4. **component_source**: Main component code only
  5. **interfaces**: TypeScript types and interfaces
  6. **styles**: Style definitions
  7. **code**: Individual code snippets (from `process_code_snippet`)
  
**Chunk Structure:**
```python
{
  "chunk_id": "ProfilePage_complete",
  "component_id": "ProfilePage",
  "component_name": "ProfilePage",
  "file": "src/components/ProfilePage/ProfilePage.component.tsx",
  "directory": "src/components/ProfilePage",
  "chunk_type": "complete_component",
  "text": "ProfilePage complete component with all files:\n\n..."
}
```

```python
def process_code_snippet(self, code: str, component_id: str, 
                        component_name: str, file_path: str) -> List[Dict]
```
- **Description:** Splits large code into smaller searchable snippets
- **Strategy:**
  - Splits by functions/methods
  - Falls back to line-based chunking if no functions found
  - Chunk size: ~500 characters
- **Returns:** List of code chunk dictionaries

**Output (component_chunks.json):**
```json
{
  "chunk_id": "ProfilePage_complete",
  "component_id": "ProfilePage",
  "component_name": "ProfilePage",
  "file": "src/components/ProfilePage/ProfilePage.component.tsx",
  "directory": "src/components/ProfilePage",
  "chunk_type": "complete_component",
  "text": "ProfilePage complete component with all files:..."
}
```

---

#### **ComponentIndexer**
**Location:** `core/index_components.py`

**Purpose:** Indexes chunks into ChromaDB with vector embeddings.

**Key Methods:**

```python
def __init__(self, collection_name="component_chunks", 
             model_name="all-MiniLM-L6-v2")
```
- **Description:** Initialize indexer with configuration
- **Parameters:**
  - `collection_name`: ChromaDB collection name
  - `model_name`: Sentence transformer model for embeddings

```python
def _get_embedding_function(self)
```
- **Description:** Gets the embedding function for converting text to vectors
- **Uses:** `embedding_utils.get_embedding_function()`
- **Model:** all-MiniLM-L6-v2 (384-dimensional vectors)
- **Returns:** Callable embedding function

```python
def _get_client(self)
```
- **Description:** Initializes ChromaDB persistent client
- **Location:** `build-index/chromadb/`
- **Settings:** Anonymized telemetry disabled
- **Returns:** ChromaDB client instance

```python
def _get_collection(self, create_if_missing=True)
```
- **Description:** Gets or creates ChromaDB collection
- **Metadata:** Uses cosine similarity for distance metric
- **Returns:** ChromaDB collection instance

```python
def build_index(self, batch_size=64)
```
- **Description:** Main indexing process
- **Process:**
  1. Load chunks from `component_chunks.json`
  2. Create/clear ChromaDB collection
  3. Prepare text, metadata, and IDs
  4. Add documents in batches
  5. Validate count matches
- **Batch Processing:** Processes 64 chunks at a time
- **Validation:** Ensures all chunks are stored

**ChromaDB Storage:**
```
Stored for each chunk:
- documents: The actual text
- metadatas: {component_id, chunk_id, chunk_type, file, directory, component_name}
- embeddings: 384-dimensional float vectors (auto-generated)
- ids: Unique IDs (chunk_0, chunk_1, ...)
```

---

#### **ComponentQueryer**
**Location:** `core/query_cli.py`

**Purpose:** Queries the indexed components using semantic search.

**Key Methods:**

```python
def __init__(self, collection_name="component_chunks", 
             model_name="all-MiniLM-L6-v2")
```
- **Description:** Initialize queryer with same config as indexer
- **Important:** Must use same model for query embeddings

```python
def _get_embedding_function(self)
```
- **Description:** Gets embedding function (must match indexer)
- **Critical:** Query embeddings must use same model as index

```python
def query_components(self, query_text: str, k: int = 5, 
                    per_component: int = 1) -> List[Dict]
```
- **Description:** Main search function
- **Process:**
  1. Convert query text to embedding vector
  2. Search ChromaDB for similar vectors
  3. Convert distances to similarity scores (1 - distance)
  4. Group results by component
  5. Return top k components with best chunks
- **Parameters:**
  - `query_text`: Natural language query
  - `k`: Number of chunks to retrieve
  - `per_component`: Max chunks per component in results
- **Returns:** List of results with scores and chunks

**Search Algorithm:**
```python
# 1. Embed query
query_embedding = embedding_model(query_text)  # [384] vector

# 2. Vector similarity search
results = chromadb.query(
    query_embeddings=[query_embedding],
    n_results=k
)

# 3. Score calculation
for each result:
    similarity_score = 1 - cosine_distance
    
# 4. Aggregation
group by component_id:
    keep top per_component chunks per component
    sort by best_score
```

**Query Result Format:**
```python
[
  {
    "component_id": "ProfilePage",
    "component_name": "ProfilePage",
    "file": "src/components/ProfilePage/ProfilePage.component.tsx",
    "best_score": 0.8934,
    "top_chunks": [
      {
        "chunk_id": "ProfilePage_component_source",
        "text": "...",
        "score": 0.8934
      }
    ]
  }
]
```

---

### 3. Utility Classes

#### **EmbeddingFunction** (via embedding_utils)
**Location:** `core/embedding_utils.py`

**Purpose:** Wraps sentence-transformers model for ChromaDB integration.

```python
def get_embedding_function(model_name="all-MiniLM-L6-v2")
```
- **Description:** Creates embedding function compatible with ChromaDB
- **Model:** Sentence transformer (default: all-MiniLM-L6-v2)
- **Output:** 384-dimensional dense vectors
- **Properties:**
  - Cached model loading
  - Batch processing support
  - Normalized vectors for cosine similarity
- **Returns:** Callable that converts text → vector

**Embedding Process:**
```python
text = "user profile form"
↓
tokenize → [101, 2867, 5896, 2433, 102]
↓
transformer model (12 layers, 384 hidden dim)
↓
mean pooling
↓
normalize
↓
embedding vector: [0.023, -0.145, 0.089, ..., 0.234]  # 384 floats
```

---

## Data Flow

### Complete Pipeline Flow

```
1. EXTRACTION
   Input: React codebase (*.tsx, *.ts files)
   ↓
   ComponentDetector.isReactComponent() → filter files
   ↓
   RepositoryWideExtractor.groupComponentFiles() → group by directory
   ↓
   For each component:
     - Parse with react-docgen-typescript
     - Extract props, interfaces, styles
     - Aggregate multi-file components
   ↓
   Output: component_docs.json
   Format: [{id, name, files, raw, props, interfaces, types, styles}, ...]

2. CHUNKING
   Input: component_docs.json
   ↓
   ComponentChunker.chunk_components()
   ↓
   For each component:
     - extract_aggregated_component_chunks()
       → complete_component chunk (all files)
       → basic_info chunk (metadata)
       → component_source chunk (main code)
       → interfaces chunk (types)
       → styles chunk (CSS)
       → props chunk (documentation)
     - process_code_snippet()
       → code chunks (searchable snippets)
   ↓
   Output: component_chunks.json
   Format: [{chunk_id, component_id, chunk_type, text, file, ...}, ...]

3. INDEXING
   Input: component_chunks.json
   ↓
   ComponentIndexer.build_index()
   ↓
   For each chunk (batch=64):
     text → get_embedding_function() → embedding [384 floats]
     ↓
     ChromaDB.add(
       documents=[text],
       metadatas=[{component_id, file, chunk_type, ...}],
       embeddings=[vector],
       ids=[chunk_id]
     )
   ↓
   Output: ChromaDB database
   Location: build-index/chromadb/
   Contains: vectors, metadata, SQLite index

4. QUERYING
   Input: Natural language query
   ↓
   ComponentQueryer.query_components()
   ↓
   query_text → get_embedding_function() → query_embedding [384 floats]
   ↓
   ChromaDB.query(
     query_embeddings=[query_embedding],
     n_results=k
   )
   ↓
   For each result:
     distance → similarity_score = 1 - distance
   ↓
   Group by component_id, keep top per_component chunks
   ↓
   Sort by best_score
   ↓
   Output: Ranked component results
   Format: [{component_name, file, score, matched_chunks}, ...]
```

---

## Configuration

### JavaScript Configuration
**File:** `config/extraction.config.js`

```javascript
module.exports = {
  repository: {
    root: "web-extensions",        // Source code location
    buildDir: "build-index"         // Output directory
  },
  
  files: {
    include: ["js", "jsx", "ts", "tsx"],  // File extensions
    exclude: ["**/node_modules/**"],       // Exclude patterns
    includeOnly: ["src/components/**"]     // Limit scope (optional)
  },
  
  aggregation: {
    enabled: true,                  // Smart multi-file grouping
    patterns: {
      component: /\.component\.(tsx|jsx)$/,
      interface: /\.(interface|types)\.(ts|tsx)$/,
      style: /\.(style|styles)\.(ts|tsx|js)$/,
      index: /^index\.(ts|tsx|js)$/
    },
    aggregateIndexEverywhere: false  // Aggregate index files globally
  },
  
  detection: {
    componentDetectionThreshold: 3,  // Confidence threshold (1-5)
    componentDirs: ['components', 'ui', 'widgets', 'pages']
  },
  
  logging: {
    createBackup: true  // Backup existing output files
  }
};
```

### Python Configuration (Hardcoded)
**Locations:** Various Python files

```python
# Chunking (ingest_components.py)
CHUNK_SIZE = 500  # Characters per code snippet

# Indexing (index_components.py)
COLLECTION_NAME = "component_chunks"
MODEL_NAME = "all-MiniLM-L6-v2"
BATCH_SIZE = 64
DISTANCE_METRIC = "cosine"

# Querying (query_cli.py)
DEFAULT_K = 5          # Top results to return
DEFAULT_PER_COMPONENT = 1  # Chunks per component
```

---

## API Reference

### CLI Commands

```bash
# Build Index
python3 core/build_index.py [--clean]

# Query Components
python3 core/query_cli.py list-components [--output-format list|json|names]
python3 core/query_cli.py get-component-exact <name>
python3 core/query_cli.py query-find-component <query> [--k 5] [--per-component 1]

# Interactive Browser
python3 core/component_browser.py

# Read ChromaDB
python3 read-chromadb/read_chromadb.py list
python3 read-chromadb/read_chromadb.py search <query>
python3 read-chromadb/read_chromadb.py export
```

### REST API Endpoints

```bash
# Health Check
GET /api/health
Response: {status, database, total_components, total_chunks}

# List Components
GET /api/components
Response: {total, components: [{name, file, component_id}]}

# Get Component
GET /api/components/{name}
Response: {name, file, source_code, interfaces, styles, props}

# Semantic Search
POST /api/components/search
Body: {query, k, per_component}
Response: {query, total_results, components: [{name, score, file, matched_chunks}]}

# Build Index
POST /api/index/build
Response: {status, message, stats}

# Rebuild Index
POST /api/index/rebuild
Response: {status, message, stats}
```

---

## Advanced Topics

### Vector Embeddings Explained

**What are embeddings?**
Embeddings are numerical representations of text that capture semantic meaning.

**Example:**
```python
text1 = "user profile form"
embedding1 = [0.023, -0.145, 0.089, ..., 0.234]  # 384 numbers

text2 = "profile edit page"
embedding2 = [0.019, -0.152, 0.091, ..., 0.229]  # 384 numbers

similarity = cosine_similarity(embedding1, embedding2) = 0.89
# High similarity → semantically related
```

**Why 384 dimensions?**
- The all-MiniLM-L6-v2 model outputs 384-dimensional vectors
- Each dimension captures different semantic features
- More dimensions = more nuanced meaning representation

**How search works:**
1. Query: "user profile" → embedding: [0.02, -0.14, ...]
2. Compare with all stored embeddings using cosine similarity
3. Rank by similarity score
4. Return top matches

### Chunking Strategies

**Why chunk?**
- Large components are too broad for specific searches
- Smaller chunks improve search precision
- Different chunk types serve different purposes

**Chunk Types:**
1. **complete_component**: For broad "show me everything" queries
2. **basic_info**: For metadata searches (name, location)
3. **component_source**: For code-focused searches
4. **interfaces**: For type/prop searches
5. **styles**: For styling searches
6. **code**: For specific function/method searches

### Performance Considerations

**Indexing Performance:**
- Batch size: 64 chunks (balance speed vs memory)
- Model loading: Cached after first use
- Embedding generation: ~100 chunks/second

**Query Performance:**
- Vector search: O(log n) with HNSW index
- Typical query time: 10-50ms
- Scales to millions of chunks

**Storage:**
- Text: ~1KB per chunk
- Embedding: 384 floats × 4 bytes = 1.5KB per chunk
- Metadata: ~200 bytes per chunk
- Total: ~2.7KB per chunk

---

## Troubleshooting

### Common Issues

**Issue: No components extracted**
- Check `repository.root` in config
- Verify `includeOnly` patterns
- Lower `componentDetectionThreshold`

**Issue: Empty search results**
- Rebuild index: `python3 core/build_index.py --clean`
- Check ChromaDB exists: `ls -la build-index/chromadb/`
- Verify chunks: `python3 read-chromadb/read_chromadb.py list`

**Issue: Import errors**
- Install dependencies: `pip3 install -r requirements.txt`
- Check Python version: `python3 --version` (need 3.8+)

---

## Extension Points

### Adding New Chunk Types

```python
# In ComponentChunker.extract_aggregated_component_chunks()
chunks.append({
    "chunk_id": f"{component_id}_custom",
    "component_id": component_id,
    "component_name": component_name,
    "file": file_path,
    "chunk_type": "custom_type",
    "text": "Custom chunk content..."
})
```

### Using Different Embedding Models

```python
# In embedding_utils.py
def get_embedding_function(model_name="sentence-transformers/all-mpnet-base-v2"):
    # 768-dimensional embeddings (more accurate, slower)
    model = SentenceTransformer(model_name)
    return model.encode
```

### Adding Metadata Filters

```python
# In ComponentQueryer.query_components()
results = collection.query(
    query_texts=[query_text],
    n_results=k,
    where={"chunk_type": "component_source"}  # Filter by chunk type
)
```

---

## Contributing

### Code Standards
- JavaScript: ES6+, CommonJS modules
- Python: PEP 8, type hints recommended
- Comments: Docstrings for all public methods

### Testing
- Test extraction: `node scripts/code_extractor.js`
- Test chunking: `python3 core/ingest_components.py`
- Test indexing: `python3 core/index_components.py`
- Test queries: `python3 core/query_cli.py list-components`

---

## References

- **ChromaDB**: https://docs.trychroma.com/
- **Sentence Transformers**: https://www.sbert.net/
- **React Docgen**: https://github.com/styleguidist/react-docgen-typescript
- **FastAPI**: https://fastapi.tiangolo.com/

---

*Last Updated: October 8, 2025*
