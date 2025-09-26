const fs = require("fs");
const path = require("path");
const glob = require("glob");
const reactDocgenTs = require("react-docgen-typescript");

class ComponentExtractor {
  static extractComponents() {
    const repoPath = path.join(__dirname, "..", "Custom-ui", "src", "components");
    const outFile = path.join(__dirname, "..", "build-index", "component_docs.json");
    
    if (fs.existsSync(outFile)) {
      console.log(`Component docs already exist at ${outFile}, skipping extraction.`);
      return;
    }

    const components = [];

    // Adjust glob pattern to exclude CSS, JSON, and non-JS/TS files
    const files = glob.sync(path.join(repoPath, "**/*.{js,jsx,ts,tsx}"));

    // Enhanced parser configuration for better prop and description extraction
    const parser = reactDocgenTs.withCustomConfig(
      path.join(__dirname, "..", "Custom-ui", "tsconfig.json"), 
      {
        savePropValueAsString: true,
        shouldExtractLiteralValuesFromEnum: true,
        shouldRemoveUndefinedFromOptional: true,
        propFilter: (prop, component) => {
          // Include all props, even inherited ones
          if (prop.parent) {
            return !prop.parent.fileName.includes('node_modules');
          }
          return true;
        },
        componentNameResolver: (exp, source) => {
          // Better component name resolution
          return exp.getName();
        }
      }
    );

    let skippedNoExports = 0;
    let skippedNonComponents = 0;
    let processedFiles = 0;

    function getComponentName(doc, file) {
      if (doc.displayName) {
        return doc.displayName;
      }
      if (doc.name && doc.name !== "default") {
        return doc.name;
      }
      const ext = path.extname(file).toLowerCase();
      const baseName = path.basename(file, ext);
      if (baseName.toLowerCase() === "index") {
        const parentDir = path.basename(path.dirname(file));
        return parentDir.charAt(0).toUpperCase() + parentDir.slice(1);
      }
      return baseName.charAt(0).toUpperCase() + baseName.slice(1);
    }

    function extractManualProps(fileContent, componentName) {
      const props = {};
      
      // Look for interface/type definitions
      const interfaceRegex = new RegExp(`interface\\s+${componentName}Props\\s*\\{([^}]+)\\}`, 'gs');
      const typeRegex = new RegExp(`type\\s+${componentName}Props\\s*=\\s*\\{([^}]+)\\}`, 'gs');
      
      const interfaceMatch = interfaceRegex.exec(fileContent);
      const typeMatch = typeRegex.exec(fileContent);
      
      const propsContent = interfaceMatch?.[1] || typeMatch?.[1];
      
      if (propsContent) {
        // Parse individual prop definitions
        const propLines = propsContent.split(/[;\n]/).filter(line => line.trim());
        
        propLines.forEach(line => {
          const propMatch = line.match(/^\s*(\w+)(\?)?:\s*(.+?)(?:\s*\/\*\*(.+?)\*\/)?$/);
          if (propMatch) {
            const [, propName, isOptional, propType, comment] = propMatch;
            props[propName] = {
              name: propName,
              type: { name: propType.trim() },
              required: !isOptional,
              description: comment?.trim() || '',
              defaultValue: null
            };
          }
        });
      }
      
      // Also look for JSDoc comments above props
      const jsdocRegex = /\/\*\*\s*(.*?)\s*\*\/\s*(\w+)(\?)?:/gs;
      let jsdocMatch;
      while ((jsdocMatch = jsdocRegex.exec(fileContent)) !== null) {
        const [, description, propName, isOptional] = jsdocMatch;
        if (props[propName]) {
          props[propName].description = description.replace(/\*/g, '').trim();
        }
      }
      
      return props;
    }

    function extractComponentDescription(fileContent, componentName) {
      // Look for JSDoc comment before component declaration
      const componentRegex = new RegExp(
        `\\/\\*\\*([\\s\\S]*?)\\*\\/\\s*(?:export\\s+)?(?:const|function|class)\\s+${componentName}`,
        'i'
      );
      
      const match = componentRegex.exec(fileContent);
      if (match) {
        return match[1]
          .split('\n')
          .map(line => line.replace(/^\s*\*?\s?/, ''))
          .join('\n')
          .trim();
      }
      
      // Fallback: look for component description in comments
      const descriptionRegex = /\/\*\*\s*(.*?Component.*?)\s*\*\//i;
      const descMatch = descriptionRegex.exec(fileContent);
      return descMatch?.[1]?.replace(/\*/g, '').trim() || '';
    }

    function enhanceComponentInfo(component, fileContent) {
      const componentName = component.name;
      
      // Extract manual props if automatic extraction failed
      if (Object.keys(component.props || {}).length === 0) {
        component.props = extractManualProps(fileContent, componentName);
      }
      
      // Extract component description if missing
      if (!component.description) {
        component.description = extractComponentDescription(fileContent, componentName);
      }
      
      // Extract imports for better context
      const importMatches = fileContent.match(/^import.*from.*$/gm) || [];
      component.imports = importMatches.slice(0, 5); // Limit to first 5 imports
      
      // Extract usage examples from comments
      const exampleRegex = /@example\s*([\s\S]*?)(?=@\w+|\*\/)/g;
      const examples = [];
      let exampleMatch;
      while ((exampleMatch = exampleRegex.exec(fileContent)) !== null) {
        examples.push(exampleMatch[1].trim());
      }
      if (examples.length > 0) {
        component.examples = examples;
      }
      
      return component;
    }

    files.forEach((file) => {
      processedFiles++;
      try {
        const fileContent = fs.readFileSync(file, "utf8");
        const docs = parser.parse(file);
        
        if (!docs || docs.length === 0) {
          // Manual fallback for components not detected by parser
          const ext = path.extname(file).toLowerCase();
          if (ext === ".tsx" || ext === ".jsx") {
            // Check if file contains React component patterns
            if (fileContent.includes('React') && 
                (fileContent.includes('export') || fileContent.includes('const') || fileContent.includes('function'))) {
              
              const componentName = getComponentName({}, file);
              let component = {
                id: `${file}::${componentName}`,
                name: componentName,
                file: path.relative(process.cwd(), file),
                props: {},
                description: "",
                raw: fileContent.slice(0, 2000), // Increased raw content limit
                extractionMethod: 'manual'
              };
              
              component = enhanceComponentInfo(component, fileContent);
              components.push(component);
            }
          } else {
            skippedNoExports++;
          }
          return;
        }

        let foundComponent = false;
        docs.forEach((doc) => {
          const nameCandidate = getComponentName(doc, file);
          const isComponent =
            /^[A-Z]/.test(nameCandidate) || (doc.exportName && doc.exportName === "default");
          
          if (!isComponent) {
            skippedNonComponents++;
            return;
          }
          
          foundComponent = true;
          let component = {
            id: `${file}::${nameCandidate}`,
            name: nameCandidate,
            file: path.relative(process.cwd(), file),
            props: doc.props || {},
            description: doc.description || "",
            raw: fileContent.slice(0, 2000),
            extractionMethod: 'automatic',
            // Additional metadata
            exportName: doc.exportName,
            tags: doc.tags || {}
          };
          
          // Enhance with manual extraction if needed
          component = enhanceComponentInfo(component, fileContent);
          components.push(component);
        });
        
        if (!foundComponent) {
          skippedNonComponents++;
        }
        
      } catch (err) {
        console.warn(`Error parsing ${file}:`, err.message);
      }
    });

    // Sort components by name for better organization
    components.sort((a, b) => a.name.localeCompare(b.name));

    // Generate summary statistics
    const summary = {
      totalFiles: processedFiles,
      totalComponents: components.length,
      componentsWithProps: components.filter(c => Object.keys(c.props).length > 0).length,
      componentsWithDescription: components.filter(c => c.description).length,
      skippedNoExports,
      skippedNonComponents,
      extractionMethods: {
        automatic: components.filter(c => c.extractionMethod === 'automatic').length,
        manual: components.filter(c => c.extractionMethod === 'manual').length
      }
    };

    // Create output with metadata
    const output = {
      metadata: {
        generatedAt: new Date().toISOString(),
        extractorVersion: '2.0.0',
        summary
      },
      components
    };

    fs.writeFileSync(outFile, JSON.stringify(output, null, 2));
    
    console.log(`\n=== Component Extraction Summary ===`);
    console.log(`Processed files: ${summary.totalFiles}`);
    console.log(`Extracted components: ${summary.totalComponents}`);
    console.log(`Components with props: ${summary.componentsWithProps}`);
    console.log(`Components with descriptions: ${summary.componentsWithDescription}`);
    console.log(`Automatic extraction: ${summary.extractionMethods.automatic}`);
    console.log(`Manual extraction: ${summary.extractionMethods.manual}`);
    console.log(`Skipped (no exports): ${summary.skippedNoExports}`);
    console.log(`Skipped (non-components): ${summary.skippedNonComponents}`);
    console.log(`Output written to: ${outFile}`);
  }
}

ComponentExtractor.extractComponents();