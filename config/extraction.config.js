/**
 * RAG Component Extraction Configuration
 * 
 * This file controls what gets extracted, chunked, and indexed into the database.
 * Easy to modify without touching the core extraction logic.
 */

module.exports = {
  
  // ============================================
  // REPOSITORY SETTINGS
  // ============================================
  repository: {
    // Root directory to extract from (relative to project root)
    root: "web-extensions",
    
    // Output directory for extracted data
    buildDir: "build-index"
  },

  // ============================================
  // FILE PATTERNS
  // ============================================
  files: {
    // File extensions to process
    include: [
      "js",
      "jsx",
      "ts",
      "tsx"
    ],
    
    // Directories to EXCLUDE from extraction
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/build/**',
      '**/coverage/**',
      '**/.next/**',
      '**/.nuxt/**',
      '**/out/**',
      '**/public/**',
      '**/*.test.*',
      '**/*.spec.*',
      '**/*.stories.*',
      '**/*.d.ts',
      '**/cypress/**',
      '**/e2e/**',
      '**/__tests__/**',
      '**/__mocks__/**',
      '**/tests/**',
      '**/test/**',
      '**/storybook-static/**',
      '**/.git/**',
      '**/.vscode/**',
      '**/temp/**',
      '**/tmp/**'
    ],
    
    // Directories to INCLUDE (if you want to limit extraction to specific dirs)
    // Leave empty [] to extract from all directories
    includeOnly: [
      // Extract only from components directory:
      'src/components/**'
      
      // Or use these patterns to include multiple directories:
      // 'src/components/**',
      // 'src/app/**',
      // 'src/hooks/**'
    ]
  },

  // ============================================
  // SMART AGGREGATION PATTERNS
  // ============================================
  aggregation: {
    // Enable/disable Smart Aggregation
    enabled: true,
    
    // Component file patterns
    patterns: {
      // Main component file (REQUIRED for aggregation)
      component: /\.component\.(tsx|jsx)$/,
      
      // Interface/Types files (OPTIONAL)
      interface: /\.(interface|types)\.(ts|tsx)$/,
      
      // Style files (OPTIONAL)
      style: /\.(style|styles)\.(ts|tsx|js|css|scss)$/,
      
      // Index/Export files (OPTIONAL)
      index: /^index\.(ts|tsx|js|jsx)$/
    },
    
    // Should index.ts files be aggregated in ANY directory?
    // true = aggregate index.ts everywhere
    // false = only aggregate index.ts in component directories
    aggregateIndexEverywhere: true
  },

  // ============================================
  // COMPONENT DETECTION
  // ============================================
  detection: {
    // Minimum confidence score to consider file as a component
    // Lower = more permissive, Higher = more strict
    confidenceThreshold: 3,
    
    // Component directory patterns (used for scoring)
    componentDirs: [
      'components?',
      'ui',
      'widgets',
      'elements',
      'views',
      'pages',
      'layouts',
      'features'
    ],
    
    // React hook patterns
    hooks: [
      'useState',
      'useEffect',
      'useContext',
      'useReducer',
      'useCallback',
      'useMemo',
      'useRef',
      'useImperativeHandle',
      'useLayoutEffect',
      'useDebugValue',
      'useDeferredValue',
      'useTransition'
    ]
  },

  // ============================================
  // EXTRACTION SETTINGS
  // ============================================
  extraction: {
    // Skip standalone index.ts/tsx files (they're usually just re-exports)
    skipStandaloneIndexFiles: true,
    
    // Include full source code in extracted data
    includeFullSourceCode: true,
    
    // Maximum source code size per component (characters)
    // Set to 0 for unlimited
    maxSourceCodeSize: 0,
    
    // Extract interfaces from separate .interface.ts files
    extractInterfaces: true,
    
    // Extract styles from separate .style.ts files
    extractStyles: true,
    
    // Extract TypeScript types
    extractTypes: true,
    
    // Extract enums
    extractEnums: true
  },

  // ============================================
  // CHUNKING SETTINGS
  // ============================================
  chunking: {
    // Enable different chunk types
    chunkTypes: {
      // Basic metadata chunk
      basicInfo: true,
      
      // Component props information
      props: true,
      
      // Full source code
      fullSource: true,
      
      // Complete component (all files combined) - for aggregated components
      completeComponent: true,
      
      // Individual component source (just .component.tsx)
      componentSource: true,
      
      // Interfaces and types
      interfaces: true,
      
      // Styles
      styles: true,
      
      // Searchable code snippets
      codeSnippets: true
    },
    
    // Code snippet settings
    snippets: {
      // Minimum lines for a code snippet
      minLines: 3,
      
      // Maximum lines per snippet
      maxLines: 20,
      
      // Overlap between snippets (lines)
      overlap: 2
    },
    
    // Chunk size limits (characters)
    maxChunkSize: {
      basicInfo: 2000,
      props: 3000,
      completeComponent: 50000,  // Large for aggregated components
      componentSource: 10000,
      interfaces: 5000,
      styles: 5000,
      codeSnippet: 1500
    }
  },

  // ============================================
  // INDEXING SETTINGS
  // ============================================
  indexing: {
    // ChromaDB collection name
    collectionName: "component_docs",
    
    // Embedding model
    embeddingModel: "all-MiniLM-L6-v2",
    
    // Batch size for indexing
    batchSize: 100,
    
    // Index only changed files (incremental indexing)
    incrementalMode: false,
    
    // Clear database before indexing
    clearBeforeIndex: false
  },

  // ============================================
  // LOGGING & DEBUGGING
  // ============================================
  logging: {
    // Verbosity level: 'minimal', 'normal', 'verbose', 'debug'
    level: 'normal',
    
    // Show component detection details
    showDetectionDetails: false,
    
    // Show props extraction debug info
    showPropsDebug: false,
    
    // Log extraction statistics
    showStatistics: true,
    
    // Create backup of previous extraction
    createBackup: true
  },

  // ============================================
  // ADVANCED SETTINGS
  // ============================================
  advanced: {
    // Use TypeScript parser if tsconfig.json exists
    useTypeScriptParser: true,
    
    // Parser timeout (ms)
    parserTimeout: 5000,
    
    // Retry failed extractions
    retryOnError: true,
    
    // Maximum retries
    maxRetries: 2,
    
    // Parallel processing
    enableParallelProcessing: false,
    
    // Number of workers for parallel processing
    workers: 4
  }
};
