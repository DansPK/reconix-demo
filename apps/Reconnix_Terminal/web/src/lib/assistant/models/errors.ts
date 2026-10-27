/* What the saved models refuse, with the status a route answers: fixed messages that never name
   a path or hold a key. Server only. */
import "server-only";

export class ModelsError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 404 | 409 | 500 = 500,
  ) {
    super(message);
  }
}

export const MODELS_FAIL = {
  folder: "The assistant's folder could not be used.",
  plain: "The assistant's folder is not a plain folder.",
  owner: "The assistant's folder belongs to another user.",
  parent: "The folder that holds the assistant's files can be changed by other users.",
  moved: "The assistant's folder changed while it was in use.",
  read: "The saved models could not be read. Remove models.json from the assistant's folder to start again.",
  save: "The models could not be saved.",
  full: "Too many saved models: remove one first.",
  key: "The key that protects the saved API keys could not be used.",
  keyShared: "models.key can be read or changed by other users. Remove it from the assistant's folder and enter the API keys again.",
  sealed: "A saved API key could not be read. Enter it again in the model picker.",
} as const;

/** The folder's faults (secure-fs.ts) as the models' errors. */
export const folderFault = (fault: "folder" | "plain" | "owner" | "parent" | "moved") => new ModelsError(MODELS_FAIL[fault]);
