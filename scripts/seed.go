package main

	import (
	"context"
	"fmt"
	"log"
	"os"

	"github.com/eigenstate/eigenstate/internal/db"
	"github.com/jackc/pgx/v5/pgxpool"
)

func main() {
	fmt.Println("Seeding Eigenstate Database (UI Alignment Mode)...")

	// 1. Setup DB
	dsn := os.Getenv("DATABASE_URL")
	if dsn == "" {
		dsn = "postgres://localhost:5432/eigenstate?sslmode=disable"
	}
	os.Setenv("DATABASE_URL", dsn)
	ctx := context.Background()

	database, err := db.NewDB(ctx)
	if err != nil {
		log.Fatalf("Failed to connect to db: %v", err)
	}
	defer database.Close(ctx)

	// Direct raw pool for custom timestamps
	rawPool, err := pgxpool.New(ctx, dsn)
	if err != nil {
		log.Fatalf("Failed to create raw pool: %v", err)
	}
	defer rawPool.Close()

	// Ensure tables exist
	database.AutoMigrate(ctx)

	owner := "fastify"
	repo := "fastify"

	// 2. Register Repo
	fmt.Printf("Registering repo: %s/%s\n", owner, repo)
	database.RegisterRepo(ctx, owner, repo)

	// 3. Insert mock PR
	fmt.Println("Inserting mock Pull Requests...")
	database.SaveNormalizedPR(ctx, db.NormalizedPR{
		Owner: owner, Repo: repo, PRNumber: 5415,
		Title: "perf: optimize route matching with radix tree", Body: "Significant performance boost for large route sets.",
		Author: "delvedor", State: "merged", MergedAt: "2024-02-15T10:00:00Z",
	})
	database.SaveNormalizedPR(ctx, db.NormalizedPR{
		Owner: owner, Repo: repo, PRNumber: 5411,
		Title: "feat: add async/await support for hooks", Body: "Allows for cleaner async logic in lifecycle hooks.",
		Author: "mcollina", State: "merged", MergedAt: "2024-01-10T08:00:00Z",
	})
	database.SaveNormalizedPR(ctx, db.NormalizedPR{
		Owner: owner, Repo: repo, PRNumber: 5380,
		Title: "fix: memory leak in plugin registration", Body: "Fixes a long-standing leak when dynamically registering plugins.",
		Author: "fastify-bot", State: "merged", MergedAt: "2023-12-01T15:30:00Z",
	})

	// 4. Insert mock Issues
	fmt.Println("Inserting mock Issues...")
	database.SaveNormalizedIssue(ctx, db.NormalizedIssue{
		Owner: owner, Repo: repo, Number: 5300,
		Title: "Memory spike during high load", Body: "Observed unexpected memory growth when registering many routes.",
		State: "closed",
	})

	// 5. Insert EXACT data matching user UI Mockup
	fmt.Println("Inserting Code Explorer Mockup Data...")
	funcs := []db.NormalizedFunction{
		{
			Owner: owner, Repo: repo, FilePath: "lib/server.js",
			Name: "fastify", Language: "JavaScript", ChangeType: "added",
			PRNumber: 5415, Summary: "Core fastify initialization factory.",
			Decision: "Use factory pattern for server creation", Reason: "Encapsulation and testing", Tradeoff: "Minor overhead",
			Evidence: "Implemented Fastify() function", Confidence: 0.98,
			CreatedAt: "2024-02-15 10:00:00",
		},
		{
			Owner: owner, Repo: repo, FilePath: "lib/router.js",
			Name: "findRoute", Language: "JavaScript", ChangeType: "modified",
			PRNumber: 5415, Summary: "Optimized route lookups using Radix Tree.",
			Decision: "Switch from Regex to Radix Tree",
			Reason: "Linear time complexity for route matching is too slow for large apps",
			Tradeoff: "Memory usage vs lookup speed",
			Evidence: "- PR comment: 'benchmarks show 4x improvement'\n- Imported find-my-way",
			Confidence: 0.95,
			CreatedAt: "2024-02-15 11:30:00",
		},
		{
			Owner: owner, Repo: repo, FilePath: "lib/request.js",
			Name: "Request", Language: "JavaScript", ChangeType: "modified",
			PRNumber: 5411, Summary: "Refactored Request object for better extensibility.",
			Decision: "Use prototypical inheritance for Request",
			Reason: "Improve performance when creating many request objects",
			Tradeoff: "Slightly more complex internal API",
			Evidence: "Moved properties to Request.prototype",
			Confidence: 0.94,
			CreatedAt: "2024-01-10 10:00:00",
		},
		{
			Owner: owner, Repo: repo, FilePath: "lib/reply.js",
			Name: "Reply", Language: "JavaScript", ChangeType: "modified",
			PRNumber: 5380, Summary: "Added support for custom serializers.",
			Decision: "Allow per-route response serializers",
			Reason: "Users need flexibility beyond JSON for specific routes",
			Tradeoff: "Additional check in the send pipeline",
			Evidence: "Added reply.serializer() method",
			Confidence: 0.97,
			CreatedAt: "2023-12-01 17:00:00",
		},
		{
			Owner: owner, Repo: repo, FilePath: "lib/server.js",
			Name: "listen", Language: "JavaScript", ChangeType: "modified",
			PRNumber: 5415, Summary: "Improved dual-stack (IPv4/IPv6) support.",
			Decision: "Prefer IPv6 by default if available",
			Reason: "Modern networking standards alignment",
			Tradeoff: "Potential connectivity issues in older environments",
			Evidence: "Updated default host to '::'",
			Confidence: 0.91,
			CreatedAt: "2024-02-15 12:00:00",
		},
	}

	for _, fn := range funcs {
		query := `
			INSERT INTO functions (owner, repo, file_path, name, language, change_type, pr_number, summary, decision, reason, tradeoff, evidence, confidence, created_at)
			VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
		`
		rawPool.Exec(ctx, query, fn.Owner, fn.Repo, fn.FilePath, fn.Name, fn.Language, fn.ChangeType, fn.PRNumber, fn.Summary, fn.Decision, fn.Reason, fn.Tradeoff, fn.Evidence, fn.Confidence, fn.CreatedAt)
		
		tlQuery := `
			INSERT INTO decision_timeline (owner, repo, function_name, file_path, pr_number, change_type, summary, decision, reason, tradeoff, evidence, confidence, created_at)
			VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
		`
		rawPool.Exec(ctx, tlQuery, fn.Owner, fn.Repo, fn.Name, fn.FilePath, fn.PRNumber, fn.ChangeType, fn.Summary, fn.Decision, fn.Reason, fn.Tradeoff, fn.Evidence, fn.Confidence, fn.CreatedAt)
	}

	database.EmitEvent("ingestion_complete", owner, repo, 5415)

	fmt.Println("Seed Complete! You can now query:")
	fmt.Printf("GET /api/v1/why?owner=%s&repo=%s&function_name=fastify\n", owner, repo)
}
