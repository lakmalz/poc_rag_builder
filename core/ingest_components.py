"""
Create chunks.json from component_docs.json for embedding/search purposes
"""
import json
import re
from pathlib import Path
from typing import List, Dict, Any

class ComponentIngestor:
    def __init__(self, input_path: str = None, output_path: str = None):
        self.input_path = Path(input_path) if input_path else Path("build-index/component_docs.json")
        self.output_path = Path(output_path) if output_path else Path("build-index/component_chunks.json")
    
    def clean_text(self, text: str) -> str:
        """Clean and normalize text for better embedding quality"""
        if not text:
            return ""
        
        # Remove excessive whitespace
        text = re.sub(r'\s+', ' ', text.strip())
        
        # Remove common code artifacts that don't help with search
        text = re.sub(r'import\s+.*?from\s+["\'].*?["\'];?', '', text)
        text = re.sub(r'export\s+(default\s+)?', '', text)
        
        # Clean up JSX/TypeScript artifacts
        text = re.sub(r':\s*React\.\w+', '', text)
        text = re.sub(r'React\.\w+<.*?>', '', text)
        
        return text.strip()

    def extract_aggregated_component_chunks(self, component: Dict[str, Any]) -> List[Dict[str, Any]]:
        """Extract chunks from aggregated multi-file component"""
        chunks = []
        component_name = component.get('name', 'Unknown')
        component_id = component.get('id', component_name)
        directory = component.get('directory', '')
        raw_files = component.get('raw', {})
        
        # Get the main component file path (prefer component, then interface, then any available)
        files = component.get('files', {})
        file_path = files.get('component') or files.get('interface') or files.get('style') or files.get('index') or directory
        
        # Chunk 1: Complete aggregated component (ALL files together)
        all_code_parts = []
        
        if raw_files.get('component'):
            all_code_parts.append(f"COMPONENT ({component_name}.component.tsx):\n```tsx\n{raw_files['component']}\n```")
        
        if raw_files.get('interface'):
            all_code_parts.append(f"\nINTERFACES & TYPES ({component_name}.interface.ts):\n```typescript\n{raw_files['interface']}\n```")
        
        if raw_files.get('style'):
            all_code_parts.append(f"\nSTYLES ({component_name}.style.ts):\n```typescript\n{raw_files['style']}\n```")
        
        if raw_files.get('index'):
            all_code_parts.append(f"\nEXPORTS (index.ts):\n```typescript\n{raw_files['index']}\n```")
        
        # Create comprehensive chunk with ALL related code
        chunks.append({
            "chunk_id": f"{component_id}_complete",
            "component_id": component_id,
            "component_name": component_name,
            "directory": directory,
            "file": file_path,
            "chunk_type": "complete_component",
            "text": f"{component_name} complete component with all files:\n\n" + "\n\n".join(all_code_parts)
        })
        
        # Chunk 2: Basic info
        basic_info_parts = [f"Component: {component_name}"]
        
        if component.get('description'):
            desc = self.clean_text(component['description'])
            if desc:
                basic_info_parts.append(f"Description: {desc}")
        
        if directory:
            basic_info_parts.append(f"Location: {directory}")
        
        file_types = list(component.get('files', {}).keys())
        if file_types:
            basic_info_parts.append(f"Files: {', '.join(file_types)}")
        
        chunks.append({
            "chunk_id": f"{component_id}_basic",
            "component_id": component_id,
            "component_name": component_name,
            "directory": directory,
            "file": file_path,
            "chunk_type": "basic_info",
            "text": " | ".join(basic_info_parts)
        })
        
        # Chunk 3: Props information
        if component.get('props') and isinstance(component['props'], dict):
            props_info = self.format_props_info(component['props'], component_name)
            if props_info:
                chunks.append({
                    "chunk_id": f"{component_id}_props",
                    "component_id": component_id,
                    "component_name": component_name,
                    "directory": directory,
                    "file": file_path,
                    "chunk_type": "props",
                    "text": props_info
                })
        
        # Chunk 4: Component source only (for focused component code search)
        if raw_files.get('component'):
            chunks.append({
                "chunk_id": f"{component_id}_component_source",
                "component_id": component_id,
                "component_name": component_name,
                "directory": directory,
                "file": file_path,
                "chunk_type": "component_source",
                "text": f"{component_name} component implementation:\n```tsx\n{raw_files['component']}\n```"
            })
        
        # Chunk 5: Interfaces & Types (for type search)
        if raw_files.get('interface'):
            interfaces = component.get('interfaces', [])
            types = component.get('types', [])
            enums = component.get('enums', [])
            
            type_summary_parts = [f"{component_name} type definitions:"]
            if interfaces:
                type_summary_parts.append(f"Interfaces: {', '.join([i['name'] for i in interfaces])}")
            if types:
                type_summary_parts.append(f"Types: {', '.join([t['name'] for t in types])}")
            if enums:
                type_summary_parts.append(f"Enums: {', '.join([e['name'] for e in enums])}")
            
            chunks.append({
                "chunk_id": f"{component_id}_interfaces",
                "component_id": component_id,
                "component_name": component_name,
                "directory": directory,
                "file": file_path,
                "chunk_type": "interfaces",
                "text": " | ".join(type_summary_parts) + f"\n\n```typescript\n{raw_files['interface']}\n```"
            })
        
        # Chunk 6: Styles (for style search)
        if raw_files.get('style'):
            style_info = component.get('styles', {})
            style_type = style_info.get('type', 'css-in-js') if isinstance(style_info, dict) else 'css-in-js'
            
            chunks.append({
                "chunk_id": f"{component_id}_styles",
                "component_id": component_id,
                "component_name": component_name,
                "directory": directory,
                "file": file_path,
                "chunk_type": "styles",
                "text": f"{component_name} styles ({style_type}):\n```typescript\n{raw_files['style']}\n```"
            })
        
        # Chunk 7: Searchable code snippets (cleaned versions)
        if raw_files.get('component'):
            code_chunks = self.process_code_snippet(
                raw_files['component'], 
                component_id, 
                component_name,
                f"{directory}/{component_name}.component.tsx"
            )
            chunks.extend(code_chunks)
        
        print(f"      Created {len(chunks)} chunks (complete + individual parts)")
        return chunks

    def extract_component_chunks(self, component: Dict[str, Any]) -> List[Dict[str, Any]]:
        """Extract meaningful chunks from a single component"""
        chunks = []
        component_name = component.get('name', 'Unknown')
        component_id = component.get('id', '')
        aggregation_type = component.get('aggregationType', 'single-file')
        
        # Handle aggregated multi-file components
        if aggregation_type == 'multi-file':
            print(f"   📦 Processing aggregated component: {component_name}")
            return self.extract_aggregated_component_chunks(component)
        
        # Handle single-file components (existing logic)
        file_path = component.get('file', '')
        
        # Check index.ts/tsx files - skip only if they're simple re-exports
        if file_path.endswith('/index.ts') or file_path.endswith('/index.tsx'):
            # Check if this index file has actual component code (not just re-exports)
            has_code = component.get('raw') and len(component.get('raw', '').strip()) > 100
            has_props = component.get('props') and len(component.get('props', {})) > 0
            
            if not has_code and not has_props:
                print(f"   ⏩ Skipping re-export index file: {file_path}")
                return []
            else:
                print(f"   ✅ Including index file with component code: {file_path}")
        
        # Chunk 1: Basic component info
        basic_info_parts = [f"Component: {component_name}"]
        
        if component.get('description'):
            desc = self.clean_text(component['description'])
            if desc:
                basic_info_parts.append(f"Description: {desc}")
        
        if file_path:
            # Extract meaningful path info
            path_parts = file_path.split('/')
            relevant_path = '/'.join(path_parts[-3:]) if len(path_parts) > 3 else file_path
            basic_info_parts.append(f"Location: {relevant_path}")
        
        chunks.append({
            "chunk_id": f"{component_id}_basic",
            "component_id": component_id,
            "component_name": component_name,
            "file": file_path,
            "chunk_type": "basic_info",
            "text": " | ".join(basic_info_parts)
        })
        
        # Chunk 2: Props information (if exists)
        if component.get('props') and isinstance(component['props'], dict):
            props_info = self.format_props_info(component['props'], component_name)
            if props_info:
                chunks.append({
                    "chunk_id": f"{component_id}_props",
                    "component_id": component_id,
                    "component_name": component_name,
                    "file": file_path,
                    "chunk_type": "props",
                    "text": props_info
                })
        
        # NEW: Chunk for FULL SOURCE CODE (unmodified, for LLM usage examples)
        if component.get('raw'):
            full_source = component['raw'].strip()
            if full_source:
                chunks.append({
                    "chunk_id": f"{component_id}_full_source",
                    "component_id": component_id,
                    "component_name": component_name,
                    "file": file_path,
                    "chunk_type": "full_source",
                    "text": f"{component_name} complete source code:\n```tsx\n{full_source}\n```"
                })
        
        # Chunk 3: Code snippet chunks for search (cleaned/fragmented)
        if component.get('raw'):
            code_chunks = self.process_code_snippet(
                component['raw'], 
                component_id, 
                component_name, 
                file_path
            )
            chunks.extend(code_chunks)
        
        # Chunk 4: Full Interface code (unmodified)
        if component.get('interfaceCode'):
            interface_code = component['interfaceCode'].strip()
            if interface_code:
                chunks.append({
                    "chunk_id": f"{component_id}_full_interface",
                    "component_id": component_id,
                    "component_name": component_name,
                    "file": file_path,
                    "chunk_type": "full_interface",
                    "text": f"{component_name} complete interface/types:\n```typescript\n{interface_code}\n```"
                })
                
                # Also add cleaned version for search
                cleaned_interface_code = self.clean_code_for_search(interface_code)
                if cleaned_interface_code:
                    chunks.append({
                        "chunk_id": f"{component_id}_interface",
                        "component_id": component_id,
                        "component_name": component_name,
                        "file": file_path,
                        "chunk_type": "interface_code",
                        "text": f"{component_name} interface definition: {cleaned_interface_code}"
                    })
        return chunks
    
    def format_props_info(self, props: Dict[str, Any], component_name: str) -> str:
        """Format props information for embedding"""
        if not props:
            return ""
        
        props_parts = [f"{component_name} component props:"]
        
        for prop_name, prop_info in props.items():
            if not isinstance(prop_info, dict):
                continue
            
            prop_parts = [prop_name]
            
            # Type information
            prop_type = self.extract_prop_type(prop_info)
            if prop_type:
                prop_parts.append(f"type: {prop_type}")
            
            # Description
            if prop_info.get('description'):
                desc = self.clean_text(prop_info['description'])
                if desc:
                    prop_parts.append(f"description: {desc}")
            
            # Required/optional
            if prop_info.get('required'):
                prop_parts.append("required")
            else:
                prop_parts.append("optional")
            
            # Default value
            if 'defaultValue' in prop_info and prop_info['defaultValue']:
                default_val = str(prop_info['defaultValue'])
                if len(default_val) < 50:  # Only include short default values
                    prop_parts.append(f"default: {default_val}")
            
            props_parts.append(" - ".join(prop_parts))
        
        return " | ".join(props_parts)
    
    def extract_prop_type(self, prop_info: Dict[str, Any]) -> str:
        """Extract clean type information from prop"""
        type_info = prop_info.get('type', {})
        
        if isinstance(type_info, dict):
            type_name = type_info.get('name', '')
            if type_name:
                return type_name
        elif isinstance(type_info, str):
            return type_info
        
        return ""
    
    def process_code_snippet(self, raw_code: str, component_id: str, 
                           component_name: str, file_path: str) -> List[Dict[str, Any]]:
        """Process raw code into searchable chunks"""
        if not raw_code or len(raw_code.strip()) < 50:
            return []
        
        # Clean the code
        cleaned_code = self.clean_code_for_search(raw_code)
        
        # If code is short enough, create single chunk
        if len(cleaned_code) <= 600:
            return [{
                "chunk_id": f"{component_id}_code",
                "component_id": component_id,
                "component_name": component_name,
                "file": file_path,
                "chunk_type": "code",
                "text": f"{component_name} implementation: {cleaned_code}"
            }]
        
        # Split longer code into chunks
        chunks = []
        code_chunks = self.split_code(cleaned_code, max_length=500)
        
        for i, chunk in enumerate(code_chunks):
            chunks.append({
                "chunk_id": f"{component_id}_code_{i}",
                "component_id": component_id,
                "component_name": component_name,
                "file": file_path,
                "chunk_type": "code",
                "text": f"{component_name} code part {i+1}: {chunk}"
            })
        
        return chunks
    
    def clean_code_for_search(self, code: str) -> str:
        """Clean code to make it more searchable"""
        # Remove imports
        lines = code.split('\n')
        cleaned_lines = []
        
        for line in lines:
            line = line.strip()
            
            # Skip empty lines and imports
            if not line or line.startswith('import ') or line.startswith('export '):
                continue
            
            # Skip comments (but keep JSDoc comments as they're useful)
            if line.startswith('//') and not line.startswith('///'):
                continue
            
            cleaned_lines.append(line)
        
        cleaned_code = ' '.join(cleaned_lines)
        
        # Remove excessive whitespace
        cleaned_code = re.sub(r'\s+', ' ', cleaned_code)
        
        return cleaned_code.strip()
    
    def split_code(self, code: str, max_length: int = 500) -> List[str]:
        """Split code into chunks while trying to preserve meaning"""
        if len(code) <= max_length:
            return [code]
        
        chunks = []
        current_chunk = ""
        
        # Split by sentences/statements first
        sentences = re.split(r'[.;{}]\s*', code)
        
        for sentence in sentences:
            sentence = sentence.strip()
            if not sentence:
                continue
            
            # If adding this sentence exceeds limit, save current chunk
            if len(current_chunk) + len(sentence) > max_length and current_chunk:
                chunks.append(current_chunk.strip())
                current_chunk = sentence
            else:
                if current_chunk:
                    current_chunk += " " + sentence
                else:
                    current_chunk = sentence
        
        # Add remaining chunk
        if current_chunk:
            chunks.append(current_chunk.strip())
        
        return chunks
    
    def create_chunks(self, max_components: int = None) -> None:
        """Main method to create chunks from component docs"""
        if not self.input_path.exists():
            print(f"Component docs file not found: {self.input_path}")
            # Try to run Node extractor to generate component_docs.json
            node_script = Path(__file__).parent / "scripts" / "extract-components.js"
            if node_script.exists():
                import subprocess
                print(f"Running Node extractor: {node_script}")
                process = subprocess.Popen([
                    "node", str(node_script)
                ], stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
                for line in process.stdout:
                    print(line, end='')
                process.stdout.close()
                returncode = process.wait()
                if returncode != 0:
                    err = process.stderr.read()
                    process.stderr.close()
                    print("Node extractor failed:")
                    print(err)
                    raise RuntimeError("Node extractor failed")
                process.stderr.close()
                if not self.input_path.exists():
                    raise FileNotFoundError(f"Component docs file still not found after running Node extractor: {self.input_path}")
            else:
                raise FileNotFoundError(f"Component docs file not found and Node extractor script missing: {self.input_path}")

        print(f"Loading components from {self.input_path}")

        with open(self.input_path, 'r', encoding='utf-8') as f:
            components = json.load(f)

        if max_components:
            components = components[:max_components]
            print(f"Processing first {len(components)} components for testing")

        all_chunks = []
        components_processed = []
        components_skipped = []

        for i, component in enumerate(components):
            try:
                component_name = component.get('name', 'Unknown')
                component_chunks = self.extract_component_chunks(component)
                
                if component_chunks:
                    all_chunks.extend(component_chunks)
                    components_processed.append(component_name)
                else:
                    components_skipped.append({
                        'name': component_name,
                        'file': component.get('file', ''),
                        'reason': 'No chunks generated'
                    })

                if (i + 1) % 10 == 0:
                    print(f"Processed {i + 1}/{len(components)} components, generated {len(all_chunks)} chunks so far")

            except Exception as e:
                component_name = component.get('name', 'unknown')
                print(f"Error processing component {component_name}: {e}")
                components_skipped.append({
                    'name': component_name,
                    'file': component.get('file', ''),
                    'reason': str(e)
                })
                continue

        # Create output directory if it doesn't exist
        self.output_path.parent.mkdir(parents=True, exist_ok=True)

        # Write chunks to file
        with open(self.output_path, 'w', encoding='utf-8') as f:
            json.dump(all_chunks, f, indent=2, ensure_ascii=False)

        print(f"\n{'='*60}")
        print(f"📊 CHUNKING VALIDATION SUMMARY")
        print(f"{'='*60}")
        print(f"✅ Components processed: {len(components_processed)}/{len(components)}")
        print(f"📦 Total chunks created: {len(all_chunks)}")
        
        if components_skipped:
            print(f"\n⚠️  WARNING: {len(components_skipped)} components skipped:")
            for skip_info in components_skipped[:5]:
                print(f"   - {skip_info['name']} ({skip_info['file']})")
                print(f"     Reason: {skip_info['reason']}")
            if len(components_skipped) > 5:
                print(f"   ... and {len(components_skipped) - 5} more")
        
        print(f"\n📁 Output saved to: {self.output_path}")

        # Print statistics
        chunk_types = {}
        for chunk in all_chunks:
            chunk_type = chunk.get('chunk_type', 'unknown')
            chunk_types[chunk_type] = chunk_types.get(chunk_type, 0) + 1

        print(f"\n📊 Chunk types distribution:")
        for chunk_type, count in sorted(chunk_types.items()):
            print(f"   {chunk_type:20s}: {count:4d} chunks")
        
        # Component-level statistics
        from collections import Counter
        component_chunk_counts = Counter([c['component_name'] for c in all_chunks])
        avg_chunks_per_component = len(all_chunks) / len(components_processed) if components_processed else 0
        max_chunks = max(component_chunk_counts.values()) if component_chunk_counts else 0
        max_chunk_component = max(component_chunk_counts, key=component_chunk_counts.get) if component_chunk_counts else "None"
        
        print(f"\n📈 Per-component statistics:")
        print(f"   Average chunks per component: {avg_chunks_per_component:.1f}")
        print(f"   Max chunks in one component: {max_chunks} ({max_chunk_component})")
        print(f"{'='*60}\n")


def main():
    """Command line interface"""
    import argparse
    
    parser = argparse.ArgumentParser(description='Create chunks from component docs for embeddings')
    parser.add_argument('--input', help='Input component_docs.json file path')
    parser.add_argument('--output', help='Output chunks.json file path')
    parser.add_argument('--max-components', type=int, help='Maximum number of components to process (for testing)')
    
    args = parser.parse_args()
    
    chunker = ComponentIngestor(args.input, args.output)
    chunker.create_chunks(args.max_components)


if __name__ == "__main__":
    # For testing, process only first 5 components
    chunker = ComponentIngestor()
    chunker.create_chunks(max_components=30)