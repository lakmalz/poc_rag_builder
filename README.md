# RAG Builder for React Components

A powerful RAG (Retrieval-Augmented Generation) system for indexing and querying React components from codebases. This tool extracts React components, chunks them intelligently, and stores them in a vector database for semantic search.

## 📋 Table of Contents

- [Overview](#overview)
- [Pipeline Architecture](#pipeline-architecture)
- [Installation & Setup](#installation--setup)
- [Usage](#usage)
- [Configuration](#configuration)
- [Quick Reference](#quick-reference)

---

## 🎯 Overview

This RAG builder processes React codebases to create a searchable index of components, enabling:
- **Smart component extraction** with multi-file aggregation (component + interface + styles + index)
- **Intelligent chunking** into complete components and individual parts
- **Vector-based semantic search** using ChromaDB and sentence-transformers
- **CLI tools** for querying and retrieving components

### Source Repository
Original React codebase: [web-extensions](https://github.com/Ricy137/web-extensions/tree/main)

### Target Repository Location

**Important:** This RAG builder expects the target React codebase to be located in a specific directory:

```
poc_rag_builder/
└── web-extensions/          ← Your React repository goes here
    ├── src/
    │   └── components/
    ├── package.json
    └── ...
```

**Setup Instructions:**

1. **Clone the target repository** into the project root:
   ```bash
   cd poc_rag_builder
   git clone https://github.com/Ricy137/web-extensions.git
   ```

2. **Or use a different repository name:**
   - Clone your React project into this folder
   - Update `config/extraction.config.js`:
     ```javascript
     repository: {
       root: "your-repo-name"  // Change this to match your folder name
     }
     ```

**Why this structure?**
- The extractor looks for the repository in a subfolder (default: `web-extensions`)
- This keeps the RAG builder tools separate from the target codebase
- You can easily switch between different React projects by changing the `root` setting

**Example with different repositories:**
```
poc_rag_builder/
├── web-extensions/          ← Original example repo
├── my-react-app/           ← Your custom React app
└── another-project/        ← Another React project
```

Just update the config to point to whichever one you want to index!

---

## 🔄 Pipeline Architecture

```
[React Repository]
       ↓
  [Extraction] - Node.js extractor analyzes React components
       ↓
component_docs.json - Structured component metadata
       ↓
  [Chunking] - Python processor creates searchable chunks
       ↓
component_chunks.json - Chunked text with embeddings metadata
       ↓
  [Indexing] - Create vector embeddings & store in ChromaDB
       ↓
   chromadb/ - Vector database with semantic search
       ↓
  [Query CLI] - Retrieve components via natural language
       ↓
  Component Results
```

---

## ⚙️ Installation & Setup

---

## ⚙️ Installation & Setup

### Prerequisites
- Node.js (v14 or higher)
- Python 3.8+
- npm and pip package managers

### 0.1 Install Node.js Dependencies

Install required packages for React code extraction:

```bash
npm install
```

**Installs:**
- `glob` - File pattern matching
- `react-docgen-typescript` - React component parser
- Other dependencies from package.json

### 0.2 Install Python Dependencies

Install required packages for chunking, indexing, and querying:

```bash
pip3 install -r requirements.txt
```

**Installs:**
- `chromadb` - Vector database
- `sentence-transformers` - Embeddings model
- `typer` - CLI framework
- `requests` - HTTP client for LLM APIs
- Other dependencies

### 0.3 Verify Installation

Check if all dependencies are installed correctly:

```bash
node --version
python3 --version
pip3 list | grep chromadb
pip3 list | grep sentence-transformers
```

---

## 🚀 Usage

### Full Pipeline Commands

---

## 🚀 Usage

### Full Pipeline Commands

#### Option A: Quick Build (⭐ Recommended)

Simple pipeline without versioning - perfect for iterative development:

```bash
python3 core/build_index.py
```

**Optional cleanup before build:**
```bash
python3 core/build_index.py --clean
```

**Features:**
- ✅ Simple and fast
- ✅ No validation overhead
- ✅ No versioning complexity
- ✅ Perfect for iterative development

**This command will:**
1. Extract React components from source code
2. Chunk the extracted components
3. Index chunks into ChromaDB

---

#### Option B: Full Build with Validation (Advanced)

Complete pipeline with validation and versioning:

```bash
python3 core/rebuild_index.py
```

**Features:**
- ✅ Automatic validation at each step
- ✅ Version control for build outputs
- ✅ Rollback capability if validation fails
- ✅ Archive previous builds automatically

**This command will:**
1. Extract React components from source code
2. Validate extraction results
3. Chunk the extracted components
4. Validate chunking output
5. Index chunks into ChromaDB
6. Validate indexing success
7. Archive successful builds with versioning

---

#### Option C: Legacy Interactive Pipeline

Run complete pipeline with interactive query interface:

```bash
python3 core/find_component.py
```

**This command will:**
1. Extract React components from source code
2. Chunk the extracted components
3. Index chunks into ChromaDB
4. Launch interactive query interface

---

### Individual Pipeline Steps

#### Step 1: Extract (React Code Extraction)

Extract React components from repository:

```bash
node scripts/code_extractor.js
```

**Output:** `build-index/component_docs.json`

#### Step 2: Ingest & Chunk

Chunk extracted components into searchable pieces:

```bash
python3 core/ingest_components.py
```

**Output:** `build-index/component_chunks.json`

#### Step 3: Index (Store in ChromaDB)

Index chunks into vector database:

```bash
python3 core/index_components.py
```

**Output:** `build-index/chromadb/`

---

### Query Commands

#### List Components

**List format (numbered, with file paths):**
```bash
python3 core/query_cli.py list-components
# OR
python3 core/query_cli.py list-components --output-format list
```

**Example output:**
```
Found 2 component(s):
[1] ProfilePage                    (components/ProfilePage/ProfilePage.component.tsx)
[2] CustomDropdown                 (components/CustomDropdown/CustomDropdown.component.tsx)
```

**JSON format (structured data):**
```bash
python3 core/query_cli.py list-components --output-format json
```

**Example output:**
```json
[
  {
    "name": "ProfilePage",
    "file": "src/components/ProfilePage/ProfilePage.component.tsx",
    "component_id": "ProfilePage"
  }
]
```

**Names only (simple list):**
```bash
python3 core/query_cli.py list-components --output-format names
```

**Example output:**
```
ProfilePage
CustomDropdown
```

---

#### Get Component by Name

Retrieve complete component with all files (component, interfaces, styles):

```bash
python3 core/query_cli.py get-component-exact ProfilePage
```

**Example output:**
```
📦 Component: ProfilePage
📁 File: src/components/ProfilePage/ProfilePage.component.tsx

✅ Complete Component (All Files):
================================================================================
COMPONENT (ProfilePage.component.tsx):
```tsx
import React, { useState } from "react";
...full component code...
export default ProfilePage;
```

INTERFACES & TYPES (ProfilePage.interface.ts):
```typescript
export interface ProfilePageProps {
  user: UserProfile;
  onAccept?: (form: UserProfile) => void;
  ...
}
```

STYLES (ProfilePage.style.ts):
```typescript
const useProfilePageStyles = makeStyles({...});
```
================================================================================
```

---

#### Semantic Search

Search for components using natural language:

```bash
python3 core/query_cli.py query-find-component "user profile form with edit mode" --k 5
```

**Parameters:**
- `--k 5` - Return the top 5 most relevant results
- `--per-component 10` - For each component, return up to 10 code snippets

---

### Interactive Mode

Interactive component browser with selection menu:

```bash
python3 core/find_component.py
```

**Features:**
- Lists all components
- Select by number
- View complete component code
- Semantic search option ('s' key)

---

## ⚙️ Configuration

---

## ⚙️ Configuration

### Extraction Configuration

Edit what gets extracted from the codebase:

**File:** `config/extraction.config.js`

**Key Settings:**
```javascript
{
  repository: {
    root: "web-extensions"
  },
  files: {
    include: ["js", "jsx", "ts", "tsx"],
    exclude: ["**/node_modules/**", "**/tests/**"],
    includeOnly: ["src/components/**"]  // Optional filter
  },
  aggregation: {
    enabled: true,
    confidenceThreshold: 3
  }
}
```

### Chunking Configuration

Edit how components are chunked and indexed:

**File:** `config/chunking.config.py`

**Key Settings:**
```python
CHUNKING_CONFIG = {
    "chunk_types": [...],
    "max_chunk_size": 2000,
    "include_metadata": True
}

INDEXING_CONFIG = {
    "batch_size": 100,
    "embedding_model": "all-MiniLM-L6-v2"
}
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
| **Full build with validation**| `python3 core/rebuild_index.py`                                 |
| **Interactive pipeline**      | `python3 core/find_component.py`                                |
| **Extract only**              | `node scripts/code_extractor.js`                                |
| **Chunk only**                | `python3 core/ingest_components.py`                             |
| **Index only**                | `python3 core/index_components.py`                              |
| **List components (list)**    | `python3 core/query_cli.py list-components`                     |
| **List components (JSON)**    | `python3 core/query_cli.py list-components --output-format json`|
| **List components (names)**   | `python3 core/query_cli.py list-components --output-format names`|
| **Get component by name**     | `python3 core/query_cli.py get-component-exact ProfilePage`     |
| **Search components**         | `python3 core/query_cli.py query-find-component "search term"`  |
| **Interactive mode**          | `python3 core/find_component.py`                                |
| **Rebuild index**             | `rm -rf build-index/ && python3 core/build_index.py`            |

---

## 📂 Project Structure

```
poc_rag_builder/                  # Main RAG builder project
├── web-extensions/               # ← Target React repository (clone here!)
│   ├── src/
│   │   └── components/          # React components to be indexed
│   ├── package.json
│   └── tsconfig.json
├── core/                         # Core Python modules
│   ├── build_index.py           # Quick build pipeline
│   ├── rebuild_index.py         # Full build with validation
│   ├── ingest_components.py     # Chunking processor
│   ├── index_components.py      # ChromaDB indexer
│   ├── query_cli.py             # Query CLI tool
│   ├── find_component.py        # Interactive component browser
│   ├── pipeline_cli.py          # Pipeline utilities
│   └── embedding_utils.py       # Embedding utilities
├── server/                       # FastAPI REST API server
│   ├── api_server.py            # FastAPI application
│   ├── requirements.txt         # Server dependencies
│   └── README.md                # Server documentation
├── config/
│   ├── extraction.config.js      # Extraction settings (set repository.root here)
│   └── chunking.config.py        # Chunking & indexing settings
├── scripts/
│   └── code_extractor.js         # Node.js component extractor
├── build-index/                  # Generated output directory
│   ├── component_docs.json       # Extracted components
│   ├── component_chunks.json     # Chunked components
│   └── chromadb/                 # Vector database
├── requirements.txt              # Python dependencies (core)
├── package.json                  # Node.js dependencies
├── FASTAPI-DOCUMENTATION.md      # Complete API documentation
└── README.md                     # This file
```

**Key Notes:**
- `web-extensions/` is your **target React repository** - clone it into this folder
- `core/` contains all the RAG system Python modules
- `server/` contains the FastAPI REST API server for web integration
- `config/extraction.config.js` sets `repository.root: "web-extensions"` to point to this folder
- Change the root path if your repository has a different name
- The RAG builder will scan the repository for components based on your config

---

## 🌐 REST API Server

For web-based access to the RAG system, a FastAPI server is available in the `server/` directory.

### Quick Start

```bash
# Install server dependencies
pip3 install -r server/requirements.txt

# Start the server
python3 server/api_server.py
```

**Access Points:**
- API Base: http://localhost:8000
- Swagger Docs: http://localhost:8000/docs
- ReDoc: http://localhost:8000/redoc

### Available Endpoints

- `GET /api/health` - Health check with database stats
- `POST /api/index/build` - Build component index
- `POST /api/index/rebuild` - Rebuild with validation
- `GET /api/components` - List all components
- `GET /api/components/{name}` - Get specific component
- `POST /api/components/search` - Semantic search

For complete API documentation with examples, see [FASTAPI-DOCUMENTATION.md](FASTAPI-DOCUMENTATION.md) or [server/README.md](server/README.md).

---

## 🛠️ Troubleshooting

### Empty Extraction
If `component_docs.json` is empty:
1. Check `config/extraction.config.js` for correct `includeOnly` patterns
2. Verify the repository path is correct
3. Ensure component files match the include patterns

### Query Returns No Results
If queries return no components:
1. Verify the index was built: `ls -la build-index/chromadb/`
2. Check that chunks were created: `cat build-index/component_chunks.json`
3. Rebuild the index: `python3 build_index.py --clean`

### Missing Dependencies
If you encounter import errors:
1. Reinstall dependencies: `pip3 install -r requirements.txt`
2. Verify installation: `pip3 list | grep chromadb`
3. Check Python version: `python3 --version` (requires 3.8+)

---

## 📝 License

This project is for educational and development purposes.
