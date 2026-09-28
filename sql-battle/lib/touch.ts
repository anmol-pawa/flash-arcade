"use client";

/**
 * True on phones and tablets (a finger is the primary pointer). Used to avoid
 * focusing the editor programmatically, which would pop the on-screen
 * keyboard over the arena on every card tap.
 */
export function isTouch(): boolean {
  return typeof window !== "undefined" && !!window.matchMedia?.("(pointer: coarse)").matches;
}
