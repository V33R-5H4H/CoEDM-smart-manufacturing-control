import os
import glob
import re

directory = r"d:\CoEDM\backend\stations"
files = glob.glob(os.path.join(directory, "*.py"))

replacements = {
    '"Items"': '"items"',
    '"Boxes"': '"boxes"',
    '"SubCompartments"': '"subcompartments"',
    '"Transactions"': '"transactions"',
    '"Orders"': '"orders"',
    '"OrderItems"': '"orderitems"'
}

for filepath in files:
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()
    
    new_content = content
    for old, new in replacements.items():
        new_content = new_content.replace(old, new)
        
    if new_content != content:
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(new_content)
        print(f"Updated {filepath}")
