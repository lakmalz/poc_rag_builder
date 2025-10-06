#!/usr/bin/env python3
"""
Rebuild RAG Index - Complete Pipeline with Validation
======================================================
This script runs the full extraction → chunking → indexing pipeline with 
comprehensive validation at each step.

Usage:
    python3 rebuild_index.py              # Run full pipeline
    python3 rebuild_index.py --clean      # Clean and rebuild
    python3 rebuild_index.py --validate   # Only validate existing data
"""

import argparse
import json
import shutil
import subprocess
import sys
from pathlib import Path
from typing import Dict, List, Tuple


class PipelineRunner:
    def __init__(self, project_root: Path):
        self.project_root = project_root
        self.build_dir = project_root / "build-index"
        self.component_docs = self.build_dir / "component_docs.json"
        self.component_chunks = self.build_dir / "component_chunks.json"
        self.chromadb_dir = self.build_dir / "chromadb"
        
        self.stats = {
            'extraction': {},
            'chunking': {},
            'indexing': {}
        }
    
    def clean_outputs(self):
        """Remove all generated files"""
        print("\n🧹 CLEANING OLD OUTPUTS")
        print("=" * 60)
        
        files_to_clean = [
            self.component_docs,
            self.component_chunks,
        ]
        
        for file_path in files_to_clean:
            if file_path.exists():
                print(f"🗑️  Removing: {file_path.name}")
                file_path.unlink()
            else:
                print(f"⏭️  Not found: {file_path.name}")
        
        if self.chromadb_dir.exists():
            print(f"🗑️  Removing: {self.chromadb_dir.name}/")
            shutil.rmtree(self.chromadb_dir)
        else:
            print(f"⏭️  Not found: {self.chromadb_dir.name}/")
        
        print("✅ Cleanup complete\n")
    
    def run_extraction(self) -> bool:
        """Run component extraction (Node.js)"""
        print("\n📤 STEP 1: COMPONENT EXTRACTION")
        print("=" * 60)
        
        script_path = self.project_root / "scripts" / "code_extractor.js"
        
        if not script_path.exists():
            print(f"❌ Extractor script not found: {script_path}")
            return False
        
        try:
            result = subprocess.run(
                ["node", str(script_path)],
                cwd=str(self.project_root),
                capture_output=True,
                text=True
            )
            
            # Print the output
            if result.stdout:
                print(result.stdout)
            
            if result.stderr:
                print("STDERR:", result.stderr, file=sys.stderr)
            
            if result.returncode != 0:
                print(f"❌ Extraction failed with exit code {result.returncode}")
                return False
            
            # Validate output
            if not self.component_docs.exists():
                print(f"❌ Expected output file not created: {self.component_docs}")
                return False
            
            # Load and analyze
            with open(self.component_docs, 'r') as f:
                components = json.load(f)
            
            self.stats['extraction'] = {
                'total': len(components),
                'with_source': sum(1 for c in components if c.get('raw')),
                'with_props': sum(1 for c in components if c.get('props') and len(c['props']) > 0),
                'file_size': self.component_docs.stat().st_size
            }
            
            print(f"\n✅ Extraction complete: {len(components)} components")
            return True
            
        except Exception as e:
            print(f"❌ Extraction error: {e}")
            return False
    
    def run_chunking(self) -> bool:
        """Run component chunking (Python)"""
        print("\n📦 STEP 2: COMPONENT CHUNKING")
        print("=" * 60)
        
        if not self.component_docs.exists():
            print(f"❌ Input file not found: {self.component_docs}")
            return False
        
        try:
            # Import and run chunker
            from ingest_components import ComponentIngestor
            
            chunker = ComponentIngestor(
                input_path=str(self.component_docs),
                output_path=str(self.component_chunks)
            )
            chunker.create_chunks()
            
            # Validate output
            if not self.component_chunks.exists():
                print(f"❌ Expected output file not created: {self.component_chunks}")
                return False
            
            # Load and analyze
            with open(self.component_chunks, 'r') as f:
                chunks = json.load(f)
            
            chunk_types = {}
            component_chunks = {}
            for chunk in chunks:
                chunk_type = chunk.get('chunk_type', 'unknown')
                chunk_types[chunk_type] = chunk_types.get(chunk_type, 0) + 1
                
                comp_name = chunk.get('component_name', 'unknown')
                component_chunks[comp_name] = component_chunks.get(comp_name, 0) + 1
            
            self.stats['chunking'] = {
                'total_chunks': len(chunks),
                'unique_components': len(component_chunks),
                'chunk_types': chunk_types,
                'avg_chunks_per_component': len(chunks) / len(component_chunks) if component_chunks else 0,
                'file_size': self.component_chunks.stat().st_size
            }
            
            print(f"\n✅ Chunking complete: {len(chunks)} chunks")
            return True
            
        except Exception as e:
            print(f"❌ Chunking error: {e}")
            import traceback
            traceback.print_exc()
            return False
    
    def run_indexing(self) -> bool:
        """Run ChromaDB indexing (Python)"""
        print("\n🔍 STEP 3: CHROMADB INDEXING")
        print("=" * 60)
        
        if not self.component_chunks.exists():
            print(f"❌ Input file not found: {self.component_chunks}")
            return False
        
        try:
            # Import and run indexer
            from index_components import ComponentIndexer
            
            indexer = ComponentIndexer()
            indexer.build_index(batch_size=64)
            
            # Validate output
            if not self.chromadb_dir.exists():
                print(f"❌ ChromaDB directory not created: {self.chromadb_dir}")
                return False
            
            # Get collection stats
            collection = indexer._get_collection()
            doc_count = collection.count()
            
            # Calculate directory size
            total_size = sum(
                f.stat().st_size 
                for f in self.chromadb_dir.rglob('*') 
                if f.is_file()
            )
            
            self.stats['indexing'] = {
                'documents_stored': doc_count,
                'db_size_bytes': total_size,
                'db_size_mb': total_size / (1024 * 1024)
            }
            
            print(f"\n✅ Indexing complete: {doc_count} documents stored")
            return True
            
        except Exception as e:
            print(f"❌ Indexing error: {e}")
            import traceback
            traceback.print_exc()
            return False
    
    def validate_pipeline(self) -> Tuple[bool, List[str]]:
        """Validate the entire pipeline"""
        print("\n✅ PIPELINE VALIDATION")
        print("=" * 60)
        
        issues = []
        
        # Check file existence
        if not self.component_docs.exists():
            issues.append("component_docs.json not found")
        if not self.component_chunks.exists():
            issues.append("component_chunks.json not found")
        if not self.chromadb_dir.exists():
            issues.append("chromadb/ directory not found")
        
        if issues:
            for issue in issues:
                print(f"❌ {issue}")
            return False, issues
        
        # Load data for comparison
        with open(self.component_docs, 'r') as f:
            components = json.load(f)
        
        with open(self.component_chunks, 'r') as f:
            chunks = json.load(f)
        
        # Check if chunks cover all components
        component_ids_in_docs = {c['id'] for c in components}
        component_ids_in_chunks = {ch['component_id'] for ch in chunks}
        
        missing_in_chunks = component_ids_in_docs - component_ids_in_chunks
        if missing_in_chunks:
            issues.append(f"{len(missing_in_chunks)} components not chunked")
            print(f"⚠️  {len(missing_in_chunks)} components missing from chunks:")
            for comp_id in list(missing_in_chunks)[:5]:
                comp = next((c for c in components if c['id'] == comp_id), None)
                if comp:
                    print(f"   - {comp.get('name', 'unknown')} ({comp.get('file', 'unknown')})")
        
        # Check ChromaDB count vs chunks
        from index_components import ComponentIndexer
        indexer = ComponentIndexer()
        try:
            collection = indexer._get_collection()
            db_count = collection.count()
            
            if db_count != len(chunks):
                issues.append(f"ChromaDB count mismatch: expected {len(chunks)}, got {db_count}")
                print(f"⚠️  ChromaDB count mismatch:")
                print(f"   Expected: {len(chunks)} chunks")
                print(f"   Actually stored: {db_count} documents")
                print(f"   Difference: {abs(len(chunks) - db_count)}")
            else:
                print(f"✅ ChromaDB count matches: {db_count} documents")
        except Exception as e:
            issues.append(f"Cannot validate ChromaDB: {e}")
            print(f"❌ ChromaDB validation error: {e}")
        
        # Summary
        print(f"\n📊 Validation Summary:")
        print(f"   Components extracted: {len(components)}")
        print(f"   Chunks created: {len(chunks)}")
        print(f"   Components chunked: {len(component_ids_in_chunks)}")
        
        if not issues:
            print(f"\n✅ All validation checks passed!")
            return True, []
        else:
            print(f"\n⚠️  Found {len(issues)} issue(s)")
            return False, issues
    
    def print_summary(self):
        """Print final summary"""
        print("\n" + "=" * 60)
        print("📊 PIPELINE SUMMARY")
        print("=" * 60)
        
        if self.stats.get('extraction'):
            print(f"\n📤 Extraction:")
            print(f"   Total components: {self.stats['extraction']['total']}")
            print(f"   With source code: {self.stats['extraction']['with_source']}")
            print(f"   With props: {self.stats['extraction']['with_props']}")
            print(f"   File size: {self.stats['extraction']['file_size'] / 1024:.1f} KB")
        
        if self.stats.get('chunking'):
            print(f"\n📦 Chunking:")
            print(f"   Total chunks: {self.stats['chunking']['total_chunks']}")
            print(f"   Unique components: {self.stats['chunking']['unique_components']}")
            print(f"   Avg chunks/component: {self.stats['chunking']['avg_chunks_per_component']:.1f}")
            print(f"   File size: {self.stats['chunking']['file_size'] / 1024:.1f} KB")
            print(f"\n   Chunk types:")
            for chunk_type, count in self.stats['chunking']['chunk_types'].items():
                print(f"      {chunk_type:20s}: {count:4d}")
        
        if self.stats.get('indexing'):
            print(f"\n🔍 Indexing:")
            print(f"   Documents stored: {self.stats['indexing']['documents_stored']}")
            print(f"   Database size: {self.stats['indexing']['db_size_mb']:.1f} MB")
        
        print("\n" + "=" * 60)
        print("✅ Pipeline complete!")
        print("=" * 60 + "\n")


def main():
    parser = argparse.ArgumentParser(description='Rebuild RAG index with validation')
    parser.add_argument('--clean', action='store_true', help='Clean outputs before rebuilding')
    parser.add_argument('--validate', action='store_true', help='Only validate existing data')
    parser.add_argument('--skip-extraction', action='store_true', help='Skip extraction step')
    parser.add_argument('--skip-chunking', action='store_true', help='Skip chunking step')
    parser.add_argument('--skip-indexing', action='store_true', help='Skip indexing step')
    
    args = parser.parse_args()
    
    # Initialize
    project_root = Path(__file__).parent
    runner = PipelineRunner(project_root)
    
    # Validation only mode
    if args.validate:
        success, issues = runner.validate_pipeline()
        sys.exit(0 if success else 1)
    
    # Clean if requested
    if args.clean:
        runner.clean_outputs()
    
    # Run pipeline steps
    success = True
    
    if not args.skip_extraction:
        if not runner.run_extraction():
            success = False
    
    if success and not args.skip_chunking:
        if not runner.run_chunking():
            success = False
    
    if success and not args.skip_indexing:
        if not runner.run_indexing():
            success = False
    
    # Validate results
    if success:
        validation_success, issues = runner.validate_pipeline()
        success = validation_success
    
    # Print summary
    runner.print_summary()
    
    sys.exit(0 if success else 1)


if __name__ == "__main__":
    main()
