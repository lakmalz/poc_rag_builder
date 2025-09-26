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

    def extract_component_chunks(self, component: Dict[str, Any]) -> List[Dict[str, Any]]:
        """Extract meaningful chunks from a single component"""
        chunks = []
        component_name = component.get('name', 'Unknown')
        file_path = component.get('file', '')
        component_id = component.get('id', '')
        
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
        
        # Chunk 3: Code snippet (if exists and meaningful)
        if component.get('raw'):
            code_chunks = self.process_code_snippet(
                component['raw'], 
                component_id, 
                component_name, 
                file_path
            )
            chunks.extend(code_chunks)
        
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

        for i, component in enumerate(components):
            try:
                component_chunks = self.extract_component_chunks(component)
                all_chunks.extend(component_chunks)

                if (i + 1) % 10 == 0:
                    print(f"Processed {i + 1} components, generated {len(all_chunks)} chunks so far")

            except Exception as e:
                print(f"Error processing component {component.get('name', 'unknown')}: {e}")
                continue

        # Create output directory if it doesn't exist
        self.output_path.parent.mkdir(parents=True, exist_ok=True)

        # Write chunks to file
        with open(self.output_path, 'w', encoding='utf-8') as f:
            json.dump(all_chunks, f, indent=2, ensure_ascii=False)

        print(f"Created {len(all_chunks)} chunks from {len(components)} components")
        print(f"Output saved to: {self.output_path}")

        # Print statistics
        chunk_types = {}
        for chunk in all_chunks:
            chunk_type = chunk.get('chunk_type', 'unknown')
            chunk_types[chunk_type] = chunk_types.get(chunk_type, 0) + 1

        print("\nChunk types created:")
        for chunk_type, count in chunk_types.items():
            print(f"  {chunk_type}: {count}")


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