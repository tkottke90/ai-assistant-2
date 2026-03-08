export type ResponseMessage<T extends string, D = any> = {
  type: `${T}:response`;
  data: D;
};

export type ResponseErrorMessage<T extends string> = {
  type: `${T}:error`;
  error: string;
};

export type inferResponseEvents<
  TEventName extends string,
  TResponseData = unknown,
> =
  | ResponseMessage<TEventName, TResponseData>
  | ResponseErrorMessage<TEventName>;

