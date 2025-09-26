import subprocess
import json
from pathlib import Path
import ijson
import gc
import os
import sys

PROJECT_ROOT = Path(__file__).parent
BUILD_INDEX_PATH = PROJECT_ROOT / "build-index"
NODE_SCRIPT = PROJECT_ROOT / "scripts" / "extract-components.js"
COMPONENT_DOCS = BUILD_INDEX_PATH / "component_docs.json"
COMPONENT_CHUNKS = BUILD_INDEX_PATH / "component_chunks.json"


class ComponentIngestor:
    NODE_SCRIPT = NODE_SCRIPT
    COMPONENT_DOCS = COMPONENT_DOCS
    COMPONENT_CHUNKS = COMPONENT_CHUNKS

    @staticmethod
    def chunk_text(text, max_chars=600, overlap=50):
        """Reduced chunk size and overlap to minimize memory usage."""
        text = text.strip()
        if not text:
            return []
        chunks = []
        start = 0
        L = len(text)
        while start < L:
            end = min(L, start + max_chars)
            chunks.append(text[start:end].strip())
            start = end - overlap
            if start < 0:
                start = 0
        return chunks

    @staticmethod
    def check_memory():
        """Check available memory and warn if low."""
        try:
            import psutil
            memory = psutil.virtual_memory()
            available_gb = memory.available / (1024**3)
            print(f"Available memory: {available_gb:.1f} GB")
            if available_gb < 1.0:
                print("WARNING: Low memory available!")
            return available_gb
        except ImportError:
            print("Install psutil to monitor memory: pip install psutil")
            return None

    @staticmethod
    def minimal_ingest(component_docs_path=None, output_chunks_path=None, max_components=None):
        """
        Ultra-minimal memory approach: process one component at a time.
        """
        if component_docs_path is None:
            component_docs_path = ComponentIngestor.COMPONENT_DOCS
        if output_chunks_path is None:
            output_chunks_path = ComponentIngestor.COMPONENT_CHUNKS

        if not Path(component_docs_path).exists():
            raise FileNotFoundError(f"{component_docs_path} not found")

        ComponentIngestor.check_memory()
        
        idx = 0
        processed_components = 0
        
        # Create a temporary file to avoid keeping everything in memory
        temp_file = output_chunks_path.with_suffix('.tmp')
        
        try:
            with open(temp_file, "w") as f_out:
                f_out.write("[\n")
                first_chunk = True
                
                with open(component_docs_path, "rb") as f_in:
                    docs = ijson.items(f_in, 'item')
                    
                    for doc in docs:
                        if max_components and processed_components >= max_components:
                            break
                            
                        # Process single component
                        chunks_written = ComponentIngestor.process_single_component(
                            doc, f_out, idx, first_chunk
                        )
                        
                        if chunks_written > 0:
                            first_chunk = False
                            idx += chunks_written
                        
                        processed_components += 1
                        
                        # Force cleanup after each component
                        del doc
                        gc.collect()
                        
                        # Progress update every 10 components
                        if processed_components % 10 == 0:
                            print(f"Processed {processed_components} components, {idx} chunks")
                            ComponentIngestor.check_memory()
                
                f_out.write("\n]\n")
            
            # Move temp file to final location
            temp_file.rename(output_chunks_path)
            print(f"Successfully wrote {idx} chunks to {output_chunks_path}")
            
        except Exception as e:
            # Clean up temp file on error
            if temp_file.exists():
                temp_file.unlink()
            raise e

    @staticmethod
    def process_single_component(doc, f_out, start_idx, first_chunk):
        """Process a single component with minimal memory footprint."""
        chunks_written = 0
        
        try:
            # Build text parts with strict size limits
            text_parts = []
            
            # Component name
            name = doc.get('name', 'Unknown')[:100]  # Limit name length
            text_parts.append(f"Component: {name}")
            
            # Description (heavily truncated)
            if doc.get("description"):
                desc = doc["description"][:400] + ("..." if len(doc["description"]) > 400 else "")
                text_parts.append(f"Description: {desc}")
            
            # Props (limited)
            if doc.get("props"):
                props = doc["props"]
                prop_lines = []
                prop_count = 0
                for k, v in props.items():
                    if prop_count >= 5:  # Limit number of props
                        prop_lines.append("... (more props)")
                        break
                    
                    if isinstance(v, dict):
                        type_name = "unknown"
                        if isinstance(v.get("type"), dict):
                            type_name = v.get("type", {}).get("name", "")[:20]
                        elif v.get("type"):
                            type_name = str(v.get("type"))[:20]
                        
                        desc = str(v.get("description", ""))[:100]
                        prop_lines.append(f"{k[:30]} ({type_name}): {desc}")
                    prop_count += 1
                
                if prop_lines:
                    text_parts.append("Props: " + "; ".join(prop_lines))
            
            # File path
            if doc.get("file"):
                text_parts.append(f"File: {doc['file'][:100]}")
            
            # Code snippet (very limited)
            if doc.get("raw"):
                raw_code = doc.get("raw", "")
                if len(raw_code) > 800:
                    raw_code = raw_code[:800] + "..."
                text_parts.append(f"Code: {raw_code}")
            
            # Join and chunk
            big_text = " | ".join(text_parts)  # Use separator instead of newlines
            
            # Create chunks
            chunks = ComponentIngestor.chunk_text(big_text, max_chars=500, overlap=30)
            
            # Write chunks immediately
            for i, chunk_text in enumerate(chunks):
                chunk_obj = {
                    "chunk_id": f"chunk_{start_idx + i}",
                    "component_id": str(doc.get("id", ""))[:50],
                    "component_name": name,
                    "file": doc.get("file", "")[:100],
                    "text": chunk_text
                }
                
                if not first_chunk or i > 0:
                    f_out.write(",\n")
                
                json.dump(chunk_obj, f_out, separators=(',', ':'))  # Compact JSON
                chunks_written += 1
            
            # Cleanup
            del text_parts, chunks, big_text
            
        except Exception as e:
            print(f"Error processing component {doc.get('name', 'unknown')}: {e}")
        
        return chunks_written

    @staticmethod
    def split_file_by_size(input_path=None, max_size_mb=50):
        """Split large JSON file by size instead of count."""
        input_path = input_path or ComponentIngestor.COMPONENT_DOCS
        output_dir = input_path.parent
        max_size_bytes = max_size_mb * 1024 * 1024
        
        part_num = 1
        current_batch = []
        current_size = 0
        
        with open(input_path, "rb") as f_in:
            docs = ijson.items(f_in, 'item')
            
            for doc in docs:
                doc_size = len(json.dumps(doc).encode('utf-8'))
                
                if current_size + doc_size > max_size_bytes and current_batch:
                    # Write current batch
                    out_path = output_dir / f"component_docs_part_{part_num}.json"
                    with open(out_path, "w") as f_out:
                        json.dump(current_batch, f_out, separators=(',', ':'))
                    
                    print(f"Part {part_num}: {len(current_batch)} components, {current_size/1024/1024:.1f}MB")
                    
                    # Reset for next batch
                    current_batch.clear()
                    current_size = 0
                    part_num += 1
                    gc.collect()
                
                current_batch.append(doc)
                current_size += doc_size
            
            # Write final batch
            if current_batch:
                out_path = output_dir / f"component_docs_part_{part_num}.json"
                with open(out_path, "w") as f_out:
                    json.dump(current_batch, f_out, separators=(',', ':'))
                print(f"Part {part_num}: {len(current_batch)} components, {current_size/1024/1024:.1f}MB")

    @staticmethod
    def emergency_process(max_components=100):
        """Emergency processing with very strict limits."""
        print("Starting emergency processing with strict memory limits...")
        ComponentIngestor.check_memory()

        # Ensure component_docs.json exists, run Node extractor if missing
        if not ComponentIngestor.COMPONENT_DOCS.exists():
            print(f"{ComponentIngestor.COMPONENT_DOCS} not found. Running Node extractor...")
            process = subprocess.Popen(
                ["node", str(ComponentIngestor.NODE_SCRIPT)],
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
                bufsize=1,
                universal_newlines=True,
            )
            for line in process.stdout:
                print(line, end='')
            process.stdout.close()
            returncode = process.wait()
            if returncode != 0:
                err = process.stderr.read()
                process.stderr.close()
                print("Node extractor failed:")
                print(err)
                raise SystemExit(1)
            process.stderr.close()
            if not ComponentIngestor.COMPONENT_DOCS.exists():
                print(f"{ComponentIngestor.COMPONENT_DOCS} still not found after running Node extractor.")
                print("Emergency processing aborted.")
                return

        try:
            # Check file size first
            file_size = ComponentIngestor.COMPONENT_DOCS.stat().st_size / (1024*1024)
            print(f"Input file size: {file_size:.1f} MB")

            if file_size > 100:
                print("File too large, splitting first...")
                ComponentIngestor.split_file_by_size(max_size_mb=25)

                # Process first part only
                first_part = ComponentIngestor.COMPONENT_DOCS.parent / "component_docs_part_1.json"
                if first_part.exists():
                    ComponentIngestor.minimal_ingest(
                        component_docs_path=first_part,
                        max_components=max_components
                    )
                else:
                    print("No parts created - file might be corrupted")
            else:
                ComponentIngestor.minimal_ingest(max_components=max_components)

        except Exception as e:
            print(f"Emergency processing failed: {e}")
            print("Try splitting the file manually or reducing max_components")


if __name__ == "__main__":
    # Emergency mode with minimal testing settings
    print("Running in emergency mode...")
    ComponentIngestor.emergency_process(max_components=1)  # Test with just 1 component