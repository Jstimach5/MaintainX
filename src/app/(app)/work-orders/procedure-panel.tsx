"use client";

import { useActionState } from "react";
import { attachProcedureAction, respondStepAction } from "@/app/(app)/procedures/actions";
import { Badge, Field, Input, Select, Textarea } from "@/components/ui";
import { FormError, SubmitButton } from "@/components/forms";

export type StepView = {
  index: number;
  type: string;
  label: string;
  instructions?: string;
  expectedResult?: string;
  required: boolean;
  min?: number | null;
  max?: number | null;
  options?: string[];
  visible: boolean;
  answered: boolean;
  isFailure: boolean;
  valueDisplay: string | null;
  comment: string | null;
  respondedByName?: string;
};

export function AttachProcedureForm({
  workOrderId,
  templates,
}: {
  workOrderId: number;
  templates: { id: number; name: string; version: number }[];
}) {
  const [state, formAction] = useActionState(attachProcedureAction, undefined);
  if (templates.length === 0) return null;
  return (
    <form action={formAction} className="flex flex-wrap items-end gap-2">
      <input type="hidden" name="workOrderId" value={workOrderId} />
      <Field label="Attach procedure" htmlFor="templateId">
        <Select id="templateId" name="templateId" defaultValue="">
          <option value="" disabled>
            Choose…
          </option>
          {templates.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name} (v{t.version})
            </option>
          ))}
        </Select>
      </Field>
      <SubmitButton variant="secondary">Attach</SubmitButton>
      <FormError message={state?.error} />
    </form>
  );
}

function StepInput({ step }: { step: StepView }) {
  switch (step.type) {
    case "checkbox":
      return (
        <label className="flex items-center gap-2 text-sm">
          <input type="hidden" name="kind" value="checkbox" />
          <input type="checkbox" name="value" value="true" defaultChecked={step.valueDisplay === "true"} className="h-5 w-5" />
          Done
        </label>
      );
    case "pass_fail":
      return (
        <span className="flex items-center gap-3 text-sm">
          <input type="hidden" name="kind" value="pass_fail" />
          <label className="flex items-center gap-1.5">
            <input type="radio" name="value" value="pass" defaultChecked={step.valueDisplay === "pass"} className="h-4 w-4" />
            Pass
          </label>
          <label className="flex items-center gap-1.5">
            <input type="radio" name="value" value="fail" defaultChecked={step.valueDisplay === "fail"} className="h-4 w-4" />
            Fail
          </label>
        </span>
      );
    case "multiple_choice":
      return (
        <>
          <input type="hidden" name="kind" value="multiple_choice" />
          <Select name="value" defaultValue={step.valueDisplay ?? ""}>
            <option value="" disabled>
              Choose…
            </option>
            {(step.options ?? []).map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </Select>
        </>
      );
    case "number":
    case "meter_reading":
      return (
        <>
          <input type="hidden" name="kind" value={step.type} />
          <Input
            name="value"
            type="number"
            step="any"
            defaultValue={step.valueDisplay ?? ""}
            placeholder={
              step.min != null || step.max != null
                ? `Expected ${step.min ?? "…"}–${step.max ?? "…"}`
                : undefined
            }
          />
        </>
      );
    case "text":
      return (
        <>
          <input type="hidden" name="kind" value="text" />
          <Textarea name="value" defaultValue={step.valueDisplay ?? ""} />
        </>
      );
    case "signature":
      return (
        <>
          <input type="hidden" name="kind" value="signature" />
          <Input
            name="value"
            defaultValue={step.valueDisplay ?? ""}
            placeholder="Type your full name to sign"
          />
        </>
      );
    case "datetime":
      return (
        <>
          <input type="hidden" name="kind" value="datetime" />
          <Input name="value" type="datetime-local" defaultValue={step.valueDisplay ?? ""} />
        </>
      );
    case "photo":
    case "file":
      return (
        <>
          <input type="hidden" name="kind" value={step.type} />
          <input type="hidden" name="value" value="provided" />
          <p className="text-xs text-gray-500">
            Upload the {step.type === "photo" ? "picture" : "file"} in
            Pictures &amp; files above, then confirm here.
          </p>
        </>
      );
    default:
      return null;
  }
}

export function ProcedureInstancePanel({
  workOrderId,
  instanceId,
  name,
  version,
  steps,
  canAct,
}: {
  workOrderId: number;
  instanceId: number;
  name: string;
  version: number | null;
  steps: StepView[];
  canAct: boolean;
}) {
  const [state, formAction] = useActionState(respondStepAction, undefined);
  const answered = steps.filter((s) => s.type !== "instruction" && s.answered).length;
  const answerable = steps.filter((s) => s.type !== "instruction" && s.visible).length;

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <h3 className="font-semibold">
          {name}
          {version ? <span className="text-gray-500"> v{version}</span> : null}
        </h3>
        <Badge tone={answered >= answerable ? "green" : "amber"}>
          {answered}/{answerable} done
        </Badge>
      </div>
      <FormError message={state?.error} />
      <ol className="space-y-3">
        {steps.map((step) => {
          if (!step.visible) return null;
          return (
            <li
              key={step.index}
              className={`rounded-md border p-3 ${
                step.isFailure
                  ? "border-red-300 bg-red-50"
                  : step.answered
                    ? "border-green-200 bg-green-50"
                    : "border-gray-200"
              }`}
            >
              <p className="text-sm font-medium">
                {step.label}
                {step.required ? <span className="text-red-600"> *</span> : null}
                {step.isFailure ? (
                  <span className="ml-2 text-xs font-bold text-red-700">FAILED</span>
                ) : null}
              </p>
              {step.instructions ? (
                <p className="mt-0.5 text-xs text-gray-500">{step.instructions}</p>
              ) : null}
              {step.type === "instruction" ? null : step.answered && !canAct ? (
                <p className="mt-1 text-sm text-gray-600">
                  {step.valueDisplay}
                  {step.comment ? ` — ${step.comment}` : ""}
                </p>
              ) : canAct ? (
                <form action={formAction} className="mt-2 space-y-2">
                  <input type="hidden" name="workOrderId" value={workOrderId} />
                  <input type="hidden" name="instanceId" value={instanceId} />
                  <input type="hidden" name="stepIndex" value={step.index} />
                  <StepInput step={step} />
                  <Input
                    name="comment"
                    defaultValue={step.comment ?? ""}
                    placeholder="Comment (required on failures)"
                  />
                  <SubmitButton variant="secondary" pendingText="Saving…">
                    {step.answered ? "Update answer" : "Save answer"}
                  </SubmitButton>
                  {step.answered && step.respondedByName ? (
                    <p className="text-xs text-gray-500">
                      Answered by {step.respondedByName}
                    </p>
                  ) : null}
                </form>
              ) : null}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
