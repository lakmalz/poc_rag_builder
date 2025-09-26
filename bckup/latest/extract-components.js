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

    // Adjust glob pattern to exclude CSS, JSON, and non-JS/TS files, include only js, jsx, ts, tsx
    const files = glob.sync(path.join(repoPath, "**/*.{js,jsx,ts,tsx}"));

    // Use custom config to support tsconfig paths and better TypeScript support
    const parser = reactDocgenTs.withCustomConfig(path.join(__dirname, "..", "Custom-ui", "tsconfig.json"), {
      savePropValueAsString: true,
    });

    let skippedNoExports = 0;
    let skippedNonComponents = 0;

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

    files.forEach((file) => {
      try {
        const docs = parser.parse(file);
        if (!docs || docs.length === 0) {
          // No exports detected by parser, attempt to detect default export or arrow function components manually
          const ext = path.extname(file).toLowerCase();
          if (ext === ".tsx" || ext === ".jsx") {
            // Read raw content
            const rawContent = fs.readFileSync(file, "utf8").slice(0, 1000);
            // Determine component name using fallback logic
            const componentName = getComponentName({}, file);
            components.push({
              id: `${file}::${componentName}`,
              name: componentName,
              file,
              props: {},
              description: "",
              raw: rawContent,
            });
          } else {
            skippedNoExports++;
          }
          return;
        }

        let foundComponent = false;
        docs.forEach((doc) => {
          // Only include components: name starts with uppercase or is default export
          const nameCandidate = getComponentName(doc, file);
          const isComponent =
            /^[A-Z]/.test(nameCandidate) || (doc.exportName && doc.exportName === "default");
          if (!isComponent) return;
          foundComponent = true;
          components.push({
            id: `${file}::${nameCandidate}`,
            name: nameCandidate,
            file,
            props: doc.props || {},
            description: doc.description || "",
            raw: fs.readFileSync(file, "utf8").slice(0, 1000),
          });
        });
      } catch (err) {
        console.warn(`Error parsing ${file}:`, err.message);
      }
    });

    console.log(`Skipped ${skippedNoExports} files with no exports.`);
    console.log(`Skipped ${skippedNonComponents} files with no components.`);

    fs.writeFileSync(outFile, JSON.stringify(components, null, 2));
    console.log(`Extracted ${components.length} components → ${outFile}`);
  }
}

ComponentExtractor.extractComponents();