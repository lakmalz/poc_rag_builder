#!/usr/bin/env python3
"""
Build RAG Index - Simple Pipeline
==================================
Extract → Chunk → Index components into ChromaDB

Usage:
    python3 build_index.py              # Run full pipeline
    python3 build_index.py --clean      # Clean old data first
"""

import argparse
import subprocess
import sys
from pathlib import Path


def run_extraction():
    """Step 1: Extract components from React code"""
    print("\n📤 STEP 1: Extracting components...")
    print("=" * 60)
    
    result = subprocess.run(["node", "scripts/code_extractor.js"])
    
    if result.returncode != 0:
        print("❌ Extraction failed")
        return False
    
    print("✅ Extraction complete\n")
    return True


def run_chunking():
    """Step 2: Chunk components into searchable pieces"""
    print("📦 STEP 2: Chunking components...")
    print("=" * 60)
    
    result = subprocess.run(["python3", "ingest_components.py"])
    
    if result.returncode != 0:
        print("❌ Chunking failed")
        return False
    
    print("✅ Chunking complete\n")
    return True


def run_indexing():
    """Step 3: Index chunks into ChromaDB"""
    print("🔍 STEP 3: Indexing into ChromaDB...")
    print("=" * 60)
    
    result = subprocess.run(["python3", "index_components.py"])
    
    if result.returncode != 0:
        print("❌ Indexing failed")
        return False
    
    print("✅ Indexing complete\n")
    return True


def clean_outputs():
    """Remove old outputs"""
    import shutil
    
    print("\n🧹 Cleaning old outputs...")
    print("=" * 60)
    
    build_dir = Path("build-index")
    
    files_to_remove = [
        build_dir / "component_docs.json",
        build_dir / "component_chunks.json",
        build_dir / "chromadb"
    ]
    
    for item in files_to_remove:
        if item.exists():
            if item.is_dir():
                shutil.rmtree(item)
                print(f"🗑️  Removed: {item.name}/")
            else:
                item.unlink()
                print(f"🗑️  Removed: {item.name}")
    
    print("✅ Cleanup complete\n")


def main():
    parser = argparse.ArgumentParser(
        description='Build RAG index - Extract, Chunk, and Index components'
    )
    parser.add_argument(
        '--clean',
        action='store_true',
        help='Remove old outputs before building'
    )
    
    args = parser.parse_args()
    
    # Clean if requested
    if args.clean:
        clean_outputs()
    
    # Run pipeline
    print("\n" + "=" * 60)
    print("🚀 BUILDING RAG INDEX")
    print("=" * 60)
    
    if not run_extraction():
        sys.exit(1)
    
    if not run_chunking():
        sys.exit(1)
    
    if not run_indexing():
        sys.exit(1)
    
    # Success
    print("=" * 60)
    print("✅ BUILD COMPLETE!")
    print("=" * 60)
    print("\n💡 Next steps:")
    print("   python3 query_cli.py list-components")
    print("   python3 query_cli.py get-component-exact ProfilePage")
    print("\n")
    
    sys.exit(0)


if __name__ == "__main__":
    main()
