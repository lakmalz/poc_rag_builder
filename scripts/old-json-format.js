const fs = require("fs");
const path = require("path");
const glob = require("glob");
const reactDocgenTs = require("react-docgen-typescript");

// Configuration
const config = {
  srcDir: "./web-extensions/src",
  outputFile: "./component_doc.json",
  projectName: "web-extensions",
  componentPattern: {
    // Your specific pattern: ComponentName.component.tsx
    component: "**/*.component.tsx",
    interface: "**/*.interface.ts",
    style: "**/*.style.ts",
    index: "**/index.ts"
  }
};

// Initialize parser
let tsConfigParser;
try {
  tsConfigParser = reactDocgenTs.withCustomConfig("./tsconfig.json", {
    savePropValueAsString: true,
    shouldExtractLiteralValuesFromEnum: true,
    shouldRemoveUndefinedFromOptional: true,
    propFilter: (prop) => {
      if (prop.parent) return !prop.parent.fileName.includes("node_modules");
      return true;
    }
  });
} catch (error) {
  console.warn("⚠️  Using default parser");
  tsConfigParser = reactDocgenTs.parse;
}

// Find all component files
function findComponentFiles(baseDir) {
  const componentFiles = glob.sync(
    path.join(baseDir, config.componentPattern.component),
    { ignore: ["**/node_modules/**", "**/dist/**", "**/build/**"] }
  );
  return componentFiles;
}

// Find related files for a component
function findRelatedFiles(componentPath) {
  const dir = path.dirname(componentPath);
  const baseName = path.basename(componentPath, ".component.tsx");
  
  const related = {
    component: componentPath,
    interface: null,
    style: null,
    index: null
  };
  
  // Look for .interface.ts
  const interfacePath = path.join(dir, `${baseName}.interface.ts`);
  if (fs.existsSync(interfacePath)) {
    related.interface = interfacePath;
  }
  
  // Look for .style.ts
  const stylePath = path.join(dir, `${baseName}.style.ts`);
  if (fs.existsSync(stylePath)) {
    related.style = stylePath;
  }
  
  // Look for index.ts
  const indexPath = path.join(dir, "index.ts");
  if (fs.existsSync(indexPath)) {
    related.index = indexPath;
  }
  
  return related;
}

// Extract deprecation info from index.ts
function extractDeprecationInfo(indexContent) {
  if (!indexContent) return null;
  
  const lines = indexContent.split('\n');
  const deprecation = {
    isDeprecated: false,
    oldComponent: null,
    newComponent: null,
    message: null,
    example: null
  };
  
  lines.forEach(line => {
    if (line.includes("Deprecated:")) {
      deprecation.isDeprecated = true;
      const match = line.match(/Use\s+(\w+)\s+instead\s+of\s+(\w+)/);
      if (match) {
        deprecation.newComponent = match[1];
        deprecation.oldComponent = match[2];
      }
      deprecation.message = line.replace(/\/\/\s*Deprecated:\s*/, "").trim();
    }
    if (line.includes("Example:")) {
      deprecation.example = line.replace(/\/\/\s*Example:\s*/, "").trim();
    }
  });
  
  return deprecation.isDeprecated ? deprecation : null;
}

// Extract TypeScript types and interfaces
function extractTypes(content) {
  const types = [];
  
  // Extract type definitions: type Gender = "Male" | "Female" | "Other"
  const typeRegex = /export\s+type\s+(\w+)\s*=\s*([^;]+);/g;
  let match;
  while ((match = typeRegex.exec(content)) !== null) {
    types.push({
      kind: "type",
      name: match[1],
      definition: match[2].trim(),
      raw: match[0]
    });
  }
  
  // Extract interfaces
  const interfaceRegex = /export\s+interface\s+(\w+)\s*{([^}]*)}/gs;
  while ((match = interfaceRegex.exec(content)) !== null) {
    const properties = [];
    const propsBody = match[2];
    const propRegex = /(\w+)\??\s*:\s*([^;]+);/g;
    let propMatch;
    while ((propMatch = propRegex.exec(propsBody)) !== null) {
      properties.push({
        name: propMatch[1],
        type: propMatch[2].trim(),
        optional: propsBody.includes(`${propMatch[1]}?`)
      });
    }
    
    types.push({
      kind: "interface",
      name: match[1],
      properties: properties,
      raw: match[0]
    });
  }
  
  return types;
}

// Extract styles (makeStyles, styled-components, etc.)
function extractStyles(content) {
  const styles = {
    type: null,
    classes: [],
    raw: content
  };
  
  // Detect makeStyles (MUI)
  if (content.includes("makeStyles")) {
    styles.type = "makeStyles";
    const classRegex = /(\w+):\s*{([^}]+)}/g;
    let match;
    while ((match = classRegex.exec(content)) !== null) {
      styles.classes.push({
        name: match[1],
        styles: match[2].trim()
      });
    }
  }
  
  // Detect styled-components
  if (content.includes("styled.")) {
    styles.type = "styled-components";
  }
  
  // Detect CSS modules
  if (content.includes("import styles from")) {
    styles.type = "css-modules";
  }
  
  return styles;
}

// Extract MUI components used
function extractMUIComponents(content) {
  const muiImportMatch = content.match(/import\s+{([^}]+)}\s+from\s+["']@mui\/material["']/);
  if (!muiImportMatch) return [];
  
  return muiImportMatch[1]
    .split(',')
    .map(comp => comp.trim())
    .filter(comp => comp.length > 0);
}

// Extract hooks and state
function extractHooksAndState(content) {
  const hooks = {
    hooks: [],
    stateVariables: [],
    effects: [],
    eventHandlers: []
  };
  
  // Extract useState
  const stateRegex = /const\s+\[(\w+),\s*(\w+)\]\s*=\s*useState(?:<([^>]+)>)?\(([^)]*)\)/g;
  let match;
  while ((match = stateRegex.exec(content)) !== null) {
    hooks.stateVariables.push({
      variable: match[1],
      setter: match[2],
      type: match[3] || null,
      initialValue: match[4].trim()
    });
    if (!hooks.hooks.includes("useState")) hooks.hooks.push("useState");
  }
  
  // Extract useEffect
  if (content.includes("useEffect")) {
    hooks.hooks.push("useEffect");
    const effectRegex = /useEffect\(\(\)\s*=>\s*{([^}]+)}/gs;
    while ((match = effectRegex.exec(content)) !== null) {
      hooks.effects.push({
        body: match[1].trim().substring(0, 100) + "..."
      });
    }
  }
  
  // Extract custom hooks
  const customHookRegex = /const\s+\w+\s*=\s*(use\w+)\(/g;
  while ((match = customHookRegex.exec(content)) !== null) {
    if (!hooks.hooks.includes(match[1])) {
      hooks.hooks.push(match[1]);
    }
  }
  
  // Extract event handlers
  const handlerRegex = /const\s+(handle\w+)\s*=\s*\([^)]*\)\s*=>/g;
  while ((match = handlerRegex.exec(content)) !== null) {
    hooks.eventHandlers.push(match[1]);
  }
  
  return hooks;
}

// Extract JSX structure
function extractJSXStructure(content) {
  const structure = {
    rootComponent: null,
    childComponents: [],
    htmlElements: []
  };
  
  // Find return statement
  const returnMatch = content.match(/return\s*\(?\s*<(\w+)/);
  if (returnMatch) {
    structure.rootComponent = returnMatch[1];
  }
  
  // Extract all JSX components
  const jsxRegex = /<(\w+)[\s/>]/g;
  let match;
  const seen = new Set();
  while ((match = jsxRegex.exec(content)) !== null) {
    const comp = match[1];
    if (!seen.has(comp)) {
      seen.add(comp);
      if (comp[0] === comp[0].toUpperCase()) {
        structure.childComponents.push(comp);
      } else {
        structure.htmlElements.push(comp);
      }
    }
  }
  
  return structure;
}

// Extract component props with documentation
function extractPropsDocumentation(docs) {
  if (!docs || docs.length === 0) return {};
  
  const props = {};
  const doc = docs[0];
  
  if (doc.props) {
    Object.entries(doc.props).forEach(([name, prop]) => {
      props[name] = {
        name: name,
        type: prop.type?.name || "unknown",
        required: prop.required || false,
        description: prop.description || "",
        defaultValue: prop.defaultValue?.value || null,
        tsType: prop.type?.raw || null
      };
    });
  }
  
  return props;
}

// Process a complete component with all related files
function processComponent(componentPath) {
  console.log(`\n📦 Processing: ${path.basename(componentPath)}`);
  
  const relatedFiles = findRelatedFiles(componentPath);
  const componentName = path.basename(componentPath, ".component.tsx");
  const directory = path.relative(config.srcDir, path.dirname(componentPath));
  
  // Read all files
  const componentContent = fs.readFileSync(relatedFiles.component, "utf-8");
  const interfaceContent = relatedFiles.interface ? fs.readFileSync(relatedFiles.interface, "utf-8") : null;
  const styleContent = relatedFiles.style ? fs.readFileSync(relatedFiles.style, "utf-8") : null;
  const indexContent = relatedFiles.index ? fs.readFileSync(relatedFiles.index, "utf-8") : null;
  
  // Extract data
  const types = interfaceContent ? extractTypes(interfaceContent) : [];
  const styles = styleContent ? extractStyles(styleContent) : null;
  const deprecation = extractDeprecationInfo(indexContent);
  const muiComponents = extractMUIComponents(componentContent);
  const hooksAndState = extractHooksAndState(componentContent);
  const jsxStructure = extractJSXStructure(componentContent);
  
  // Parse with docgen
  let propsDocumentation = {};
  let componentDescription = `A ${componentName} component for user profile management.`;
  
  try {
    const docs = tsConfigParser.parse(relatedFiles.component);
    if (docs && docs.length > 0) {
      propsDocumentation = extractPropsDocumentation(docs);
      componentDescription = docs[0].description || componentDescription;
    }
  } catch (error) {
    console.warn(`  ⚠️  Could not parse with docgen: ${error.message}`);
  }
  
  // Build complete component data
  const componentData = {
    // Basic Info
    id: `${config.projectName}/${directory}/${componentName}.component.tsx::${componentName}`,
    name: componentName,
    displayName: componentName,
    description: componentDescription,
    
    // File paths
    files: {
      component: `${config.projectName}/${directory}/${componentName}.component.tsx`,
      interface: relatedFiles.interface ? `${config.projectName}/${directory}/${componentName}.interface.ts` : null,
      style: relatedFiles.style ? `${config.projectName}/${directory}/${componentName}.style.ts` : null,
      index: relatedFiles.index ? `${config.projectName}/${directory}/index.ts` : null
    },
    
    // Directory
    directory: directory,
    
    // Props
    props: propsDocumentation,
    
    // Types & Interfaces
    types: types,
    
    // Styles
    styles: styles,
    
    // Component Analysis
    analysis: {
      componentType: "functional",
      muiComponents: muiComponents,
      hooks: hooksAndState.hooks,
      stateVariables: hooksAndState.stateVariables,
      effects: hooksAndState.effects,
      eventHandlers: hooksAndState.eventHandlers,
      jsxStructure: jsxStructure,
      features: [
        ...hooksAndState.hooks.length > 0 ? ["hooks"] : [],
        ...hooksAndState.stateVariables.length > 0 ? ["state"] : [],
        ...hooksAndState.effects.length > 0 ? ["effects"] : [],
        ...hooksAndState.eventHandlers.length > 0 ? ["event-handling"] : [],
        ...muiComponents.length > 0 ? ["material-ui"] : [],
        ...styles ? ["styling"] : []
      ]
    },
    
    // Deprecation
    deprecation: deprecation,
    
    // Raw Code (for RAG context) - ALWAYS INCLUDE
    raw: componentContent, // Main component code at root level for easy access
    
    code: {
      component: componentContent,
      interface: interfaceContent || null,
      style: styleContent || null,
      index: indexContent || null
    },
    
    // Metadata
    extractedAt: new Date().toISOString(),
    extractionMethod: Object.keys(propsDocumentation).length > 0 ? "docgen" : "manual"
  };
  
  console.log(`  ✅ Extracted: ${Object.keys(propsDocumentation).length} props, ${types.length} types, ${muiComponents.length} MUI components`);
  console.log(`  📝 Code size: component=${componentContent.length} chars, interface=${interfaceContent?.length || 0} chars, style=${styleContent?.length || 0} chars`);
  
  console.log(`  ✅ Extracted: ${Object.keys(propsDocumentation).length} props, ${types.length} types, ${muiComponents.length} MUI components`);
  
  return componentData;
}

// Generate semantic chunks for RAG
function generateSemanticChunks(component) {
  const chunks = [];
  
  // Chunk 1: Overview & Discovery
  chunks.push({
    id: `${component.id}::overview`,
    type: "overview",
    componentName: component.name,
    content: `Component: ${component.name}
Description: ${component.description}
Directory: ${component.directory}
Features: ${component.analysis.features.join(", ")}
MUI Components: ${component.analysis.muiComponents.join(", ")}
Props: ${Object.keys(component.props).join(", ")}
${component.deprecation ? `\n⚠️ DEPRECATED: ${component.deprecation.message}` : ""}`,
    metadata: {
      componentId: component.id,
      file: component.files.component,
      isDeprecated: !!component.deprecation
    }
  });
  
  // Chunk 2: Props & Types
  if (Object.keys(component.props).length > 0 || component.types.length > 0) {
    let content = `Props and Types for ${component.name}:\n\n`;
    
    // Props
    content += "PROPS:\n";
    Object.values(component.props).forEach(prop => {
      content += `- ${prop.name}: ${prop.type}${prop.required ? ' (required)' : ' (optional)'}\n`;
      if (prop.description) content += `  ${prop.description}\n`;
    });
    
    // Types
    if (component.types.length > 0) {
      content += "\n\nTYPES:\n";
      component.types.forEach(type => {
        content += `- ${type.name} (${type.kind})\n`;
        if (type.kind === "interface" && type.properties) {
          type.properties.forEach(prop => {
            content += `  - ${prop.name}: ${prop.type}\n`;
          });
        } else if (type.kind === "type") {
          content += `  ${type.definition}\n`;
        }
      });
    }
    
    chunks.push({
      id: `${component.id}::props-types`,
      type: "props-types",
      componentName: component.name,
      content: content,
      metadata: {
        componentId: component.id,
        propNames: Object.keys(component.props),
        typeNames: component.types.map(t => t.name)
      }
    });
  }
  
  // Chunk 3: Implementation & Code
  chunks.push({
    id: `${component.id}::implementation`,
    type: "implementation",
    componentName: component.name,
    content: component.code.component,
    metadata: {
      componentId: component.id,
      hooks: component.analysis.hooks,
      stateVariables: component.analysis.stateVariables.map(s => s.variable),
      eventHandlers: component.analysis.eventHandlers
    }
  });
  
  // Chunk 4: Styles (if exists)
  if (component.code.style) {
    chunks.push({
      id: `${component.id}::styles`,
      type: "styles",
      componentName: component.name,
      content: `Styles for ${component.name}:\n\n${component.code.style}`,
      metadata: {
        componentId: component.id,
        styleType: component.styles?.type || "unknown",
        classes: component.styles?.classes?.map(c => c.name) || []
      }
    });
  }
  
  // Chunk 5: Usage Example
  const propsExample = Object.entries(component.props)
    .slice(0, 3)
    .map(([name, prop]) => `${name}={${prop.required ? 'required' : 'optional'}}`)
    .join(" ");
  
  chunks.push({
    id: `${component.id}::usage`,
    type: "usage",
    componentName: component.name,
    content: `Usage Example for ${component.name}:

import ${component.name} from "${component.files.component.replace(config.projectName + '/', './')}";

<${component.name} ${propsExample} />

Event Handlers:
${component.analysis.eventHandlers.map(h => `- ${h}`).join('\n')}

State Variables:
${component.analysis.stateVariables.map(s => `- ${s.variable}: ${s.type || 'unknown'}`).join('\n')}`,
    metadata: {
      componentId: component.id,
      importPath: component.files.component
    }
  });
  
  return chunks;
}

// Main extraction
function main() {
  console.log("🚀 Starting complete React component extraction...\n");
  console.log(`📁 Source: ${config.srcDir}`);
  console.log(`📦 Project: ${config.projectName}\n`);
  
  const componentFiles = findComponentFiles(config.srcDir);
  console.log(`Found ${componentFiles.length} component files`);
  
  const components = [];
  const errors = [];
  componentFiles.forEach((filePath, index) => {
    try {
      const component = processComponent(filePath);
      components.push(component);
    } catch (error) {
      console.error(`\n❌ Error processing ${path.basename(filePath)}:`, error.message);
      errors.push({ file: filePath, error: error.message });
    }
  });

  // Save results
  const output = {
    metadata: {
      projectName: config.projectName,
      totalComponents: components.length,
      extractedAt: new Date().toISOString(),
      sourceDirectory: config.srcDir,
      errors: errors.length > 0 ? errors : undefined
    },
    components: components
  };

  fs.writeFileSync(config.outputFile, JSON.stringify(output, null, 2));

  console.log(`\n\n✨ Extraction Complete!`);
  console.log(`📄 Full data: ${config.outputFile}`);
  console.log(` Components: ${components.length}`);
  if (errors.length > 0) {
    console.log(`⚠️  Errors: ${errors.length}`);
  }
}

main();