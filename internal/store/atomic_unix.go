//go:build unix

package store

import "syscall"

// fsNoFollow 让 OpenFile 拒绝穿越 symlink。Unix 平台一律带上，避免攻击者
// 通过 path.tmp -> /etc/passwd 的 symlink 把 writeFileAtomicSync 的写入
// 重定向到任意文件。
const fsNoFollow = syscall.O_NOFOLLOW
