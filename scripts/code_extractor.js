const fs = require("fs");
const path = require("path");
const glob = require("glob");
const reactDocgenTs = require("react-docgen-typescript");

class RepositoryWideExtractor {
  static extractComponents() {
    // Extract from entire repository, not just components folder
    const repoRoot = path.join(__dirname, "..", "Custom-ui");
    const outFile = path.join(__dirname, "..", "build-index", "component_docs.json");
    
    // If output file exists, skip extraction
    if (fs.existsSync(outFile)) {
      console.log(`⚠️ Output file already exists: ${outFile}`);
      console.log('⏩ Skipping extraction. Delete the file to regenerate.');
      return;
    }

    console.log(`\n🔍 Starting repository-wide extraction from: ${repoRoot}`);
    console.log(`📁 Repository exists: ${fs.existsSync(repoRoot)}`);

    const components = [];
    const debugInfo = {
      processedFiles: [],
      skippedFiles: [],
      detectionResults: [],
      errors: [],
      directoryStats: {}
    };

    // Scan entire repository with comprehensive patterns
    const files = glob.sync(path.join(repoRoot, "**/*.{js,jsx,ts,tsx}"), {
      ignore: [
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
        '**/storybook-static/**'
      ]
    });

    console.log(`📄 Found ${files.length} React/TypeScript files across the repository`);
    
    // Analyze directory distribution
    const dirStats = {};
    files.forEach(file => {
      const relativePath = path.relative(repoRoot, file);
      const dir = path.dirname(relativePath);
      const topLevelDir = dir.split(path.sep)[0] || 'root';
      dirStats[topLevelDir] = (dirStats[topLevelDir] || 0) + 1;
    });
    
    console.log(`\n📊 File distribution by directory:`);
    Object.entries(dirStats).forEach(([dir, count]) => {
      console.log(`   📁 ${dir}: ${count} files`);
    });
    debugInfo.directoryStats = dirStats;

    // Show sample files from different directories
    console.log(`\n📋 Sample files to be processed:`);
    const sampleFiles = files.slice(0, 10);
    sampleFiles.forEach(f => console.log(`   - ${path.relative(repoRoot, f)}`));
    if (files.length > 10) console.log(`   ... and ${files.length - 10} more files`);

    // Enhanced parser configuration
    let parser;
    try {
      const tsConfigPath = path.join(repoRoot, "tsconfig.json");
      if (fs.existsSync(tsConfigPath)) {
        console.log(`\n⚙️ Using TypeScript config: ${tsConfigPath}`);
        parser = reactDocgenTs.withCustomConfig(tsConfigPath, {
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
        });
      } else {
        console.log(`\n⚙️ No tsconfig.json found, using default parser`);
        parser = reactDocgenTs.parse;
      }
    } catch (error) {
      console.log(`\n⚠️ Parser setup failed, using default: ${error.message}`);
      parser = reactDocgenTs.parse;
    }

    let skippedNoExports = 0;
    let skippedNonComponents = 0;
    let processedFiles = 0;

    function getComponentName(doc, file) {
      if (doc.displayName) return doc.displayName;
      if (doc.name && doc.name !== "default") return doc.name;
      
      const ext = path.extname(file).toLowerCase();
      const baseName = path.basename(file, ext);
      
      // Handle index files by using parent directory name
      if (baseName.toLowerCase() === "index") {
        const parentDir = path.basename(path.dirname(file));
        return parentDir.charAt(0).toUpperCase() + parentDir.slice(1);
      }
      
      // Handle page files (Next.js, Nuxt.js patterns)
      if (baseName.toLowerCase().includes('page') || file.includes('/pages/')) {
        return baseName.charAt(0).toUpperCase() + baseName.slice(1).replace(/page$/i, 'Page');
      }
      
      // Handle layout files
      if (baseName.toLowerCase().includes('layout')) {
        return baseName.charAt(0).toUpperCase() + baseName.slice(1).replace(/layout$/i, 'Layout');
      }
      
      return baseName.charAt(0).toUpperCase() + baseName.slice(1);
    }

    function isReactComponent(fileContent, filePath) {
      const debugResult = {
        file: path.relative(repoRoot, filePath),
        checks: {},
        isComponent: false,
        reason: '',
        detectedPatterns: [],
        confidence: 0
      };

      // Check 1: File extension
      const ext = path.extname(filePath).toLowerCase();
      debugResult.checks.isValidExtension = ['.tsx', '.jsx', '.ts', '.js'].includes(ext);
      if (!debugResult.checks.isValidExtension) {
        debugResult.reason = 'Invalid file extension';
        return debugResult;
      }

      // Check 2: React/JSX indicators
      debugResult.checks.hasReactImports = 
        /import.*react/i.test(fileContent) ||
        /import.*React/i.test(fileContent) ||
        /from\s+['"]react['"]/i.test(fileContent);

      // Check 3: JSX patterns
      debugResult.checks.hasJSXReturn = 
        /return\s*\(\s*</.test(fileContent) ||
        /return\s*</.test(fileContent) ||
        /=>\s*\(\s*</.test(fileContent) ||
        /=>\s*</.test(fileContent) ||
        /<[A-Z]/.test(fileContent) ||
        /<\/[a-zA-Z]/.test(fileContent);

      // Check 4: Component declaration patterns
      const componentPatterns = [
        {
          name: 'exportedFunction',
          regex: /export\s+(?:default\s+)?function\s+[A-Z][a-zA-Z0-9_]*\s*\(/,
          weight: 3
        },
        {
          name: 'exportedConst',
          regex: /export\s+(?:default\s+)?const\s+[A-Z][a-zA-Z0-9_]*\s*[=:]/,
          weight: 3
        },
        {
          name: 'constComponent',
          regex: /const\s+[A-Z][a-zA-Z0-9_]*\s*[=:]/,
          weight: 2
        },
        {
          name: 'functionComponent',
          regex: /function\s+[A-Z][a-zA-Z0-9_]*\s*\(/,
          weight: 2
        },
        {
          name: 'forwardRef',
          regex: /forwardRef\s*[<(]/,
          weight: 4
        },
        {
          name: 'reactMemo',
          regex: /(React\.memo|memo)\s*\(/,
          weight: 4
        },
        {
          name: 'classComponent',
          regex: /class\s+[A-Z][a-zA-Z0-9_]*\s+extends\s+(React\.)?(Component|PureComponent)/,
          weight: 4
        },
        {
          name: 'arrowFunction',
          regex: /[A-Z][a-zA-Z0-9_]*\s*=\s*\([^)]*\)\s*=>/,
          weight: 2
        },
        {
          name: 'defaultExportArrow',
          regex: /export\s+default\s*\([^)]*\)\s*=>/,
          weight: 3
        }
      ];

      let totalWeight = 0;
      componentPatterns.forEach(pattern => {
        if (pattern.regex.test(fileContent)) {
          debugResult.detectedPatterns.push(pattern.name);
          totalWeight += pattern.weight;
        }
      });
      const relativeFilePath = debugResult.file;

      debugResult.checks.hasComponentPattern = debugResult.detectedPatterns.length > 0;
      debugResult.confidence = totalWeight;

      // Check 5: Props definitions
      debugResult.checks.hasPropsDefinition = 
        /(?:interface|type)\s+\w*Props/i.test(fileContent) ||
        /Props\s*[=:]/i.test(fileContent) ||
        /\{\s*\w+[,}]/.test(fileContent); // destructured props

      // Check 6: Hook usage
      const hookPatterns = [
        'useState', 'useEffect', 'useContext', 'useReducer', 
        'useCallback', 'useMemo', 'useRef', 'useImperativeHandle',
        'useLayoutEffect', 'useDebugValue', 'useDeferredValue', 'useTransition'
      ];
      debugResult.checks.hasHooks = hookPatterns.some(hook => 
        new RegExp(`\\b${hook}\\b`).test(fileContent)
      );

      // Check 7: File location hints
      debugResult.checks.isInComponentDir = 
        /\/(components?|ui|widgets|elements|views|pages|layouts)\//i.test(relativeFilePath);

      // Check 8: TSX/JSX files are more likely to be components
      debugResult.checks.isJSXFile = ['.tsx', '.jsx'].includes(ext);

      // Decision logic with scoring
      let score = 0;
      
      if (debugResult.checks.hasJSXReturn) score += 3;
      if (debugResult.checks.hasReactImports) score += 2;
      if (debugResult.checks.hasComponentPattern) score += totalWeight;
      if (debugResult.checks.hasPropsDefinition) score += 1;
      if (debugResult.checks.hasHooks) score += 2;
      if (debugResult.checks.isInComponentDir) score += 1;
      if (debugResult.checks.isJSXFile) score += 1;

      // Special cases
      const isUtilFile = /\/(utils?|helpers?|constants?|types?|interfaces?)\//i.test(filePath);
      const isConfigFile = /\.(config|setup|test)\./i.test(filePath);
      const isHookFile = /use[A-Z]/.test(path.basename(filePath));
      
      if (isUtilFile && !debugResult.checks.hasJSXReturn) score -= 2;
      if (isConfigFile) score -= 3;
      if (isHookFile && debugResult.checks.hasHooks && !debugResult.checks.hasJSXReturn) {
        // Custom hooks - still valuable but different category
        score += 1;
      }

      debugResult.confidence = score;
      debugResult.isComponent = score >= 3; // Threshold for component detection

      if (!debugResult.isComponent) {
        if (score === 0) {
          debugResult.reason = 'No React patterns detected';
        } else if (score < 3) {
          debugResult.reason = `Low confidence score: ${score} (threshold: 3)`;
        } else if (isUtilFile) {
          debugResult.reason = 'Utility file without JSX';
        } else if (isConfigFile) {
          debugResult.reason = 'Configuration file';
        }
      } else {
        debugResult.reason = `Component detected with confidence score: ${score}`;
      }

      debugInfo.detectionResults.push(debugResult);
      return debugResult.isComponent;
    }

    function extractPropsFromContent(fileContent, componentName) {
      const props = {};
      
      // Enhanced patterns for props extraction
      const propPatterns = [
        // Interface patterns
        { 
          regex: new RegExp(`interface\\s+${componentName}Props\\s*(?:extends\\s+[^{]*)?\\s*{([^}]+)}`, 'gs'),
          name: 'interfaceComponentProps'
        },
        { 
          regex: /interface\s+Props\s*(?:extends\s+[^{]*)?\\s*{([^}]+)}/gs,
          name: 'interfaceProps'
        },
        { 
          regex: new RegExp(`interface\\s+I${componentName}\\s*(?:extends\\s+[^{]*)?\\s*{([^}]+)}`, 'gs'),
          name: 'interfaceIComponent'
        },
        // Type patterns
        { 
          regex: new RegExp(`type\\s+${componentName}Props\\s*=\\s*{([^}]+)}`, 'gs'),
          name: 'typeComponentProps'
        },
        { 
          regex: /type\s+Props\s*=\s*{([^}]+)}/gs,
          name: 'typeProps'
        },
        // Export patterns
        { 
          regex: /export\s+type\s+Props\s*=\s*[^{]*{([^}]+)}/gs,
          name: 'exportTypeProps'
        },
        // Utility type patterns
        { 
          regex: /export\s+type\s+Props\s*=\s*OverWrite<[^,]+,\\s*{([^}]+)}\\s*>/gs,
          name: 'overwriteProps'
        },
        {
          regex: /type\s+Props\s*=\s*Omit<[^,]+,\\s*[^>]+>\\s*&\\s*{([^}]+)}/gs,
          name: 'omitProps'
        },
        {
          regex: /type\s+Props\s*=\s*[^{]*&\\s*{([^}]+)}/gs,
          name: 'intersectionProps'
        }
      ];
      
      for (const pattern of propPatterns) {
        const match = pattern.regex.exec(fileContent);
        if (match && match[1]) {
          const propsContent = match[1];
          const extractedProps = parsePropsContent(propsContent);
          if (Object.keys(extractedProps).length > 0) {
            Object.assign(props, extractedProps);
            console.log(`      ✅ Props extracted using ${pattern.name}: ${Object.keys(extractedProps).length} props`);
            break;
          }
        }
      }
      
      // Fallback: extract from function parameters
      if (Object.keys(props).length === 0) {
        const paramProps = extractPropsFromParameters(fileContent);
        if (Object.keys(paramProps).length > 0) {
          Object.assign(props, paramProps);
          console.log(`      ✅ Props extracted from parameters: ${Object.keys(paramProps).length} props`);
        }
      }
      
      return props;
    }

    function extractPropsFromParameters(fileContent) {
      const props = {};
      
      // Extract from destructured parameters
      const destructurePatterns = [
        /{\\s*([^}]+)\\s*}\\s*:/g, // { prop1, prop2 }: Props
        /\\(\\s*{\\s*([^}]+)\\s*}[^)]*\\)/g // ({ prop1, prop2 })
      ];
      
      destructurePatterns.forEach(pattern => {
        const matches = [...fileContent.matchAll(pattern)];
        matches.forEach(match => {
          const propsContent = match[1];
          if (propsContent) {
            const propNames = propsContent.split(',').map(p => p.trim().split(/[=:]/)[0].trim());
            propNames.forEach(propName => {
              if (propName && /^[a-zA-Z_$]/.test(propName)) {
                props[propName] = {
                  name: propName,
                  type: { name: 'any' },
                  required: true,
                  description: generatePropDescription(propName, 'any'),
                  defaultValue: null
                };
              }
            });
          }
        });
      });
      
      return props;
    }

    function parsePropsContent(propsContent) {
      const props = {};
      
      // Handle multi-line props with proper brace matching
      let depth = 0;
      let current = '';
      const propDefinitions = [];
      
      for (let i = 0; i < propsContent.length; i++) {
        const char = propsContent[i];
        
        if (char === '{' || char === '<' || char === '(') depth++;
        if (char === '}' || char === '>' || char === ')') depth--;
        
        if ((char === ';' || char === '\\n' || char === ',') && depth === 0) {
          if (current.trim()) {
            propDefinitions.push(current.trim());
            current = '';
          }
        } else {
          current += char;
        }
      }
      
      if (current.trim()) {
        propDefinitions.push(current.trim());
      }
      
      propDefinitions.forEach(definition => {
        // Match: propName?: type | propName: type
        const propMatch = definition.match(/^(\w+)(\?)?:\s*(.+?)(?:\s*\/\*\*(.+?)\*\/)?$/);
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
        'onSubmit': 'Submit event handler',
        'onFocus': 'Focus event handler',
        'onBlur': 'Blur event handler',
        'disabled': 'Whether the component is disabled',
        'loading': 'Loading state indicator',
        'error': 'Error message or error state',
        'value': 'Current value of the component',
        'defaultValue': 'Default value',
        'placeholder': 'Placeholder text',
        'id': 'Unique identifier',
        'name': 'Form field name',
        'type': 'Input type or variant',
        'size': 'Size variant (small, medium, large)',
        'variant': 'Visual style variant',
        'color': 'Color theme or variant',
        'title': 'Title text or tooltip',
        'label': 'Label text',
        'description': 'Description or help text',
        'icon': 'Icon component or icon name',
        'visible': 'Visibility state',
        'open': 'Open/closed state',
        'selected': 'Selection state',
        'active': 'Active state',
        'href': 'Link URL',
        'target': 'Link target attribute'
      };
      
      if (commonDescriptions[propName]) {
        return commonDescriptions[propName];
      }
      
      // Generate based on naming patterns
      if (propName.startsWith('on') && propName.length > 2) {
        return `Event handler for ${propName.slice(2).toLowerCase()}`;
      }
      if (propName.startsWith('is') || propName.startsWith('has')) {
        return `Boolean flag indicating ${propName.slice(2).toLowerCase()}`;
      }
      if (propName.includes('Color') || propName.includes('colour')) {
        return `Color value for ${propName}`;
      }
      if (propName.includes('Size')) {
        return `Size specification for ${propName}`;
      }
      
      // Generate based on type
      const lowerType = propType.toLowerCase();
      if (lowerType.includes('boolean')) return `Boolean flag for ${propName}`;
      if (lowerType.includes('string')) return `String value for ${propName}`;
      if (lowerType.includes('number')) return `Numeric value for ${propName}`;
      if (lowerType.includes('function') || lowerType.includes('=>')) return `Callback function for ${propName}`;
      if (lowerType.includes('react') || lowerType.includes('element')) return `React element for ${propName}`;
      if (lowerType.includes('|')) return `Union type value for ${propName}`;
      
      return `Property: ${propName}`;
    }

    function extractDefaultValues(fileContent, props) {
      // Extract default values from various patterns
      const patterns = [
        // Destructured parameters with defaults
        /{\\s*([^}]+)\\s*}/g,
        // Function parameters
        /\\(\\s*{\\s*([^}]+)\\s*}[^)]*\\)/g
      ];
      
      patterns.forEach(pattern => {
        const matches = [...fileContent.matchAll(pattern)];
        matches.forEach(match => {
          const content = match[1];
          if (content) {
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
          }
        });
      });
      
      // Extract from defaultProps (class components)
      const defaultPropsRegex = /static\\s+defaultProps\\s*=\\s*{([^}]+)}/gs;
      const defaultPropsMatch = defaultPropsRegex.exec(fileContent);
      if (defaultPropsMatch) {
        const content = defaultPropsMatch[1];
        const assignments = content.split(',');
        assignments.forEach(assignment => {
          const propMatch = assignment.trim().match(/^(\\w+):\\s*(.+)$/);
          if (propMatch) {
            const [, propName, defaultValue] = propMatch;
            if (props[propName]) {
              props[propName].defaultValue = {
                value: defaultValue.replace(/['"]/g, ''),
                computed: false
              };
            }
          }
        });
      }
      
      return props;
    }

    function extractComponentDescription(fileContent, componentName) {
      // JSDoc patterns
      const jsdocPatterns = [
        new RegExp(`\\/\\*\\*([\\s\\S]*?)\\*\\/\\s*(?:export\\s+)?(?:const|function|class)\\s+${componentName}`, 'i'),
        new RegExp(`\\/\\*\\*([\\s\\S]*?)\\*\\/\\s*const\\s+${componentName}\\s*=\\s*forwardRef`, 'i'),
        new RegExp(`\\/\\*\\*([\\s\\S]*?)\\*\\/\\s*export\\s+default\\s+${componentName}`, 'i')
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
      
      // Single line comments
      const singleLineComment = new RegExp(`\\/\\/\\s*(.+?)\\n.*${componentName}`, 'i');
      const singleLineMatch = singleLineComment.exec(fileContent);
      if (singleLineMatch) {
        return singleLineMatch[1].trim();
      }
      
      // Generate based on file analysis
      return generateComponentDescription(fileContent, componentName);
    }

    function generateComponentDescription(fileContent, componentName) {
      const patterns = {
        'input': /(<input|input\\s|HTMLInputElement)/i,
        'button': /(<button|button\\s|HTMLButtonElement)/i,
        'form': /(<form|form\\s|HTMLFormElement)/i,
        'modal': /(modal|dialog|popup)/i,
        'tooltip': /(tooltip|popover)/i,
        'dropdown': /(dropdown|select|menu)/i,
        'table': /(<table|table\\s|HTMLTableElement)/i,
        'card': /(card|panel)/i,
        'layout': /(layout|container|wrapper)/i,
        'page': /(page|screen|view)/i,
        'hook': /^use[A-Z]/
      };
      
      const features = [];
      const componentType = detectComponentType(fileContent);
      
      // Detect UI patterns
      for (const [pattern, regex] of Object.entries(patterns)) {
        if (regex.test(fileContent) || regex.test(componentName)) {
          features.push(pattern);
        }
      }
      
      // Technical features
      if (fileContent.includes('useState') || fileContent.includes('useReducer')) features.push('stateful');
      if (fileContent.includes('forwardRef')) features.push('ref forwarding');
      if (fileContent.includes('memo')) features.push('memoized');
      if (fileContent.includes('useEffect')) features.push('side effects');
      
      let description;
      
      if (features.includes('hook')) {
        description = `A custom React hook`;
      } else if (features.includes('page')) {
        description = `A ${componentName} page component`;
      } else if (features.includes('layout')) {
        description = `A ${componentName} layout component`;
      } else {
        const uiFeatures = features.filter(f => ['input', 'button', 'form', 'modal', 'tooltip', 'dropdown', 'table', 'card'].includes(f));
        if (uiFeatures.length > 0) {
          description = `A ${uiFeatures[0]} component`;
        } else {
          description = `A ${componentType} React component`;
        }
      }
      
      const techFeatures = features.filter(f => ['stateful', 'ref forwarding', 'memoized', 'side effects'].includes(f));
      if (techFeatures.length > 0) {
        description += ` with ${techFeatures.join(', ')} capabilities`;
      }
      
      return description + '.';
    }

    function detectComponentType(fileContent) {
      if (fileContent.includes('forwardRef')) return 'forwardRef';
      if (fileContent.includes('class') && fileContent.includes('extends')) return 'class';
      if (fileContent.includes('React.memo') || fileContent.includes('memo(')) return 'memoized';
      if (fileContent.includes('function') || fileContent.includes('=>')) return 'functional';
      return 'component';
    }

    // Main processing loop
    files.forEach((file, index) => {
      processedFiles++;
      
      try {
        const fileContent = fs.readFileSync(file, "utf8");
        const relativePath = path.relative(repoRoot, file);
        
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
          docs = parser.parse ? parser.parse(file) : parser(file) || [];
          if (docs.length > 0) {
            console.log(`   🔧 Automatic parser found ${docs.length} component(s)`);
          }
        } catch (parseError) {
          console.log(`   ⚠️  Automatic parser failed: ${parseError.message.substring(0, 100)}...`);
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
            extractionMethod: 'manual',
            directory: path.dirname(relativePath)
          };
          
          // Extract props
          const extractedProps = extractPropsFromContent(fileContent, componentName);
          component.props = extractDefaultValues(fileContent, extractedProps);
          console.log(`      📋 Extracted ${Object.keys(component.props).length} props`);
          
          // Extract description
          component.description = extractComponentDescription(fileContent, componentName);
          console.log(`      📝 Description: ${component.description.substring(0, 80)}...`);
          
          // Add metadata
          component.componentType = detectComponentType(fileContent);
          component.features = [];
          if (fileContent.includes('forwardRef')) component.features.push('ref-forwarding');
          if (fileContent.includes('useState')) component.features.push('stateful');
          if (fileContent.includes('memo')) component.features.push('memoized');
          
          components.push(component);
        } else {
          // Process automatic extraction results
          docs.forEach((doc, docIndex) => {
            const nameCandidate = getComponentName(doc, file);
            
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
              tags: doc.tags || {},
              directory: path.dirname(relativePath)
            };
            
            // Enhance with manual extraction if needed
            if (Object.keys(component.props).length === 0) {
              const extractedProps = extractPropsFromContent(fileContent, nameCandidate);
              component.props = extractDefaultValues(fileContent, extractedProps);
            }
            
            if (!component.description || component.description.length < 5) {
              component.description = extractComponentDescription(fileContent, nameCandidate);
            }
            
            // Add metadata
            component.componentType = detectComponentType(fileContent);
            component.features = [];
            if (fileContent.includes('forwardRef')) component.features.push('ref-forwarding');
            if (fileContent.includes('useState')) component.features.push('stateful');
            if (fileContent.includes('memo')) component.features.push('memoized');
            if (fileContent.includes('useEffect')) component.features.push('effects');
            
            console.log(`      📋 Final props count: ${Object.keys(component.props).length}`);
            components.push(component);
          });
        }
        
      } catch (err) {
        console.error(`   ❌ Error processing ${file}:`, err.message);
        debugInfo.errors.push({
          file: path.relative(repoRoot, file),
          error: err.message
        });
      }
    });

    // Post-processing and analysis
    components.sort((a, b) => a.name.localeCompare(b.name));

    // Analyze component distribution
    const componentsByDirectory = {};
    components.forEach(comp => {
      const dir = comp.directory || 'root';
      const topDir = dir.split('/')[0] || 'root';
      componentsByDirectory[topDir] = (componentsByDirectory[topDir] || 0) + 1;
    });

    const summary = {
      totalFiles: processedFiles,
      totalComponents: components.length,
      componentsWithProps: components.filter(c => Object.keys(c.props || {}).length > 0).length,
      componentsWithDescription: components.filter(c => c.description && c.description.length > 10).length,
      averagePropsPerComponent: components.length > 0 ? 
        (components.reduce((sum, c) => sum + Object.keys(c.props || {}).length, 0) / components.length).toFixed(1) : 0,
      skippedNoExports,
      skippedNonComponents,
      extractionMethods: {
        automatic: components.filter(c => c.extractionMethod === 'automatic').length,
        manual: components.filter(c => c.extractionMethod === 'manual').length
      },
      componentTypes: {
        functional: components.filter(c => c.componentType === 'functional').length,
        forwardRef: components.filter(c => c.componentType === 'forwardRef').length,
        class: components.filter(c => c.componentType === 'class').length,
        memoized: components.filter(c => c.componentType === 'memoized').length
      },
      componentsByDirectory,
      topDirectories: Object.keys(componentsByDirectory).sort((a, b) => 
        componentsByDirectory[b] - componentsByDirectory[a]
      )
    };

    // Summary output
    console.log(`\n🎉 ========== REPOSITORY-WIDE EXTRACTION COMPLETE ==========`);
    console.log(`📁 Repository: ${path.basename(repoRoot)}`);
    console.log(`🔍 Files scanned: ${files.length}`);
    console.log(`📄 Files processed: ${summary.totalFiles}`);
    console.log(`⚛️  Total components found: ${summary.totalComponents}`);
    console.log(`📋 Components with props: ${summary.componentsWithProps} (${((summary.componentsWithProps/summary.totalComponents)*100).toFixed(1)}%)`);
    console.log(`📝 Components with descriptions: ${summary.componentsWithDescription} (${((summary.componentsWithDescription/summary.totalComponents)*100).toFixed(1)}%)`);
    console.log(`📊 Average props per component: ${summary.averagePropsPerComponent}`);

    console.log(`\n📂 Components by directory:`);
    Object.entries(componentsByDirectory)
      .sort((a, b) => b[1] - a[1])
      .forEach(([dir, count]) => {
        console.log(`   📁 ${dir}: ${count} components`);
      });

    console.log(`\n🔧 Component types:`);
    console.log(`   • Functional: ${summary.componentTypes.functional}`);
    console.log(`   • ForwardRef: ${summary.componentTypes.forwardRef}`);
    console.log(`   • Class: ${summary.componentTypes.class}`);
    console.log(`   • Memoized: ${summary.componentTypes.memoized}`);

    console.log(`\n🛠️  Extraction methods:`);
    console.log(`   • Automatic: ${summary.extractionMethods.automatic}`);
    console.log(`   • Manual: ${summary.extractionMethods.manual}`);

    // Write output file with logging
    try {
      console.log(`\n� Attempting to write output to: ${outFile}`);
      fs.writeFileSync(outFile, JSON.stringify(components, null, 2));
      console.log(`📝 Successfully wrote output to: ${outFile}`);
    } catch (err) {
      console.error(`❌ Error writing output file: ${outFile}`);
      console.error(err);
    }

    // Show top components for verification
    if (components.length > 0) {
      console.log(`\n🌟 Sample extracted components:`);
      const topComponents = components
        .filter(c => Object.keys(c.props || {}).length > 0)
        .slice(0, 5);

      topComponents.forEach((comp, index) => {
        console.log(`   ${index + 1}. ${comp.name} (${comp.directory})`);
        console.log(`      📋 ${Object.keys(comp.props).length} props`);
        console.log(`      🔧 ${comp.componentType} component`);
        console.log(`      📝 ${comp.description.substring(0, 60)}...`);
      });

      if (components.length > 5) {
        console.log(`   ... and ${components.length - 5} more components`);
      }
    }

    // Detection analysis
    const detectedComponents = debugInfo.detectionResults.filter(r => r.isComponent);
    const skippedComponents = debugInfo.detectionResults.filter(r => !r.isComponent);
    
    console.log(`\n🔍 Detection analysis:`);
    console.log(`   ✅ Files detected as components: ${detectedComponents.length}`);
    console.log(`   ❌ Files skipped: ${skippedComponents.length}`);
    
    if (detectedComponents.length > 0) {
      const avgConfidence = detectedComponents.reduce((sum, r) => sum + r.confidence, 0) / detectedComponents.length;
      console.log(`   📊 Average detection confidence: ${avgConfidence.toFixed(1)}`);
    }
    
    // Show common skip reasons
    if (skippedComponents.length > 0) {
      const skipReasons = {};
      skippedComponents.forEach(comp => {
        skipReasons[comp.reason] = (skipReasons[comp.reason] || 0) + 1;
      });
      
      console.log(`\n❌ Common reasons for skipping files:`);
      Object.entries(skipReasons)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .forEach(([reason, count]) => {
          console.log(`   • ${reason}: ${count} files`);
        });
    }
    
    console.log(`\n✨ Repository-wide extraction completed successfully!`);
    console.log(`📊 Check the output file for complete component documentation.`);
  }
}

RepositoryWideExtractor.extractComponents();