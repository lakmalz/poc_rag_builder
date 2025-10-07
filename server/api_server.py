#!/usr/bin/env python3
"""
FastAPI Server for RAG Component System
========================================
Provides REST API endpoints for component indexing and retrieval.

Endpoints:
    POST /api/index/build       - Build index (extract, chunk, index)
    POST /api/index/rebuild     - Rebuild index with validation
    GET  /api/components        - List all components
    GET  /api/components/{name} - Get component by exact name
    POST /api/components/search - Semantic search for components

Usage:
    uvicorn server.api_server:app --reload --host 0.0.0.0 --port 8000
    
    Or:
    python3 server/api_server.py
"""

from fastapi import FastAPI, HTTPException, Query, Body
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from pydantic_settings import BaseSettings
from typing import List, Dict, Any, Optional
from pathlib import Path
from enum import Enum
from datetime import datetime
import subprocess
import sys
import json
import logging

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.StreamHandler(),
        logging.FileHandler('server/logs/api_server.log', mode='a')
    ] if Path('server/logs').exists() else [logging.StreamHandler()]
)
logger = logging.getLogger(__name__)

# Add parent directory to path to import from core
sys.path.insert(0, str(Path(__file__).parent.parent / "core"))
from query_cli import ComponentQueryer, get_components_data, is_real_component

# ============================================================================
# Configuration
# ============================================================================

class Settings(BaseSettings):
    """Application settings with environment variable support"""
    app_name: str = "RAG Component API"
    app_version: str = "1.0.0"
    host: str = "0.0.0.0"
    port: int = 8000
    reload: bool = True
    cors_origins: List[str] = ["*"]
    log_level: str = "INFO"
    
    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"

settings = Settings()

# Update logging level from settings
logging.getLogger().setLevel(getattr(logging, settings.log_level.upper()))

# ============================================================================
# Enums for Validation
# ============================================================================

class OutputFormat(str, Enum):
    """Valid output format options"""
    list = "list"
    json = "json"
    names = "names"

app = FastAPI(
    title=settings.app_name,
    description="API for indexing and querying React components using RAG",
    version=settings.app_version
)

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize queryer
queryer = ComponentQueryer()

logger.info(f"FastAPI server initialized: {settings.app_name} v{settings.app_version}")

# ============================================================================
# Pydantic Models
# ============================================================================

class BuildIndexRequest(BaseModel):
    clean: bool = Field(False, description="Remove old outputs before building")

class BuildIndexResponse(BaseModel):
    success: bool
    message: str
    components_indexed: Optional[int] = None
    chunks_created: Optional[int] = None

class ComponentListResponse(BaseModel):
    success: bool
    count: int
    components: List[Dict[str, str]]

class ComponentDetailResponse(BaseModel):
    success: bool
    component_name: str
    file: Optional[str]
    complete_component: Optional[str]
    component_source: Optional[str]
    interfaces: Optional[str]
    styles: Optional[str]
    props: Optional[str]

class SearchRequest(BaseModel):
    query: str = Field(..., description="Search query text")
    k: int = Field(5, description="Number of results to return", ge=1, le=50)
    per_component: int = Field(1, description="Chunks per component", ge=1, le=10)

class SearchResponse(BaseModel):
    success: bool
    query: str
    results: List[Dict[str, Any]]

class HealthResponse(BaseModel):
    status: str
    database_path: str
    collection_name: str
    total_chunks: Optional[int]

# ============================================================================
# Health & Info Endpoints
# ============================================================================

@app.get("/", tags=["Health"])
async def root():
    """Root endpoint - API information"""
    return {
        "name": "RAG Component API",
        "version": "1.0.0",
        "status": "running",
        "docs": "/docs",
        "endpoints": {
            "build_index": "POST /api/index/build",
            "list_components": "GET /api/components",
            "get_component": "GET /api/components/{name}",
            "search": "POST /api/components/search",
            "health": "GET /api/health"
        }
    }

@app.get("/api/health", response_model=HealthResponse, tags=["Health"])
async def health_check():
    """Health check endpoint with database info"""
    try:
        collection = queryer._get_collection()
        count = collection.count()
        logger.debug(f"Health check: database has {count} chunks")
        
        return HealthResponse(
            status="healthy",
            database_path=str(queryer.CHROMA_DB_PATH),
            collection_name=queryer.collection_name,
            total_chunks=count
        )
    except FileNotFoundError as e:
        logger.error(f"Database not found: {e}")
        return HealthResponse(
            status="unhealthy - database not found",
            database_path=str(queryer.CHROMA_DB_PATH),
            collection_name=queryer.collection_name,
            total_chunks=None
        )
    except Exception as e:
        logger.error(f"Health check failed: {e}", exc_info=True)
        return HealthResponse(
            status="unhealthy",
            database_path=str(queryer.CHROMA_DB_PATH),
            collection_name=queryer.collection_name,
            total_chunks=None
        )

# ============================================================================
# Index Building Endpoints
# ============================================================================

@app.post("/api/index/build", response_model=BuildIndexResponse, tags=["Indexing"])
async def build_index(request: BuildIndexRequest = Body(...)):
    """
    Build the component index (Extract → Chunk → Index)
    
    This runs the simple build pipeline without validation.
    """
    try:
        logger.info(f"Starting index build (clean={request.clean})")
        # Change to project root
        project_root = Path(__file__).parent.parent
        
        # Build command
        cmd = ["python3", "core/build_index.py"]
        if request.clean:
            cmd.append("--clean")
        
        # Run the build
        result = subprocess.run(
            cmd,
            cwd=str(project_root),
            capture_output=True,
            text=True,
            timeout=300  # 5 minute timeout
        )
        
        if result.returncode != 0:
            logger.error(f"Build failed with code {result.returncode}: {result.stderr}")
            raise HTTPException(
                status_code=500,
                detail=f"Build failed: {result.stderr}"
            )
        
        # Get statistics
        try:
            collection = queryer._get_collection()
            chunks_count = collection.count()
            
            # Get unique components
            all_data = collection.get(
                where={"chunk_type": "basic_info"},
                include=["metadatas"]
            )
            components_count = len(set(
                meta.get("component_name") 
                for meta in all_data['metadatas']
                if meta.get("component_name")
            ))
        except:
            chunks_count = None
            components_count = None
        
        logger.info(f"Build completed: {components_count} components, {chunks_count} chunks")
        return BuildIndexResponse(
            success=True,
            message="Index built successfully",
            components_indexed=components_count,
            chunks_created=chunks_count
        )
        
    except HTTPException:
        raise
    except subprocess.TimeoutExpired:
        logger.error("Build process timed out after 5 minutes")
        raise HTTPException(status_code=504, detail="Build process timed out")
    except FileNotFoundError as e:
        logger.error(f"Build script not found: {e}")
        raise HTTPException(status_code=500, detail="Build script not found")
    except Exception as e:
        logger.error(f"Unexpected error during build: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Internal server error during build")

# ============================================================================
# Component Retrieval Endpoints
# ============================================================================

@app.get("/api/components", response_model=ComponentListResponse, tags=["Components"])
async def list_components(
    output_format: OutputFormat = Query(OutputFormat.list, description="Output format: list, json, or names")
):
    """
    List all available components
    
    Returns a list of all indexed React components (excluding utils/hooks).
    """
    try:
        logger.debug(f"Listing components with format: {output_format}")
        component_map, real_components = get_components_data()
        
        if not real_components:
            return ComponentListResponse(
                success=True,
                count=0,
                components=[]
            )
        
        # Format based on output_format
        if output_format == OutputFormat.names:
            components = [{"name": name} for name in real_components]
        else:
            components = [
                {
                    "name": name,
                    "file": component_map[name].get('file', ''),
                    "component_id": component_map[name].get('component_id', '')
                }
                for name in real_components
            ]
        
        logger.info(f"Found {len(real_components)} components")
        return ComponentListResponse(
            success=True,
            count=len(real_components),
            components=components
        )
        
    except FileNotFoundError as e:
        logger.error(f"Database not found: {e}")
        raise HTTPException(status_code=404, detail="Component database not found. Please build the index first.")
    except Exception as e:
        logger.error(f"Error listing components: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Internal server error while listing components")

@app.get("/api/components/{component_name}", response_model=ComponentDetailResponse, tags=["Components"])
async def get_component_by_name(component_name: str):
    """
    Get a specific component by exact name
    
    Returns the complete component with all files (component, interfaces, styles).
    """
    try:
        logger.debug(f"Fetching component: {component_name}")
        collection = queryer._get_collection()
        
        # Query ChromaDB for this specific component
        results = collection.get(
            where={"component_name": component_name},
            include=["metadatas", "documents"]
        )
        
        if not results['ids']:
            logger.warning(f"Component not found: {component_name}")
            raise HTTPException(
                status_code=404,
                detail=f"No component found with exact name: {component_name}"
            )
        
        # Convert to chunk format
        component_chunks = [
            {
                "chunk_type": meta.get("chunk_type"),
                "text": doc,
                "file": meta.get("file"),
                **meta
            }
            for meta, doc in zip(results['metadatas'], results['documents'])
        ]
        
        # Extract different parts
        basic_info = next((c for c in component_chunks if c.get("chunk_type") == "basic_info"), None)
        complete_component = next((c for c in component_chunks if c.get("chunk_type") == "complete_component"), None)
        component_source = next((c for c in component_chunks if c.get("chunk_type") == "component_source"), None)
        interfaces = next((c for c in component_chunks if c.get("chunk_type") == "interfaces"), None)
        styles = next((c for c in component_chunks if c.get("chunk_type") == "styles"), None)
        props = next((c for c in component_chunks if c.get("chunk_type") == "props"), None)
        
        logger.info(f"Successfully retrieved component: {component_name}")
        return ComponentDetailResponse(
            success=True,
            component_name=component_name,
            file=basic_info.get('file') if basic_info else None,
            complete_component=complete_component["text"] if complete_component else None,
            component_source=component_source["text"] if component_source else None,
            interfaces=interfaces["text"] if interfaces else None,
            styles=styles["text"] if styles else None,
            props=props["text"] if props else None
        )
        
    except HTTPException:
        raise
    except FileNotFoundError as e:
        logger.error(f"Database not found: {e}")
        raise HTTPException(status_code=404, detail="Component database not found. Please build the index first.")
    except Exception as e:
        logger.error(f"Error retrieving component {component_name}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Internal server error while retrieving component")

@app.post("/api/components/search", response_model=SearchResponse, tags=["Components"])
async def search_components(request: SearchRequest):
    """
    Semantic search for components
    
    Searches the component database using natural language queries.
    """
    try:
        logger.info(f"Searching components: query='{request.query}', k={request.k}")
        results = queryer.query_components(
            request.query,
            k=request.k,
            per_component=request.per_component
        )
        
        if not results:
            return SearchResponse(
                success=True,
                query=request.query,
                results=[]
            )
        
        # Format results
        formatted_results = [
            {
                "component_id": r["component_id"],
                "component_name": r["component_name"],
                "file": r["file"],
                "score": r["best_score"],
                "chunks": [
                    {
                        "text": chunk["text"],
                        "score": chunk["score"]
                    }
                    for chunk in r["top_chunks"]
                ]
            }
            for r in results
        ]
        
        logger.info(f"Search completed: found {len(formatted_results)} results")
        return SearchResponse(
            success=True,
            query=request.query,
            results=formatted_results
        )
        
    except FileNotFoundError as e:
        logger.error(f"Database not found: {e}")
        raise HTTPException(status_code=404, detail="Component database not found. Please build the index first.")
    except Exception as e:
        logger.error(f"Error searching components: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Internal server error during search")

# ============================================================================
# Run Server
# ============================================================================

if __name__ == "__main__":
    import uvicorn
    
    logger.info("🚀 Starting RAG Component API Server...")
    logger.info(f"📚 API Documentation: http://{settings.host}:{settings.port}/docs")
    logger.info(f"🔍 Alternative Docs: http://{settings.host}:{settings.port}/redoc")
    logger.info(f"⚙️  Environment: {'Development' if settings.reload else 'Production'}")
    logger.info("\nPress CTRL+C to stop the server\n")
    
    uvicorn.run(
        "api_server:app",
        host=settings.host,
        port=settings.port,
        reload=settings.reload,
        log_level=settings.log_level.lower()
    )
