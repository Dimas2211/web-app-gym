// ─────────────────────────────────────────────────────────────────
// lib/server-actions/use-server-exports.test.ts
//
// FEX11-SERVER-ACTIONS-RUNTIME-500 — un archivo "use server" solo puede
// exportar funciones async en runtime. Si exporta un objeto/array/clase,
// `next build` pasa igual, pero en producción toda página que alcance el
// módulo falla con 500 al invocar CUALQUIER Server Action
// ("A 'use server' file can only export async functions, found object").
// Los unit tests que importan las actions como funciones TS tampoco lo
// detectan. Este test inspecciona estáticamente (AST) todos los archivos
// con directiva "use server" a nivel de archivo en src/.
// ─────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import ts from "typescript";

const SRC = join(__dirname, "..", "..");

function listSourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === "node_modules" ? [] : listSourceFiles(full);
    return /\.(ts|tsx)$/.test(entry.name) && !/\.(test|spec)\.tsx?$/.test(entry.name) ? [full] : [];
  });
}

function hasModifier(node: ts.Node, kind: ts.SyntaxKind): boolean {
  return ts.canHaveModifiers(node) && (ts.getModifiers(node)?.some((m) => m.kind === kind) ?? false);
}

function hasFileLevelUseServer(sf: ts.SourceFile): boolean {
  for (const stmt of sf.statements) {
    if (!ts.isExpressionStatement(stmt) || !ts.isStringLiteral(stmt.expression)) return false;
    if (stmt.expression.text === "use server") return true;
  }
  return false;
}

/** Exports runtime que no son funciones async declaradas. */
function findInvalidUseServerExports(source: string, fileName = "file.ts"): string[] {
  const sf = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true,
    fileName.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  if (!hasFileLevelUseServer(sf)) return [];

  const invalid: string[] = [];
  const line = (n: ts.Node) => sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1;

  for (const stmt of sf.statements) {
    if (ts.isInterfaceDeclaration(stmt) || ts.isTypeAliasDeclaration(stmt)) continue;

    if (ts.isExportDeclaration(stmt)) {
      if (stmt.isTypeOnly) continue;
      const specifiers = stmt.exportClause && ts.isNamedExports(stmt.exportClause) ? stmt.exportClause.elements : null;
      if (specifiers && specifiers.every((s) => s.isTypeOnly)) continue;
      invalid.push(`L${line(stmt)}: re-export runtime (${stmt.getText(sf).slice(0, 80)})`);
      continue;
    }
    if (ts.isExportAssignment(stmt)) {
      invalid.push(`L${line(stmt)}: export default de expresión`);
      continue;
    }
    if (!hasModifier(stmt, ts.SyntaxKind.ExportKeyword) || hasModifier(stmt, ts.SyntaxKind.DeclareKeyword)) continue;

    if (ts.isFunctionDeclaration(stmt)) {
      if (!hasModifier(stmt, ts.SyntaxKind.AsyncKeyword) || stmt.asteriskToken) {
        invalid.push(`L${line(stmt)}: function no async (${stmt.name?.text ?? "default"})`);
      }
      continue;
    }
    if (ts.isVariableStatement(stmt)) {
      const names = stmt.declarationList.declarations.map((d) => d.name.getText(sf)).join(", ");
      invalid.push(`L${line(stmt)}: export const/let/var (${names})`);
      continue;
    }
    if (ts.isClassDeclaration(stmt)) {
      invalid.push(`L${line(stmt)}: export class (${stmt.name?.text ?? "default"})`);
      continue;
    }
    if (ts.isEnumDeclaration(stmt)) {
      if (!hasModifier(stmt, ts.SyntaxKind.ConstKeyword)) invalid.push(`L${line(stmt)}: export enum (${stmt.name.text})`);
      continue;
    }
    if (ts.isModuleDeclaration(stmt)) {
      invalid.push(`L${line(stmt)}: export namespace`);
    }
  }
  return invalid;
}

describe("findInvalidUseServerExports — detector", () => {
  it("acepta solo funciones async y tipos", () => {
    const ok = `"use server";
      import { x } from "./x";
      export interface A { a: string }
      export type B = { b: number };
      export type { C } from "./c";
      export async function act() {}
      export default async function page() {}`;
    expect(findInvalidUseServerExports(ok)).toEqual([]);
  });

  it("detecta const/array/Set/clase/re-export/función síncrona/export default de objeto", () => {
    const bad = `"use server";
      export const LIST = ["DELIVER_EXTERNAL"] as const;
      export const SET = new Set([1]);
      export class K {}
      export { helper } from "./helper";
      export function sync() {}
      export default { a: 1 };`;
    expect(findInvalidUseServerExports(bad)).toHaveLength(6);
  });

  it("ignora archivos sin directiva de archivo (p. ej. 'use server' inline)", () => {
    expect(findInvalidUseServerExports(`export const A = 1;
      export async function f() { "use server"; }`)).toEqual([]);
  });
});

describe("archivos 'use server' del proyecto", () => {
  const files = listSourceFiles(SRC)
    .map((f) => ({ f, src: readFileSync(f, "utf8") }))
    .filter(({ src }) => src.includes("use server"));

  it("solo exportan funciones async en runtime", () => {
    const violations = files.flatMap(({ f, src }) =>
      findInvalidUseServerExports(src, f).map((v) => `${relative(SRC, f)} ${v}`),
    );
    expect(violations).toEqual([]);
  });

  it("los action files FEX y DTE quedan auditados", () => {
    const audited = files
      .filter(({ f, src }) => hasFileLevelUseServer(ts.createSourceFile(f, src, ts.ScriptTarget.Latest)))
      .map(({ f }) => relative(SRC, f).replace(/\\/g, "/"));
    for (const expected of [
      "modules/commerce/sales/export/actions/export-sale.actions.ts",
      "modules/commerce/sales/export/actions/export-sale-dte.actions.ts",
      "modules/commerce/dte/actions/generate-fex-json-for-sale.action.ts",
      "modules/commerce/dte/actions/sign-dte-document.action.ts",
      "modules/commerce/dte/actions/transmit-dte-document.action.ts",
      "modules/commerce/dte/actions/deliver-dte-to-external-db.action.ts",
    ]) {
      expect(audited).toContain(expected);
    }
  });
});
