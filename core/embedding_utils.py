from sentence_transformers import SentenceTransformer

class SentenceTransformerEmbeddings:
    def __init__(self, model_name="all-MiniLM-L6-v2"):
        self.model = SentenceTransformer(model_name)
        self.model_name = model_name

    def __call__(self, input):
        # ChromaDB expects input to be a list of strings
        return self.model.encode(input, convert_to_numpy=True).tolist()

    def name(self):
        return "sentence-transformers"


def get_embedding_function(model_name="all-MiniLM-L6-v2"):
    """Return a ChromaDB-compatible embedding function using SentenceTransformers."""
    return SentenceTransformerEmbeddings(model_name)
