const fs = require("fs");
const path = require("path");
const glob = require("glob");
const reactDocgenTs = require("react-docgen-typescript");

// ============================================
// LOAD CONFIGURATION
// ============================================
const CONFIG = require("../config/extraction.config.js");

// ============================================
// LOAD EXTRACTION CLASSES (Refactored OOP)
// ============================================
const { ComponentDetector, ComponentParser } = require("./extraction_classes.js");

class RepositoryWideExtractor {
  
  /**
   * SMART AGGREGATION: Group component files by directory
   * Detects components with multiple files: *.component.tsx, *.interface.ts, *.style.ts, index.ts
   */
  static groupComponentFiles(files, repoRoot) {
    const componentGroups = new Map();
    const standaloneFiles = [];
    
    console.log(`\n🔍 Analyzing component directory structure...`);
    
    files.forEach(file => {
      const dir = path.dirname(file);
      const basename = path.basename(file);
      const relativeDir = path.relative(repoRoot, dir);
      
      // Check if this looks like a component file
      const isComponentFile = basename.match(CONFIG.aggregation.patterns.component);
      const isInterfaceFile = basename.match(CONFIG.aggregation.patterns.interface);
      const isStyleFile = basename.match(CONFIG.aggregation.patterns.style);
      const isIndexFile = basename.match(CONFIG.aggregation.patterns.index);
      
      // Use config to determine if index files should be aggregated everywhere
      const shouldAggregateIndex = CONFIG.aggregation.aggregateIndexEverywhere || relativeDir.includes('components');
      if (isComponentFile || isInterfaceFile || isStyleFile || (isIndexFile && shouldAggregateIndex)) {
        // This file belongs to a component group
        if (!componentGroups.has(dir)) {
          componentGroups.set(dir, {
            directory: dir,
            relativeDir: relativeDir,
            componentName: path.basename(dir),
            files: {
              component: null,
              interface: null,
              style: null,
              index: null
            }
          });
        }
        
        const group = componentGroups.get(dir);
        
        if (isComponentFile) {
          group.files.component = file;
          // Extract actual component name from filename (e.g., "ProfilePage" from "ProfilePage.component.tsx")
          const match = basename.match(/^(.+)\.component\.(tsx|jsx)$/);
          if (match) {
            group.componentName = match[1];
          }
        } else if (isInterfaceFile) {
          group.files.interface = file;
        } else if (isStyleFile) {
          group.files.style = file;
        } else if (isIndexFile) {
          group.files.index = file;
        }
      } else {
        // Standalone file (not part of a component group)
        standaloneFiles.push(file);
      }
    });
    
    // Log statistics
    console.log(`📦 Found ${componentGroups.size} component directories`);
    console.log(`📄 Found ${standaloneFiles.length} standalone files`);
    
    // Log grouped components
    if (componentGroups.size > 0) {
      console.log(`\n📁 Component Groups:`);
      componentGroups.forEach((group, dir) => {
        const fileCount = Object.values(group.files).filter(f => f !== null).length;
        const fileTypes = [];
        if (group.files.component) fileTypes.push('component');
        if (group.files.interface) fileTypes.push('interface');
        if (group.files.style) fileTypes.push('style');
        if (group.files.index) fileTypes.push('index');
        console.log(`   ${group.componentName} (${fileCount} files: ${fileTypes.join(', ')})`);
      });
    }
    
    return { componentGroups, standaloneFiles };
  }
  
  /**
   * Extract interfaces and types from interface files
   */
  static extractInterfacesFromFile(fileContent, filePath) {
    const interfaces = [];
    const types = [];
    const enums = [];
    
    // Extract interfaces
    const interfaceRegex = /export\s+interface\s+(\w+)\s*(?:extends\s+[^{]*)?\s*{([^}]+)}/gs;
    let match;
    while ((match = interfaceRegex.exec(fileContent)) !== null) {
      interfaces.push({
        name: match[1],
        content: match[0],
        raw: match[0]
      });
    }
    
    // Extract type aliases
    const typeRegex = /export\s+type\s+(\w+)\s*=\s*([^;]+);/gs;
    while ((match = typeRegex.exec(fileContent)) !== null) {
      types.push({
        name: match[1],
        definition: match[2].trim(),
        raw: match[0]
      });
    }
    
    // Extract enums
    const enumRegex = /export\s+enum\s+(\w+)\s*{([^}]+)}/gs;
    while ((match = enumRegex.exec(fileContent)) !== null) {
      enums.push({
        name: match[1],
        values: match[2].trim(),
        raw: match[0]
      });
    }
    
    return { interfaces, types, enums };
  }
  
  /**
   * Extract style information from style files
   */
  static extractStylesFromFile(fileContent, filePath) {
    const styles = {
      type: null,
      content: fileContent,
      classes: [],
      variables: []
    };
    
    // Detect style type
    if (fileContent.includes('makeStyles') || fileContent.includes('@mui/styles')) {
      styles.type = 'mui-makestyles';
    } else if (fileContent.includes('styled-components') || fileContent.includes('styled.')) {
      styles.type = 'styled-components';
    } else if (fileContent.includes('@emotion')) {
      styles.type = 'emotion';
    } else if (fileContent.includes('css`') || fileContent.includes('css(')) {
      styles.type = 'css-in-js';
    }
    
    return styles;
  }
  
  static extractComponents() {

    // ============================================
    // LOAD PATHS FROM CONFIG
    // ============================================
    const repoRoot = path.join(__dirname, "..", CONFIG.repository.root);
    const buildIndexDir = path.join(__dirname, "..", CONFIG.repository.buildDir);
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

    //If output file exists, backup and continue
    if (CONFIG.logging.createBackup && fs.existsSync(outFile)) {
      const backupFile = outFile.replace('.json', `.backup.${Date.now()}.json`);
      fs.copyFileSync(outFile, backupFile);
      console.log(`⚠️ Output file already exists: ${outFile}`);
      console.log(`📦 Created backup: ${backupFile}`);
      console.log('♻️  Re-extracting components...');
    }

    console.log(`\n🔍 Starting repository-wide extraction from: ${repoRoot}`);
    console.log(`📁 Repository exists: ${fs.existsSync(repoRoot)}`);
    console.log(`⚙️  Using configuration from: config/extraction.config.js`);

    const components = [];
    const debugInfo = {
      processedFiles: [],
      skippedFiles: [],
      detectionResults: [],
      errors: [],
      directoryStats: {}
    };

    // ============================================
    // BUILD FILE PATTERN FROM CONFIG
    // ============================================
    const fileExtensions = CONFIG.files.include.join(',');
    const globPattern = path.join(repoRoot, `**/*.{${fileExtensions}}`);
    
    // Scan entire repository with patterns from config
    const files = glob.sync(globPattern, {
      ignore: CONFIG.files.exclude
    });

    console.log(`📄 Found ${files.length} React/TypeScript files across the repository`);
    
    // Apply includeOnly filter if specified
    let filteredFiles = files;
    if (CONFIG.files.includeOnly && CONFIG.files.includeOnly.length > 0) {
      filteredFiles = files.filter(file => {
        const relativePath = path.relative(repoRoot, file);
        return CONFIG.files.includeOnly.some(pattern => {
          // Convert glob pattern to regex for matching
          const regexPattern = pattern
            .replace(/\*\*/g, '.*')
            .replace(/\*/g, '[^/]*')
            .replace(/\//g, '\\/');
          return new RegExp(regexPattern).test(relativePath);
        });
      });
      console.log(`� Filtered to ${filteredFiles.length} files based on includeOnly patterns`);
    }
    
    // ========================================
    // SMART AGGREGATION: Group component files
    // ========================================
    if (!CONFIG.aggregation.enabled) {
      console.log(`⚠️  Smart Aggregation is DISABLED in config`);
    }
    
    const { componentGroups, standaloneFiles } = this.groupComponentFiles(filteredFiles, repoRoot);
    

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

    // Use ComponentDetector and ComponentParser classes for component analysis

    function isReactComponent(fileContent, filePath) {
      return ComponentDetector.isReactComponent(fileContent, filePath, repoRoot, debugInfo);
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

    // ========================================
    // PROCESS COMPONENT GROUPS (Smart Aggregation)
    // ========================================
    console.log(`\n🔧 Processing ${componentGroups.size} component groups...`);
    
    componentGroups.forEach((group, dir) => {
      try {
        console.log(`\n📦 Processing component group: ${group.componentName}`);
        
        // Create aggregated component object
        const aggregatedComponent = {
          id: group.componentName,
          name: group.componentName,
          directory: path.relative(repoRoot, group.directory),
          aggregationType: 'multi-file',  // Mark as aggregated component
          files: {},
          raw: {},
          props: {},
          interfaces: [],
          types: [],
          enums: [],
          styles: null,
          exports: [],
          description: "",
          features: [],
          extractionMethod: 'aggregated'
        };
        
        // Process component file (main file)
        if (group.files.component) {
          const componentContent = fs.readFileSync(group.files.component, 'utf8');
          aggregatedComponent.files.component = path.relative(repoRoot, group.files.component);
          aggregatedComponent.raw.component = componentContent;
          
          console.log(`   ✅ Component file: ${path.basename(group.files.component)}`);
          
          // Extract props from component
          try {
            const docs = parser.parse ? parser.parse(group.files.component) : parser(group.files.component) || [];
            if (docs.length > 0 && docs[0].props) {
              aggregatedComponent.props = docs[0].props;
              console.log(`      📋 Extracted ${Object.keys(docs[0].props).length} props from parser`);
            }
          } catch (e) {
            // Fallback: manual extraction
            const extracted = extractPropsFromContent(componentContent, group.componentName, group.files.component);
            aggregatedComponent.props = extractDefaultValues(componentContent, extracted.props);
            if (extracted.importedInterfaceCode) {
              aggregatedComponent.raw.importedInterface = extracted.importedInterfaceCode;
            }
            console.log(`      📋 Manually extracted ${Object.keys(aggregatedComponent.props).length} props`);
          }
          
          // Extract description
          aggregatedComponent.description = extractComponentDescription(componentContent, group.componentName);
          
          // Detect features
          if (componentContent.includes('forwardRef')) aggregatedComponent.features.push('ref-forwarding');
          if (componentContent.includes('useState')) aggregatedComponent.features.push('stateful');
          if (componentContent.includes('memo')) aggregatedComponent.features.push('memoized');
          if (componentContent.includes('useEffect')) aggregatedComponent.features.push('effects');
          
          aggregatedComponent.componentType = detectComponentType(componentContent);
        }
        
        // Process interface file
        if (group.files.interface) {
          const interfaceContent = fs.readFileSync(group.files.interface, 'utf8');
          aggregatedComponent.files.interface = path.relative(repoRoot, group.files.interface);
          aggregatedComponent.raw.interface = interfaceContent;
          
          const extracted = this.extractInterfacesFromFile(interfaceContent, group.files.interface);
          aggregatedComponent.interfaces = extracted.interfaces;
          aggregatedComponent.types = extracted.types;
          aggregatedComponent.enums = extracted.enums;
          
          console.log(`   ✅ Interface file: ${path.basename(group.files.interface)}`);
          console.log(`      📐 Found ${extracted.interfaces.length} interfaces, ${extracted.types.length} types, ${extracted.enums.length} enums`);
        }
        
        // Process style file
        if (group.files.style) {
          const styleContent = fs.readFileSync(group.files.style, 'utf8');
          aggregatedComponent.files.style = path.relative(repoRoot, group.files.style);
          aggregatedComponent.raw.style = styleContent;
          
          aggregatedComponent.styles = this.extractStylesFromFile(styleContent, group.files.style);
          
          console.log(`   ✅ Style file: ${path.basename(group.files.style)} (${aggregatedComponent.styles.type || 'css-in-js'})`);
        }
        
        // Process index file
        if (group.files.index) {
          const indexContent = fs.readFileSync(group.files.index, 'utf8');
          aggregatedComponent.files.index = path.relative(repoRoot, group.files.index);
          aggregatedComponent.raw.index = indexContent;
          
          // Extract exports from index
          const exportMatches = indexContent.match(/export\s+\{([^}]+)\}/g);
          if (exportMatches) {
            exportMatches.forEach(exp => {
              const items = exp.match(/\w+/g).filter(w => w !== 'export');
              aggregatedComponent.exports.push(...items);
            });
          }
          
          console.log(`   ✅ Index file: exports ${aggregatedComponent.exports.length} items`);
        }
        
        // Add to components list
        components.push(aggregatedComponent);
        console.log(`   ✅ Aggregated component "${group.componentName}" with ${Object.keys(aggregatedComponent.files).length} files`);
        
      } catch (err) {
        console.error(`   ❌ Error processing component group ${group.componentName}:`, err.message);
        debugInfo.errors.push({
          directory: path.relative(repoRoot, group.directory),
          error: err.message
        });
      }
    });

    // ========================================
    // PROCESS STANDALONE FILES
    // ========================================
    console.log(`\n🔧 Processing ${standaloneFiles.length} standalone files...`);
    
    // Main processing loop for standalone files
    standaloneFiles.forEach((file, index) => {
      // Skip index.ts and index.tsx files (they're just re-exports)
      const basename = path.basename(file);
      if (basename === 'index.ts' || basename === 'index.tsx') {
        console.log(`\\n⏩ Skipped standalone (${index + 1}/${standaloneFiles.length}): index file - ${path.relative(repoRoot, file)}`);
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
        
        console.log(`\\n📄 Processing standalone (${index + 1}/${standaloneFiles.length}): ${relativePath}`);
        
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

          const componentName = ComponentParser.getComponentName({}, file);
          let component = {
            id: `${file}::${componentName}`,
            name: componentName,
            file: path.relative(process.cwd(), file),
            props: {},
            description: "",
            raw: fileContent,  // Full source code (was: slice(0, 4000))
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
            const nameCandidate = ComponentParser.getComponentName(doc, file);

            console.log(`   🔧 Processing automatic component: ${nameCandidate}`);

            let component = {
              id: `${file}::${nameCandidate}`,
              name: nameCandidate,
              file: path.relative(process.cwd(), file),
              props: doc.props || {},
              description: doc.description || "",
              raw: fileContent,  // Full source code (was: slice(0, 4000))
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
      
      // Validation summary
      console.log(`\n📊 EXTRACTION VALIDATION SUMMARY`);
      console.log(`=================================`);
      console.log(`Total components extracted: ${components.length}`);
      
      // Smart Aggregation statistics
      const aggregatedComponents = components.filter(c => c.aggregationType === 'multi-file');
      const standaloneComponents = components.filter(c => c.aggregationType !== 'multi-file');
      
      if (aggregatedComponents.length > 0) {
        console.log(`\n📦 SMART AGGREGATION:`);
        console.log(`   Aggregated components: ${aggregatedComponents.length}`);
        console.log(`   Standalone components: ${standaloneComponents.length}`);
        
        console.log(`\n   Multi-file components:`);
        aggregatedComponents.forEach(c => {
          const fileTypes = Object.keys(c.files).join(', ');
          const fileCount = Object.keys(c.files).length;
          console.log(`   • ${c.name} (${fileCount} files: ${fileTypes})`);
        });
      }
      
      // Check for missing critical fields
      const withoutRaw = components.filter(c => {
        if (c.aggregationType === 'multi-file') {
          return !c.raw || !c.raw.component;
        }
        return !c.raw || (typeof c.raw === 'string' && c.raw.trim().length === 0);
      });
      const withoutProps = components.filter(c => !c.props || Object.keys(c.props).length === 0);
      const duplicateNames = {};
      components.forEach(c => {
        duplicateNames[c.name] = (duplicateNames[c.name] || 0) + 1;
      });
      const duplicates = Object.entries(duplicateNames).filter(([name, count]) => count > 1);
      
      if (withoutRaw.length > 0) {
        console.log(`\n⚠️  WARNING: ${withoutRaw.length} components missing source code:`);
        withoutRaw.slice(0, 5).forEach(c => console.log(`   - ${c.name} (${c.file})`));
        if (withoutRaw.length > 5) console.log(`   ... and ${withoutRaw.length - 5} more`);
      }
      
      if (withoutProps.length > 0) {
        console.log(`\n📋 INFO: ${withoutProps.length} components with no props (might be utilities/hooks)`);
      }
      
      if (duplicates.length > 0) {
        console.log(`\n✅ DUPLICATE NAMES (Correctly handled with unique IDs):`);
        duplicates.forEach(([name, count]) => {
          const files = components.filter(c => c.name === name).map(c => c.file);
          console.log(`   - "${name}" appears ${count} times:`);
          files.forEach(f => console.log(`     • ${f}`));
        });
      }
      
      // Size statistics
      const getTotalSize = (c) => {
        if (c.aggregationType === 'multi-file') {
          return Object.values(c.raw).reduce((sum, content) => sum + (content?.length || 0), 0);
        }
        return c.raw?.length || 0;
      };
      
      const avgRawSize = components.reduce((sum, c) => sum + getTotalSize(c), 0) / components.length;
      const maxRawSize = Math.max(...components.map(c => getTotalSize(c)));
      console.log(`\n📏 Source code size:`);
      console.log(`   Average: ${Math.round(avgRawSize)} characters`);
      console.log(`   Maximum: ${maxRawSize} characters`);
      
      console.log(`\n✅ Extraction complete!`);
      console.log(`=================================\n`);
    } catch (err) {
      console.error(`❌ Error writing output file: ${outFile}`);
      console.error(err);
    }
  }
}

RepositoryWideExtractor.extractComponents();