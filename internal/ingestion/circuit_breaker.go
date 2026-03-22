package ingestion

import (
	"log/slog"
	"sync"
	"time"
)

// CircuitState represents the state of the circuit breaker.
type CircuitState int

const (
	CircuitClosed   CircuitState = iota // Normal operation
	CircuitOpen                         // Requests blocked
	CircuitHalfOpen                     // Testing if service recovered
)

// CircuitBreaker implements the circuit breaker pattern for external API calls.
type CircuitBreaker struct {
	mu              sync.RWMutex
	state           CircuitState
	failureCount    int
	successCount    int
	maxFailures     int
	resetTimeout    time.Duration
	halfOpenMaxReqs int
	lastFailTime    time.Time
}

// NewCircuitBreaker creates a new circuit breaker.
func NewCircuitBreaker(maxFailures int, resetTimeout time.Duration) *CircuitBreaker {
	return &CircuitBreaker{
		state:           CircuitClosed,
		maxFailures:     maxFailures,
		resetTimeout:    resetTimeout,
		halfOpenMaxReqs: 3,
	}
}

// Execute runs the given function through the circuit breaker.
func (cb *CircuitBreaker) Execute(fn func() error) error {
	cb.mu.RLock()
	state := cb.state
	cb.mu.RUnlock()

	switch state {
	case CircuitOpen:
		// Check if reset timeout has elapsed
		cb.mu.RLock()
		elapsed := time.Since(cb.lastFailTime)
		cb.mu.RUnlock()

		if elapsed < cb.resetTimeout {
			slog.Warn("Circuit breaker OPEN, rejecting request",
				"retry_after", cb.resetTimeout-elapsed)
			return ErrCircuitOpen
		}
		// Transition to half-open
		cb.mu.Lock()
		cb.state = CircuitHalfOpen
		cb.successCount = 0
		cb.mu.Unlock()
		slog.Info("Circuit breaker transitioning to HALF-OPEN")

	case CircuitHalfOpen:
		cb.mu.RLock()
		if cb.successCount >= cb.halfOpenMaxReqs {
			cb.mu.RUnlock()
			cb.mu.Lock()
			cb.state = CircuitClosed
			cb.failureCount = 0
			cb.mu.Unlock()
			slog.Info("Circuit breaker CLOSED (recovered)")
		} else {
			cb.mu.RUnlock()
		}
	}

	err := fn()

	if err != nil {
		cb.mu.Lock()
		cb.failureCount++
		cb.lastFailTime = time.Now()

		if cb.failureCount >= cb.maxFailures {
			cb.state = CircuitOpen
			slog.Error("Circuit breaker OPENED",
				"failures", cb.failureCount,
				"reset_after", cb.resetTimeout)
		}
		cb.mu.Unlock()
		return err
	}

	cb.mu.Lock()
	cb.successCount++
	if cb.state == CircuitHalfOpen && cb.successCount >= cb.halfOpenMaxReqs {
		cb.state = CircuitClosed
		cb.failureCount = 0
		slog.Info("Circuit breaker CLOSED (recovered)")
	}
	cb.mu.Unlock()

	return nil
}

// State returns the current circuit breaker state as a string.
func (cb *CircuitBreaker) State() string {
	cb.mu.RLock()
	defer cb.mu.RUnlock()
	switch cb.state {
	case CircuitOpen:
		return "open"
	case CircuitHalfOpen:
		return "half-open"
	default:
		return "closed"
	}
}

// ErrCircuitOpen is returned when the circuit breaker is open.
var ErrCircuitOpen = &CircuitOpenError{}

type CircuitOpenError struct{}

func (e *CircuitOpenError) Error() string {
	return "circuit breaker is open — GitHub API appears unavailable"
}
