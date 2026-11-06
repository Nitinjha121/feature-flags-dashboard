import { useState } from 'react';
import type { FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createFlagSchema, ENVIRONMENTS } from '@ff/shared';
import type { Environment, FeatureFlag } from '@ff/shared';
import { ApiError, createFlag } from '../api';

interface FormValues {
  key: string;
  description: string;
  environment: Environment;
  enabled: boolean;
}

const INITIAL_VALUES: FormValues = {
  key: '',
  description: '',
  environment: 'dev',
  enabled: false,
};

type FieldErrors = Partial<Record<keyof FormValues, string>>;

const LABEL = 'flex flex-col gap-1.5 text-xs font-medium text-muted';
const CONTROL =
  'h-9 rounded-md border border-border bg-input px-3 text-[13px] font-normal text-text transition-colors placeholder:text-subtle focus:border-accent focus:bg-surface focus:outline-none';
const FIELD_ERROR = '-mt-2 mb-0 text-[11px] text-danger';

interface CreateFlagFormProps {
  actor: string;
  onCreated: (flag: FeatureFlag) => void;
  onCancel: () => void;
}

export function CreateFlagForm({ actor, onCreated, onCancel }: CreateFlagFormProps) {
  const queryClient = useQueryClient();
  const [values, setValues] = useState<FormValues>(INITIAL_VALUES);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | undefined>(undefined);

  const mutation = useMutation({
    mutationFn: (input: FormValues) => createFlag(input, actor),
    onSuccess: (flag) => {
      setValues(INITIAL_VALUES);
      setFieldErrors({});
      setFormError(undefined);
      void queryClient.invalidateQueries({ queryKey: ['flags'] });
      void queryClient.invalidateQueries({ queryKey: ['audit-logs'] });
      onCreated(flag);
    },
    onError: (error) => {
      if (error instanceof ApiError) {
        if (error.details && error.details.length > 0) {
          const nextErrors: FieldErrors = {};
          for (const detail of error.details) {
            if (
              detail.path === 'key' ||
              detail.path === 'description' ||
              detail.path === 'environment'
            ) {
              nextErrors[detail.path] = detail.message;
            }
          }
          setFieldErrors(nextErrors);
          setFormError(Object.keys(nextErrors).length > 0 ? undefined : error.message);
        } else if (error.code === 'FLAG_ALREADY_EXISTS') {
          setFieldErrors({ key: error.message });
        } else {
          setFieldErrors({});
          setFormError(error.message);
        }
      } else {
        setFieldErrors({});
        setFormError('Something went wrong. Please try again.');
      }
    },
  });

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(undefined);

    const result = createFlagSchema.safeParse(values);
    if (!result.success) {
      const nextErrors: FieldErrors = {};
      for (const issue of result.error.issues) {
        const field = issue.path[0];
        if (
          field === 'key' ||
          field === 'description' ||
          field === 'environment' ||
          field === 'enabled'
        ) {
          nextErrors[field] = issue.message;
        }
      }
      setFieldErrors(nextErrors);
      return;
    }

    setFieldErrors({});
    mutation.mutate(result.data);
  }

  return (
    <form className="flex flex-col" onSubmit={handleSubmit}>
      <div className="border-b border-border-subtle bg-surface-muted/40 px-5 py-4">
        <h2 id="create-flag-title" className="m-0 text-sm font-semibold">
          Create flag
        </h2>
        <p className="mt-1 mb-0 text-xs text-muted">Unique per key and environment.</p>
      </div>
      <div className="flex flex-col gap-3.5 px-5 py-4">
        {formError ? (
          <p
            role="alert"
            className="m-0 rounded-md border border-action-disabled-border bg-action-disabled-bg px-3 py-2 text-xs text-action-disabled"
          >
            {formError}
          </p>
        ) : null}
        <label className={LABEL}>
          Key
          <input
            type="text"
            autoFocus
            className={`${CONTROL} font-mono`}
            data-testid="create-key"
            placeholder="new-checkout-flow"
            value={values.key}
            onChange={(event) => setValues((prev) => ({ ...prev, key: event.target.value }))}
          />
        </label>
        {fieldErrors.key ? (
          <p role="alert" data-testid="create-key-error" className={FIELD_ERROR}>
            {fieldErrors.key}
          </p>
        ) : null}
        <label className={LABEL}>
          Description
          <input
            type="text"
            className={CONTROL}
            data-testid="create-description"
            value={values.description}
            onChange={(event) =>
              setValues((prev) => ({ ...prev, description: event.target.value }))
            }
          />
        </label>
        {fieldErrors.description ? (
          <p role="alert" className={FIELD_ERROR}>
            {fieldErrors.description}
          </p>
        ) : null}
        <label className={LABEL}>
          Environment
          <select
            className={CONTROL}
            data-testid="create-environment"
            value={values.environment}
            onChange={(event) =>
              setValues((prev) => ({ ...prev, environment: event.target.value as Environment }))
            }
          >
            {ENVIRONMENTS.map((environment) => (
              <option className="bg-surface text-text" key={environment} value={environment}>
                {environment}
              </option>
            ))}
          </select>
        </label>
        {fieldErrors.environment ? (
          <p role="alert" className={FIELD_ERROR}>
            {fieldErrors.environment}
          </p>
        ) : null}
        <label className="flex items-center gap-2 text-xs font-medium text-text">
          <input
            type="checkbox"
            className="size-4 accent-accent"
            data-testid="create-enabled"
            checked={values.enabled}
            onChange={(event) => setValues((prev) => ({ ...prev, enabled: event.target.checked }))}
          />
          Enabled on create
        </label>
      </div>
      <div className="flex justify-end gap-2 border-t border-border-subtle bg-surface-muted/40 px-5 py-3">
        <button
          type="button"
          className="h-8 cursor-pointer rounded-md border border-border bg-surface px-3.5 text-xs font-medium text-text transition-colors hover:bg-surface-muted"
          onClick={onCancel}
        >
          Cancel
        </button>
        <button
          type="submit"
          className="h-8 cursor-pointer rounded-md bg-accent px-3.5 text-xs font-medium text-accent-fg shadow-card transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-60"
          data-testid="create-submit"
          disabled={mutation.isPending}
        >
          Create flag
        </button>
      </div>
    </form>
  );
}
