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
    result = subprocess.run(["python3", "core/ingest_components.py"])
    if result.returncode == 0:
        print("✅ Ingestion complete.")
        return True
    print("❌ Ingestion failed.")
    return False

# Step 3: Indexing prompt
def prompt_indexing():
    print("\nReady to index data store.")
    choice = input("Do you want to index the data store? (y/n): ").strip().lower()
    if choice == 'y':
        print("Step 3: Indexing data store...")
        result = subprocess.run(["python3", "core/index_components.py"])
        if result.returncode == 0:
            print("✅ Indexing complete.")
        else:
            print("❌ Indexing failed.")
    else:
        print("Skipping indexing.")
    return

# Step 4: Query prompt
def prompt_query():
    question = input("\nPlease enter your question: ")
    print("\n🔎 Processing your query, please wait...")
    subprocess.run(["python3", "core/query_cli.py", "query", question, "--k", "5", "--per-component", "10"])

# Main pipeline
def main():
    if not extract_repo():
        return
    if not ingest_and_chunk():
        return
    prompt_indexing()
    prompt_query()

if __name__ == "__main__":
    main()
