use clap::Parser;
use serde::{Deserialize, Serialize};
use std::io::{self, Read};

// ─── CLI ───────────────────────────────────────────────────────────
#[derive(Parser)]
#[command(name = "eigenstate-intel", about = "Analyse a unified diff and extract function-level decisions")]
struct Cli {
    /// PR title (used for intent inference)
    #[arg(long)]
    title: Option<String>,

    /// PR body / description
    #[arg(long)]
    body: Option<String>,

    /// PR number
    #[arg(long)]
    pr_number: Option<i64>,
}

// ─── Output types ──────────────────────────────────────────────────
#[derive(Serialize, Deserialize, Debug)]
struct AnalysisResult {
    functions_modified: Vec<FunctionChange>,
    patterns_detected: Vec<PatternDetection>,
    confidence: f64,
    summary: String,
    complexity_score: f64,
    risk_score: f64,
    file_categories: Vec<FileCategory>,
}

#[derive(Serialize, Deserialize, Debug)]
struct FunctionChange {
    name: String,
    file_path: String,
    change_type: String,
    lines_added: usize,
    lines_removed: usize,
    decision: String,
    reason: String,
    tradeoff: String,
    evidence: String,
}

#[derive(Serialize, Deserialize, Debug)]
struct PatternDetection {
    pattern: String,
    severity: String,
    description: String,
    file_path: String,
}

#[derive(Serialize, Deserialize, Debug)]
struct FileCategory {
    path: String,
    category: String,
    language: String,
}

// ─── Diff parser ───────────────────────────────────────────────────
fn parse_diff(diff: &str) -> Vec<DiffFile> {
    let mut files: Vec<DiffFile> = Vec::new();
    let mut current_file: Option<DiffFile> = None;

    for line in diff.lines() {
        if line.starts_with("diff --git") {
            if let Some(f) = current_file.take() {
                files.push(f);
            }
            // Extract file path from "diff --git a/path b/path"
            let parts: Vec<&str> = line.split_whitespace().collect();
            let path = parts.last().unwrap_or(&"unknown").trim_start_matches("b/");
            current_file = Some(DiffFile {
                path: path.to_string(),
                added_lines: Vec::new(),
                removed_lines: Vec::new(),
            });
        } else if let Some(ref mut f) = current_file {
            if line.starts_with('+') && !line.starts_with("+++") {
                f.added_lines.push(line[1..].to_string());
            } else if line.starts_with('-') && !line.starts_with("---") {
                f.removed_lines.push(line[1..].to_string());
            }
        }
    }
    if let Some(f) = current_file {
        files.push(f);
    }
    files
}

struct DiffFile {
    path: String,
    added_lines: Vec<String>,
    removed_lines: Vec<String>,
}

// ─── Function extraction (regex-based, language-aware) ─────────────
fn extract_functions(file: &DiffFile) -> Vec<FunctionChange> {
    let mut functions = Vec::new();

    // Combine all changed lines for analysis
    let all_lines: Vec<&str> = file
        .added_lines
        .iter()
        .chain(file.removed_lines.iter())
        .map(|s| s.as_str())
        .collect();

    // Go function pattern: func (receiver) Name(params) returns {
    let go_fn = regex::Regex::new(r"func\s+(?:\([^)]*\)\s*)?(\w+)\s*\(").unwrap();
    // Python function pattern: def name(params):
    let py_fn = regex::Regex::new(r"def\s+(\w+)\s*\(").unwrap();
    // Rust function pattern: fn name(params)
    let rs_fn = regex::Regex::new(r"fn\s+(\w+)\s*[<(]").unwrap();
    // JS/TS function patterns
    let js_fn = regex::Regex::new(r"(?:function|const|let|var)\s+(\w+)\s*[=(]").unwrap();

    let patterns = vec![&go_fn, &py_fn, &rs_fn, &js_fn];
    let mut seen = std::collections::HashSet::new();

    for line in &all_lines {
        for pat in &patterns {
            for cap in pat.captures_iter(line) {
                let name = cap.get(1).unwrap().as_str().to_string();
                if seen.insert(name.clone()) {
                    let is_added = file.added_lines.iter().any(|l| l.contains(&name));
                    let is_removed = file.removed_lines.iter().any(|l| l.contains(&name));

                    let change_type = match (is_added, is_removed) {
                        (true, true) => "modified",
                        (true, false) => "added",
                        (false, true) => "deleted",
                        _ => "unknown",
                    };

                    let decision = if change_type == "deleted" {
                        format!("Remove {} functionality", name)
                    } else {
                        format!("Modify {} algorithm/logic", name)
                    };

                    functions.push(FunctionChange {
                        name,
                        file_path: file.path.clone(),
                        change_type: change_type.to_string(),
                        lines_added: file.added_lines.len(),
                        lines_removed: file.removed_lines.len(),
                        decision,
                        reason: "Addressed code limitations / feature rollout".to_string(),
                        tradeoff: "Performance vs Complexity".to_string(),
                        evidence: format!("Diff analysis showing {} lines modified", file.added_lines.len() + file.removed_lines.len()),
                    });
                }
            }
        }
    }

    functions
}

// ─── Pattern detection (semantic analysis) ─────────────────────────
fn detect_patterns(file: &DiffFile) -> Vec<PatternDetection> {
    let mut patterns = Vec::new();
    let all_added: String = file.added_lines.join("\n");
    let all_removed: String = file.removed_lines.join("\n");

    // Auth bypass detection
    if all_added.contains("// skip auth") || all_added.contains("no_auth") || all_added.contains("disable_auth") {
        patterns.push(PatternDetection {
            pattern: "auth_bypass".to_string(),
            severity: "critical".to_string(),
            description: "Possible authentication bypass detected".to_string(),
            file_path: file.path.clone(),
        });
    }

    // Cache disable detection
    if all_added.contains("no_cache") || all_added.contains("cache = false") || all_added.contains("disable_cache") {
        patterns.push(PatternDetection {
            pattern: "cache_disabled".to_string(),
            severity: "warning".to_string(),
            description: "Cache appears to be disabled".to_string(),
            file_path: file.path.clone(),
        });
    }

    // Error handling removal
    if all_removed.contains("if err != nil") && !all_added.contains("if err != nil") {
        patterns.push(PatternDetection {
            pattern: "error_handling_removed".to_string(),
            severity: "warning".to_string(),
            description: "Error handling code was removed".to_string(),
            file_path: file.path.clone(),
        });
    }

    // TODO/HACK detection
    if all_added.contains("TODO") || all_added.contains("HACK") || all_added.contains("FIXME") {
        patterns.push(PatternDetection {
            pattern: "technical_debt".to_string(),
            severity: "info".to_string(),
            description: "New technical debt markers (TODO/HACK/FIXME) added".to_string(),
            file_path: file.path.clone(),
        });
    }

    // Hardcoded secrets detection
    let secret_re = regex::Regex::new(r#"(?i)(password|secret|api_key|token)\s*[:=]\s*["'][^"']+["']"#).unwrap();
    if secret_re.is_match(&all_added) {
        patterns.push(PatternDetection {
            pattern: "hardcoded_secret".to_string(),
            severity: "critical".to_string(),
            description: "Possible hardcoded secret/credential detected".to_string(),
            file_path: file.path.clone(),
        });
    }

    // SQL injection risk
    let sql_re = regex::Regex::new(r#"(?i)(fmt\.Sprintf|format!|f")\s*.*\b(SELECT|INSERT|UPDATE|DELETE|DROP)\b"#).unwrap();
    if sql_re.is_match(&all_added) {
        patterns.push(PatternDetection {
            pattern: "sql_injection_risk".to_string(),
            severity: "critical".to_string(),
            description: "String-interpolated SQL query detected — possible SQL injection risk".to_string(),
            file_path: file.path.clone(),
        });
    }

    // Logging/observability removal
    if all_removed.contains("log.") || all_removed.contains("slog.") || all_removed.contains("logger.") {
        if !all_added.contains("log.") && !all_added.contains("slog.") && !all_added.contains("logger.") {
            patterns.push(PatternDetection {
                pattern: "logging_removed".to_string(),
                severity: "warning".to_string(),
                description: "Logging/observability code was removed without replacement".to_string(),
                file_path: file.path.clone(),
            });
        }
    }

    // Test deletion
    if file.path.contains("test") || file.path.contains("spec") {
        if file.removed_lines.len() > file.added_lines.len() + 5 {
            patterns.push(PatternDetection {
                pattern: "test_deletion".to_string(),
                severity: "warning".to_string(),
                description: "Significant test code was removed — test coverage may decrease".to_string(),
                file_path: file.path.clone(),
            });
        }
    }

    // Concurrency issues
    if all_added.contains("go func") && !all_added.contains("sync.") && !all_added.contains("chan ") {
        patterns.push(PatternDetection {
            pattern: "unguarded_goroutine".to_string(),
            severity: "warning".to_string(),
            description: "New goroutine without visible synchronization (no sync/chan)".to_string(),
            file_path: file.path.clone(),
        });
    }

    // Dependency changes
    if file.path.contains("go.mod") || file.path.contains("Cargo.toml") || file.path.contains("package.json") {
        patterns.push(PatternDetection {
            pattern: "dependency_change".to_string(),
            severity: "info".to_string(),
            description: "Dependency manifest was modified".to_string(),
            file_path: file.path.clone(),
        });
    }

    // Large change detection
    if file.added_lines.len() + file.removed_lines.len() > 200 {
        patterns.push(PatternDetection {
            pattern: "large_change".to_string(),
            severity: "info".to_string(),
            description: format!("Large change detected: {} lines added, {} removed", file.added_lines.len(), file.removed_lines.len()),
            file_path: file.path.clone(),
        });
    }

    // Config/env changes
    if file.path.contains(".env") || file.path.contains("config") || file.path.contains(".yml") || file.path.contains(".yaml") {
        patterns.push(PatternDetection {
            pattern: "config_change".to_string(),
            severity: "info".to_string(),
            description: "Configuration or environment file was modified".to_string(),
            file_path: file.path.clone(),
        });
    }

    // Unsafe code in Rust
    if all_added.contains("unsafe {") || all_added.contains("unsafe fn") {
        patterns.push(PatternDetection {
            pattern: "unsafe_code".to_string(),
            severity: "critical".to_string(),
            description: "Unsafe Rust code introduced".to_string(),
            file_path: file.path.clone(),
        });
    }

    // Panic/unwrap detection
    if all_added.contains(".unwrap()") || all_added.contains("panic!(") {
        patterns.push(PatternDetection {
            pattern: "panic_risk".to_string(),
            severity: "warning".to_string(),
            description: "Potential panic via unwrap()/panic!() — consider proper error handling".to_string(),
            file_path: file.path.clone(),
        });
    }

    patterns
}


// ─── Intent inference ──────────────────────────────────────────────
fn infer_intent(title: &str, body: &str, functions: &[FunctionChange], patterns: &[PatternDetection]) -> (String, f64) {
    let mut signals: Vec<String> = Vec::new();
    let mut confidence: f64 = 0.5;

    // Title-based inference
    let title_lower = title.to_lowercase();
    if title_lower.contains("fix") || title_lower.contains("bug") {
        signals.push("PR title suggests a bug fix".to_string());
        confidence += 0.2;
    } else if title_lower.contains("feat") || title_lower.contains("add") {
        signals.push("PR title suggests a new feature".to_string());
        confidence += 0.15;
    } else if title_lower.contains("refactor") || title_lower.contains("clean") {
        signals.push("PR title suggests a refactoring".to_string());
        confidence += 0.1;
    }

    // Body-based inference
    if !body.is_empty() {
        confidence += 0.1;
        if body.len() > 100 {
            signals.push("Detailed PR description available".to_string());
            confidence += 0.1;
        }
    }

    // Function-based inference
    if !functions.is_empty() {
        let mod_count = functions.iter().filter(|f| f.change_type == "modified").count();
        let add_count = functions.iter().filter(|f| f.change_type == "added").count();
        signals.push(format!("{} functions modified, {} functions added", mod_count, add_count));
    }

    // Pattern-based inference
    for p in patterns {
        signals.push(format!("[{}] {}", p.severity.to_uppercase(), p.description));
        if p.severity == "critical" {
            confidence = (confidence + 0.15_f64).min(1.0);
        }
    }

    let summary = if signals.is_empty() {
        "Insufficient signals to determine intent".to_string()
    } else {
        signals.join(". ")
    };

    (summary, confidence.min(1.0_f64))
}

// ─── Complexity scoring ────────────────────────────────────────────
fn compute_complexity(files: &[DiffFile], functions: &[FunctionChange]) -> f64 {
    let total_lines: usize = files.iter().map(|f| f.added_lines.len() + f.removed_lines.len()).sum();
    let file_count = files.len().max(1);
    let fn_count = functions.len().max(1);

    // Factors: total churn, files touched, functions modified
    let churn_score = (total_lines as f64 / 50.0).min(1.0);
    let file_spread = (file_count as f64 / 10.0).min(1.0);
    let fn_density = (fn_count as f64 / 8.0).min(1.0);

    ((churn_score * 0.4 + file_spread * 0.3 + fn_density * 0.3) * 10.0).min(10.0)
}

// ─── Risk scoring ──────────────────────────────────────────────────
fn compute_risk(patterns: &[PatternDetection], complexity: f64) -> f64 {
    let mut risk = complexity * 0.3;

    for p in patterns {
        risk += match p.severity.as_str() {
            "critical" => 2.5,
            "warning" => 1.0,
            "info" => 0.2,
            _ => 0.0,
        };
    }

    risk.min(10.0)
}

// ─── File categorization ───────────────────────────────────────────
fn categorize_file(path: &str) -> FileCategory {
    let category = if path.contains("test") || path.contains("spec") {
        "test"
    } else if path.contains("config") || path.contains(".env") || path.contains(".yml") {
        "config"
    } else if path.contains("migration") || path.contains("schema") {
        "database"
    } else if path.contains("api") || path.contains("handler") || path.contains("route") {
        "api"
    } else if path.contains("model") || path.contains("entity") {
        "model"
    } else if path.contains("doc") || path.contains("README") {
        "documentation"
    } else {
        "source"
    };

    let language = if path.ends_with(".go") {
        "Go"
    } else if path.ends_with(".rs") {
        "Rust"
    } else if path.ends_with(".py") {
        "Python"
    } else if path.ends_with(".js") || path.ends_with(".jsx") {
        "JavaScript"
    } else if path.ends_with(".ts") || path.ends_with(".tsx") {
        "TypeScript"
    } else if path.ends_with(".sql") {
        "SQL"
    } else if path.ends_with(".yml") || path.ends_with(".yaml") {
        "YAML"
    } else {
        "Other"
    };

    FileCategory {
        path: path.to_string(),
        category: category.to_string(),
        language: language.to_string(),
    }
}

// ─── Main ──────────────────────────────────────────────────────────
fn main() {
    let cli = Cli::parse();

    let mut diff = String::new();
    io::stdin().read_to_string(&mut diff).expect("Failed to read diff from stdin");

    let title = cli.title.unwrap_or_default();
    let body = cli.body.unwrap_or_default();

    let files = parse_diff(&diff);

    let mut all_functions: Vec<FunctionChange> = Vec::new();
    let mut all_patterns: Vec<PatternDetection> = Vec::new();
    let mut file_categories: Vec<FileCategory> = Vec::new();

    for file in &files {
        all_functions.extend(extract_functions(file));
        all_patterns.extend(detect_patterns(file));
        file_categories.push(categorize_file(&file.path));
    }

    let (summary, confidence) = infer_intent(&title, &body, &all_functions, &all_patterns);
    let complexity = compute_complexity(&files, &all_functions);
    let risk = compute_risk(&all_patterns, complexity);

    let result = AnalysisResult {
        functions_modified: all_functions,
        patterns_detected: all_patterns,
        confidence,
        summary,
        complexity_score: complexity,
        risk_score: risk,
        file_categories,
    };

    println!("{}", serde_json::to_string_pretty(&result).unwrap());
}
