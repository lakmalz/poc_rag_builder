# Component Query API - Command Methods

## 📋 Overview

The `query_cli.py` module now provides **3 separate command methods** that can be used independently or together. These commands are designed to be called from other parts of the system.

---

## 🔧 Command Methods

### 1️⃣ `list-components` - Get Component List

**Purpose**: Retrieve filtered list of React components (excludes utils/hooks/helpers)

**Command**:
```bash
python3 query_cli.py list-components [--output-format FORMAT]
```

**Parameters**:
- `--output-format` (optional): Output format
  - `"list"` (default) - Numbered list with file paths
  - `"json"` - JSON array with name, file, component_id
  - `"names"` - Simple list of component names only

**Example Usage**:

```bash
# List format (default)
python3 query_cli.py list-components

# JSON format
python3 query_cli.py list-components --output-format json

# Names only
python3 query_cli.py list-components --output-format names
```

**Output Examples**:

**List format**:
```
Found 2 component(s):

[1] Page                              (app/tab/page.tsx)
[2] ProfilePage.component             (components/ProfilePage/ProfilePage.component.tsx)
```

**JSON format**:
```json
[
  {
    "name": "Page",
    "file": "Custom-ui/src/app/tab/page.tsx",
    "component_id": "Page_Custom-ui/src/app/tab/page.tsx"
  },
  {
    "name": "ProfilePage.component",
    "file": "Custom-ui/src/components/ProfilePage/ProfilePage.component.tsx",
    "component_id": "ProfilePage.component_Custom-ui/src/components/ProfilePage/ProfilePage.component.tsx"
  }
]
```

**Names format**:
```
Page
ProfilePage.component
```

---

### 2️⃣ `get-component-exact` - Get Component by Exact Name

**Purpose**: Retrieve specific component's full source code, types, and props by exact name match

**Command**:
```bash
python3 query_cli.py get-component-exact COMPONENT_NAME
```

**Parameters**:
- `COMPONENT_NAME` (required): Exact component name (e.g., "ProfilePage.component")

**Example Usage**:

```bash
python3 query_cli.py get-component-exact "ProfilePage.component"
```

**Output**:
```
📦 Component: ProfilePage.component
📁 File: Custom-ui/src/components/ProfilePage/ProfilePage.component.tsx

✅ Full Source Code:
================================================================================
import React from 'react';
import { ProfilePageProps } from './ProfilePage.interface';
...
[Complete component source code]
================================================================================

✅ Type Definitions:
================================================================================
export interface ProfilePageProps {
  userId: string;
  ...
}
================================================================================

📋 Props:
--------------------------------------------------------------------------------
Props:
  - userId: string
  - ...
--------------------------------------------------------------------------------
```

**Use Case**: 
- Get complete component code for LLM context
- Copy/paste component for reuse
- Analyze component structure

---

### 3️⃣ `query-component-interactive` - Combined Interactive Mode

**Purpose**: All-in-one interactive command that combines listing and exact retrieval

**Command**:
```bash
python3 query_cli.py query-component-interactive
```

**Parameters**: None (interactive prompts)

**Workflow**:
1. Lists all components (uses `list-components` logic)
2. Prompts user to select by number or 's' for semantic search
3. If number selected: retrieves exact component (uses `get-component-exact` logic)
4. If 's' selected: performs semantic similarity search

**Example Usage**:

```bash
python3 query_cli.py query-component-interactive
```

**Interactive Flow**:
```
Found 2 component(s):

[1] Page                              (app/tab/page.tsx)
[2] ProfilePage.component             (components/ProfilePage/ProfilePage.component.tsx)

Select a component by number (or 's' for semantic search): 2

🔎 Retrieving exact match for: ProfilePage.component

📦 Component: ProfilePage.component
📁 File: Custom-ui/src/components/ProfilePage/ProfilePage.component.tsx

✅ Full Source Code:
[... full component code ...]
```

**Use Case**: 
- Default user-facing interface
- Combines all functionality in one command
- Simplifies workflow for end users

---

## 🔗 Integration Examples

### Example 1: External System Getting Component List

```python
import subprocess
import json

# Get component list as JSON
result = subprocess.run(
    ["python3", "query_cli.py", "list-components", "--output-format", "json"],
    capture_output=True,
    text=True
)

components = json.loads(result.stdout)
print(f"Found {len(components)} components")

for comp in components:
    print(f"- {comp['name']} in {comp['file']}")
```

### Example 2: Programmatically Retrieve Component

```python
import subprocess

component_name = "ProfilePage.component"

# Get exact component code
result = subprocess.run(
    ["python3", "query_cli.py", "get-component-exact", component_name],
    capture_output=True,
    text=True
)

print(result.stdout)  # Full component output
```

### Example 3: Using from find_component.py

```python
# find_component.py now uses the integrated command
subprocess.run(["python3", "query_cli.py", "query-component-interactive"])
```

---

## 🎯 Use Cases by Command

| Command | When to Use | Output Type | Interactive |
|---------|------------|-------------|-------------|
| `list-components` | Need component names/metadata | List/JSON/Names | No |
| `get-component-exact` | Know component name, need code | Full component details | No |
| `query-component-interactive` | User-facing interface | Combined workflow | Yes |

---

## 🛠️ Technical Details

### Component Filtering

All commands use the `is_real_component()` filter to exclude:
- ❌ Utilities (`RateUtils`, `*Helper`, `*Utils`)
- ❌ Custom hooks (`useMainScroller`, `Use*`)
- ❌ Render utilities (`renderReactNode`)
- ❌ Generic exports (`default`, `__function`)
- ❌ Files in `/utils/` or `/helpers/` directories

Only **actual React components** are returned.

### Data Source

All commands read from:
```
build-index/component_chunks.json
```

Ensure this file exists before calling these commands (run the pipeline first).

---

## 📊 Command Comparison

### `list-components` vs `query-find-component`

| Feature | list-components | query-find-component |
|---------|----------------|---------------------|
| Method | JSON filtering | Vector search |
| Speed | ⚡ Fast | 🐌 Slower |
| Returns | All components | Similar components |
| Use Case | Get inventory | Semantic discovery |

### `get-component-exact` vs `query-find-component`

| Feature | get-component-exact | query-find-component |
|---------|-------------------|---------------------|
| Input | Exact name | Search query |
| Returns | 1 component | Multiple components |
| Accuracy | 100% | ~85% similarity |
| Use Case | Known component | Exploring |

---

## 🚀 Best Practices

1. **Use `list-components`** when you need:
   - Component inventory
   - Dropdown/menu population
   - Validation of component existence

2. **Use `get-component-exact`** when you:
   - Know the exact component name
   - Need full source code for LLM
   - Want fast, accurate retrieval

3. **Use `query-component-interactive`** for:
   - End-user interfaces
   - CLI tools
   - Manual exploration

---

## 📝 Example Workflow

```bash
# Step 1: List all components (JSON for parsing)
python3 query_cli.py list-components --output-format json > components.json

# Step 2: Extract component names programmatically
cat components.json | jq -r '.[].name'

# Step 3: Get specific component
python3 query_cli.py get-component-exact "ProfilePage.component"

# OR use interactive mode for manual use
python3 query_cli.py query-component-interactive
```

---

## ✅ Summary

You now have **3 independent, reusable command methods**:

1. 📋 `list-components` - Get filtered component list
2. 📦 `get-component-exact` - Retrieve component by exact name  
3. 🔄 `query-component-interactive` - Combined interactive interface

All commands work independently and can be integrated into any part of your system! 🎉
