// An error that is safe to show to the user. Anything else becomes a generic
// "Something went wrong" so we never leak stack traces or internals.
export class HttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly publicMessage: string,
  ) {
    super(publicMessage);
  }
}

export const notFound = () => new HttpError(404, "Not found");
