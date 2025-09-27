import type { User } from '../types/index.ts';

let cachedUser: User | null = null;

export const setCachedUser = (user: User | null): void => {
  cachedUser = user;
};

export const getCachedUser = (): User | null => cachedUser;
