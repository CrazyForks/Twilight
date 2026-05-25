//go:build !unix

package store

// 非 Unix 平台（Windows）没有 O_NOFOLLOW；symlink 攻击面较小（默认禁用），
// 这里退化成 0 让 OpenFile 走标准 flag。
const fsNoFollow = 0
