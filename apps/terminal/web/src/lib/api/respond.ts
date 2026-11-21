/* A Core API refusal as a dashboard route's error answer ({ detail }, the API's own status;
   0, the API not reachable, becomes 503). Server only. */
import "server-only";

import { fail } from "../assistant/access";
import { CoreError } from "./core";

export const coreFailure = (error: unknown, otherwise: string) =>
  error instanceof CoreError ? fail(error.message, error.status === 0 ? 503 : error.status) : fail(otherwise, 500);
