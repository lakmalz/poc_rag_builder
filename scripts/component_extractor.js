const fs = require("fs");
const path = require("path");
const glob = require("glob");
const reactDocgenTs = require("react-docgen-typescript");

class DebugComponentExtractor {
  static extractComponents() {
    const repoPath = path.join(__dirname, "..", "Custom-ui", "src", "components");
    const outFile = path.join(__dirname, "..", "build-index", "component_docs.json");
    
    if (fs.existsSync(outFile)) {
      console.log(`Component docs already exist at ${outFile}, skipping extraction.`);
      return;
    }

    console.log(`\n🔍 Starting extraction from: ${repoPath}`);
    console.log(`📁 Repository exists: ${fs.existsSync(repoPath)}`);

    const components = [];
    const debugInfo = {
      processedFiles: [],
      skippedFiles: [],
      detectionResults: [],
      errors: []
    };

    // Get all files with better glob pattern
    const files = glob.sync(path.join(repoPath, "**/*.{js,jsx,ts,tsx}"), {
      ignore: [
        '**/node_modules/**',
        '**/dist/**',
        '**/build/**',
        '**/*.test.*',
        '**/*.spec.*',
        '**/*.d.ts'
      ]
    });

    console.log(`📄 Found ${files.length} files to process`);
    files.slice(0, 5).forEach(f => console.log(`   - ${path.relative(process.cwd(), f)}`));
    if (files.length > 5) console.log(`   ... and ${files.length - 5} more`);

    // Enhanced parser configuration
    const parser = reactDocgenTs.withCustomConfig(
      path.join(__dirname, "..", "Custom-ui", "tsconfig.json"), 
      {
        savePropValueAsString: true,
        shouldExtractLiteralValuesFromEnum: true,
        shouldRemoveUndefinedFromOptional: true,
        shouldIncludePropTagMap: true,
        shouldExtractValuesFromUnion: true,
        propFilter: (prop, component) => {
          if (prop.parent) {
            return !prop.parent.fileName.includes('node_modules');
          }
          return true;
        },
        componentNameResolver: (exp, source) => {
          return exp.getName();
        }
      }
    );

    let skippedNoExports = 0;
    let skippedNonComponents = 0;
    let processedFiles = 0;

    function getComponentName(doc, file) {
      if (doc.displayName) return doc.displayName;
      if (doc.name && doc.name !== "default") return doc.name;
      
      const ext = path.extname(file).toLowerCase();
      const baseName = path.basename(file, ext);
      
      if (baseName.toLowerCase() === "index") {
        const parentDir = path.basename(path.dirname(file));
        return parentDir.charAt(0).toUpperCase() + parentDir.slice(1);
      }
      
      return baseName.charAt(0).toUpperCase() + baseName.slice(1);
    }

    function isReactComponent(fileContent, filePath) {
      const debugResult = {
        file: path.relative(process.cwd(), filePath),
        checks: {},
        isComponent: false,
        reason: '',
        detectedPatterns: []
      };

      // Check 1: Has React imports
      debugResult.checks.hasReactImports = fileContent.includes('import') && 
        (fileContent.includes('react') || fileContent.includes('React'));

      // Check 2: Has JSX/TSX return statements
      debugResult.checks.hasJSXReturn = /return\s*\(\s*</.test(fileContent) || 
                                        /return\s*</.test(fileContent) ||
                                        /=>\s*\(\s*</.test(fileContent) ||
                                        /=>\s*</.test(fileContent);

      // Check 3: Component declaration patterns
      const componentPatterns = [
        {
          name: 'exportedFunction',
          regex: /export\s+(?:default\s+)?function\s+[A-Z][a-zA-Z0-9_]*\s*\(/,
          test: (content) => /export\s+(?:default\s+)?function\s+[A-Z][a-zA-Z0-9_]*\s*\(/.test(content)
        },
        {
          name: 'exportedConst',
          regex: /export\s+(?:default\s+)?const\s+[A-Z][a-zA-Z0-9_]*\s*[=:]/,
          test: (content) => /export\s+(?:default\s+)?const\s+[A-Z][a-zA-Z0-9_]*\s*[=:]/.test(content)
        },
        {
          name: 'constComponent',
          regex: /const\s+[A-Z][a-zA-Z0-9_]*\s*[=:]/,
          test: (content) => /const\s+[A-Z][a-zA-Z0-9_]*\s*[=:]/.test(content)
        },
        {
          name: 'functionComponent',
          regex: /function\s+[A-Z][a-zA-Z0-9_]*\s*\(/,
          test: (content) => /function\s+[A-Z][a-zA-Z0-9_]*\s*\(/.test(content)
        },
        {
          name: 'forwardRef',
          regex: /forwardRef\s*[<(]/,
          test: (content) => /forwardRef\s*[<(]/.test(content)
        },
        {
          name: 'reactMemo',
          regex: /React\.memo\s*\(/,
          test: (content) => /React\.memo\s*\(/.test(content) || /memo\s*\(/.test(content)
        },
        {
          name: 'classComponent',
          regex: /class\s+[A-Z][a-zA-Z0-9_]*\s+extends/,
          test: (content) => /class\s+[A-Z][a-zA-Z0-9_]*\s+extends/.test(content)
        },
        {
          name: 'arrowFunction',
          regex: /[A-Z][a-zA-Z0-9_]*\s*=\s*\([^)]*\)\s*=>/,
          test: (content) => /[A-Z][a-zA-Z0-9_]*\s*=\s*\([^)]*\)\s*=>/.test(content)
        }
      ];

      componentPatterns.forEach(pattern => {
        if (pattern.test(fileContent)) {
          debugResult.detectedPatterns.push(pattern.name);
        }
      });

      debugResult.checks.hasComponentPattern = debugResult.detectedPatterns.length > 0;

      // Check 4: Has props interface/type
      debugResult.checks.hasPropsDefinition = /(?:interface|type)\s+\w*Props/i.test(fileContent) ||
                                              /Props\s*[=:]/i.test(fileContent);

      // Check 5: Has hooks usage
      const hookPatterns = ['useState', 'useEffect', 'useContext', 'useReducer', 'useCallback', 'useMemo', 'useRef'];
      debugResult.checks.hasHooks = hookPatterns.some(hook => fileContent.includes(hook));

      // Check 6: File extension check
      const ext = path.extname(filePath).toLowerCase();
      debugResult.checks.isValidExtension = ['.tsx', '.jsx', '.ts', '.js'].includes(ext);

      // Determine if it's a component
      const isComponent = debugResult.checks.isValidExtension && 
                         (debugResult.checks.hasJSXReturn || debugResult.checks.hasComponentPattern) &&
                         (debugResult.checks.hasReactImports || debugResult.checks.hasHooks || ext === '.tsx' || ext === '.jsx');

      debugResult.isComponent = isComponent;
      
      if (!isComponent) {
        if (!debugResult.checks.isValidExtension) {
          debugResult.reason = 'Invalid file extension';
        } else if (!debugResult.checks.hasJSXReturn && !debugResult.checks.hasComponentPattern) {
          debugResult.reason = 'No JSX return or component pattern found';
        } else if (!debugResult.checks.hasReactImports && !debugResult.checks.hasHooks && !['.tsx', '.jsx'].includes(ext)) {
          debugResult.reason = 'No React imports or hooks detected';
        }
      } else {
        debugResult.reason = 'Component detected successfully';
      }

      debugInfo.detectionResults.push(debugResult);
      return isComponent;
    }

    function extractPropsFromContent(fileContent, componentName) {
      const props = {};
      
      // Enhanced patterns for props extraction
      const propPatterns = [
        // Pattern 1: interface ComponentProps
        { 
          regex: new RegExp(`interface\\s+${componentName}Props\\s*(?:extends\\s+[^{]*)?\\s*\\{([^}]+)\\}`, 'gs'),
          name: 'interfaceProps'
        },
        { 
          regex: /interface\s+Props\s*(?:extends\s+[^{]*)?\\s*\\{([^}]+)\\}/gs,
          name: 'interfaceGeneric'
        },
        // Pattern 2: type definitions
        { 
          regex: new RegExp(`type\\s+${componentName}Props\\s*=\\s*\\{([^}]+)\\}`, 'gs'),
          name: 'typeProps'
        },
        { 
          regex: /type\s+Props\s*=\s*\\{([^}]+)\\}/gs,
          name: 'typeGeneric'
        },
        // Pattern 3: Export patterns
        { 
          regex: /export\s+type\s+Props\s*=\s*[^{]*\\{([^}]+)\\}/gs,
          name: 'exportType'
        },
        // Pattern 4: OverWrite and utility types
        { 
          regex: /export\s+type\s+Props\s*=\s*OverWrite<[^,]+,\s*\\{([^}]+)\\}\s*>/gs,
          name: 'overwriteType'
        }
      ];
      
      for (const pattern of propPatterns) {
        const match = pattern.regex.exec(fileContent);
        if (match && match[1]) {
          const propsContent = match[1];
          const extractedProps = parsePropsContent(propsContent);
          if (Object.keys(extractedProps).length > 0) {
            Object.assign(props, extractedProps);
            console.log(`   ✅ Props extracted using ${pattern.name}: ${Object.keys(extractedProps).length} props`);
            break;
          }
        }
      }
      
      return props;
    }

    function parsePropsContent(propsContent) {
      const props = {};
      
      // Handle nested braces and complex types
      const lines = propsContent.split(/[;\n]/).filter(line => line.trim());
      
      lines.forEach(line => {
        const trimmed = line.trim();
        if (!trimmed) return;
        
        // Match: propName?: type | propName: type
        const propMatch = trimmed.match(/^(\w+)(\?)?:\s*(.+?)(?:\s*\/\*\*(.+?)\*\/)?$/);
        if (propMatch) {
          const [, propName, isOptional, propType, comment] = propMatch;
          props[propName] = {
            name: propName,
            type: { name: propType.trim().replace(/[,;]$/, '') },
            required: !isOptional,
            description: comment?.trim() || generatePropDescription(propName, propType),
            defaultValue: null
          };
        }
      });
      
      return props;
    }

    function generatePropDescription(propName, propType) {
      const commonDescriptions = {
        'className': 'CSS class name for styling',
        'style': 'Inline styles object',
        'children': 'Child elements to render',
        'onClick': 'Click event handler',
        'onChange': 'Change event handler',
        'disabled': 'Whether the component is disabled',
        'loading': 'Whether the component is in loading state',
        'error': 'Error message or state',
        'value': 'Current value',
        'defaultValue': 'Default value',
        'placeholder': 'Placeholder text',
        'size': 'Size variant',
        'variant': 'Style variant'
      };
      
      return commonDescriptions[propName] || `${propName} property`;
    }

    function extractDefaultValues(fileContent, props) {
      // Look for destructured parameters with defaults
      const destructureRegex = /\\{\\s*([^}]+)\\s*\\}/g;
      const matches = [...fileContent.matchAll(destructureRegex)];
      
      matches.forEach(match => {
        const content = match[1];
        const assignments = content.split(',');
        
        assignments.forEach(assignment => {
          const defaultMatch = assignment.trim().match(/^(\\w+)\\s*=\\s*(.+)$/);
          if (defaultMatch) {
            const [, propName, defaultValue] = defaultMatch;
            if (props[propName]) {
              props[propName].defaultValue = {
                value: defaultValue.replace(/['"]/g, ''),
                computed: false
              };
            }
          }
        });
      });
      
      return props;
    }

    function extractComponentDescription(fileContent, componentName) {
      // JSDoc patterns
      const jsdocPatterns = [
        new RegExp(`\\/\\*\\*([\\s\\S]*?)\\*\\/\\s*(?:export\\s+)?(?:const|function|class)\\s+${componentName}`, 'i'),
        new RegExp(`\\/\\*\\*([\\s\\S]*?)\\*\\/\\s*const\\s+${componentName}\\s*=\\s*forwardRef`, 'i')
      ];
      
      for (const pattern of jsdocPatterns) {
        const match = pattern.exec(fileContent);
        if (match) {
          return match[1]
            .split('\\n')
            .map(line => line.replace(/^\\s*\\*?\\s?/, ''))
            .join(' ')
            .trim();
        }
      }
      
      // Generate description based on component analysis
      const hasForwardRef = fileContent.includes('forwardRef');
      const hasInput = fileContent.includes('<input') || fileContent.includes('input');
      const hasButton = fileContent.includes('<button') || fileContent.includes('button');
      const isModal = fileContent.includes('modal') || fileContent.includes('Modal');
      
      if (hasInput && hasForwardRef) return `A ${componentName.toLowerCase()} component with ref forwarding for form inputs.`;
      if (hasButton) return `A ${componentName.toLowerCase()} button component.`;
      if (isModal) return `A ${componentName.toLowerCase()} modal component.`;
      if (hasForwardRef) return `A ${componentName.toLowerCase()} component with ref forwarding support.`;
      
      return `A reusable ${componentName} component.`;
    }

    // Main processing loop
    files.forEach((file, index) => {
      processedFiles++;
      
      try {
        const fileContent = fs.readFileSync(file, "utf8");
        const relativePath = path.relative(process.cwd(), file);
        
        console.log(`\\n📄 Processing (${index + 1}/${files.length}): ${relativePath}`);
        
        // Check if it's a React component
        if (!isReactComponent(fileContent, file)) {
          console.log(`   ❌ Skipped: Not a React component`);
          debugInfo.skippedFiles.push({
            file: relativePath,
            reason: 'Not a React component'
          });
          skippedNoExports++;
          return;
        }
        
        console.log(`   ✅ Detected as React component`);
        debugInfo.processedFiles.push(relativePath);
        
        // Try automatic parsing first
        let docs = [];
        try {
          docs = parser.parse(file) || [];
          if (docs.length > 0) {
            console.log(`   🔧 Automatic parser found ${docs.length} component(s)`);
          }
        } catch (parseError) {
          console.log(`   ⚠️  Automatic parser failed: ${parseError.message}`);
        }
        
        if (!docs || docs.length === 0) {
          console.log(`   🛠️  Using manual extraction`);
          
          const componentName = getComponentName({}, file);
          let component = {
            id: `${file}::${componentName}`,
            name: componentName,
            file: path.relative(process.cwd(), file),
            props: {},
            description: "",
            raw: fileContent.slice(0, 4000),
            extractionMethod: 'manual'
          };
          
          // Extract props
          const extractedProps = extractPropsFromContent(fileContent, componentName);
          component.props = extractDefaultValues(fileContent, extractedProps);
          console.log(`   📋 Extracted ${Object.keys(component.props).length} props`);
          
          // Extract description
          component.description = extractComponentDescription(fileContent, componentName);
          console.log(`   📝 Description: ${component.description.substring(0, 50)}...`);
          
          components.push(component);
        } else {
          // Process automatic extraction results
          docs.forEach((doc) => {
            const nameCandidate = getComponentName(doc, file);
            const isComponent = /^[A-Z]/.test(nameCandidate);
            
            if (!isComponent) {
              skippedNonComponents++;
              return;
            }
            
            console.log(`   🔧 Processing automatic component: ${nameCandidate}`);
            
            let component = {
              id: `${file}::${nameCandidate}`,
              name: nameCandidate,
              file: path.relative(process.cwd(), file),
              props: doc.props || {},
              description: doc.description || "",
              raw: fileContent.slice(0, 4000),
              extractionMethod: 'automatic',
              exportName: doc.exportName,
              tags: doc.tags || {}
            };
            
            // Enhance with manual extraction if needed
            if (Object.keys(component.props).length === 0) {
              const extractedProps = extractPropsFromContent(fileContent, nameCandidate);
              component.props = extractDefaultValues(fileContent, extractedProps);
            }
            
            if (!component.description || component.description.length < 5) {
              component.description = extractComponentDescription(fileContent, nameCandidate);
            }
            
            console.log(`   📋 Final props count: ${Object.keys(component.props).length}`);
            components.push(component);
          });
        }
        
      } catch (err) {
        console.error(`   ❌ Error processing ${file}:`, err.message);
        debugInfo.errors.push({
          file: path.relative(process.cwd(), file),
          error: err.message
        });
      }
    });

    // Sort and generate output
    components.sort((a, b) => a.name.localeCompare(b.name));

    const summary = {
      totalFiles: processedFiles,
      totalComponents: components.length,
      componentsWithProps: components.filter(c => Object.keys(c.props || {}).length > 0).length,
      componentsWithDescription: components.filter(c => c.description && c.description.length > 10).length,
      skippedNoExports,
      skippedNonComponents,
      extractionMethods: {
        automatic: components.filter(c => c.extractionMethod === 'automatic').length,
        manual: components.filter(c => c.extractionMethod === 'manual').length
      }
    };

    const output = {
      metadata: {
        generatedAt: new Date().toISOString(),
        extractorVersion: '3.1.0-debug',
        repository: path.basename(process.cwd()),
        summary,
        debug: debugInfo
      },
      components
    };

    fs.writeFileSync(outFile, JSON.stringify(output, null, 2));
    
    console.log(`\\n=== 📊 EXTRACTION SUMMARY ===`);
    console.log(`📁 Processed files: ${summary.totalFiles}`);
    console.log(`⚛️  Extracted components: ${summary.totalComponents}`);
    console.log(`📋 Components with props: ${summary.componentsWithProps}`);
    console.log(`📝 Components with descriptions: ${summary.componentsWithDescription}`);
    console.log(`🔧 Automatic extraction: ${summary.extractionMethods.automatic}`);
    console.log(`🛠️  Manual extraction: ${summary.extractionMethods.manual}`);
    console.log(`❌ Skipped files: ${summary.skippedNoExports}`);
    console.log(`\\n📄 Output: ${outFile}`);
    
    // Show detection results summary
    console.log(`\\n=== 🔍 DETECTION ANALYSIS ===`);
    const detectedComponents = debugInfo.detectionResults.filter(r => r.isComponent);
    const skippedComponents = debugInfo.detectionResults.filter(r => !r.isComponent);
    
    console.log(`✅ Files detected as components: ${detectedComponents.length}`);
    console.log(`❌ Files skipped: ${skippedComponents.length}`);
    
    if (skippedComponents.length > 0 && skippedComponents.length < 10) {
      console.log(`\\nSkipped files reasons:`);
      skippedComponents.forEach(item => {
        console.log(`   - ${item.file}: ${item.reason}`);
      });
    }
    
    if (detectedComponents.length > 0) {
      console.log(`\\nDetected components:`);
      detectedComponents.slice(0, 5).forEach(item => {
        console.log(`   ✅ ${item.file} (patterns: ${item.detectedPatterns.join(', ') || 'JSX return'})`);
      });
    }
  }
}

DebugComponentExtractor.extractComponents();