"use client";

import { useActionState, useState } from "react";
import { createTemplateAction, saveTemplateAction } from "./actions";
import { Button, Field, Input, Select, Textarea } from "@/components/ui";
import { FormError, SubmitButton } from "@/components/forms";

type StepDraft = {
  type: string;
  label: string;
  instructions?: string;
  expectedResult?: string;
  required: boolean;
  min?: number | null;
  max?: number | null;
  options?: string[];
  failure?: {
    requireComment: boolean;
    requirePhoto: boolean;
    createCorrective: boolean;
    createWorkOrder?: boolean;
  };
  showIf?: { step: number; equals: string };
};

const STEP_TYPES = [
  { value: "instruction", label: "Instruction (read only)" },
  { value: "checkbox", label: "Checkbox" },
  { value: "pass_fail", label: "Pass / Fail inspection" },
  { value: "multiple_choice", label: "Multiple choice" },
  { value: "text", label: "Text response" },
  { value: "number", label: "Number response" },
  { value: "meter_reading", label: "Meter reading" },
  { value: "photo", label: "Required picture" },
  { value: "file", label: "File upload" },
  { value: "signature", label: "Signature" },
  { value: "datetime", label: "Date & time" },
];

const NUMERIC_TYPES = new Set(["number", "meter_reading"]);
const FAILABLE_TYPES = new Set(["pass_fail", "number", "meter_reading"]);

function emptyStep(): StepDraft {
  return { type: "checkbox", label: "", required: true };
}

export function ProcedureBuilder({
  template,
}: {
  template?: {
    id: number;
    name: string;
    description: string | null;
    isActive: boolean;
    steps: StepDraft[];
  };
}) {
  const [state, formAction] = useActionState(
    template ? saveTemplateAction : createTemplateAction,
    undefined,
  );
  const [steps, setSteps] = useState<StepDraft[]>(
    template?.steps ?? [emptyStep()],
  );

  function patch(i: number, p: Partial<StepDraft>) {
    setSteps((prev) => prev.map((s, idx) => (idx === i ? { ...s, ...p } : s)));
  }
  function move(i: number, dir: -1 | 1) {
    setSteps((prev) => {
      const next = [...prev];
      const j = i + dir;
      if (j < 0 || j >= next.length) return prev;
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  }
  function remove(i: number) {
    setSteps((prev) => prev.filter((_, idx) => idx !== i));
  }

  return (
    <form action={formAction} className="space-y-4">
      {template ? (
        <input type="hidden" name="templateId" value={template.id} />
      ) : null}
      <input type="hidden" name="stepsJson" value={JSON.stringify(steps)} />
      <Field label="Procedure name" htmlFor="name" required>
        <Input id="name" name="name" defaultValue={template?.name} required />
      </Field>
      <Field label="Description" htmlFor="description">
        <Textarea
          id="description"
          name="description"
          defaultValue={template?.description ?? ""}
        />
      </Field>
      {template ? (
        <Field label="Status" htmlFor="isActive">
          <Select
            id="isActive"
            name="isActive"
            defaultValue={template.isActive ? "true" : "false"}
          >
            <option value="true">Active</option>
            <option value="false">Inactive (hidden from attach list)</option>
          </Select>
        </Field>
      ) : null}

      <div className="space-y-3">
        <h2 className="font-semibold">Steps</h2>
        {steps.map((step, i) => (
          <div key={i} className="rounded-lg border border-gray-200 bg-gray-50 p-3">
            <div className="mb-2 flex items-center justify-between gap-2">
              <span className="text-sm font-semibold text-gray-500">
                Step {i + 1}
              </span>
              <span className="flex gap-1">
                <Button type="button" variant="ghost" onClick={() => move(i, -1)} disabled={i === 0} aria-label={`Move step ${i + 1} up`}>
                  ↑
                </Button>
                <Button type="button" variant="ghost" onClick={() => move(i, 1)} disabled={i === steps.length - 1} aria-label={`Move step ${i + 1} down`}>
                  ↓
                </Button>
                <Button type="button" variant="ghost" onClick={() => remove(i)} disabled={steps.length === 1} aria-label={`Remove step ${i + 1}`}>
                  ✕
                </Button>
              </span>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700" htmlFor={`step-type-${i}`}>
                  Type
                </label>
                <Select
                  id={`step-type-${i}`}
                  value={step.type}
                  onChange={(e) => patch(i, { type: e.target.value })}
                >
                  {STEP_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700" htmlFor={`step-label-${i}`}>
                  Label
                </label>
                <Input
                  id={`step-label-${i}`}
                  value={step.label}
                  onChange={(e) => patch(i, { label: e.target.value })}
                  placeholder="What should the technician do?"
                />
              </div>
            </div>
            <div className="mt-2">
              <Input
                value={step.instructions ?? ""}
                onChange={(e) => patch(i, { instructions: e.target.value })}
                placeholder="Extra instructions (optional)"
              />
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-4">
              {step.type !== "instruction" ? (
                <label className="flex items-center gap-1.5 text-sm">
                  <input
                    type="checkbox"
                    checked={step.required}
                    onChange={(e) => patch(i, { required: e.target.checked })}
                    className="h-4 w-4"
                  />
                  Required
                </label>
              ) : null}
              {NUMERIC_TYPES.has(step.type) ? (
                <span className="flex items-center gap-2 text-sm">
                  Min
                  <Input
                    type="number"
                    className="w-24"
                    value={step.min ?? ""}
                    onChange={(e) =>
                      patch(i, {
                        min: e.target.value === "" ? null : Number(e.target.value),
                      })
                    }
                  />
                  Max
                  <Input
                    type="number"
                    className="w-24"
                    value={step.max ?? ""}
                    onChange={(e) =>
                      patch(i, {
                        max: e.target.value === "" ? null : Number(e.target.value),
                      })
                    }
                  />
                </span>
              ) : null}
            </div>
            {step.type === "multiple_choice" ? (
              <div className="mt-2">
                <Input
                  value={(step.options ?? []).join(", ")}
                  onChange={(e) =>
                    patch(i, {
                      options: e.target.value
                        .split(",")
                        .map((o) => o.trim())
                        .filter(Boolean),
                    })
                  }
                  placeholder="Options, comma-separated (e.g. Good, Worn, Replace)"
                />
              </div>
            ) : null}
            {FAILABLE_TYPES.has(step.type) ? (
              <div className="mt-2 flex flex-wrap gap-4 rounded-md bg-red-50 p-2 text-sm">
                <span className="font-medium text-red-800">On failure:</span>
                <label className="flex items-center gap-1.5">
                  <input
                    type="checkbox"
                    checked={step.failure?.requireComment ?? false}
                    onChange={(e) =>
                      patch(i, {
                        failure: {
                          requireComment: e.target.checked,
                          requirePhoto: step.failure?.requirePhoto ?? false,
                          createCorrective: step.failure?.createCorrective ?? false,
                        },
                      })
                    }
                    className="h-4 w-4"
                  />
                  Require comment
                </label>
                <label className="flex items-center gap-1.5">
                  <input
                    type="checkbox"
                    checked={step.failure?.createCorrective ?? false}
                    onChange={(e) =>
                      patch(i, {
                        failure: {
                          requireComment: step.failure?.requireComment ?? false,
                          requirePhoto: step.failure?.requirePhoto ?? false,
                          createCorrective: e.target.checked,
                          createWorkOrder: step.failure?.createWorkOrder ?? false,
                        },
                      })
                    }
                    className="h-4 w-4"
                  />
                  Create corrective request
                </label>
                <label className="flex items-center gap-1.5">
                  <input
                    type="checkbox"
                    checked={step.failure?.createWorkOrder ?? false}
                    onChange={(e) =>
                      patch(i, {
                        failure: {
                          requireComment: step.failure?.requireComment ?? false,
                          requirePhoto: step.failure?.requirePhoto ?? false,
                          createCorrective: step.failure?.createCorrective ?? false,
                          createWorkOrder: e.target.checked,
                        },
                      })
                    }
                    className="h-4 w-4"
                  />
                  Create corrective work order
                </label>
              </div>
            ) : null}
            {i > 0 ? (
              <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-gray-600">
                <label htmlFor={`step-showif-${i}`}>Only show when</label>
                <Select
                  id={`step-showif-${i}`}
                  className="w-auto"
                  value={step.showIf ? String(step.showIf.step) : ""}
                  onChange={(e) =>
                    patch(i, {
                      showIf: e.target.value
                        ? { step: Number(e.target.value), equals: step.showIf?.equals ?? "fail" }
                        : undefined,
                    })
                  }
                >
                  <option value="">— always shown —</option>
                  {steps.slice(0, i).map((s, idx) => (
                    <option key={idx} value={idx}>
                      step {idx + 1} ({s.label || s.type})
                    </option>
                  ))}
                </Select>
                {step.showIf ? (
                  <>
                    equals
                    <Input
                      className="w-28"
                      value={step.showIf.equals}
                      onChange={(e) =>
                        patch(i, {
                          showIf: { step: step.showIf!.step, equals: e.target.value },
                        })
                      }
                      placeholder="fail"
                    />
                  </>
                ) : null}
              </div>
            ) : null}
          </div>
        ))}
        <Button
          type="button"
          variant="secondary"
          onClick={() => setSteps((prev) => [...prev, emptyStep()])}
        >
          + Add step
        </Button>
      </div>

      <FormError message={state?.error} />
      <SubmitButton>
        {template ? "Save as new version" : "Create procedure"}
      </SubmitButton>
      {template ? (
        <p className="text-xs text-gray-500">
          Saving creates a new version. Work orders that already carry this
          procedure keep the version they were given.
        </p>
      ) : null}
    </form>
  );
}
