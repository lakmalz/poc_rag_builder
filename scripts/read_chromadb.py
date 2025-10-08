#!/usr/bin/env python3
"""
Script to read and inspect ChromaDB data
"""
import chromadb
from chromadb.config import Settings
from pathlib import Path
import json

# Path to ChromaDB
PROJECT_ROOT = Path(__file__).parent.parent
CHROMA_DB_PATH = PROJECT_ROOT / "build-index" / "chromadb"

def read_chromadb_collection(collection_name="component_chunks"):
    """Read all data from a ChromaDB collection"""
    
    # Initialize client
    client = chromadb.PersistentClient(
        path=str(CHROMA_DB_PATH),
        settings=Settings(anonymized_telemetry=False)
    )
    
    # Get collection
    try:
        collection = client.get_collection(name=collection_name)
    except Exception as e:
        print(f"Error: Collection '{collection_name}' not found: {e}")
        return
    
    # Get all data
    print(f"📊 Reading collection: {collection_name}")
    print(f"📁 Location: {CHROMA_DB_PATH}")
    print("=" * 60)
    
    # Get collection info
    count = collection.count()
    print(f"\n✅ Total documents: {count}\n")
    
    # Get all documents
    results = collection.get(
        include=['documents', 'metadatas', 'embeddings']
    )
    
    print(f"🔍 Sample data structure:")
    print("=" * 60)
    
    # Show first document
    if results['ids']:
        print(f"\n📄 Document ID: {results['ids'][0]}")
        print(f"\n📝 Metadata:")
        print(json.dumps(results['metadatas'][0], indent=2))
        print(f"\n📖 Document text (first 200 chars):")
        print(results['documents'][0][:200] + "...")
        try:
            if results.get('embeddings') and len(results['embeddings']) > 0:
                print(f"\n🔢 Embedding dimension: {len(results['embeddings'][0])}")
            else:
                print(f"\n🔢 Embedding dimension: N/A")
        except:
            print(f"\n🔢 Embedding dimension: N/A")
    
    # Show all document IDs and metadata
    print(f"\n\n📋 All documents in collection:")
    print("=" * 60)
    for i, (doc_id, metadata) in enumerate(zip(results['ids'], results['metadatas'])):
        print(f"\n{i+1}. ID: {doc_id}")
        print(f"   Component: {metadata.get('component_name', 'N/A')}")
        print(f"   Type: {metadata.get('chunk_type', 'N/A')}")
        print(f"   File: {metadata.get('file', 'N/A')}")
    
    return results


def search_chromadb(query_text, collection_name="component_chunks", n_results=5):
    """Search ChromaDB with a query"""
    from embedding_utils import get_embedding_function
    
    # Initialize client
    client = chromadb.PersistentClient(
        path=str(CHROMA_DB_PATH),
        settings=Settings(anonymized_telemetry=False)
    )
    
    # Get collection with embedding function
    embedding_function = get_embedding_function("all-MiniLM-L6-v2")
    collection = client.get_collection(
        name=collection_name,
        embedding_function=embedding_function
    )
    
    # Query
    print(f"\n🔍 Searching for: '{query_text}'")
    print("=" * 60)
    
    results = collection.query(
        query_texts=[query_text],
        n_results=n_results,
        include=['documents', 'metadatas', 'distances']
    )
    
    # Display results
    for i, (doc, metadata, distance) in enumerate(zip(
        results['documents'][0],
        results['metadatas'][0],
        results['distances'][0]
    )):
        score = 1 - distance  # Convert distance to similarity score
        print(f"\n{i+1}. Score: {score:.4f}")
        print(f"   Component: {metadata.get('component_name', 'N/A')}")
        print(f"   Type: {metadata.get('chunk_type', 'N/A')}")
        print(f"   File: {metadata.get('file', 'N/A')}")
        print(f"   Text: {doc[:150]}...")
    
    return results


def export_to_json(output_file="chromadb_export.json"):
    """Export all ChromaDB data to JSON"""
    
    client = chromadb.PersistentClient(
        path=str(CHROMA_DB_PATH),
        settings=Settings(anonymized_telemetry=False)
    )
    
    collection = client.get_collection(name="component_chunks")
    results = collection.get(include=['documents', 'metadatas'])
    
    # Convert to list of documents
    documents = []
    for doc_id, doc_text, metadata in zip(
        results['ids'],
        results['documents'],
        results['metadatas']
    ):
        documents.append({
            'id': doc_id,
            'text': doc_text,
            'metadata': metadata
        })
    
    # Write to file
    output_path = PROJECT_ROOT / output_file
    with open(output_path, 'w') as f:
        json.dump(documents, f, indent=2)
    
    print(f"\n✅ Exported {len(documents)} documents to {output_path}")


if __name__ == "__main__":
    import sys
    
    if len(sys.argv) > 1:
        command = sys.argv[1]
        
        if command == "search" and len(sys.argv) > 2:
            query = " ".join(sys.argv[2:])
            search_chromadb(query)
        elif command == "export":
            export_to_json()
        elif command == "list":
            read_chromadb_collection()
        else:
            print("Usage:")
            print("  python scripts/read_chromadb.py list              # List all documents")
            print("  python scripts/read_chromadb.py search <query>    # Search documents")
            print("  python scripts/read_chromadb.py export            # Export to JSON")
    else:
        # Default: list all documents
        read_chromadb_collection()
