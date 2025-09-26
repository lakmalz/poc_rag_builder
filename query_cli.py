import json
from pathlib import Path
import chromadb
from chromadb.config import Settings
from sentence_transformers import SentenceTransformer
import typer
from typing import List, Dict, Any

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
def query(q: str, k: int = 5, per_component: int = 1):
    """
    Query the component database for similar components.
    
    Args:
        q: Query string to search for
        k: Number of top chunks to retrieve
        per_component: Number of chunks to show per component
    """
    try:
        results = queryer.query_components(q, k, per_component)
        
        # Print results in the same format as the original
        for r in results:
            print(f"\nComponent: {r['component_name']}  (score: {r['best_score']:.4f})")
            print("File:", r['file'])
            for c in r["top_chunks"]:
                print("--- snippet ---")
                print(c["text"][:800].strip())
        
        if not results:
            print("No matches found.")
            
    except ValueError as e:
        print(f"Error: {e}")
        print("Make sure to run 'python index_components.py' first to build the index.")
    except Exception as e:
        print(f"Unexpected error: {e}")

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