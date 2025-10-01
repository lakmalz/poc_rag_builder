import re

content = """
The ProfilePageComponent is generally responsible for displaying user profile details and offering actions like editing or navigation. Below is a simple React example that accepts a user object as a prop, displays key fields, and provides an Edit Profile button:import React from 'react';\n\nconst ProfilePageComponent = ({ user }) => {\n return (\n <div className='profile-container'>\n <h2>{user.name}</h2>\n <p>Email: {user.email}</p>\n <p>Member since: {new Date(user.createdAt).toLocaleDateString()}</p>\n <button onClick={() => alert('Edit Profile clicked')}>Edit Profile</button>\n </div>\n );\n};\n\nexport default ProfilePageComponent; You can extend this by integrating the component with your state management (Redux, Context, or API hooks) and replacing the alert with proper editing functionality.
"""

# # Generic regex for any React component
# match = re.search(r"(import React.*?export default\s+\w+;)", content, re.DOTALL)
# if match:
#     code_snippet = match.group(1)
#     print(code_snippet)
# else:
#     print("No code snippet found.")

# Pattern 1: Triple backticks (generic)
code_blocks = re.findall(r"```(?:\w*\n)?(.*?)```", content, re.DOTALL)
if code_blocks:
    for code in code_blocks:
        print(code.strip())
else:
    # Pattern 2: React component (your current pattern)
    match = re.search(r"(import React.*?export default\s+\w+;)", content, re.DOTALL)
    if match:
        print(match.group(1).strip())
    else:
        print("No code snippet found.")