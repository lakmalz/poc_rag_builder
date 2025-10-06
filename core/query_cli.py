import json
from pathlib import Path
import chromadb
from chromadb.config import Settings
from sentence_transformers import SentenceTransformer
import typer
from typing import List, Dict, Any
import re
import requests

app = typer.Typer()

class ComponentQueryer:
    def __init__(self, collection_name="component_chunks", model_name="all-MiniLM-L6-v2"):
        self.PROJECT_ROOT = Path(__file__).parent
        self.BUILD_INDEX_PATH = self.PROJECT_ROOT / "build-index"
        self.CHROMA_DB_PATH = self.BUILD_INDEX_PATH / "chromadb"
        self.collection_name = collection_name
        self.model_name = model_name
        self.model = None
        self.client = None
        self.collection = None
    
    def _get_embedding_function(self):
        from embedding_utils import get_embedding_function
        return get_embedding_function(self.model_name)
    
    def _get_client(self):
        """Initialize ChromaDB client"""
        if self.client is None:
            self.client = chromadb.PersistentClient(
                path=str(self.CHROMA_DB_PATH),
                settings=Settings(anonymized_telemetry=False)
            )
        return self.client
    
    def _get_collection(self):
        """Get the ChromaDB collection"""
        if self.collection is None:
            client = self._get_client()
            embedding_function = self._get_embedding_function()
            
            try:
                self.collection = client.get_collection(
                    name=self.collection_name,
                    embedding_function=embedding_function
                )
            except ValueError:
                raise ValueError(f"Collection '{self.collection_name}' not found. Please run index_components.py first.")
        
        return self.collection
    
    def query_components(self, query_text: str, k: int = 5, per_component: int = 1) -> List[Dict[str, Any]]:
        """Query the component index and return formatted results"""
        collection = self._get_collection()
        
        # Query ChromaDB
        results = collection.query(
            query_texts=[query_text],
            n_results=k
        )
        
        # Convert ChromaDB results to the original format
        hits = []
        for i, (doc, metadata, distance, doc_id) in enumerate(zip(
            results['documents'][0],
            results['metadatas'][0], 
            results['distances'][0],
            results['ids'][0]
        )):
            # ChromaDB returns distances (lower is better), convert to scores (higher is better)
            # For cosine similarity, distance = 1 - similarity, so score = 1 - distance
            score = 1 - distance
            
            hit = {
                "component_id": metadata["component_id"],
                "component_name": metadata["component_name"],
                "file": metadata["file"],
                "chunk_id": metadata["chunk_id"],
                "text": doc,
                "score": float(score)
            }
            hits.append(hit)
        
        # Aggregate by component: keep top-scoring chunk(s) per component
        grouped = {}
        for h in hits:
            cid = h["component_id"]
            grouped.setdefault(cid, []).append(h)
        
        # Build result list ordered by best score per component
        results = []
        for cid, hs in grouped.items():
            hs_sorted = sorted(hs, key=lambda x: -x["score"])
            results.append({
                "component_id": cid,
                "component_name": hs_sorted[0]["component_name"],
                "file": hs_sorted[0]["file"],
                "best_score": hs_sorted[0]["score"],
                "top_chunks": hs_sorted[:per_component]
            })
        
        results.sort(key=lambda x: -x["best_score"])
        return results

# Global queryer instance
queryer = ComponentQueryer()

@app.command()
def call_ollama_llm(rag_response: str, prompt: str, model: str = "llama2") -> str:
    """
    Call Ollama LLM API with the RAG response and prompt.
    """    
    url = "http://localhost:11434/api/generate"
    payload = {
        "model": "llama3.1",
        "prompt": f"{prompt}\n\nContext:\n{rag_response}",
        "stream": False
    }
    try:
        print(f"[Calling Ollama API... Payload : {payload}]")
        resp = requests.post(url, json=payload, timeout=60)
        resp.raise_for_status()
        data = resp.json()
        return data.get("response", "")
    except Exception as e:
        return f"[Ollama API error: {e}]"

DEFAULT_OLLAMA_PROMPT = (
    "You are an expert React developer. "
    "Given the following context from component documentation and code snippets, "
    "answer the user's question as clearly and concisely as possible. "
    "If the user asks how to use a component, provide a complete example code snippet showing how to use it in a React page, including all props with example values. "
    "Also include usage advice and highlight best practices. "
    "If the answer is not in the context, say so."
)
## Add the example for developing a React component with props for dev example usages

@app.command()
def call_cloud_llm(rag_response: str, prompt: str, model: str = "llama2") -> str:
    """
    Call Cloude LLM API with the RAG response and prompt.
    """    
    url = "url" # Replace with actual Cloude API URL
    api_key = "your_api_key_here"  # Replace with your actual API key
    
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json"
    }   

    content = f"{prompt}\n\nContext:\n{rag_response}"
    messages = [{"role": "system", "content": content}]
    request_payload = {
        "messages": messages,
        "stream": False,
    }
    
    try:
        print(f"[Calling Cloude API... Payload : {request_payload}]")
        response = requests.post(
            url, 
            headers=headers, 
            json=request_payload, 
            timeout=120, 
            verify=False)
        
        response.raise_for_status()
        print(json.dumps(response.json(), indent=2))
        return json.dumps(response.json())

    except requests.exceptions.Timeout as e:
        return RuntimeError(f"[Cloude API timeout: {e}]")
    except requests.exceptions.RequestException as e:
        return RuntimeError(f"[Cloude API error: {e}]")
    except json.JSONDecodeError as e:
        return RuntimeError(f"[Cloude API JSON decode error: {e}]") 

@app.command()
def query(q: str, k: int = 5, per_component: int = 1, llm_prompt: str = DEFAULT_OLLAMA_PROMPT, ollama_model: str = "llama3"):
    """
    Query the component database for similar components.
    
    Args:
        q: Query string to search for
        k: Number of top chunks to retrieve
        per_component: Number of chunks to show per component
    """
    try:
        results = queryer.query_components(q, k, per_component)
        rag_texts = get_rag_context_for_components(results)
        if not results:
            print("No matches found.")
            return

        # Send RAG response to Ollama
        rag_response = "\n\n".join(rag_texts)
        print("\n[Calling LLM...]")
        print(f"RAG Response:\n{rag_response}\n")
        print(f"LLM Prompt:\n{llm_prompt}\n")

        props = extract_props_list(rag_response)
        print(f"Extracted Props: {props}\n")

        props_str = format_props_for_prompt(props)
        llm_prompt_with_props = llm_prompt + props_str

        llm_output = call_ollama_llm(rag_response, llm_prompt_with_props, ollama_model)

        message_object = get_message_content(llm_output)
        print("----------------------------------------------------------------")
        extract_code_snippet(message_object)
        print("----------------------------------------------------------------")

    except ValueError as e:
        print(f"Error: {e}")
        print("Make sure to run 'python index_components.py' first to build the index.")
    except Exception as e:
        print(f"Unexpected error: {e}")

@app.command()
def query_find_component(q: str, k: int = 5, per_component: int = 1):    
    """
    Query the component database for similar components.
    
    Args:
        q: Query string to search for
        k: Number of top chunks to retrieve
        per_component: Number of chunks to show per component
    """
    try:
        results = queryer.query_components(q, k, per_component)
        rag_texts = get_rag_context_for_components(results)
        if not results:
            print("No matches found.")
            return

        # Send RAG response to Ollama
        rag_response = "\n\n".join(rag_texts)
        # props = extract_props_list(rag_response)

        # print(f"Extracted Props: {props}\n")
        print("Code Snippet:")
        print("----------------------------------------------------------------")
        print(f"{rag_response}")
        print("----------------------------------------------------------------")
        # print("After - Extracting code snippet...")
        # print("----------------------------------------------------------------")
        # print("Code Snippet:")
        # print("----------------------------------------------------------------")
        # code_snippet = extract_code_snippet(rag_response)
        # for snippet in code_snippet:
        #     print(snippet)
        # print("----------------------------------------------------------------")

    except ValueError as e:
        print(f"Error: {e}")
        print("Make sure to run 'python index_components.py' first to build the index.")
    except Exception as e:
        print(f"Unexpected error: {e}")

def get_rag_context_for_components(results):
    """
    Given a list of component search results, aggregate code, props, and interface_code chunks for LLM context.
    Retrieves full source and interface from ChromaDB (not JSON file).
    """
    rag_texts = []
    try:
        # Get ChromaDB collection
        collection = queryer._get_collection()
    except Exception as e:
        print(f"[Warning] Could not access ChromaDB: {e}")
        collection = None

    for r in results:
        print(f"\nComponent: {r['component_name']}  (score: {r['best_score']:.4f})")
        print("File:", r['file'])
        
        # First, try to find full source code for this component from ChromaDB
        full_source_found = False
        if collection:
            try:
                full_source_results = collection.get(
                    where={
                        "$and": [
                            {"component_id": r["component_id"]},
                            {"chunk_type": "full_source"}
                        ]
                    },
                    include=["documents"]
                )
                if full_source_results['documents']:
                    print("   [Using full source code from ChromaDB]")
                    rag_texts.append(full_source_results['documents'][0])
                    full_source_found = True
            except Exception as e:
                print(f"   [Warning] Could not retrieve full source: {e}")
        
        # If no full source, use the top chunks from search results
        if not full_source_found:
            for c in r["top_chunks"]:
                snippet = c["text"][:800].strip()
                rag_texts.append(snippet)
        
        # Always add full interface if available from ChromaDB
        if collection:
            try:
                full_interface_results = collection.get(
                    where={
                        "$and": [
                            {"component_id": r["component_id"]},
                            {"chunk_type": "full_interface"}
                        ]
                    },
                    include=["documents"]
                )
                if full_interface_results['documents']:
                    print("   [Using full interface from ChromaDB]")
                    rag_texts.append(full_interface_results['documents'][0])
            except Exception as e:
                print(f"   [Warning] Could not retrieve full interface: {e}")
                
    return rag_texts

def get_message_content(json_data: str) -> str:
    try:
        data = json.loads(json_data)
        message = data["choices"][0]["message"]["content"]
        return message
    except (json.JSONDecodeError, KeyError, IndexError) as e:
        print(f"Error decoding JSON: {e}")
        return ""

def format_props_for_prompt(props):
    """
    Format the extracted props as a string for inclusion in the LLM prompt.
    """
    if props:
        return "\nProps for this component:\n" + "\n".join([f"- {p}" for p in props])
    return ""

def extract_props_list(rag_response: str):
    props = []
    # Match any React FC/FunctionComponent signature
    match = re.search(
        r'(\w+):\s*React\s+FC<([\w]+Props)>?\s*=\s*\(\s*([^)]+)\)', rag_response
    )
    if match:
        # Extract prop names from signature
        prop_names = [p.strip() for p in match.group(3).split(',') if p.strip()]
        props.extend(prop_names)
    # Match any useState object initialization
    form_matches = re.findall(r'useState\(\s*([^)]+)\)', rag_response)
    for form in form_matches:
        keys = re.findall(r'(\w+):', form)
        props.extend(keys)
    return props

def extract_code_snippet(content):
    # Try to find code between triple backticks
    code_blocks = re.findall(r"```(?:\w*\n)?(.*?)```", content, re.DOTALL)
    snippets = []
    if code_blocks:
        for code in code_blocks:
            snippets.append(code.strip())
    else:
        # Try to match function or class component definitions
        match = re.search(r"(export\s+(const|function|class)\s+\w+[\s\S]+?\{[\s\S]+?\})", content)
        if match:
            snippets.append(match.group(1).strip())
        else:
            # Try to match import/export default pattern as fallback
            match2 = re.search(r"(import React.*?export default\s+\w+;)", content, re.DOTALL)
            if match2:
                snippets.append(match2.group(1).strip())
            else:
                # Fallback: return first 100 lines of the RAG response
                lines = content.splitlines()
                fallback = "\n".join(lines[:100]).strip()
                if fallback:
                    snippets.append(fallback)
                else:
                    snippets.append("[No code snippet found in the RAG response]")
    return snippets


def is_real_component(name: str, chunk_data: dict) -> bool:
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
    
    # Skip style files (*.style.ts, *.styles.ts, *.styled.ts)
    file_path = chunk_data.get('file', '').lower()
    style_file_patterns = ['.style.ts', '.styles.ts', '.styled.ts', '.style.js', '.styles.js', '.styled.js']
    if any(pattern in file_path for pattern in style_file_patterns):
        return False
    
    # Skip if file is in utils/helpers directory
    if '/utils/' in file_path or '/helpers/' in file_path:
        return False
    
    # Skip interface/type files (*.interface.ts, *.types.ts)
    interface_file_patterns = ['.interface.ts', '.types.ts', '.interface.js', '.types.js']
    if any(pattern in file_path for pattern in interface_file_patterns):
        return False
    
    # Skip index files (they're just re-exports)
    if file_path.endswith('index.ts') or file_path.endswith('index.tsx') or file_path.endswith('index.js') or file_path.endswith('index.jsx'):
        return False
    
    # Must start with uppercase (component convention)
    if not name[0].isupper():
        return False
    
    return True

def get_components_data():
    """
    Helper function to get component data from ChromaDB.
    Returns: (component_map, real_components_list)
    """
    import json
    
    # Get data from ChromaDB
    collection = queryer._get_collection()
    
    # Get all basic_info chunks from ChromaDB
    all_data = collection.get(
        where={"chunk_type": "basic_info"},
        include=["metadatas"]
    )
    
    # Get unique component names and their metadata
    component_map = {}
    for metadata in all_data['metadatas']:
        name = metadata.get("component_name")
        if name:
            component_map[name] = metadata
    
    # Filter to only real components
    real_components = [
        name for name in component_map.keys() 
        if is_real_component(name, component_map[name])
    ]
    
    # Sort alphabetically
    real_components.sort()
    
    return component_map, real_components

@app.command()
def list_components(output_format: str = "list", return_string: bool = False):
    """
    List all available React components (filtered to exclude utils/hooks).
    Retrieves data from ChromaDB (not JSON file).
    
    Args:
        output_format: Output format - 'list' (default), 'json', or 'names'
        return_string: If True, return string instead of printing
    
    Returns:
        String representation or prints component list
    """
    try:
        import json
        
        component_map, real_components = get_components_data()
        
        if not real_components:
            msg = "No components found."
            if return_string:
                return msg
            print(msg)
            return []
        
        # Build output string
        output_lines = []
        
        if output_format == "json":
            component_data = [
                {
                    "name": name,
                    "file": component_map[name].get('file', ''),
                    "component_id": component_map[name].get('component_id', '')
                }
                for name in real_components
            ]
            output_str = json.dumps(component_data, indent=2)
            if return_string:
                return output_str
            print(output_str)
            return component_data
            
        elif output_format == "names":
            output_str = "\n".join(real_components)
            if return_string:
                return output_str
            print(output_str)
            return real_components
            
        else:  # list format (default)
            output_lines.append(f"\nFound {len(real_components)} component(s):\n")
            for idx, name in enumerate(real_components):
                file_path = component_map[name].get('file', '')
                file_display = '/'.join(file_path.split('/')[-3:]) if file_path else ''
                output_lines.append(f"[{idx+1}] {name:30s} ({file_display})")
            
            output_str = "\n".join(output_lines)
            if return_string:
                return output_str
            print(output_str)
            return real_components
            
    except Exception as e:
        error_msg = f"Error listing components: {e}"
        if return_string:
            return error_msg
        print(error_msg)
        import traceback
        traceback.print_exc()
        return []

@app.command()
def get_component_exact(component_name: str, return_string: bool = False):
    """
    Retrieve a specific component by exact name match (not semantic search).
    Retrieves data from ChromaDB (not JSON file).
    
    Args:
        component_name: Exact name of the component to retrieve
        return_string: If True, return string instead of printing
    
    Returns:
        String representation of component details
    """
    try:
        import json
        
        # Get data from ChromaDB instead of JSON file
        collection = queryer._get_collection()
        
        # Query ChromaDB for this specific component
        results = collection.get(
            where={"component_name": component_name},
            include=["metadatas", "documents"]
        )
        
        if not results['ids']:
            msg = f"No component found with exact name: {component_name}"
            if return_string:
                return msg
            print(msg)
            return
        
        # Convert to chunk format for processing
        component_chunks = [
            {
                "chunk_type": meta.get("chunk_type"),
                "text": doc,
                "file": meta.get("file"),
                **meta
            }
            for meta, doc in zip(results['metadatas'], results['documents'])
        ]
        
        # Build output string
        output_lines = []
        output_lines.append(f"\n📦 Component: {component_name}")
        
        # Get basic info
        basic_info = next((c for c in component_chunks if c.get("chunk_type") == "basic_info"), None)
        if basic_info:
            output_lines.append(f"📁 File: {basic_info.get('file', 'N/A')}")
        
        # Get full source code - Try complete_component first, then component_source
        complete_component = next((c for c in component_chunks if c.get("chunk_type") == "complete_component"), None)
        component_source = next((c for c in component_chunks if c.get("chunk_type") == "component_source"), None)
        
        if complete_component:
            output_lines.append("\n✅ Complete Component (All Files):")
            output_lines.append("=" * 80)
            output_lines.append(complete_component["text"])
            output_lines.append("=" * 80)
        elif component_source:
            output_lines.append("\n✅ Component Source Code:")
            output_lines.append("=" * 80)
            output_lines.append(component_source["text"])
            output_lines.append("=" * 80)
        else:
            output_lines.append("\n⚠️  Full source not available, showing code chunks:")
            code_chunks = [c for c in component_chunks if c.get("chunk_type") == "code"]
            for chunk in code_chunks:
                output_lines.append(chunk["text"])
        
        # Get interfaces and types
        interfaces_chunk = next((c for c in component_chunks if c.get("chunk_type") == "interfaces"), None)
        if interfaces_chunk:
            output_lines.append("\n✅ Type Definitions:")
            output_lines.append("=" * 80)
            output_lines.append(interfaces_chunk["text"])
            output_lines.append("=" * 80)
        
        # Get styles
        styles_chunk = next((c for c in component_chunks if c.get("chunk_type") == "styles"), None)
        if styles_chunk:
            output_lines.append("\n🎨 Styles:")
            output_lines.append("=" * 80)
            output_lines.append(styles_chunk["text"])
            output_lines.append("=" * 80)
        
        # Get props
        props_chunk = next((c for c in component_chunks if c.get("chunk_type") == "props"), None)
        if props_chunk:
            output_lines.append("\n📋 Props:")
            output_lines.append("-" * 80)
            output_lines.append(props_chunk["text"])
            output_lines.append("-" * 80)
        
        output_str = "\n".join(output_lines)
        if return_string:
            return output_str
        print(output_str)
            
    except Exception as e:
        error_msg = f"Error retrieving component: {e}"
        if return_string:
            return error_msg
        print(error_msg)
        import traceback
        traceback.print_exc()

@app.command()
def query_component_interactive():
    """
    Interactive component query: List components, let user select, then retrieve exact match.
    Combines list-components and get-component-exact functionality.
    Retrieves data from ChromaDB (not JSON file).
    """
    try:
        import json
        
        # Step 1: Get components from ChromaDB
        collection = queryer._get_collection()
        
        # Get all basic_info chunks from ChromaDB
        all_data = collection.get(
            where={"chunk_type": "basic_info"},
            include=["metadatas"]
        )
        
        component_map = {}
        for metadata in all_data['metadatas']:
            name = metadata.get("component_name")
            if name:
                component_map[name] = metadata
        
        real_components = [
            name for name in component_map.keys() 
            if is_real_component(name, component_map[name])
        ]
        real_components.sort()
        
        if not real_components:
            print("No components found.")
            return
        
        print(f"\nFound {len(real_components)} component(s):\n")
        for idx, name in enumerate(real_components):
            file_path = component_map[name].get('file', '')
            file_display = '/'.join(file_path.split('/')[-3:]) if file_path else ''
            print(f"[{idx+1}] {name:30s} ({file_display})")
        
        # Step 2: Get user selection
        choice = input("\nSelect a component by number (or 's' for semantic search): ").strip()
        
        # Check if user wants semantic search
        if choice.lower() == 's':
            question = input("\nEnter your search query: ").strip()
            print("\n🔎 Searching semantically, please wait...")
            results = queryer.query_components(question, k=5, per_component=10)
            rag_texts = get_rag_context_for_components(results)
            if results:
                rag_response = "\n\n".join(rag_texts)
                print("\nCode Snippet:")
                print("-" * 80)
                print(rag_response)
                print("-" * 80)
            else:
                print("No matches found.")
            return
        
        # Step 3: Retrieve exact component
        try:
            idx = int(choice) - 1
            if idx < 0 or idx >= len(real_components):
                print("Invalid selection.")
                return
            
            selected_name = real_components[idx]
            print(f"\n🔎 Retrieving exact match for: {selected_name}\n")
            
            # Query ChromaDB for this specific component
            results = collection.get(
                where={"component_name": selected_name},
                include=["metadatas", "documents"]
            )
            
            if not results['ids']:
                print(f"No component found with exact name: {selected_name}")
                return
            
            # Convert to chunk format for processing
            component_chunks = [
                {
                    "chunk_type": meta.get("chunk_type"),
                    "text": doc,
                    "file": meta.get("file"),
                    **meta
                }
                for meta, doc in zip(results['metadatas'], results['documents'])
            ]
            
            print(f"\n📦 Component: {selected_name}")
            
            basic_info = next((c for c in component_chunks if c.get("chunk_type") == "basic_info"), None)
            if basic_info:
                print(f"📁 File: {basic_info.get('file', 'N/A')}")
            
            full_source = next((c for c in component_chunks if c.get("chunk_type") == "full_source"), None)
            if full_source:
                print("\n✅ Full Source Code:")
                print("=" * 80)
                print(full_source["text"])
                print("=" * 80)
            else:
                print("\n⚠️  Full source not available, showing code chunks:")
                code_chunks = [c for c in component_chunks if c.get("chunk_type") == "code"]
                for chunk in code_chunks:
                    print(chunk["text"])
            
            full_interface = next((c for c in component_chunks if c.get("chunk_type") == "full_interface"), None)
            if full_interface:
                print("\n✅ Type Definitions:")
                print("=" * 80)
                print(full_interface["text"])
                print("=" * 80)
            
            props_chunk = next((c for c in component_chunks if c.get("chunk_type") == "props"), None)
            if props_chunk:
                print("\n📋 Props:")
                print("-" * 80)
                print(props_chunk["text"])
                print("-" * 80)
                
        except ValueError:
            print("Invalid input. Please enter a number or 's' for search.")
        except Exception as e:
            print(f"Error: {e}")
            import traceback
            traceback.print_exc()
            
    except Exception as e:
        print(f"Error in interactive query: {e}")
        import traceback
        traceback.print_exc()

@app.command()
def info():
    """Show information about the component database."""
    try:
        collection = queryer._get_collection()
        count = collection.count()
        print(f"Component database contains {count} chunks")
        print(f"Database location: {queryer.CHROMA_DB_PATH}")
        print(f"Collection name: {queryer.collection_name}")
    except Exception as e:
        print(f"Error getting database info: {e}")

if __name__ == "__main__":
    app()