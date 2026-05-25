package api

import (
	"context"
	"fmt"
	"sync"
	"sync/atomic"
	"time"

	"go.uber.org/zap"

	"github.com/prejudice-studio/twilight/internal/redis"
)

type rateLimiter struct {
	mu          sync.Mutex
	items       map[string]rateBucket
	redis       *redis.Client
	prefix      string
	lastCleanup time.Time

	// redis 失败回退到内存桶时累加，运维通过 /system/stats 观察是否进入降级。
	// 任何非 nil err（连接断开、超时、命令拒绝）都计入；命中后 fallbackCount
	// 持续递增意味着 redis 已不可用，登录限流退化为单进程内存桶。
	fallbackCount atomic.Int64
}

type rateBucket struct {
	Count   int
	ResetAt time.Time
}

func newRateLimiter(redisClient *redis.Client) *rateLimiter {
	return &rateLimiter{
		items:       map[string]rateBucket{},
		redis:       redisClient,
		prefix:      "twilight:rate:",
		lastCleanup: time.Now(),
	}
}

func (r *rateLimiter) Allow(ctx context.Context, key string, limit int, window time.Duration) bool {
	if limit <= 0 {
		return true
	}
	if r.redis != nil {
		count, err := r.redis.IncrExpire(ctx, r.prefix+key, int(window/time.Second))
		if err == nil {
			return count <= int64(limit)
		}
		r.fallbackCount.Add(1)
		zap.L().Warn("redis rate limit failed; falling back to memory", zap.Error(err))
	}
	now := time.Now()
	r.mu.Lock()
	defer r.mu.Unlock()

	// Periodically purge expired buckets to prevent memory leak
	if now.Sub(r.lastCleanup) > 5*time.Minute {
		for k, b := range r.items {
			if now.After(b.ResetAt) {
				delete(r.items, k)
			}
		}
		r.lastCleanup = now
	}

	bucket := r.items[key]
	if now.After(bucket.ResetAt) {
		bucket = rateBucket{ResetAt: now.Add(window)}
	}
	bucket.Count++
	r.items[key] = bucket
	return bucket.Count <= limit
}

func rateKey(parts ...any) string {
	return fmt.Sprint(parts...)
}

// FallbackCount 报告自启动以来 redis 限流失败回退到内存桶的累计次数。
// 仅观察用：值持续增长说明 redis 实例失联或被熔断，多副本部署会出现"每副本
// 各自一份内存桶"的降级，限流上限实际被放大 N 倍。
func (r *rateLimiter) FallbackCount() int64 {
	if r == nil {
		return 0
	}
	return r.fallbackCount.Load()
}
