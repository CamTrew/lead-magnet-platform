'use client';

import { useRef, useState, type FormEvent } from 'react';
import { Globe, List, Pencil, Plus, Trash2, Type, X } from 'lucide-react';
import { MAX_DROPDOWN_OPTIONS, signupFieldsSchema, type SignupField as Field } from '@/lib/signup-fields';
import { StyledSelect } from '@/components/ui/styled-select';
import styles from './signup-field-editor.module.css';

const formats = [
  { value: 'text', label: 'Short answer' },
  { value: 'url', label: 'Website' },
  { value: 'choice', label: 'Dropdown' },
] as const;

function editorDefault(): Field {
  return { id: 'field-' + crypto.randomUUID(), label: '', format: 'text', required: false, choices: [] };
}

export function SignupFieldEditor({fields, onChange}: {fields: Field[]; onChange: (next: Field[]) => void}) {
  const [draft, setDraft] = useState<Field | null>(null);
  const [error, setError] = useState('');
  const focusOption = useRef<number | null>(null);
  const editing = fields.some(field => field.id === draft?.id);

  function open(field: Field) {
    setError('');
    setDraft(field);
  }

  function save(event: FormEvent) {
    event.preventDefault();
    if (!draft) return;
    const next = { ...draft, choices: draft.format === 'choice' ? draft.choices.filter(choice => choice.trim()) : [] };
    const result = signupFieldsSchema.safeParse(editing ? fields.map(field => field.id === next.id ? next : field) : [...fields, next]);
    if (!result.success) return setError(result.error.issues[0].message);
    onChange(result.data);
    setDraft(null);
  }

  return <div className={styles.controls}>
            {fields.map(field => {
              const Icon = field.format === 'url' ? Globe : field.format === 'choice' ? List : Type;
              return <button key={field.id} type="button" className={styles.row} onClick={() => open(field)} aria-label={'Edit ' + field.label}>
                <Icon size={18} /><strong>{field.label}</strong><small>{field.required ? 'Required' : 'Optional'}</small><Pencil size={15} />
              </button>;
            })}
          {draft ? <form className={styles.editor} onSubmit={save} key={draft.id}>
            <label>Field name<input autoFocus required maxLength={100} placeholder="e.g. Job title" value={draft.label} onChange={e => setDraft({ ...draft, label: e.target.value })} /></label>
            <div><span className={styles.label}>Answer type</span><StyledSelect ariaLabel="Answer type" value={draft.format} options={[...formats]} onChange={value => setDraft({
              ...draft,
              format: value as Field['format'],
              choices: value === 'choice' && draft.choices.length === 0 ? ['', ''] : draft.choices,
            })} /></div>
            {draft.format === 'choice' && (
              <fieldset className={styles.options}>
                <legend className={styles.label}>Options</legend>
                {draft.choices.map((choice, index) => (
                  <div key={index} className={styles.option}>
                    <input
                      aria-label={`Option ${index + 1}`}
                      placeholder={`Option ${index + 1}`}
                      maxLength={100}
                      value={choice}
                      ref={input => {
                        if (input && focusOption.current === index) {
                          focusOption.current = null;
                          input.focus();
                        }
                      }}
                      onChange={event => {
                        const choices = [...draft.choices];
                        choices[index] = event.target.value;
                        setDraft({ ...draft, choices });
                      }}
                    />
                    {draft.choices.length > 2 && (
                      <button
                        type="button"
                        aria-label={`Remove option ${index + 1}`}
                        onClick={() => setDraft({ ...draft, choices: draft.choices.filter((_, i) => i !== index) })}
                      ><X size={16} /></button>
                    )}
                  </div>
                ))}
                <button
                  className={styles.add}
                  type="button"
                  disabled={draft.choices.length >= MAX_DROPDOWN_OPTIONS}
                  onClick={() => {
                    focusOption.current = draft.choices.length;
                    setDraft({ ...draft, choices: [...draft.choices, ''] });
                  }}
                ><Plus size={16} /> Add option</button>
              </fieldset>
            )}
            <label className={styles.check}><input type="checkbox" checked={draft.required} onChange={e => setDraft({ ...draft, required: e.target.checked })} /> Require an answer</label>
            {error && <p role="alert">{error}</p>}
            <div className={styles.actions}><button className={styles.dark} type="submit">{editing ? 'Save changes' : 'Add field'}</button><button type="button" onClick={() => setDraft(null)}>Cancel</button>
              {editing && <button type="button" className={styles.remove} aria-label="Remove field" onClick={() => { onChange(fields.filter(field => field.id !== draft.id)); setDraft(null); }}><Trash2 size={17} /></button>}
            </div>
          </form> : <button type="button" className={styles.add} onClick={() => open(editorDefault())}><Plus size={17} /> Add field</button>}
  </div>;
}
