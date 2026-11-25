// Which session a workspace opens, and which sessions a folder's scan may use. Pure: no `vscode`
// import. A session belongs to the folder it first scanned (`folderOf`, absolute paths). Core keeps
// a finding's id only within one session, so one folder's scans must stay in one session.

/** May a scan of `folder` run in this session? Only in a session of that folder, or of none yet. */
export function sessionFitsFolder(sessionId: string, folder: string, folderOf: Record<string, string>): boolean {
  const owner = folderOf[sessionId];
  return owner === undefined || owner === folder;
}

/**
 * The session to open in a workspace: the one it had open last, else the newest one that belongs to
 * one of its folders or to no folder yet. `sessionIds` is newest first. Undefined: none fits.
 */
export function sessionToOpen(
  sessionIds: string[],
  last: string | undefined,
  folderOf: Record<string, string>,
  openFolders: string[],
): string | undefined {
  if (last !== undefined && sessionIds.includes(last)) return last;
  return sessionIds.find((id) => folderOf[id] === undefined || openFolders.includes(folderOf[id]));
}
