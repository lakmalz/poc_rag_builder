COMMAND FOR SYSTEM FUNCTIONS
============================

## 0. INSTALLATION & SETUP
------------------------------------------

### 0.1 Install Node.js Dependencies
Install required packages for React code extraction:
    
    npm install

This installs:
    - glob: File pattern matching
    - react-docgen-typescript: React component parser
    - And other dependencies from package.json


### 0.2 Install Python Dependencies
Install required packages for chunking, indexing, and querying:
    
    pip3 install -r requirements.txt

This installs:
    - chromadb: Vector database
    - sentence-transformers: Embeddings model
    - typer: CLI framework
    - requests: HTTP client for LLM APIs
    - And other dependencies


### 0.3 Verify Installation
Check if all dependencies are installed correctly:
    
    node --version
    python3 --version
    pip3 list | grep chromadb
    pip3 list | grep sentence-transformers


## 1. FULL PIPELINE (Extract + Ingest + Index)
------------------------------------------

### Option A: Quick Build (Recommended)
Simple pipeline without versioning - perfect for iterative development:
    
    python3 build_index.py

This will:
    - Extract React components from source code
    - Chunk the extracted components
    - Index chunks into ChromaDB

Optional cleanup before build:
    
    python3 build_index.py --clean

Features:
    ✅ Simple and fast
    ✅ No validation overhead
    ✅ No versioning complexity
    ✅ Perfect for iterative development


### Option B: Full Build with Validation (Advanced)
Complete pipeline with validation and versioning:
    
    python3 rebuild_index.py

This will:
    - Extract React components from source code
    - Validate extraction results
    - Chunk the extracted components
    - Validate chunking output
    - Index chunks into ChromaDB
    - Validate indexing success
    - Archive successful builds with versioning

Features:
    ✅ Automatic validation at each step
    ✅ Version control for build outputs
    ✅ Rollback capability if validation fails
    ✅ Archive previous builds automatically


### Option C: Legacy Interactive Pipeline
Run complete pipeline with interactive query interface:
    
    python3 find_component.py

This will:
    - Extract React components from source code
    - Chunk the extracted components
    - Index chunks into ChromaDB
    - Launch interactive query interface


## 2. INDIVIDUAL STEPS
------------------------------------------

### 2.1 EXTRACT (React Code Extraction)
Extract React components from repository:
    
    node scripts/code_extractor.js

Output: build-index/component_docs.json


### 2.2 INGEST & CHUNK
Chunk extracted components into searchable pieces:
    
    python3 ingest_components.py

Output: build-index/component_chunks.json


### 2.3 INDEX (Store in ChromaDB)
Index chunks into vector database:
    
    python3 index_components.py

Output: build-index/chromadb/


## 3. QUERY COMMANDS
------------------------------------------

### 3.1 GET COMPONENT LIST

#### List format (numbered, with file paths):
    python3 query_cli.py list-components
    # OR
    python3 query_cli.py list-components --output-format list

Output:
    Found 2 component(s):
    [1] ProfilePage                    (components/ProfilePage/ProfilePage.component.tsx)
    [2] CustomDropdown                 (components/CustomDropdown/CustomDropdown.component.tsx)


#### JSON format (structured data):
    python3 query_cli.py list-components --output-format json

Output:
    [
      {
        "name": "ProfilePage",
        "file": "src/components/ProfilePage/ProfilePage.component.tsx",
        "component_id": "ProfilePage"
      },
      {
        "name": "CustomDropdown",
        "file": "src/components/CustomDropdown/CustomDropdown.component.tsx",
        "component_id": "CustomDropdown"
      }
    ]


#### Names only (simple list):
    python3 query_cli.py list-components --output-format names

Output:
    ProfilePage
    CustomDropdown


### 3.2 GET COMPONENT CODE BY NAME

Retrieve complete component with all files (component, interfaces, styles):
    
    python3 query_cli.py get-component-exact ProfilePage

Output:
    📦 Component: ProfilePage
    📁 File: src/components/ProfilePage/ProfilePage.component.tsx
    
    ✅ Complete Component (All Files):
    ================================================================================
    COMPONENT (ProfilePage.component.tsx):
    ```tsx
    import React, { useState } from "react";
    ...full component code...
    export default ProfilePage;
    ```
    
    INTERFACES & TYPES (ProfilePage.interface.ts):
    ```typescript
    export interface ProfilePageProps {
      user: UserProfile;
      onAccept?: (form: UserProfile) => void;
      ...
    }
    ```
    
    STYLES (ProfilePage.style.ts):
    ```typescript
    const useProfilePageStyles = makeStyles({...});
    ```
    ================================================================================


### 3.3 SEMANTIC SEARCH

Search for components using natural language:
    
    python3 query_cli.py query-find-component "user profile form with edit mode" --k 5


## 4. INTERACTIVE MODE
------------------------------------------
Interactive component browser with selection menu:
    
    python3 find_component.py

Features:
    - Lists all components
    - Select by number
    - View complete component code
    - Semantic search option ('s' key)


## 5. CONFIGURATION
------------------------------------------

### 5.1 Configure Extraction
Edit what gets extracted:
    
    config/extraction.config.js

Settings:
    - repository.root: "web-extensions"
    - files.include: ["js", "jsx", "ts", "tsx"]
    - files.exclude: ["**/node_modules/**", "**/tests/**"]
    - files.includeOnly: ["src/components/**"]  # Optional filter


### 5.2 Configure Chunking
Edit how components are chunked:
    
    config/chunking.config.py

Settings:
    - CHUNKING_CONFIG.chunk_types
    - CHUNKING_CONFIG.max_chunk_size
    - INDEXING_CONFIG.batch_size


## 6. REBUILD INDEX
------------------------------------------
Clear and rebuild the entire index:
    
    rm -rf build-index/
    python3 find_component.py


## QUICK REFERENCE
------------------------------------------
| Task                          | Command                                                |
|-------------------------------|--------------------------------------------------------|
| Full pipeline                 | python3 find_component.py                              |
| Extract only                  | node scripts/code_extractor.js                         |
| List components (list)        | python3 query_cli.py list-components                   |
| List components (JSON)        | python3 query_cli.py list-components --output-format json |
| List components (names only)  | python3 query_cli.py list-components --output-format names |
| Get component by name         | python3 query_cli.py get-component-exact ProfilePage   |
| Search components             | python3 query_cli.py query-find-component "search term" |
| Interactive mode              | python3 find_component.py                              |
| Rebuild index                 | rm -rf build-index/ && python3 find_component.py       |