#!/bin/bash
# AirConnect failover 包装脚本(三台通用)
# 逻辑: 读同目录 peers.conf(空格分隔的"更高优先级机器"的 .local 名);
#       只要有任一更高优先级机器在线,就本机不跑桥(避免重复 AirPlay 目标);
#       所有更高优先级机器都不在线时,本机才启动 aircast 顶上。
# 保证"家里至少一台在连",且同一时刻只有一台在广播。
D="$HOME/Library/AirConnect"
BIN="$D/aircast"
PAT="AirConnect/aircast -Z"          # 精确匹配运行中的 aircast(不误伤本包装脚本)
LOG="$HOME/Library/Logs/aircast.log"
INT=30
higher_up() {
  # peers.conf: 空格分隔的"更高优先级机器"地址(用稳定的 Tailscale IP)
  local peers; peers="$(cat "$D/peers.conf" 2>/dev/null)"
  [ -z "$peers" ] && return 1        # 无更高优先级=自己就是主力
  local p
  for p in $peers; do
    # 心跳=TCP 连对方 SSH:22(比 ICMP/mDNS 可靠,不受隐身模式影响)
    nc -z -G2 "$p" 22 >/dev/null 2>&1 && return 0
  done
  return 1
}
cleanup() { pkill -f "$PAT" 2>/dev/null; exit 0; }
trap cleanup TERM INT
while true; do
  if higher_up; then
    pkill -f "$PAT" 2>/dev/null      # 有更高优先级在线→让位
  else
    pgrep -f "$PAT" >/dev/null 2>&1 || "$BIN" -Z >>"$LOG" 2>&1 &
  fi
  sleep "$INT"
done
