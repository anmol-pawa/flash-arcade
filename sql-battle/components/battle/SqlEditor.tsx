"use client";
import { autocompletion, snippet } from "@codemirror/autocomplete";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { PLSQL, PostgreSQL, sql } from "@codemirror/lang-sql";
import { Compartment, EditorState, Prec } from "@codemirror/state";
import { EditorView, keymap, placeholder } from "@codemirror/view";
import { tags as t } from "@lezer/highlight";
import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import { TABLES } from "@/content/schema";
import type { Dialect } from "@/lib/dialect/lint";

export interface SqlEditorHandle {
  insert(template: string): void;
  setValue(v: string): void;
  focus(): void;
}

const neon = HighlightStyle.define([
  { tag: t.keyword, color: "#f0abfc", fontWeight: "700" },
  { tag: [t.string, t.special(t.string)], color: "#fde68a" },
  { tag: [t.number, t.bool, t.null], color: "#fdba74" },
  { tag: [t.function(t.variableName), t.standard(t.name)], color: "#67e8f9" },
  { tag: t.typeName, color: "#86efac" },
  { tag: [t.operator, t.punctuation], color: "#c4b5fd" },
  { tag: t.comment, color: "#6b7280", fontStyle: "italic" },
  { tag: t.name, color: "#e5e7eb" },
]);

const theme = EditorView.theme(
  {
    "&": { backgroundColor: "rgba(5,3,14,0.85)", color: "#e7e5f4", fontSize: "14px" },
    ".cm-content": { fontFamily: "var(--font-mono)", padding: "12px 0", caretColor: "var(--accent)" },
    ".cm-gutters": { backgroundColor: "transparent", border: "none", color: "rgba(255,255,255,0.25)" },
    ".cm-activeLine": { backgroundColor: "rgba(255,255,255,0.035)" },
    ".cm-activeLineGutter": { backgroundColor: "transparent", color: "var(--accent)" },
    ".cm-cursor": { borderLeftColor: "var(--accent)", borderLeftWidth: "2px" },
    ".cm-selectionBackground, &.cm-focused .cm-selectionBackground": { backgroundColor: "rgba(94,234,212,0.18) !important" },
    ".cm-tooltip": { backgroundColor: "#140f2a", border: "1px solid rgba(255,255,255,0.12)", borderRadius: "10px", overflow: "hidden" },
    ".cm-tooltip-autocomplete ul li[aria-selected]": { backgroundColor: "var(--accent)", color: "#07050f" },
    ".cm-snippetField": { backgroundColor: "rgba(250,204,21,0.15)", borderBottom: "1px dashed #facc15" },
    ".cm-placeholder": { color: "rgba(255,255,255,0.25)" },
    ".cm-scroller": { overflow: "auto" },
  },
  { dark: true },
);

function schemaFor() {
  return Object.fromEntries(TABLES.map((tb) => [tb.name, tb.columns.map((c) => c.name)]));
}

export const SqlEditor = forwardRef<SqlEditorHandle, { value: string; onChange: (v: string) => void; dialect: Dialect; onRun: () => void; onPreview?: () => void; readOnly?: boolean }>(
  function SqlEditor({ value, onChange, dialect, onRun, onPreview, readOnly }, ref) {
    const host = useRef<HTMLDivElement>(null);
    const view = useRef<EditorView | null>(null);
    const lang = useRef(new Compartment());
    const ro = useRef(new Compartment());
    const cb = useRef({ onChange, onRun, onPreview });
    cb.current = { onChange, onRun, onPreview };

    useEffect(() => {
      const v = new EditorView({
        parent: host.current!,
        state: EditorState.create({
          doc: value,
          extensions: [
            history(),
            theme,
            syntaxHighlighting(neon),
            EditorView.lineWrapping,
            placeholder("-- write your spell… (Ctrl/⌘ + Enter to cast)"),
            lang.current.of(sql({ dialect: dialect === "oracle" ? PLSQL : PostgreSQL, schema: schemaFor(), upperCaseKeywords: true })),
            ro.current.of(EditorState.readOnly.of(!!readOnly)),
            autocompletion({ activateOnTyping: true, icons: false }),
            Prec.highest(
              keymap.of([
                { key: "Mod-Enter", run: () => (cb.current.onRun(), true) },
                { key: "Shift-Mod-Enter", run: () => (cb.current.onPreview?.(), true) },
              ]),
            ),
            keymap.of([indentWithTab, ...defaultKeymap, ...historyKeymap]),
            EditorView.updateListener.of((u) => {
              if (u.docChanged) cb.current.onChange(u.state.doc.toString());
            }),
          ],
        }),
      });
      view.current = v;
      return () => v.destroy();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
      view.current?.dispatch({ effects: lang.current.reconfigure(sql({ dialect: dialect === "oracle" ? PLSQL : PostgreSQL, schema: schemaFor(), upperCaseKeywords: true })) });
    }, [dialect]);

    useEffect(() => {
      view.current?.dispatch({ effects: ro.current.reconfigure(EditorState.readOnly.of(!!readOnly)) });
    }, [readOnly]);

    // external value changes (new round, reset): cursor goes to the end of the
    // first line, e.g. right after a starter "SELECT "
    useEffect(() => {
      const v = view.current;
      if (v && v.state.doc.toString() !== value) {
        const eol = value.indexOf("\n");
        v.dispatch({ changes: { from: 0, to: v.state.doc.length, insert: value }, selection: { anchor: eol < 0 ? value.length : eol } });
      }
    }, [value]);

    useImperativeHandle(ref, () => ({
      insert(template: string) {
        const v = view.current;
        if (!v) return;
        const { from, to } = v.state.selection.main;
        if (template.includes("${")) {
          // tab-through fields
          snippet(template)(v, null, from, to);
        } else {
          // plain text (a column or table name): cursor lands after it
          v.dispatch({ changes: { from, to, insert: template }, selection: { anchor: from + template.length }, scrollIntoView: true });
        }
        v.focus();
      },
      setValue(s: string) {
        const v = view.current;
        if (v) v.dispatch({ changes: { from: 0, to: v.state.doc.length, insert: s } });
      },
      focus() {
        view.current?.focus();
      },
    }));

    return <div ref={host} className="cm-host h-full min-h-[180px]" data-testid="sql-editor" />;
  },
);
