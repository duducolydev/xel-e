import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from "react";

interface ChampProps extends InputHTMLAttributes<HTMLInputElement> {
  id: string;
  label: string;
  erreur?: string;
  aide?: string;
}

const classeControle =
  "w-full rounded-lg border bg-white px-3 py-2.5 text-base text-gray-900 shadow-sm outline-none transition " +
  "focus:border-brand focus:ring-2 focus:ring-brand-light";

export function Champ({ id, label, erreur, aide, className, ...props }: ChampProps) {
  const idDescription = erreur ? `${id}-erreur` : aide ? `${id}-aide` : undefined;
  return (
    <div className={className}>
      <label htmlFor={id} className="mb-1 block text-sm font-medium text-gray-800">
        {label}
      </label>
      <input
        id={id}
        name={id}
        aria-invalid={erreur ? true : undefined}
        aria-describedby={idDescription}
        className={`${classeControle} ${erreur ? "border-red-500" : "border-gray-300"}`}
        {...props}
      />
      {erreur ? (
        <p id={`${id}-erreur`} className="mt-1 text-sm text-red-700">
          {erreur}
        </p>
      ) : aide ? (
        <p id={`${id}-aide`} className="mt-1 text-sm text-gray-500">
          {aide}
        </p>
      ) : null}
    </div>
  );
}

interface SelectionProps extends SelectHTMLAttributes<HTMLSelectElement> {
  id: string;
  label: string;
  erreur?: string;
  children: ReactNode;
}

export function Selection({ id, label, erreur, className, children, ...props }: SelectionProps) {
  return (
    <div className={className}>
      <label htmlFor={id} className="mb-1 block text-sm font-medium text-gray-800">
        {label}
      </label>
      <select
        id={id}
        name={id}
        aria-invalid={erreur ? true : undefined}
        aria-describedby={erreur ? `${id}-erreur` : undefined}
        className={`${classeControle} ${erreur ? "border-red-500" : "border-gray-300"}`}
        {...props}
      >
        {children}
      </select>
      {erreur ? (
        <p id={`${id}-erreur`} className="mt-1 text-sm text-red-700">
          {erreur}
        </p>
      ) : null}
    </div>
  );
}

export function Bouton({
  enCours,
  children,
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { enCours?: boolean }) {
  return (
    <button
      className={
        "inline-flex w-full items-center justify-center rounded-lg bg-brand-dark px-4 py-3 text-base font-semibold " +
        "text-white shadow-sm transition hover:bg-brand focus-visible:outline-2 focus-visible:outline-offset-2 " +
        `focus-visible:outline-brand disabled:cursor-not-allowed disabled:opacity-60 ${className ?? ""}`
      }
      disabled={enCours || props.disabled}
      {...props}
    >
      {enCours ? "Un instant…" : children}
    </button>
  );
}

export function Alerte({ ton, children }: { ton: "erreur" | "succes" | "info"; children: ReactNode }) {
  const styles = {
    erreur: "border-red-200 bg-red-50 text-red-800",
    succes: "border-green-200 bg-green-50 text-green-800",
    info: "border-brand-light bg-brand-wash text-brand-dark",
  }[ton];
  return (
    <div role={ton === "erreur" ? "alert" : "status"} className={`rounded-lg border px-4 py-3 text-sm ${styles}`}>
      {children}
    </div>
  );
}
