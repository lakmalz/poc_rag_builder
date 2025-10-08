# ChromaDB Inspection Tool

A utility tool for reading, searching, and exporting data from ChromaDB.

## Location
```
read-chromadb/
└── read_chromadb.py    # Main inspection script
```

## Usage

### List all documents
```bash
python3 read-chromadb/read_chromadb.py list
```

Shows:
- Total document count
- Sample document structure
- All document IDs with metadata

### Search documents
```bash
python3 read-chromadb/read_chromadb.py search "your query here"
```

Example:
```bash
python3 read-chromadb/read_chromadb.py search "user profile form"
```

Returns top 5 most similar documents with:
- Similarity scores
- Component names
- Chunk types
- File paths
- Text previews

### Export to JSON
```bash
python3 read-chromadb/read_chromadb.py export
```

Creates `chromadb_export.json` in the project root with:
- All documents
- Full text content
- Complete metadata

## Quick Access

Add to your `~/.zshrc` or `~/.bashrc`:

```bash
alias chromadb-list="python3 read-chromadb/read_chromadb.py list"
alias chromadb-search="python3 read-chromadb/read_chromadb.py search"
alias chromadb-export="python3 read-chromadb/read_chromadb.py export"
```

Then use:
```bash
chromadb-list
chromadb-search "button component"
chromadb-export
```

## Features

- ✅ Read all ChromaDB documents
- ✅ Semantic search with similarity scores
- ✅ Export to JSON format
- ✅ Display metadata (component name, file, chunk type)
- ✅ Show text previews
- ✅ Handle embeddings from core/embedding_utils.py

## Documentation

For detailed usage and examples, see:
- [docs/READING_CHROMADB.md](../docs/READING_CHROMADB.md)

## Requirements

- Python 3.8+
- chromadb
- sentence-transformers (for search)

All dependencies are already in `requirements.txt`.
