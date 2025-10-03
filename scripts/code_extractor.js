const fs = require("fs");
const path = require("path");
const glob = require("glob");
const reactDocgenTs = require("react-docgen-typescript");

class RepositoryWideExtractor {
  static extractComponents() {

    // Extract from entire repository, not just components folder
    const repoRoot = path.join(__dirname, "..", "Custom-ui");
    const buildIndexDir = path.join(__dirname, "..", "build-index");
    const outFile = path.join(buildIndexDir, "component_docs.json");

    // Stop process if repository does not exist
    if (!fs.existsSync(repoRoot)) {
      console.error(`❌ Repository directory not found: ${repoRoot}`);
      console.error('🛑 Extraction stopped. Please provide a valid repository.');
      return;
    }

    // Ensure build-index directory exists
    if (!fs.existsSync(buildIndexDir)) {
      fs.mkdirSync(buildIndexDir, { recursive: true });
      console.log(`📁 Created missing directory: ${buildIndexDir}`);
    }

    //If output file exists, skip extraction
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
        '**/tests/**',              // ✅ Exclude tests directories
        '**/test/**',               // ✅ Exclude test directories
        '**/storybook-static/**'
      ]
    });

    console.log(`📄 Found ${files.length} React/TypeScript files across the repository`);
    

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

    // function extractPropsFromContent(fileContent, componentName) {
    //   const props = {};
      
    //   // Enhanced patterns for props extraction
    //   const propPatterns = [
    //     // Interface patterns
    //     { 
    //       regex: new RegExp(`interface\\s+${componentName}Props\\s*(?:extends\\s+[^{]*)?\\s*{([^}]+)}`, 'gs'),
    //       name: 'interfaceComponentProps'
    //     },
    //     { 
    //       regex: /interface\s+Props\s*(?:extends\s+[^{]*)?\\s*{([^}]+)}/gs,
    //       name: 'interfaceProps'
    //     },
    //     { 
    //       regex: new RegExp(`interface\\s+I${componentName}\\s*(?:extends\\s+[^{]*)?\\s*{([^}]+)}`, 'gs'),
    //       name: 'interfaceIComponent'
    //     },
    //     // Type patterns
    //     { 
    //       regex: new RegExp(`type\\s+${componentName}Props\\s*=\\s*{([^}]+)}`, 'gs'),
    //       name: 'typeComponentProps'
    //     },
    //     { 
    //       regex: /type\s+Props\s*=\s*{([^}]+)}/gs,
    //       name: 'typeProps'
    //     },
    //     // Export patterns
    //     { 
    //       regex: /export\s+type\s+Props\s*=\s*[^{]*{([^}]+)}/gs,
    //       name: 'exportTypeProps'
    //     },
    //     // Utility type patterns
    //     { 
    //       regex: /export\s+type\s+Props\s*=\s*OverWrite<[^,]+,\\s*{([^}]+)}\\s*>/gs,
    //       name: 'overwriteProps'
    //     },
    //     {
    //       regex: /type\s+Props\s*=\s*Omit<[^,]+,\\s*[^>]+>\\s*&\\s*{([^}]+)}/gs,
    //       name: 'omitProps'
    //     },
    //     {
    //       regex: /type\s+Props\s*=\s*[^{]*&\\s*{([^}]+)}/gs,
    //       name: 'intersectionProps'
    //     }
    //   ];
      
    //   for (const pattern of propPatterns) {
    //     const match = pattern.regex.exec(fileContent);
    //     if (match && match[1]) {
    //       const propsContent = match[1];
    //       const extractedProps = parsePropsContent(propsContent);
    //       if (Object.keys(extractedProps).length > 0) {
    //         Object.assign(props, extractedProps);
    //         console.log(`      ✅ Props extracted using ${pattern.name}: ${Object.keys(extractedProps).length} props`);
    //         break;
    //       }
    //     }
    //   }
      
    //   // Fallback: extract from function parameters
    //   if (Object.keys(props).length === 0) {
    //     const paramProps = extractPropsFromParameters(fileContent);
    //     if (Object.keys(paramProps).length > 0) {
    //       Object.assign(props, paramProps);
    //       console.log(`      ✅ Props extracted from parameters: ${Object.keys(paramProps).length} props`);
    //     }
    //   }
      
    //   return props;
    // }
// ---------------------------------------------------------
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

    function extractPropsFromContent(fileContent, componentName, thisFilePath) {
      const props = {};
      const propPatterns = [
        { regex: new RegExp(`interface\\s+${componentName}Props\\s*(?:extends\\s+[^{]*)?\\s*{([^}]+)}`, 'gs'), name: 'interfaceComponentProps' },
        { regex: /interface\s+Props\s*(?:extends\s+[^{]*)?\s*{([^}]+)}/gs, name: 'interfaceProps' },
        { regex: new RegExp(`interface\\s+I${componentName}\\s*(?:extends\\s+[^{]*)?\\s*{([^}]+)}`, 'gs'), name: 'interfaceIComponent' },
        { regex: new RegExp(`type\\s+${componentName}Props\\s*=\\s*{([^}]+)}`, 'gs'), name: 'typeComponentProps' },
        { regex: /type\s+Props\s*=\s*{([^}]+)}/gs, name: 'typeProps' },
        { regex: /export\s+type\s+Props\s*=\s*[^{]*{([^}]+)}/gs, name: 'exportTypeProps' },
        { regex: /export\s+type\s+Props\s*=\s*OverWrite<[^,]+,\s*{([^}]+)}\s*>/gs, name: 'overwriteProps' },
        { regex: /type\s+Props\s*=\s*Omit<[^,]+,\s*[^>]+>\s*&\s*{([^}]+)}/gs, name: 'omitProps' },
        { regex: /type\s+Props\s*=\s*[^{]*&\s*{([^}]+)}/gs, name: 'intersectionProps' }
      ];

      // Try local file first
      let foundLocal = false;
      for (const pattern of propPatterns) {
        const match = pattern.regex.exec(fileContent);
        console.log(`[DEBUG] Trying pattern '${pattern.name}' in file '${thisFilePath}' for component '${componentName}'`);
        if (match && match[1]) {
          console.log(`[DEBUG] Pattern '${pattern.name}' matched. Extracting props...`);
          const propsContent = match[1];
          const extractedProps = parsePropsContent(propsContent, thisFilePath);
          if (Object.keys(extractedProps).length > 0) {
            Object.assign(props, extractedProps);
            foundLocal = true;
            break;
          } else {
            console.log(`[DEBUG] Pattern '${pattern.name}' matched but no props extracted.`);
          }
        } else {
          console.log(`[DEBUG] Pattern '${pattern.name}' did not match.`);
        }
      }

      // If still empty, try to extract from all imported interface/type files ending with Props
      let importedInterfaceCode = null;
      if (!foundLocal && Object.keys(props).length === 0) {
        // Find all imports
        const importRegex = /import\s+\{([^}]+)\}\s+from\s+["'](.+?)["']/g;
        let importMatch;
        let foundImportedProps = false;
        console.log(`[DEBUG] Scanning for imported props types in file '${thisFilePath}'`);
        while ((importMatch = importRegex.exec(fileContent)) !== null) {
          const importedTypes = importMatch[1].split(',').map(t => t.trim());
          const importPath = importMatch[2];
          importedTypes.forEach(importedType => {
            if (/Props$/.test(importedType)) {
              let interfaceFile = importPath;
              if (!interfaceFile.endsWith('.ts') && !interfaceFile.endsWith('.tsx')) {
                interfaceFile = path.join(path.dirname(thisFilePath), importPath + '.ts');
                if (!fs.existsSync(interfaceFile)) {
                  interfaceFile = path.join(path.dirname(thisFilePath), importPath + '.tsx');
                }
              } else {
                interfaceFile = path.join(path.dirname(thisFilePath), importPath);
              }
              console.log(`[DEBUG] Found imported props type: '${importedType}' from '${interfaceFile}'`);
              if (fs.existsSync(interfaceFile)) {
                const interfaceContent = fs.readFileSync(interfaceFile, 'utf8');
                importedInterfaceCode = interfaceContent;
                // Try to extract the props from the imported type
                for (const pattern of propPatterns) {
                  // Use importedType instead of componentName
                  const regex = new RegExp(`interface\\s+${importedType}\\s*(?:extends\\s+[^{]*)?\\s*{([^}]+)}`, 'gs');
                  const match = regex.exec(interfaceContent);
                  console.log(`[DEBUG] Trying pattern '${pattern.name}' in imported file '${interfaceFile}' for type '${importedType}'`);
                  if (match && match[1]) {
                    console.log(`[DEBUG] Pattern '${pattern.name}' matched in imported file. Extracting props...`);
                    const propsContent = match[1];
                    const extractedProps = parsePropsContent(propsContent, interfaceFile);
                    if (Object.keys(extractedProps).length > 0) {
                      Object.assign(props, extractedProps);
                      foundImportedProps = true;
                      break;
                    } else {
                      console.log(`[DEBUG] Pattern '${pattern.name}' matched in imported file but no props extracted.`);
                    }
                  } else {
                    // Try type alias
                    const typeRegex = new RegExp(`type\\s+${importedType}\\s*=\\s*{([^}]+)}`, 'gs');
                    const typeMatch = typeRegex.exec(interfaceContent);
                    if (typeMatch && typeMatch[1]) {
                      console.log(`[DEBUG] Type alias matched for '${importedType}' in imported file. Extracting props...`);
                      const propsContent = typeMatch[1];
                      const extractedProps = parsePropsContent(propsContent, interfaceFile);
                      if (Object.keys(extractedProps).length > 0) {
                        Object.assign(props, extractedProps);
                        foundImportedProps = true;
                        break;
                      } else {
                        console.log(`[DEBUG] Type alias matched in imported file but no props extracted.`);
                      }
                    } else {
                      console.log(`[DEBUG] Pattern '${pattern.name}' did not match in imported file.`);
                    }
                  }
                }
              } else {
                console.log(`[DEBUG] Interface file does not exist: '${interfaceFile}'`);
              }
            }
          });
        }
        if (!foundImportedProps) {
          console.log(`[DEBUG] No imported props type found.`);
        }
      }
      // Return both props and importedInterfaceCode
      return { props, importedInterfaceCode };

      // Fallback: extract from function parameters
      if (Object.keys(props).length === 0) {
        console.log(`[DEBUG] Trying fallback: extractPropsFromParameters`);
        const paramProps = extractPropsFromParameters(fileContent);
        if (Object.keys(paramProps).length > 0) {
          Object.assign(props, paramProps);
          console.log(`[DEBUG] Fallback extracted ${Object.keys(paramProps).length} props.`);
        } else {
          console.log(`[DEBUG] Fallback did not extract any props.`);
        }
      }
      console.log(`[DEBUG] Final extracted props for component '${componentName}' in file '${thisFilePath}':`, props);
      return props;
    }

    // function parsePropsContent(propsContent) {
    //   const props = {};
      
    //   // Handle multi-line props with proper brace matching
    //   let depth = 0;
    //   let current = '';
    //   const propDefinitions = [];
      
    //   for (let i = 0; i < propsContent.length; i++) {
    //     const char = propsContent[i];
        
    //     if (char === '{' || char === '<' || char === '(') depth++;
    //     if (char === '}' || char === '>' || char === ')') depth--;
        
    //     if ((char === ';' || char === '\\n' || char === ',') && depth === 0) {
    //       if (current.trim()) {
    //         propDefinitions.push(current.trim());
    //         current = '';
    //       }
    //     } else {
    //       current += char;
    //     }
    //   }
      
    //   if (current.trim()) {
    //     propDefinitions.push(current.trim());
    //   }
      
    //   propDefinitions.forEach(definition => {
    //     // Match: propName?: type | propName: type
    //     const propMatch = definition.match(/^(\w+)(\?)?:\s*(.+?)(?:\s*\/\*\*(.+?)\*\/)?$/);
    //     if (propMatch) {
    //       const [, propName, isOptional, propType, comment] = propMatch;
    //       props[propName] = {
    //         name: propName,
    //         type: { name: propType.trim().replace(/[,;]$/, '') },
    //         required: !isOptional,
    //         description: comment?.trim() || generatePropDescription(propName, propType),
    //         defaultValue: null
    //       };
    //     }
    //   });
      
    //   return props;
    // }


    function parsePropsContent(propsContent, parentFilePath) {
      const props = {};
      let depth = 0;
      let current = '';
      const propDefinitions = [];
      for (let i = 0; i < propsContent.length; i++) {
        const char = propsContent[i];
        if (char === '{' || char === '<' || char === '(') depth++;
        if (char === '}' || char === '>' || char === ')') depth--;
        if ((char === ';' || char === '\n' || char === ',') && depth === 0) {
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
      console.log(`[DEBUG] Parsing props content:`, propDefinitions);
      propDefinitions.forEach(definition => {
        // Split multi-line/grouped definitions into individual lines
        definition.split(/;|\n/).forEach(line => {
          const trimmed = line.trim();
          if (!trimmed) return;
          // Match function type: onAccept?: (form: UserProfile) => void
          const funcMatch = trimmed.match(/^([\w$]+)(\?)?:\s*\(([^)]*)\)\s*=>\s*([^;]+)$/);
          if (funcMatch) {
            const [, propName, isOptional, params, returnType] = funcMatch;
            props[propName] = {
              name: propName,
              type: { name: `(${params}) => ${returnType}` },
              required: !isOptional,
              description: generatePropDescription(propName, `function`),
              defaultValue: null,
              functionParams: params.split(',').map(p => p.trim()).filter(Boolean),
              functionReturnType: returnType.trim()
            };
            return;
          }
          // Match normal prop or nested type
          const propMatch = trimmed.match(/^([\w$]+)(\?)?:\s*([^;]+?)(?:\s*\/\*\*(.+?)\*\/)?$/);
          if (propMatch) {
            const [, propName, isOptional, propType, comment] = propMatch;
            let typeName = propType.trim().replace(/[,;]$/, '');
            let nestedProps = null;
            // If typeName is a custom type, try to resolve recursively
            if (/^[A-Z][A-Za-z0-9_]+$/.test(typeName) && typeName !== 'ReactNode' && typeName !== 'ReactElement') {
              let typeContent = '';
              let typeMatch = null;
              if (fs.existsSync(parentFilePath)) {
                typeContent = fs.readFileSync(parentFilePath, 'utf8');
                let typeRegex = new RegExp(`interface\\s+${typeName}\\s*{([^}]+)}`);
                typeMatch = typeRegex.exec(typeContent);
                if (!typeMatch) {
                  typeRegex = new RegExp(`type\\s+${typeName}\\s*=\\s*{([^}]+)}`);
                  typeMatch = typeRegex.exec(typeContent);
                }
              }
              if (!typeMatch) {
                const importRegex = new RegExp(`import\\s+\\{\\s*${typeName}\\s*\\}\\s+from\\s+["'](.+?)["']`);
                const importMatch = typeContent.match(importRegex);
                if (importMatch) {
                  let importPath = importMatch[1];
                  let importFile = importPath;
                  if (!importFile.endsWith('.ts') && !importFile.endsWith('.tsx')) {
                    importFile = path.join(path.dirname(parentFilePath), importPath + '.ts');
                    if (!fs.existsSync(importFile)) {
                      importFile = path.join(path.dirname(parentFilePath), importPath + '.tsx');
                    }
                  } else {
                    importFile = path.join(path.dirname(parentFilePath), importPath);
                  }
                  if (fs.existsSync(importFile)) {
                    const importContent = fs.readFileSync(importFile, 'utf8');
                    let typeRegex = new RegExp(`interface\\s+${typeName}\\s*{([^}]+)}`);
                    typeMatch = typeRegex.exec(importContent);
                    if (!typeMatch) {
                      typeRegex = new RegExp(`type\\s+${typeName}\\s*=\\s*{([^}]+)}`);
                      typeMatch = typeRegex.exec(importContent);
                    }
                    if (typeMatch && typeMatch[1]) {
                      console.log(`[DEBUG] Found nested type '${typeName}' in imported file '${importFile}'. Recursively parsing...`);
                      nestedProps = parsePropsContent(typeMatch[1], importFile);
                    } else {
                      console.log(`[DEBUG] Could not find definition for nested type '${typeName}' in imported file '${importFile}'.`);
                    }
                  } else {
                    console.log(`[DEBUG] Imported file for nested type '${typeName}' does not exist: '${importFile}'`);
                  }
                } else {
                  console.log(`[DEBUG] Could not find import for nested type '${typeName}' in file '${parentFilePath}'.`);
                }
              } else if (typeMatch && typeMatch[1]) {
                console.log(`[DEBUG] Found nested type '${typeName}' in file '${parentFilePath}'. Recursively parsing...`);
                nestedProps = parsePropsContent(typeMatch[1], parentFilePath);
              }
            }
            props[propName] = {
              name: propName,
              type: { name: typeName },
              required: !isOptional,
              description: comment?.trim() || generatePropDescription(propName, typeName),
              defaultValue: null,
              ...(nestedProps ? { nestedProps } : {})
            };
          } else {
            console.log(`[DEBUG] Could not parse prop definition: '${trimmed}'`);
          }
        });
      });
      console.log(`[DEBUG] Final parsed props object:`, props);
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
      // Skip index.ts and index.tsx files (they're just re-exports)
      const basename = path.basename(file);
      if (basename === 'index.ts' || basename === 'index.tsx') {
        console.log(`\\n⏩ Skipped (${index + 1}/${files.length}): index file - ${path.relative(repoRoot, file)}`);
        debugInfo.skippedFiles.push({
          file: path.relative(repoRoot, file),
          reason: 'index.ts/tsx file (re-export only)'
        });
        return;
      }
      
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

          // Extract props (pass file path as third argument)
          const extracted = extractPropsFromContent(fileContent, componentName, file);
          component.props = extractDefaultValues(fileContent, extracted.props);
          if (extracted.importedInterfaceCode) {
            component.interfaceCode = extracted.importedInterfaceCode;
          }
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
              const extracted = extractPropsFromContent(fileContent, nameCandidate, file);
              component.props = extractDefaultValues(fileContent, extracted.props);
              if (extracted.importedInterfaceCode) {
                component.interfaceCode = extracted.importedInterfaceCode;
              }
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

    // Write output file with logging
    try {
      fs.writeFileSync(outFile, JSON.stringify(components, null, 2));
      console.log(`📝 Successfully wrote output to: ${outFile}`);
    } catch (err) {
      console.error(`❌ Error writing output file: ${outFile}`);
      console.error(err);
    }
  }
}

RepositoryWideExtractor.extractComponents();