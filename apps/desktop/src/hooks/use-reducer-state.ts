import { type Dispatch, type SetStateAction, useReducer } from "react";

const reducerState = <Value>(
  state: Value,
  action: SetStateAction<Value>
): Value => {
  if (typeof action === "function") {
    return (action as (previousState: Value) => Value)(state);
  }

  return action;
};

export const useReducerState = <Value>(
  initialState: Value | (() => Value)
): [Value, Dispatch<SetStateAction<Value>>] =>
  useReducer(reducerState<Value>, undefined as Value, () => {
    if (typeof initialState === "function") {
      return (initialState as () => Value)();
    }

    return initialState;
  });
