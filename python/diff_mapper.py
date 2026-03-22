import re
from ast_extractor import FunctionBoundary, extract_functions

def map_diff_lines_to_functions(patch: str, functions: list[FunctionBoundary],) -> list[str]:

    #this is basically checking which functions did our pr bro touch(diddy)

    changed_lines = _parse_changed_lines(patch)

    if not changed_lines or not functions:
        return []
    
    changed_set = set(changed_lines)
    hit = []

    for fn in functions:
        fn_lines = set(range(fn.start_line, fn.end_line + 1))
        if fn_lines & changed_set: #intersection or any overlaps
            if fn.name not in hit:
                hit.append(fn.name)

    return hit

def _parse_changed_lines(patch: str) -> list[int]:
    """parses a unified diff patch and returns the new-file line numbers of every added or removed line
    
    hunk header format: @@ -old_start,old_count +new_start,new_count @@

    we track the new-file line counter as we walk through the hunk"""

    #actual documentation likhni pad rahi hai :(

    changed = []
    current_line = 0
    hunk_re = re.compile(r"^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@")

    for line in patch.splitlines():
        hunk_match = hunk_re.match(line)

        if hunk_match: 
            #new hunk thrrefore restting line counter to start of it
            current_line = int(hunk_match.group(1))
            continue

        if line.startswith("+++") or line.startswith("---"):
            continue

        if line.startswith("+"):
            changed.append(current_line)
            current_line+=1

        elif line.startswith("-"):
            changed.append(current_line)

        else:
            current_line+=1

    return changed

#for testing
if __name__ == "__main__":
    from ast_extractor import extract_functions

    source = """\
function buildSerializer(options) {
    return pino.stdSerializers.wrap(options)
}

function loadPlugins(plugins, done) {
    const queue = [...plugins]
    plugins.forEach(p => p.load())
}

function handleRequest(req, res) {
    return this.router.match(req)
}
"""

    # Simulate a patch that only touches loadPlugins (lines 5-8)
    patch = (
        "@@ -5,4 +5,4 @@\n"
        " function loadPlugins(plugins, done) {\n"
        "-    const queue = [...plugins]\n"
        "+    const queue = new Queue(plugins)\n"
        "     plugins.forEach(p => p.load())\n"
        " }\n"
    )

    functions = extract_functions(source, "javascript")

    print("All functions found:")
    for f in functions:
        print(f"  {f.name:20s} lines {f.start_line}–{f.end_line}")

    print("\nFunctions touched by patch:")
    touched = map_diff_lines_to_functions(patch, functions)
    print(f"  {touched}")   # should be ['loadPlugins'] only
