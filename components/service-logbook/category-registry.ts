/**
 * Category Registry - Central configuration for all note categories.
 *
 * ┌─────────────────────────────────────────────────────────────────┐
 * │  TO ADD A NEW CATEGORY:                                        │
 * │  1. Add a new CategoryConfig object to CATEGORY_CONFIGS below  │
 * │  2. If it has new Note fields, add them to types.ts Note       │
 * │  3. Done! Forms, HTML preview, edit, recategorize all work.    │
 * └─────────────────────────────────────────────────────────────────┘
 */

import type { ComponentInput } from "@ixon-cdk/types";
import type { CategoryConfig, CategoryFormHelpers, Note } from "./types";
import {
  getStackIdentifiers,
  parseStackReplacements,
  parseStackInspections,
  parseStackTensioning,
  parseStackInstalls,
  serializeStackReplacements,
  serializeStackInspections,
  serializeStackTensioning,
  serializeStackInstalls,
  extractStackReplacementsFromForm,
  extractStackInspectionsFromForm,
  extractStackTensioningFromForm,
  extractStackInstallsFromForm,
} from "./stack-data.utils";

// ── Symptom options (shared by stack replacements) ──────────────────────

const STACK_SYMPTOM_OPTIONS = [
  { label: "None", value: "" },
  { label: "Broken MEA (Membrane Electrode Assembly)", value: "Broken MEA" },
  { label: "Coolant leak", value: "Coolant leak" },
  { label: "H2 leak", value: "H2 leak" },
  { label: "Low cell performance", value: "Low cell performance" },
  { label: "Low cell voltage", value: "Low cell voltage" },
  { label: "Other (describe in text field)", value: "Other" },
];

// ── Helper: build stack group inputs ────────────────────────────────────

function buildStackGroupInputs(
  prefix: string,
  identifiers: string[],
  children: (id: string) => ComponentInput[],
  label: (id: string) => string,
): ComponentInput[] {
  return identifiers.map((id) => ({
    key: `${prefix}_${id}`,
    type: "Group" as const,
    label: label(id),
    required: false,
    children: children(id),
  }));
}

// ═══════════════════════════════════════════════════════════════════════
// CATEGORY DEFINITIONS
// ═══════════════════════════════════════════════════════════════════════

const calibration: CategoryConfig = {
  value: "Calibration",
  label: "Calibration",
  internalOnly: false,
  getFormInputs: () => [
    {
      key: "tag_numbers",
      type: "List" as const,
      label: "Tag Numbers",
      required: true,
      itemType: {
        key: "tag_number",
        type: "String",
        label: "Tag Number",
        placeholder: "Enter tag number",
      },
    },
  ],
  serializeFormValue: (value) => {
    const tagNumbers = value.tag_numbers;
    return {
      tag_numbers: Array.isArray(tagNumbers)
        ? tagNumbers.map((item: any) =>
            typeof item === "string" ? item : item.tag_number,
          )
        : null,
    };
  },
  getEditInitialValue: (note) => ({
    tag_numbers: note.tag_numbers || [],
  }),
  renderHtml: (note) => {
    if (!note.tag_numbers?.length) return "";
    return `
      <div style="margin-bottom: 16px; padding: 8px; border-left: 3px solid color-mix(in srgb, transparent, currentcolor 20%);">
        <div style="margin-bottom: 8px;">
          <strong style="color: color-mix(in srgb, transparent, currentcolor 40%);">Tag Numbers:</strong>
          <span>${note.tag_numbers.join(", ")}</span>
        </div>
      </div>`;
  },
  getReadOnlyInputs: (note) => {
    if (!note.tag_numbers?.length) return [];
    return [
      {
        key: "current_tag_numbers",
        type: "String",
        label: "Current Tag Numbers",
        defaultValue: note.tag_numbers.join(", "),
        disabled: true,
      },
    ];
  },
};

const softwareUpdate: CategoryConfig = {
  value: "Software update",
  label: "Software update",
  internalOnly: false,
  getFormInputs: () => [
    {
      key: "software_type",
      type: "Selection" as const,
      label: "Software Type",
      required: true,
      options: [
        { label: "PLC software", value: "PLC software" },
        { label: "Ixon router", value: "Ixon router" },
        { label: "HMI software", value: "HMI software" },
        {
          label:
            "Other (please specify the updated software in the text field below)",
          value: "Other",
        },
      ],
    },
    {
      key: "version",
      type: "String",
      label: "Software Version",
      required: false,
      placeholder: "Enter new software version (e.g., v2.1.0)",
    },
  ],
  serializeFormValue: (value) => ({
    software_type: value.software_type || null,
    version: value.version || null,
  }),
  getEditInitialValue: (note) => ({
    software_type: note.software_type || "",
    version: note.version || "",
  }),
  renderHtml: (note) => {
    const parts: string[] = [];
    if (note.software_type) {
      parts.push(`
        <div style="margin-bottom: 8px;">
          <strong style="color: color-mix(in srgb, transparent, currentcolor 40%);">Software Type:</strong>
          <span>${note.software_type}</span>
        </div>`);
    }
    if (note.version) {
      parts.push(`
        <div style="margin-bottom: 8px;">
          <strong style="color: color-mix(in srgb, transparent, currentcolor 40%);">Version:</strong>
          <span>${note.version}</span>
        </div>`);
    }
    if (parts.length === 0) return "";
    return `
      <div style="margin-bottom: 16px; padding: 8px; border-left: 3px solid color-mix(in srgb, transparent, currentcolor 20%);">
        ${parts.join("")}
      </div>`;
  },
  getReadOnlyInputs: (note) => {
    const inputs: ComponentInput[] = [];
    if (note.software_type) {
      inputs.push({
        key: "current_software_type",
        type: "String",
        label: "Current Software Type",
        defaultValue: note.software_type,
        disabled: true,
      });
    }
    if (note.version) {
      inputs.push({
        key: "current_version",
        type: "String",
        label: "Current Version",
        defaultValue: note.version,
        disabled: true,
      });
    }
    return inputs;
  },
};

const settingsChange: CategoryConfig = {
  value: "Settings change",
  label: "Settings change",
  internalOnly: false,
  getFormInputs: () => [
    {
      key: "tag_numbers",
      type: "List" as const,
      label: "Tag Numbers",
      required: true,
      itemType: {
        key: "tag_number",
        type: "String",
        label: "Tag Number",
        placeholder: "Enter tag number",
      },
    },
  ],
  serializeFormValue: (value) => {
    const tagNumbers = value.tag_numbers;
    return {
      tag_numbers: Array.isArray(tagNumbers)
        ? tagNumbers.map((item: any) =>
            typeof item === "string" ? item : item.tag_number,
          )
        : null,
    };
  },
  getEditInitialValue: (note) => ({
    tag_numbers: note.tag_numbers || [],
  }),
  renderHtml: (note) => {
    if (!note.tag_numbers?.length) return "";
    return `
      <div style="margin-bottom: 16px; padding: 8px; border-left: 3px solid color-mix(in srgb, transparent, currentcolor 20%);">
        <div style="margin-bottom: 8px;">
          <strong style="color: color-mix(in srgb, transparent, currentcolor 40%);">Tag Numbers:</strong>
          <span>${note.tag_numbers.join(", ")}</span>
        </div>
      </div>`;
  },
  getReadOnlyInputs: (note) => {
    if (!note.tag_numbers?.length) return [];
    return [
      {
        key: "current_tag_numbers",
        type: "String",
        label: "Current Tag Numbers",
        defaultValue: note.tag_numbers.join(", "),
        disabled: true,
      },
    ];
  },
};

const stackReplacements: CategoryConfig = {
  value: "Stack replacements",
  label: "Stack replacements",
  internalOnly: true,
  getFormInputs: (helpers) => {
    const ids = getStackIdentifiers(helpers.getStackCount());
    return [
      {
        key: "workorder_id",
        type: "String",
        label: "Workorder ID",
        required: false,
        placeholder: "Enter the workorder ID if applicable e.g., (WO-002527)",
      },
      ...buildStackGroupInputs(
        "stack_group",
        ids,
        (id) => [
          {
            key: `removed_serial_number_${id}`,
            type: "String",
            label: "Removed Stack Serial Number",
            placeholder: "Enter serial number of removed stack",
            required: false,
          },
          {
            key: `added_serial_number_${id}`,
            type: "String",
            label: "Added Stack Serial Number",
            placeholder: "Enter serial number of added stack",
            required: false,
          },
          {
            key: `stack_symptom_${id}`,
            type: "Selection" as const,
            label: "Stack Symptom",
            required: false,
            options: STACK_SYMPTOM_OPTIONS,
          },
          {
            key: `stack_symptom_confirmed_${id}`,
            type: "Checkbox" as const,
            label: "Stack Symptom Confirmed",
            defaultValue: false,
          },
        ],
        (id) => `Stack ${id.toUpperCase()}`,
      ),
    ];
  },
  validate: (value, helpers) => {
    const items = extractStackReplacementsFromForm(
      value,
      helpers.getStackCount(),
    );
    return items.length === 0
      ? "At least one stack replacement must be filled in."
      : null;
  },
  serializeFormValue: (value, helpers) => {
    const items = extractStackReplacementsFromForm(
      value,
      helpers.getStackCount(),
    );
    return {
      workorder_id: value.workorder_id || null,
      stack_replacements:
        items.length > 0 ? serializeStackReplacements(items) : null,
    };
  },
  getEditInitialValue: (note, helpers) => {
    const initial: Record<string, any> = {
      workorder_id: note.workorder_id || "",
    };
    const replacements = parseStackReplacements(note.stack_replacements);
    for (const r of replacements) {
      initial[`stack_group_${r.identifier}`] = {
        [`removed_serial_number_${r.identifier}`]: r.removed_serial_number,
        [`added_serial_number_${r.identifier}`]: r.added_serial_number,
        [`stack_symptom_${r.identifier}`]: r.stack_symptom,
        [`stack_symptom_confirmed_${r.identifier}`]: r.stack_symptom_confirmed,
      };
    }
    return initial;
  },
  renderHtml: (note) => {
    const replacements = parseStackReplacements(note.stack_replacements);
    if (replacements.length === 0) return "";

    let workorderHtml = "";
    if (note.workorder_id) {
      workorderHtml = `
        <div style="margin-bottom: 8px;">
          <strong style="color: color-mix(in srgb, transparent, currentcolor 40%);">Workorder ID:</strong>
          <span>${note.workorder_id}</span>
        </div>`;
    }

    const stackHtml = replacements
      .map((r) => {
        const symptomLabel =
          STACK_SYMPTOM_OPTIONS.find((o) => o.value === r.stack_symptom)
            ?.label ||
          r.stack_symptom ||
          "-";
        const confirmedBadge = r.stack_symptom_confirmed
          ? `<span style="display: inline-block; padding: 2px 6px; margin-left: 8px; background-color: #4caf50; color: white; border-radius: 3px; font-size: 10px; font-weight: 500;">✓ CONFIRMED</span>`
          : "";
        return `
          <div style="margin: 8px 0; padding: 8px; background-color: color-mix(in srgb, transparent, currentcolor 4%); border-radius: 4px;">
            <div style="font-weight: 500; margin-bottom: 4px;">
              Stack ${r.identifier.toUpperCase()}${confirmedBadge}
            </div>
            <div style="font-size: 11px; color: color-mix(in srgb, transparent, currentcolor 30%);">
              <div>Removed: ${r.removed_serial_number || "-"}</div>
              <div>Added: ${r.added_serial_number || "-"}</div>
              <div>Symptom: ${symptomLabel}</div>
            </div>
          </div>`;
      })
      .join("");

    return `
      <div style="margin-bottom: 16px; padding: 8px; border-left: 3px solid color-mix(in srgb, transparent, currentcolor 20%);">
        ${workorderHtml}${stackHtml}
      </div>`;
  },
  getReadOnlyInputs: (note) => {
    const inputs: ComponentInput[] = [];
    const replacements = parseStackReplacements(note.stack_replacements);
    for (const r of replacements) {
      if (r.removed_serial_number || r.added_serial_number) {
        inputs.push({
          key: `current_stack_${r.identifier}`,
          type: "Group" as const,
          label: `Current Stack ${r.identifier.toUpperCase()}`,
          disabled: true,
          children: [
            {
              key: `current_removed_${r.identifier}`,
              type: "String",
              label: "Removed Serial",
              defaultValue: r.removed_serial_number || "-",
              disabled: true,
            },
            {
              key: `current_added_${r.identifier}`,
              type: "String",
              label: "Added Serial",
              defaultValue: r.added_serial_number || "-",
              disabled: true,
            },
            {
              key: `current_symptom_${r.identifier}`,
              type: "String",
              label: "Symptom",
              defaultValue: r.stack_symptom || "-",
              disabled: true,
            },
            {
              key: `current_confirmed_${r.identifier}`,
              type: "String",
              label: "Confirmed",
              defaultValue: r.stack_symptom_confirmed ? "Yes" : "No",
              disabled: true,
            },
          ],
        });
      }
    }
    return inputs;
  },
};

const stackInspection: CategoryConfig = {
  value: "Stack inspection",
  label: "Stack visual inspection",
  internalOnly: true,
  getFormInputs: (helpers) => {
    const ids = getStackIdentifiers(helpers.getStackCount());
    const prefillSerials = helpers.isEdit
      ? new Map<string, string>()
      : helpers.getLatestSerials();

    return buildStackGroupInputs(
      "stack_group_inspection",
      ids,
      (id) => [
        {
          key: `stack_serial_number_${id}`,
          type: "String",
          label: "Stack Serial Number",
          placeholder: "Enter serial number",
          required: false,
          defaultValue: prefillSerials.get(id) || "",
        },
        {
          key: `insight_${id}`,
          type: "String",
          label: "Insight",
          placeholder: "Enter insight",
          required: false,
        },
        {
          key: `stack_completed_${id}`,
          type: "Checkbox" as const,
          label: "Inspection Completed",
          defaultValue: false,
        },
      ],
      (id) => `Stack ${id.toUpperCase()}`,
    );
  },
  validate: (value, helpers) => {
    const items = extractStackInspectionsFromForm(
      value,
      helpers.getStackCount(),
    );
    return items.length === 0
      ? "At least one stack inspection must be filled in."
      : null;
  },
  serializeFormValue: (value, helpers) => {
    const items = extractStackInspectionsFromForm(
      value,
      helpers.getStackCount(),
    );
    return {
      stack_inspections:
        items.length > 0 ? serializeStackInspections(items) : null,
    };
  },
  getEditInitialValue: (note) => {
    const initial: Record<string, any> = {};
    const inspections = parseStackInspections(note.stack_inspections);
    for (const i of inspections) {
      initial[`stack_group_inspection_${i.identifier}`] = {
        [`stack_serial_number_${i.identifier}`]: i.serial_number,
        [`insight_${i.identifier}`]: i.insight,
        [`stack_completed_${i.identifier}`]: i.completed,
      };
    }
    return initial;
  },
  renderHtml: (note) => {
    const inspections = parseStackInspections(note.stack_inspections);
    if (inspections.length === 0) return "";

    const html = inspections
      .map((i) => {
        const completedBadge = i.completed
          ? `<span style="display: inline-block; padding: 2px 6px; margin-left: 8px; background-color: #4caf50; color: white; border-radius: 3px; font-size: 10px; font-weight: 500;">✓ COMPLETED</span>`
          : "";
        return `
          <div style="margin: 8px 0; padding: 8px; background-color: color-mix(in srgb, transparent, currentcolor 4%); border-radius: 4px;">
            <div style="font-weight: 500; margin-bottom: 4px;">
              Stack ${i.identifier.toUpperCase()}${completedBadge}
            </div>
            <div style="font-size: 11px; color: color-mix(in srgb, transparent, currentcolor 30%);">
              <div>Serial: ${i.serial_number || "-"}</div>
              <div>Insight: ${i.insight || "-"}</div>
            </div>
          </div>`;
      })
      .join("");

    return `
      <div style="margin-bottom: 16px; padding: 8px; border-left: 3px solid color-mix(in srgb, transparent, currentcolor 20%);">
        <div style="margin-top: 12px;"><strong style="color: color-mix(in srgb, transparent, currentcolor 40%);">Stack Visual Inspections:</strong></div>
        ${html}
      </div>`;
  },
  getReadOnlyInputs: (note) => {
    const inputs: ComponentInput[] = [];
    const inspections = parseStackInspections(note.stack_inspections);
    for (const i of inspections) {
      if (i.serial_number || i.insight) {
        inputs.push({
          key: `current_stack_inspection_${i.identifier}`,
          type: "Group" as const,
          label: `Current Stack ${i.identifier.toUpperCase()}`,
          disabled: true,
          children: [
            {
              key: `current_serial_${i.identifier}`,
              type: "String",
              label: "Serial Number",
              defaultValue: i.serial_number || "-",
              disabled: true,
            },
            {
              key: `current_insight_${i.identifier}`,
              type: "String",
              label: "Insight",
              defaultValue: i.insight || "-",
              disabled: true,
            },
            {
              key: `current_completed_${i.identifier}`,
              type: "String",
              label: "Inspection Completed",
              defaultValue: i.completed ? "Yes" : "No",
              disabled: true,
            },
          ],
        });
      }
    }
    return inputs;
  },
};

const stackTensioning: CategoryConfig = {
  value: "Stack tensioning",
  label: "Stack tensioning",
  internalOnly: true,
  getFormInputs: (helpers) => {
    const ids = getStackIdentifiers(helpers.getStackCount());
    const prefillSerials = helpers.isEdit
      ? new Map<string, string>()
      : helpers.getLatestSerials();

    return buildStackGroupInputs(
      "stack_group_tensioning",
      ids,
      (id) => [
        {
          key: `stack_serial_number_${id}`,
          type: "String",
          label: "Stack Serial Number",
          placeholder: "Enter serial number",
          required: false,
          defaultValue: prefillSerials.get(id) || "",
        },
        {
          key: `insight_${id}`,
          type: "String",
          label: "Insight",
          placeholder: "Enter insight",
          required: false,
        },
        {
          key: `stack_completed_${id}`,
          type: "Checkbox" as const,
          label: "Tensioning Completed",
          defaultValue: false,
        },
      ],
      (id) => `Stack ${id.toUpperCase()}`,
    );
  },
  validate: (value, helpers) => {
    const items = extractStackTensioningFromForm(
      value,
      helpers.getStackCount(),
    );
    return items.length === 0
      ? "At least one stack tensioning must be filled in."
      : null;
  },
  serializeFormValue: (value, helpers) => {
    const items = extractStackTensioningFromForm(
      value,
      helpers.getStackCount(),
    );
    return {
      stack_tensioning:
        items.length > 0 ? serializeStackTensioning(items) : null,
    };
  },
  getEditInitialValue: (note) => {
    const initial: Record<string, any> = {};
    const tensionings = parseStackTensioning(note.stack_tensioning);
    for (const t of tensionings) {
      initial[`stack_group_tensioning_${t.identifier}`] = {
        [`stack_serial_number_${t.identifier}`]: t.serial_number,
        [`insight_${t.identifier}`]: t.insight,
        [`stack_completed_${t.identifier}`]: t.completed,
      };
    }
    return initial;
  },
  renderHtml: (note) => {
    const tensionings = parseStackTensioning(note.stack_tensioning);
    if (tensionings.length === 0) return "";

    const html = tensionings
      .map((t) => {
        const completedBadge = t.completed
          ? `<span style="display: inline-block; padding: 2px 6px; margin-left: 8px; background-color: #4caf50; color: white; border-radius: 3px; font-size: 10px; font-weight: 500;">✓ COMPLETED</span>`
          : "";
        return `
          <div style="margin: 8px 0; padding: 8px; background-color: color-mix(in srgb, transparent, currentcolor 4%); border-radius: 4px;">
            <div style="font-weight: 500; margin-bottom: 4px;">
              Stack ${t.identifier.toUpperCase()}${completedBadge}
            </div>
            <div style="font-size: 11px; color: color-mix(in srgb, transparent, currentcolor 30%);">
              <div>Serial: ${t.serial_number || "-"}</div>
              <div>Insight: ${t.insight || "-"}</div>
            </div>
          </div>`;
      })
      .join("");

    return `
      <div style="margin-bottom: 16px; padding: 8px; border-left: 3px solid color-mix(in srgb, transparent, currentcolor 20%);">
        <div style="margin-top: 12px;"><strong style="color: color-mix(in srgb, transparent, currentcolor 40%);">Stack Tensioning:</strong></div>
        ${html}
      </div>`;
  },
  getReadOnlyInputs: (note) => {
    const inputs: ComponentInput[] = [];
    const tensionings = parseStackTensioning(note.stack_tensioning);
    for (const t of tensionings) {
      if (t.serial_number || t.insight) {
        inputs.push({
          key: `current_stack_tensioning_${t.identifier}`,
          type: "Group" as const,
          label: `Current Stack ${t.identifier.toUpperCase()}`,
          disabled: true,
          children: [
            {
              key: `current_serial_${t.identifier}`,
              type: "String",
              label: "Serial Number",
              defaultValue: t.serial_number || "-",
              disabled: true,
            },
            {
              key: `current_insight_${t.identifier}`,
              type: "String",
              label: "Insight",
              defaultValue: t.insight || "-",
              disabled: true,
            },
            {
              key: `current_completed_${t.identifier}`,
              type: "String",
              label: "Tensioning Completed",
              defaultValue: t.completed ? "Yes" : "No",
              disabled: true,
            },
          ],
        });
      }
    }
    return inputs;
  },
};

const stackInstalls: CategoryConfig = {
  value: "Stack installs",
  label: "Stack installs",
  internalOnly: true,
  getFormInputs: (helpers) => {
    const ids = getStackIdentifiers(helpers.getStackCount());
    return buildStackGroupInputs(
      "stack_group_installs",
      ids,
      (id) => [
        {
          key: `stack_serial_number_${id}`,
          type: "String",
          label: "Stack Serial Number",
          placeholder: "Enter serial number",
          required: false,
        },
      ],
      (id) => `Stack ${id.toUpperCase()}`,
    );
  },
  validate: (value, helpers) => {
    const items = extractStackInstallsFromForm(value, helpers.getStackCount());
    return items.length === 0
      ? "At least one stack install must be filled in."
      : null;
  },
  serializeFormValue: (value, helpers) => {
    const items = extractStackInstallsFromForm(value, helpers.getStackCount());
    return {
      stack_installs: items.length > 0 ? serializeStackInstalls(items) : null,
    };
  },
  getEditInitialValue: (note) => {
    const initial: Record<string, any> = {};
    const installs = parseStackInstalls(note.stack_installs);
    for (const i of installs) {
      initial[`stack_group_installs_${i.identifier}`] = {
        [`stack_serial_number_${i.identifier}`]: i.serial_number,
      };
    }
    return initial;
  },
  renderHtml: (note) => {
    const installs = parseStackInstalls(note.stack_installs);
    if (installs.length === 0) return "";

    const html = installs
      .map(
        (i) => `
        <div style="margin: 8px 0; padding: 8px; background-color: color-mix(in srgb, transparent, currentcolor 4%); border-radius: 4px;">
          <div style="font-weight: 500; margin-bottom: 4px;">Stack ${i.identifier.toUpperCase()}</div>
          <div style="font-size: 11px; color: color-mix(in srgb, transparent, currentcolor 30%);">
            <div>Serial: ${i.serial_number || "-"}</div>
          </div>
        </div>`,
      )
      .join("");

    return `
      <div style="margin-bottom: 16px; padding: 8px; border-left: 3px solid color-mix(in srgb, transparent, currentcolor 20%);">
        <div style="margin-top: 12px;"><strong style="color: color-mix(in srgb, transparent, currentcolor 40%);">Stack Installs:</strong></div>
        ${html}
      </div>`;
  },
  getReadOnlyInputs: (note) => {
    const inputs: ComponentInput[] = [];
    const installs = parseStackInstalls(note.stack_installs);
    for (const i of installs) {
      if (i.serial_number) {
        inputs.push({
          key: `current_stack_install_${i.identifier}`,
          type: "Group" as const,
          label: `Current Stack ${i.identifier.toUpperCase()}`,
          disabled: true,
          children: [
            {
              key: `current_serial_${i.identifier}`,
              type: "String",
              label: "Serial Number",
              defaultValue: i.serial_number || "-",
              disabled: true,
            },
          ],
        });
      }
    }
    return inputs;
  },
};

const other: CategoryConfig = {
  value: "Other",
  label: "Other",
  internalOnly: false,
  getFormInputs: () => [],
  serializeFormValue: () => ({}),
};

// ═══════════════════════════════════════════════════════════════════════
// REGISTRY (the single source of truth)
// ═══════════════════════════════════════════════════════════════════════

/** All category configurations, in display order. */
export const CATEGORY_CONFIGS: CategoryConfig[] = [
  calibration,
  softwareUpdate,
  settingsChange,
  stackReplacements,
  stackInspection,
  stackTensioning,
  stackInstalls,
  other,
];

// ── Lookup helpers ──────────────────────────────────────────────────────

const configByValue = new Map<string, CategoryConfig>(
  CATEGORY_CONFIGS.map((c) => [c.value, c]),
);

/** Get the CategoryConfig for a given note_category value */
export function getCategoryConfig(
  noteCategory: string | null,
): CategoryConfig | undefined {
  return noteCategory ? configByValue.get(noteCategory) : undefined;
}

/** Get the display label for a note_category value */
export function getCategoryDisplayLabel(noteCategory: string | null): string {
  const config = getCategoryConfig(noteCategory);
  return config?.label || noteCategory || "Uncategorized";
}

/** Get category options for a form Selection, filtered by user type */
export function getCategoryOptions(
  isPlugPowerUser: boolean,
): { value: string; label: string }[] {
  return CATEGORY_CONFIGS.filter((c) => isPlugPowerUser || !c.internalOnly).map(
    (c) => ({ value: c.value, label: c.label }),
  );
}
