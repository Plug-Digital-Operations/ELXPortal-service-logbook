/**
 * Form Handlers
 *
 * Extracts the complex add/edit/recategorize dialog flows from the
 * main Svelte component. Each handler uses the category registry to
 * build inputs and serialize results, eliminating the massive switch
 * statements that were duplicated 3x.
 */

import type { ComponentContext, ComponentInput } from "@ixon-cdk/types";
import type { Note, CategoryFormHelpers } from "./types";
import {
  CATEGORY_CONFIGS,
  getCategoryConfig,
  getCategoryDisplayLabel,
  getCategoryOptions,
} from "./category-registry";
import { DateTime } from "luxon";
import type { NotesService } from "./notes.service";

// ── Shared: build the common inputs (performed_on, text, external_note) ─

function buildCommonInputs(
  category: string,
  isPlugPowerUser: boolean,
): ComponentInput[] {
  const inputs: ComponentInput[] = [];

  // Text (description) - always present
  inputs.push({
    key: "text",
    type: "RichText" as const,
    label: "Description of event",
    placeholder: "Description of event",
    required: false,
    translate: false,
    description:
      category === "Stack replacements" ? "---\n**Required**" : "**Required**",
  });

  // External note checkbox - only for PlugPower users
  if (isPlugPowerUser) {
    inputs.push({
      key: "external_note",
      type: "Checkbox" as const,
      label: "External Note",
      defaultValue: false,
      description:
        "Mark this note as external if it can be viewed by parties outside the company (e.g., external partners or customers)",
    });
  }

  return inputs;
}

function buildFullInputs(
  category: string,
  helpers: CategoryFormHelpers,
  isPlugPowerUser: boolean,
): ComponentInput[] {
  const inputs: ComponentInput[] = [];

  // Performed on - always first
  inputs.push({
    key: "performed_on",
    type: "DateTime",
    label: "Performed on",
    required: true,
  });

  // Category-specific fields
  const config = getCategoryConfig(category);
  if (config) {
    inputs.push(...config.getFormInputs(helpers));
  }

  // Common fields (text, external_note)
  inputs.push(...buildCommonInputs(category, isPlugPowerUser));

  return inputs;
}

// ═══════════════════════════════════════════════════════════════════════
// ADD NOTE
// ═══════════════════════════════════════════════════════════════════════

export async function handleAddNote(
  context: ComponentContext,
  notesService: NotesService,
  helpers: CategoryFormHelpers,
  isPlugPowerUser: boolean,
  translations: Record<string, string>,
): Promise<void> {
  const categoryOptions = getCategoryOptions(isPlugPowerUser);

  let step: "category" | "note" | "exit" = "category";
  let category: string | null = null;

  while (step !== "exit") {
    if (step === "category") {
      const categoryResult = await context.openFormDialog({
        title: "Select a category",
        inputs: [
          {
            key: "category",
            type: "Selection",
            label: "Category",
            required: true,
            options: categoryOptions,
          },
        ],
        submitButtonText: "Next",
        cancelButtonText: "Cancel",
      });

      if (categoryResult?.value) {
        category = categoryResult.value.category;
        step = "note";
      } else {
        step = "exit";
      }
    } else if (step === "note") {
      if (!category) {
        step = "category";
        continue;
      }

      const categoryLabel = getCategoryDisplayLabel(category);
      const noteResult = await context.openFormDialog({
        title: `${translations.ADD} ${categoryLabel}`,
        inputs: buildFullInputs(category, helpers, isPlugPowerUser),
        submitButtonText: translations.ADD,
        cancelButtonText: "Previous",
        discardChangesPrompt: true,
      });

      if (noteResult?.value) {
        const { value } = noteResult;
        const config = getCategoryConfig(category);

        // Validate category-specific data
        if (config?.validate) {
          const error = config.validate(value, helpers);
          if (error) {
            await context.openAlertDialog({
              title: "Validation Error",
              message: error,
            });
            continue;
          }
        }

        // Build note data
        const noteData: Partial<Note> = {
          note_category: category,
          external_note: isPlugPowerUser
            ? (value.external_note ?? false)
            : true,
        };

        // Serialize category-specific fields
        if (config) {
          Object.assign(noteData, config.serializeFormValue(value, helpers));
        }

        // Handle performed_on
        if (value.performed_on) {
          const performedOnDate = DateTime.fromISO(value.performed_on);
          if (performedOnDate.isValid) {
            noteData.performed_on = performedOnDate.toMillis();
          }
        }

        // Merge remaining standard form values (text, subject, etc.)
        const { performed_on, ...restOfValue } = value;
        // Remove category-specific keys that were already handled
        delete restOfValue.external_note;
        Object.assign(noteData, restOfValue);

        notesService.add(noteData);
        step = "exit";
      } else {
        step = "category";
      }
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════
// EDIT NOTE
// ═══════════════════════════════════════════════════════════════════════

export async function handleEditNote(
  context: ComponentContext,
  notesService: NotesService,
  note: Note,
  helpers: CategoryFormHelpers,
  isPlugPowerUser: boolean,
  translations: Record<string, string>,
): Promise<void> {
  const editHelpers: CategoryFormHelpers = {
    ...helpers,
    isEdit: true,
  };

  const config = getCategoryConfig(note.note_category);
  const categoryLabel = getCategoryDisplayLabel(note.note_category);

  // Build initial values
  const performed_on_date = note.performed_on
    ? DateTime.fromMillis(note.performed_on)
    : null;

  const initialValue: Record<string, any> = {
    ...note,
    performed_on: performed_on_date ? performed_on_date.toISO() : null,
    external_note: note.external_note ?? false,
    // Merge category-specific edit values
    ...(config?.getEditInitialValue?.(note, editHelpers) ?? {}),
  };

  const result = await context.openFormDialog({
    title: `${translations.EDIT} ${categoryLabel}`,
    inputs: buildFullInputs(
      note.note_category || "Other",
      editHelpers,
      isPlugPowerUser,
    ),
    initialValue,
    submitButtonText: translations.CONFIRM,
    discardChangesPrompt: true,
  });

  if (result?.value) {
    const { performed_on, ...rest } = result.value;
    const updatedNote: Partial<Note> = { ...rest };

    // Handle performed_on
    if (performed_on) {
      const date = DateTime.fromISO(performed_on);
      updatedNote.performed_on = date.toMillis();
    }

    // Transform tag_numbers from array of objects to array of strings
    if (updatedNote.tag_numbers && Array.isArray(updatedNote.tag_numbers)) {
      updatedNote.tag_numbers = updatedNote.tag_numbers.map((item: any) =>
        typeof item === "string" ? item : item.tag_number,
      );
    }

    // Validate and serialize category-specific fields
    if (config?.validate) {
      const error = config.validate(result.value, editHelpers);
      if (error) {
        context.openAlertDialog({ title: "Validation Error", message: error });
        return;
      }
    }

    if (config) {
      Object.assign(
        updatedNote,
        config.serializeFormValue(result.value, editHelpers),
      );
    }

    await notesService.edit(note._id, updatedNote);
  }
}

// ═══════════════════════════════════════════════════════════════════════
// RECATEGORIZE NOTE
// ═══════════════════════════════════════════════════════════════════════

export async function handleRecategorizeNote(
  context: ComponentContext,
  notesService: NotesService,
  note: Note,
  helpers: CategoryFormHelpers,
  isPlugPowerUser: boolean,
  translations: Record<string, string>,
): Promise<void> {
  const categoryOptions = getCategoryOptions(isPlugPowerUser);

  let step: "select_category" | "fill_new_fields" | "exit" = "select_category";
  let newCategory: string | null = null;

  while (step !== "exit") {
    if (step === "select_category") {
      const categoryResult = await context.openFormDialog({
        title: "Recategorize Note - Select New Category",
        inputs: [
          {
            key: "new_category",
            type: "Selection",
            label: "New Category",
            required: true,
            options: categoryOptions,
            description:
              "Choose the category you want to recategorize this note to",
          },
        ],
        submitButtonText: "Next: Fill New Fields",
        cancelButtonText: "Cancel",
      });

      if (categoryResult?.value) {
        newCategory = categoryResult.value.new_category;
        step = "fill_new_fields";
      } else {
        step = "exit";
      }
    } else if (step === "fill_new_fields") {
      if (!newCategory) {
        step = "select_category";
        continue;
      }

      // Build the form with current note info (read-only) + new category fields
      const allInputs: ComponentInput[] = [];

      // Current note details section (read-only)
      allInputs.push({
        key: "separator_current",
        type: "String",
        label: "━━━━━ CURRENT NOTE (for reference) ━━━━━",
        defaultValue: "",
        disabled: true,
      });

      allInputs.push({
        key: "current_category_display",
        type: "String",
        label: "Current Category",
        defaultValue: getCategoryDisplayLabel(note.note_category),
        disabled: true,
      });

      if (note.performed_on) {
        allInputs.push({
          key: "current_performed_on",
          type: "String",
          label: "Current Performed On",
          defaultValue: DateTime.fromMillis(note.performed_on).toLocaleString(
            DateTime.DATE_SHORT,
          ),
          disabled: true,
        });
      }

      // Category-specific read-only inputs for current data
      const currentConfig = getCategoryConfig(note.note_category);
      if (currentConfig?.getReadOnlyInputs) {
        allInputs.push(...currentConfig.getReadOnlyInputs(note));
      }

      // Current description
      allInputs.push({
        key: "current_text",
        type: "String",
        label: "Current Description",
        defaultValue:
          note.text.replace(/<[^>]*>/g, "").substring(0, 200) +
          (note.text.length > 200 ? "..." : ""),
        disabled: true,
      });

      // New category fields section
      allInputs.push({
        key: "separator_new",
        type: "String",
        label: `━━━━━ NEW: ${getCategoryDisplayLabel(newCategory)} ━━━━━`,
        defaultValue: "",
        disabled: true,
      });

      // New category inputs
      allInputs.push(...buildFullInputs(newCategory, helpers, isPlugPowerUser));

      const newCategoryLabel = getCategoryDisplayLabel(newCategory);
      const formResult = await context.openFormDialog({
        title: `Recategorize to: ${newCategoryLabel}`,
        inputs: allInputs,
        submitButtonText: "Recategorize",
        cancelButtonText: "Back",
        discardChangesPrompt: true,
      });

      if (formResult?.value) {
        const { value } = formResult;
        const newConfig = getCategoryConfig(newCategory);

        // Validate
        if (newConfig?.validate) {
          const error = newConfig.validate(value, helpers);
          if (error) {
            await context.openAlertDialog({
              title: "Validation Error",
              message: error,
            });
            continue;
          }
        }

        // Build updated note
        const updatedNote: Partial<Note> = {
          note_category: newCategory,
          external_note: isPlugPowerUser
            ? (value.external_note ?? false)
            : true,
        };

        // Handle performed_on
        if (value.performed_on) {
          const date = DateTime.fromISO(value.performed_on);
          if (date.isValid) updatedNote.performed_on = date.toMillis();
        }

        // Transform tag_numbers
        if (value.tag_numbers && Array.isArray(value.tag_numbers)) {
          updatedNote.tag_numbers = value.tag_numbers.map((item: any) =>
            typeof item === "string" ? item : item.tag_number,
          );
        }

        // Serialize new category fields
        if (newConfig) {
          Object.assign(
            updatedNote,
            newConfig.serializeFormValue(value, helpers),
          );
        }

        // Include text
        if (value.text !== undefined) {
          updatedNote.text = value.text;
        }

        // Clear old category-specific fields
        updatedNote.tag_numbers = updatedNote.tag_numbers ?? null;
        updatedNote.software_type = updatedNote.software_type ?? null;
        updatedNote.version = updatedNote.version ?? null;
        updatedNote.stack_replacements = updatedNote.stack_replacements ?? null;
        updatedNote.workorder_id = updatedNote.workorder_id ?? null;
        updatedNote.stack_inspections = updatedNote.stack_inspections ?? null;
        updatedNote.stack_installs = updatedNote.stack_installs ?? null;
        updatedNote.stack_tensioning = updatedNote.stack_tensioning ?? null;

        await notesService.edit(note._id, updatedNote);
        step = "exit";
      } else {
        step = "select_category";
      }
    }
  }
}
