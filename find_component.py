import os
import subprocess

# Paths
component_doc_path = os.path.join("build-index", "component_docs.json")
component_chunk_path = os.path.join("build-index", "component_chunks.json")

# Step 1: Extract repository if not already extracted
def extract_repo():
    if os.path.exists(component_doc_path):
        print(f"✅ Extraction skipped: {component_doc_path} already exists.")
        return True
    print("Step 1: Extracting repo code...")
    result = subprocess.run(["node", "scripts/code_extractor.js"])
    if result.returncode == 0:
        print("✅ Extraction complete.")
        return True
    print("❌ Extraction failed.")
    return False

# Step 2: Ingest and chunk if not already done
def ingest_and_chunk():
    if os.path.exists(component_chunk_path):
        print(f"✅ Ingestion skipped: {component_chunk_path} already exists.")
        return True
    print("Step 2: Ingesting and chunking...")
    result = subprocess.run(["python3", "ingest_components.py"])
    if result.returncode == 0:
        print("✅ Ingestion complete.")
        return True
    print("❌ Ingestion failed.")
    return False

# Step 3: Indexing prompt
def prompt_indexing():
    chromadb_dir = os.path.join("build-index", "chromadb")
    if os.path.exists(chromadb_dir):
        print(f"✅ Indexing skipped: ChromaDB already exists at {chromadb_dir}.")
        return True
    print("\nReady to index data store.")
    choice = input("Do you want to index the data store? (y/n): ").strip().lower()
    if choice == 'y':
        print("Step 3: Indexing data store...")
        result = subprocess.run(["python3", "index_components.py"])
        if result.returncode == 0:
            print("✅ Indexing complete.")
            return True
        else:
            print("❌ Indexing failed.")
            return False
    else:
        print("Skipping indexing.")
        return False

# Step 4: Query prompt
def is_real_component(name, chunk_data):
    """
    Filter to identify real React components vs utilities/hooks/helpers.
    Returns True if it's a displayable component, False otherwise.
    """
    if not name:
        return False
    
    # Skip generic/unnamed exports
    if name in ['default', '__function', 'unknown', 'Unknown']:
        return False
    
    # Skip utility files (common patterns)
    utility_patterns = ['Utils', 'Helper', 'util', 'helper', 'Util']
    if any(pattern in name for pattern in utility_patterns):
        return False
    
    # Skip custom hooks (start with 'use' or 'Use')
    if name.startswith('use') or name.startswith('Use'):
        return False
    
    # Skip render utilities
    if name.startswith('render') or name.startswith('Render'):
        return False
    
    # Skip if file is in utils/helpers directory
    file_path = chunk_data.get('file', '').lower()
    if '/utils/' in file_path or '/helpers/' in file_path:
        return False
    
    # Must start with uppercase (component convention)
    if not name[0].isupper():
        return False
    
    return True

def prompt_query():
    # If all files/dirs exist, list components and let user choose
    chromadb_dir = os.path.join("build-index", "chromadb")
    if os.path.exists(component_doc_path) and os.path.exists(component_chunk_path) and os.path.exists(chromadb_dir):
        print("\nAll data available. Listing components:")
        import json
        with open(component_chunk_path, "r", encoding="utf-8") as f:
            chunks = json.load(f)
        
        # Get unique component names and their metadata
        component_map = {}
        for chunk in chunks:
            name = chunk.get("component_name")
            if name and chunk.get("chunk_type") == "basic_info":
                component_map[name] = chunk
        
        # Filter to only real components
        real_components = [
            name for name in component_map.keys() 
            if is_real_component(name, component_map[name])
        ]
        
        # Sort alphabetically
        real_components.sort()
        
        if not real_components:
            print("No components found.")
            return
        
        print(f"\nFound {len(real_components)} component(s):\n")
        for idx, name in enumerate(real_components):
            # Get file path for display
            file_path = component_map[name].get('file', '')
            file_display = '/'.join(file_path.split('/')[-3:]) if file_path else ''
            print(f"[{idx+1}] {name:30s} ({file_display})")
        
        choice = input("\nSelect a component by number (or 's' for semantic search): ").strip()
        
        # Check if user wants semantic search
        if choice.lower() == 's':
            question = input("\nEnter your search query: ").strip()
            print("\n🔎 Searching semantically, please wait...")
            subprocess.run(["python3", "query_cli.py", "query-find-component", question, "--k", "5", "--per-component", "10"])
            return
        
        try:
            idx = int(choice) - 1
            if idx < 0 or idx >= len(real_components):
                print("Invalid selection.")
                return
            selected_name = real_components[idx]
            print(f"\n🔎 Retrieving exact match for: {selected_name}\n")
            subprocess.run(["python3", "query_cli.py", "get-component-exact", selected_name])
        except ValueError:
            print("Invalid input. Please enter a number or 's' for search.")
        except Exception as e:
            print(f"Error: {e}")
        return
    # Otherwise, prompt for freeform question
    question = input("\nPlease enter your question: ")
    print("\n🔎 Processing your query, please wait...")
    subprocess.run(["python3", "query_cli.py", "query-find-component", question, "--k", "5", "--per-component", "10"])

# Main pipeline
def main():
    # Check for all outputs first
    chromadb_dir = os.path.join("build-index", "chromadb")
    all_available = all([
        os.path.exists(component_doc_path),
        os.path.exists(component_chunk_path),
        os.path.exists(chromadb_dir)
    ])
    if all_available:
        print("\nAll outputs detected. Skipping extraction, chunking, and indexing.")
        prompt_query()
        return
    if not extract_repo():
        return
    if not ingest_and_chunk():
        return
    prompt_indexing()
    prompt_query()

if __name__ == "__main__":
    main()
