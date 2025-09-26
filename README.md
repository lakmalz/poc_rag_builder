# GIT custom-ui repo
# https://github.com/Ricy137/Custom-ui/tree/main

# Packages (REACT)
# npm init -y
# npm install react-docgen glob

# Packages (PYTHON)
# pip install sentence-transformers numpy typer tqdm
# faiss-cpu via pip (may fail on mac): 
# pip install faiss-cpu

# For embedding
# pip install -U sentence-transformers 
# 

# Ex:
# code run
    node scripts/code_extractor.js - Extract raw React component info from .tsx/.jsx files.
    output - (Make sure the file created-"component_docs.json") - Raw structured component metadata from Node extractor.

    python3 ingest_components.py - Chunk components (description, props, code) for embeddings.
    output - component_chunks.json - Chunked text ready for embeddings.

    index_components.py - Create vector embeddings, store metadata in Chromadb.
    output - chromaDB and 

    CLI tool to query index and retrieve component info.
    
    command: python3 query_cli.py query "How do I create a button component?" --k 5 --per-component 10
    --k 5: This means "return the top 5 most relevant results" for your query
    --per-component 10: This means "for each component, return up to 10 code snippets or chunks."





[React repo] 
     ↓ (Node extractor)
component_docs.json 
     ↓ (Python ingestion & chunking)
component_chunks.json 
     ↓ (Embedding + FAISS index)
components.faiss + chunks_meta.json
     ↓ (Query CLI)
Retrieve relevant components and snippets