# query_cli.py
import json
from pathlib import Path
import faiss
import numpy as np
from sentence_transformers import SentenceTransformer
import typer

app = typer.Typer()
PROJECT_ROOT = Path(__file__).parent
INDEX_FILE = PROJECT_ROOT / "components.faiss"
META_FILE = PROJECT_ROOT / "chunks_meta.json"

model = SentenceTransformer("all-MiniLM-L6-v2")
index = faiss.read_index(str(INDEX_FILE))
with open(META_FILE) as f:
    chunks = json.load(f)

@app.command()
def query(q: str, k: int = 5, per_component: int = 1):
    # embed + normalize
    q_emb = model.encode([q], convert_to_numpy=True)
    faiss.normalize_L2(q_emb)
    D, I = index.search(q_emb, k)  # returns top-k chunk indices
    # I shape (1, k)
    hits = []
    for score, idx in zip(D[0], I[0]):
        if idx < 0:
            continue
        meta = chunks[idx]
        hits.append({
            "component_id": meta["component_id"],
            "component_name": meta["component_name"],
            "file": meta["file"],
            "chunk_id": meta["chunk_id"],
            "text": meta["text"],
            "score": float(score)
        })
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
    # Print
    for r in results:
        print(f"\nComponent: {r['component_name']}  (score: {r['best_score']:.4f})")
        print("File:", r['file'])
        for c in r["top_chunks"]:
            print("--- snippet ---")
            print(c["text"][:800].strip())
    if not results:
        print("No matches found.")

if __name__ == "__main__":
    app()