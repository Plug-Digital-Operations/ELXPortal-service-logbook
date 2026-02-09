import type { ComponentInput } from "@ixon-cdk/types";

export interface ServiceLogbookCategory {
  id: number;
  name: string;
  translate?: boolean;
  color?: string;
}

export interface Note {
  _id: string;
  /** @deprecated Use author_id instead */
  user?: string;
  subject: string | null;
  text: string;
  /** unix epoch in milliseconds */
  created_on: number;
  category: number | null;
  note_category: string | null;

  /** User.publicId */
  author_id: string | null;
  /** User.name */
  author_name: string | null;
  /** User.publicId */
  editor_id: string | null;
  /** User.name */
  editor_name: string | null;
  /** unix epoch in milliseconds */
  updated_on: number | null;

  /** Date field for moment of action */
  performed_on: number | null;

  /** Calibration & Settings update */
  tag_numbers: string[] | null;

  /** Software update */
  version: string | null;
  software_type: string | null;
  external_note: boolean | null;

  /** Stack replacements */
  stack_replacements?: string | null;
  workorder_id: string | null;

  /** Stack Inspection */
  stack_inspections?: string | null;
  stack_installs?: string | null;

  /** Stack Tensioning */
  stack_tensioning?: string | null;
}

export interface NoteWithHtml extends Note {
  html: string;
}

// ── New types for the category registry system ──────────────────────────

/**
 * Configuration for a single note category.
 * Adding a new category = adding one of these objects to the registry.
 */
export interface CategoryConfig {
  /** Internal key stored in note_category (e.g. "Stack inspection") */
  value: string;
  /** Display label shown to the user (e.g. "Stack visual inspection") */
  label: string;
  /** If true, only visible to PlugPower (internal) users */
  internalOnly: boolean;
  /**
   * Return category-specific ComponentInputs for the form dialog.
   * `getStackCount` and `getLatestSerials` are injected so inputs can be dynamic.
   */
  getFormInputs: (helpers: CategoryFormHelpers) => ComponentInput[];
  /**
   * After a form is submitted, extract the category-specific data
   * from the raw form value into a partial Note object.
   */
  serializeFormValue: (
    value: Record<string, any>,
    helpers: CategoryFormHelpers,
  ) => Partial<Note>;
  /**
   * Validate the category-specific data. Return an error message or null.
   */
  validate?: (
    value: Record<string, any>,
    helpers: CategoryFormHelpers,
  ) => string | null;
  /**
   * Build the initial form value when editing an existing note.
   */
  getEditInitialValue?: (
    note: Note,
    helpers: CategoryFormHelpers,
  ) => Record<string, any>;
  /**
   * Build the HTML for the category-specific fields in the content dialog.
   */
  renderHtml?: (note: Note) => string;
  /**
   * Build read-only ComponentInputs to display current values during recategorize.
   */
  getReadOnlyInputs?: (note: Note) => ComponentInput[];
}

export interface CategoryFormHelpers {
  getStackCount: () => number;
  getLatestSerials: () => Map<string, string>;
  isEdit: boolean;
}
