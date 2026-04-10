export const isFreeUser = (user) =>
  ["free", "expired"].includes(user?.subscription_status);

export const UPGRADE_MSG = "Upgrade to a paid plan to use these features!";
