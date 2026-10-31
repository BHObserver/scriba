import type { Locale } from "./locale";
import { bn } from "./messages/bn";
import { en } from "./messages/en";

export type MessageKey = keyof typeof bn;
export type Messages = Readonly<Record<MessageKey, string>>;

export const MESSAGES: Readonly<Record<Locale, Messages>> = { bn, en };
