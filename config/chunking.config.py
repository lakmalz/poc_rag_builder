"""
RAG Component Chunking & Indexing Configuration

This file controls how components are chunked and indexed into ChromaDB.
Easy to modify without touching the core chunking logic.
"""

# ============================================
# CHUNKING SETTINGS
# ============================================
CHUNKING_CONFIG = {
    # Enable/disable different chunk types
    "chunk_types": {
        "basic_info": True,          # Component metadata
        "props": True,               # Props information
        "full_source": True,         # Full source code (for standalone components)
        "complete_component": True,  # All files combined (for aggregated components)
        "component_source": True,    # Just .component.tsx (for aggregated components)
        "interfaces": True,          # TypeScript interfaces/types
        "styles": True,              # CSS-in-JS styles
        "code_snippets": True        # Searchable code fragments
    },
    
    # Code snippet settings
    "snippets": {
        "min_lines": 3,              # Minimum lines for a snippet
        "max_lines": 20,             # Maximum lines per snippet
        "overlap": 2,                # Lines of overlap between snippets
        "min_chars": 50,             # Minimum characters per snippet
        "max_chars": 1500            # Maximum characters per snippet
    },
    
    # Chunk size limits (characters)
    "max_chunk_size": {
        "basic_info": 2000,
        "props": 3000,
        "complete_component": 50000,  # Large for aggregated components with all files
        "component_source": 10000,
        "interfaces": 5000,
        "styles": 5000,
        "code_snippet": 1500
    },
    
    # Include in chunks
    "include_in_chunks": {
        "file_paths": True,          # Include file paths in chunks
        "component_name": True,      # Include component name in every chunk
        "chunk_type": True,          # Include chunk type identifier
        "metadata": True,            # Include component metadata
        "aggregation_info": True     # Include aggregation type (multi-file vs single-file)
    }
}

# ============================================
# INDEXING SETTINGS
# ============================================
INDEXING_CONFIG = {
    # ChromaDB settings
    "chromadb": {
        "collection_name": "component_docs",
        "persist_directory": "./build-index/chromadb",
        "embedding_function": "all-MiniLM-L6-v2",  # Sentence Transformers model
        "distance_metric": "cosine"  # cosine, l2, or ip (inner product)
    },
    
    # Batch processing
    "batch_size": 100,              # Documents per batch
    "show_progress": True,          # Show progress bar
    
    # Incremental indexing
    "incremental_mode": False,      # Only index changed files
    "clear_before_index": False,    # Clear existing collection before indexing
    
    # Metadata indexing
    "index_metadata": {
        "component_name": True,
        "file_path": True,
        "chunk_type": True,
        "aggregation_type": True,
        "component_type": True,
        "features": True,
        "props_count": True,
        "directory": True
    }
}

# ============================================
# QUERY SETTINGS
# ============================================
QUERY_CONFIG = {
    # Search settings
    "default_n_results": 5,         # Number of results to return
    "similarity_threshold": 0.6,    # Minimum similarity score (0-1)
    
    # Result filtering
    "filter_by": {
        "chunk_types": [],          # Filter by chunk types (empty = all types)
        "aggregation_types": [],    # Filter by aggregation type (empty = all)
        "directories": [],          # Filter by directory (empty = all)
        "component_types": []       # Filter by component type (empty = all)
    },
    
    # Result ranking
    "boost_scores": {
        "complete_component": 1.5,  # Boost complete component chunks
        "basic_info": 1.2,          # Boost basic info chunks
        "component_source": 1.3,    # Boost component source chunks
        "code_snippets": 1.0        # Normal weight for code snippets
    },
    
    # Response formatting
    "include_in_response": {
        "full_text": True,          # Include full chunk text
        "metadata": True,           # Include chunk metadata
        "similarity_score": True,   # Include similarity score
        "file_path": True,          # Include file path
        "component_info": True      # Include component information
    }
}

# ============================================
# VALIDATION SETTINGS
# ============================================
VALIDATION_CONFIG = {
    # Component validation
    "min_component_size": 50,       # Minimum component size (characters)
    "max_component_size": 1000000,  # Maximum component size (characters)
    
    # Chunk validation
    "min_chunk_size": 20,           # Minimum chunk size (characters)
    "warn_large_chunks": True,      # Warn about chunks exceeding max size
    
    # Quality checks
    "check_duplicates": True,       # Check for duplicate components
    "check_empty_chunks": True,     # Check for empty chunks
    "validate_metadata": True       # Validate chunk metadata
}

# ============================================
# LOGGING SETTINGS
# ============================================
LOGGING_CONFIG = {
    # Verbosity level: 'minimal', 'normal', 'verbose', 'debug'
    "level": "normal",
    
    # What to log
    "log_chunking_stats": True,     # Log chunking statistics
    "log_indexing_stats": True,     # Log indexing statistics
    "log_validation_results": True, # Log validation results
    "log_performance": True,        # Log performance metrics
    
    # Debug options
    "debug_chunks": False,          # Print chunk contents for debugging
    "debug_metadata": False,        # Print metadata for debugging
    "debug_embeddings": False       # Print embedding info for debugging
}

# ============================================
# PERFORMANCE SETTINGS
# ============================================
PERFORMANCE_CONFIG = {
    # Caching
    "cache_embeddings": False,      # Cache embeddings (not implemented yet)
    "cache_chunks": False,          # Cache chunks (not implemented yet)
    
    # Memory management
    "max_memory_mb": 4096,          # Maximum memory usage (MB)
    "batch_size_adaptive": True,    # Adjust batch size based on memory
    
    # Parallel processing
    "enable_parallel": False,       # Enable parallel processing (not implemented yet)
    "num_workers": 4                # Number of parallel workers
}

# ============================================
# FILE FILTERS (for chunking)
# ============================================
FILE_FILTERS = {
    # Only process files from these directories (empty = all directories)
    "include_directories": [
        # Examples (uncomment to use):
        "src/components",
        # "src/features",
        # "src/pages",
        # "src/layouts"
    ],
    
    # Skip files from these directories
    "exclude_directories": [
        "node_modules",
        "dist",
        "build",
        ".next",
        "coverage",
        "test",
        "tests",
        "__tests__"
    ],
    
    # Only process specific component types
    "component_types": [],          # Empty = all types. Options: 'multi-file', 'single-file'
    
    # Only process components with specific features
    "required_features": [],        # Empty = all. Options: 'stateful', 'memoized', 'effects', etc.
}

# ============================================
# EXPORT CONFIGURATION
# ============================================
def get_config():
    """Get all configuration settings"""
    return {
        "chunking": CHUNKING_CONFIG,
        "indexing": INDEXING_CONFIG,
        "query": QUERY_CONFIG,
        "validation": VALIDATION_CONFIG,
        "logging": LOGGING_CONFIG,
        "performance": PERFORMANCE_CONFIG,
        "filters": FILE_FILTERS
    }

# Allow importing individual configs
__all__ = [
    'CHUNKING_CONFIG',
    'INDEXING_CONFIG',
    'QUERY_CONFIG',
    'VALIDATION_CONFIG',
    'LOGGING_CONFIG',
    'PERFORMANCE_CONFIG',
    'FILE_FILTERS',
    'get_config'
]
