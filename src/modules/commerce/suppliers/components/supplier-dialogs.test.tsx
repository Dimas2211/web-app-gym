// ─────────────────────────────────────────────────────────────────
// commerce/suppliers — supplier-dialogs.test.tsx
//
// SHARED-PILOT-4C-C1 — los dialogs de proveedor no se cierran por
// click/pointer en el backdrop (una selección de texto que termina
// fuera del panel descartaba el formulario). Solo X, Cancelar o éxito.
//
// Sin DOM en el setup de vitest: los hooks de React se sustituyen por
// un harness mínimo y se recorre el árbol de elementos devuelto por el
// componente, invocando directamente los handlers.
// ─────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ReactElement, ReactNode } from "react";

// ── Harness de hooks ──────────────────────────────────────────────

const harness = vi.hoisted(() => ({
  store: [] as unknown[],
  idx: 0,
  actionState: undefined as unknown,
  formAction: (() => {}) as (...args: unknown[]) => void,
}));

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return {
    ...actual,
    useState: (init: unknown) => {
      const i = harness.idx++;
      if (!(i in harness.store)) harness.store[i] = typeof init === "function" ? (init as () => unknown)() : init;
      const set = (v: unknown) => {
        harness.store[i] = typeof v === "function" ? (v as (p: unknown) => unknown)(harness.store[i]) : v;
      };
      return [harness.store[i], set];
    },
    useEffect: () => {},
    useActionState: () => [harness.actionState, harness.formAction, false],
    startTransition: (fn: () => void) => fn(),
  };
});

vi.mock("../actions/create-supplier.action", () => ({ createSupplierAction: vi.fn() }));
vi.mock("../actions/update-supplier.action", () => ({ updateSupplierAction: vi.fn() }));
vi.mock("../actions/quick-create-supplier.action", () => ({ quickCreateSupplierAction: vi.fn() }));

import { NewSupplierDialog } from "./new-supplier-dialog";
import { EditSupplierDialog } from "./edit-supplier-dialog";
import { QuickCreateSupplierDialog } from "./quick-create-supplier-dialog";

// ── Helpers de árbol ──────────────────────────────────────────────

type El = ReactElement<Record<string, unknown> & { children?: ReactNode }>;

function isEl(n: unknown): n is El {
  return typeof n === "object" && n !== null && "type" in n && "props" in n;
}

function walk(node: ReactNode, out: El[] = []): El[] {
  if (Array.isArray(node)) {
    for (const c of node) walk(c, out);
  } else if (isEl(node)) {
    out.push(node);
    walk(node.props.children as ReactNode, out);
  }
  return out;
}

function textOf(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textOf).join("");
  if (isEl(node)) return textOf(node.props.children as ReactNode);
  return "";
}

function render(fn: () => ReactNode) {
  harness.idx = 0;
  return fn() as El;
}

const BACKDROP_HANDLERS = ["onClick", "onMouseDown", "onMouseUp", "onPointerDown", "onPointerUp"];

/** El overlay no tiene handlers de cierre; si existieran, un click
 *  directo sobre él (target === currentTarget) no debe cerrar. */
function expectBackdropDoesNotClose(overlay: El, onClose: ReturnType<typeof vi.fn>) {
  for (const h of BACKDROP_HANDLERS) {
    expect(overlay.props[h]).toBeUndefined();
  }
  expect(String(overlay.props.className)).toContain("fixed inset-0");
  expect(onClose).not.toHaveBeenCalled();
}

function findButton(tree: El, predicate: (b: El) => boolean) {
  const btn = walk(tree).find((e) => e.type === "button" && predicate(e));
  expect(btn).toBeDefined();
  return btn!;
}

const clickClose = (tree: El) =>
  (findButton(tree, (b) => b.props["aria-label"] === "Cerrar").props.onClick as () => void)();
const clickCancel = (tree: El) =>
  (findButton(tree, (b) => textOf(b.props.children as ReactNode).includes("Cancelar")).props.onClick as () => void)();

beforeEach(() => {
  harness.store = [];
  harness.idx = 0;
  harness.actionState = undefined;
  harness.formAction = vi.fn();
});

// ── NewSupplierDialog ─────────────────────────────────────────────

describe("NewSupplierDialog — cierre explícito", () => {
  it("backdrop sin handler de cierre; panel con role=dialog + aria-modal", () => {
    const onClose = vi.fn();
    const tree = render(() => NewSupplierDialog({ onClose }));
    expectBackdropDoesNotClose(tree, onClose);
    const panel = walk(tree).find((e) => e.props.role === "dialog");
    expect(panel?.props["aria-modal"]).toBe("true");
  });

  it("X cierra", () => {
    const onClose = vi.fn();
    clickClose(render(() => NewSupplierDialog({ onClose })));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("Cancelar cierra", () => {
    const onClose = vi.fn();
    clickCancel(render(() => NewSupplierDialog({ onClose })));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("el form usa onSubmit (no `action=`) para evitar el reset automático de React 19", () => {
    const tree = render(() => NewSupplierDialog({ onClose: vi.fn() }));
    const form = walk(tree).find((e) => e.type === "form")!;
    expect(form.props.action).toBeUndefined();
    expect(typeof form.props.onSubmit).toBe("function");
  });
});

describe("NewSupplierDialog — errores de campo stale", () => {
  const TAX_ERR = "Tipo de contribuyente inválido.";
  const ID_ERR  = "Tipo de identificación inválido.";
  const NIT_ERR = "El NIT debe tener el formato 0000-000000-000-0.";

  function shownErrors(tree: El): string[] {
    return walk(tree)
      .filter((e) => typeof e.type === "function" && e.type.name === "FieldError")
      .map((e) => (e.props.errors as string[] | undefined)?.[0])
      .filter((m): m is string => Boolean(m));
  }

  function change(tree: El, name: string) {
    const form = walk(tree).find((e) => e.type === "form")!;
    (form.props.onChange as (e: unknown) => void)({ target: { name } });
  }

  it("oculta el error de un campo al modificarlo y lo vuelve a mostrar tras un nuevo submit", () => {
    const onClose = vi.fn();
    const draw = () => render(() => NewSupplierDialog({ onClose }));
    harness.actionState = { errors: { taxpayer_type: [TAX_ERR], id_type_code: [ID_ERR], nit: [NIT_ERR] } };

    let tree = draw();
    expect(shownErrors(tree).sort()).toEqual([ID_ERR, NIT_ERR, TAX_ERR].sort());

    // Usuario corrige taxpayer_type → solo ese error desaparece
    change(tree, "taxpayer_type");
    tree = draw();
    expect(shownErrors(tree).sort()).toEqual([ID_ERR, NIT_ERR].sort());

    // Usuario corrige id_type_code
    change(tree, "id_type_code");
    tree = draw();
    expect(shownErrors(tree)).toEqual([NIT_ERR]);

    // Campo sin error editado → no afecta al resto
    change(tree, "name");
    tree = draw();
    expect(shownErrors(tree)).toEqual([NIT_ERR]);

    // Nuevo submit (nueva respuesta del servidor) → errores vuelven a mostrarse
    harness.actionState = { errors: { taxpayer_type: [TAX_ERR] } };
    tree = draw();
    expect(shownErrors(tree)).toEqual([TAX_ERR]);
    expect(onClose).not.toHaveBeenCalled();
  });

  it("no oculta errores sin que el usuario modifique el campo", () => {
    harness.actionState = { errors: { taxpayer_type: [TAX_ERR] } };
    const draw = () => render(() => NewSupplierDialog({ onClose: vi.fn() }));
    draw();
    expect(shownErrors(draw())).toEqual([TAX_ERR]);
  });
});

// ── EditSupplierDialog ────────────────────────────────────────────

const SUPPLIER = {
  id: "7f1c1f0e-7a55-4c8e-9a0d-2f3b7a1f5e11",
  supplier_code: "PROV-NIT-001",
  name: "Supplier Test NIT",
  taxpayer_type: "SMALL_TAXPAYER",
  person_type: "NATURAL_PERSON",
  id_type_code: "36",
  nit: "0614-010268-009-9",
} as unknown as Parameters<typeof EditSupplierDialog>[0]["supplier"];

describe("EditSupplierDialog — cierre explícito", () => {
  it("backdrop sin handler de cierre; panel con role=dialog + aria-modal", () => {
    const onClose = vi.fn();
    const tree = render(() => EditSupplierDialog({ supplier: SUPPLIER, onClose }));
    expectBackdropDoesNotClose(tree, onClose);
    const panel = walk(tree).find((e) => e.props.role === "dialog");
    expect(panel?.props["aria-modal"]).toBe("true");
    const form = walk(tree).find((e) => e.type === "form")!;
    expect(form.props.action).toBeUndefined();
  });

  it("X y Cancelar cierran", () => {
    const onClose = vi.fn();
    clickClose(render(() => EditSupplierDialog({ supplier: SUPPLIER, onClose })));
    clickCancel(render(() => EditSupplierDialog({ supplier: SUPPLIER, onClose })));
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});

// ── QuickCreateSupplierDialog ─────────────────────────────────────

describe("QuickCreateSupplierDialog — cierre explícito", () => {
  const props = (onClose: () => void) => ({ open: true, prefillName: "ACME", onSuccess: vi.fn(), onClose });

  it("backdrop sin handler de cierre; role=dialog conservado", () => {
    const onClose = vi.fn();
    const tree = render(() => QuickCreateSupplierDialog(props(onClose)));
    expectBackdropDoesNotClose(tree, onClose);
    expect(walk(tree).some((e) => e.props.role === "dialog" && e.props["aria-modal"] === "true")).toBe(true);
  });

  it("X cierra", () => {
    const onClose = vi.fn();
    clickClose(render(() => QuickCreateSupplierDialog(props(onClose))));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("open=false no renderiza", () => {
    expect(QuickCreateSupplierDialog({ ...props(vi.fn()), open: false })).toBeNull();
  });
});
