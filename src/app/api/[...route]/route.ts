import { dispatch } from "@/server/api-router";
import { handleError } from "@/server/http";

async function handle(req: Request) {
  try {
    return await dispatch(req);
  } catch (e) {
    return handleError(e);
  }
}

export const GET = handle;
export const POST = handle;
export const PATCH = handle;
export const PUT = handle;
export const DELETE = handle;
