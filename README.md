# GIT custom-ui repo
# https://github.com/Ricy137/Custom-ui/tree/main

# Packages (REACT)
# npm init -y
# npm install react-docgen glob

# Packages (PYTHON)
# pip install sentence-transformers numpy typer tqdm

# For embedding
# pip install -U sentence-transformers

# Ex:
# code run
    node scripts/code_extractor.js - Extract raw React component info from .tsx/.jsx files.
    output - (Make sure the file created-"component_docs.json") - Raw structured component metadata from Node extractor.

    python3 ingest_components.py - Chunk components (description, props, code) for embeddings.
    output - component_chunks.json - Chunked text ready for embeddings.

    index_components.py - Create vector embeddings, store metadata in Chromadb.
    output - chromaDB and 

    CLI tool to query index and retrieve component info.
    
    command: python3 query_cli.py query "How do I create a button component?" --k 5 --per-component 10
    --k 5: This means "return the top 5 most relevant results" for your query
    --per-component 10: This means "for each component, return up to 10 code snippets or chunks."


[React repo] 
     ↓ (Node extractor)
component_docs.json 
     ↓ (Python ingestion & chunking)
component_chunks.json 
     ↓ (Embedding + index and store in chromadb)
chromadb
     ↓ (Query CLI)
Retrieve relevant components and snippets


sample questions to test.

Here are some example queries you can use to test your system:

"How do I create a modal dialog?"
"Show me code for a tooltip component."
"What props does the Select component accept?"
"How can I use the Tabs component in my app?"
"Give me an example of a form with validation."
"How do I customize the Pagination component?"
"Show code for a responsive dropdown menu."
"How do I implement a toast notification?"
"What is the structure of the PinForm component?"
"How do I add icons to a button?"

special:
Can you give me the sample button implementation

Can you give me the example for CustomDropdown implementation

Can you give me the example implementaion for CustomDropDown

How do I use the ProfilePage component is a React page? Please iclude all props with example values


put into (tsconfig.json)

 "include": [
     "next-env.d.ts", 
     "**/*.ts", 
     "**/*.tsx", 
     "**/*.interface.js", 
     "**/*.interface.ts", 
     "**/*.style.ts", 
     ".next/types/**/*.ts",
     "src/types/*",
     ],

 "exclude": ["node_modules"]


 ## AI Assistant Guidelines
- No automatic .md file creation
- Ask before creating new files

## Should have to keep this extensions in the `tsconfig.json`
     "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", "**/*.interface.js", "**/*.interface.ts", "**/*.style.ts", ".next/types/**/*.ts","src/types/*",],
     "exclude": [
          "node_modules",
          "tests",
          "test",
          "__tests__",
          "**/*.test.ts",
          "**/*.test.tsx",
          "**/*.spec.ts",
          "**/*.spec.tsx",
          "dist",
          "build",
          ".next",
          "out",
          "coverage"