# index_components.py
import json
from pathlib import Path
import chromadb
from chromadb.config import Settings
from sentence_transformers import SentenceTransformer


class ComponentIndexer:
    PROJECT_ROOT = Path(__file__).parent
    BUILD_INDEX_PATH = PROJECT_ROOT / "build-index"
    CHUNKS_FILE = BUILD_INDEX_PATH / "component_chunks.json"
    CHROMA_DB_PATH = BUILD_INDEX_PATH / "chromadb"
    
    def __init__(self, collection_name="component_chunks", model_name="all-MiniLM-L6-v2"):
        self.collection_name = collection_name
        self.model_name = model_name
        self.model = None
        self.client = None
        self.collection = None
    
    def _get_embedding_function(self):
        """Create a custom embedding function for ChromaDB using SentenceTransformers"""
        if self.model is None:
            self.model = SentenceTransformer(self.model_name)
        
        class SentenceTransformerEmbeddings:
            def __init__(self, model):
                self.model = model
            
            def __call__(self, input_texts):
                return self.model.encode(input_texts, convert_to_numpy=True).tolist()
        
        return SentenceTransformerEmbeddings(self.model)
    
    def _get_client(self):
        """Initialize ChromaDB client"""
        if self.client is None:
            # Ensure the directory exists
            self.BUILD_INDEX_PATH.mkdir(exist_ok=True, parents=True)
            
            # Create persistent client
            self.client = chromadb.PersistentClient(
                path=str(self.CHROMA_DB_PATH),
                settings=Settings(anonymized_telemetry=False)
            )
        return self.client
    
    def _get_collection(self, create_if_missing=True):
        """Get or create the ChromaDB collection"""
        if self.collection is None:
            client = self._get_client()
            embedding_function = self._get_embedding_function()
            
            if create_if_missing:
                # First try to create the collection (safer approach)
                try:
                    self.collection = client.create_collection(
                        name=self.collection_name,
                        embedding_function=embedding_function,
                        metadata={"hnsw:space": "cosine"}  # Use cosine similarity
                    )
                    print(f"Created new collection '{self.collection_name}'")
                except Exception:
                    # Collection already exists, get it instead
                    try:
                        self.collection = client.get_collection(
                            name=self.collection_name,
                            embedding_function=embedding_function
                        )
                        print(f"Loaded existing collection '{self.collection_name}'")
                    except Exception as e:
                        raise Exception(f"Failed to get or create collection '{self.collection_name}': {e}")
            else:
                try:
                    self.collection = client.get_collection(
                        name=self.collection_name,
                        embedding_function=embedding_function
                    )
                except Exception as e:
                    raise Exception(f"Collection '{self.collection_name}' not found: {e}")
        
        return self.collection
    
    def build_index(self, batch_size=64):
        """Build the ChromaDB index from component chunks"""
        # Load chunks
        with open(self.CHUNKS_FILE, 'r') as f:
            chunks = json.load(f)
        
        print(f"Encoding {len(chunks)} texts...")
        
        # Get collection
        collection = self._get_collection()
        
        # Clear existing data if any
        try:
            # Get all existing IDs and delete them
            existing = collection.get()
            if existing['ids']:
                collection.delete(ids=existing['ids'])
                print("Cleared existing collection data")
        except:
            pass  # Collection might be empty
        
        # Prepare data for ChromaDB
        texts = []
        metadatas = []
        ids = []
        
        for i, chunk in enumerate(chunks):
            texts.append(chunk["text"])
            # Store all metadata except 'text' (since text is stored separately)
            metadata = {k: v for k, v in chunk.items() if k != "text"}
            metadatas.append(metadata)
            ids.append(f"chunk_{i}")
        
        # Add documents to collection in batches
        print(f"Adding {len(texts)} documents to ChromaDB...")
        
        for i in range(0, len(texts), batch_size):
            batch_end = min(i + batch_size, len(texts))
            batch_texts = texts[i:batch_end]
            batch_metadatas = metadatas[i:batch_end]
            batch_ids = ids[i:batch_end]
            
            collection.add(
                documents=batch_texts,
                metadatas=batch_metadatas,
                ids=batch_ids
            )
            
            print(f"Added batch {i//batch_size + 1}/{(len(texts) + batch_size - 1)//batch_size}")
        
        print(f"Saved ChromaDB index to {self.CHROMA_DB_PATH}")
        print(f"Collection '{self.collection_name}' contains {collection.count()} documents")
    
    @staticmethod
    def build_index_static(model_name="all-MiniLM-L6-v2", batch_size=64):
        """Static method to maintain compatibility with original API. Auto-create chunks if missing."""
        chunks_file = Path(__file__).parent / "build-index" / "component_chunks.json"
        if not chunks_file.exists():
            print(f"Chunks file not found: {chunks_file}")
            print("Running chunk creation...")
            chunker = ComponentChunker()
            chunker.create_chunks()
            print(f"Created chunks file: {chunks_file}")
        
        indexer = ComponentIndexer(model_name=model_name)
        indexer.build_index(batch_size=batch_size)

if __name__ == "__main__":
    ComponentIndexer.build_index_static()