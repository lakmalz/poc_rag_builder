# Quick Reference - Command Methods

## 🎯 Three Independent Commands

### 1. List Components
```bash
# List format (numbered with paths)
python3 query_cli.py list-components

# JSON format (for parsing/APIs)
python3 query_cli.py list-components --output-format json

# Names only (simple text list)
python3 query_cli.py list-components --output-format names
```

### 2. Get Component Exact
```bash
# Get specific component by exact name
python3 query_cli.py get-component-exact "ProfilePage.component"
python3 query_cli.py get-component-exact "Page"
```

### 3. Interactive Query
```bash
# Combined: lists components, then retrieves selected one
python3 query_cli.py query-component-interactive
```

---

## 🔗 Integration with find_component.py

The `find_component.py` script now uses the **integrated command**:

```python
# Inside find_component.py
subprocess.run(["python3", "query_cli.py", "query-component-interactive"])
```

This means when you run:
```bash
python3 find_component.py
```

It automatically uses the `query-component-interactive` command.

---

## 📊 Use Cases

| Need | Command | Example |
|------|---------|---------|
| List all components | `list-components` | Populate a dropdown menu |
| Get component list as JSON | `list-components --output-format json` | API integration |
| Get simple name list | `list-components --output-format names` | Pipe to other scripts |
| Get specific component code | `get-component-exact "Name"` | LLM context preparation |
| User-facing interface | `query-component-interactive` | CLI tool for users |

---

## ✅ Benefits

1. **Modularity**: Each command can be called independently
2. **Reusability**: Use from any part of the system
3. **Integration**: Easy to integrate with other tools/APIs
4. **Flexibility**: Multiple output formats
5. **Clean Separation**: List → Query → Retrieve workflow

---

## 🧪 Test Results

✅ `list-components` - Working (all 3 formats)  
✅ `get-component-exact` - Working (exact match retrieval)  
✅ `query-component-interactive` - Ready (integrated workflow)

---

## 🚀 Ready to Use!

All three command methods are production-ready and can be called from:
- Shell scripts
- Python programs
- Other CLI tools
- Web APIs
- CI/CD pipelines
- Any external system

**Next**: Call these commands from your other system components! 🎉
