import glob, re

for filepath in glob.glob('js/*.js'):
    with open(filepath, encoding='utf-8') as f:
        content = f.read()
    
    # Remove template literals `...`
    stripped = re.sub(r'`(?:[^`\\]|\\.)*`', '""', content)
    # Remove single line comments
    stripped = re.sub(r'//.*', '', stripped)
    # Remove multiline comments
    stripped = re.sub(r'/\*[\s\S]*?\*/', '', stripped)
    # Remove double quoted strings
    stripped = re.sub(r'"(?:[^"\\]|\\.)*"', '""', stripped)
    # Remove single quoted strings
    stripped = re.sub(r"'(?:[^'\\]|\\.)*'", "''", stripped)
    
    b_open = stripped.count('{')
    b_close = stripped.count('}')
    p_open = stripped.count('(')
    p_close = stripped.count(')')
    s_open = stripped.count('[')
    s_close = stripped.count(']')
    
    print(f"File: {filepath}")
    print(f"  Braces {{ }}: {b_open} / {b_close} {'[MISMATCH]' if b_open != b_close else '[OK]'}")
    print(f"  Parens ( ): {p_open} / {p_close} {'[MISMATCH]' if p_open != p_close else '[OK]'}")
    print(f"  Square [ ]: {s_open} / {s_close} {'[MISMATCH]' if s_open != s_close else '[OK]'}")
