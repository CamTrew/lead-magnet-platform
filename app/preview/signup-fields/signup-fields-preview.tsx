'use client';

import { useState, type FormEvent } from 'react';
import { ArrowRight, Check, Globe, List, Mail, Pencil, Plus, Trash2, Type, UserRound } from 'lucide-react';
import { MagnetsLogo } from '@/components/magnets-logo-mark';
import { StyledSelect } from '@/components/ui/styled-select';
import styles from './signup-fields.module.css';

const formats = [
  { value: 'text', label: 'Short answer' },
  { value: 'url', label: 'Website' },
  { value: 'choice', label: 'Dropdown' },
] as const;
type Format = typeof formats[number]['value'];
type Field = { id: string; label: string; format: Format; required: boolean; choices: string[] };
const example: Field = { id: 'website', label: 'Business website', format: 'url', required: false, choices: [] };

function editorDefault(): Field {
  return { id: crypto.randomUUID(), label: '', format: 'text', required: false, choices: [] };
}

export function SignupFieldsPreview() {
  const [fields, setFields] = useState<Field[]>([example]);
  const [draft, setDraft] = useState<Field | null>(null);
  const [error, setError] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const editing = fields.some(field => field.id === draft?.id);

  function open(field: Field) {
    setError('');
    setDraft(field);
  }

  function save(event: FormEvent) {
    event.preventDefault();
    if (!draft) return;
    const label = draft.label.trim();
    const choices = Array.from(new Set(draft.choices.map(value => value.trim()).filter(Boolean)));
    if (!label) return setError('Enter a field name.');
    if (['Name', 'Email', ...fields.filter(field => field.id !== draft.id).map(field => field.label)].some(name => name.toLowerCase() === label.toLowerCase())) return setError('Choose a different field name.');
    if (draft.format === 'choice' && choices.length < 2) return setError('Add at least two different options.');
    const next = { ...draft, label, choices: draft.format === 'choice' ? choices : [] };
    setFields(editing ? fields.map(field => field.id === next.id ? next : field) : [...fields, next]);
    setSubmitted(false);
    setDraft(null);
  }

  return <div className={styles.shell}>
    <header className={styles.nav}><MagnetsLogo className="h-7 w-28" variant="dark" /><a href="/">View landing page <ArrowRight size={15} /></a></header>
    <main className={styles.main}>
      <h1>Signup form</h1><p className={styles.intro}>Choose what people share to get your lead magnet.</p>
      <div className={styles.grid}>
        <section className={styles.panel} aria-labelledby="fields-title">
          <h2 id="fields-title">Form fields</h2>
          <div className={styles.list}>
            {[{ label: 'Name', Icon: UserRound }, { label: 'Email', Icon: Mail }].map(({ label, Icon }) =>
              <div key={label} className={styles.row}><Icon size={18} /><strong>{label}</strong><small>Required</small></div>)}
            {fields.map(field => {
              const Icon = field.format === 'url' ? Globe : field.format === 'choice' ? List : Type;
              return <button key={field.id} className={styles.row} onClick={() => open(field)} aria-label={'Edit ' + field.label}>
                <Icon size={18} /><strong>{field.label}</strong><small>{field.required ? 'Required' : 'Optional'}</small><Pencil size={15} />
              </button>;
            })}
          </div>
          {draft ? <form className={styles.editor} onSubmit={save} key={draft.id}>
            <label>Field name<input autoFocus required maxLength={100} placeholder="e.g. Job title" value={draft.label} onChange={e => setDraft({ ...draft, label: e.target.value })} /></label>
            <div><span className={styles.label}>Answer type</span><StyledSelect ariaLabel="Answer type" value={draft.format} options={[...formats]} onChange={value => setDraft({ ...draft, format: value as Format })} /></div>
            {draft.format === 'choice' && <label>Options, one per line<textarea rows={3} value={draft.choices.join('\n')} onChange={e => setDraft({ ...draft, choices: e.target.value.split('\n') })} /></label>}
            <label className={styles.check}><input type="checkbox" checked={draft.required} onChange={e => setDraft({ ...draft, required: e.target.checked })} /> Require an answer</label>
            {error && <p role="alert">{error}</p>}
            <div className={styles.actions}><button className={styles.dark} type="submit">{editing ? 'Save changes' : 'Add field'}</button><button type="button" onClick={() => setDraft(null)}>Cancel</button>
              {editing && <button type="button" className={styles.remove} aria-label="Remove field" onClick={() => { setFields(fields.filter(field => field.id !== draft.id)); setDraft(null); setSubmitted(false); }}><Trash2 size={17} /></button>}
            </div>
          </form> : <button className={styles.add} onClick={() => open(editorDefault())}><Plus size={17} /> Add field</button>}
        </section>
        <section className={styles.stage} aria-label="Visitor preview"><div className={styles.stageTitle}>Visitor preview</div>
          <div className={styles.card}>
            {submitted ? <><Check size={26} /><h2>Test signup complete</h2><p>This preview sends no email.</p><button className={styles.add} onClick={() => setSubmitted(false)}>Try again</button></> :
            <form onSubmit={e => { e.preventDefault(); setSubmitted(true); }}>
              <h2>Get the pricing checklist</h2><p>Pick a price for your next freelance project.</p>
              <label>Name<input required autoComplete="name" name="name" /></label>
              <label>Email<input type="email" required autoComplete="email" name="email" /></label>
              {fields.map(field => <label key={field.id}><span>{field.label}{!field.required && <small> (optional)</small>}</span>
                {field.format === 'choice' ? <select key={field.choices.join('\n')} required={field.required} defaultValue=""><option value="">Choose an option</option>{field.choices.map(choice => <option key={choice}>{choice}</option>)}</select>
                : <input key={field.format} type={field.format} required={field.required} placeholder={field.format === 'url' ? 'https://example.com' : undefined} />}
              </label>)}
              <button className={styles.submit}>Get the checklist <ArrowRight size={17} /></button>
            </form>}
          </div>
        </section>
      </div>
    </main>
  </div>;
}
