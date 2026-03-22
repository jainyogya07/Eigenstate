package ingestion

import (
	"context"
	"os"

	"github.com/google/go-github/v60/github"
	"golang.org/x/oauth2"
)

// Config holds the ingestion service configuration.
type Config struct {
	GitHubToken string
}

// NewClient returns a new GitHub client with OAuth2 authentication.
func (c *Config) NewClient(ctx context.Context) *github.Client {
	ts := oauth2.StaticTokenSource(
		&oauth2.Token{AccessToken: c.GitHubToken},
	)
	tc := oauth2.NewClient(ctx, ts)
	return github.NewClient(tc)
}

// LoadConfigFromEnv loads configuration from environment variables.
func LoadConfigFromEnv() *Config {
	return &Config{
		GitHubToken: os.Getenv("GITHUB_TOKEN"),
	}
}
