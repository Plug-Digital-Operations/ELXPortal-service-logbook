import { writable } from "svelte/store";
import type { BackendComponentClient } from "@ixon-cdk/types";
import type { Note } from "./types";

export class NotesService {
  notes = writable<Note[]>([]);
  loaded = writable<boolean>(false);

  constructor(private client: BackendComponentClient) {}

  add(note: Partial<Note>): Promise<Note | null> {
    return this.client.call("notes.add", note).then((result) => {
      if (result.data.success) {
        this.notes.update((notes) => [result.data.data, ...notes]);
        return result.data.data as Note;
      }
      return null;
    });
  }

  edit(id: string, note: Partial<Note>) {
    return this.client
      .call("notes.edit", { note_id: id, ...note })
      .then((result) => {
        if (result.data.success) {
          this.notes.update((notes) =>
            notes.map((n) => (n._id === id ? { ...n, ...result.data.data } : n))
          );
        }
        // The entry list is refreshed whenever a user modifies (or tried to modify) an entry.
        this.load();
      });
  }

  load() {
    return this.client.call("notes.get").then((result) => {
      if (result.data.success) {
        this.notes.set(result.data.data);
      }
      this.loaded.set(true);
    });
  }

  remove(id: string) {
    this.notes.update((notes) => notes.filter((note) => note._id !== id));
    return this.client.call("notes.remove", { note_id: id });
  }

  exportData() {
    return this.client.call("notes.export_data");
  }

  importData(notes: Note[]) {
    return this.client.call("notes.import_data", { notes });
  }
}
