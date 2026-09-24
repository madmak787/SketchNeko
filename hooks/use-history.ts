"use client"

import { useCallback, useRef, useState } from "react"

const MAX_HISTORY = 200

/**
 * Undo/redo for an immutable value.
 *
 * - `setLive` updates the value without recording history (used on every pointer move).
 * - `begin`/`end` bracket an interaction: the value at `begin` becomes one undo step at `end`
 *   (if anything changed), so a whole drag is undone at once.
 * - `commit` is a one-shot change. Passing a `mergeKey` coalesces rapid successive commits
 *   with the same key (e.g. dragging an opacity slider) into a single undo step.
 *
 * `ref.current` always holds the latest value, so event handlers never read stale state.
 */
export function useHistory<T>(initial: T) {
  const [value, setValue] = useState<T>(initial)
  const ref = useRef<T>(initial)
  const past = useRef<T[]>([])
  const future = useRef<T[]>([])
  const checkpoint = useRef<T | null>(null)
  const lastMerge = useRef<{ key: string; time: number } | null>(null)
  const [, setVersion] = useState(0)

  const setLive = useCallback((next: T | ((prev: T) => T)) => {
    const resolved = typeof next === "function" ? (next as (prev: T) => T)(ref.current) : next
    ref.current = resolved
    setValue(resolved)
  }, [])

  const push = useCallback((snapshot: T) => {
    past.current.push(snapshot)
    if (past.current.length > MAX_HISTORY) past.current.shift()
    future.current = []
    setVersion((v) => v + 1)
  }, [])

  const begin = useCallback(() => {
    if (checkpoint.current === null) checkpoint.current = ref.current
    lastMerge.current = null
  }, [])

  const end = useCallback(() => {
    const snap = checkpoint.current
    checkpoint.current = null
    if (snap !== null && snap !== ref.current) push(snap)
  }, [push])

  /** Discard the in-progress interaction and restore the value from `begin`. */
  const cancel = useCallback(() => {
    const snap = checkpoint.current
    checkpoint.current = null
    if (snap !== null) setLive(snap)
  }, [setLive])

  const commit = useCallback(
    (next: T | ((prev: T) => T), mergeKey?: string) => {
      const before = ref.current
      setLive(next)
      if (ref.current === before) return
      const now = Date.now()
      const merge = mergeKey && lastMerge.current?.key === mergeKey && now - lastMerge.current.time < 1000
      lastMerge.current = mergeKey ? { key: mergeKey, time: now } : null
      if (!merge) push(before)
    },
    [push, setLive],
  )

  /** Replace the value and wipe history (e.g. loading a file). */
  const reset = useCallback(
    (next: T) => {
      past.current = []
      future.current = []
      checkpoint.current = null
      lastMerge.current = null
      setLive(next)
      setVersion((v) => v + 1)
    },
    [setLive],
  )

  const undo = useCallback(() => {
    const prev = past.current.pop()
    if (prev === undefined) return false
    future.current.push(ref.current)
    lastMerge.current = null
    setLive(prev)
    setVersion((v) => v + 1)
    return true
  }, [setLive])

  const redo = useCallback(() => {
    const next = future.current.pop()
    if (next === undefined) return false
    past.current.push(ref.current)
    lastMerge.current = null
    setLive(next)
    setVersion((v) => v + 1)
    return true
  }, [setLive])

  return {
    value,
    ref,
    setLive,
    begin,
    end,
    cancel,
    commit,
    reset,
    undo,
    redo,
    canUndo: past.current.length > 0,
    canRedo: future.current.length > 0,
  }
}
