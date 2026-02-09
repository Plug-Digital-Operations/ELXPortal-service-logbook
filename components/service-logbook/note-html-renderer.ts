/**
 * Note HTML Content Renderer
 *
 * Builds the HTML shown inside the content dialog preview.
 * Previously this logic was entirely inside getNoteHtmlContent() and
 * updateNoteHtmlContent() in the main Svelte file (~200 lines).
 */

import type { ComponentContext, ResourceData } from "@ixon-cdk/types";
import type { Note, NoteWithHtml, ServiceLogbookCategory } from "./types";
import { DateTime } from "luxon";
import { getFirstLetter, getStyle } from "./letter-avatar/letter-avatar.utils";
import {
  getCategoryConfig,
  getCategoryDisplayLabel,
} from "./category-registry";
import { getCategoryStyle } from "./categories.utils";

// ── Public API ──────────────────────────────────────────────────────────

export interface NoteHtmlDeps {
  context: ComponentContext;
  usersDict: Record<string, ResourceData.User> | null;
  getCategory: (id: number | null) => ServiceLogbookCategory | null;
}

/**
 * Build the full HTML card for a note (used in openContentDialog).
 */
export function buildNoteHtmlContent(
  note: NoteWithHtml,
  deps: NoteHtmlDeps,
): string {
  const subject = note.subject ? `<h2>${note.subject}</h2>` : "";
  const sanitizedHtml = deps.context.sanitizeHtml(note.html, {
    allowStyleAttr: true,
  });

  const categoryName = getCategoryDisplayLabel(note.note_category);
  const categorySection = `
    <div style="margin-bottom: 16px; padding: 8px; background-color: color-mix(in srgb, transparent, currentcolor 8%); border-radius: 4px;">
      <strong style="color: color-mix(in srgb, transparent, currentcolor 40%);">Category:</strong>
      <span style="font-weight: 500;">${categoryName}</span>
    </div>`;

  const performedOnHtml = buildPerformedOnHtml(note);
  const categoryFields = buildCategoryFieldsHtml(note);
  const externalNoteBadge =
    note.external_note === true
      ? `<div style="margin-bottom: 16px;">
           <span style="display: inline-block; padding: 4px 8px; background-color: #2196F3; color: white; border-radius: 4px; font-size: 11px; font-weight: 500;">
             📋 EXTERNAL NOTE
           </span>
         </div>`
      : "";

  return `
    <div class="card">
      <div class="card-header">
        <div class="note-info who">${buildNoteInfoWho(note, deps)}</div>
        <div class="note-info when-what">${buildNoteInfoWhenWhat(note, deps)}</div>
        <button class="icon-button more" data-testid="service-logbook-preview-more-button">
          <svg height="20px" viewBox="0 0 24 24" width="20px">
            <path d="M0 0h24v24H0V0z" fill="none" />
            <path d="M12 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z"/>
          </svg>
        </button>
      </div>
      <div class="card-content">
        ${subject}
        ${externalNoteBadge}
        ${categorySection}
        ${performedOnHtml}
        ${categoryFields}
        <div style="margin-top: 16px;">
          ${sanitizedHtml}
        </div>
      </div>
    </div>`;
}

/**
 * Update an already-open content dialog with new note data (for pagination).
 */
export function updateNoteHtmlInShadowRoot(
  root: ShadowRoot,
  note: NoteWithHtml,
  deps: NoteHtmlDeps,
): void {
  const noteInfoWho = root.querySelector(".note-info.who");
  const noteInfoWhenWhat = root.querySelector(".note-info.when-what");
  const cardContent = root.querySelector(".card-content");

  if (noteInfoWho) noteInfoWho.innerHTML = buildNoteInfoWho(note, deps);
  if (noteInfoWhenWhat)
    noteInfoWhenWhat.innerHTML = buildNoteInfoWhenWhat(note, deps);

  if (cardContent) {
    const fullHtml = buildNoteHtmlContent(note, deps);
    const contentMatch = fullHtml.match(
      /<div class="card-content">([\s\S]*)<\/div>\s*<\/div>$/,
    );
    if (contentMatch) {
      cardContent.innerHTML = contentMatch[1];
    }
  }
}

// ── Internal helpers ────────────────────────────────────────────────────

function buildPerformedOnHtml(note: Note): string {
  if (!note.performed_on) return "";
  const performedDate = DateTime.fromMillis(note.performed_on).toLocaleString({
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  return `
    <div style="margin-bottom: 16px; padding: 8px; border-left: 3px solid color-mix(in srgb, transparent, currentcolor 20%);">
      <div style="margin-bottom: 8px;">
        <strong style="color: color-mix(in srgb, transparent, currentcolor 40%);">Performed On:</strong>
        <span>${performedDate}</span>
      </div>
    </div>`;
}

function buildCategoryFieldsHtml(note: Note): string {
  const config = getCategoryConfig(note.note_category);
  return config?.renderHtml?.(note) ?? "";
}

export function buildNoteInfoWho(note: Note, deps: NoteHtmlDeps): string {
  const userName = getNoteUserName(deps.usersDict, note);
  const { width, height, backgroundColor } = getStyle(userName, 22);
  const editedBy =
    note.editor_id && note.editor_name
      ? (() => {
          const editedByUser = getNoteEditedBy(deps.usersDict, note);
          const editedDate = note.updated_on
            ? DateTime.fromMillis(note.updated_on).toLocaleString(
                DateTime.DATETIME_SHORT,
              )
            : "";
          const dateText = editedDate ? ` on ${editedDate}` : "";
          return `<span class="edited-by"><i>${deps.context.translate("EDITED_BY_USER", { user: editedByUser })}${dateText}</i></span>`;
        })()
      : "";
  return `<svg class="user-avatar" style="background-color:${backgroundColor}; width:${width}; height: ${height};"><text x="50%" y="50%" text-anchor="middle" dominant-baseline="central">${getFirstLetter(userName)}</text></svg><span><span class="name">${userName}</span>${editedBy}</span>`;
}

export function buildNoteInfoWhenWhat(
  note: NoteWithHtml,
  deps: NoteHtmlDeps,
): string {
  const dateStr = DateTime.fromMillis(note.created_on, {
    locale: deps.context.appData.locale,
    zone: deps.context.appData.timeZone,
  }).toLocaleString({
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
  });

  if (note.category !== null) {
    const category = deps.getCategory(note.category);
    const categoryLabel = category
      ? `<span class="category" style="${getCategoryStyle(category)}">${category.name}</span>`
      : "";
    return `<span>${dateStr}</span>${categoryLabel}`;
  }
  return `<span>${dateStr}</span>`;
}

// ── Shared user-name helpers (also used by the main component) ──────────

export function getNoteUserName(
  usersDict: Record<string, ResourceData.User> | null,
  note: Note,
): string {
  const _usersDict = usersDict ?? {};
  if (note.author_id) {
    return _usersDict[note.author_id]?.name ?? note.author_name ?? "";
  }
  if (note.user) {
    return _usersDict[note.user]?.name ?? "";
  }
  return "";
}

export function getNoteEditedBy(
  usersDict: Record<string, ResourceData.User> | null,
  note: Note,
): string {
  const _usersDict = usersDict ?? {};
  if (note.editor_id) {
    return _usersDict[note.editor_id]?.name ?? note.editor_name ?? "";
  }
  return "";
}
