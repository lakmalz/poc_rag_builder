import os
import subprocess
import sys

# Import query_cli functions
sys.path.insert(0, os.path.dirname(__file__))
from query_cli import list_components, get_component_exact, get_components_data, queryer

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
    chromadb_dir = os.path.join("build-index", "chromadb")
    if os.path.exists(chromadb_dir):
        print(f"✅ Indexing skipped: ChromaDB already exists at {chromadb_dir}.")
        return True
    print("\nReady to index data store.")
    choice = input("Do you want to index the data store? (y/n): ").strip().lower()
    if choice == 'y':
        print("Step 3: Indexing data store...")
        result = subprocess.run(["python3", "core/index_components.py"])
        if result.returncode == 0:
            print("✅ Indexing complete.")
            return True
        else:
            print("❌ Indexing failed.")
            return False
    else:
        print("Skipping indexing.")
        return False

# Step 4: Query prompt using integrated functions
def prompt_query():
    """
    Interactive component query using integrated query_cli functions.
    Returns component list and details as strings.
    """
    chromadb_dir = os.path.join("build-index", "chromadb")
    if os.path.exists(component_doc_path) and os.path.exists(component_chunk_path) and os.path.exists(chromadb_dir):
        print("\nAll data available. Starting interactive component query...")
        
        try:
            # Get component list from ChromaDB (as string)
            components_str = list_components(output_format="list", return_string=True)
            print(components_str)
            
            # Get component data for selection
            component_map, real_components = get_components_data()
            
            if not real_components:
                print("No components found.")
                return
            
            # Get user selection
            choice = input("\nSelect a component by number (or 's' for semantic search): ").strip()
            
            # Check if user wants semantic search
            if choice.lower() == 's':
                question = input("\nEnter your search query: ").strip()
                print("\n🔎 Searching semantically, please wait...")
                subprocess.run(["python3", "core/query_cli.py", "query-find-component", question, "--k", "5", "--per-component", "10"])
                return
            
            # Get exact component by selection
            try:
                idx = int(choice) - 1
                if idx < 0 or idx >= len(real_components):
                    print("Invalid selection.")
                    return
                
                selected_name = real_components[idx]
                print(f"\n🔎 Retrieving exact match for: {selected_name}\n")
                
                # Get component details as string
                component_details = get_component_exact(selected_name, return_string=True)
                print(component_details)
                
            except ValueError:
                print("Invalid input. Please enter a number or 's' for search.")
            except Exception as e:
                print(f"Error: {e}")
                import traceback
                traceback.print_exc()
                
        except Exception as e:
            print(f"Error in query: {e}")
            import traceback
            traceback.print_exc()
        
        return
    
    # Otherwise, prompt for freeform question
    question = input("\nPlease enter your question: ")
    print("\n🔎 Processing your query, please wait...")
    subprocess.run(["python3", "core/query_cli.py", "query-find-component", question, "--k", "5", "--per-component", "10"])

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
