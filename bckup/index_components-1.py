
import json
from pathlib import Path
import numpy as np
from sentence_transformers import SentenceTransformer
import faiss

class ComponentIndexer:
    PROJECT_ROOT = Path(__file__).parent
    BUILD_INDEX_PATH = PROJECT_ROOT / "build-index"
    CHUNKS_FILE = BUILD_INDEX_PATH / "component_chunks.json"
    INDEX_FILE = BUILD_INDEX_PATH / "components.faiss"
    META_FILE = BUILD_INDEX_PATH / "chunks_meta.json"

    @staticmethod
    def build_index(model_name="all-MiniLM-L6-v2", batch_size=64):
        with open(ComponentIndexer.CHUNKS_FILE, 'r') as f:
            chunks = json.load(f)
        texts = [c["text"] for c in chunks]
        model = SentenceTransformer(model_name)
        print("Encoding", len(texts), "texts...")
        embeddings = model.encode(texts, show_progress_bar=True, convert_to_numpy=True, batch_size=batch_size)
        faiss.normalize_L2(embeddings)
        d = embeddings.shape[1]
        index = faiss.IndexFlatIP(d)
        index.add(embeddings)
        faiss.write_index(index, str(ComponentIndexer.INDEX_FILE))
        with open(ComponentIndexer.META_FILE, 'w') as f:
            json.dump(chunks, f, indent=2)
        print("Saved FAISS index to", ComponentIndexer.INDEX_FILE, "and metadata to", ComponentIndexer.META_FILE)

if __name__ == "__main__":
    ComponentIndexer.build_index()