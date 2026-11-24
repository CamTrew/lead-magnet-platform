'use client';

import { useId, useRef, useState, type FormEvent } from 'react';
import { ChevronDown, GripVertical, Pencil, Plus, Trash2, X } from 'lucide-react';
import { MAX_DROPDOWN_OPTIONS, fieldsFromSignupRows, signupFieldsSchema, signupFormRows, type SignupFormRow, type SignupField as Field } from '@/lib/signup-fields';
import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors } from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
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

function rowId(row: SignupFormRow) {
  return typeof row === 'string' ? ':' + row : row.id;
}

function rowLabel(row: SignupFormRow) {
  if (typeof row !== 'string') return row.label;
  return row === 'name' ? 'Name' : 'Email';
}

function FormRow({ row, onEdit }: { row: SignupFormRow; onEdit: (field: Field) => void }) {
  const fixed = typeof row === 'string';
  const sort = useSortable({ id: rowId(row), disabled: { draggable: fixed, droppable: false } });
  const style = { transform: CSS.Transform.toString(sort.transform), transition: sort.transition };
  const label = rowLabel(row);
  return (
    <div ref={sort.setNodeRef} style={style} data-dragging={sort.isDragging || undefined}
      className={`magnet-form-input flex min-h-14 items-center rounded-xl border-2 border-gray-200 bg-white/80 text-[15px] text-gray-500 shadow-sm ${styles.field}`}>
      {fixed ? <span className="px-5">{label}</span> : <>
        <button type="button" className={styles.grip} ref={sort.setActivatorNodeRef}
          {...sort.attributes} {...sort.listeners} aria-label={`Move ${label}`} title={`Drag to move ${label}`}>
          <GripVertical size={17} />
        </button>
        <button type="button" className={styles.editField} aria-label={`Edit ${label}`} onClick={() => onEdit(row)}>
          <span>{label}{row.required ? '' : ' (optional)'}</span>
          {row.format === 'choice' && <ChevronDown size={16} aria-hidden />}
          <Pencil size={15} className={styles.pencil} aria-hidden />
        </button>
      </>}
    </div>
  );
}

export function SignupFieldEditor({fields, onChange}: {fields: Field[]; onChange: (next: Field[]) => void}) {
  const [draft, setDraft] = useState<Field | null>(null);
  const [placement, setPlacement] = useState<string | null>(null);
  const [error, setError] = useState('');
  const focusOption = useRef<number | null>(null);
  const contextId = useId();
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const rows = signupFormRows(fields);
  const ids = rows.map(rowId);
  const editing = fields.some(field => field.id === draft?.id);

  const otherRows = rows.filter(row => rowId(row) !== draft?.id);
  const currentIndex = draft ? ids.indexOf(draft.id) : -1;
  const originalIndex = currentIndex < 0 ? otherRows.length : currentIndex;
  const positionOptions = [
    { value: ':first', label: 'First on the form' },
    ...otherRows.map(row => ({ value: rowId(row), label: 'After ' + rowLabel(row) })),
  ];
  const selectedPosition = placement && positionOptions.some(option => option.value === placement)
    ? placement : positionOptions[originalIndex].value;

  function open(field: Field) {
    setPlacement(null);
    setError('');
    setDraft(field);
  }

  function save(event: FormEvent) {
    event.preventDefault();
    if (!draft) return;
    const next = { ...draft, choices: draft.format === 'choice' ? draft.choices.filter(choice => choice.trim()) : [] };
    const reordered = [...otherRows];
    const insertAt = positionOptions.findIndex(option => option.value === selectedPosition);
    reordered.splice(insertAt, 0, next);
    const result = signupFieldsSchema.safeParse(fieldsFromSignupRows(reordered));
    if (!result.success) return setError(result.error.issues[0].message);
    onChange(result.data);
    setDraft(null);
  }

  return <div className={styles.controls}>
    <DndContext id={contextId} sensors={sensors} collisionDetection={closestCenter}
      onDragEnd={({ active, over }) => {
        if (!over || active.id === over.id) return;
        const from = ids.indexOf(String(active.id));
        const to = ids.indexOf(String(over.id));
        if (from >= 0 && to >= 0) {
          setPlacement(null);
          onChange(fieldsFromSignupRows(arrayMove(rows, from, to)));
        }
      }}>
      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        {rows.map(row => <FormRow key={rowId(row)} row={row} onEdit={open} />)}
      </SortableContext>
    </DndContext>
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
            <div>
              <span className={styles.label}>Position</span>
              <StyledSelect ariaLabel="Position" value={selectedPosition} options={positionOptions} onChange={setPlacement} />
            </div>
            <label className={styles.check}><input type="checkbox" checked={draft.required} onChange={e => setDraft({ ...draft, required: e.target.checked })} /> Require an answer</label>
            {error && <p role="alert">{error}</p>}
            <div className={styles.actions}><button className={styles.dark} type="submit">{editing ? 'Save changes' : 'Add field'}</button><button type="button" onClick={() => setDraft(null)}>Cancel</button>
              {editing && <button type="button" className={styles.remove} aria-label="Remove field" onClick={() => { onChange(fields.filter(field => field.id !== draft.id)); setDraft(null); }}><Trash2 size={17} /></button>}
            </div>
          </form> : <button type="button" className={styles.add} onClick={() => open(editorDefault())}><Plus size={17} /> Add field</button>}
  </div>;
}
