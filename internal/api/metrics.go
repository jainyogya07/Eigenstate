package api

import (
	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/promauto"
)

var (
	// RequestsTotal counts total HTTP requests.
	RequestsTotal = promauto.NewCounterVec(prometheus.CounterOpts{
		Name: "eigenstate_http_requests_total",
		Help: "Total HTTP requests",
	}, []string{"method", "endpoint", "status"})

	// RequestDuration tracks request latency.
	RequestDuration = promauto.NewHistogramVec(prometheus.HistogramOpts{
		Name:    "eigenstate_http_request_duration_seconds",
		Help:    "HTTP request latency in seconds",
		Buckets: prometheus.DefBuckets,
	}, []string{"method", "endpoint"})

	// IngestionJobsTotal counts ingestion jobs processed.
	IngestionJobsTotal = promauto.NewCounterVec(prometheus.CounterOpts{
		Name: "eigenstate_ingestion_jobs_total",
		Help: "Total ingestion jobs processed",
	}, []string{"status"})

	// RustAnalysisDuration tracks Rust binary execution time.
	RustAnalysisDuration = promauto.NewHistogram(prometheus.HistogramOpts{
		Name:    "eigenstate_rust_analysis_duration_seconds",
		Help:    "Rust intel binary execution time in seconds",
		Buckets: []float64{0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5},
	})

	// ActiveWorkers tracks the number of active workers.
	ActiveWorkers = promauto.NewGauge(prometheus.GaugeOpts{
		Name: "eigenstate_active_workers",
		Help: "Number of active ingestion workers",
	})

	// DBPoolConnections tracks database pool activity.
	DBPoolConnections = promauto.NewGaugeVec(prometheus.GaugeOpts{
		Name: "eigenstate_db_pool_connections",
		Help: "Database connection pool metrics",
	}, []string{"state"})

	// PatternsDetected counts detected patterns by type.
	PatternsDetected = promauto.NewCounterVec(prometheus.CounterOpts{
		Name: "eigenstate_patterns_detected_total",
		Help: "Code patterns detected by Rust analysis",
	}, []string{"pattern", "severity"})
)
