/**
 * Extraction Classes for Code Extractor
 * Refactored to follow Single Responsibility Principle
 */

const fs = require("fs");
const path = require("path");
const CONFIG = require("../config/extraction.config.js");

// ============================================
// COMPONENT DETECTOR CLASS
// ============================================
class ComponentDetector {
  /**
   * Check if a file contains a React component
   */
  static isReactComponent(fileContent, filePath, repoRoot, debugInfo) {
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
      return debugResult.isComponent;
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
    debugResult.isComponent = score >= CONFIG.detection.componentDetectionThreshold;

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

  /**
   * Detect component type from content
   */
  static detectComponentType(fileContent) {
    if (fileContent.includes('forwardRef')) return 'forwardRef';
    if (fileContent.includes('class') && fileContent.includes('extends')) return 'class';
    if (fileContent.includes('React.memo') || fileContent.includes('memo(')) return 'memoized';
    if (fileContent.includes('function') || fileContent.includes('=>')) return 'functional';
    return 'component';
  }
}

// ============================================
// COMPONENT PARSER CLASS
// ============================================
class ComponentParser {
  /**
   * Get component name from doc or file
   */
  static getComponentName(doc, file) {
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

  /**
   * Extract component description
   */
  static extractComponentDescription(fileContent, componentName) {
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
    return this.generateComponentDescription(fileContent, componentName);
  }

  /**
   * Generate component description from analysis
   */
  static generateComponentDescription(fileContent, componentName) {
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
    const componentType = ComponentDetector.detectComponentType(fileContent);
    
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

  /**
   * Generate prop description
   */
  static generatePropDescription(propName, propType) {
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
}

// Export all classes
module.exports = {
  ComponentDetector,
  ComponentParser
};
