# Reading ChromaDB Data

This guide shows you how to read and inspect data stored in ChromaDB.

## 📂 ChromaDB File Structure

```
build-index/chromadb/
├── chroma.sqlite3                    # Main SQLite database (metadata, IDs)
└── [collection-uuid]/                # Collection-specific files
    ├── data_level0.bin               # Vector embeddings (binary)
    ├── header.bin                    # Header information
    ├── length.bin                    # Length metadata
    └── link_lists.bin                # HNSW index links
```

## Method 1: Using Python Script (Recommended)

I've created a utility script `scripts/read_chromadb.py` with these commands:

### List all documents
```bash
python3 scripts/read_chromadb.py list
```

**Output:**
- Total document count
- Sample document with metadata
- List of all document IDs with metadata

### Search documents
```bash
python3 scripts/read_chromadb.py search "your query here"
```

**Example:**
```bash
python3 scripts/read_chromadb.py search "user profile form"
```

### Export to JSON
```bash
python3 scripts/read_chromadb.py export
```

This creates `chromadb_export.json` with all documents and metadata.

---

## Method 2: Direct Python Code

### Read all documents
```python
import chromadb
from chromadb.config import Settings
from pathlib import Path

# Initialize client
CHROMA_DB_PATH = Path("build-index/chromadb")
client = chromadb.PersistentClient(
    path=str(CHROMA_DB_PATH),
    settings=Settings(anonymized_telemetry=False)
)

# Get collection
collection = client.get_collection(name="component_chunks")

# Get all data
results = collection.get(
    include=['documents', 'metadatas', 'embeddings']
)

# Access data
for doc_id, doc, metadata in zip(results['ids'], results['documents'], results['metadatas']):
    print(f"ID: {doc_id}")
    print(f"Component: {metadata['component_name']}")
    print(f"Type: {metadata['chunk_type']}")
    print(f"Text: {doc[:100]}...")
    print("-" * 60)
```

### Search with query
```python
from core.embedding_utils import get_embedding_function

# Get collection with embedding function
embedding_function = get_embedding_function("all-MiniLM-L6-v2")
collection = client.get_collection(
    name="component_chunks",
    embedding_function=embedding_function
)

# Search
results = collection.query(
    query_texts=["user profile form"],
    n_results=5,
    include=['documents', 'metadatas', 'distances']
)

# Access results
for doc, metadata, distance in zip(
    results['documents'][0],
    results['metadatas'][0],
    results['distances'][0]
):
    score = 1 - distance  # Convert to similarity score
    print(f"Score: {score:.4f}")
    print(f"Component: {metadata['component_name']}")
    print(f"Text: {doc[:100]}...")
```

### Filter by metadata
```python
# Get documents with specific metadata
results = collection.get(
    where={"component_name": "ProfilePage"},
    include=['documents', 'metadatas']
)

# Get specific chunk types
results = collection.get(
    where={"chunk_type": "component_source"},
    include=['documents', 'metadatas']
)
```

---

## Method 3: SQLite Database

ChromaDB uses SQLite for metadata storage.

### View tables
```bash
sqlite3 build-index/chromadb/chroma.sqlite3 ".tables"
```

### View collections
```bash
sqlite3 build-index/chromadb/chroma.sqlite3 \
  "SELECT id, name FROM collections;"
```

### Count embeddings
```bash
sqlite3 build-index/chromadb/chroma.sqlite3 \
  "SELECT COUNT(*) FROM embeddings;"
```

### View metadata
```bash
sqlite3 build-index/chromadb/chroma.sqlite3 \
  "SELECT id, key, string_value FROM embedding_metadata LIMIT 10;"
```

### Export to CSV
```bash
sqlite3 -header -csv build-index/chromadb/chroma.sqlite3 \
  "SELECT * FROM embeddings;" > embeddings.csv
```

---

## Method 4: Using Existing CLI Tools

You can also use the existing query tools:

### List all components
```bash
python3 core/query_cli.py list-components
```

### Get specific component
```bash
python3 core/query_cli.py get-component-exact ProfilePage
```

### Semantic search
```bash
python3 core/query_cli.py query-find-component "user profile" --k 5
```

---

## Understanding ChromaDB Data Structure

### Metadata Fields
Each document in ChromaDB has metadata:

```json
{
  "component_id": "ProfilePage",
  "component_name": "ProfilePage",
  "chunk_id": "ProfilePage_complete",
  "chunk_type": "complete_component",
  "file": "src/components/ProfilePage/ProfilePage.component.tsx",
  "directory": "src/components/ProfilePage"
}
```

### Chunk Types
- `complete_component` - All files aggregated together
- `basic_info` - Component name, description, location
- `component_source` - Main component code
- `interfaces` - TypeScript interfaces and types
- `styles` - Style definitions
- `props` - Props documentation
- `code` - Code snippets

### Vector Embeddings
- Stored in binary files (`data_level0.bin`)
- Dimension: 384 (for all-MiniLM-L6-v2 model)
- Used for semantic search

---

## Common Queries

### Get all chunk types
```python
results = collection.get(include=['metadatas'])
chunk_types = set(m['chunk_type'] for m in results['metadatas'])
print(chunk_types)
```

### Count chunks per component
```python
from collections import Counter
results = collection.get(include=['metadatas'])
counts = Counter(m['component_name'] for m in results['metadatas'])
for component, count in counts.items():
    print(f"{component}: {count} chunks")
```

### Find specific file
```python
results = collection.get(
    where={"file": {"$contains": "ProfilePage.component.tsx"}},
    include=['documents', 'metadatas']
)
```

---

## Troubleshooting

### Collection not found
```python
# List all collections
collections = client.list_collections()
print([c.name for c in collections])
```

### Check database exists
```bash
ls -la build-index/chromadb/
```

### Rebuild index if corrupted
```bash
python3 core/build_index.py --clean
```

---

## Additional Resources

- **ChromaDB Docs**: https://docs.trychroma.com/
- **Query API**: See `core/query_cli.py` for examples
- **Index API**: See `core/index_components.py` for indexing examples
