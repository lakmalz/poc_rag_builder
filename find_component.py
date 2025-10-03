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
def prompt_query():
    # If all files/dirs exist, list components and let user choose
    chromadb_dir = os.path.join("build-index", "chromadb")
    if os.path.exists(component_doc_path) and os.path.exists(component_chunk_path) and os.path.exists(chromadb_dir):
        print("\nAll data available. Listing components:")
        import json
        with open(component_chunk_path, "r", encoding="utf-8") as f:
            chunks = json.load(f)
        # Get unique component names
        component_names = sorted(set(chunk.get("component_name") for chunk in chunks if chunk.get("component_name")))
        for idx, name in enumerate(component_names):
            print(f"[{idx+1}] {name}")
        choice = input("\nSelect a component by number: ").strip()
        try:
            idx = int(choice) - 1
            if idx < 0 or idx >= len(component_names):
                print("Invalid selection.")
                return
            selected_name = component_names[idx]
            print(f"\n🔎 Retrieving code for: {selected_name}\n")
            subprocess.run(["python3", "query_cli.py", "query-find-component", selected_name, "--k", "5", "--per-component", "10"])
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
