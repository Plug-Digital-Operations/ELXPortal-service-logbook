<script lang="ts">
  import { onMount, tick } from "svelte";
  import { get, writable, derived } from "svelte/store";
  import type {
    ComponentContext,
    ComponentInput,
    ResourceData,
    SingleSelectPanelOptions,
  } from "@ixon-cdk/types";
  import type {
    Note,
    NoteWithHtml,
    ServiceLogbookCategory,
    CategoryFormHelpers,
  } from "./types";
  import { NotesService } from "./notes.service";
  import { deburr, kebabCase } from "lodash-es";
  import { DateTime, type DateTimeFormatOptions } from "luxon";
  import {
    getFirstLetter,
    getStyle,
  } from "./letter-avatar/letter-avatar.utils";
  import { renderMarkdownToHtml } from "./formatters/markdown-to-html/markdown-to-html.utils";
  import { HtmlToReadableText } from "./service-logbook.utils";
  import {
    getCategoryStyle,
    mapAppConfigToServiceLogbookCategoryMapFactory,
  } from "./categories.utils";
  import { getCategoryDisplayLabel } from "./category-registry";
  import {
    getNoteUserName,
    getNoteEditedBy,
    buildNoteHtmlContent,
    updateNoteHtmlInShadowRoot,
  } from "./note-html-renderer";
  import {
    handleAddNote,
    handleEditNote,
    handleRecategorizeNote,
  } from "./form-handlers";
  import {
    parseStackInstalls,
    parseStackReplacements,
  } from "./stack-data.utils";

  // ── Props (Svelte 5) ──────────────────────────────────────────────────

  let { context }: { context: ComponentContext } = $props();

  // ── State ─────────────────────────────────────────────────────────────

  let isPlugPowerUser = $state(false);
  let userEmail: string | null = $state(null);
  let rootEl: HTMLDivElement;
  let addButton: HTMLButtonElement;
  let agentOrAsset: ResourceData.Agent | ResourceData.Asset | null =
    $state(null);
  let agentOrAssetName: string | null = $state(null);
  let categories: Map<number, ServiceLogbookCategory> = $state(new Map());
  let myUser: ResourceData.MyUser | null = $state(null);
  let notesService: NotesService;
  let searchInput: HTMLInputElement | null = $state(null);
  let searchInputVisible: boolean = $state(false);
  let translations: Record<string, string> = $state({});
  let usersDict: Record<string, ResourceData.User> | null = $state(null);
  let width: number | null = $state(null);
  let now = DateTime.now();

  // Stores (kept for NotesService integration)
  let loaded = writable(false);
  let notes = writable<Note[]>([]);

  let mapAppConfigToServiceLogbookCategoryMap: (
    appConfig: ResourceData.AppConfig<{
      categories?: ServiceLogbookCategory[];
    }> | null,
  ) => Map<number, ServiceLogbookCategory>;

  const filter = writable<{
    searchQuery: string | null;
    selectedCategoryId: number | null;
  }>({
    searchQuery: null,
    selectedCategoryId: null,
  });

  // ── Derived state ─────────────────────────────────────────────────────

  let notesWithHtml = derived(notes, ($notes) =>
    $notes.map((note) => {
      const html = note.text.match(/^<\/?[a-z][\s\S]*>/)
        ? note.text
        : renderMarkdownToHtml(note.text);
      return { ...note, html };
    }),
  );

  let filteredNotesWithHtml = derived(
    [filter, notesWithHtml],
    ([$filter, $notesWithHtml]) => {
      const { searchQuery, selectedCategoryId } = $filter;

      let result = $notesWithHtml;
      if (!isPlugPowerUser) {
        result = result.filter((note) => note.external_note === true);
      }

      result =
        selectedCategoryId !== null
          ? result.filter((note) => note.category === selectedCategoryId)
          : result;

      if (!searchQuery) return result;

      const query = searchQuery.toLowerCase();
      return result.filter((note) => {
        if (getNoteUserName(usersDict, note).toLowerCase().includes(query))
          return true;
        if (note.subject?.toLowerCase().includes(query)) return true;
        if (HtmlToReadableText(note.html).toLowerCase().includes(query))
          return true;
        if (note.note_category?.toLowerCase().includes(query)) return true;
        if (note.tag_numbers?.some((tag) => tag.toLowerCase().includes(query)))
          return true;
        if (note.version?.toLowerCase().includes(query)) return true;
        if (note.stack_replacements?.toLowerCase().includes(query)) return true;
        return false;
      });
    },
  );

  // Reactive layout
  let isNarrow = $derived(width !== null ? width <= 460 : false);
  let isSmall = $derived(width !== null ? width <= 400 : false);

  let notesWithCategories = derived([notesWithHtml], ([$notes]) => {
    return (
      categories.size > 0 &&
      ($notes?.some((note) => note.category !== undefined) ?? false)
    );
  });

  let selectedCategoryName = derived([filter], ([$filter]) => {
    const category = getCategory($filter.selectedCategoryId);
    return category ? category.name : translations.CATEGORY;
  });

  // ── Helpers ───────────────────────────────────────────────────────────

  function getStackCount(): number {
    if (!agentOrAssetName) return 5;
    if (agentOrAssetName.includes("EX425D")) return 1;
    if (agentOrAssetName.includes("EX2125D")) return 5;
    return 5;
  }

  function getLatestStackSerialNumbers(): Map<string, string> {
    const serialNumbers = new Map<string, string>();
    const allNotes = get(notes);

    const relevantNotes = allNotes.filter(
      (n) =>
        n.note_category === "Stack installs" ||
        n.note_category === "Stack replacements",
    );

    if (relevantNotes.length === 0) return serialNumbers;

    relevantNotes.sort((a, b) => {
      const dateA = a.performed_on || a.created_on;
      const dateB = b.performed_on || b.created_on;
      return dateB - dateA;
    });

    const stackCount = getStackCount();
    const allStackIdentifiers = ["a", "b", "c", "d", "e"];
    const neededIdentifiers = new Set(allStackIdentifiers.slice(0, stackCount));

    for (const note of relevantNotes) {
      if (neededIdentifiers.size === 0) break;

      if (note.note_category === "Stack installs" && note.stack_installs) {
        for (const install of parseStackInstalls(note.stack_installs)) {
          if (
            neededIdentifiers.has(install.identifier) &&
            install.serial_number
          ) {
            serialNumbers.set(install.identifier, install.serial_number);
            neededIdentifiers.delete(install.identifier);
          }
        }
      } else if (
        note.note_category === "Stack replacements" &&
        note.stack_replacements
      ) {
        for (const replacement of parseStackReplacements(
          note.stack_replacements,
        )) {
          if (
            neededIdentifiers.has(replacement.identifier) &&
            replacement.added_serial_number
          ) {
            serialNumbers.set(
              replacement.identifier,
              replacement.added_serial_number,
            );
            neededIdentifiers.delete(replacement.identifier);
          }
        }
      }
    }

    return serialNumbers;
  }

  /** Build the helpers object passed to category form handlers */
  function getFormHelpers(isEdit = false): CategoryFormHelpers {
    return {
      getStackCount,
      getLatestSerials: getLatestStackSerialNumbers,
      isEdit,
    };
  }

  function getCategory(id: number | null): ServiceLogbookCategory | null {
    return id !== null ? (categories.get(id) ?? null) : null;
  }

  function getNoteIsActionable(
    agentOrAsset: ResourceData.Agent | ResourceData.Asset | null,
    myUser: ResourceData.MyUser | null,
    note: Note,
  ): boolean {
    if (agentOrAsset && "permissions" in agentOrAsset) {
      return agentOrAsset.permissions?.includes("manage") ?? false;
    }
    return false;
  }

  function getNoteCategoryName(note: Note): string {
    return getCategoryDisplayLabel(note.note_category);
  }

  async function fetchUserEmail(): Promise<string | null> {
    try {
      const response = await context
        .createApiClient()
        .query([{ selector: "MyUser", fields: ["emailAddress"] }]);
      const data = response?.[0]?.data;
      if (data && "emailAddress" in data) {
        return data.emailAddress;
      }
    } catch (error) {
      console.error("Failed to fetch user email:", error);
    }
    return null;
  }

  // ── Date formatting ───────────────────────────────────────────────────

  function mapNoteToWhenDateTime(note: Note): string {
    return DateTime.fromMillis(note.created_on, {
      locale: context.appData.locale,
      zone: context.appData.timeZone,
    }).toLocaleString({
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "numeric",
      minute: "numeric",
    });
  }

  function mapNoteToNeeded(note: Note): string {
    const date = DateTime.fromMillis(note.created_on, {
      locale: context.appData.locale,
      zone: context.appData.timeZone,
    });
    return date.year === now.year
      ? date.toLocaleString({ month: "short", day: "numeric" })
      : date.toLocaleString({
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
        });
  }

  // ── Tooltip helpers ───────────────────────────────────────────────────

  function createTooltip(
    button: HTMLButtonElement,
    options: { message: string },
  ): void {
    context.createTooltip(button, { message: options.message });
  }

  function createTooltipOnEllipsis(element: HTMLElement): void {
    if (element.scrollWidth > element.offsetWidth) {
      context.createTooltip(element, { message: element.innerText });
    }
  }

  function _getCategoryInput(): ComponentInput {
    const options =
      [...(categories?.values() ?? [])].map((category) => ({
        label: category.name,
        value: category.id,
      })) ?? [];
    return {
      key: "category",
      type: "Selection" as const,
      label: translations.CATEGORY,
      required: false,
      options: [
        { label: translations.NONE },
        ...options,
      ] as ComponentInput["options"],
    };
  }

  // ── Event handlers ────────────────────────────────────────────────────

  async function handleAddButtonClick(): Promise<void> {
    await handleAddNote(
      context,
      notesService,
      getFormHelpers(false),
      isPlugPowerUser,
      translations,
    );
  }

  async function handleEditNoteButtonClick(note: Note): Promise<void> {
    await handleEditNote(
      context,
      notesService,
      note,
      getFormHelpers(true),
      isPlugPowerUser,
      translations,
    );
  }

  async function handleRecategorizeNoteButtonClick(note: Note): Promise<void> {
    await handleRecategorizeNote(
      context,
      notesService,
      note,
      getFormHelpers(false),
      isPlugPowerUser,
      translations,
    );
  }

  async function handleRemoveNoteButtonClick(note: Note): Promise<void> {
    const confirmed = await context.openConfirmDialog({
      title: translations.REMOVE_NOTE,
      message: translations["__TEXT__.CONFIRM_NOTE_REMOVAL"],
      confirmButtonText: translations.REMOVE,
      confirmCheckbox: true,
      destructive: true,
    });
    if (confirmed) {
      notesService.remove(note._id);
    }
  }

  async function handleMoreActionsButtonClick(
    event: Event,
    note: Note,
    closeDialog?: () => void,
  ): Promise<void> {
    event.stopImmediatePropagation();
    const actions = [
      { type: "edit", title: translations.EDIT },
      { type: "recategorize", title: "Recategorize" },
      { type: "export", title: translations.EXPORT },
      { type: "remove", title: translations.REMOVE, destructive: true },
    ].filter((action) => {
      switch (action.type) {
        case "edit":
        case "remove":
        case "recategorize":
          return getNoteIsActionable(agentOrAsset, myUser, note);
        default:
          return true;
      }
    });
    const target = event.target as HTMLElement;
    const result = await context.openActionMenu(target, { actions });
    if (result) {
      const resultAction = actions[result.index];
      switch (resultAction?.type) {
        case "edit":
          handleEditNoteButtonClick(note);
          if (closeDialog) closeDialog();
          break;
        case "recategorize":
          handleRecategorizeNoteButtonClick(note);
          if (closeDialog) closeDialog();
          break;
        case "export":
          handleDownloadCsvButtonClick([note]);
          break;
        case "remove":
          handleRemoveNoteButtonClick(note);
          if (closeDialog) closeDialog();
          break;
      }
    }
  }

  async function handlePreviewNoteClick(
    initialNote: NoteWithHtml,
  ): Promise<void> {
    let root: ShadowRoot;
    let note: NoteWithHtml | null | undefined = initialNote;
    const previewNotes = get(filteredNotesWithHtml);

    const htmlDeps = {
      context,
      usersDict,
      getCategory,
    };

    await context.openContentDialog({
      htmlContent: buildNoteHtmlContent(note, htmlDeps),
      onopened(shadowRoot, close) {
        root = shadowRoot;
        const categoryElement = shadowRoot.querySelector(".category");
        if (categoryElement)
          createTooltipOnEllipsis(categoryElement as HTMLElement);

        const moreButton = shadowRoot.querySelector(".more");
        moreButton?.addEventListener("click", (event) => {
          if (note) handleMoreActionsButtonClick(event, note, close);
        });
        createTooltip(moreButton as HTMLButtonElement, {
          message: translations.MORE_OPTIONS,
        });
      },
      pagination: {
        pageCount: previewNotes.length,
        initialPageIndex: previewNotes.indexOf(note),
        onpagechange: (index) => {
          note = previewNotes.at(index);
          if (root && note) updateNoteHtmlInShadowRoot(root, note, htmlDeps);
        },
      },
      styles: `
        .card {
          height: 100%;
          border: 1px solid color-mix(in srgb, transparent, currentcolor 12%);
          border-radius: 8px;
          padding: 8px 16px;
          box-sizing: border-box;
          overflow: auto;
        }
        .card-header {
          display: flex;
          flex-direction: row;
          min-height: 36px;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 16px;
          border-bottom: 1px solid color-mix(in srgb, transparent, currentcolor 12%);
          padding-bottom: 8px;
        }
        .note-info {
          display: flex;
          flex-direction: row;
          align-items: center;
          gap: 6px;
        }
        .note-info.who {
          gap: 8px;
        }
        .note-info .name {
          font-weight: 500;
        }
        .note-info .edited-by {
          display: block;
          font-size: 11px;
          color: color-mix(in srgb, transparent, currentcolor 40%);
          font-weight: 300;
        }
        .user-avatar {
          border-radius: 50%;
          flex-shrink: 0;
        }
        .user-avatar text {
          font-size: 11px;
          fill: white;
          font-weight: 300;
        }
        .category {
          display: inline-block;
          padding: 2px 6px;
          border-radius: 4px;
          font-size: 12px;
          white-space: nowrap;
          text-overflow: ellipsis;
          overflow: hidden;
          max-width: 200px;
          font-weight: 300;
        }
        .icon-button {
          box-sizing: border-box;
          position: relative;
          user-select: none;
          cursor: pointer;
          outline: 0;
          border: none;
          background-color: transparent;
          -webkit-tap-highlight-color: transparent;
          display: inline-block;
          white-space: nowrap;
          text-decoration: none;
          text-align: center;
          margin: 0;
          overflow: visible;
          padding: 0;
          width: 20px;
          height: 20px;
          flex-shrink: 0;
          line-height: 20px;
          border-radius: 50%;
          vertical-align: middle;
          color: currentcolor;
        }
        .icon-button svg { fill: currentcolor; }
        @media screen and (min-width: 960px) {
          .card { width: 860px; }
        }`,
    });
  }

  async function handleOpenCategorySelect(event: MouseEvent): Promise<void> {
    const target = event.target as HTMLElement;
    const selectTarget =
      (target.closest(".select-button") as HTMLElement) ?? target;

    const selectOptions = Array.from(categories.entries()).map(
      ([key, category]) => ({ text: category.name, key }),
    );
    const selected = $filter.selectedCategoryId
      ? selectOptions.findIndex(
          (option) => option.key === $filter.selectedCategoryId,
        )
      : undefined;

    const options: SingleSelectPanelOptions = {
      options: selectOptions,
      selected,
    };
    const result = await context.openSelectPanel(selectTarget, options);
    if (result) {
      $filter.selectedCategoryId = selectOptions[result.index].key;
    }
  }

  // ── CSV Export ────────────────────────────────────────────────────────

  async function handleDownloadCsvButtonClick(
    exportNotes: Note[],
  ): Promise<void> {
    const uniqueCategories = Array.from(
      new Set(exportNotes.map((n) => n.note_category).filter(Boolean)),
    );
    const categoryOptions = uniqueCategories.map((c) => ({
      label: c,
      value: c,
    }));

    const filterResult = await context.openFormDialog({
      title: "Export Options",
      inputs: [
        {
          key: "category",
          type: "Selection",
          label: "Filter by Category",
          options: [{ label: "All", value: "all" }, ...categoryOptions],
        },
      ],
      submitButtonText: "Next",
    });

    if (filterResult?.value) {
      const { category } = filterResult.value;
      let filteredNotes =
        category && category !== "all"
          ? exportNotes.filter((note) => note.note_category === category)
          : exportNotes;

      const hasEditedBy = filteredNotes.some(
        (note) => note.editor_id && note.editor_name,
      );
      const hasSubject = filteredNotes.some((note) => note.subject);
      const csvHeaders = [
        translations.WHO,
        translations.WHEN,
        ...(hasSubject ? [translations.SUBJECT] : []),
        ...($notesWithCategories ? [translations.CATEGORY] : []),
        translations.NOTE,
        ...(hasEditedBy
          ? [context.translate("EDITED_BY_USER", { user: "" })]
          : []),
      ];
      const csvData = filteredNotes.map((note) => [
        `"${getNoteUserName(usersDict, note)}"`,
        `"${mapNoteToWhenDateTime(note)}"`,
        ...(hasSubject ? [`"${note.subject?.replace(/"/g, "'") ?? "-"}"`] : []),
        ...($notesWithCategories
          ? [`"${getCategory(note.category)?.name ?? "-"}"`]
          : []),
        `"${note.text.replace(/"/g, "'")}"`,
        ...(hasEditedBy
          ? [`"${getNoteEditedBy(usersDict, note) ?? "-"}"`]
          : []),
      ]);
      const csvContent = [csvHeaders, ...csvData]
        .map((row) => row.join(","))
        .join("\n");
      const data = new Blob([csvContent], { type: "text/csv" });
      const fileName = `${kebabCase(deburr(agentOrAssetName ?? undefined))}_service-logbook-notes.csv`;
      if ("saveAsFile" in context) {
        context.saveAsFile(data, fileName);
      }
    }
  }

  // ── JSON Export/Import ────────────────────────────────────────────────

  async function handleDownloadJsonButtonClick(): Promise<void> {
    const result = await notesService.exportData();
    if (result.data.success) {
      const data = new Blob([JSON.stringify(result.data.data, null, 2)], {
        type: "application/json",
      });
      const fileName = `${kebabCase(deburr(agentOrAssetName ?? undefined))}_service-logbook-notes.json`;
      if ("saveAsFile" in context) {
        context.saveAsFile(data, fileName);
      }
    }
  }

  async function handleUploadJsonButtonClick(): Promise<void> {
    const result = await context.openFormDialog({
      title: translations.IMPORT_FROM_JSON,
      inputs: [
        {
          key: "file",
          type: "File",
          label: "JSON File",
          accept: ".json",
          required: true,
        },
      ],
      submitButtonText: translations.IMPORT,
    });

    if (result?.value?.file) {
      const file = result.value.file;
      const reader = new FileReader();
      reader.onload = async (event) => {
        if (event.target?.result) {
          try {
            const parsedData = JSON.parse(event.target.result as string);
            const notesArray = Array.isArray(parsedData)
              ? parsedData
              : parsedData.notes;

            if (!notesArray || !Array.isArray(notesArray)) {
              context.openAlertDialog({
                title: "Error",
                message:
                  "Invalid JSON file format. Expected a 'notes' array or an array of note objects.",
              });
              return;
            }

            if (notesArray.length === 0) {
              context.openAlertDialog({
                title: "Warning",
                message: "The JSON file contains no notes to import.",
              });
              return;
            }

            const confirmed = await context.openConfirmDialog({
              title: translations.IMPORT,
              message: translations["__TEXT__.CONFIRM_IMPORT"],
              confirmButtonText: translations.IMPORT,
              destructive: true,
            });

            if (confirmed) {
              await notesService.importData(notesArray);
              await notesService.load();
            }
          } catch (error) {
            console.error("Import error:", error);
            context.openAlertDialog({
              title: "Error",
              message:
                "Invalid JSON file. Please ensure the file is a valid JSON export from the Service Logbook.",
            });
          }
        }
      };
      reader.readAsText(file);
    }
  }

  // ── Search ────────────────────────────────────────────────────────────

  function handleSearchButtonClick(): void {
    searchInputVisible = true;
    tick().then(() => searchInput?.focus());
  }

  function handleSearchInputBlur(): void {
    if (!$filter.searchQuery) searchInputVisible = false;
  }

  function handleSearchInputClearClick(): void {
    $filter.searchQuery = null;
    searchInput?.blur();
    searchInputVisible = false;
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────

  onMount(() => {
    translations = context.translate(
      [
        "ADD",
        "ADD_NOTE",
        "CATEGORY",
        "CONFIRM",
        "EDIT",
        "EDIT_NOTE",
        "EXPORT",
        "EXPORT_TO_CSV",
        "MORE_OPTIONS",
        "NO_NOTES",
        "NONE",
        "NOTE",
        "REMOVE",
        "REMOVE_NOTE",
        "SEARCH",
        "SERVICE_LOGBOOK",
        "SUBJECT",
        "UNCATEGORIZED",
        "UNKNOWN_USER",
        "WHEN",
        "WHO",
        "__TEXT__.CONFIRM_NOTE_REMOVAL",
        "__TEXT__.NO_MATCHING_RESULTS",
        "IMPORT",
        "EXPORT",
        "IMPORT_FROM_JSON",
        "EXPORT_TO_JSON",
        "__TEXT__.CONFIRM_IMPORT",
      ],
      undefined,
      { source: "global" },
    );

    const backendComponentClient = context.createBackendComponentClient();
    mapAppConfigToServiceLogbookCategoryMap =
      mapAppConfigToServiceLogbookCategoryMapFactory(context);
    notesService = new NotesService(backendComponentClient);

    const unsubscribeLoaded = notesService.loaded.subscribe((value) =>
      loaded.set(value),
    );
    const unsubscribeNotes = notesService.notes.subscribe((value) =>
      notes.set(value),
    );

    notesService.load();

    const resourceDataClient = context.createResourceDataClient();
    resourceDataClient.query(
      [{ selector: "AppConfig", fields: ["values"] }],
      ([result]) => {
        const appConfig = result.data;
        categories = mapAppConfigToServiceLogbookCategoryMap(appConfig);
      },
    );
    resourceDataClient.query(
      [
        { selector: "Agent", fields: ["name", "permissions", "publicId"] },
        { selector: "Asset", fields: ["name", "permissions", "publicId"] },
      ],
      async ([agentResult, assetResult]) => {
        agentOrAsset = agentResult.data ?? assetResult.data;
        agentOrAssetName =
          assetResult.data?.name ?? agentResult.data?.name ?? null;

        // Check if user is a Plug Power user based on email domain
        if (!userEmail) {
          userEmail = await fetchUserEmail();
        }
        if (userEmail) {
          isPlugPowerUser =
            userEmail.endsWith("@plugpower.com") ||
            userEmail.endsWith("@ixon.cloud");
        }
      },
    );
    resourceDataClient.query(
      [{ selector: "UserList", fields: ["name", "publicId"] }],
      ([result]) => {
        const users: ResourceData.User[] = result.data ?? [];
        usersDict = Object.fromEntries(
          users.map((user) => [user.publicId, user]),
        );
      },
    );
    resourceDataClient.query(
      [{ selector: "MyUser", fields: ["publicId", "name"] }],
      ([result]) => {
        myUser = result.data ?? null;
      },
    );
  });
</script>

<div class="card" bind:this={rootEl} class:is-narrow={isNarrow}>
  <div class="card-header">
    <h3 class="card-title" data-testid="service-logbook-card-title">
      {translations.SERVICE_LOGBOOK}
    </h3>
    <div class="card-header-actions">
      {#if searchInputVisible}
        <div class="search-input-container">
          <div class="search-input-prefix">
            <svg width="24" height="24" viewBox="0 0 24 24">
              <path d="M0 0h24v24H0z" fill="none" />
              <path
                d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3
              9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6
              0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"
              />
            </svg>
          </div>
          <input
            type="text"
            class="search-input"
            bind:this={searchInput}
            bind:value={$filter.searchQuery}
            onblur={handleSearchInputBlur}
            placeholder={translations.SEARCH}
            data-testid="service-logbook-search-input"
          />
          <div class="search-input-suffix">
            <button
              class="icon-button"
              onclick={handleSearchInputClearClick}
              data-testid="service-logbook-search-clear-button"
            >
              <svg width="20" height="20" viewBox="0 0 24 24">
                <path d="M0 0h24v24H0z" fill="none" />
                <path
                  d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59
                19 19 17.59 13.41 12z"
                />
              </svg>
            </button>
          </div>
        </div>
      {/if}

      {#if !searchInputVisible}
        {#if !isSmall && !!$notes?.length && categories.size > 0}
          <div
            class="filter-select"
            data-testid="service-logbook-category-filter"
          >
            <button
              class="select-button"
              data-testid="service-logbook-category-select-button"
              onclick={handleOpenCategorySelect}
            >
              <span>{$selectedCategoryName}</span>
              <svg fill="currentcolor" height="18" viewBox="0 0 24 24">
                <path d="M7 10l5 5 5-5z" />
                <path d="M0 0h24v24H0z" fill="none" />
              </svg>
            </button>
            {#if $filter.selectedCategoryId !== null}
              <button
                class="icon-button"
                data-testid="service-logbook-category-clear-button"
                onclick={() =>
                  filter.update((f) => ({ ...f, selectedCategoryId: null }))}
              >
                <svg width="24" height="24" viewBox="0 0 24 24">
                  <path d="M0 0h24v24H0z" fill="none" />
                  <path
                    d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"
                  />
                </svg>
              </button>
            {/if}
          </div>
        {/if}

        <button
          use:createTooltip={{ message: translations.SEARCH }}
          class="icon-button"
          class:hidden={!$notes?.length}
          data-testid="service-logbook-search-button"
          onclick={handleSearchButtonClick}
        >
          <svg
            enable-background="new 0 0 24 24"
            height="24px"
            viewBox="0 -960 960 960"
            width="24px"
            fill="#000000"
          >
            <path
              d="M784-120 532-372q-30 24-69 38t-83 14q-109 0-184.5-75.5T120-580q0-109 75.5-184.5T380-840q109 0 184.5 75.5T640-580q0 44-14 83t-38 69l252 252-56 56ZM380-400q75 0 127.5-52.5T560-580q0-75-52.5-127.5T380-760q-75 0-127.5 52.5T200-580q0 75 52.5 127.5T380-400Z"
            />
          </svg>
        </button>
        <button
          use:createTooltip={{ message: translations.EXPORT_TO_CSV }}
          class="icon-button"
          class:hidden={searchInputVisible}
          data-testid="service-logbook-export-button"
          onclick={() => handleDownloadCsvButtonClick($filteredNotesWithHtml)}
        >
          <svg
            enable-background="new 0 0 24 24"
            height="24px"
            viewBox="0 -960 960 960"
            width="24px"
            fill="#000000"
          >
            <path
              d="M480-320 280-520l56-58 104 104v-326h80v326l104-104 56 58-200 200ZM240-160q-33 0-56.5-23.5T160-240v-120h80v120h480v-120h80v120q0 33-23.5 56.5T720-160H240Z"
            />
          </svg>
        </button>
      {/if}

      <button
        bind:this={addButton}
        class="icon-button"
        class:hidden={searchInputVisible}
        data-testid="service-logbook-add-button"
        onclick={handleAddButtonClick}
      >
        <svg
          enable-background="new 0 0 24 24"
          height="24px"
          viewBox="0 -960 960 960"
          width="24px"
          fill="#000000"
        >
          <path
            d="M440-240h80v-120h120v-80H520v-120h-80v120H320v80h120v120ZM240-80q-33 0-56.5-23.5T160-160v-640q0-33 23.5-56.5T240-880h320l240 240v480q0 33-23.5 56.5T720-80H240Zm280-520v-200H240v640h480v-440H520ZM240-800v200-200 640-640Z"
          />
        </svg>
      </button>
    </div>
  </div>
  {#if isSmall && !!$notes?.length && categories.size > 0}
    <div class="card-chips">
      <div class="filter-select" data-testid="service-logbook-category-filter">
        <button
          class="select-button"
          data-testid="service-logbook-category-select-button"
          onclick={handleOpenCategorySelect}
        >
          <span>{$selectedCategoryName}</span>
          <svg fill="currentcolor" height="18" viewBox="0 0 24 24">
            <path d="M7 10l5 5 5-5z" />
            <path d="M0 0h24v24H0z" fill="none" />
          </svg>
        </button>
        {#if $filter.selectedCategoryId !== null}
          <button
            class="icon-button"
            data-testid="service-logbook-category-clear-button"
            onclick={() =>
              filter.update((f) => ({ ...f, selectedCategoryId: null }))}
          >
            <svg width="24" height="24" viewBox="0 0 24 24">
              <path d="M0 0h24v24H0z" fill="none" />
              <path
                d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"
              />
            </svg>
          </button>
        {/if}
      </div>
    </div>
  {/if}
  <div class="card-content">
    {#if !!$loaded}
      {#if !!$filteredNotesWithHtml?.length}
        <div class="list-wrapper">
          <div class="base-list">
            {#each $filteredNotesWithHtml as note, index}
              <div
                class="list-item note-clickable"
                data-testid="service-logbook-list-item"
              >
                <div
                  class="list-item-content"
                  class:is-narrow={isNarrow}
                  onclick={() => handlePreviewNoteClick(note)}
                  onkeyup={() => handlePreviewNoteClick(note)}
                  role="button"
                  tabindex="0"
                >
                  <div
                    class="list-item-flex-container"
                    class:is-narrow={isNarrow}
                  >
                    <span class="name">{getNoteUserName(usersDict, note)}</span>
                    {#if $notesWithCategories}
                      <span
                        use:createTooltipOnEllipsis
                        class="category"
                        style={getCategoryStyle(getCategory(note.category))}
                        >{getCategory(note.category)?.name ?? ""}
                      </span>
                    {/if}
                    <span
                      use:createTooltipOnEllipsis
                      class="category"
                      style={getCategoryStyle(getCategory(note.category))}
                      >{getNoteCategoryName(note)}
                    </span>
                    <span class="text">
                      {#if note.subject}
                        <strong>{note.subject}</strong>
                        <span> – </span>
                      {/if}{HtmlToReadableText(note.html)}
                    </span>
                  </div>

                  <div
                    class="list-item-flex-container"
                    class:is-narrow={isNarrow}
                  >
                    <span class="date">{mapNoteToNeeded(note)}</span>
                    <button
                      class="icon-button more"
                      use:createTooltip={{ message: translations.MORE_OPTIONS }}
                      onclick={(event) =>
                        handleMoreActionsButtonClick(event, note)}
                      data-testid="service-logbook-list-item-more-button"
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        height="24px"
                        viewBox="0 0 24 24"
                        width="24px"
                      >
                        <path d="M0 0h24v24H0V0z" fill="none" />
                        <path
                          d="M12 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z"
                        />
                      </svg>
                    </button>
                  </div>
                </div>
              </div>
            {/each}
          </div>
        </div>
      {:else}
        <div class="empty-state" data-testid="service-logbook-empty-state">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
            <g>
              <rect x="4" y="15" width="10" height="2" />
              <polygon points="9.003,9 7.004,7 4,7 4,9" />
              <polygon points="11.001,11 4,11 4,13 13,13" />
              <polygon points="20,11 13.546,11 15.546,13 20,13" />
              <polygon points="11.546,9 20,9 20,7 9.546,7" />
            </g>
            <path d="M19.743,22.289l1.27-1.27L2.95,2.956l-1.27,1.28" />
          </svg>
          {#if $filter.searchQuery || $filter.selectedCategoryId}
            <p>{translations["__TEXT__.NO_MATCHING_RESULTS"]}</p>
          {:else}
            <p>{translations.NO_NOTES}</p>
          {/if}
        </div>
      {/if}
    {:else}
      <div class="loading-state">
        <div class="spinner">
          <svg
            preserveAspectRatio="xMidYMid meet"
            focusable="false"
            viewBox="0 0 100 100"
          >
            <circle cx="50%" cy="50%" r="45" />
          </svg>
        </div>
      </div>
    {/if}
  </div>
</div>

<style lang="scss">
  @use "./styles/button" as *;
  @use "./styles/card" as *;
  @use "./styles/list" as *;
  @use "./styles/spinner" as *;
  @use "./styles/select" as *;

  .hidden {
    visibility: hidden;
  }

  .search-input-container {
    display: flex;
    flex-direction: row;
    height: 40px;
    margin-left: 8px;
    border-radius: 20px;
    background-color: color-mix(in srgb, transparent, currentcolor 4%);

    input {
      background-color: transparent;
      height: 32px;
      width: 140px;
      padding: 4px 8px 4px 0;
      margin: 0;
      border: none;
      outline: none;
      line-height: 24px;
      font-size: 14px;
      color: currentcolor;
    }

    .search-input-prefix {
      width: 24px;
      height: 24px;
      padding: 8px;
      fill: currentcolor;
    }

    .search-input-suffix {
      width: 40px;
      height: 40px;

      .icon-button {
        background-color: transparent;

        svg {
          height: 20px;
          width: 20px;
          margin: 10px;
          line-height: 20px;
        }
      }
    }
  }

  .card {
    .card-header {
      display: flex;
      flex-direction: row;
      height: 40px;

      .card-title {
        flex: 1 0 auto;
      }
    }

    &:not(.is-narrow) {
      .card-header {
        height: 52px;
      }

      .card-header-actions {
        padding: 8px;

        @media print {
          display: none;
        }
      }
    }
  }

  .card-header .button {
    display: flex;
    flex-direction: row;
    align-items: center;
    padding-right: 12px;
    padding-left: 8px;
    background-color: var(--accent);
    line-height: 32px;
    font-size: 14px;
    color: var(--accent-color);

    svg {
      margin-right: 4px;
      fill: var(--accent-color);
    }
  }

  .card-chips {
    display: flex;
    flex-direction: row;
    flex-wrap: wrap;
    gap: 8px;
    padding: 8px;
    margin-bottom: 8px;
  }

  .card-content {
    position: relative;
    z-index: 1;
  }

  .card-content {
    .list-wrapper {
      position: absolute;
      left: 0;
      right: 0;
      top: 0;
      bottom: 0;
      padding: 0 8px;
      overflow: auto;
      overflow-anchor: none;

      .note-clickable {
        cursor: pointer;

        &:hover {
          background-color: color-mix(in srgb, transparent, currentcolor 12%);
        }
      }

      .list-item {
        padding: 0 8px;
        margin: 0 -8px;

        .list-item-content {
          width: 100%;

          &.is-narrow {
            align-items: flex-start;
          }

          .list-item-flex-container {
            display: flex;
            flex-direction: row;
            align-items: center;
            width: 100%;
            min-height: 24px;
            gap: 4px;

            &.is-narrow {
              flex-wrap: wrap;
            }

            .name {
              font-weight: 500;
              white-space: nowrap;
              flex-shrink: 0;
            }

            .category {
              display: inline-block;
              padding: 2px 6px;
              border-radius: 4px;
              font-size: 12px;
              white-space: nowrap;
              text-overflow: ellipsis;
              overflow: hidden;
              max-width: 200px;
            }

            .text {
              flex: 1 1;
              white-space: nowrap;
              text-overflow: ellipsis;
              overflow: hidden;
              font-size: 14px;
              color: color-mix(in srgb, transparent, currentcolor 54%);
            }

            .date {
              white-space: nowrap;
              font-size: 14px;
              color: color-mix(in srgb, transparent, currentcolor 54%);
            }

            .more {
              flex-shrink: 0;
            }
          }
        }
      }
    }

    .empty-state,
    .loading-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      height: 100%;
      color: color-mix(in srgb, transparent, currentcolor 38%);
      gap: 8px;
    }
  }
</style>
