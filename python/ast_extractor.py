from dataclasses import dataclass
from tree_sitter import Language, Parser
import tree_sitter_javascript as ts_js
import tree_sitter_typescript as ts_ts
import tree_sitter_python as ts_py
import tree_sitter_go as ts_go

JS_LANG = Language(ts_js.language())
TS_LANG = Language(ts_ts.language_typescript())
PY_LANG = Language(ts_py.language())
GO_LANG = Language(ts_go.language())

@dataclass
class FunctionBoundary:
    name:       str
    start_line: int   # 1-based
    end_line:   int   # 1-based

#used ai for most of the file, have to check it later

#used ai to generate the queries for languages other than js, used spec sheet's query for js
JS_QUERY = """
    (function_declaration name: (identifier) @name) @fn
    (method_definition name: (property_identifier) @name) @fn
    (variable_declarator
        name: (identifier) @name
        value: [(arrow_function) (function_expression)]) @fn
"""

TS_QUERY = """
    (function_declaration name: (identifier) @name) @fn
    (method_definition name: (property_identifier) @name) @fn
    (variable_declarator
        name: (identifier) @name
        value: [(arrow_function) (function_expression)]) @fn
"""

PY_QUERY = """
    (function_definition name: (identifier) @name) @fn
    (async_function_definition name: (identifier) @name) @fn
"""

GO_QUERY = """
    (function_declaration name: (identifier) @name) @fn
    (method_declaration name: (field_identifier) @name) @fn
    (func_literal) @fn
"""

def extract_functions(source: str, language: str) -> list[FunctionBoundary]:
    if language == "javascript":
        lang_obj  = JS_LANG
        query_str = JS_QUERY
    elif language == "typescript":
        lang_obj  = TS_LANG
        query_str = TS_QUERY
    elif language == "python":
        lang_obj  = PY_LANG
        query_str = PY_QUERY
    elif language == "go":
        lang_obj  = GO_LANG
        query_str = GO_QUERY
    else:
        return []

    parser = Parser(lang_obj)
    tree   = parser.parse(bytes(source, "utf-8"))
    query  = Query(lang_obj, query_str)
    cursor = QueryCursor(query)
    caps   = cursor.captures(tree.root_node)

    fn_nodes   = caps.get("fn", [])
    name_nodes = caps.get("name", [])

    return [
        FunctionBoundary(
            name       = name.text.decode(),
            start_line = fn.start_point[0] + 1,
            end_line   = fn.end_point[0]   + 1,
        )
        for fn, name in zip(fn_nodes, name_nodes)
    ]


#for testing
if __name__ == "__main__":

    js_source = """\
function buildSerializer(options) {
    return pino.stdSerializers.wrap(options)
}

const loadPlugins = (plugins, done) => {
    const queue = [...plugins]
}

class Server {
    handleRequest(req, res) {
        return this.router.match(req)
    }
}
"""

    py_source = """\
def compute_hash(data):
    return hashlib.sha256(data).hexdigest()

async def fetch_user(user_id: int):
    return await db.get(user_id)
"""

    go_source = """\
func NewServer(addr string) *Server {
    return &Server{addr: addr}
}

func (s *Server) ServeHTTP(w http.ResponseWriter, r *http.Request) {
    s.router.ServeHTTP(w, r)
}
"""

    ts_source = """\
function parseSchema(input: string): Schema {
    return JSON.parse(input)
}

const validateRequest = (req: Request): boolean => {
    return req.headers !== null
}
"""

    print("=== JavaScript ===")
    for f in extract_functions(js_source, "javascript"):
        print(f"  {f.name:20s} lines {f.start_line}–{f.end_line}")

    print("\n=== Python ===")
    for f in extract_functions(py_source, "python"):
        print(f"  {f.name:20s} lines {f.start_line}–{f.end_line}")

    print("\n=== Go ===")
    for f in extract_functions(go_source, "go"):
        print(f"  {f.name:20s} lines {f.start_line}–{f.end_line}")

    print("\n=== TypeScript ===")
    for f in extract_functions(ts_source, "typescript"):
        print(f"  {f.name:20s} lines {f.start_line}–{f.end_line}")