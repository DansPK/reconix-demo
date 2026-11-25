import assert from "node:assert/strict";
import { test } from "node:test";
import { sessionFitsFolder, sessionToOpen } from "../../src/sessionLogic";

const folderOf = { "s-a": "/work/app", "s-b": "/work/other" };

test("a scan stays in a session of the same folder, or of no folder yet", () => {
  assert.equal(sessionFitsFolder("s-a", "/work/app", folderOf), true);
  assert.equal(sessionFitsFolder("s-new", "/work/app", folderOf), true);
  assert.equal(sessionFitsFolder("s-b", "/work/app", folderOf), false);
});

test("a workspace opens its last session, else the newest of its folders or of none", () => {
  const newestFirst = ["s-b", "s-a", "s-new"];
  assert.equal(sessionToOpen(newestFirst, "s-b", folderOf, ["/work/app"]), "s-b", "the last open session wins");
  assert.equal(sessionToOpen(newestFirst, "gone", folderOf, ["/work/app"]), "s-a", "skips another folder's session");
  assert.equal(sessionToOpen(newestFirst, undefined, folderOf, []), "s-new", "no folder open: only folderless sessions");
  assert.equal(sessionToOpen(["s-b"], undefined, folderOf, ["/work/app"]), undefined);
});
