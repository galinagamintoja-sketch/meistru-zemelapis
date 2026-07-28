export type HomepageAccountState = {
  authenticated: boolean;
  hasProfile: boolean;
  isAdmin: boolean;
};

export function getHomepageAccountState(
  authUserId: string | null,
  hasProfile: boolean,
  isAdmin: boolean
): HomepageAccountState {
  return {
    authenticated: Boolean(authUserId),
    hasProfile: Boolean(authUserId && hasProfile),
    isAdmin: Boolean(authUserId && isAdmin)
  };
}

export function homepageAccountDestination(state: HomepageAccountState, registerRequested: boolean) {
  return registerRequested && state.hasProfile ? "/meistras/uzklausos" : null;
}
