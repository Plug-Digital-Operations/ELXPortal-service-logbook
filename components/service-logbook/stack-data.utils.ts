/**
 * Stack data parsing and serialization utilities.
 *
 * All stack-related string formats (`('a','serial','insight','true')`) are
 * parsed and serialized through these helpers, eliminating the regex
 * duplication that was scattered across handleAdd, handleEdit,
 * handleRecategorize, getNoteHtmlContent, and the edit dialog.
 */

// ── Parsed types ────────────────────────────────────────────────────────

export interface StackReplacement {
  identifier: string;
  removed_serial_number: string;
  added_serial_number: string;
  stack_symptom: string;
  stack_symptom_confirmed: boolean;
}

export interface StackInspection {
  identifier: string;
  serial_number: string;
  insight: string;
  completed: boolean;
}

export interface StackTensioning {
  identifier: string;
  serial_number: string;
  insight: string;
  completed: boolean;
}

export interface StackInstall {
  identifier: string;
  serial_number: string;
}

// ── Parsing (string → typed objects) ────────────────────────────────────

export function parseStackReplacements(
  raw: string | null | undefined,
): StackReplacement[] {
  if (!raw) return [];
  return raw
    .split(";")
    .filter((r) => r.trim())
    .map((r) => {
      const match = r.match(
        /\('([^']+)','([^']*)','([^']*)','([^']*)','([^']+)'\)/,
      );
      if (match) {
        return {
          identifier: match[1],
          removed_serial_number: match[2],
          added_serial_number: match[3],
          stack_symptom: match[4],
          stack_symptom_confirmed: match[5] === "true",
        };
      }
      return null;
    })
    .filter((r): r is StackReplacement => r !== null);
}

export function parseStackInspections(
  raw: string | null | undefined,
): StackInspection[] {
  if (!raw) return [];
  return raw
    .split(";")
    .filter((r) => r.trim())
    .map((r) => {
      // New format: ('id','serial','insight','completed')
      const matchNew = r.match(/\('([^']+)','([^']*)','([^']*)','([^']+)'\)/);
      if (matchNew) {
        return {
          identifier: matchNew[1],
          serial_number: matchNew[2],
          insight: matchNew[3],
          completed: matchNew[4] === "true",
        };
      }
      // Old format: ('id','serial','insight')
      const matchOld = r.match(/\('([^']+)','([^']*)','([^']*)'\)/);
      if (matchOld) {
        return {
          identifier: matchOld[1],
          serial_number: matchOld[2],
          insight: matchOld[3],
          completed: false,
        };
      }
      return null;
    })
    .filter((r): r is StackInspection => r !== null);
}

export function parseStackTensioning(
  raw: string | null | undefined,
): StackTensioning[] {
  if (!raw) return [];
  return raw
    .split(";")
    .filter((r) => r.trim())
    .map((r) => {
      const match = r.match(/\('([^']+)','([^']*)','([^']*)','([^']+)'\)/);
      if (match) {
        return {
          identifier: match[1],
          serial_number: match[2],
          insight: match[3],
          completed: match[4] === "true",
        };
      }
      return null;
    })
    .filter((r): r is StackTensioning => r !== null);
}

export function parseStackInstalls(
  raw: string | null | undefined,
): StackInstall[] {
  if (!raw) return [];
  return raw
    .split(";")
    .filter((r) => r.trim())
    .map((r) => {
      const match = r.match(/\('([^']+)','([^']*)'\)/);
      if (match) {
        return {
          identifier: match[1],
          serial_number: match[2],
        };
      }
      return null;
    })
    .filter((r): r is StackInstall => r !== null);
}

// ── Serialization (typed objects → string) ──────────────────────────────

export function serializeStackReplacements(items: StackReplacement[]): string {
  return (
    items
      .map(
        (i) =>
          `('${i.identifier}','${i.removed_serial_number}','${i.added_serial_number}','${i.stack_symptom}','${i.stack_symptom_confirmed ? "true" : "false"}')`,
      )
      .join(";") + ";"
  );
}

export function serializeStackInspections(items: StackInspection[]): string {
  return (
    items
      .map(
        (i) =>
          `('${i.identifier}','${i.serial_number}','${i.insight}','${i.completed ? "true" : "false"}')`,
      )
      .join(";") + ";"
  );
}

export function serializeStackTensioning(items: StackTensioning[]): string {
  return (
    items
      .map(
        (i) =>
          `('${i.identifier}','${i.serial_number}','${i.insight}','${i.completed ? "true" : "false"}')`,
      )
      .join(";") + ";"
  );
}

export function serializeStackInstalls(items: StackInstall[]): string {
  return (
    items.map((i) => `('${i.identifier}','${i.serial_number}')`).join(";") + ";"
  );
}

// ── Helpers ─────────────────────────────────────────────────────────────

const ALL_STACK_IDENTIFIERS = ["a", "b", "c", "d", "e"];

export function getStackIdentifiers(stackCount: number): string[] {
  return ALL_STACK_IDENTIFIERS.slice(0, stackCount);
}

/**
 * Extract stack replacements from a form value object.
 * Handles the nested group structure: value[`stack_group_${id}`][`field_${id}`]
 */
export function extractStackReplacementsFromForm(
  value: Record<string, any>,
  stackCount: number,
): StackReplacement[] {
  const items: StackReplacement[] = [];
  for (const id of getStackIdentifiers(stackCount)) {
    const group = value[`stack_group_${id}`] || {};
    const removed = group[`removed_serial_number_${id}`] || "";
    const added = group[`added_serial_number_${id}`] || "";
    const symptom = group[`stack_symptom_${id}`] || "";
    const confirmed = !!group[`stack_symptom_confirmed_${id}`];
    if (removed || added) {
      items.push({
        identifier: id,
        removed_serial_number: removed,
        added_serial_number: added,
        stack_symptom: symptom,
        stack_symptom_confirmed: confirmed,
      });
    }
  }
  return items;
}

export function extractStackInspectionsFromForm(
  value: Record<string, any>,
  stackCount: number,
): StackInspection[] {
  const items: StackInspection[] = [];
  for (const id of getStackIdentifiers(stackCount)) {
    const group = value[`stack_group_inspection_${id}`] || {};
    const serial = group[`stack_serial_number_${id}`] || "";
    const insight = group[`insight_${id}`] || "";
    const completed = !!group[`stack_completed_${id}`];
    if (serial || insight) {
      items.push({ identifier: id, serial_number: serial, insight, completed });
    }
  }
  return items;
}

export function extractStackTensioningFromForm(
  value: Record<string, any>,
  stackCount: number,
): StackTensioning[] {
  const items: StackTensioning[] = [];
  for (const id of getStackIdentifiers(stackCount)) {
    const group = value[`stack_group_tensioning_${id}`] || {};
    const serial = group[`stack_serial_number_${id}`] || "";
    const insight = group[`insight_${id}`] || "";
    const completed = !!group[`stack_completed_${id}`];
    if (serial || insight) {
      items.push({ identifier: id, serial_number: serial, insight, completed });
    }
  }
  return items;
}

export function extractStackInstallsFromForm(
  value: Record<string, any>,
  stackCount: number,
): StackInstall[] {
  const items: StackInstall[] = [];
  for (const id of getStackIdentifiers(stackCount)) {
    const group = value[`stack_group_installs_${id}`] || {};
    const serial = group[`stack_serial_number_${id}`] || "";
    if (serial) {
      items.push({ identifier: id, serial_number: serial });
    }
  }
  return items;
}
