import styles from "./text-field.module.css";

type TextFieldProps = {
  id: string;
  label: string;
  hint: string;
  error?: string | null;
  value: string;
  onChange: (value: string) => void;
  name?: string;
};

export function TextField({ id, label, hint, error, value, onChange, name }: TextFieldProps) {
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const describedBy = error ? `${hintId} ${errorId}` : hintId;

  return (
    <div className={styles.field}>
      <label htmlFor={id} className={styles.label}>
        {label}
      </label>
      <input
        id={id}
        name={name ?? id}
        className={styles.input}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        autoComplete="off"
        spellCheck={false}
      />
      <p id={hintId} className={styles.hint}>
        {hint}
      </p>
      {error ? (
        <p id={errorId} className={styles.error} role="alert">
          <ErrorIcon />
          {error}
        </p>
      ) : null}
    </div>
  );
}

function ErrorIcon() {
  return (
    <svg className={styles.icon} viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="2" />
      <path d="M12 7v6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <circle cx="12" cy="16.5" r="1" fill="currentColor" />
    </svg>
  );
}
