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
        print(f"RAG Response:\n{rag_response}\n")

        props = extract_props_list(rag_response)
        print(f"Extracted Props: {props}\n")

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
        for c in r["top_chunks"]:
            print("--- snippet ---")
            snippet = c["text"][:800].strip()
            print(snippet)
            rag_texts.append(snippet)
        # Add interface_code chunk if available
        for chunk in all_chunks:
            if chunk.get("component_id") == r["component_id"] and chunk.get("chunk_type") == "interface_code":
                interface_snippet = chunk["text"][:800].strip()
                print("--- interface_code ---")
                print(interface_snippet)
                rag_texts.append(interface_snippet)
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
    if code_blocks:
        for code in code_blocks:
            print(code.strip())
    else:
        match = re.search(r"(import React.*?export default\s+\w+;)", content, re.DOTALL)
        if match:
            print(match.group(1).strip())
            return
        else:
            print("[No code snippet found in the LLM response]")


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