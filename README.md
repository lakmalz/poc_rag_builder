# RAG Builder for React Components

A powerful RAG (Retrieval-Augmented Generation) system for indexing and querying React components from codebases. Extract, chunk, and semantically search React components using vector embeddings.

## 📋 Table of Contents

- [Overview](#overview)
- [Quick Start](#quick-start)
- [Installation](#installation)
- [Usage Guide](#usage-guide)
  - [CLI Usage](#cli-usage)
  - [API Usage](#api-usage)
- [Configuration](#configuration)
- [Project Structure](#project-structure)
- [Troubleshooting](#troubleshooting)

---

## 🎯 Overview

**What it does:**
- 🔍 **Extracts** React components from your codebase
- 🧩 **Chunks** components intelligently (props, interfaces, styles, code snippets)
- 🗄️ **Indexes** into ChromaDB vector database
- 🔎 **Searches** using natural language queries

**Key Features:**
- Smart multi-file aggregation (`.component.tsx` + `.interface.ts` + `.style.ts` + `index.ts`)
- Semantic search with sentence-transformers
- CLI and REST API interfaces
- Interactive component browser

---

## 🚀 Quick Start

### 1. Setup Repository Structure

```bash
poc_rag_builder/
└── web-extensions/          ← Place your React codebase here
    └── src/components/
```

**Clone your React project:**
```bash
cd poc_rag_builder
# git clone <your-react-repo-url> web-extensions
```

**Or use a different name:**
```javascript
// config/extraction.config.js
repository: {
  root: "your-project-name"  // Update this
}
```

### 2. Install Dependencies

```bash
# Node.js dependencies (extraction)
npm install

# Python dependencies (indexing & search)
pip3 install -r requirements.txt
```

### 3. Build Index

```bash
# Quick build (recommended)
python3 core/build_index.py

# Or with cleanup
python3 core/build_index.py --clean
```

### 4. Query Components

```bash
# List all components
python3 core/query_cli.py list-components

# Get specific component
python3 core/query_cli.py get-component-exact ProfilePage

# Semantic search
python3 core/query_cli.py query-find-component "user profile form"

# Interactive browser
python3 core/component_browser.py
```

---

## 📦 Installation

### Prerequisites
- **Node.js** v14+ (for extraction)
- **Python** 3.8+ (for indexing & search)
- **npm** and **pip**

### Install Dependencies

**JavaScript packages:**
```bash
npm install
```
Installs: `glob`, `react-docgen-typescript`

**Python packages:**
```bash
pip3 install -r requirements.txt
```
Installs: `chromadb`, `sentence-transformers`, `typer`, `fastapi`

**Verify installation:**
```bash
node --version
python3 --version
pip3 list | grep chromadb
```

---

## � Usage Guide

### CLI Usage

#### Build Index Pipeline

**Option 1: Quick Build** ⭐ Recommended
```bash
python3 core/build_index.py           # Build index
python3 core/build_index.py --clean   # Clean rebuild
```

**Parameter:**
- `--clean` - Delete existing index before rebuilding (fresh start)

**Option 2: Interactive Pipeline**
```bash
python3 core/component_browser.py     # Build + interactive query
```

**Option 3: Step-by-Step**
```bash
node scripts/code_extractor.js        # 1. Extract components
python3 core/ingest_components.py     # 2. Chunk components  
python3 core/index_components.py      # 3. Index to ChromaDB
```

---

#### Query Components

**List Components**
```bash
# Numbered list with file paths (default)
python3 core/query_cli.py list-components

# JSON output (structured data)
python3 core/query_cli.py list-components --output-format json

# Names only (simple list)
python3 core/query_cli.py list-components --output-format names
```

**Parameter:**
- `--output-format` - Output format: `list` (default), `json`, or `names`

**Get Component Details**
```bash
python3 core/query_cli.py get-component-exact ProfilePage
```

Output includes:
- ✅ Complete source code
- ✅ TypeScript interfaces
- ✅ Styles
- ✅ Props documentation

**Semantic Search**
```bash
python3 core/query_cli.py query-find-component "user profile form" --k 5
```

**Parameters:**
- `--k 5` - Number of top results to return (default: 5)
- `--per-component 10` - Max code snippets per component (default: 10)

**Interactive Browser**
```bash
python3 core/component_browser.py
```
- Browse components by number
- Press 's' for semantic search
- View complete component code

---

### API Usage

#### Start Server

```bash
# Install server dependencies (first time only)
pip3 install -r server/requirements.txt

# Start FastAPI server
python3 server/api_server.py
```

**Access:**
- API: http://localhost:8000
- Docs: http://localhost:8000/docs
- ReDoc: http://localhost:8000/redoc

---

#### Quick API Examples

**1. Health Check**
```bash
curl http://localhost:8000/api/health
```

Response:
```json
{
  "status": "healthy",
  "database": "connected",
  "total_components": 245,
  "total_chunks": 1847
}
```

---

**2. List All Components**
```bash
curl http://localhost:8000/api/components
```

Response:
```json
{
  "total": 2,
  "components": [
    {
      "name": "ProfilePage",
      "file": "components/ProfilePage/ProfilePage.component.tsx",
      "component_id": "ProfilePage"
    }
  ]
}
```

---

**3. Get Specific Component**
```bash
curl http://localhost:8000/api/components/ProfilePage
```

Response:
```json
{
  "name": "ProfilePage",
  "file": "components/ProfilePage/ProfilePage.component.tsx",
  "source_code": "import React...",
  "interfaces": "export interface ProfilePageProps {...}",
  "styles": "const useStyles = makeStyles({...})",
  "props": {...}
}
```

---

**4. Semantic Search**
```bash
curl -X POST http://localhost:8000/api/components/search \
  -H "Content-Type: application/json" \
  -d '{
    "query": "user profile form with edit mode",
    "k": 5,
    "per_component": 10
  }'
```

**Parameters:**
- `query` - Natural language search query
- `k` - Number of top components to return (1-50)
- `per_component` - Max code snippets per component (1-100)
```

Response:
```json
{
  "query": "user profile form with edit mode",
  "total_results": 5,
  "components": [
    {
      "name": "ProfilePage",
      "similarity_score": 0.89,
      "file": "components/ProfilePage/ProfilePage.component.tsx",
      "matched_chunks": [...]
    }
  ]
}
```

---

**5. Build Index**
```bash
curl -X POST http://localhost:8000/api/index/build
```

Response:
```json
{
  "status": "success",
  "message": "Index built successfully",
  "stats": {
    "components_extracted": 245,
    "chunks_created": 1847,
    "build_time_seconds": 12.4
  }
}
```

---

**6. Rebuild Index (with cleanup)**
```bash
curl -X POST http://localhost:8000/api/index/rebuild
```

---

#### JavaScript/TypeScript Client Example

```typescript
const API_BASE = 'http://localhost:8000/api';

// List components
async function listComponents() {
  const res = await fetch(`${API_BASE}/components`);
  const data = await res.json();
  console.log(data.components);
}

// Get specific component
async function getComponent(name: string) {
  const res = await fetch(`${API_BASE}/components/${name}`);
  return await res.json();
}

// Semantic search
async function searchComponents(query: string) {
  const res = await fetch(`${API_BASE}/components/search`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, k: 5 })
  });
  return await res.json();
}

// Usage
const results = await searchComponents('profile form');
console.log(results.components);
```

---

#### Python Client Example

```python
import requests

API_BASE = 'http://localhost:8000/api'

# List components
def list_components():
    response = requests.get(f'{API_BASE}/components')
    return response.json()

# Get specific component
def get_component(name: str):
    response = requests.get(f'{API_BASE}/components/{name}')
    return response.json()

# Semantic search
def search_components(query: str, k: int = 5):
    response = requests.post(
        f'{API_BASE}/components/search',
        json={'query': query, 'k': k}
    )
    return response.json()

# Usage
results = search_components('profile form with validation')
for comp in results['components']:
    print(f"{comp['name']}: {comp['similarity_score']}")
```

---

#### Complete API Reference

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/health` | GET | Health check with stats |
| `/api/index/build` | POST | Build component index |
| `/api/index/rebuild` | POST | Rebuild with cleanup |
| `/api/components` | GET | List all components |
| `/api/components/{name}` | GET | Get specific component |
| `/api/components/search` | POST | Semantic search |

**For detailed API documentation:** See [server/README.md](server/README.md) or visit http://localhost:8000/docs

---

## ⚙️ Configuration

### Extraction Settings

**File:** `config/extraction.config.js`

```javascript
module.exports = {
  repository: {
    root: "web-extensions",      // Your React codebase location
    buildDir: "build-index"       // Output directory
  },
  
  files: {
    include: ["js", "jsx", "ts", "tsx"],
    exclude: ["**/node_modules/**", "**/tests/**"],
    includeOnly: ["src/components/**"]  // Optional: limit scope
  },
  
  aggregation: {
    enabled: true,
    patterns: {
      component: /\.component\.(tsx|jsx)$/,
      interface: /\.(interface|types)\.(ts|tsx)$/,
      style: /\.(style|styles)\.(ts|tsx|js)$/,
      index: /^index\.(ts|tsx|js)$/
    }
  },
  
  detection: {
    componentDetectionThreshold: 3,  // 1-2: permissive, 3: balanced, 4-5: strict
    componentDirs: ['components', 'ui', 'widgets', 'pages']
  },
  
  logging: {
    createBackup: true
  }
};
```

### Python Settings (Hardcoded)

**Note:** Chunking, indexing, and query settings are hardcoded in Python source files:

- `core/index_components.py` - ChromaDB settings (collection, model, distance)
- `core/ingest_components.py` - Chunking logic (chunk types, processing)
- `core/query_cli.py` - Query parameters (n_results, thresholds)

---

## � Project Structure

```
poc_rag_builder/
├── scripts/              # JavaScript extraction tools
│   ├── code_extractor.js
│   └── extraction_classes.js
├── core/                 # Python RAG pipeline
│   ├── ingest_components.py
│   ├── index_components.py
│   ├── query_cli.py
│   └── embedding_utils.py
├── build-index/          # Generated indexes
│   ├── component_docs.json
│   ├── component_chunks.json
│   └── chromadb/
└── Custom-ui/            # Sample React components
```

---

## 🔄 Rebuild Index

Clear and rebuild the entire index:

```bash
rm -rf build-index/
python3 core/build_index.py
```

---

## 📚 Quick Reference

| Task                          | Command                                                         |
|-------------------------------|-----------------------------------------------------------------|
| **Quick build** (recommended) | `python3 core/build_index.py`                                   |
| **Quick build with clean**    | `python3 core/build_index.py --clean`                           |
| **Interactive pipeline**      | `python3 core/component_browser.py`                             |
| **Extract only**              | `node scripts/code_extractor.js`                                |
| **Chunk only**                | `python3 core/ingest_components.py`                             |
| **Index only**                | `python3 core/index_components.py`                              |
| **List components (list)**    | `python3 core/query_cli.py list-components`                     |
| **List components (JSON)**    | `python3 core/query_cli.py list-components --output-format json`|
| **List components (names)**   | `python3 core/query_cli.py list-components --output-format names`|
| **Get component by name**     | `python3 core/query_cli.py get-component-exact ProfilePage`     |
| **Search components**         | `python3 core/query_cli.py query-find-component "search term"`  |
| **Interactive mode**          | `python3 core/component_browser.py`                             |
| **Rebuild index**             | `rm -rf build-index/ && python3 core/build_index.py`            |

---

## 📂 Project Structure

```
poc_rag_builder/                  # Main RAG builder project
├── web-extensions/               # ← Your React codebase goes here
│   └── src/components/          # React components to index
├── config/
│   └── extraction.config.js      # Extraction settings (set repository.root)
├── core/                         # Python RAG pipeline
│   ├── build_index.py           # Main build pipeline
│   ├── ingest_components.py     # Chunking processor
│   ├── index_components.py      # ChromaDB indexer
│   ├── query_cli.py             # Query CLI tool
│   ├── component_browser.py     # Interactive browser
│   └── embedding_utils.py       # Embedding utilities
├── scripts/
│   ├── code_extractor.js        # Component extractor
│   └── extraction_classes.js    # Extraction helpers
├── read-chromadb/                # ChromaDB inspection tools
│   └── read_chromadb.py         # Read/export ChromaDB data
├── server/                       # FastAPI REST API
│   ├── api_server.py            # API server
│   ├── requirements.txt         # Server dependencies
│   └── README.md                # API documentation
├── build-index/                  # Generated outputs
│   ├── component_docs.json       # Extracted components
│   ├── component_chunks.json     # Chunked components
│   └── chromadb/                 # Vector database
├── requirements.txt              # Python dependencies
├── package.json                  # Node.js dependencies
└── README.md                     # This file
```

---

## 🔄 Pipeline Flow

```
[Your React Code]
       ↓
  [Extract] ────→ component_docs.json
       ↓
   [Chunk] ────→ component_chunks.json
       ↓
   [Index] ────→ chromadb/
       ↓
   [Query] ────→ Search Results
```

---

## 🛠️ Troubleshooting

### Empty Extraction
**Issue:** `component_docs.json` is empty

**Solutions:**
1. Check `config/extraction.config.js` - verify `repository.root` path
2. Check `includeOnly` patterns match your component structure
3. Lower `componentDetectionThreshold` (try 2 instead of 3)
4. Verify files match include patterns (`.tsx`, `.jsx`)

### No Query Results
**Issue:** Queries return no components

**Solutions:**
1. Verify index exists: `ls -la build-index/chromadb/`
2. Check chunks created: `cat build-index/component_chunks.json | grep -c '"text"'`
3. Rebuild index: `python3 core/build_index.py --clean`
4. Check ChromaDB connection in `core/index_components.py`

### Import Errors
**Issue:** Missing Python modules

**Solutions:**
1. Reinstall dependencies: `pip3 install -r requirements.txt`
2. Use virtual environment:
   ```bash
   python3 -m venv venv
   source venv/bin/activate
   pip3 install -r requirements.txt
   ```
3. Check Python version: `python3 --version` (need 3.8+)

### API Server Issues
**Issue:** Server won't start or connection refused

**Solutions:**
1. Install server dependencies: `pip3 install -r server/requirements.txt`
2. Check port 8000 is free: `lsof -i :8000`
3. Try different port: `uvicorn server.api_server:app --port 8001`
4. Check logs for errors

---

## 📚 Quick Command Reference

### Essential Commands

| Task | Command |
|------|---------|
| **Build index** | `python3 core/build_index.py` |
| **Clean rebuild** | `python3 core/build_index.py --clean` |
| **List components** | `python3 core/query_cli.py list-components` |
| **Get component** | `python3 core/query_cli.py get-component-exact <name>` |
| **Search** | `python3 core/query_cli.py query-find-component "<query>"` |
| **Interactive** | `python3 core/component_browser.py` |
| **Start API** | `python3 server/api_server.py` |

### Step-by-Step Commands

| Step | Command | Output |
|------|---------|--------|
| **1. Extract** | `node scripts/code_extractor.js` | `component_docs.json` |
| **2. Chunk** | `python3 core/ingest_components.py` | `component_chunks.json` |
| **3. Index** | `python3 core/index_components.py` | `chromadb/` |

### ChromaDB Inspection

| Task | Command |
|------|---------|
| **List all data** | `python3 read-chromadb/read_chromadb.py list` |
| **Search data** | `python3 read-chromadb/read_chromadb.py search "query"` |
| **Export to JSON** | `python3 read-chromadb/read_chromadb.py export` |

---

## 📖 Additional Documentation

- **API Documentation:** [server/README.md](server/README.md)
- **Config Guide:** [config/README.md](config/README.md)
- **Architecture:** [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
- **Reading ChromaDB:** [docs/READING_CHROMADB.md](docs/READING_CHROMADB.md)

---

## 📝 License

This project is for educational and development purposes.
