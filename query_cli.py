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
    """
    rag_texts = []
    try:
        import json
        from pathlib import Path
        chunks_path = Path("build-index/component_chunks.json")
        all_chunks = []
        if chunks_path.exists():
            with open(chunks_path, "r", encoding="utf-8") as f:
                all_chunks = json.load(f)
    except Exception as e:
        print(f"[Warning] Could not load all chunks: {e}")

    for r in results:
        print(f"\nComponent: {r['component_name']}  (score: {r['best_score']:.4f})")
        print("File:", r['file'])
        
        # First, try to find full source code for this component
        full_source_found = False
        for chunk in all_chunks:
            if chunk.get("component_id") == r["component_id"] and chunk.get("chunk_type") == "full_source":
                print("   [Using full source code]")
                rag_texts.append(chunk["text"])
                full_source_found = True
                break
        
        # If no full source, use the top chunks from search results
        if not full_source_found:
            for c in r["top_chunks"]:
                snippet = c["text"][:800].strip()
                rag_texts.append(snippet)
        
        # Always add full interface if available
        for chunk in all_chunks:
            if chunk.get("component_id") == r["component_id"] and chunk.get("chunk_type") == "full_interface":
                print("   [Using full interface]")
                rag_texts.append(chunk["text"])
                break
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


@app.command()
def get_component_exact(component_name: str):
    """
    Retrieve a specific component by exact name match (not semantic search).
    
    Args:
        component_name: Exact name of the component to retrieve
    """
    try:
        import json
        from pathlib import Path
        chunks_path = Path("build-index/component_chunks.json")
        
        if not chunks_path.exists():
            print("Error: component_chunks.json not found. Run the pipeline first.")
            return
        
        with open(chunks_path, "r", encoding="utf-8") as f:
            all_chunks = json.load(f)
        
        # Filter chunks for exact component match
        component_chunks = [
            chunk for chunk in all_chunks 
            if chunk.get("component_name") == component_name
        ]
        
        if not component_chunks:
            print(f"No component found with exact name: {component_name}")
            return
        
        print(f"\n📦 Component: {component_name}")
        
        # Get basic info
        basic_info = next((c for c in component_chunks if c.get("chunk_type") == "basic_info"), None)
        if basic_info:
            print(f"📁 File: {basic_info.get('file', 'N/A')}")
        
        # Get full source code
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
        
        # Get full interface
        full_interface = next((c for c in component_chunks if c.get("chunk_type") == "full_interface"), None)
        if full_interface:
            print("\n✅ Type Definitions:")
            print("=" * 80)
            print(full_interface["text"])
            print("=" * 80)
        
        # Get props
        props_chunk = next((c for c in component_chunks if c.get("chunk_type") == "props"), None)
        if props_chunk:
            print("\n📋 Props:")
            print("-" * 80)
            print(props_chunk["text"])
            print("-" * 80)
            
    except Exception as e:
        print(f"Error retrieving component: {e}")
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