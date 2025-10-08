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
    componentDetectionThreshold: 3,
    
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
    ]
  },

  // ============================================
  // LOGGING & DEBUGGING
  // ============================================
  logging: {
    // Create backup of previous extraction
    createBackup: true
  }
};
